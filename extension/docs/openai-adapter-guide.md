# OpenAI 格式适配器配置指南

YwCoder 内置了 OpenAI 到 Anthropic 格式的适配器，允许使用 OpenAI 兼容的 API 端点（如 LM Studio、Ollama、vLLM 等）与 Claude SDK 无缝集成。

## 快速开始

### 1. LM Studio

```bash
# 1. 下载并安装 LM Studio
# https://lmstudio.ai/

# 2. 下载模型并启动本地服务器
# 在 LM Studio 中: Developer -> Start Server

# 3. 配置 YwCoder
# ~/.claude/settings.json
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://localhost:1234/v1",
    "ANTHROPIC_AUTH_TOKEN": "lm-studio"
  }
}

# 4. 启用适配器 (可选，LM Studio 会自动触发)
# ~/.ywcoder.json
{
  "useOpenAIAdapter": true,
  "openAIModel": "local-model"
}
```

### 2. Ollama

```bash
# 1. 安装 Ollama
# https://ollama.ai/

# 2. 拉取模型
ollama pull llama2
ollama pull codellama
ollama pull mistral

# 3. 启动 Ollama 服务
ollama serve

# 4. 配置 YwCoder
# ~/.claude/settings.json
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://localhost:11434/v1",
    "ANTHROPIC_AUTH_TOKEN": "ollama"
  }
}

# 5. 启用适配器
# ~/.ywcoder.json
{
  "useOpenAIAdapter": true,
  "openAIModel": "llama2"
}
```

### 3. vLLM

```bash
# 1. 安装 vLLM
pip install vllm

# 2. 启动 vLLM 服务
python -m vllm.entrypoints.openai.api_server \
  --model meta-llama/Llama-2-7b-chat-hf \
  --port 8000

# 3. 配置 YwCoder
# ~/.claude/settings.json
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://localhost:8000/v1",
    "ANTHROPIC_AUTH_TOKEN": "token-abc123"
  }
}
```

## 配置选项

### 自动启用适配器

适配器会在以下情况自动启用（无需设置 `useOpenAIAdapter: true`）：

- `ANTHROPIC_BASE_URL` 包含以下关键词之一：
  - `openai`
  - `localhost`
  - `127.0.0.1`
  - `lmstudio`
  - `ollama`
  - `vllm`
  - `text-generation-inference`
  - `tgi`
  - `llamacpp`
  - `kobold`
  - `tabby`
  - `continue`

### 手动控制

编辑 `~/.ywcoder.json`：

```json
{
  "_comment": "强制启用适配器",
  "useOpenAIAdapter": true,

  "_comment2": "指定 OpenAI 模型名称",
  "openAIModel": "gpt-4",

  "_comment3": "禁用适配器 (即使端点看起来像是 OpenAI 兼容)",
  "useOpenAIAdapter": false
}
```

### 环境变量控制

```bash
# 强制启用适配器
export YWCODE_USE_OPENAI_ADAPTER=1

# 强制禁用适配器
export YWCODE_DISABLE_OPENAI_ADAPTER=1

# 指定 OpenAI 模型
export YWCODE_OPENAI_MODEL=gpt-4
```

## 支持的 OpenAI 兼容端点

| 平台 | 默认 URL | 说明 |
|------|---------|------|
| LM Studio | `http://localhost:1234/v1` | 本地 GUI 工具，易于使用 |
| Ollama | `http://localhost:11434/v1` | 本地模型管理，支持多种模型 |
| vLLM | `http://localhost:8000/v1` | 高性能推理引擎 |
| Text Generation Inference | `http://localhost:8080/v1` | HuggingFace 推理框架 |
| LocalAI | `http://localhost:8080/v1` | 多后端支持的本地 AI |
| Tabby | `http://localhost:8080` | 代码补全引擎 |
| 内部网关 | 自定义 | 企业内部 OpenAI 兼容 API |

## 模型名称映射

当使用适配器时，YwCoder 会自动将 Anthropic 模型名映射到 OpenAI 模型名：

| Anthropic 模型 | 默认 OpenAI 映射 |
|---------------|-----------------|
| `claude-opus-4` | `gpt-4` |
| `claude-sonnet-4` | `gpt-4` |
| `claude-sonnet-4-6` | `gpt-4` |
| `claude-haiku-4` | `gpt-3.5-turbo` |
| `default` | `default` 或自定义 |

可以通过 `openAIModel` 配置自定义映射：

```json
{
  "openAIModel": "codellama:7b"
}
```

## 工作原理

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Claude SDK     │────>│  AnthropicProxy  │────>│  OpenAI API     │
│  (ANTHROPIC_    │     │  Server          │     │  (LM Studio,    │
│   BASE_URL)     │<────│  (localhost:18xxx)│<────│   Ollama, etc)  │
└─────────────────┘     └──────────────────┘     └─────────────────┘
        │                       │                        │
        │  Anthropic Format     │  Format Conversion     │  OpenAI Format
        │  - /v1/messages       │  - Anthropic -> OpenAI │  - /v1/chat/completions
        │  - Streaming SSE      │  - Model mapping       │  - Streaming SSE
        │                       │  - Response conversion │
```

适配器会：
1. **请求转换**: 将 Anthropic `/v1/messages` 请求转换为 OpenAI `/v1/chat/completions` 格式
2. **模型映射**: 将 Claude 模型名映射到对应的 OpenAI 模型名
3. **流式响应**: 支持 SSE 流式传输，实时转换响应块
4. **工具调用**: （实验性）转换工具调用格式

## 故障排除

### 适配器没有自动启动

检查日志输出，如果 BASE_URL 包含 OpenAI 关键词但没有启动适配器：

```bash
# 强制启用
export YWCODE_USE_OPENAI_ADAPTER=1
```

### 端口冲突

适配器自动查找可用端口（从 18000 开始）。如果冲突：

```bash
# 检查端口占用
lsof -i :18000

# 更改起始端口（需要修改源代码）
```

### 请求超时

对于较慢的本地模型，可能需要增加超时时间：

```json
{
  "env": {
    "CLAUDE_CODE_TIMEOUT": "120"
  }
}
```

### 查看适配器日志

在 VSCode 输出面板中查看 `YwCoder` 通道的日志：

```
[AISdkService] OpenAI 适配代理已启动: http://127.0.0.1:18000 -> http://localhost:1234/v1
```

## 高级配置

### 自定义模型映射

目前模型映射是硬编码的，未来版本将支持自定义映射：

```json
{
  "_comment": "未来版本将支持",
  "openAIModelMapping": {
    "claude-opus-4": "mixtral-8x7b",
    "claude-sonnet-4": "llama2:70b"
  }
}
```

### 多后端切换

可以通过 Profile 功能快速切换不同后端：

```bash
# ~/.claude/settings.lmstudio.json
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://localhost:1234/v1"
  }
}

# ~/.claude/settings.ollama.json
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://localhost:11434/v1"
  }
}
```

然后在 YwCoder 设置页面切换 Profile。

## 相关文件

- `AnthropicProxyServer.ts` - 代理服务器实现
- `OpenAIAdapter.ts` - 格式转换逻辑
- `~/.ywcoder.json` - 扩展配置
- `~/.claude/settings.json` - 全局设置
