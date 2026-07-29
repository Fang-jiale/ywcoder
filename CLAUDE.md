# YW Coder 项目指南

本仓库包含 YW Coder 的完整交付物：VS Code 扩展插件、VS Code Web/桌面外壳，以及端口转发客户端。

## 项目结构

```
D:/project/ywcoder/
├── assets/          # 品牌与 Logo 资源
├── build/           # 构建脚本、Dockerfile、图标生成工具
├── connect/         # Go 端口转发客户端（YwCoder Connect）
├── deps/            # 本地 vendor 依赖包（@dcywzc/ywcoder）
├── dev/             # 本地开发/测试运行时数据（可忽略/删除）
├── docs/            # 项目文档
├── extension/       # YW Coder VS Code 扩展源码
├── out/             # 构建产物与 Release 包（gitignore）
└── vscode/          # VS Code OSS 外壳源码
```

## 核心目录说明

- **extension/**：TypeScript 扩展宿主 + Vue 3 webview 前端。
  - `src/webview/src/`：webview UI 源码。
  - `src/services/ai-engine/`：AI 引擎、会话管理、CLI 进程封装。
  - `dist/`：构建产物，会被同步到 `vscode/extensions/ywcoder/`。
- **vscode/**：VS Code 外壳源码，YW Coder 扩展以内置扩展形式打包进其中。
- **connect/**：独立的 Go 项目，提供端口转发能力。
- **deps/**：存放 `@dcywzc/ywcoder` CLI 的本地压缩包，构建时会安装到扩展中。

## 环境要求

- **Node.js 22**：VS Code 外壳与扩展构建都要求 Node 22，**不要使用 Node 24**（已知会破坏 extension host）。
- Windows 桌面构建脚本会自动使用 `node22/node-v22.22.0-win-x64`（如存在）。
- Go（用于 `connect/`）。

## 常用命令

### 扩展插件开发

```bash
cd extension
npm install
npm run build              # 构建 webview + extension
npm run dev:webview        # 启动 webview 开发服务器（http://localhost:5173）
npm run typecheck:all      # 全量类型检查
```

### 桌面端构建

```bash
# Windows x64
bash build/build-windows.sh

# Linux x64
bash build/build-linux.sh

# Linux arm64
bash build/build-linux-arm64.sh

# macOS arm64
bash build/build-darwin-arm64.sh
```

构建产物默认输出到 `vscode/.build/`；最终 Release 包进入 `out/`。

### Web 版部署

Web 部署包已整理到 `out/ywcoder-web-*/`。启动方式：

```bash
cd out/ywcoder-web-win32-x64
./YwCoder-Web.bat          # Windows 一键启动
# 或
./start-server.bat         # 手动启动，默认 http://localhost:8001
```

## 开发注意事项

1. **vendor 依赖路径**：`extension/package.json` 中 `@dcywzc/ywcoder` 应使用相对路径 `file:../deps/dcywzc-ywcoder-*.tgz`。构建脚本会自动将其重写为 `file:../../../../deps/...` 以适配 `vscode/extensions/ywcoder/package.json` 的目录深度。
2. **扩展产物同步**：完整桌面/Web 构建前，脚本会先把 `extension/package.json`、`extension/dist`、`extension/resources` 复制到 `vscode/extensions/ywcoder/`。
3. **pre-commit hook**：仓库使用 `vscode/build/hygiene.ts` 作为代码检查。该脚本已从仓库根目录解析路径，可正确处理 `extension/`、`connect/` 等目录下的文件。
4. **大文件/产物**：`out/`、`dev/`、`build/node_modules/` 已加入 `.gitignore`，请勿将本地构建产物提交到仓库。

## 与上游 VS Code 的关系

`vscode/` 是 VS Code OSS 的 fork，YW Coder 扩展作为内置扩展集成。修改 `vscode/` 中的通用文件时，注意后续与上游合并的冲突风险。
