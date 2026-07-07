# YwCoder 原生 VS Code 集成改造计划

## Context

当前 YwCoder 把所有交互（聊天、会话列表、设置、状态）都塞在一个自定义 WebView 里，相当于在 VS Code 内部套了一个独立应用。这种方式虽然可控，但存在明显问题：

- 不符合 VS Code 用户的操作习惯（所有东西都要在侧边栏 WebView 里完成）。
- 无法利用 VS Code 原生能力：Tree View、Settings UI、Status Bar、Diff Editor、Command Palette、Quick Pick 等。
- 启动慢、焦点管理复杂、主题/样式需要额外适配。
- 用户需要在 VS Code 和一个"应用内的应用"之间频繁切换心智模型。

本计划的目标是把 YwCoder 从"内置扩展里的独立 WebView 应用"改造成"深度集成在 VS Code 原生工作流里的一组功能"：尽量用 VS Code 原生 API 承载交互，只在必要时保留 WebView。

---

## 设计原则

1. **原生优先**：能用 VS Code 原生 API 实现的功能，就不用 WebView。
2. **WebView 最小化**：WebView 只保留真正需要富文本/复杂交互的部分（如多轮对话流、工具结果渲染）。
3. **渐进改造**：不一次性推翻重来，按"用户路径"逐步迁移。
4. **保持后端稳定**：`AIAgentService`、通道管理、SDK 通信逻辑尽量不动，只改前端呈现层。

---

## 一、会话历史：从 WebView 页面到原生 Tree View

### 现状
`SessionsPage.vue` 在 WebView 内以卡片列表展示历史会话，用户点击后切换回 `ChatPage`。

### 改造
- 在 `package.json` 新增 `ywcoder.sessions` Tree View，挂载到 `ywcoder-chat-sidebar` 容器或独立的 `ywcoder-panel` 容器。
- 实现 `SessionTreeDataProvider`：
  - 根节点按时间分组（今天 / 昨天 / 更早）。
  - 节点显示会话摘要、最后修改时间、模型图标。
  - 右键菜单支持 `重命名`、`删除`、`在新标签打开`。
- 点击节点时：
  - 若当前有 WebView 侧边栏，发送 `external_action` 打开会话。
  - 若无 WebView，可创建一个只读虚拟文档 `ywchat://session/{id}` 展示历史，或聚焦到聊天 WebView。

### 收益
- 符合 VS Code 用户对侧边栏的预期。
- 支持拖拽、固定、折叠、搜索（Tree View 内置过滤）。
- 不再需要在 WebView 内维护会话路由。

### 涉及文件
- `package.json`
- 新建 `src/services/sessionTreeDataProvider.ts`
- `src/extension.ts`
- `src/services/ai-engine/handlers/handlers.ts`（会话列表查询复用现有 `list_sessions`）

---

## 二、设置：从 WebView 编辑器到原生 Settings UI

### 现状
`SettingsPage.vue` 是一个完整的 WebView 编辑器页面，包含十几个配置 Tab。`ywcoder.openSettings` 打开 WebView 面板。

### 改造
- 把所有设置项迁移到 `contributes.configuration`：
  - `ywcoder.selectedModel`
  - `ywcoder.thinkingLevel`
  - `ywcoder.permissionMode`
  - `ywcoder.environmentVariables`
  - 模型列表、Profiles、Plugins、MCP servers、Hooks、Slash commands 等。
- 对复杂配置（如 Profiles、MCP servers），提供：
  - 原生 Settings UI 支持的 `editInSettingsJson` 链接。
  - 命令 `ywcoder.editProfiles` 打开对应 JSON 配置文件。
- `ywcoder.openSettings` 改为 `vscode.commands.executeCommand('workbench.action.openSettings', 'ywcoder')`。
- 删除 `SettingsPage.vue` 及对应的 editor-hosted WebView 路由。

### 收益
- 用户使用熟悉的 Settings UI。
- 自动支持设置同步、工作区/用户作用域、搜索、默认值提示。
- 大幅减少 WebView 代码量。

### 涉及文件
- `package.json`
- `src/extension.ts`
- `src/services/configurationService.ts`
- `src/webview/src/App.vue`
- 删除 `src/webview/src/pages/SettingsPage.vue`

---

## 三、状态与模型：新增 Status Bar Item

### 现状
没有状态栏项，模型、连接状态、权限模式全部在 WebView 内部显示。

### 改造
- 新增 `StatusBarService`，创建 `StatusBarItem`：
  - 左侧显示当前模型名称和连接状态图标（在线 / 离线 / 忙碌）。
  - 右侧或 tooltip 显示当前权限模式、thinking 等级。
  - 点击后弹出 QuickPick：切换模型、权限模式、打开设置、聚焦聊天。
- 在 `AIAgentService` 状态变化时更新状态栏。

### 收益
- 用户随时能看到运行状态。
- 点击即可快速切换模型/模式，无需展开侧边栏。

### 涉及文件
- 新建 `src/services/statusBarService.ts`
- `src/services/serviceRegistry.ts`
- `src/extension.ts`
- `src/services/ai-engine/AIAgentService.ts`

---

## 四、快速提问：Command Palette + InputBox

### 现状
用户必须打开侧边栏 WebView 才能在输入框里提问。

### 改造
- 新增命令 `ywcoder.ask`：
  - 调用 `vscode.window.createInputBox` 或 `showInputBox`，提示用户输入问题。
  - 支持 `@` 文件引用：在 InputBox 中输入 `@` 时触发 `showQuickPick` 选择工作区文件。
  - 支持 `/` slash commands：输入 `/` 时触发 QuickPick 选择命令。
- 新增命令 `ywcoder.askSelection`：保持现有功能，但改为通过原生 InputBox 输入追问，或直接把选中内容发送到当前会话。
- 输入完成后，可以选择：
  - 在当前侧边栏 WebView 会话中发送。
  - 在新创建的 `Virtual Document` 或 `OutputChannel` 中显示回复。

### 收益
- 用户不用离开当前编辑器即可向 AI 提问。
- Command Palette 入口让功能更易发现。

### 涉及文件
- `package.json`
- `src/extension.ts`
- `src/services/ai-engine/handlers/handlers.ts`（复用 `io_message` / `launch_ywcoder`）

---

## 五、结果展示：用原生编辑器替代部分 WebView 渲染

### 现状
LLM 的工具调用结果、代码块、生成的文件内容都在 WebView 里渲染。

### 改造
- **代码文件生成 / 编辑**：
  - 使用 VS Code `TextDocument` / `WorkspaceEdit` 直接修改文件。
  - Diff 使用原生 `vscode.diff` 命令打开 Diff Editor，而不是 WebView 内自定义 diff。
- **工具执行结果**：
  - 简单结果用 `OutputChannel`（`YwCoder` 输出通道）显示。
  - 复杂结果用临时 `TextDocument` / `Untitled` 文件打开。
- **搜索类工具（Glob/Grep）**：
  - 结果直接写入 `Search` 面板或打开结果列表 QuickPick。
- **保留 WebView 的场景**：
  - 多轮对话流、富文本消息（Markdown、代码块高亮、折叠工具结果）。
  - 工具权限请求弹窗（`PermissionRequestModal`）。

### 收益
- 编辑文件时使用原生编辑器，支持语法高亮、IntelliSense、保存等。
- Diff 使用原生 Diff Editor，用户熟悉且功能完整。
- 输出通道保留运行日志，便于回溯。

### 涉及文件
- `src/services/ai-engine/handlers/handlers.ts`（`open_file`、`open_diff`、`exec` 等）
- `src/services/editorService.ts`（如有）
- `src/webview/src/components/Messages/blocks/ToolBlock.vue`

---

## 六、聊天界面：WebView 职责最小化

### 现状
`ChatPage.vue` 负责会话标签、消息列表、输入框、附件、权限弹窗等所有聊天相关 UI。

### 改造
- 保留一个轻量的聊天 WebView，但只负责：
  - 消息历史渲染（用户 / 助手 / 系统消息）。
  - 流式输出展示。
  - 工具结果折叠/展开。
- 把以下功能迁出 WebView：
  - 会话标签 → Tree View 或 StatusBar 菜单。
  - 输入框 → 侧边栏底部放一个原生 `InputBox` 或保留最小化输入；复杂输入通过 Command Palette。
  - 附件 → 支持拖拽文件到侧边栏 / 通过命令添加附件。
- 可选：探索用 `Virtual Document` + Decorations 渲染对话，完全不用 WebView（长期方向）。

### 收益
- WebView 代码量大幅减少，启动更快。
- 聊天功能更贴合 VS Code 原生体验。

### 涉及文件
- `src/webview/src/pages/ChatPage.vue`
- `src/webview/src/components/ChatInputBox.vue`
- `src/services/webViewService.ts`

---

## 七、命令与快捷键：补全原生命令体系

### 现状
命令少，无快捷键，且无图标/分组。

### 改造
- 新增/完善命令：
  - `ywcoder.showChat`
  - `ywcoder.newChat`
  - `ywcoder.stopGeneration`
  - `ywcoder.ask`（快速提问）
  - `ywcoder.askSelection`
  - `ywcoder.sendFileToChat`
  - `ywcoder.openSettings`
  - `ywcoder.openSessionHistory`
  - `ywcoder.switchModel`
  - `ywcoder.switchPermissionMode`
- 在 `package.json` 增加 `keybindings` 默认值。
- 命令标题使用 `package.nls.json` 国际化占位符。

### 收益
- 所有操作都能通过键盘和 Command Palette 触达。

### 涉及文件
- `package.json`
- `package.nls.json`
- `src/extension.ts`

---

## 八、移除启动打扰行为

### 现状
- 启动 2 秒后强制聚焦侧边栏。
- `resolveWebviewView` 中调用 `webviewView.show()` 强制展开。
- 首次激活强制覆盖用户主题、activityBar、menuBar。

### 改造
- 删除所有强制聚焦/展开/主题覆盖逻辑。
- 扩展激活后只在状态栏显示一个安静的图标。
- 用户需要时通过命令或状态栏打开 YwCoder。

### 涉及文件
- `src/extension.ts`
- `src/services/webViewService.ts`
- `src/browser.ts`

---

## 九、渐进实施顺序

### 阶段 1：基础设施与最小打扰（1-2 周）
1. 移除强制启动聚焦、主题覆盖、`webviewView.show()`。
2. 新增 StatusBarItem，显示连接/模型状态。
3. 命令标题国际化，增加默认快捷键。
4. `openSettings` 改为打开原生 Settings UI。

### 阶段 2：会话与设置原生化（2-3 周）
5. 新增 `ywcoder.sessions` Tree View 替代 `SessionsPage.vue`。
6. 把设置项迁移到 `contributes.configuration`，删除 `SettingsPage.vue`。
7. 修复 `getWebView()` 多 WebView 选择问题。

### 阶段 3：提问与结果展示原生化（2-3 周）
8. 新增 `ywcoder.ask` 命令，使用 `InputBox` / `QuickPick` 快速提问。
9. `open_diff` 改为使用原生 `vscode.diff`。
10. `exec` / 工具结果使用 `OutputChannel` 或临时文档展示。

### 阶段 4：聊天 WebView 瘦身（3-4 周）
11. 把会话标签、输入框附件等功能迁出 WebView。
12. 评估是否用 Virtual Document 替代聊天 WebView（长期可选）。

---

## 十、验证方式

- `npm run typecheck:all` / `npm run lint` 通过。
- Extension Host 启动后：
  - 不再自动展开/聚焦侧边栏。
  - 状态栏显示 YwCoder 图标和当前模型/状态。
  - `Ctrl/Cmd+Shift+P` 输入 YwCoder 能看到完整命令列表。
  - `ywcoder.openSettings` 打开 VS Code 原生设置并定位到 ywcoder。
  - 侧边栏 Tree View 显示历史会话，点击可在聊天 WebView 打开。
  - `ywcoder.ask` 弹出 InputBox，输入问题后能在 WebView 收到回复。
  - LLM 生成的代码 diff 用原生 Diff Editor 打开。
- 运行现有测试，确保后端消息协议和 AI 通道不受影响。

---

## 总结

核心思路不是做一个"更好的 WebView 应用"，而是让 YwCoder 像 VS Code 原生功能一样工作：状态在状态栏、设置在 Settings UI、历史在 Tree View、提问在 Command Palette/InputBox、编辑在编辑器/Diff。WebView 只保留无法被原生 API 替代的聊天流渲染。这样用户体验会更自然，维护成本也会降低。
