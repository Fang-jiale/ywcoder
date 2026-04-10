/**
 * OpenAIAdapter - OpenAI API 到 Anthropic API 格式转换适配器
 *
 * 职责：
 * 1. 将 Anthropic 格式的请求转换为 OpenAI 格式
 * 2. 发送请求到 OpenAI 兼容的 API 端点
 * 3. 将 OpenAI 的响应转换回 Anthropic 格式
 *
 * 使用场景：
 * - 本地部署的 OpenAI 兼容模型（LM Studio、Ollama、vLLM 等）
 * - 内部 OpenAI 兼容 API 网关
 */

import { ILogService } from '../../logService';

export interface OpenAIAdapterConfig {
  /** OpenAI 兼容 API 的基础 URL */
  baseUrl: string;
  /** API 密钥 */
  apiKey: string;
  /** 使用的模型名称 */
  model: string;
  /** 是否启用流式响应 */
  stream?: boolean;
  /** 温度参数 */
  temperature?: number;
  /** 最大 token 数 */
  maxTokens?: number;
}

/** Anthropic 消息格式 */
interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Anthropic 请求格式 */
interface AnthropicRequest {
  model: string;
  messages: AnthropicMessage[];
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
  system?: string;
}

/** OpenAI 消息格式 */
interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** OpenAI 请求格式 */
interface OpenAIRequest {
  model: string;
  messages: OpenAIMessage[];
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
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
      content?: string;
    };
    finish_reason: string | null;
  }>;
}

/** OpenAI 非流式响应 */
interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/** Anthropic 流式响应块 */
interface AnthropicStreamChunk {
  type: 'content_block_delta' | 'message_stop' | 'error';
  delta?: {
    type: 'text_delta';
    text: string;
  };
  index?: number;
}

export class OpenAIAdapter {
  private config: OpenAIAdapterConfig;
  private logService: ILogService;

  constructor(config: OpenAIAdapterConfig, logService: ILogService) {
    this.config = {
      stream: true,
      temperature: 0.7,
      maxTokens: 4096,
      ...config
    };
    this.logService = logService;
    this.logService.info(`[OpenAIAdapter] 初始化适配器: ${this.config.baseUrl}`);
  }

  /**
   * 发送聊天完成请求
   */
  async chatCompletion(
    messages: AnthropicMessage[],
    systemPrompt?: string,
    onChunk?: (chunk: string) => void
  ): Promise<string> {
    const openAIRequest = this.convertToOpenAIRequest(messages, systemPrompt);
    this.logService.debug('[OpenAIAdapter] 转换后的请求:', JSON.stringify(openAIRequest, null, 2));

    try {
      if (this.config.stream && onChunk) {
        return await this.streamCompletion(openAIRequest, onChunk);
      } else {
        return await this.nonStreamCompletion(openAIRequest);
      }
    } catch (error) {
      this.logService.error('[OpenAIAdapter] 请求失败:', error);
      throw error;
    }
  }

  /**
   * 将 Anthropic 请求转换为 OpenAI 格式
   */
  private convertToOpenAIRequest(
    messages: AnthropicMessage[],
    systemPrompt?: string
  ): OpenAIRequest {
    const openAIMessages: OpenAIMessage[] = [];

    // 添加 system prompt
    if (systemPrompt) {
      openAIMessages.push({
        role: 'system',
        content: systemPrompt
      });
    }

    // 转换消息
    for (const msg of messages) {
      openAIMessages.push({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content
      });
    }

    return {
      model: this.config.model,
      messages: openAIMessages,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      stream: this.config.stream
    };
  }

  /**
   * 非流式请求
   */
  private async nonStreamCompletion(request: OpenAIRequest): Promise<string> {
    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify({ ...request, stream: false })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as OpenAIResponse;
    return data.choices[0]?.message?.content || '';
  }

  /**
   * 流式请求
   */
  private async streamCompletion(
    request: OpenAIRequest,
    onChunk: (chunk: string) => void
  ): Promise<string> {
    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify({ ...request, stream: true })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    if (!response.body) {
      throw new Error('No response body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.trim() === '') continue;
          if (line.trim() === 'data: [DONE]') continue;

          if (line.startsWith('data: ')) {
            try {
              const json: OpenAIStreamChunk = JSON.parse(line.slice(6));
              const content = json.choices[0]?.delta?.content;
              if (content) {
                fullContent += content;
                onChunk(content);
              }
            } catch (e) {
              this.logService.warn('[OpenAIAdapter] 解析流式响应失败:', line);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return fullContent;
  }

  /**
   * 将 OpenAI 格式的工具调用转换为 Anthropic 格式
   * 注意：这是一个简化版本，完整的工具调用转换需要更多上下文
   */
  convertToolCalls(openAITools: any[]): any[] {
    return openAITools.map(tool => ({
      type: 'tool_use',
      id: tool.id,
      name: tool.function.name,
      input: JSON.parse(tool.function.arguments || '{}')
    }));
  }

  /**
   * 将 Anthropic 格式的工具结果转换为 OpenAI 格式
   */
  convertToolResult(toolName: string, result: any): string {
    return JSON.stringify({
      tool_name: toolName,
      result
    });
  }
}

/**
 * 检查是否需要使用 OpenAI 适配器
 * 根据环境变量或配置判断
 */
export function shouldUseOpenAIAdapter(): boolean {
  // 检查是否有 OpenAI 格式的端点配置
  const baseUrl = process.env.ANTHROPIC_BASE_URL || '';
  const isOpenAIEndpoint =
    baseUrl.includes('openai') ||
    baseUrl.includes('localhost') ||
    baseUrl.includes('127.0.0.1') ||
    baseUrl.includes('lmstudio') ||
    baseUrl.includes('ollama');

  // 检查是否强制启用适配器
  const forceOpenAIAdapter = process.env.YWCODE_USE_OPENAI_ADAPTER === '1' ||
                             process.env.YWCODE_USE_OPENAI_ADAPTER === 'true';

  // 检查是否强制禁用适配器
  const forceDisable = process.env.YWCODE_DISABLE_OPENAI_ADAPTER === '1' ||
                       process.env.YWCODE_DISABLE_OPENAI_ADAPTER === 'true';

  if (forceDisable) return false;
  if (forceOpenAIAdapter) return true;

  return isOpenAIEndpoint && baseUrl.length > 0;
}

/**
 * 从环境变量创建适配器配置
 */
export function createAdapterConfigFromEnv(): OpenAIAdapterConfig {
  const baseUrl = process.env.ANTHROPIC_BASE_URL || 'http://localhost:1234/v1';
  const apiKey = process.env.ANTHROPIC_AUTH_TOKEN || 'not-needed';
  const model = process.env.YWCODE_OPENAI_MODEL || process.env.ANTHROPIC_MODEL || 'default';

  return {
    baseUrl: baseUrl.replace(/\/+$/, ''), // 移除末尾斜杠
    apiKey,
    model,
    stream: true,
    temperature: parseFloat(process.env.YWCODE_TEMPERATURE || '0.7'),
    maxTokens: parseInt(process.env.YWCODE_MAX_TOKENS || '4096', 10)
  };
}
