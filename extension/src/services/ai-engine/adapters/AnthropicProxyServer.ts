/**
 * AnthropicProxyServer - Anthropic API 格式代理服务器
 *
 * 职责：
 * 1. 启动一个本地 HTTP 服务器，模拟 Anthropic API 接口
 * 2. 接收 Anthropic 格式的请求
 * 3. 转换为 OpenAI 格式并发送到实际的 OpenAI 兼容端点
 * 4. 将 OpenAI 的响应转换回 Anthropic 格式返回给客户端
 *
 * 这样可以让 claude-agent-sdk 无缝使用 OpenAI 兼容的 API
 */

import * as http from 'http';
import { ILogService } from '../../logService';

export interface ProxyServerConfig {
  /** 本地监听端口 */
  port: number;
  /** 目标 OpenAI 兼容 API 的基础 URL */
  targetBaseUrl: string;
  /** 目标 API 的密钥 */
  targetApiKey: string;
  /** 使用的模型名称映射（Anthropic 模型名 -> OpenAI 模型名） */
  modelMapping?: Record<string, string>;
  /** 默认模型 */
  defaultModel?: string;
}

/** Anthropic 消息内容块 */
interface AnthropicContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  content?: string;
  is_error?: boolean;
}

/** Anthropic 消息 */
interface AnthropicMessage {
  role: string;
  content: string | AnthropicContentBlock[];
}

/** Anthropic 请求格式 */
interface AnthropicRequest {
  model: string;
  messages: AnthropicMessage[];
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
  system?: string;
  tools?: AnthropicTool[];
  tool_choice?: { type: string } | string;
}

/** Anthropic 工具定义 */
interface AnthropicTool {
  name: string;
  description?: string;
  input_schema: {
    type: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

/** OpenAI 消息格式 */
interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}

/** OpenAI 工具调用 */
interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/** OpenAI 工具定义 */
interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters: {
      type: string;
      properties?: Record<string, unknown>;
      required?: string[];
    };
  };
}

/** OpenAI 流式响应块 */
interface OpenAIStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string | null;
      tool_calls?: Array<{
        index?: number;
        id?: string;
        type?: 'function';
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason: string | null;
  }>;
}

export class AnthropicProxyServer {
  private server: http.Server | null = null;
  private config: ProxyServerConfig;
  private logService: ILogService;
  private isRunning = false;

  constructor(config: ProxyServerConfig, logService: ILogService) {
    this.config = {
      modelMapping: {
        'claude-opus-4': 'gpt-4',
        'claude-sonnet-4': 'gpt-4',
        'claude-sonnet-4-6': 'gpt-4',
        'claude-haiku-4': 'gpt-3.5-turbo',
        'default': 'default'
      },
      defaultModel: 'default',
      ...config
    };
    this.logService = logService;
  }

  /**
   * 启动代理服务器
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      this.logService.warn('[AnthropicProxyServer] 服务器已经在运行');
      return;
    }

    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => this.handleRequest(req, res));

      this.server.on('error', (err) => {
        this.logService.error('[AnthropicProxyServer] 服务器错误:', err);
        reject(err);
      });

      this.server.listen(this.config.port, '127.0.0.1', () => {
        this.isRunning = true;
        this.logService.info(`[AnthropicProxyServer] 代理服务器启动: http://127.0.0.1:${this.config.port}`);
        this.logService.info(`[AnthropicProxyServer] 目标: ${this.config.targetBaseUrl}`);
        resolve();
      });
    });
  }

  /**
   * 停止代理服务器
   */
  async stop(): Promise<void> {
    if (!this.server || !this.isRunning) {
      return;
    }

    return new Promise((resolve) => {
      this.server!.close(() => {
        this.isRunning = false;
        this.logService.info('[AnthropicProxyServer] 代理服务器已停止');
        resolve();
      });
    });
  }

  /**
   * 获取代理服务器地址
   */
  getProxyUrl(): string {
    return `http://127.0.0.1:${this.config.port}`;
  }

  /**
   * 检查服务器是否运行
   */
  isServerRunning(): boolean {
    return this.isRunning;
  }

  /**
   * 处理 HTTP 请求
   */
  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    // 设置 CORS 头
    this.setCorsHeaders(res);

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    const url = req.url || '/';

    try {
      // 处理健康检查
      if (url === '/health' || url === '/') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'ok',
          proxy: 'anthropic-to-openai',
          target: this.config.targetBaseUrl,
          timestamp: new Date().toISOString()
        }));
        return;
      }

      // 处理 v1/messages 端点
      if (url === '/v1/messages' && req.method === 'POST') {
        await this.handleMessages(req, res);
        return;
      }

      // 处理 models 端点
      if (url === '/v1/models' && req.method === 'GET') {
        await this.handleModels(req, res);
        return;
      }

      // 其他请求返回 404
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    } catch (error) {
      this.logService.error('[AnthropicProxyServer] 请求处理错误:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: {
          message: error instanceof Error ? error.message : 'Internal server error',
          type: 'internal_error'
        }
      }));
    }
  }

  /**
   * 处理 /v1/messages 请求
   */
  private async handleMessages(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    const anthropicReq: AnthropicRequest = JSON.parse(body);

    // 转换为 OpenAI 格式
    const openAIReq = this.convertToOpenAIRequest(anthropicReq);

    // 发送请求到目标 API
    if (anthropicReq.stream) {
      await this.streamOpenAIRequest(openAIReq, res);
    } else {
      await this.nonStreamOpenAIRequest(openAIReq, res);
    }
  }

  /**
   * 处理 /v1/models 请求
   */
  private async handleModels(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    // 返回 Anthropic 格式的模型列表（模拟）
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      data: [
        { id: 'claude-opus-4', object: 'model', created: Date.now(), owned_by: 'anthropic' },
        { id: 'claude-sonnet-4', object: 'model', created: Date.now(), owned_by: 'anthropic' },
        { id: 'claude-sonnet-4-6', object: 'model', created: Date.now(), owned_by: 'anthropic' },
        { id: 'claude-haiku-4', object: 'model', created: Date.now(), owned_by: 'anthropic' }
      ],
      object: 'list'
    }));
  }

  /**
   * 将 Anthropic 请求转换为 OpenAI 格式
   */
  private convertToOpenAIRequest(anthropicReq: AnthropicRequest): any {
    const messages: OpenAIMessage[] = [];

    // 添加 system prompt
    if (anthropicReq.system) {
      messages.push({
        role: 'system',
        content: anthropicReq.system
      });
    }

    // 转换消息 - 支持多模态内容和工具调用
    for (const msg of anthropicReq.messages) {
      if (typeof msg.content === 'string') {
        messages.push({
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content: msg.content
        });
      } else if (Array.isArray(msg.content)) {
        // 处理多模态内容块
        const contentBlocks = msg.content;
        let textContent = '';
        let toolCalls: OpenAIToolCall[] | undefined;

        for (const block of contentBlocks) {
          if (block.type === 'text' && block.text) {
            textContent += block.text;
          } else if (block.type === 'tool_use') {
            if (!toolCalls) toolCalls = [];
            toolCalls.push({
              id: block.id || `call_${Date.now()}`,
              type: 'function',
              function: {
                name: block.name || 'unknown',
                arguments: JSON.stringify(block.input || {})
              }
            });
          } else if (block.type === 'tool_result') {
            // 工具结果作为独立的消息发送
            messages.push({
              role: 'tool',
              content: block.content || '',
              tool_call_id: block.id || 'unknown'
            });
          }
        }

        // 如果有工具调用，使用 assistant 角色添加 tool_calls
        if (toolCalls && toolCalls.length > 0) {
          messages.push({
            role: 'assistant',
            content: textContent || null,
            tool_calls: toolCalls
          });
        } else {
          messages.push({
            role: msg.role === 'assistant' ? 'assistant' : 'user',
            content: textContent || ''
          });
        }
      }
    }

    // 映射模型名称
    const model = this.config.modelMapping![anthropicReq.model] ||
                  this.config.defaultModel ||
                  anthropicReq.model;

    const result: any = {
      model,
      messages,
      max_tokens: anthropicReq.max_tokens || 4096,
      temperature: anthropicReq.temperature ?? 0.7,
      stream: anthropicReq.stream ?? true
    };

    // 转换工具定义
    if (anthropicReq.tools && anthropicReq.tools.length > 0) {
      result.tools = this.convertToolsToOpenAI(anthropicReq.tools);
    }

    return result;
  }

  /**
   * 将 Anthropic 工具定义转换为 OpenAI 格式
   */
  private convertToolsToOpenAI(anthropicTools: AnthropicTool[]): OpenAITool[] {
    return anthropicTools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description || '',
        parameters: {
          type: tool.input_schema?.type || 'object',
          properties: tool.input_schema?.properties || {},
          required: tool.input_schema?.required || []
        }
      }
    }));
  }

  /**
   * 非流式请求到 OpenAI 端点
   */
  private async nonStreamOpenAIRequest(openAIReq: any, res: http.ServerResponse): Promise<void> {
    const url = `${this.config.targetBaseUrl}/chat/completions`;
    this.logService.info(`[AnthropicProxyServer] 发送请求到: ${url}`);
    this.logService.info(`[AnthropicProxyServer] 请求模型: ${openAIReq.model}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.targetApiKey}`
      },
      body: JSON.stringify(openAIReq)
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logService.error(`[AnthropicProxyServer] API 错误: ${response.status} - ${errorText}`);
      this.logService.error(`[AnthropicProxyServer] 请求 URL: ${url}`);
      this.logService.error(`[AnthropicProxyServer] 请检查 ANTHROPIC_BASE_URL 配置是否正确`);
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const openAIResp = await response.json();
    const anthropicResp = this.convertToAnthropicResponse(openAIResp);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(anthropicResp));
  }

  /**
   * 流式请求到 OpenAI 端点
   */
  private async streamOpenAIRequest(openAIReq: any, res: http.ServerResponse): Promise<void> {
    const url = `${this.config.targetBaseUrl}/chat/completions`;
    this.logService.info(`[AnthropicProxyServer] 发送流式请求到: ${url}`);
    this.logService.info(`[AnthropicProxyServer] 请求模型: ${openAIReq.model}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.targetApiKey}`
      },
      body: JSON.stringify({ ...openAIReq, stream: true })
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logService.error(`[AnthropicProxyServer] API 错误: ${response.status} - ${errorText}`);
      this.logService.error(`[AnthropicProxyServer] 请求 URL: ${url}`);
      this.logService.error(`[AnthropicProxyServer] 请检查 ANTHROPIC_BASE_URL 配置是否正确`);
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    if (!response.body) {
      throw new Error('No response body');
    }

    // 设置 SSE 头
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    // 用于追踪工具调用的状态
    let toolCallsInProgress: Map<number, { id: string; name: string; arguments: string }> = new Map();
    let hasToolCalls = false;
    let textContentStarted = false;
    let textContentIndex = 0;
    let toolCallIndex = 1; // 工具调用从索引1开始（索引0是文本块）

    try {
      // 发送消息开始事件
      res.write(`event: message_start\ndata: ${JSON.stringify({
        type: 'message_start',
        message: {
          id: `msg_${Date.now()}`,
          type: 'message',
          role: 'assistant',
          content: [],
          model: openAIReq.model,
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 0, output_tokens: 0 }
        }
      })}\n\n`);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.trim() === '' || line.trim() === 'data: [DONE]') continue;

          if (line.startsWith('data: ')) {
            try {
              const json: OpenAIStreamChunk = JSON.parse(line.slice(6));
              const delta = json.choices?.[0]?.delta;

              // 处理文本内容
              if (delta?.content) {
                // 如果文本块还没开始，发送开始事件
                if (!textContentStarted) {
                  textContentStarted = true;
                  res.write(`event: content_block_start\ndata: ${JSON.stringify({
                    type: 'content_block_start',
                    index: textContentIndex,
                    content_block: { type: 'text', text: '' }
                  })}\n\n`);
                }

                res.write(`event: content_block_delta\ndata: ${JSON.stringify({
                  type: 'content_block_delta',
                  index: textContentIndex,
                  delta: { type: 'text_delta', text: delta.content }
                })}\n\n`);
              }

              // 处理工具调用
              if (delta?.tool_calls) {
                for (const toolCall of delta.tool_calls) {
                  const index = toolCall.index ?? 0;

                  if (toolCall.id && toolCall.function?.name) {
                    // 新的工具调用开始
                    hasToolCalls = true;
                    const toolBlockIndex = toolCallIndex + index;

                    toolCallsInProgress.set(index, {
                      id: toolCall.id,
                      name: toolCall.function.name,
                      arguments: toolCall.function.arguments || ''
                    });

                    // 发送工具调用块开始
                    res.write(`event: content_block_start\ndata: ${JSON.stringify({
                      type: 'content_block_start',
                      index: toolBlockIndex,
                      content_block: {
                        type: 'tool_use',
                        id: toolCall.id,
                        name: toolCall.function.name,
                        input: {}
                      }
                    })}\n\n`);
                  } else if (toolCall.function?.arguments) {
                    // 累积参数
                    const existing = toolCallsInProgress.get(index);
                    if (existing) {
                      existing.arguments += toolCall.function.arguments;

                      // 尝试解析并发送部分参数更新
                      try {
                        const partialInput = JSON.parse(existing.arguments);
                        const toolBlockIndex = toolCallIndex + index;

                        res.write(`event: content_block_delta\ndata: ${JSON.stringify({
                          type: 'content_block_delta',
                          index: toolBlockIndex,
                          delta: {
                            type: 'input_json_delta',
                            partial_json: toolCall.function.arguments
                          }
                        })}\n\n`);
                      } catch (e) {
                        // 参数还不完整，继续累积
                      }
                    }
                  }
                }
              }

              // 处理完成原因
              const finishReason = json.choices?.[0]?.finish_reason;
              if (finishReason === 'tool_calls') {
                // 工具调用完成，关闭所有工具调用块
                for (let i = 0; i < toolCallsInProgress.size; i++) {
                  const toolBlockIndex = toolCallIndex + i;
                  const toolCall = toolCallsInProgress.get(i);

                  // 发送最终的 input
                  if (toolCall) {
                    try {
                      const finalInput = JSON.parse(toolCall.arguments);
                      res.write(`event: content_block_delta\ndata: ${JSON.stringify({
                        type: 'content_block_delta',
                        index: toolBlockIndex,
                        delta: {
                          type: 'input_json_delta',
                          partial_json: '' // 结束标记
                        }
                      })}\n\n`);
                    } catch (e) {
                      // 忽略解析错误
                    }
                  }

                  res.write(`event: content_block_stop\ndata: ${JSON.stringify({
                    type: 'content_block_stop',
                    index: toolBlockIndex
                  })}\n\n`);
                }
              }
            } catch (e) {
              this.logService.warn('[AnthropicProxyServer] 解析流式响应失败:', line);
            }
          }
        }
      }

      // 关闭文本内容块
      if (textContentStarted) {
        res.write(`event: content_block_stop\ndata: ${JSON.stringify({
          type: 'content_block_stop',
          index: textContentIndex
        })}\n\n`);
      }

      // 如果还有未关闭的工具调用块，关闭它们
      if (!hasToolCalls || toolCallsInProgress.size > 0) {
        for (let i = 0; i < toolCallsInProgress.size; i++) {
          const toolBlockIndex = toolCallIndex + i;
          res.write(`event: content_block_stop\ndata: ${JSON.stringify({
            type: 'content_block_stop',
            index: toolBlockIndex
          })}\n\n`);
        }
      }

      // 发送消息结束事件
      res.write(`event: message_stop\ndata: ${JSON.stringify({
        type: 'message_stop'
      })}\n\n`);

      res.end();
    } catch (error) {
      reader.releaseLock();
      throw error;
    }
  }

  /**
   * 将 OpenAI 响应转换为 Anthropic 格式
   */
  private convertToAnthropicResponse(openAIResp: any): any {
    const message = openAIResp.choices?.[0]?.message;
    const content: AnthropicContentBlock[] = [];

    // 添加文本内容
    if (message?.content) {
      content.push({ type: 'text', text: message.content });
    }

    // 转换工具调用
    if (message?.tool_calls && Array.isArray(message.tool_calls)) {
      for (const toolCall of message.tool_calls) {
        if (toolCall.type === 'function') {
          let input: Record<string, unknown> = {};
          try {
            input = JSON.parse(toolCall.function?.arguments || '{}');
          } catch (e) {
            // 解析失败时使用空对象
            input = { raw_arguments: toolCall.function?.arguments };
          }

          content.push({
            type: 'tool_use',
            id: toolCall.id || `tool_${Date.now()}`,
            name: toolCall.function?.name || 'unknown',
            input
          });
        }
      }
    }

    // 确定停止原因
    let stopReason: string | null = null;
    const finishReason = openAIResp.choices?.[0]?.finish_reason;
    if (finishReason === 'stop') {
      stopReason = 'end_turn';
    } else if (finishReason === 'tool_calls' || finishReason === 'function_call') {
      stopReason = 'tool_use';
    } else if (finishReason === 'length') {
      stopReason = 'max_tokens';
    }

    return {
      id: openAIResp.id || `msg_${Date.now()}`,
      type: 'message',
      role: 'assistant',
      content,
      model: openAIResp.model || 'claude-sonnet-4',
      stop_reason: stopReason,
      stop_sequence: null,
      usage: {
        input_tokens: openAIResp.usage?.prompt_tokens || 0,
        output_tokens: openAIResp.usage?.completion_tokens || 0
      }
    };
  }

  /**
   * 读取请求体
   */
  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => resolve(body));
      req.on('error', reject);
    });
  }

  /**
   * 设置 CORS 头
   */
  private setCorsHeaders(res: http.ServerResponse): void {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
  }
}

/**
 * 查找可用端口
 */
export async function findAvailablePort(startPort: number = 18000): Promise<number> {
  const net = await import('net');
  type AddressInfo = { port: number; family: string; address: string };

  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.listen(startPort, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      server.close(() => resolve(port));
    });

    server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        // 端口被占用，尝试下一个
        findAvailablePort(startPort + 1).then(resolve).catch(reject);
      } else {
        reject(err);
      }
    });
  });
}
