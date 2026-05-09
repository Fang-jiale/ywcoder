/**
 * AISdkService - AI引擎 SDK 封装
 *
 * 职责：
 * 1. 封装 AI 引擎的 query() 调用
 * 2. 构建 SDK Options 对象
 * 3. 处理参数转换和环境配置
 * 4. 提供 interrupt() 方法中断查询
 *
 * 依赖：
 * - ILogService: 日志服务
 * - IConfigurationService: 配置服务
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as http from 'http';
import { createDecorator } from '../../di/instantiation';
import { ILogService } from '../logService';
import { IConfigurationService } from '../configurationService';
import { IFileSystemService } from '../fileSystemService';
import { AsyncStream } from './transport';

// SDK 类型导入
import type {
    Options,
    Query,
    CanUseTool,
    PermissionMode,
    SDKUserMessage,
    HookCallbackMatcher,
} from '@anthropic-ai/claude-agent-sdk';

export const IAISdkService = createDecorator<IAISdkService>('aiSdkService');

/**
 * SDK 查询参数
 */
/**
 * stderr 中解析出的致命错误
 */
export interface LLMRequestError {
    statusCode: string;    // HTTP 状态码 (e.g. "401", "503")
    message: string;       // 人类可读的错误描述
    type: string;          // 上游错误类型 (e.g. "authentication_error", "new_api_error")
    raw: string;           // 原始 stderr 行
}

export interface SdkQueryParams {
    inputStream: AsyncStream<SDKUserMessage>;
    resume: string | null;
    canUseTool: CanUseTool;
    model: string | null;  // ← 接受 null，内部转换
    cwd: string;
    permissionMode: PermissionMode | string;  // ← 接受字符串
    maxThinkingTokens?: number;  // ← Thinking tokens 上限
    /** 当 stderr 检测到致命错误（流式请求回退失败）时的回调 */
    onStderrError?: (error: LLMRequestError) => void;
}

export interface SdkProbeParams {
    capabilities: string[];
    cwd: string;
    timeoutMs?: number;
}

export interface SdkProbeResult {
    data: Record<string, any>;
    errors?: Record<string, string>;
}

/**
 * SDK 服务接口
 */
export interface IAISdkService {
    readonly _serviceBrand: undefined;

    /**
     * 调用 AI SDK 进行查询
     */
    query(params: SdkQueryParams): Promise<Query>;

    /**
     * 一次性探测 SDK 能力并立即释放
     */
    probe(params: SdkProbeParams): Promise<SdkProbeResult>;

    /**
     * 中断正在进行的查询
     */
    interrupt(query: Query): Promise<void>;

    /**
     * 重置 OpenAI 代理配置
     * 在环境变量或代理配置变更后调用，下次 query() 会重新初始化代理
     */
    resetOpenAIProxy(): Promise<void>;
}

const VS_CODE_APPEND_PROMPT = `
  # VSCode Extension Context

  You are running inside a VSCode native extension environment.

  ## Code References in Text
  IMPORTANT: When referencing files or code locations, use markdown link syntax to make them clickable:
  - For files: [filename.ts](src/filename.ts)
  - For specific lines: [filename.ts:42](src/filename.ts#L42)
  - For a range of lines: [filename.ts:42-51](src/filename.ts#L42-L51)
  - For folders: [src/utils/](src/utils/)
  Unless explicitly asked for by the user, DO NOT USE backtickets \` or HTML tags like code for file references - always use markdown [text](link) format.
  The URL links should be relative paths from the root of  the user's workspace.

  ## User Selection Context
  The user's IDE selection (if any) is included in the conversation context and marked with ide_selection tags. This represents code or text the user has highlighted in their editor and may or may not be relevant to their request.`;

const SDK_PROBE_CAPABILITIES: Record<string, (query: Query) => Promise<any>> = {
    supportedCommands: (query) => query.supportedCommands?.(),
    supportedModels: (query) => query.supportedModels?.(),
    mcpServerStatus: (query) => query.mcpServerStatus?.(),
    accountInfo: (query) => query.accountInfo?.()
};

/**
 * AISdkService 实现
 */
export class AISdkService implements IAISdkService {
    readonly _serviceBrand: undefined;

    constructor(
        private readonly context: vscode.ExtensionContext,
        @ILogService private readonly logService: ILogService,
        @IConfigurationService private readonly configService: IConfigurationService,
        @IFileSystemService private readonly fileSystemService: IFileSystemService
    ) {
        this.logService.info('[AISdkService] AI引擎已初始化');
    }

    /**
     * 调用 AI SDK 进行查询
     */
    async query(params: SdkQueryParams): Promise<Query> {
        const { inputStream, resume, canUseTool, model, cwd, permissionMode, maxThinkingTokens, onStderrError } = params;

        this.logService.info('========================================');
        this.logService.info('AISdkService.query() 开始调用');
        this.logService.info('========================================');
        this.logService.info(`📋 输入参数:`);
        this.logService.info(`  - model: ${model}`);
        this.logService.info(`  - cwd: ${cwd}`);
        this.logService.info(`  - permissionMode: ${permissionMode}`);
        this.logService.info(`  - resume: ${resume}`);
        this.logService.info(`  - maxThinkingTokens: ${maxThinkingTokens ?? 'undefined'}`);

        // 参数转换
        const modelParam = model === null ? "default" : model;
        const permissionModeParam = permissionMode as PermissionMode;
        const cwdParam = cwd;

        this.logService.info(`🔄 参数转换:`);
        this.logService.info(`  - modelParam: ${modelParam}`);
        this.logService.info(`  - permissionModeParam: ${permissionModeParam}`);
        this.logService.info(`  - cwdParam: ${cwdParam}`);

        // 获取 CLI 路径（避免 TypeScript 类型推断问题）
        const cliPath = await this.getAIExecutablePath();

        // 获取环境变量
        const env = await this.getMergedEnvironmentVariables();

        // 记录环境变量
        this.logService.info(`🌍 环境变量 (env):`);
        if (env && Object.keys(env).length > 0) {
            for (const [key, value] of Object.entries(env)) {
                this.logService.info(`  - ${key}: ${value}`);
            }
        } else {
            this.logService.info(`  (empty)`);
        }

        // 记录 CLI 路径
        const ywcoderPath = path.join(os.homedir(), '.claude', 'ywcoder.json');
        this.logService.info(`📂 CLI 可执行文件与配置:`);
        this.logService.info(`  - CLI Path: ${cliPath}`);
        this.logService.info(`  - Settings Path: ${ywcoderPath}`);

        // 检查 CLI 是否存在
        if (!(await this.fileSystemService.pathExists(cliPath))) {
          this.logService.error(`❌ AI引擎 CLI not found at: ${cliPath}`);
          throw new Error(`AI引擎 CLI not found at: ${cliPath}`);
        }
        this.logService.info(`  ✓ CLI 文件存在`);

        // 检查文件权限
        try {
          const stats = await this.fileSystemService.stat(vscode.Uri.file(cliPath));
          const isExec = await this.fileSystemService.isExecutable(cliPath);
          this.logService.info(`  - File size: ${stats.size} bytes`);
          this.logService.info(`  - Is executable: ${isExec}`);
        } catch (e) {
          this.logService.warn(`  ⚠ 无法检查文件状态: ${e}`);
        }

        // 构建 SDK Options
        const options: Options = {
            // 基本参数
            cwd: cwdParam,
            resume: resume || undefined,
            model: modelParam,
            permissionMode: permissionModeParam,
            maxThinkingTokens: maxThinkingTokens,

            // CanUseTool 回调
            canUseTool,

            // 日志回调 - 捕获 SDK 进程的所有标准错误输出
            stderr: (data: string) => {
                const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false });
                const lines = data.trim().split('\n');

                for (const line of lines) {
                    if (!line.trim()) continue;

                    // 检测错误级别
                    const lowerLine = line.toLowerCase();
                    let level = 'INFO';

                    if (lowerLine.includes('error') || lowerLine.includes('failed') || lowerLine.includes('exception')) {
                        level = 'ERROR';
                    } else if (lowerLine.includes('warn') || lowerLine.includes('warning')) {
                        level = 'WARN';
                    } else if (lowerLine.includes('exit') || lowerLine.includes('terminated')) {
                        level = 'EXIT';
                    }

                    this.logService.info(`[${timestamp}] [SDK ${level}] ${line}`);

                    // 检测流式请求回退错误：
                    // "Error streaming, falling back to non-streaming mode: {statusCode} {json}"
                    if (onStderrError) {
                        const streamingErrorMatch = line.match(
                            /Error streaming, falling back to non-streaming mode:\s*(\d+)\s*(.*)/
                        );
                        if (streamingErrorMatch) {
                            const statusCode = streamingErrorMatch[1];
                            const rest = streamingErrorMatch[2];

                            let message = `HTTP ${statusCode}`;
                            let errorType = 'unknown';
                            try {
                                const jsonMatch = rest.match(/(\{[\s\S]*\})/);
                                if (jsonMatch) {
                                    const parsed = JSON.parse(jsonMatch[1]);
                                    const err = parsed.error || parsed;
                                    message = err.message || err.msg || message;
                                    errorType = err.type || err.code || errorType;
                                }
                            } catch { /* non-JSON tail, use statusCode as message */ }

                            onStderrError({ statusCode, message, type: errorType, raw: line });
                        }
                    }
                }
            },

            // 环境变量
            env,

            // 系统提示追加
            systemPrompt: {
                type: 'preset',
                preset: 'claude_code',
                append: VS_CODE_APPEND_PROMPT
            },

            // Hooks
            hooks: {
                // PreToolUse: 工具执行前
                PreToolUse: [{
                    matcher: "Edit|Write|MultiEdit",
                    hooks: [async (input, toolUseID, options) => {
                        if ('tool_name' in input) {
                            this.logService.info(`[Hook] PreToolUse: ${input.tool_name}`);
                        }
                        return { continue: true };
                    }]
                }] as HookCallbackMatcher[],
                // PostToolUse: 工具执行后
                PostToolUse: [{
                    matcher: "Edit|Write|MultiEdit",
                    hooks: [async (input, toolUseID, options) => {
                        if ('tool_name' in input) {
                            this.logService.info(`[Hook] PostToolUse: ${input.tool_name}`);
                        }
                        return { continue: true };
                    }]
                }] as HookCallbackMatcher[]
            },

            // CLI 可执行文件路径
            pathToClaudeCodeExecutable: cliPath,

            // 额外参数
            // --settings 指向 ywcoder.json，Profile 切换通过 ConfigurationService 同步内容到此文件
            // CLI 会监听此文件变化，实现热更新
            extraArgs: {
              'debug': null,
              'debug-to-stderr': null,
              // 'enable-auth-status': null,
              'settings': path.join(os.homedir(), '.claude', 'ywcoder.json'),
            } as Record<string, string | null>,

            // 设置源 (控制 CLAUDE.md 和 settings.json 的加载)
            // 'user': ~/.claude/settings.json, ~/.claude/CLAUDE.md
            // 'project': .claude/settings.json, .claude/CLAUDE.md
            // 'local': .claude/settings.local.json, CLAUDE.local.md
            // 注意: ywcoder.json 通过 extraArgs.settings 传入，作为 flagSettings 优先级最高
            settingSources: ['user', 'project', 'local'],

            includePartialMessages: true
        };

        // 调用 SDK
        this.logService.info('');
        this.logService.info('🚀 准备调用 AI Agent SDK');
        this.logService.info('----------------------------------------');

        // 设置入口点环境变量
        process.env.CLAUDE_CODE_ENTRYPOINT = 'ywcoder-vscode';
        this.logService.info(`🔧 环境变量:`);
        this.logService.info(`  - YWCODE_ENTRYPOINT: ${process.env.CLAUDE_CODE_ENTRYPOINT}`);
        const customEnvVars = await this.configService.getEnvironmentVariables();
        for (const [key, value] of Object.entries(customEnvVars)) {
            this.logService.info(`  - ${key}: ${value}`);
        }

        this.logService.info('');
        this.logService.info('📦 导入 SDK...');

        try {
            // 调用 SDK query() 函数
            const { query } = await import('@anthropic-ai/claude-agent-sdk');

            this.logService.info(`  - Options: [已配置参数 ${Object.keys(options).join(', ')}]`);

            const result = query({ prompt: inputStream, options });
            return result;
        } catch (error) {
            this.logService.error('');
            this.logService.error('❌❌❌ SDK 调用失败 ❌❌❌');
            this.logService.error(`Error: ${error}`);
            if (error instanceof Error) {
                this.logService.error(`Message: ${error.message}`);
                this.logService.error(`Stack: ${error.stack}`);
            }
            this.logService.error('========================================');
            throw error;
        }
    }

    /**
     * 一次性探测 SDK 能力并立即释放（轻量级版本）
     */
    async probe(params: SdkProbeParams): Promise<SdkProbeResult> {
        const capabilities = Array.from(new Set(params.capabilities ?? [])).filter(Boolean);
        if (capabilities.length === 0) {
            return { data: {} };
        }

        const timeoutMs = Math.max(1000, params.timeoutMs ?? 10000);
        const data: Record<string, any> = {};
        const errors: Record<string, string> = {};

        let query: Query | undefined;
        let timeoutId: ReturnType<typeof setTimeout> | undefined;

        try {
            await Promise.race([
                (async () => {
                    // 使用轻量级查询
                    query = await this.queryLite(params.cwd);

                    for (const capability of capabilities) {
                        const handler = SDK_PROBE_CAPABILITIES[capability];
                        if (!handler) {
                            errors[capability] = 'Unsupported capability';
                            continue;
                        }

                        try {
                            data[capability] = await handler(query);
                        } catch (error) {
                            errors[capability] = error instanceof Error ? error.message : String(error);
                        }
                    }
                })(),
                new Promise<void>((_, reject) => {
                    timeoutId = setTimeout(() => {
                        reject(new Error('SDK probe timed out'));
                    }, timeoutMs);
                })
            ]);
        } catch (error) {
            if (query) {
                try {
                    await this.interrupt(query);
                } catch {
                    // 静默忽略中断错误
                }
            }
            throw error;
        } finally {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
            if (query?.return) {
                try {
                    await query.return();
                } catch {
                    // 静默忽略关闭错误
                }
            }
        }

        // 如果探测了 supportedModels，额外从外部 OpenAI 兼容 API 获取并合并
        if (capabilities.includes('supportedModels')) {
            try {
                const externalModels = await this.fetchOpenAIModels();
                const sdkModels = Array.isArray(data.supportedModels) ? data.supportedModels : [];
                const seen = new Set(sdkModels.map((m: any) => m.value || m.id));
                const merged = [...sdkModels];
                for (const em of externalModels) {
                    if (!seen.has(em.value)) {
                        merged.push(em);
                        seen.add(em.value);
                    }
                }
                data.supportedModels = merged;
            } catch (e) {
                // 外部模型获取失败不影响 SDK 模型
                this.logService.warn(`[AISdkService] 合并外部模型失败: ${e}`);
            }
        }

        // 打印探测结果
        // this.logService.info(`[Probe] 结果: ${JSON.stringify(data, null, 2)}`);

        return {
            data,
            errors: Object.keys(errors).length ? errors : undefined
        };
    }

    /**
     * 轻量级 SDK 查询（仅用于 probe）
     * 不输出日志，不加载 hooks，最小化配置
     */
    private async queryLite(cwd: string): Promise<Query> {
        const inputStream = new AsyncStream<SDKUserMessage>();

        // 立即关闭输入流（probe 不需要发送消息）
        inputStream.done();

        const cliPath = await this.getAIExecutablePath();

        const options: Options = {
            // 最小化配置
            cwd,
            model: 'default',
            permissionMode: 'default' as PermissionMode,
            maxThinkingTokens: 0,

            // 权限回调（直接拒绝）
            canUseTool: async () => ({
                behavior: 'deny' as const,
                message: 'SDK probe only'
            }),

            // 不加载任何设置源
            settingSources: [],

            // 不输出 stderr
            stderr: () => {},

            // CLI 路径
            pathToClaudeCodeExecutable: cliPath,

            // 最小化额外参数（移除 debug 标志）
            extraArgs: {},

            // 不包含 partial messages
            includePartialMessages: false,

            // 不加载 hooks
            hooks: {}
        };

        const { query } = await import('@anthropic-ai/claude-agent-sdk');
        return query({ prompt: inputStream, options });
    }

    /**
     * 中断正在进行的查询
     */
    async interrupt(query: Query): Promise<void> {
        try {
            this.logService.info('🛑 中断 AI SDK 查询');
            await query.interrupt();
            this.logService.info('✓ 查询已中断');
        } catch (error) {
            this.logService.error(`❌ 中断查询失败: ${error}`);
            throw error;
        }
    }

    /**
     * 从外部 OpenAI 兼容 API 获取可用模型列表
     */
    async fetchOpenAIModels(): Promise<Array<{ value: string; displayName: string; description: string }>> {
        try {
            const extensionConfig = await this.configService.getExtensionConfig();
            const baseUrl = (extensionConfig.defaultEnvVars?.OPENAI_BASE_URL || 'http://76.13.61.16:8015/v1').replace(/\/$/, '');
            const apiKey = extensionConfig.defaultEnvVars?.OPENAI_API_KEY || 'glm';

            const url = `${baseUrl}/models`;
            this.logService.info(`[AISdkService] 获取外部模型列表: ${url}`);

            const result = await new Promise<any>((resolve, reject) => {
                const req = http.get(url, { headers: { 'Authorization': `Bearer ${apiKey}` } }, (res) => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => {
                        try {
                            const parsed = JSON.parse(data);
                            resolve(parsed);
                        } catch (e) {
                            reject(new Error(`Failed to parse response: ${e}`));
                        }
                    });
                });
                req.on('error', (err) => reject(err));
                req.setTimeout(10000, () => {
                    req.destroy();
                    reject(new Error('Request timeout'));
                });
            });

            const models = result?.data || [];
            const formatted = models.map((m: any) => ({
                value: m.id,
                displayName: m.id,
                description: m.owned_by ? `Provider: ${m.owned_by}` : 'External model'
            }));

            this.logService.info(`[AISdkService] 获取到 ${formatted.length} 个外部模型`);
            return formatted;
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            this.logService.warn(`[AISdkService] 获取外部模型列表失败: ${msg}`);
            return [];
        }
    }

    /**
     * OpenAI 适配代理功能已禁用
     * 由内置 CLI 通过环境变量处理 OpenAI 兼容模式
     */
    private async maybeStartOpenAIProxy(_env: Record<string, string>): Promise<string | null> {
        // 代理功能已完全禁用 - 内置 CLI 直接处理 OpenAI 兼容模式
        return null;
    }

    /**
     * OpenAI 代理功能已禁用
     * 由内置 CLI 通过环境变量处理 OpenAI 兼容模式
     */
    async resetOpenAIProxy(): Promise<void> {
        // OpenAI 代理功能已完全禁用 - 无需重置
        this.logService.info('[AISdkService] OpenAI 代理功能已禁用（由内置 CLI 处理）');
    }

    /**
     * 获取合并后的环境变量 (process.env + custom + config defaults)
     * 优先级: process.env > custom > config defaults
     */
    private async getMergedEnvironmentVariables(): Promise<Record<string, string>> {
        const customVars = await this.configService.getEnvironmentVariables();
        const extensionConfig = await this.configService.getExtensionConfig();

        // 从配置获取默认环境变量
        const configDefaults = extensionConfig.defaultEnvVars || {
            CLAUDE_CODE_USE_OPENAI: '1',
            OPENAI_API_KEY: 'glm',
            OPENAI_BASE_URL: 'http://76.13.61.16:8015/v1',
            OPENAI_MODEL: 'GLM5'
        };

        // 安全合并 process.env (过滤 undefined)
        const env: Record<string, string> = {};

        // 1. 首先应用配置中的默认值（最低优先级）
        for (const [key, value] of Object.entries(configDefaults)) {
            env[key] = value;
        }

        // 2. 合并 process.env
        Object.entries(process.env).forEach(([key, value]) => {
            if (value !== undefined) {
                env[key] = value;
            }
        });

        // 3. 应用自定义环境变量（最高优先级）
        for (const [key, value] of Object.entries(customVars)) {
            env[key] = value;
        }

        // 记录环境变量来源
        this.logService.info(`[AISdkService] 环境变量合并完成:`);
        this.logService.info(`  - 配置默认值: CLAUDE_CODE_USE_OPENAI=${configDefaults['CLAUDE_CODE_USE_OPENAI']}`);
        this.logService.info(`  - OPENAI_BASE_URL=${configDefaults['OPENAI_BASE_URL']}`);
        this.logService.info(`  - 实际值: CLAUDE_CODE_USE_OPENAI=${env['CLAUDE_CODE_USE_OPENAI']}`);

        // OpenAI 代理功能已禁用 - 由内置 CLI 处理
        return env;
    }

    /**
     * 获取 AI引擎 CLI 可执行文件路径
     * 优先级: 1. 用户配置的本地路径 > 2. npm 安装的 @dcywzc/ywcoder > 3. 内置原生二进制
     */
    private async getAIExecutablePath(): Promise<string> {
        // 1. 检查用户是否配置了本地 Claude CLI 路径
        const extensionConfig = await this.configService.getExtensionConfig();
        const localCliPath = extensionConfig.localClaudeCliPath;

        if (localCliPath) {
            const resolvedPath = this.resolveLocalCliPath(localCliPath);
            if (await this.fileSystemService.pathExists(resolvedPath)) {
                this.logService.info(`[AISdkService] 使用本地安装的 Claude CLI: ${resolvedPath}`);
                return resolvedPath;
            } else {
                this.logService.warn(`[AISdkService] 配置的本地 CLI 路径不存在: ${resolvedPath}，将尝试自动查找`);
            }
        }

        // 2. 查找 npm 安装的 @dcywzc/ywcoder
        const bundledCliPath = await this.findBundledYwcoderPath();
        if (bundledCliPath) {
            return bundledCliPath;
        }

        // 3. 查找内置原生二进制
        const binaryName = process.platform === 'win32' ? 'ywcoder.exe' : 'ywcoder';
        const arch = process.arch;

        const nativePath = this.context.asAbsolutePath(
            `resources/native-binaries/${process.platform}-${arch}/${binaryName}`
        );

        if (await this.fileSystemService.pathExists(nativePath)) {
            return nativePath;
        }

        throw new Error('AI引擎 CLI 未找到。请配置本地 CLI 路径、npm 安装 @dcywzc/ywcoder，或确保内置二进制文件存在。');
    }

    /**
     * 查找 npm 安装的 @dcywzc/ywcoder CLI
     * 支持开发环境（node_modules）和生产环境（dist/ywcoder）
     *
     * 注意：SDK 内部用 "node <path>" 方式 spawn，因此直接指向 cli.mjs 即可，
     * 不需要经过 bin/ywcoder wrapper。
     */
    private async findBundledYwcoderPath(): Promise<string | undefined> {
        const extensionRoot = this.context.extensionPath;

        // 2.1 优先查找构建时复制到 dist/ywcoder/ 的 cli.mjs（生产环境）
        const distCliPath = path.join(extensionRoot, 'dist', 'ywcoder', 'cli.mjs');
        if (await this.fileSystemService.pathExists(distCliPath)) {
            this.logService.info(`[AISdkService] 使用内置 YwCoder CLI (dist): ${distCliPath}`);
            return distCliPath;
        }

        // 2.2 查找 node_modules 里的 cli.mjs（开发环境）
        const pkgCliPath = path.join(extensionRoot, 'node_modules', '@dcywzc', 'ywcoder', 'dist', 'cli.mjs');
        if (await this.fileSystemService.pathExists(pkgCliPath)) {
            this.logService.info(`[AISdkService] 使用 npm 安装的 YwCoder CLI: ${pkgCliPath}`);
            return pkgCliPath;
        }

        this.logService.warn('[AISdkService] 未找到 npm 安装的 @dcywzc/ywcoder');
        return undefined;
    }

    /**
     * 解析本地 CLI 路径（支持 ~ 展开和环境变量）
     */
    private resolveLocalCliPath(cliPath: string): string {
        if (!cliPath) {
            return cliPath;
        }

        // 展开 ~ 为用户主目录
        let resolved = cliPath.startsWith('~')
            ? path.join(os.homedir(), cliPath.slice(1))
            : cliPath;

        // 展开环境变量（如 $HOME, ${HOME}）
        resolved = resolved.replace(/\$\{([^}]+)\}/g, (_, varName) => process.env[varName] || '');
        resolved = resolved.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (match, varName) => process.env[varName] || match);

        return path.normalize(resolved);
    }
}
