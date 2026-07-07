# YwCoder Connect

YwCoder Connect 是一个本地端口转发客户端，用于把一台或多台远程 YwCoder Web 服务器映射到本机 `127.0.0.1:<本地端口>`，从而绕过浏览器的安全上下文限制，无需配置 HTTPS 证书即可访问。

## 适用场景

- 纯内网离线环境，无法使用公网证书。
- 用户不懂命令行，不会配置 SSH 端口转发或 nginx。
- 需要同时连接多台服务器，每台映射到本地不同端口。
- 客户端需要兼容 Windows 7 SP1 / Windows 10 / Linux x64 / Linux ARM64。

## 产物

| 平台 | 产物 |
|------|------|
| Windows GUI | `dist/YwCoderConnect.exe` |
| Linux x64 CLI | `dist/ywcoder-connect-linux-amd64` |
| Linux ARM64 CLI | `dist/ywcoder-connect-linux-arm64` |

所有产物都是单文件、无运行时依赖、CGO 禁用。

## 环境要求

- 运行：对应操作系统，无需安装 Go/Node/其他依赖。
- 构建：Go 1.20。

## 构建

### Windows 本地构建（GUI）

```bat
cd connect
build\build-windows.bat
```

输出：`connect\dist\YwCoderConnect.exe`

### Linux 本地构建（CLI）

```bash
cd connect
VERSION=1.0.0 ./build/build-linux.sh
```

输出：

- `connect/dist/ywcoder-connect-linux-amd64`
- `connect/dist/ywcoder-connect-linux-arm64`

### 在 Linux 上交叉编译 Windows GUI

```bash
cd connect
VERSION=1.0.0 ./build/build-windows-cross.sh
```

输出：`connect/dist/YwCoderConnect.exe`

## 使用

### 服务端准备

在服务器上启动 YwCoder Web，绑定到内网可访问地址：

```bash
node out/server-main.js --host 0.0.0.0 --port 8001 \
  --connection-token <strong-secret-token> \
  --builtin-extensions-dir extensions \
  --accept-server-license-terms
```

### Windows GUI

1. 运行 `YwCoderConnect.exe`。
2. 右键托盘图标 → **设置**，在左侧选择或新增隧道，右侧填写：
   - 名称：自定义标识，如 `服务器 A`
   - 服务器地址：服务器 IP 或主机名
   - 服务器端口：`8001`
   - 连接令牌：与服务端 `--connection-token` 一致的字符串
   - 本地端口：默认 `18001`，多个隧道需不同
   - 启动时自动连接：勾选后程序启动会自动连接该隧道
3. 点击 **连接**，浏览器会自动打开本地地址。

可配置多个隧道，每个映射到不同本地端口。右键托盘菜单会列出所有隧道，可单独连接/断开或打开对应本地地址。

配置文件：`%APPDATA%\YwCoder Connect\config.json`

### Linux CLI

1. 准备配置文件 `~/.config/YwCoder Connect/config.json`：

   ```json
   {
     "tunnels": [
       {
         "name": "服务器 A",
         "remoteHost": "192.168.1.100",
         "remotePort": 8001,
         "token": "your-secret-token",
         "localPort": 18001,
         "autoConnect": true
       },
       {
         "name": "服务器 B",
         "remoteHost": "192.168.1.101",
         "remotePort": 8001,
         "token": "another-token",
         "localPort": 18002,
         "autoConnect": false
       }
     ]
   }
   ```

2. 运行：

   ```bash
   ./ywcoder-connect-linux-amd64
   ```

   或直接用命令行参数（仅启动单个隧道）：

   ```bash
   ./ywcoder-connect-linux-amd64 \
     -remote-host 192.168.1.100 \
     -remote-port 8001 \
     -token your-secret-token \
     -local-port 18001
   ```

3. CLI 默认启动所有 `autoConnect` 为 `true` 的隧道；如果没有隧道开启自动连接，则启动第一个隧道。按 `Ctrl+C` 停止。

配置文件：`~/.config/YwCoder Connect/config.json`  
日志文件：`~/.config/YwCoder Connect/connect.log`

## 目录结构

```
connect/
├── cmd/
│   ├── ywcoder-connect/main.go          # Windows GUI 入口
│   └── ywcoder-connect-cli/main.go      # Linux CLI 入口
├── internal/
│   ├── config/config.go                 # 配置持久化（多隧道）
│   ├── proxy/proxy.go                   # HTTP/WebSocket 反向代理
│   ├── browser/                         # 打开浏览器（按平台分离）
│   ├── logging/logging.go               # 日志
│   └── ui/                              # Windows 托盘与设置对话框
├── assets/                              # 图标与 manifest
├── build/                               # 构建脚本
└── docs/user-manual.md                  # 用户手册
```

## 兼容性

- 使用 Go 1.20，Windows GUI 支持 Windows 7 SP1。
- CGO 禁用，生成纯静态可执行文件。
- Windows UI 使用标准库 `syscall` 直接调用 Win32 API，无外部依赖。

## 许可证

本项目内部使用，遵循主仓库许可证。
