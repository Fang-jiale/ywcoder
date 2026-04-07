# YwCoder - 云悟编程助手

YwCoder（云悟编程助手）是一款自主研发的智能编程助手，深度集成于 VSCode，为开发者提供全方位的 AI 驱动编程支持。

![VS Code Extension](https://img.shields.io/badge/VS%20Code-Extension-blue?logo=visual-studio-code)
![Built with TypeScript](https://img.shields.io/badge/Built%20with-TypeScript-blue?logo=typescript)
![Version](https://img.shields.io/badge/Version-1.0.0-green)

## 产品概述

YwCoder 采用自研 AI 引擎，将先进的自然语言处理技术与软件工程深度结合，为开发者提供智能化的编程体验。无论是代码补全、错误排查、重构建议，还是复杂逻辑分析，YwCoder 都能提供专业、高效的支持。

### 核心优势

- **自主研发** - 核心 AI 引擎完全自主可控
- **深度集成** - 与 VSCode 无缝融合，沉浸式编程体验
- **多模型支持** - 支持多种 AI 模型后端，灵活配置
- **安全可靠** - 本地化处理，代码隐私有保障

## 核心功能

### 🤖 智能对话界面
与 AI 助手进行自然语言交互，快速获取编程帮助。支持上下文感知，理解项目结构和代码逻辑。

### 📝 会话管理
- 自动保存对话历史
- 支持多会话切换
- 上下文追溯与恢复
- 会话标签管理

### 🔧 智能文件操作
- 自动分析代码结构
- 智能重构建议
- 批量代码审查
- 自动化代码生成

### 💻 终端集成
支持在对话中直接执行命令，提升开发效率：
- 自然语言转命令
- 命令解释与建议
- 执行结果分析

### 🔐 权限管理
细粒度的工具权限控制，确保安全可控：
- 文件操作权限
- 终端执行权限
- 网络访问权限
- 自定义权限策略

### 🌐 多模型后端支持
兼容多种 AI 引擎后端：
- 自研 AI 引擎
- OpenAI 兼容接口
- 本地模型（Ollama）
- 私有部署模型

### ⚡ 实时响应
- 流式输出，即时反馈
- 智能缓存机制
- 断点续传

### 🎨 专业代码渲染
- 语法高亮支持 50+ 编程语言
- 代码差异对比
- Markdown 渲染
- 图表可视化

## 安装指南

### 方式一：从 VSIX 安装（推荐）

1. 下载最新版本的 `ywcoder-*.vsix` 文件
2. 在 VSCode 中打开扩展面板（`Ctrl+Shift+X`）
3. 点击右上角的 `...`，选择 **"从 VSIX 安装..."**
4. 选择下载的 `.vsix` 文件
5. 安装完成后重启 VSCode

### 方式二：源码构建

```bash
# 克隆仓库
git clone https://github.com/your-org/ywcoder.git
cd ywcoder

# 安装依赖
npm install

# 构建扩展
npm run build

# 打包为 VSIX
npm run package
```

### 系统要求

- VSCode >= 1.98.0
- Node.js >= 18.0.0
- 操作系统：Windows 10/11、macOS 10.15+、Linux

## 快速开始

### 1. 启动 YwCoder

安装后，在 VSCode 左侧活动栏点击 **YwCoder** 图标，或按 `Ctrl+Shift+P` 输入 `显示 YwCoder`。

### 2. 配置 AI 后端

首次启动时，YwCoder 会引导您配置 AI 后端：

```json
// 使用自研 AI 引擎（默认）
{
  "ywcoder.backend.type": "self-hosted",
  "ywcoder.backend.endpoint": "http://localhost:8080"
}

// 或使用 OpenAI 兼容接口
{
  "ywcoder.backend.type": "openai",
  "ywcoder.backend.apiKey": "your-api-key",
  "ywcoder.backend.model": "gpt-4"
}

// 或使用本地 Ollama
{
  "ywcoder.backend.type": "ollama",
  "ywcoder.backend.endpoint": "http://localhost:11434",
  "ywcoder.backend.model": "codellama:7b"
}
```

### 3. 开始对话

1. 点击 **"新建会话"**
2. 在输入框中输入您的问题或需求
3. YwCoder 将实时分析并给出建议

## 使用示例

### 代码生成

```
用户：帮我写一个 Python 函数，用于计算斐波那契数列
YwCoder：为您生成如下代码...
```

### 代码审查

```
用户：帮我检查一下这段代码有没有问题
YwCoder：发现以下问题：
1. 第 12 行存在空指针风险
2. 第 25 行建议使用 try-catch
...
```

### 重构建议

```
用户：这个类太复杂了，怎么优化？
YwCoder：建议将此类拆分为以下三个类：
1. UserService - 负责用户相关业务
2. OrderService - 负责订单处理
3. PaymentGateway - 封装支付接口
```

## 配置说明

### 配置文件位置

- **扩展配置**：`~/.ywcoder/config.json`
- **用户设置**：VSCode 设置面板搜索 `ywcoder`

### 常用配置项

```json
{
  // AI 后端配置
  "ywcoder.backend.type": "self-hosted",
  "ywcoder.backend.endpoint": "http://localhost:8080",
  "ywcoder.backend.apiKey": "",
  
  // 界面配置
  "ywcoder.ui.theme": "dark",
  "ywcoder.ui.language": "zh-CN",
  
  // 功能开关
  "ywcoder.features.codeCompletion": true,
  "ywcoder.features.inlineChat": true,
  "ywcoder.features.terminalIntegration": true,
  
  // 权限控制
  "ywcoder.permissions.autoApprove": false,
  "ywcoder.permissions.fileEdit": "ask",
  "ywcoder.permissions.terminal": "ask"
}
```

## 开发调试

### 启动开发模式

```bash
npm run dev
```

这将同时启动：
- Vite 开发服务器（端口 5173）用于 WebView 热重载
- esbuild 监听器用于扩展热重载

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

# 仅构建 WebView
npm run build:webview

# 运行测试
npm run test

# 类型检查
npm run typecheck:all

# 代码格式化
npm run format
```

## 技术架构

YwCoder 采用模块化架构设计：

```
┌─────────────────────────────────────────────────────────┐
│                    前端界面层 (Vue 3)                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐ │
│  │ 会话管理    │  │ 代码编辑器   │  │ 设置面板        │ │
│  └─────────────┘  └─────────────┘  └─────────────────┘ │
├─────────────────────────────────────────────────────────┤
│                  扩展核心层 (TypeScript)                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐ │
│  │ AI Agent    │  │ 工具系统     │  │ 会话管理        │ │
│  └─────────────┘  └─────────────┘  └─────────────────┘ │
├─────────────────────────────────────────────────────────┤
│                   AI 后端适配层                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐ │
│  │ 自研引擎    │  │ OpenAI API  │  │ Ollama 本地     │ │
│  └─────────────┘  └─────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### 核心技术栈

- **前端**：Vue 3 + Vite + Tailwind CSS
- **扩展核心**：TypeScript + VSCode API
- **AI 通信**：MCP (Model Context Protocol)
- **状态管理**：Pinia + Alien Signals
- **构建工具**：esbuild + Vite

## 安全与隐私

YwCoder 高度重视用户代码安全：

- **本地优先**：所有代码分析在本地完成
- **可选云端**：仅在使用云端 AI 时传输必要信息
- **权限控制**：每项操作都需用户授权
- **审计日志**：完整记录所有 AI 操作

## 开源协议

AGPL-3.0

Copyright © 2024 YwCoder Team. All rights reserved.

---

**YwCoder - 让编程更智能，让开发更高效**

如有问题或建议，欢迎通过以下方式联系我们：
- 邮箱：support@ywcoder.dev
- 官网：https://ywcoder.dev
