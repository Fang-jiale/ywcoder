# YwCoder 改造计划

## 1. 品牌重塑
- ywcoder → YwCoder
- YW Coder → 云悟编程助手 / YwCoder
- 图标、logo 替换

## 2. 移除/替换 Claude/Anthropic 引用
- Claude → AI引擎 / 智能助手 / 云悟
- Anthropic → 模型提供商
- 保留功能，改名包装

## 3. 目录结构调整
```
src/services/claude/ → src/services/ai-engine/
ClaudeAgentService.ts → AIAgentService.ts
ClaudeSdkService.ts → AISdkService.ts
ClaudeSessionService.ts → SessionService.ts
```

## 4. 中文本地化清单
### 界面组件
- ChatInputBox.vue - 输入框提示
- PermissionRequestModal.vue - 权限确认弹窗
- ModeSelect.vue - 模式选择
- ButtonArea.vue - 按钮区域
- WaitingIndicator.vue - 等待提示

### 设置页面
- SettingsTabGeneral.vue - 常规设置
- SettingsTabModels.vue - 模型设置
- SettingsTabPermissions.vue - 权限设置
- SettingsTabEnvironments.vue - 环境设置
- SettingsTabMCPServers.vue - MCP服务器

### 消息文本
- PermissionRequest.ts - 权限请求文本
- Session.ts - 会话相关文本
- useSession.ts - 会话操作文本

### 后端服务
- handlers.ts - 处理器响应
- AIAgentService.ts - 服务日志
- AISdkService.ts - SDK服务

## 5. 配置文件
- package.json - 名称、描述
- README.md - 完整中文文档
- docs/*.md - 使用文档

## 6. 代码中的英文提示
- 所有 console.log/info/error
- 所有用户可见的字符串
- 错误提示信息
