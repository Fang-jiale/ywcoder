# PRD-3：会话管理与消息系统需求文档

> 版本：v1.0
> 日期：2026-04-22
> 状态：已交付 v1.0.0
> 依赖：PRD-1 整体产品需求

---

## 1. 模块概述

### 1.1 背景
YW Coder 的核心交互模式是多轮对话。用户与 AI Agent 的每一次交互构成一个**会话（Session）**，会话中包含多条按时间顺序排列的**消息（Message）**，每条消息由多个**内容块（ContentBlock）**组成。会话管理系统负责：
- 会话的创建、持久化、加载、删除
- 会话历史的摘要生成与检索
- 消息内容的序列化与反序列化
- 上下文窗口的管理与裁剪

### 1.2 目标
- 会话历史自动持久化，异常关闭后可恢复
- 支持数十个会话的列表管理，响应流畅
- 消息结构支持多种内容类型（文本、工具调用、工具结果、思考过程、图片）
- 上下文自动管理，避免超出模型窗口限制

---

## 2. 功能需求

### 2.1 会话管理

#### FR-3.1.1 会话创建
- **新建空会话**：用户点击"新建会话"按钮，创建无历史的新会话
- **基于当前会话创建**：支持从现有会话分支创建新会话（未来版本）
- **会话命名**：
  - 默认名称："新会话" 或基于第一条用户消息的摘要
  - 自动生成摘要：SessionService 在会话创建后异步生成简短描述
  - 用户可手动重命名

#### FR-3.1.2 会话持久化
- **存储格式**：JSONL（JSON Lines），每行一个消息对象
- **存储路径**：`~/.claude/sessions/<session-id>.jsonl`
- **自动保存策略**：
  - 每条 AI 响应完成后立即写入
  - 用户发送消息后追加写入
  - 采用追加写模式，避免全量重写
- **文件结构示例**：
```jsonl
{"role":"user","content":[{"type":"text","text":"帮我写一个 Python 函数"}],"timestamp":"2026-04-22T10:00:00Z"}
{"role":"assistant","content":[{"type":"text","text":"好的，为您生成如下代码..."}],"timestamp":"2026-04-22T10:00:05Z"}
```

#### FR-3.1.3 会话加载
- **启动加载**：扩展激活时，SessionService 扫描会话目录，加载所有历史会话
- **懒加载消息**：会话列表仅加载元数据（ID、名称、时间、摘要），消息内容在打开会话时按需加载
- **对话链重建**：从 JSONL 文件按顺序重建 Message 对象列表，恢复完整的对话上下文
- **加载性能**：50 个会话的列表加载时间 < 500ms

#### FR-3.1.4 会话删除
- **软删除**：删除会话时移至回收站目录（`~/.claude/sessions/.trash/`）
- **硬删除**：从回收站彻底删除，不可恢复
- **批量删除**：支持多选会话批量删除
- **自动清理**：根据 `cleanupPeriodDays` 配置，自动删除非活跃会话（0=立即删除）

#### FR-3.1.5 会话列表管理
- **排序方式**：
  - 按最后活动时间（默认，降序）
  - 按创建时间
  - 按名称字母序
- **搜索过滤**：支持按会话名称搜索（fuse.js 模糊匹配）
- **标签管理**：支持为会话打标签（未来版本）

#### FR-3.1.6 会话元数据
每个会话维护以下元数据：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | UUID 格式唯一标识 |
| `name` | string | 会话显示名称 |
| `summary` | string | AI 生成的会话摘要 |
| `createdAt` | DateTime | 创建时间 |
| `updatedAt` | DateTime | 最后活动时间 |
| `messageCount` | number | 消息总数 |
| `model` | string | 使用的模型 |

---

### 2.2 消息系统

#### FR-3.2.1 消息模型
每条消息（Message）包含：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 消息唯一标识 |
| `role` | `"user" \| "assistant"` | 发送者角色 |
| `content` | ContentBlock[] | 内容块数组 |
| `timestamp` | DateTime | 发送/接收时间 |
| `status` | `"sending" \| "streaming" \| "complete" \| "error"` | 消息状态 |

#### FR-3.2.2 内容块（ContentBlock）类型
支持以下 ContentBlock 类型：

| 类型 | 标识 | 说明 | 优先级 |
|------|------|------|--------|
| Text | `text` | 普通文本/Markdown | P0 |
| Tool Use | `tool_use` | AI 请求调用工具 | P0 |
| Tool Result | `tool_result` | 工具执行结果 | P0 |
| Thinking | `thinking` | AI 思考过程（可折叠） | P0 |
| Image | `image` | 图片输入/输出 | P1 |
| Code Diff | `code_diff` | 代码变更对比 | P1 |

#### FR-3.2.3 ContentBlockWrapper
每个 ContentBlock 由 ContentBlockWrapper 封装，提供：
- 唯一 ID 追踪
- 解析状态管理（原始/解析中/已解析）
- 渲染元数据（代码语言、工具名等）

#### FR-3.2.4 消息解析（contentParsers）
消息内容从前端传输到扩展侧时，需要经过解析器处理：
- **Markdown 解析**：使用 `marked` 库解析文本中的 Markdown
- **代码块提取**：识别 ``` 包裹的代码，提取语言标识
- **工具调用解析**：从结构化数据中提取工具名和参数
- **Diff 解析**：解析 `diff` / `patch` 格式内容

#### FR-3.2.5 流式消息处理
- AI 响应以 SSE chunk 形式到达
- 每个 chunk 可能包含部分 ContentBlock
- 前端实时追加到当前消息，实现打字机效果
- 流式过程中消息状态为 `streaming`，完成后变为 `complete`

#### FR-3.2.6 消息状态流转
```
User 发送消息
    │
    ▼
┌───────────┐    ┌───────────┐    ┌───────────┐
│ sending   │───▶│ streaming │───▶│ complete  │
└───────────┘    └───────────┘    └───────────┘
                      │
                      ▼
                 ┌───────────┐
                 │   error   │
                 └───────────┘
```

#### FR-3.2.7 消息编辑与重试
- **用户消息编辑**：支持修改已发送的用户消息，编辑后重新发送
- **AI 消息重试**：AI 响应出错或不满意时，可重新生成
- **分支对话**：编辑/重试后创建对话分支（未来版本）

---

### 2.3 上下文管理

#### FR-3.3.1 上下文组成
发送给 AI 的上下文包含：
1. **系统提示词**：固定系统角色定义
2. **对话历史**：当前会话的消息列表
3. **当前文件**：用户当前打开的文件内容
4. **选中代码**：用户在编辑器中选中的代码片段
5. **项目结构**：关键文件列表（通过 @mention 引入）
6. **工具定义**：可用工具的描述和参数 schema

#### FR-3.3.2 上下文窗口管理
- **Token 估算**：使用近似算法估算当前上下文的 token 数量
- **自动裁剪**：当上下文接近模型窗口上限时，自动裁剪早期消息
- **保留策略**：
  - 始终保留系统提示词
  - 优先保留最近 N 轮对话
  - 可配置保留的对话轮数

#### FR-3.3.3 @mention 机制
- 用户在输入框中输入 `@` 触发文件/符号搜索
- 支持模糊搜索项目中的文件
- 选中的文件内容作为上下文附加到当前消息

---

## 3. 数据模型

### 3.1 类图

```
┌─────────────────┐       ┌──────────────────┐
│   Session       │◄──────│  SessionStore    │
├─────────────────┤       ├──────────────────┤
│ - id: string    │       │ - sessions: Map   │
│ - name: string  │       │ - currentId: string│
│ - summary: string│      │                  │
│ - messages: []  │       │ + addSession()   │
│ - createdAt     │       │ + removeSession()│
│ - updatedAt     │       │ + setCurrent()   │
│ - messageCount  │       │ + loadAll()      │
├─────────────────┤       └──────────────────┘
│ + addMessage()  │
│ + getMessages() │
│ + generateSummary│
└─────────────────┘
         │
         │ 1:N
         ▼
┌─────────────────┐       ┌──────────────────┐
│    Message      │◄──────│ ContentBlock     │
├─────────────────┤       ├──────────────────┤
│ - id: string    │ 1:N   │ - type: string   │
│ - role: string  │       │ - content: any   │
│ - content: []   │       │ - id: string     │
│ - timestamp     │       │ - status: string │
│ - status        │       ├──────────────────┤
├─────────────────┤       │ TextBlock        │
│ + appendBlock() │       │ ToolUseBlock     │
│ + setStatus()   │       │ ToolResultBlock  │
└─────────────────┘       │ ThinkingBlock    │
                          │ ImageBlock       │
                          └──────────────────┘
```

### 3.2 存储格式（JSONL）

```typescript
interface SessionRecord {
  role: 'user' | 'assistant';
  content: ContentBlockJSON[];
  timestamp: string; // ISO 8601
}

interface ContentBlockJSON {
  type: 'text' | 'tool_use' | 'tool_result' | 'thinking' | 'image';
  // type-specific fields...
}
```

---

## 4. 技术要求

### 4.1 依赖
- `alien-signals`: 轻量级响应式状态管理
- `@gn8/alien-signals-vue`: Vue 3 集成
- `fuse.js`: 模糊搜索
- `marked`: Markdown 解析
- `lexical` / `lexical-vue`: 富文本编辑器（输入框）

### 4.2 关键实现文件
| 文件 | 职责 |
|------|------|
| `SessionService.ts` | Extension 侧会话管理：加载、保存、摘要生成 |
| `AIAgentService.ts` | 编排对话流程，调用 SDK，分发响应 |
| `SessionStore.ts` (WebView) | 前端会话列表状态管理 |
| `Session.ts` (WebView) | 前端单会话消息/状态管理 |
| `Message.ts` | 消息数据模型定义 |
| `ContentBlock.ts` | 内容块数据模型定义 |
| `ContentBlockWrapper.ts` | 内容块包装器 |
| `contentParsers.ts` | 消息内容解析器 |

### 4.3 性能要求
| 场景 | 目标 |
|------|------|
| 加载 50 个会话列表 | < 500ms |
| 打开单个会话（100 条消息） | < 300ms |
| 消息追加保存 | < 50ms |
| 会话搜索 | < 100ms |
| 流式渲染帧率 | > 15fps |

---

## 5. 验收标准

### 5.1 会话管理
- [ ] 新建会话后出现在会话列表顶部
- [ ] 会话名称自动基于第一条消息生成摘要
- [ ] 关闭 VSCode 后重新打开，会话列表完整恢复
- [ ] 删除会话后文件移至 trash 目录
- [ ] 按最后活动时间排序正确
- [ ] 搜索会话名称支持模糊匹配

### 5.2 消息系统
- [ ] 用户发送消息后状态为 `sending`，AI 开始响应后变为 `streaming`
- [ ] AI 响应完成后状态变为 `complete`
- [ ] 消息中的 Text、ToolUse、ToolResult、Thinking 正确渲染
- [ ] Markdown 文本正确解析并渲染
- [ ] 代码块显示语法高亮
- [ ] 流式响应过程中 UI 不卡顿

### 5.3 持久化
- [ ] 每条消息追加写入 JSONL 文件
- [ ] JSONL 文件格式正确，可人工阅读
- [ ] 异常关闭后，已保存的消息不丢失
- [ ] 会话元数据（名称、摘要、时间）正确维护

---

## 6. 相关文档
- [architecture.md](../architecture.md) — 整体架构
- [API.md](../API.md) — DI Framework API
- [USAGE.md](../USAGE.md) — DI 框架使用指南
