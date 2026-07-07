# YwCoder Connect 用户手册

## Windows 版

### 安装

无需安装，将 `YwCoderConnect.exe` 放到任意位置，双击运行即可。

### 首次运行

首次运行时会弹出**设置**对话框。左侧为隧道列表，右侧为当前选中隧道的字段：

| 字段 | 说明 | 示例 |
|------|------|------|
| 名称 | 自定义标识，方便识别 | `服务器 A` |
| 服务器地址 | YwCoder Web 所在服务器的 IP 或主机名 | `192.168.1.100` |
| 服务器端口 | 服务端监听的端口 | `8001` |
| 连接令牌 | 与服务端 `--connection-token` 一致的令牌 | `test123` |
| 本地端口 | 映射到本机的端口 | `18001` |
| 启动时自动连接 | 程序启动后自动连接该隧道 | 勾选 |

点击 **新增** 可添加更多隧道，每个隧道需要分配不同的本地端口。点击 **删除** 可移除当前选中的隧道。

### 托盘菜单

右键点击系统托盘图标：

- **状态**：显示当前已连接/总隧道数
- **连接 / 断开 <名称>**：单独控制每个隧道
- **打开 <名称>**：在浏览器中打开该隧道的本地地址
- **设置...**：修改配置
- **退出**：关闭程序

每个隧道的本地地址为 `http://127.0.0.1:<本地端口>?tkn=<令牌>`。

## Linux 版

### 安装

无需安装，下载对应架构的二进制文件，赋予执行权限即可：

```bash
chmod +x ywcoder-connect-linux-amd64
```

### 配置

创建配置文件 `~/.config/YwCoder Connect/config.json`：

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

### 启动

```bash
./ywcoder-connect-linux-amd64
```

程序会启动所有 `autoConnect` 为 `true` 的隧道；如果没有隧道开启自动连接，则启动第一个隧道。随后自动打开浏览器。按 `Ctrl+C` 停止。

也可以使用命令行参数覆盖第一个隧道的配置（仅启动单个隧道）：

```bash
./ywcoder-connect-linux-amd64 \
  -remote-host 192.168.1.100 \
  -remote-port 8001 \
  -token your-secret-token \
  -local-port 18001
```

参数说明：

| 参数 | 说明 |
|------|------|
| `-remote-host` | 服务器地址 |
| `-remote-port` | 服务器端口 |
| `-token` | 连接令牌 |
| `-local-port` | 本地端口 |
| `-no-browser` | 不自动打开浏览器 |

### 配置文件位置

`~/.config/YwCoder Connect/config.json`

### 日志文件

`~/.config/YwCoder Connect/connect.log`

## 连接成功后

程序会自动打开浏览器，访问本地地址。此时浏览器认为站点位于 `localhost`，`crypto.subtle` 等 API 可以正常工作。

## 常见问题

### 提示“监听本地端口失败”

本地端口已被其他程序占用。修改配置文件或命令行参数中的本地端口为其他值（如 `18002`），然后重新启动。

### 浏览器显示 403

连接令牌不正确，或服务端未设置 `--connection-token`。请确认两端令牌一致。

### 无法打开浏览器

请确保系统默认浏览器已配置。也可以手动访问 `http://127.0.0.1:<本地端口>?tkn=<令牌>`。

### 远程服务不可达

请确认：

1. 服务端已启动。
2. 服务端 `--host` 已绑定到 `0.0.0.0` 或内网 IP，而不是 `127.0.0.1`。
3. 防火墙允许访问内网 IP 的对应端口。

### 旧版配置文件兼容

如果配置文件仍使用旧版的单隧道字段（`remoteHost`、`remotePort`、`token`、`localPort`、`autoConnect`），程序会在首次加载时自动转换为 `tunnels` 数组。
