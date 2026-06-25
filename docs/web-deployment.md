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
- `package.json` / `package-lock.json` - 生产依赖清单
- `start-server.bat` / `start-server.sh` / `start-server.ps1` - 启动脚本
- `stop-server.bat` / `stop-server.sh` / `stop-server.ps1` - 停止脚本
- `restart-server.bat` / `restart-server.sh` - 重启脚本
- `launch-server.cjs` - 后台启动器（Windows 一键启动用）
- `README.md` - 包内说明

Windows 包额外提供：

- `YwCoder-Web.bat` - 一键启动（后台运行并自动打开浏览器）
- `YwCoder-Web-Stop.bat` - 停止后台服务

## 快速开始

### Windows (ywcoder-web-win32-x64)

1. 进入包目录：

   ```bash
   cd vscode/dist/ywcoder-web-win32-x64
   ```

2. 双击 `YwCoder-Web.bat`，或命令行运行：

   ```bash
   YwCoder-Web.bat
   ```

3. 等待终端提示 `Opening browser: http://localhost:8001?tkn=...`，浏览器会自动打开。
4. 终端可以关闭，服务会在后台继续运行。

停止服务：双击 `YwCoder-Web-Stop.bat` 或运行 `stop-server.bat`。

### Linux x64 (ywcoder-web-linux-x64)

1. 解压 `ywcoder-web-linux-x64.tar.gz`：

   ```bash
   tar -xzf ywcoder-web-linux-x64.tar.gz
   cd ywcoder-web-linux-x64
   ```

2. 启动服务：

   ```bash
   ./start-server.sh
   ```

3. 浏览器访问：http://localhost:8080

停止服务：

```bash
./stop-server.sh
```

### Linux arm64 (ywcoder-web-linux-arm64)

步骤与 Linux x64 相同，默认监听端口为 `8001`：

```bash
tar -xzf ywcoder-web-linux-arm64.tar.gz
cd ywcoder-web-linux-arm64
./start-server.sh
```

浏览器访问：http://localhost:8001

## 启动脚本参数

可直接编辑对应启动脚本修改以下参数：

| 参数 | 说明 | 示例 |
|------|------|------|
| `--port` | 监听端口 | `--port 8001` |
| `--host` | 监听地址 | `--host 127.0.0.1` |
| `--connection-token` | 访问令牌 | `--connection-token your-secret-token` |
| `--server-data-dir` | 服务端数据目录 | `--server-data-dir /var/ywcoder-server` |
| `--server-base-path` | 基础路径（反向代理子路径时使用） | `--server-base-path /ywcoder` |

Windows 一键启动器 `launch-server.cjs` 会自动生成随机 token 并写入 `config.json`，可编辑该文件固定 token。

## 远程访问说明

YwCoder Web 使用 WebSocket、Service Worker 以及一些现代浏览器 API。直接在浏览器通过 `http://<IP>:<端口>` 远程访问时，浏览器通常会限制或报错（例如 WebSocket 连接失败、Service Worker 注册失败、摄像头/剪贴板等 API 不可用）。**建议通过 HTTPS 访问**。

下面提供两种常用方案：

### 方案一：客户端代理到本地（推荐，简单安全）

不在服务端暴露端口，而是通过 SSH 端口转发把远程服务映射到本机 `localhost`，然后像本地一样访问。

```bash
ssh -L 8001:127.0.0.1:8001 user@remote-host
```

转发成功后，在本地浏览器打开：

```
http://localhost:8001?tkn=xxx
```

优点：无需配置证书，通信通过 SSH 加密，浏览器把站点视为 `localhost`，不会触发混合内容或安全策略限制。

### 方案二：服务端代理 HTTPS（自签名证书）

内网/测试环境最常用。在服务端前面加 nginx 反向代理，使用自签名证书提供 HTTPS。

#### 1. 生成自签名证书

```bash
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/nginx/ywcoder.key \
  -out /etc/nginx/ywcoder.crt \
  -subj "/CN=ywcoder.local" \
  -addext "subjectAltName=DNS:ywcoder.local,IP:192.168.1.100"
```

> 把 `192.168.1.100` 换成服务器实际 IP，或只保留 `DNS:ywcoder.local`。

#### 2. nginx 配置

```nginx
server {
    listen 443 ssl;
    server_name ywcoder.local;

    ssl_certificate     /etc/nginx/ywcoder.crt;
    ssl_certificate_key /etc/nginx/ywcoder.key;

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
    }
}
```

#### 3. 客户端信任证书

自签名证书默认不被浏览器信任，首次访问会提示不安全。解决方式：

- **Windows**：双击 `ywcoder.crt` → 安装证书 → 选择"本地计算机" → 放入"受信任的根证书颁发机构"。
- **macOS**：双击 `ywcoder.crt` → 钥匙串访问 → 设为"始终信任"。
- **Linux**：复制到 `/usr/local/share/ca-certificates/` 后执行 `update-ca-certificates`。

也可以让浏览器直接忽略证书警告继续访问，但部分浏览器仍会拦截 WebSocket，推荐导入证书。

#### 4. 可选：公网/生产环境使用 Let's Encrypt

如果有公网域名，可以用 certbot 自动申请可信证书：

```bash
certbot --nginx -d ywcoder.example.com
```

certbot 会自动修改 nginx 配置并开启 443 SSL，客户端无需手动信任。

## 完整 nginx 参考配置（自签名证书版）

以下是一份可直接套用的 nginx 配置，包含 WebSocket 转发、大文件传输支持，并适配自签名证书。

```nginx
server {
    listen 443 ssl;
    server_name ywcoder.local;

    ssl_certificate     /etc/nginx/ywcoder.crt;
    ssl_certificate_key /etc/nginx/ywcoder.key;

    # 大文件传输（上传/下载扩展）
    client_max_body_size 100M;
    proxy_request_buffering off;

    location / {
        proxy_pass http://127.0.0.1:8001;
        proxy_http_version 1.1;

        # WebSocket 支持
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # 真实客户端 IP 和协议
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # 长连接超时
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }
}
```

如果需要通过子路径访问（例如 `https://example.com/ywcoder`），YwCoder 服务端需要加上 `--server-base-path /ywcoder`，同时 nginx 配置改为：

```nginx
location /ywcoder/ {
    proxy_pass http://127.0.0.1:8001/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 86400;
}
```

注意 `proxy_pass` 末尾的 `/` 不要漏掉，否则路径会重复。

## 常见问题

### 页面左上角 logo 不显示或显示旧版

多为浏览器缓存导致。请使用 `Ctrl + F5`（Windows/Linux）强制刷新，或打开无痕/隐私窗口访问。

### 端口被占用

Windows：

```powershell
netstat -ano | findstr :8001
taskkill /PID <PID> /F
```

Linux：

```bash
lsof -i :8001
kill -9 <PID>
```

### Linux 首次启动提示缺少依赖

如果下载的是源码包或自己手动打包，可能需要执行 `npm ci --production`。发布的 `tar.gz` 包已包含完整依赖，解压即用，无需安装。

## 安全建议

1. 生产环境务必将自动生成的 `connection-token` 替换为强随机字符串。
2. 建议通过 nginx 反向代理提供 HTTPS。
3. 不通过反向代理暴露时，建议绑定 `127.0.0.1` 或私有网络接口。
4. 不要将 `node_modules` 中可能包含的开发依赖部署到生产环境。
