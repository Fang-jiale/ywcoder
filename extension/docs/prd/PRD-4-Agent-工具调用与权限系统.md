# PRD-4：Agent 工具调用与权限系统需求文档

> 版本：v1.0
> 日期：2026-04-22
> 状态：已交付 v1.0.0
> 依赖：PRD-1 整体产品需求

---

## 1. 模块概述

### 1.1 背景
YW Coder 区别于普通 Chat 工具的核心能力在于 **Agent 模式**：AI 不仅能给出建议，还能自主决策、调用工具、执行操作。这一能力基于 Anthropic 的 Tool Use（Function Calling）机制实现。

本模块涵盖：
- **工具系统**：定义 AI 可调用的工具集合及其参数 schema
- **请求处理**：接收 AI 的工具调用请求，调度到对应 Handler 执行
- **权限管理**：细粒度控制每项工具的执行权限，确保安全可控

### 1.2 目标
- AI 可自主完成文件读写、命令执行、网络搜索等操作
- 每项操作都经过用户授权的审批流程
- 权限策略可配置，支持自动批准常用操作
- 工具执行结果正确回传给 AI，形成完整闭环

---

## 2. 功能需求

### 2.1 工具系统

#### FR-4.1.1 内置工具清单

| 工具名 | 功能 | 风险等级 | 默认权限 |
|--------|------|---------|---------|
| `Read` | 读取文件内容 | 低 | 允许 |
| `Edit` | 编辑文件内容 | 高 | 询问 |
| `Write` | 写入/创建文件 | 高 | 询问 |
| `Bash` | 执行终端命令 | 极高 | 询问 |
| `WebFetch` | 获取网页内容 | 中 | 询问 |
| `WebSearch` | 网络搜索 | 中 | 询问 |

#### FR-4.1.2 工具定义格式
每个工具通过 Zod schema 定义参数结构：

```typescript
const ReadTool = {
  name: 'Read',
  description: '读取指定文件的内容',
  parameters: z.object({
    file_path: z.string().describe('文件的绝对路径'),
    offset: z.number().optional().describe('起始行号'),
    limit: z.number().optional().describe('读取行数'),
  }),
};

const BashTool = {
  name: 'Bash',
  description: '在终端中执行命令',
  parameters: z.object({
    command: z.string().describe('要执行的命令'),
    timeout: z.number().optional().describe('超时时间（秒）'),
  }),
};
```

#### FR-4.1.3 工具调用流程
```
┌─────────┐     ┌──────────┐     ┌───────────┐     ┌──────────┐
│  User   │────▶│   AI     │────▶│ Tool Use  │────▶│ Handler  │
│ Request │     │  Model   │     │  Request  │     │ Execute  │
└─────────┘     └──────────┘     └───────────┘     └────┬─────┘
                                                        │
                              ┌─────────────────────────┘
                              ▼
┌─────────┐     ┌──────────┐     ┌───────────┐     ┌──────────┐
│  User   │◀────│  AI      │◀────│ Tool Result│◀────│  Return  │
│ Response│     │  Model   │     │  (next turn)│     │  Result  │
└─────────┘     └──────────┘     └───────────┘     └──────────┘
```

#### FR-4.1.4 工具执行结果格式
工具执行结果作为 `tool_result` ContentBlock 回传给 AI：

```typescript
interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;  // 对应 tool_use 的 ID
  content: string;      // 执行结果的文本描述
  is_error?: boolean;   // 是否执行出错
}
```

#### FR-4.1.5 MCP 工具扩展（实验性）
支持通过 Model Context Protocol (MCP) 接入外部工具服务器：
- 读取 `~/.ywcoder.json` 中的 `mcpServers` 配置
- 通过 `@modelcontextprotocol/sdk` 连接 MCP 服务器
- MCP 提供的工具动态注入到可用工具列表

---

### 2.2 请求处理系统

#### FR-4.2.1 Handler 架构
工具调用请求通过 Handler 分派执行：

```
AIAgentService
    │
    ├──▶ Handler: 文件操作 (Read/Edit/Write)
    │       └──▶ FileSystemService
    │
    ├──▶ Handler: 终端命令 (Bash)
    │       └──▶ TerminalService
    │
    ├──▶ Handler: 会话管理
    │       └──▶ SessionService
    │
    ├──▶ Handler: 设置相关
    │       └──▶ ConfigurationService
    │
    └──▶ Handler: 工具调用分发
            └──▶ 各具体 Handler
```

#### FR-4.2.2 Handler 注册
Handler 在 `handlers.ts` 中集中注册，支持按消息类型路由：

```typescript
export interface RequestHandler {
  canHandle(request: AIRequest): boolean;
  handle(request: AIRequest, context: HandlerContext): Promise<HandlerResult>;
}
```

#### FR-4.2.3 异步执行
- 工具调用在 Extension 侧异步执行，不阻塞 UI
- 执行过程中前端显示加载状态
- 执行完成后通过 Transport 推送结果到前端

#### FR-4.2.4 错误处理
| 场景 | 行为 |
|------|------|
| 文件不存在 | 返回错误信息，`is_error: true` |
| 命令执行失败 | 返回 stderr 输出，`is_error: true` |
| 权限被拒绝 | 返回权限错误，提示用户调整配置 |
| 超时 | 返回超时错误，终止命令进程 |

---

### 2.3 权限管理系统

#### FR-4.3.1 权限粒度
权限控制按 **工具 + 命令模式** 两个维度：

| 维度 | 示例 |
|------|------|
| 工具级 | `Read`、`Edit`、`Write`、`Bash` |
| 命令模式 | `Bash(git *)`、`Bash(npm *)`、`Bash(curl *)` |

#### FR-4.3.2 权限模式
每个工具/模式可配置以下权限级别：

| 级别 | 行为 |
|------|------|
| `allow` | 自动批准，无需提示 |
| `ask` | 每次执行前弹窗询问用户 |
| `deny` | 直接拒绝，不允许执行 |

#### FR-4.3.3 配置方式
**配置文件 `~/.claude/settings.json`**：
```json
{
  "permissions": {
    "allow": ["Read", "Bash(git *)", "Bash(npm *)"],
    "deny": ["WebFetch", "WebSearch", "Bash(curl *)"]
  }
}
```

**规则解释**：
- 不在 `allow` 也不在 `deny` 中的工具 → 默认 `ask`
- `allow` 列表中的工具 → 自动批准
- `deny` 列表中的工具 → 直接拒绝
- 命令模式匹配使用通配符 `*`

#### FR-4.3.4 前端权限审批 UI
当工具调用需要用户审批时：

1. **弹窗提示**：显示工具名、参数、风险等级
2. **操作选项**：
   - **允许一次**：仅批准当前调用
   - **始终允许**：将该工具加入 `allow` 列表
   - **拒绝**：拒绝当前调用
   - **始终拒绝**：将该工具加入 `deny` 列表
3. **倒计时自动拒绝**：10 秒内无响应自动拒绝（可配置）

#### FR-4.3.5 权限审批流程
```
AI 发起 tool_use
    │
    ▼
检查 permissions.allow
    │ 包含 ──▶ 直接执行
    │ 不包含
    ▼
检查 permissions.deny
    │ 包含 ──▶ 返回拒绝错误
    │ 不包含
    ▼
向前端发送 PermissionRequest
    │
    ▼
用户在前端选择 Allow / Deny
    │
    ├── Allow Once ──▶ 执行工具，返回结果
    ├── Always Allow ──▶ 更新配置，执行工具
    ├── Deny ──▶ 返回拒绝错误
    └── Always Deny ──▶ 更新配置，返回拒绝错误
```

#### FR-4.3.6 PermissionRequest 数据结构
```typescript
interface PermissionRequest {
  id: string;                    // 请求唯一 ID
  toolName: string;              // 工具名
  params: Record<string, any>;   // 工具参数
  riskLevel: 'low' | 'medium' | 'high' | 'extreme';
  timestamp: Date;
  timeout: number;               // 超时时间（秒）
}
```

---

### 2.4 安全沙箱

#### FR-4.4.1 命令执行沙箱
- Bash 命令在 VSCode 内置终端中执行
- 不创建新的 shell 进程，复用现有终端环境
- 命令超时后自动发送 `SIGTERM`，若仍不终止则发送 `SIGKILL`

#### FR-4.4.2 文件操作边界
- 文件路径支持绝对路径和相对路径（相对于工作区根目录）
- 默认不允许访问工作区外的文件（可配置放松）
- Write 操作覆盖已有文件前需额外确认

#### FR-4.4.3 网络访问控制
- WebFetch/WebSearch 默认 deny
- 允许后可配置域名白名单
- 内部网络地址（192.168.x.x、10.x.x.x）需额外审批

---

## 3. 技术要求

### 3.1 依赖
- `@anthropic-ai/claude-agent-sdk`: Agent SDK，提供 Tool Use 能力
- `@anthropic-ai/sdk`: 底层 SDK
- `zod`: 工具参数 schema 定义与校验
- VSCode API: `Terminal`、`workspace`、`TextEditor`

### 3.2 关键实现文件
| 文件 | 职责 |
|------|------|
| `AIAgentService.ts` | Agent 核心编排器，管理对话循环和工具调用 |
| `handlers.ts` | 请求处理器注册与路由 |
| `handlers/types.ts` | Handler 接口定义 |
| `FileSystemService.ts` | 文件读写操作 |
| `TerminalService.ts` | 终端命令执行 |
| `PermissionRequest.ts` (WebView) | 前端权限审批组件逻辑 |
| `AppContext.ts` (WebView) | 应用上下文，维护待审批权限列表 |

### 3.3 性能要求
| 场景 | 目标 |
|------|------|
| 工具调用请求到 Handler 分派 | < 10ms |
| Read 小文件 (< 1KB) | < 50ms |
| Bash 简单命令 | < 500ms |
| 权限审批弹窗响应 | < 100ms |
| 工具结果回传 AI | < 50ms |

---

## 4. 验收标准

### 4.1 工具调用
- [ ] AI 请求 Read 工具时，正确读取文件内容并返回
- [ ] AI 请求 Edit 工具时，正确修改文件并返回变更摘要
- [ ] AI 请求 Bash 工具时，在终端执行命令并返回输出
- [ ] AI 请求 WebFetch 时，获取网页内容并返回
- [ ] 工具执行出错时，`is_error: true` 正确设置
- [ ] 工具结果正确作为上下文回传给 AI，AI 能基于结果继续对话

### 4.2 权限管理
- [ ] `allow` 列表中的工具自动执行，不弹窗
- [ ] `deny` 列表中的工具直接拒绝，返回错误
- [ ] 未配置的工具弹窗询问用户
- [ ] 用户选择"允许一次"后，仅当前调用通过
- [ ] 用户选择"始终允许"后，配置写入 settings.json
- [ ] 权限审批弹窗显示工具名、参数、风险等级
- [ ] 超时后自动拒绝

### 4.3 安全性
- [ ] 终端命令超时后自动终止
- [ ] 文件写操作覆盖前需额外确认
- [ ] 权限配置变更即时生效（无需重启）
- [ ] 审计日志记录所有工具调用和审批决策

---

## 5. 相关文档
- [CCSettings.md](../CCSettings.md) — 权限配置完整参考
- [architecture.md](../architecture.md) — AI 引擎架构
- [API.md](../API.md) — 服务接口定义
