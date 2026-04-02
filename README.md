# Kimi - 智能编程助手

Kimi 是一款专为开发者打造的智能编程助手，深度集成于 VSCode，提供全方位的代码编写支持。

![VS Code Extension](https://img.shields.io/badge/VS%20Code-Extension-blue?logo=visual-studio-code)
![Built with TypeScript](https://img.shields.io/badge/Built%20with-TypeScript-blue?logo=typescript)

## 产品概述

Kimi 将先进的 AI 能力融入 VSCode 编辑器，为开发者提供智能化的编程体验。无论是代码补全、错误排查、重构建议，还是复杂逻辑分析，Kimi 都能提供专业、高效的支持。

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

### 方式一：从 VSIX 安装

1. 下载最新版本的 `kimi-*.vsix` 文件
2. 在 VSCode 中打开扩展面板（`Ctrl+Shift+X`）
3. 点击右上角的 `...`，选择 **"从 VSIX 安装..."**
4. 选择下载的 `.vsix` 文件

### 方式二：源码构建

```bash
# 克隆仓库
git clone https://github.com/Fang-jiale/kimi.git
cd kimi

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
- Vite 开发服务器（端口 5173）用于 webview
- esbuild 监听器用于扩展

### 调试配置

在 VSCode 中打开项目，使用以下调试配置：

- **Run Extension** - 完整构建模式，适合生产环境测试
- **Run Extension (HMR)** - 热重载模式，开发时迭代更快

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

1. 安装后，在 VSCode 左侧活动栏点击 **Kimi** 图标
2. 点击 **"新建会话"** 开始对话
3. 在输入框中输入问题或需求，Kimi 将实时响应
4. 对于涉及文件修改的操作，Kimi 会请求确认后执行

## 系统要求

- VSCode >= 1.98.0
- Node.js >= 18.0.0

## 配置说明

Kimi 的配置文件位于：
- 扩展配置：`~/.kimi.json`
- AI 引擎配置：`~/.claude/settings.json`

可在 VSCode 设置中搜索 `kimi` 进行可视化配置。

## 技术架构

Kimi 采用模块化架构设计：
- **前端界面** - Vue 3 + Vite，流畅的交互体验
- **扩展核心** - TypeScript + VSCode API，深度集成编辑器
- **AI 引擎** - 自研智能分析引擎，支持多模型接入

## 开源协议

AGPL-3.0

---

**Kimi** - 让编程更智能，让开发更高效
