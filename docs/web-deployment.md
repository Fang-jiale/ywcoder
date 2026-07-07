# YwCoder Web 部署包使用说明

本仓库提供三个 YwCoder Web 部署包，分别对应不同平台：

| 包名 | 平台 | 架构 | 分发形式 |
|------|------|------|----------|
| `ywcoder-web-win32-x64` | Windows | x64 | 压缩包 / 文件夹 |
| `ywcoder-web-linux-x64` | Linux | x64 | `tar.gz`（解压即用） |
| `ywcoder-web-linux-arm64` | Linux | arm64 | `tar.gz`（解压即用） |

> 所有包均内置 Node.js 运行时（`node-runtime/`）和生产依赖（`node_modules/`），无需在目标机器上单独安装 Node.js 或执行 `npm install`。

## 目录结构

每个部署包根目录包含：

- `out/` - 服务端代码
- `out-vscode-web/` - Web 工作台前端资源（已包含中文语言包）
- `extensions/` - 内置扩展（含简体中文语言包）
- `resources/server/` - 图标、manifest 等静态资源
- `node-runtime/` - 内置 Node.js 运行时
- `product.json` - 产品配置
- `start-server.bat` / `start-server.sh` - 启动脚本
- `stop-server.bat` / `stop-server.sh` - 停止脚本
- `YwCoder-Web.bat` / `YwCoder-Web-Stop.bat` - Windows 一键启动/停止
- `README.md` - 包内说明

## 快速开始

### Windows 本地使用（ywcoder-web-win32-x64）

1. 解压后进入包目录。
2. 双击 `YwCoder-Web.bat`。
3. 等待终端提示 `Opening browser: http://localhost:8001?tkn=...`，浏览器会自动打开。
4. 终端可以关闭，服务会在后台继续运行。

停止服务：双击 `YwCoder-Web-Stop.bat`。

### Linux 服务器部署（x64 / arm64）

1. 解压：

   ```bash
   tar -xzf ywcoder-web-linux-x64.tar.gz
   cd ywcoder-web-linux-x64
   ```

2. **本机测试**（仅本机可访问，默认端口 8001）：

   ```bash
   ./start-server.sh
   ```

   浏览器访问：`http://localhost:8001?tkn=<token>`

3. **远程访问**（让其他机器通过 IP 访问，必须绑定 `0.0.0.0`）：

   ```bash
   ./start-server.sh 8001 0.0.0.0
   ```

   或手动：

   ```bash
   ./node-runtime/bin/node out/server-main.js \
     --host 0.0.0.0 \
     --port 8001 \
     --connection-token <strong-secret-token> \
     --builtin-extensions-dir extensions \
     --accept-server-license-terms
   ```

   > 注意：`--host` 默认是 `127.0.0.1`（仅本机），远程访问必须改成 `0.0.0.0` 或具体内网 IP。

停止服务：

```bash
./stop-server.sh
```

## 远程访问说明

YwCoder Web 使用 `crypto.subtle`、WebSocket 和 Service Worker。浏览器把这些 API 限制在**安全上下文**中：

- `https://` 站点
- `http://localhost`
- `http://127.0.0.1`

因此**不要**直接通过 `http://<服务器IP>:8001` 访问，否则会出现 `crypto.subtle is not available` 或 WebSocket 失败。

下面提供三种远程访问方案，按推荐程度排序：

### 方案一：Windows 客户端一键代理（推荐，零配置）

适合不懂命令行、不会配置证书的内网 Windows 用户。

1. 服务端绑定到 `0.0.0.0`：

   ```bash
   ./start-server.sh 8001 0.0.0.0
   ```

2. Windows 用户下载 `YwCoderConnect.exe` 并运行。
3. 右键托盘图标 → **设置**，在左侧选择或新增隧道，右侧填写：
   - 名称：自定义标识
   - 服务器地址：服务器 IP 或主机名
   - 端口：`8001`
   - 连接令牌：与服务端一致的字符串
   - 本地端口：`18001`（多个隧道需不同）
4. 点击 **连接**，程序自动打开浏览器访问 `http://127.0.0.1:<本地端口>?tkn=<token>`。

可配置多个隧道，每个映射到不同本地端口，托盘菜单会列出所有隧道供单独管理。

优点：

- 用户无需安装证书、无需命令行。
- 浏览器把站点视为 `localhost`，所有 API 正常工作。
- 兼容 Windows 7 SP1 和 Windows 10，单文件无依赖。
- 支持同时管理多台服务器。

详细说明见 [`connect/README.md`](../connect/README.md)。

### 方案二：SSH 端口转发（适合技术人员）

不在服务端暴露端口，通过 SSH 把远程服务映射到本机 `localhost`：

```bash
ssh -L 8001:127.0.0.1:8001 user@remote-host
```

转发成功后，在本地浏览器打开：

```
http://localhost:8001?tkn=xxx
```

优点：通信通过 SSH 加密，浏览器视为本地访问，无需证书。

### 方案三：nginx HTTPS（可选，需要证书）

如果内网有统一证书或需要多人直接通过域名/IP 访问，可在服务端前加 nginx 反向代理。

```nginx
server {
    listen 443 ssl;
    server_name ywcoder.local;

    ssl_certificate     /etc/nginx/ywcoder.crt;
    ssl_certificate_key /etc/nginx/ywcoder.key;

    client_max_body_size 100M;
    proxy_request_buffering off;

    location / {
        proxy_pass http://127.0.0.1:8001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }
}
```

自签名证书需要客户端手动信任，内网有域名的建议使用机构签发证书或 Let's Encrypt。

## 常用启动参数

| 参数 | 说明 | 示例 |
|------|------|------|
| `--port` | 监听端口 | `--port 8001` |
| `--host` | 监听地址 | `--host 0.0.0.0` |
| `--connection-token` | 访问令牌 | `--connection-token your-secret-token` |
| `--server-data-dir` | 服务端数据目录 | `--server-data-dir /var/ywcoder-server` |
| `--server-base-path` | 基础路径（反向代理子路径时使用） | `--server-base-path /ywcoder` |

## 常见问题

### `crypto.subtle is not available`

说明浏览器未处于安全上下文。解决方案：

1. 使用 Windows 客户端或 SSH 端口转发，通过 `http://localhost` 访问。
2. 配置 nginx HTTPS 反向代理。

### Linux 远程访问连不上

1. 确认启动时加了 `--host 0.0.0.0` 或 `./start-server.sh 8001 0.0.0.0`。
2. 确认防火墙放行对应端口。
3. 确认 `connection-token` 正确。

### 端口被占用

Linux：

```bash
lsof -i :8001
kill -9 <PID>
```

Windows：

```powershell
netstat -ano | findstr :8001
taskkill /PID <PID> /F
```

## 安全建议

1. 生产环境务必将自动生成的 `connection-token` 替换为强随机字符串。
2. 不通过反向代理暴露时，建议绑定 `127.0.0.1` 或私有网络接口。
3. 通过 nginx 暴露时，只开放 443，内部 8001 不对外暴露。
4. 不要将 `node_modules` 中可能包含的开发依赖部署到生产环境。
