# PRD-5：前端 WebView 交互需求文档

> 版本：v1.0
> 日期：2026-04-22
> 状态：已交付 v1.0.0
> 依赖：PRD-1 整体产品需求

---

## 1. 模块概述

### 1.1 背景
YW Coder 的前端运行在 VSCode WebView 中，基于 Vue 3 + Vite 构建。前端负责：
- 会话列表展示与管理
- 聊天消息的发送、接收、渲染
- 设置页面的配置管理
- 与 Extension 侧的实时通信

### 1.2 目标
- 提供与原生应用媲美的交互体验
- 消息渲染支持多种内容类型，响应流畅
- 状态管理清晰，组件职责单一
- 通信层抽象统一，便于未来扩展（如 WebSocket）

---

## 2. 页面结构

### 2.1 页面路由
```
App.vue（根组件）
    ├── SessionsPage — 会话列表页
    ├── ChatPage — 聊天界面（主界面）
    └── SettingsPage — 设置面板
```

页面切换通过前端路由或状态驱动，不使用浏览器路由。

### 2.2 SessionsPage — 会话列表

#### FR-5.2.1 布局
- **顶部**：搜索框 + 新建会话按钮
- **中部**：会话列表（可滚动）
- **底部**：设置入口（可选）

#### FR-5.2.2 会话列表项
每个会话项显示：
- 会话名称（可点击编辑）
- 最后活动时间（相对时间，如"2 小时前"）
- 消息数量
- 删除按钮（hover 显示）

#### FR-5.2.3 交互
- **点击会话项**：切换到 ChatPage，加载该会话消息
- **点击新建按钮**：创建新会话并切换到 ChatPage
- **长按/右键**：弹出菜单（重命名、删除）
- **搜索**：实时过滤会话列表（fuse.js 模糊匹配）

### 2.3 ChatPage — 聊天界面

#### FR-5.3.1 布局
- **顶部**：会话标题 + 工具栏（清除、设置）
- **中部**：消息列表（可滚动，自动滚动到底部）
- **底部**：输入框 + 发送按钮

#### FR-5.3.2 消息列表
- 消息按时间顺序从上到下排列
- 用户消息右对齐，AI 消息左对齐
- 支持滚动加载历史消息（懒加载）
- 新消息到达时自动滚动到底部（用户手动上滚时暂停自动滚动）

#### FR-5.3.3 输入框
- 基于 Lexical 富文本编辑器
- 支持 Markdown 快捷输入
- 支持 `@mention` 触发文件搜索
- 支持粘贴图片（未来版本）
- Shift+Enter 换行，Enter 发送
- 发送后清空输入框，聚焦保持

#### FR-5.3.4 工具栏
- **清除会话**：清空当前会话消息（保留会话）
- **设置**：跳转到 SettingsPage
- **模型切换**：快速切换当前使用的 AI 模型

### 2.4 SettingsPage — 设置面板

#### FR-5.4.1 设置分类
| 标签页 | 内容 |
|--------|------|
| General（通用） | 语言、主题、通知、清理策略、本地 CLI 路径、默认环境变量 |
| Models（模型） | 模型选择、自定义模型、effortLevel、thinking 设置 |
| Agent（代理） | 输出风格、Agent 选择 |
| Permissions（权限） | 工具权限 allow/deny 列表 |
| Hooks | 命令钩子配置 |
| Sandbox（沙箱） | 沙箱控制策略 |
| Network（网络） | 代理、超时配置 |
| Environments（环境） | 环境变量管理 |
| MCP Servers | MCP 服务器增删改 |

#### FR-5.4.2 配置 Scope 切换
设置页面需支持在不同 Scope 间切换编辑：
- User（全局）
- Project（项目级）
- Local（本地，gitignored）

当前 Scope 在 UI 中清晰标识。

#### FR-5.4.3 配置即时生效
- 大部分配置修改后即时生效（通过 Transport 同步到 Extension）
- 环境变量、模型切换等需要重启 CLI 的配置给出提示

---

## 3. 消息渲染系统

### 3.1 消息组件架构
```
ChatPage
    └── MessageList
            └── MessageItem（每条消息）
                    ├── MessageHeader（角色、时间）
                    └── MessageRenderer（内容渲染调度器）
                            ├── TextBlockRenderer
                            ├── ToolUseBlockRenderer
                            ├── ToolResultBlockRenderer
                            ├── ThinkingBlockRenderer
                            ├── ImageBlockRenderer
                            └── CodeDiffBlockRenderer
```

### 3.2 TextBlock 渲染
- 使用 `marked` 解析 Markdown
- 代码块使用语法高亮（支持 50+ 语言）
- 代码块右上角显示复制按钮
- 链接可点击，在新标签页打开
- 支持表格、列表、引用等 Markdown 元素

### 3.3 ToolUseBlock 渲染
- 显示工具名和参数（折叠/展开）
- 加载状态：显示旋转图标
- 执行成功：显示绿色对勾
- 执行失败：显示红色错误图标

### 3.4 ToolResultBlock 渲染
- 默认折叠，点击展开
- 显示执行结果文本
- 错误结果用红色背景高亮
- 支持代码结果的高亮显示

### 3.5 ThinkingBlock 渲染
- 默认折叠，显示"Thinking..."或思考摘要
- 点击展开查看完整思考过程
- 使用灰色背景与正文区分
- 支持流式追加（思考过程中实时更新）

### 3.6 流式渲染
- AI 响应以 chunk 形式到达
- 每个 chunk 可能包含部分 ContentBlock
- 使用 `requestAnimationFrame` 节流渲染，避免 DOM 操作过载
- 当前消息尾部显示闪烁光标指示正在输入

---

## 4. 状态管理

### 4.1 状态分层
```
SessionStore（alien-signals）
    ├── sessions: Session[]       — 所有会话列表
    └── currentSessionId: string  — 当前会话 ID

Session（alien-signals，每个会话一个实例）
    ├── messages: Message[]       — 消息列表
    ├── status: SessionStatus     — 会话状态
    └── pendingToolCalls: ToolCall[] — 待处理工具调用

SettingsStore（Pinia）
    ├── settings: Settings        — 当前生效配置
    ├── activeScope: Scope        — 当前编辑的 Scope
    └── dirtyKeys: Set<string>    — 已修改但未保存的 key

AppContext（alien-signals）
    ├── toolContext: ToolContext      — 工具上下文
    ├── permissionRequests: []        — 待审批权限列表
    └── connectionStatus: 'connected' | 'disconnected'
```

### 4.2 响应式桥接
- alien-signals 作为底层响应式系统
- `@gn8/alien-signals-vue` 提供 Vue 3 集成
- Composable（`useSession()`、`useRuntime()`）桥接 alien-signals 与 Vue 组件

### 4.3 状态持久化
- 会话数据：通过 Extension 侧 SessionService 持久化到 JSONL
- 设置数据：通过 Extension 侧 ConfigurationService 持久化到 settings.json
- 前端不直接操作文件系统，所有持久化通过 Transport 请求 Extension 执行

---

## 5. 通信系统

### 5.1 传输层架构
```
WebView (Vue)
    └── VSCodeTransport
            ├── acquireVsCodeApi() — 获取 VSCode WebView API
            └── AsyncQueue — 消息队列与请求-响应匹配

Extension (TypeScript)
    └── VSCodeTransport
            └── WebViewService — 通过 vscode.Webview 发送/接收消息
```

### 5.2 消息协议
所有消息通过统一的 Message 格式传输：

```typescript
interface TransportMessage {
  id: string;           // 消息唯一 ID
  type: string;         // 消息类型
  payload: any;         // 消息体
  timestamp: number;    // 时间戳
}
```

### 5.3 消息类型

| 方向 | 类型 | 说明 |
|------|------|------|
| WV → Ext | `sendMessage` | 用户发送聊天消息 |
| WV → Ext | `updateSettings` | 更新配置 |
| WV → Ext | `approvePermission` | 审批权限请求 |
| WV → Ext | `loadSession` | 加载会话消息 |
| WV → Ext | `createSession` | 创建新会话 |
| WV → Ext | `deleteSession` | 删除会话 |
| Ext → WV | `messageChunk` | AI 响应流式块 |
| Ext → WV | `messageComplete` | AI 响应完成 |
| Ext → WV | `toolUse` | AI 发起工具调用 |
| Ext → WV | `toolResult` | 工具执行结果 |
| Ext → WV | `permissionRequest` | 请求用户审批 |
| Ext → WV | `sessionList` | 会话列表数据 |
| Ext → WV | `settingsUpdate` | 配置更新通知 |
| Ext → WV | `error` | 错误通知 |

### 5.4 请求-响应匹配
- AsyncQueue 维护待响应请求队列
- 每个请求分配唯一 ID
- 响应通过 ID 匹配到对应请求
- 超时未收到响应则 reject Promise

### 5.5 连接状态
- WebView 启动时尝试建立连接
- 连接断开时显示离线提示
- 支持自动重连（指数退避）

---

## 6. 组件规范

### 6.1 目录结构
```
src/webview/src/
├── App.vue                    # 根组件
├── main.ts                    # 入口
├── pages/
│   ├── SessionsPage.vue       # 会话列表页
│   ├── ChatPage.vue           # 聊天界面
│   └── SettingsPage.vue       # 设置面板
├── components/
│   ├── Messages/              # 消息渲染组件
│   │   ├── MessageItem.vue
│   │   ├── MessageRenderer.vue
│   │   ├── TextBlock.vue
│   │   ├── ToolUseBlock.vue
│   │   ├── ToolResultBlock.vue
│   │   ├── ThinkingBlock.vue
│   │   └── CodeBlock.vue
│   ├── Settings/              # 设置组件
│   │   ├── SettingsPanel.vue
│   │   ├── ScopeSelector.vue
│   │   └── PermissionEditor.vue
│   └── Common/                # 通用组件
│       ├── Button.vue
│       ├── Input.vue
│       └── Modal.vue
├── composables/               # Composable 函数
│   ├── useSession.ts
│   ├── useRuntime.ts
│   ├── useSettingsStore.ts
│   └── useKeyboardNavigation.ts
├── core/                      # 核心逻辑
│   ├── AppContext.ts
│   ├── ToolContext.ts
│   ├── PermissionRequest.ts
│   └── SettingsStore.ts
├── transport/                 # 传输层
│   ├── BaseTransport.ts
│   ├── VSCodeTransport.ts
│   └── AsyncQueue.ts
├── models/                    # 数据模型
│   ├── Message.ts
│   ├── ContentBlock.ts
│   ├── ContentBlockWrapper.ts
│   └── contentParsers.ts
├── types/                     # TypeScript 类型
│   ├── tool.ts
│   ├── attachment.ts
│   └── queue.ts
└── locales/                   # 国际化
    ├── index.ts
    ├── zh-CN.ts
    └── en-US.ts
```

### 6.2 UI 设计规范
- **设计系统**：基于 Tailwind CSS 4.x
- **组件库**：reka-ui（Headless UI）+ 自定义组件
- **动画**：motion-v（Vue 动画库）
- **图标**：@mdi/font + @vscode/codicons
- **主题**：支持深色/浅色模式，跟随 VSCode 主题

### 6.3 无障碍（A11y）
- 所有交互元素支持键盘导航
- 图片和图标提供 aria-label
- 颜色对比度符合 WCAG AA 标准
- 消息列表支持屏幕阅读器

---

## 7. 技术要求

### 7.1 依赖
| 包名 | 版本 | 用途 |
|------|------|------|
| vue | ^3.5.26 | 框架 |
| vite | ^8.0.3 | 构建工具 |
| @vitejs/plugin-vue | ^6.0.5 | Vue SFC 支持 |
| tailwindcss | ^4.1.18 | CSS 框架 |
| @tailwindcss/vite | ^4.1.18 | Tailwind Vite 插件 |
| reka-ui | ^2.8.0 | Headless UI 组件 |
| motion-v | ^1.7.4 | 动画库 |
| alien-signals | ^3.1.2 | 响应式系统 |
| @gn8/alien-signals-vue | ^0.1.1 | Vue 集成 |
| pinia | ^3.0.4 | 状态管理 |
| @vueuse/core | ^14.1.0 | 工具集 |
| marked | ^17.0.1 | Markdown 解析 |
| lexical | ^0.39.0 | 富文本编辑器 |
| lexical-vue | ^0.14.1 | Lexical Vue 绑定 |
| fuse.js | ^7.1.0 | 模糊搜索 |
| @mdi/font | ^7.4.47 | Material Design 图标 |
| @vscode/codicons | ^0.0.44 | VSCode 图标 |

### 7.2 构建配置
- **开发**：`vite dev --port 5173`，HMR 热重载
- **生产**：`vite build`，输出到 `dist/media/`
- **严格模式**：TypeScript strict，vue-tsc 类型检查

### 7.3 性能要求
| 指标 | 目标 |
|------|------|
| 首屏加载时间 | < 1s |
| 消息列表滚动 | 60fps |
| 输入框响应 | < 16ms |
| 搜索过滤 | < 100ms |
| 内存占用 | < 50MB |

---

## 8. 验收标准

### 8.1 页面功能
- [ ] SessionsPage 正确显示所有会话，支持搜索和排序
- [ ] 点击会话项正确切换到 ChatPage 并加载消息
- [ ] ChatPage 消息列表正确渲染用户和 AI 消息
- [ ] 输入框支持 Markdown 和 @mention
- [ ] SettingsPage 所有标签页可正常浏览和编辑
- [ ] 配置修改后即时同步到 Extension

### 8.2 消息渲染
- [ ] Markdown 文本正确解析渲染
- [ ] 代码块显示语法高亮和复制按钮
- [ ] ToolUse 块显示工具名和参数
- [ ] ToolResult 块默认折叠，点击展开
- [ ] Thinking 块默认折叠，支持流式更新
- [ ] 流式响应过程中 UI 保持流畅

### 8.3 通信
- [ ] 用户发送消息后 Extension 正确接收
- [ ] AI 响应流式块实时渲染到前端
- [ ] 权限审批请求正确弹出
- [ ] 用户审批结果正确回传到 Extension
- [ ] 连接断开时显示离线提示

### 8.4 状态管理
- [ ] 会话列表状态与 Extension 侧一致
- [ ] 当前会话切换后消息正确加载
- [ ] 设置修改后 SettingsStore 正确更新
- [ ] 页面刷新后状态不丢失（通过 Extension 侧恢复）

---

## 9. 相关文档
- [architecture.md](../architecture.md) — 前端架构图
- [API.md](../API.md) — DI Framework API
- [CCSettings.md](../CCSettings.md) — 设置系统参考
