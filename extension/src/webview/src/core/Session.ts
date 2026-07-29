import { signal, computed, effect } from 'alien-signals';
import type { BaseTransport } from '../transport/BaseTransport';
import type { PermissionRequest } from './PermissionRequest';
import type { ModelOption } from '../../../shared/messages';
import type { SessionSummary } from './types';
import type { PermissionMode } from '@anthropic-ai/claude-agent-sdk';
import { processAndAttachMessage /*, mergeConsecutiveReadMessages */ } from '../utils/messageUtils';
import { Message as MessageModel } from '../models/Message';
import type { Message } from '../models/Message';
import { ContentBlockWrapper } from '../models/ContentBlockWrapper';

export interface SelectionRange {
  filePath: string;
  startLine: number;
  endLine: number;
  startColumn?: number;
  endColumn?: number;
  selectedText?: string;
}

export interface UsageData {
  totalTokens: number;
  totalCost: number;
  contextWindow: number;
}

export interface AttachmentPayload {
  fileName: string;
  mediaType: string;
  data: string;
  fileSize?: number;
}

const IMAGE_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
const HAS_ATOB = typeof globalThis.atob === 'function';

export interface SessionOptions {
  isExplicit?: boolean;
  existingWorktree?: { name: string; path: string };
  resumeId?: string;
}

export interface SessionContext {
  currentSelection: ReturnType<typeof signal<SelectionRange | undefined>>;
  commandRegistry: { registerAction: (...args: any[]) => void };
  fileOpener: {
    open: (filePath: string, location?: any) => Promise<void> | void;
    openContent: (
      content: string,
      fileName: string,
      editable: boolean
    ) => Promise<string | undefined>;
  };
  showNotification?: (
    message: string,
    severity: 'info' | 'warning' | 'error',
    buttons?: string[],
    onlyIfNotVisible?: boolean
  ) => Promise<string | undefined>;
  startNewConversationTab?: (initialPrompt?: string) => boolean;
  renameTab?: (title: string) => boolean;
  openURL?: (url: string) => void;
}

export class Session {
  private readonly ywcoderChannelId = signal<string | undefined>(undefined);
  private currentConnectionPromise?: Promise<BaseTransport>;
  private lastSentSelection?: SelectionRange;
  private effectCleanup?: () => void;
  private readonly toolUseIndex = new Map<string, ContentBlockWrapper>();

  readonly connection = signal<BaseTransport | undefined>(undefined);

  readonly busy = signal(false);
  readonly isLoading = signal(false);
  readonly error = signal<string | undefined>(undefined);
  readonly sessionId = signal<string | undefined>(undefined);
  readonly isExplicit = signal(false);
  readonly lastModifiedTime = signal<number>(Date.now());
  readonly messages = signal<Message[]>([]);
  readonly messageCount = signal<number>(0);
  readonly cwd = signal<string | undefined>(undefined);
  readonly permissionMode = signal<PermissionMode | undefined>(undefined);
  readonly summary = signal<string | undefined>(undefined);
  readonly modelSelection = signal<string | undefined>(undefined);
  readonly thinkingLevel = signal<string | undefined>(undefined);
  readonly todos = signal<any[]>([]);
  readonly worktree = signal<{ name: string; path: string } | undefined>(undefined);
  readonly selection = signal<SelectionRange | undefined>(undefined);
  readonly usageData = signal<UsageData>({
    totalTokens: 0,
    totalCost: 0,
    contextWindow: 200000
  });

  readonly ywcoderConfig = computed(() => {
    const conn = this.connection();
    return conn?.ywcoderConfig?.();
  });

  readonly config = computed(() => {
    const conn = this.connection();
    return conn?.config?.();
  });

  readonly permissionRequests = computed<PermissionRequest[]>(() => {
    const conn = this.connection();
    const channelId = this.ywcoderChannelId();
    if (!conn || !channelId) {
      return [];
    }

    return conn
      .permissionRequests()
      .filter((request) => request.channelId === channelId);
  });

  isOffline(): boolean {
    return (
      !this.connection() &&
      !!this.sessionId() &&
      this.messages().length === 0 &&
      !this.currentConnectionPromise
    );
  }

  constructor(
    private readonly connectionProvider: () => Promise<BaseTransport>,
    private readonly context: SessionContext,
    options: SessionOptions = {}
  ) {
    this.isExplicit(options.isExplicit ?? true);

    this.effectCleanup = effect(() => {
      this.selection(this.context.currentSelection());
    });
  }

  static fromServer(
    summary: SessionSummary,
    connectionProvider: () => Promise<BaseTransport>,
    context: SessionContext
  ): Session {
    const session = new Session(connectionProvider, context, { isExplicit: true });
    session.sessionId(summary.id);
    session.lastModifiedTime(summary.lastModified);
    session.summary(summary.summary);
    session.worktree(summary.worktree);
    session.messageCount(summary.messageCount ?? 0);  // 保存服务器返回的消息数量
    return session;
  }

  async getConnection(): Promise<BaseTransport> {
    const current = this.connection();
    if (current) {
      return current;
    }
    if (this.currentConnectionPromise) {
      return this.currentConnectionPromise;
    }

    this.currentConnectionPromise = this.connectionProvider().then((conn) => {
      this.connection(conn);
      return conn;
    });

    return this.currentConnectionPromise;
  }

  async preloadConnection(): Promise<void> {
    try {
      await this.getConnection();
      await this.launchYwCoder();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.error(message);
      console.error('[Session] 预加载连接失败:', message);
      // 通知用户连接失败
      this.context.showNotification?.(
        `无法启动 YW Coder: ${message}`,
        'error'
      );
      throw error;
    }
  }

  async loadFromServer(): Promise<void> {
    const sessionId = this.sessionId();
    if (!sessionId) return;

    this.isLoading(true);
    this.toolUseIndex.clear();
    try {
      const connection = await this.getConnection();
      const response = await connection.getSession(sessionId);
      const accumulator: Message[] = [];
      for (const raw of response?.messages ?? []) {
        this.processMessage(raw);
        processAndAttachMessage(accumulator, raw, this.toolUseIndex);
      }
      // 为已加载的 assistant 消息建立 tool_use 索引
      for (const msg of accumulator) {
        this.indexToolUseBlocks(msg);
      }
      this.messages(accumulator);
      const channelId = await this.launchYwCoder();
      if (!channelId) {
        throw new Error('Failed to launch YwCoder');
      }
    } finally {
      this.isLoading(false);
    }
  }

  async send(
    input: string,
    attachments: AttachmentPayload[] = [],
    includeSelection = false,
    allowWhileBusy = false
  ): Promise<void> {
    const connection = await this.getConnection();

    if (this.busy() && !allowWhileBusy) {
      return;
    }

    // 官方路线：不在 slash 命令时临时切换 thinkingLevel，保持会话一致性，
    // 由 SDK/服务端在 assistant 消息中提供 thinking/redacted_thinking 块以满足约束
    const isSlash = this.isSlashCommand(input);

    // 启动 channel（确保已带上当前 thinkingLevel）
    const launchedChannelId = await this.launchYwCoder();
    if (!launchedChannelId) {
      // launchYwCoder 已经显示了错误通知，这里直接返回
      this.busy(false);
      return;
    }

    const shouldIncludeSelection = includeSelection && !isSlash;
    let selectionPayload: SelectionRange | undefined;

    if (shouldIncludeSelection && !this.isSameSelection(this.lastSentSelection, this.selection())) {
      selectionPayload = this.selection();
      this.lastSentSelection = selectionPayload;
    }

    const userMessage = this.buildUserMessage(input, attachments, selectionPayload);
    const messageModel = MessageModel.fromRaw(userMessage);

    if (messageModel) {
      const current = this.messages();
      this.messages([...current, messageModel]);
    }

    if (!this.summary()) {
      this.summary(input);
    }
    this.isExplicit(false);
    this.lastModifiedTime(Date.now());
    this.busy(true);

    try {
      const channelId = this.ywcoderChannelId();
      if (!channelId) throw new Error('No active channel');
      connection.sendInput(channelId, userMessage, false);
    } catch (error) {
      this.busy(false);
      throw error;
    }
  }

  async launchYwCoder(): Promise<string | undefined> {
    const existingChannel = this.ywcoderChannelId();
    if (existingChannel) {
      return existingChannel;
    }

    this.error(undefined);
    const channelId = Math.random().toString(36).slice(2);
    this.ywcoderChannelId(channelId);

    try {
      const connection = await this.getConnection();

      if (!this.cwd()) {
        this.cwd(connection.config()?.defaultCwd);
      }

      // 注意：不再在 launch 时把 permissionMode/modelSelection 预填为默认值，
      // 否则它们会在服务端状态恢复前变成非空，导致持久化值被“本地默认值”覆盖。
      // UI 组件已处理 undefined（显示为默认），实际传给 CLI 时仍会用 'default'。

      if (!this.thinkingLevel()) {
        this.thinkingLevel(
          connection.config()?.defaultThinkingLevel ||
          connection.config()?.thinkingLevel ||
          'default_on'
        );
      }

      const stream = connection.launchYwCoder(
        channelId,
        this.sessionId() ?? undefined,
        this.cwd() ?? undefined,
        this.modelSelection() ?? undefined,
        this.permissionMode() || 'default',
        this.thinkingLevel() || 'default_on'
      );

      void this.readMessages(stream);
      return channelId;
    } catch (error) {
      this.ywcoderChannelId(undefined);
      const message = error instanceof Error ? error.message : String(error);
      this.error(message);
      console.error('[Session] 启动 YwCoder 失败:', message);
      // 显示用户友好的错误提示
      this.context.showNotification?.(
        `CLI 启动失败: ${message}`,
        'error',
        ['打开设置', '重试']
      ).then((action) => {
        if (action === '打开设置') {
          void this.openConfigFile('general');
        } else if (action === '重试') {
          void this.launchYwCoder();
        }
      });
      return undefined;
    }
  }

  async interrupt(): Promise<void> {
    const channelId = this.ywcoderChannelId();
    if (!channelId) {
      return;
    }
    const connection = await this.getConnection();
    connection.interruptYwCoder(channelId);
  }

  async restartYwCoder(): Promise<boolean> {
    await this.interrupt();
    this.ywcoderChannelId(undefined);
    this.busy(false);
    const channelId = await this.launchYwCoder();
    return !!channelId;
  }

  async listFiles(pattern?: string, signal?: AbortSignal): Promise<any> {
    const connection = await this.getConnection();
    return connection.listFiles(pattern, signal);
  }

  async setPermissionMode(mode: PermissionMode, applyToConnection = true): Promise<boolean> {
    const previous = this.permissionMode();
    this.permissionMode(mode);

    const channelId = this.ywcoderChannelId();
    if (!channelId || !applyToConnection) {
      return true;
    }
    const connection = await this.getConnection();
    const success = await connection.setPermissionMode(channelId, mode);
    if (!success) {
      this.permissionMode(previous);
    }
    return success;
  }

  async setModel(model: ModelOption): Promise<boolean> {
    const previous = this.modelSelection();
    this.modelSelection(model.value);

    const channelId = this.ywcoderChannelId();
    if (!channelId) {
      return true;
    }

    const connection = await this.getConnection();
    const response = await connection.setModel(channelId, model);

    if (!response?.success) {
      this.modelSelection(previous);
      return false;
    }

    return true;
  }

  async setThinkingLevel(level: string): Promise<void> {
    this.thinkingLevel(level);

    const channelId = this.ywcoderChannelId();
    if (!channelId) {
      return;
    }

    const connection = await this.getConnection();
    await connection.setThinkingLevel(channelId, level);
  }

  async getMcpServers(): Promise<any> {
    const connection = await this.getConnection();
    const channelId = await this.launchYwCoder();
    if (!channelId) {
      throw new Error('Failed to launch YwCoder');
    }
    return connection.getMcpServers(channelId);
  }

  async openConfigFile(configType: string): Promise<void> {
    const connection = await this.getConnection();
    await connection.openConfigFile(configType);
  }

  onPermissionRequested(callback: (request: PermissionRequest) => void): () => void {
    const connection = this.connection();
    if (!connection) {
      return () => {};
    }

    return connection.permissionRequested.add((request) => {
      // 动态获取当前 channelId，避免闭包捕获旧值
      if (request.channelId !== this.ywcoderChannelId()) {
        return;
      }

      // 绕过权限模式：自动接受所有工具权限请求，不再弹窗
      if (this.permissionMode() === 'bypassPermissions') {
        request.accept();
        return;
      }

      callback(request);
    });
  }

  dispose(): void {
    if (this.effectCleanup) {
      this.effectCleanup();
    }
    this.toolUseIndex.clear();
  }

  private async readMessages(stream: AsyncIterable<any>): Promise<void> {
    try {
      for await (const event of stream) {
        this.processIncomingMessage(event);
      }
    } catch (error) {
      this.error(error instanceof Error ? error.message : String(error));
      this.busy(false);
    } finally {
      this.ywcoderChannelId(undefined);
    }
  }

  private processIncomingMessage(event: any): void {
    // 处理 LLM 请求错误（来自 SDK stderr 致命错误）
    if (event?.type === '__llm_request_error__') {
      if (this.busy()) {
        const syntheticEvent = {
          type: 'user',
          message: {
            role: 'user',
            content: [{ type: 'llm_error', message: event.error }],
          },
        };
        const currentMessages = this.messages();
        processAndAttachMessage(currentMessages, syntheticEvent, this.toolUseIndex);
        this.messages([...currentMessages]);
        this.busy(false);
      } else {
        this.context.showNotification?.(event.error, 'error');
      }
      return;
    }

    // 将 compact_boundary 渲染为提示消息
    if (event?.type === 'system' && event?.subtype === 'compact_boundary') {
      const syntheticEvent = {
        type: 'user',
        message: {
          role: 'user',
          content: [{
            type: 'compact_boundary',
            message: typeof event.message === 'string' ? event.message : '上下文已自动压缩，继续对话'
          }],
        },
      };
      const currentMessages = this.messages();
      processAndAttachMessage(currentMessages, syntheticEvent, this.toolUseIndex);
      this.messages([...currentMessages]);

      // 仍需更新 session_id 等状态
      if (event.session_id) {
        this.sessionId(event.session_id);
      }
      return;
    }

    // 1. 获取当前消息数组（复用引用，只在 set 时浅拷贝一次）
    const currentMessages = this.messages();

    // 2. 处理特殊消息（TodoWrite, usage 等）
    this.processMessage(event);

    // 3. 关联 tool_result 并添加新消息
    processAndAttachMessage(currentMessages, event, this.toolUseIndex);

    // 4. 为新加入的 assistant 消息建立 tool_use 索引
    const lastMessage = currentMessages[currentMessages.length - 1];
    if (lastMessage) {
      this.indexToolUseBlocks(lastMessage);
    }

    // 5. 更新 messages signal（仅一次浅拷贝）
    this.messages([...currentMessages]);

    // 6. 更新其他状态
    if (event?.type === 'system') {
      this.sessionId(event.session_id);
      if (event.subtype === 'init') {
        this.busy(true);
      }
    } else if (event?.type === 'result') {
      this.busy(false);
    }
  }

  /**
   * 为 assistant 消息中的 tool_use blocks 建立索引
   */
  private indexToolUseBlocks(message: Message): void {
    if (message.type !== 'assistant') {
      return;
    }
    const content = message.message.content;
    if (typeof content === 'string' || !Array.isArray(content)) {
      return;
    }

    for (const wrapper of content) {
      const block = wrapper.content;
      if (block.type === 'tool_use' && block.id) {
        this.toolUseIndex.set(block.id, wrapper);
      }
    }
  }

  /**
   * 处理特殊消息（TodoWrite, usage 统计）
   */
  private processMessage(event: any): void {
    if (
      event.type === 'assistant' &&
      event.message?.content &&
      Array.isArray(event.message.content)
    ) {
      // 处理 TodoWrite
      for (const block of event.message.content) {
        if (
          block.type === 'tool_use' &&
          block.name === 'TodoWrite' &&
          block.input &&
          typeof block.input === 'object' &&
          'todos' in block.input
        ) {
          this.todos(block.input.todos);
        }
      }

      // 处理 usage 统计
      if (event.message.usage) {
        this.updateUsage(event.message.usage);
      }
    }
  }

  /**
   * 更新 token 使用统计
   */
  private updateUsage(usage: any): void {
    const totalTokens =
      usage.input_tokens +
      (usage.cache_creation_input_tokens ?? 0) +
      (usage.cache_read_input_tokens ?? 0) +
      usage.output_tokens;

    const current = this.usageData();
    this.usageData({
      totalTokens,
      totalCost: current.totalCost,
      contextWindow: current.contextWindow
    });
  }

  private buildUserMessage(
    input: string,
    attachments: AttachmentPayload[],
    selection?: SelectionRange
  ): any {
    const content: any[] = [];

    if (selection?.selectedText) {
      content.push({
        type: 'text',
        text: `<ide_selection>The user selected the lines ${selection.startLine} to ${selection.endLine} from ${selection.filePath}:
${selection.selectedText}

This may or may not be related to the current task.</ide_selection>`
      });
    }

    for (const attachment of attachments) {
      const { fileName, mediaType, data } = attachment;
      if (!data) {
        console.error(`Attachment missing data: ${fileName}`);
        continue;
      }

      const normalizedType = (mediaType || 'application/octet-stream').toLowerCase();

      if (IMAGE_MEDIA_TYPES.includes(normalizedType as (typeof IMAGE_MEDIA_TYPES)[number])) {
        content.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: normalizedType,
            data
          }
        });
        continue;
      }

      if (normalizedType === 'text/plain') {
        try {
          const decoded = HAS_ATOB ? globalThis.atob(data) : '';
          content.push({
            type: 'document',
            source: {
              type: 'text',
              media_type: 'text/plain',
              data: decoded
            },
            title: fileName
          });
          continue;
        } catch (error) {
          console.error('Failed to decode text attachment', error);
        }
      }

      if (normalizedType === 'application/pdf') {
        content.push({
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data
          },
          title: fileName
        });
        continue;
      }

      console.error(`Unsupported attachment type: ${fileName} (${normalizedType})`);
    }

    content.push({ type: 'text', text: input });

    return {
      type: 'user',
      session_id: '',
      parent_tool_use_id: null,
      message: {
        role: 'user',
        content
      }
    };
  }

  private isSlashCommand(input: string): boolean {
    return input.trim().startsWith('/');
  }

  private isSameSelection(a?: SelectionRange, b?: SelectionRange): boolean {
    if (!a && !b) return true;
    if (!a || !b) return false;
    return (
      a.filePath === b.filePath &&
      a.startLine === b.startLine &&
      a.endLine === b.endLine &&
      a.startColumn === b.startColumn &&
      a.endColumn === b.endColumn &&
      a.selectedText === b.selectedText
    );
  }
}
