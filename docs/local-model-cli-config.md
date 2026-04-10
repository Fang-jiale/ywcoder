# YW Coder 本地大模型和 CLI 配置指南

本文档介绍如何在 YW Coder 中配置本地大模型和本地 CLI。

## 支持的 VSCode 版本

| 要求 | 版本 |
|-----|------|
| VSCode | `^1.98.0` 及以上 |
| Node.js | `>=18.0.0` |

**注意：** 请确保您的 VSCode 版本不低于 1.98.0，否则扩展可能无法正常安装或运行。

---

## 一、配置本地大模型

YW Coder 支持通过 OpenAI 兼容 API 连接本地大模型（如 Ollama、LM Studio、vLLM 等）。

### 方法 1：通过设置页面配置（推荐）

打开 YW Coder 设置页面 → **通用** 标签页，找到 **默认环境变量** 部分：

| 环境变量 | 示例值 | 说明 |
|---------|--------|------|
| `CLAUDE_CODE_USE_OPENAI` | `1` | 启用 OpenAI 兼容模式 |
| `OPENAI_API_KEY` | `glm` | API 密钥（本地模型可随意填写） |
| `OPENAI_BASE_URL` | `http://localhost:11434/v1` | 本地模型服务地址 |
| `OPENAI_MODEL` | `llama2` | 模型名称 |

### 方法 2：手动编辑配置文件

**扩展配置文件**：`~/.ywcoder.json`

```json
{
  "defaultEnvVars": {
    "CLAUDE_CODE_USE_OPENAI": "1",
    "OPENAI_API_KEY": "glm",
    "OPENAI_BASE_URL": "http://76.13.61.16:8015/v1",
    "OPENAI_MODEL": "GLM5"
  }
}
```

**或者通过 CLI 配置**：`~/.claude/settings.json`

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://localhost:11434/v1",
    "ANTHROPIC_AUTH_TOKEN": "ollama"
  }
}
```

### 常见本地模型配置示例

#### Ollama

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://localhost:11434/v1",
    "ANTHROPIC_AUTH_TOKEN": "ollama"
  }
}
```

#### LM Studio

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://localhost:1234/v1",
    "ANTHROPIC_AUTH_TOKEN": "not-needed"
  }
}
```

---

## 二、配置本地 CLI

YW Coder 可以使用系统已安装的 CLI 替代内置版本。

### 方法 1：通过设置页面配置

打开 YW Coder 设置页面 → **通用** 标签页，找到 **本地 CLI 设置** 部分：

- **本地 CLI 路径**: 填写本地 CLI 的绝对路径

### 方法 2：通过环境变量配置

设置环境变量 `YWCODER_CLI_PATH`：

```bash
# macOS/Linux
export YWCODER_CLI_PATH="/usr/local/bin/claude"

# Windows
set YWCODER_CLI_PATH=C:\Users\<用户名>\AppData\Local\anthropic\claude\claude.exe
```

### 方法 3：手动编辑配置文件

编辑 `~/.ywcoder.json`：

```json
{
  "localClaudeCliPath": "/usr/local/bin/claude"
}
```

**路径支持环境变量展开：**

```json
{
  "localClaudeCliPath": "$HOME/.local/bin/claude"
}
```

或

```json
{
  "localClaudeCliPath": "${HOME}/.local/bin/claude"
}
```

### 常见安装路径

| 安装方式 | 典型路径 |
|---------|---------|
| npm 全局安装 | `/usr/local/bin/claude` |
| Homebrew (macOS) | `/opt/homebrew/bin/claude` |
| 官方安装脚本 | `~/.local/bin/claude` |

### 查找本地 CLI 路径

```bash
# macOS/Linux
which claude

# 或使用 find
find ~ -name "claude" -type f 2>/dev/null
```

### 优先级顺序

1. 用户配置的 `localClaudeCliPath`（`~/.ywcoder.json`）
2. 环境变量 `YWCODER_CLI_PATH`
3. 扩展内置的原生二进制文件
4. 扩展内置的 `cli.js`

如果配置的本地路径不存在，会自动回退到内置 CLI。

**注意：** YW Coder **不会**自动去系统的 PATH 环境变量中查找 `claude` 命令，必须通过上述方式显式配置。

---

## 三、完整配置示例

### `~/.ywcoder.json`（扩展配置）

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

### `~/.claude/settings.json`（CLI 配置）

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

## 四、验证配置

1. 修改配置后**重启 VSCode**
2. 在 YW Coder 聊天中输入 `/config` 查看当前生效的配置
3. 查看 YW Coder 输出面板确认 CLI 路径和模型连接状态

---

## 五、配置文件路径汇总

| 配置类型 | 文件路径 | 说明 |
|---------|---------|------|
| 扩展配置 | `~/.ywcoder.json` | YW Coder 扩展专属配置 |
| 全局设置 | `~/.claude/settings.json` | 用户级默认配置 |
| Profile 设置 | `~/.claude/settings.<name>.json` | 多配置方案 |
| 项目设置 | `<workspace>/.claude/settings.json` | 工作区共享配置 |
| 本地设置 | `<workspace>/.claude/settings.local.json` | 工作区本地配置（不提交到 git） |
