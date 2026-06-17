# YwCoder Web 部署方案

本目录包含 YwCoder Web 版在 Windows 与 Linux 下的部署包与部署说明。

## 目录

- [部署包结构](#部署包结构)
- [环境要求](#环境要求)
- [Windows 部署](#windows-部署)
- [Linux 部署](#linux-部署)
- [使用 systemd 托管（Linux）](#使用-systemd-托管linux)
- [使用 IIS/Nginx 反向代理](#使用-iisnginx-反向代理)
- [安全配置](#安全配置)
- [故障排查](#故障排查)
- [重新打包](#重新打包)

## 部署包结构

打包脚本生成的目录结构如下：

```
ywcoder-web-{platform}-{arch}/
├── out/                    # 服务端代码
├── out-vscode-web/         # Web 前端资源（已包含中文 NLS）
├── extensions/             # 内置扩展（含简体中文语言包）
├── node_modules/           # 生产依赖（Windows 包已包含；Linux 包需安装）
├── node-runtime/           # 内置 Node.js 22 运行时（--download-node）
├── product.json            # 产品配置
├── package.json            # 生产依赖清单
├── package-lock.json       # 生产依赖锁定
├── YwCoder-Web.bat         # 一键启动脚本（Windows，双击打开终端并启动服务）
├── launch-server.cjs       # 启动器 Node.js 源码
├── start-server.bat        # Windows 启动脚本（手动）
├── start-server.sh         # Linux 启动脚本
├── install-deps.bat        # Windows 依赖安装脚本
├── install-deps.sh         # Linux 依赖安装脚本
└── README.md               # 单包说明
```

发布产物还包括：

```
dist/
├── ywcoder-web-win32-x64/
├── ywcoder-web-win32-x64.zip   # Windows 便携包
├── ywcoder-web-linux-x64/
├── ywcoder-web-linux-x64.tar.gz # Linux x64 包
├── ywcoder-web-linux-arm64/
└── ywcoder-web-linux-arm64.tar.gz # Linux arm64 包
```

## 环境要求

- **Node.js**：部署包已内置 Node.js 运行时，目标机器无需单独安装 Node.js
- **glibc（Linux）**：
  - **x64**：≥ 2.17。Linux x64 包内置的 Node 为 [unofficial-builds](https://unofficial-builds.nodejs.org/) 的 `glibc-217` 版本，可在 CentOS 7 / RHEL 7 / 龙蜥等旧发行版运行。
  - **arm64**：≥ 2.28。Linux arm64 包使用官方 Node.js 22 二进制，要求 glibc 2.28（适用于麒麟 V10 /  openEuler / Rocky Linux 8 等）。
- **CPU / 架构**：`x64` 或 `arm64`（aarch64）
- **内存**：建议至少 2GB（取决于并发用户与扩展数量）
- **磁盘**：
  - Windows 便携包约 400MB，解压后约 800MB
  - Linux 包（不含 node_modules）约 400MB，安装依赖后约 800MB
- **浏览器**：Web 版需要 `crypto.subtle`，该 API 只在**安全上下文**中可用。请通过 `https://` 或 `http://localhost` / `http://127.0.0.1` 访问；直接用 `http://<服务器IP>` 打开会报 `crypto.subtle is not available`。

## Windows 部署

### 解压即用

1. 将 `dist/ywcoder-web-win32-x64.zip` 解压到任意位置，例如 `C:\ywcoder-web`。
2. 双击 `YwCoder-Web.bat`。
3. 终端窗口打开，服务启动，启动成功后自动打开浏览器。
4. 保持终端窗口运行；关闭终端即停止服务。

> 便携包已内置 Node.js 22 运行时，目标机器无需单独安装 Node。

启动后访问：

```
http://localhost:8001
```

### 命令行启动

```bat
cd C:\ywcoder-web
YwCoder-Web.bat
```

### 后台运行（可选）

使用 [nssm](https://nssm.cc/) 将服务注册为 Windows 服务：

```bat
nssm install YwCoderWeb C:\ywcoder-web\start-server.bat
nssm set YwCoderWeb Application C:\ywcoder-web\start-server.bat
nssm set YwCoderWeb AppDirectory C:\ywcoder-web
nssm start YwCoderWeb
```

## Linux 部署

下文以 `x64` 为例，`arm64` 包把文件名中的 `x64` 替换为 `arm64` 即可。

### 1. 解压部署包

```bash
mkdir -p /opt/ywcoder-web
tar -xzf ywcoder-web-linux-x64.tar.gz -C /opt/ywcoder-web --strip-components=1
cd /opt/ywcoder-web
```

### 2. （可选）使用系统 Node.js

Linux 包已内置 Node.js 22 运行时，默认优先使用 `./node-runtime/bin/node`。如果该目录不存在，启动脚本才会回退到系统 `node`。因此目标机器**无需**单独安装 Node。

如需强制使用系统 Node，请删除或重命名 `node-runtime/` 目录，并确保系统 Node 为 22.x：

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
node --version  # 应显示 v22.22.1
```

或使用 [nvm](https://github.com/nvm-sh/nvm)：

```bash
nvm install 22.22.1
nvm use 22.22.1
```

### 3. 安装生产依赖

由于跨平台原生模块限制，Linux 包未预置 `node_modules`，需要在目标机器上安装：

```bash
cd /opt/ywcoder-web
./install-deps.sh
```

> 此步骤需要联网，执行时间约 1-3 分钟。

### 4. 启动服务

```bash
# 默认监听 0.0.0.0:8001
./start-server.sh

# 自定义端口与监听地址
./start-server.sh 8080 0.0.0.0
```

`start-server.sh` 支持两个位置参数：

- `$1`：端口，默认 `8001`
- `$2`：监听地址，默认 `0.0.0.0`

启动后访问（同一台服务器）：

```
http://localhost:8001?tkn=<脚本中生成的 token>
```

从其他机器通过 IP 访问时，必须配置 HTTPS 反向代理，否则浏览器会报 `crypto.subtle is not available`（见 [安全配置](#安全配置) 与 [故障排查](#故障排查)）。

## 使用 systemd 托管（Linux）

创建 `/etc/systemd/system/ywcoder-web.service`：

```ini
[Unit]
Description=YwCoder Web Server
After=network.target

[Service]
Type=simple
User=ywcoder
WorkingDirectory=/opt/ywcoder-web
ExecStart=/opt/ywcoder-web/start-server.sh
Restart=always
RestartSec=5
Environment="NODE_ENV=production"
Environment="VSCODE_NLS_CONFIG={\"locale\":\"zh-cn\",\"availableLanguages\":{\"*\":\"zh-cn\"}}"

[Install]
WantedBy=multi-user.target
```

启用并启动：

```bash
systemctl daemon-reload
systemctl enable ywcoder-web
systemctl start ywcoder-web
systemctl status ywcoder-web
```

查看日志：

```bash
journalctl -u ywcoder-web -f
```

## 使用 IIS/Nginx 反向代理

生产环境建议通过反向代理暴露服务，并启用 HTTPS。

### Nginx 示例

```nginx
server {
    listen 443 ssl;
    server_name ywcoder.example.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://127.0.0.1:8080;
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

### IIS 示例

使用 IIS 的 **Application Request Routing (ARR)** 配置反向代理到 `http://localhost:8001`，并启用 WebSocket 支持。

## 安全配置

1. **修改连接令牌**
   默认 `start-server` 脚本中的 `--connection-token` 是自动生成的随机字符串。生产环境请务必替换为强随机密码：

   ```bash
   node out/server-main.js --port 8080 --connection-token YOUR_STRONG_TOKEN
   ```

2. **使用 HTTPS**
   通过反向代理终止 TLS，或配置 Node.js 原生 HTTPS（不推荐直接使用）。

3. **限制监听地址**
   默认监听 `0.0.0.0`。如果不需要公网直接访问，可改为：

   ```bash
   node out/server-main.js --port 8080 --host 127.0.0.1 --connection-token YOUR_TOKEN
   ```

4. **防火墙**
   仅开放反向代理端口（如 443），内部 8080 端口不对外暴露。

## 故障排查

### 启动时报 `Cannot find package '@vscode/...'`

- **Windows**：确认 `node_modules` 已完整复制。
- **Linux**：运行 `./install-deps.sh` 安装依赖。

### 页面显示英文而非中文

1. 检查 `out-vscode-web/nls.messages.zh-cn.js` 是否存在。
2. 检查浏览器网络面板是否加载了 `nls.messages.zh-cn.js`。
3. 确认 `VSCODE_NLS_CONFIG` 环境变量设置为 `zh-cn`。

### 端口被占用

修改启动脚本中的 `--port` 参数，或运行时传入：

```bash
./start-server.sh --port 9090
```

Windows 一键启动器会自动检测端口占用并尝试结束上一次实例。

### 扩展加载失败

检查 `extensions/` 目录是否包含所需扩展。语言包应为 `extensions/vscode-language-pack-zh-hans/`。

### `crypto.subtle is not available`

该错误说明浏览器未处于安全上下文。`crypto.subtle` 仅在以下地址可用：

- `https://` 站点
- `http://localhost`
- `http://127.0.0.1`

通过 `http://<服务器IP>:8001` 直接访问会触发此错误。

**解决方案：**

1. **推荐**：在服务器前部署 Nginx / Caddy / IIS 反向代理并启用 HTTPS，域名指向服务器 IP。
2. **临时**：使用 SSH 本地端口转发，把远程 8001 端口映射到本机 `localhost:8001`，然后访问 `http://localhost:8001`：

   ```bash
   ssh -L 8001:localhost:8001 user@服务器IP
   ```

3. **测试**：在服务器本机用 `http://localhost:8001` 访问验证功能正常。

### Linux 启动报 `GLIBC_2.33 not found`（或 2.32 / 2.34 等）

说明当前使用的 Node 二进制是针对更高版本 glibc 编译的。请确认：

1. 使用的是 `--download-node` 打的 Linux 包，且 `node-runtime/bin/node` 存在。
2. 不要通过系统 `node` 直接启动 `out/server-main.js`，应使用 `./start-server.sh`。
3. 如需检查内置 Node 的 glibc 依赖，在 Linux 上执行：

   ```bash
   objdump -T node-runtime/bin/node | grep -oE 'GLIBC_[0-9.]+' | sort -V | tail -5
   # x64 包最高版本应 ≤ GLIBC_2.17
   # arm64 包最高版本应 ≤ GLIBC_2.28
   ```

如果最高版本高于上述值，说明打包时未使用对应的 Node 二进制，请检查打包命令是否包含 `--download-node`，或改用本仓库的 GitHub Actions 工作流 `.github/workflows/package-web.yml`。

## 重新打包

修改代码或语言包后，重新生成部署包：

```bash
# 1. 重新构建 Web 资源并生成中文 NLS
node build/next/index.ts bundle --nls --target web --out out-vscode-web
node scripts/generate-nls-zh-cn.mjs

# 2. 打包 Windows 与 Linux（内置 Node 运行时）
node scripts/package-web-deployment.mjs --platform all --download-node

# 或单独打包 Windows
node scripts/package-web-deployment.mjs --platform win32 --download-node

# 或单独打包 Linux（同时生成 x64 与 arm64）
node scripts/package-web-deployment.mjs --platform linux --download-node

# 或指定架构
node scripts/package-web-deployment.mjs --platform linux --arch x64 --download-node
node scripts/package-web-deployment.mjs --platform linux --arch arm64 --download-node

# 3. 生成 zip / tar.gz 分发包
node scripts/archive-web-deployment.mjs --platform all
```

打包结果位于 `dist/`：

```
dist/
├── ywcoder-web-win32-x64/
│   ├── YwCoder-Web.vbs     # Windows 一键启动器
│   └── ...
├── ywcoder-web-win32-x64.zip
├── ywcoder-web-linux-x64/
├── ywcoder-web-linux-x64.tar.gz
├── ywcoder-web-linux-arm64/
└── ywcoder-web-linux-arm64.tar.gz
```

## 附：常用启动参数

| 参数 | 说明 |
|------|------|
| `--port` | 监听端口，默认 8080 |
| `--host` | 监听地址，默认 0.0.0.0 |
| `--connection-token` | 连接令牌，必须设置 |
| `--server-data-dir` | 服务端数据目录，默认 `~/.ywcoder-server` |
| `--accept-server-license-terms` | 接受许可条款 |
| `--extensions-dir` | 扩展安装目录 |
| `--builtin-extensions-dir` | 内置扩展目录 |
| `--enable-proposed-api` | 启用 proposed API |

完整参数列表：

```bash
node out/server-main.js --help
```
