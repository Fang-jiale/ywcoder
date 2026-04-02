# YW Coder - 智能编程助手

YW Coder 是一款专为开发者打造的智能编程助手，深度集成于 VSCode，提供全方位的代码编写支持。

![VS Code Extension](https://img.shields.io/badge/VS%20Code-Extension-blue?logo=visual-studio-code)
![Built with TypeScript](https://img.shields.io/badge/Built%20with-TypeScript-blue?logo=typescript)

## 产品概述

YW Coder 将先进的 AI 能力融入 VSCode 编辑器，为开发者提供智能化的编程体验。无论是代码补全、错误排查、重构建议，还是复杂逻辑分析，YW Coder 都能提供专业、高效的支持。

## 核心功能

- 🤖 **智能对话界面** - 与 AI 助手进行自然语言交互，快速获取编程帮助
- 📝 **会话管理** - 保存对话历史，支持多会话切换和上下文追溯
- 🔧 **智能文件操作** - 自动分析代码结构，提供智能重构建议
- 💻 **终端集成** - 支持在对话中直接执行命令，提升开发效率
- 🔐 **权限管理** - 细粒度的工具权限控制，确保安全可控
- 🌐 **多模型支持** - 兼容多种 AI 模型，灵活选择最适合的方案
- ⚡ **实时响应** - 流式输出，即时反馈，流畅的交互体验
- 🎨 **语法高亮** - 专业的代码渲染，支持多种编程语言

## 安装指南

### 方式一：从 VSIX 安装（推荐）

1. 访问 [Releases 页面](https://github.com/Fang-jiale/ywcoder/releases) 下载最新版本的 `.vsix` 文件
2. 在 VSCode 中打开扩展面板（`Ctrl+Shift+X`）
3. 点击右上角的 `...`，选择 **"从 VSIX 安装..."**
4. 选择下载的 `.vsix` 文件完成安装

### 方式二：从源码构建

```bash
# 克隆仓库
git clone https://github.com/Fang-jiale/ywcoder.git
cd ywcoder

# 安装依赖
npm install

# 构建扩展
npm run build

# 打包为 VSIX
npm run package
```

## 开发调试

### 启动开发模式

```bash
npm run dev
```

这将同时启动：
- Vite 开发服务器（端口 5173）用于 webview 界面
- esbuild 监听器用于扩展核心

### 调试配置

在 VSCode 中打开项目，使用以下调试配置：

#### Run Extension（运行扩展）
完整构建模式，不带热重载。启动前会从头构建扩展，适合生产环境测试。
- 按 `F5` 或从调试面板选择 "Run Extension"

#### Run Extension (HMR)（热重载模式）
开发模式，webview 支持热模块替换。webvew 的更改会自动重新加载，无需重启扩展，开发时迭代更快。
- 从调试面板选择 "Run Extension (HMR)"

### 常用命令

```bash
# 构建全部
npm run build

# 仅构建扩展
npm run build:extension

# 仅构建 webview
npm run build:webview

# 运行测试
npm run test

# 类型检查
npm run typecheck:all
```

## 使用说明

1. 安装完成后，在 VSCode 左侧活动栏点击 **YW Coder** 图标
2. 点击 **"新建会话"** 开始与 AI 助手对话
3. 在输入框中描述你的需求或问题
4. YW Coder 将分析上下文并给出专业建议
5. 对于涉及文件修改的操作，YW Coder 会在执行前请求确认

### 快捷操作

- `/clear` - 清空当前会话
- `/help` - 查看帮助信息
- 选中代码后右键，选择 "发送到 YW Coder" 进行针对性分析

## 系统要求

- VSCode >= 1.98.0
- Node.js >= 18.0.0

## 配置说明

YW Coder 的配置分为两个层级：

### 扩展配置（`~/.ywcoder.json`）
包含扩展本身的设置，如主题、快捷键、默认模型等。

### AI 引擎配置（`~/.claude/settings.json`）
包含 AI 引擎的高级配置，如自定义提示词、工具权限、MCP 服务器等。

### 可视化配置
在 VSCode 设置中搜索 `ywcoder` 可进行可视化配置。

## 技术架构

YW Coder 采用模块化、分层架构设计：

- **前端界面层** - Vue 3 + Vite，提供流畅的交互体验
- **扩展核心层** - TypeScript + VSCode API，深度集成编辑器能力
- **AI 引擎层** - 自研智能分析引擎，支持多模型灵活接入
- **工具执行层** - 安全沙箱环境，确保代码执行安全可靠

## 常见问题

**Q: YW Coder 支持哪些编程语言？**
A: YW Coder 支持所有主流编程语言，包括但不限于 JavaScript、TypeScript、Python、Java、Go、Rust、C++ 等。

**Q: 如何更新 YW Coder？**
A: 下载新版本 `.vsix` 文件后，在 VSCode 扩展面板中选择 "从 VSIX 安装" 即可覆盖更新。

**Q: 是否支持离线使用？**
A: YW Coder 需要连接 AI 服务，暂时不支持完全离线使用。

## 开源协议

YW Coder 基于 AGPL-3.0 协议开源。

---

**YW Coder** - 让编程更智能，让开发更高效

如有问题或建议，欢迎提交 [Issue](https://github.com/Fang-jiale/ywcoder/issues)。
