# YwCoder Connect 实施方案

## 背景

YwCoder Web 部署在纯内网离线的 Linux 服务器上。浏览器只在安全上下文（`https://`、`http://localhost`、`http://127.0.0.1`）中提供 `crypto.subtle`，用户无法直接通过 `http://<服务器IP>:8001` 访问。现有方案都需要额外配置：HTTPS 要证书、自签名证书要在客户端信任、SSH 端口转发要终端操作。

本方案提供一个独立的 Windows 客户端 `YwCoderConnect.exe`，把远程 YwCoder Web 服务映射到本机 `127.0.0.1:<本地端口>`，并自动打开浏览器。用户只需输入服务器 IP、端口和连接令牌，点击连接即可使用。

客户端需要兼容 Windows 7 SP1 和 Windows 10，因此使用 Go 1.20（最后一个支持 Win7 SP1 的 Go 版本）、CGO 禁用，生成单个无依赖的 `.exe`。

## 方案概述

新增顶层目录 `connect/`，作为独立 Go 模块开发。最终产物是 `YwCoderConnect.exe`：无控制台窗口、驻留在系统托盘、支持设置对话框、本地反向代理和自动打开浏览器。

### 目录结构

```
D:/project/ywcoder/connect/
├── cmd/ywcoder-connect/main.go      # 入口、生命周期、托盘/菜单绑定
├── internal/
│   ├── config/config.go             # 配置结构、加载/保存/校验
│   ├── proxy/proxy.go               # 支持 WebSocket 的反向代理
│   ├── browser/browser.go           # 调用 rundll32/url.dll 打开浏览器
│   ├── logging/logging.go           # 结构化日志，写到 %APPDATA%\YwCoder Connect\connect.log
│   └── ui/
│       ├── tray.go                  # 系统托盘图标和菜单
│       └── settings.go              # Windows 设置对话框
├── assets/
│   ├── icon.ico                     # 托盘/应用图标
│   └── app.manifest                 # comctl32 v6 + DPI 感知
├── build/
│   ├── build-windows.bat            # Windows 本地构建
│   └── build-linux.sh               # Linux CI 交叉编译
├── go.mod / go.sum
├── README.md
└── docs/user-manual.md
```

### 核心模块

1. **配置持久化（`internal/config/config.go`）**
   - 字段：`RemoteHost`、`RemotePort`、`Token`、`LocalPort`（默认 `18001`）、`AutoConnect`、可选窗口位置。
   - 读写路径：`%APPDATA%\YwCoder Connect\config.json`，使用 `os.UserConfigDir()`。
   - 校验：主机非空、端口在 `1-65535`、令牌非空。

2. **本地反向代理（`internal/proxy/proxy.go`）**
   - 目标地址：`http://<RemoteHost>:<RemotePort>`。
   - Director 保留原始 `Host` 头，复制其余所有请求头和请求体。
   - `ModifyResponse` 把来自远端原点的绝对 `Location` 头改写回 `http://127.0.0.1:<LocalPort>`。
   - 依赖 `httputil.ReverseProxy` 原生支持 HTTP Upgrade，透明转发 WebSocket；不限制路径。

3. **浏览器启动（`internal/browser/browser.go`）**
   - `Open(url)` 使用 `rundll32 url.dll,FileProtocolHandler <url>`，失败时回退到 `cmd /c start "" "<url>"`。
   - 代理启动成功后自动调用，URL 为 `http://127.0.0.1:<LocalPort>?tkn=<Token>`。

4. **日志（`internal/logging/logging.go`）**
   - `Init(appDataDir)` 返回 `log/slog` JSON Handler，写到 `%APPDATA%\YwCoder Connect\connect.log`。
   - 记录代理启停、连接错误、浏览器启动、配置变更等。

5. **系统托盘与设置（`internal/ui/tray.go`、`internal/ui/settings.go`）**
   - 使用纯 Go 的 Windows UI 库 `github.com/lxn/walk` 同时实现托盘和对话框。
   - 托盘菜单：状态标签、连接/断开、设置、打开本地 URL、退出。
   - 设置对话框：服务器 IP/主机名、服务器端口、连接令牌、本地端口、自动连接、OK/取消/连接。
   - 通过 `-H=windowsgui` 链接选项隐藏控制台窗口。

### 构建流程

- `go.mod` 目标 Go 1.20，依赖 `lxn/walk`。
- 使用 `github.com/akavel/rsrc` 嵌入 manifest 和图标；生成的 `.syso` 文件纳入 Git，方便跨平台编译。
- `build/build-windows.bat` 在 Windows 上构建 `dist\YwCoderConnect.exe`。
- `build/build-linux.sh` 在 Linux CI 上交叉编译：`GOOS=windows GOARCH=amd64 CGO_ENABLED=0`。

### 服务端配合

不需要修改服务端代码。管理员使用已有方式启动 YwCoder Web，但需绑定到内部可访问地址：

```bash
node out/server-main.js --host 0.0.0.0 --port 8001 \
  --connection-token <strong-secret-token> \
  --builtin-extensions-dir extensions \
  --accept-server-license-terms
```

### 文档更新

- `connect/README.md`、`connect/docs/user-manual.md`：构建说明、字段说明、托盘使用、故障排查。
- `docs/web-deployment.md`：在 SSH 端口转发节后新增 **方案三：Windows 客户端一键代理**。
- 顶层 `README.md`：添加一行说明并链接到 `connect/README.md`。

## 验证步骤

1. 运行 `connect/build/build-windows.bat`，确认生成 `dist/YwCoderConnect.exe`，双击无控制台窗口并显示托盘图标。
2. 填写设置后关闭再打开，确认字段从 `%APPDATA%\YwCoder Connect\config.json` 恢复。
3. 在远程 Linux 上启动 YwCoder Web：`--host 0.0.0.0 --port 8001 --connection-token test123`。
4. 客户端填入远程 IP/端口、令牌 `test123`、本地端口 `18001`，点击连接。
5. 浏览器自动打开 `http://127.0.0.1:18001?tkn=test123`，正常显示工作台页面（非 403）。
6. 浏览器 DevTools 中确认 WebSocket 升级到 `ws://127.0.0.1:18001/<quality>-<commit>` 返回 `101`。
7. 打开文件夹、编辑文件、使用终端，持续运行 10 分钟以上无掉线。
8. 测试端口占用提示、断开重连、Windows 7 SP1 运行。

## 关键文件

- 新建 `connect/cmd/ywcoder-connect/main.go`
- 新建 `connect/internal/config/config.go`
- 新建 `connect/internal/proxy/proxy.go`
- 新建 `connect/internal/browser/browser.go`
- 新建 `connect/internal/logging/logging.go`
- 新建 `connect/internal/ui/tray.go`
- 新建 `connect/internal/ui/settings.go`
- 新建 `connect/build/build-windows.bat`
- 新建 `connect/build/build-linux.sh`
- 新建 `connect/README.md`
- 新建 `connect/docs/user-manual.md`
- 修改 `docs/web-deployment.md`
- 修改 `README.md`
