# PRD-2：本地大模型与 CLI 配置模块需求文档

> 版本：v1.0
> 日期：2026-04-22
> 状态：已交付 v1.0.0
> 依赖：PRD-1 整体产品需求

---

## 1. 模块概述

### 1.1 背景
YW Coder 默认基于 Anthropic SDK 与 Claude 模型通信。但在以下场景需要替代方案：
- **数据安全要求**：代码不能离开内网
- **成本优化**：降低 API 调用费用
- **模型自主**：使用自研或开源模型
- **离线环境**：无公网访问权限

本模块提供两种本地替代能力：
1. **本地大模型接入**：通过 OpenAI 兼容 API 连接 Ollama、LM Studio、vLLM 等
2. **本地 CLI 替代**：使用系统已安装的 Claude CLI 替代扩展内置版本

### 1.2 目标
- 用户可在 3 分钟内完成本地模型或本地 CLI 的配置
- 配置变更无需修改源代码，通过设置页面或配置文件完成
- 配置错误时自动回退到默认行为，不影响正常使用

---

## 2. 功能需求

### 2.1 本地大模型接入

#### FR-2.1.1 多平台支持
支持以下本地模型平台的 OpenAI 兼容 API：

| 平台 | 默认端点 | 说明 | 优先级 |
|------|---------|------|--------|
| Ollama | `http://localhost:11434/v1` | 本地模型管理，支持多种模型 | P0 |
| LM Studio | `http://localhost:1234/v1` | 本地 GUI 工具，易于使用 | P0 |
| vLLM | `http://localhost:8000/v1` | 高性能推理引擎 | P1 |
| Text Generation Inference | `http://localhost:8080/v1` | HuggingFace 推理框架 | P2 |
| LocalAI | `http://localhost:8080/v1` | 多后端支持的本地 AI | P2 |
| 内部网关 | 自定义 | 企业内部 OpenAI 兼容 API | P1 |

#### FR-2.1.2 自动适配器检测
适配器在以下情况自动启用（无需手动设置 `useOpenAIAdapter`）：

- `ANTHROPIC_BASE_URL` 包含以下关键词之一：
  `openai`, `localhost`, `127.0.0.1`, `lmstudio`, `ollama`, `vllm`, `text-generation-inference`, `tgi`, `llamacpp`, `kobold`, `tabby`, `continue`

#### FR-2.1.3 配置方式
提供三种等效配置途径：

**方式 A：设置页面（推荐）**
打开 YW Coder 设置 → 通用标签页 → 默认环境变量：

| 环境变量 | 示例值 | 说明 |
|---------|--------|------|
| `CLAUDE_CODE_USE_OPENAI` | `1` | 启用 OpenAI 兼容模式 |
| `OPENAI_API_KEY` | `glm` | API 密钥（本地模型可随意填写） |
| `OPENAI_BASE_URL` | `http://localhost:11434/v1` | 本地模型服务地址 |
| `OPENAI_MODEL` | `llama2` | 模型名称 |

**方式 B：扩展配置 `~/.ywcoder.json`**
```json
{
  "defaultEnvVars": {
    "CLAUDE_CODE_USE_OPENAI": "1",
    "OPENAI_API_KEY": "glm",
    "OPENAI_BASE_URL": "http://localhost:11434/v1",
    "OPENAI_MODEL": "llama2"
  }
}
```

**方式 C：CLI 配置 `~/.claude/settings.json`**
```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://localhost:11434/v1",
    "ANTHROPIC_AUTH_TOKEN": "ollama"
  }
}
```

#### FR-2.1.4 模型名称映射
使用适配器时，自动将 Anthropic 模型名映射到 OpenAI 模型名：

| Anthropic 模型 | 默认 OpenAI 映射 |
|---------------|-----------------|
| `claude-opus-4` | `gpt-4` |
| `claude-sonnet-4` | `gpt-4` |
| `claude-sonnet-4-6` | `gpt-4` |
| `claude-haiku-4` | `gpt-3.5-turbo` |
| `default` | `default` 或自定义 |

支持通过 `openAIModel` 配置项自定义映射：
```json
{
  "openAIModel": "codellama:7b"
}
```

#### FR-2.1.5 适配器工作机制
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

转换内容：
1. **请求转换**：Anthropic `/v1/messages` → OpenAI `/v1/chat/completions`
2. **模型映射**：Claude 模型名 → OpenAI 模型名
3. **流式响应**：SSE 实时转换响应块
4. **工具调用**：（实验性）转换工具调用格式

#### FR-2.1.6 代理服务器端口分配
- 自动查找可用端口，起始端口 18000
- 若端口冲突，顺序尝试 18001、18002...
- 端口分配结果在日志中输出：
  `[AISdkService] OpenAI 适配代理已启动: http://127.0.0.1:18000 -> http://localhost:11434/v1`

#### FR-2.1.7 手动控制开关
环境变量强制控制：
```bash
export YWCODE_USE_OPENAI_ADAPTER=1      # 强制启用
export YWCODE_DISABLE_OPENAI_ADAPTER=1  # 强制禁用
export YWCODE_OPENAI_MODEL=gpt-4        # 指定 OpenAI 模型
```

配置文件强制控制：
```json
{
  "useOpenAIAdapter": true,   // 强制启用
  "useOpenAIAdapter": false   // 强制禁用
}
```

#### FR-2.1.8 超时配置
本地模型推理较慢时，支持自定义超时：
```json
{
  "env": {
    "CLAUDE_CODE_TIMEOUT": "120"
  }
}
```
默认超时为 60 秒。

---

### 2.2 本地 CLI 配置

#### FR-2.2.1 功能目标
允许用户使用系统已安装的 `claude` CLI 替代扩展内置的原生二进制文件或 `cli.js`，以便：
- 使用自定义编译/修改的 CLI 版本
- 保持与终端中 `claude` 命令行为一致
- 利用系统 PATH 中已有的 CLI 安装

#### FR-2.2.2 配置方式
提供三种等效配置途径：

**方式 A：设置页面**
打开 YW Coder 设置 → 通用标签页 → 本地 CLI 设置：
- **本地 CLI 路径**：填写本地 CLI 的绝对路径

**方式 B：环境变量**
```bash
# macOS/Linux
export YWCODER_CLI_PATH="/usr/local/bin/claude"

# Windows
set YWCODER_CLI_PATH=C:\Users\<用户名>\AppData\Local\anthropic\claude\claude.exe
```

**方式 C：扩展配置 `~/.ywcoder.json`**
```json
{
  "localClaudeCliPath": "/usr/local/bin/claude"
}
```

#### FR-2.2.3 路径环境变量展开
`localClaudeCliPath` 支持以下环境变量展开：
- `$HOME/.local/bin/claude`
- `${HOME}/.local/bin/claude`

展开逻辑在 Extension 启动时执行，若展开失败则保留原字符串。

#### FR-2.2.4 路径查找优先级
从高到低：

1. 用户配置的 `localClaudeCliPath`（`~/.ywcoder.json`）
2. 环境变量 `YWCODER_CLI_PATH`
3. 扩展内置的原生二进制文件
4. 扩展内置的 `cli.js`

若配置的本地路径不存在（文件不可访问），自动回退到下一优先级，并在输出面板输出警告日志。

#### FR-2.2.5 常见安装路径参考

| 安装方式 | 典型路径 |
|---------|---------|
| npm 全局安装 | `/usr/local/bin/claude` |
| Homebrew (macOS) | `/opt/homebrew/bin/claude` |
| 官方安装脚本 | `~/.local/bin/claude` |

#### FR-2.2.6 路径查找辅助
在文档中提供以下辅助命令：
```bash
# macOS/Linux
which claude

# 或使用 find
find ~ -name "claude" -type f 2>/dev/null
```

**重要约束**：YW Coder **不会**自动去系统 PATH 中查找 `claude` 命令，必须通过上述方式显式配置。

---

## 3. 配置验证

### 3.1 验证步骤
1. 修改配置后**重启 VSCode**
2. 在 YW Coder 聊天中输入 `/config` 查看当前生效的配置
3. 查看 YW Coder 输出面板确认 CLI 路径和模型连接状态

### 3.2 配置文件路径汇总

| 配置类型 | 文件路径 | 说明 |
|---------|---------|------|
| 扩展配置 | `~/.ywcoder.json` | YW Coder 扩展专属配置 |
| 全局设置 | `~/.claude/settings.json` | 用户级默认配置 |
| Profile 设置 | `~/.claude/settings.<name>.json` | 多配置方案 |
| 项目设置 | `<workspace>/.claude/settings.json` | 工作区共享配置 |
| 本地设置 | `<workspace>/.claude/settings.local.json` | 工作区本地配置（不提交到 git） |

---

## 4. 完整配置示例

### 4.1 `~/.ywcoder.json`（扩展配置）
```json
{
  "localClaudeCliPath": "/usr/local/bin/claude",
  "defaultPermissionMode": "default",
  "defaultThinkingLevel": "default_on",
  "defaultEnvVars": {
    "CLAUDE_CODE_USE_OPENAI": "1",
    "OPENAI_API_KEY": "ollama",
    "OPENAI_BASE_URL": "http://localhost:11434/v1",
    "OPENAI_MODEL": "llama2"
  }
}
```

### 4.2 `~/.claude/settings.json`（CLI 配置）
```json
{
  "model": "claude-sonnet-4-6",
  "env": {
    "ANTHROPIC_BASE_URL": "http://localhost:11434/v1",
    "ANTHROPIC_AUTH_TOKEN": "ollama",
    "CLAUDE_CODE_OFFLINE_MODE": "1"
  },
  "permissions": {
    "allow": ["Read", "Edit", "Write", "Bash(git *)", "Bash(npm *)"],
    "deny": ["WebFetch", "WebSearch", "Bash(curl *)"]
  }
}
```

---

## 5. 技术要求

### 5.1 依赖
- `@anthropic-ai/claude-agent-sdk`: SDK 封装
- `@anthropic-ai/sdk`: 原生 SDK 通信
- 内置 HTTP 代理服务器（Node.js `http` 模块）

### 5.2 关键实现文件
| 文件 | 职责 |
|------|------|
| `AnthropicProxyServer.ts` | 本地代理服务器，启动/停止、请求转发 |
| `OpenAIAdapter.ts` | 格式转换逻辑（Anthropic ↔ OpenAI） |
| `AISdkService.ts` | SDK 封装，决定使用原生还是适配器路径 |
| `ConfigurationService.ts` | 读取 ~/.ywcoder.json 和 settings.json |

### 5.3 错误处理
| 场景 | 行为 |
|------|------|
| 本地模型服务未启动 | 连接超时，输出错误日志，建议检查服务状态 |
| 适配器端口冲突 | 自动尝试下一个端口 |
| 配置的 CLI 路径不存在 | 回退到内置 CLI，输出警告 |
| 环境变量展开失败 | 保留原字符串，输出警告 |
| 模型名称映射缺失 | 使用原始模型名，输出调试日志 |

---

## 6. 验收标准

### 6.1 本地大模型
- [ ] Ollama 服务启动后，YW Coder 能自动检测并启用适配器
- [ ] LM Studio 服务启动后，适配器能正确转发请求
- [ ] 流式响应与原生 Anthropic 体验一致
- [ ] 模型名称映射正确，自定义映射生效
- [ ] 端口冲突时自动选择新端口
- [ ] 适配器关闭时资源正确释放

### 6.2 本地 CLI
- [ ] 配置 `localClaudeCliPath` 后，扩展使用该路径启动 CLI
- [ ] 路径不存在时自动回退到内置 CLI
- [ ] 环境变量 `$HOME` / `${HOME}` 正确展开
- [ ] `YWCODER_CLI_PATH` 环境变量优先级正确
- [ ] 配置变更后重启生效

---

## 7. 相关文档
- [本地模型与 CLI 配置指南](../local-model-cli-config.md)
- [OpenAI 适配器配置指南](../openai-adapter-guide.md)
- [离线环境配置指南](../离线环境配置指南.md)
- [CCSettings.md](../CCSettings.md)
