# WSL 构建 Linux 版 YwCoder（统信UOS / 麒麟适用）

适用于 Windows 10/11 开发者，无需单独 Linux 物理机即可构建能在统信UOS、麒麟等国产操作系统上运行的 `.deb` 安装包。

---

## 一、环境准备

### 1. 安装 WSL2 + Ubuntu

```powershell
# 以管理员身份在 PowerShell 中执行
wsl --install -d Ubuntu-22.04
```

安装完成后重启电脑，按提示设置 Ubuntu 用户名和密码。

### 2. 进入项目目录

WSL 会自动挂载 Windows 磁盘到 `/mnt`：

```bash
cd /mnt/d/project/ywcoder
```

### 3. 安装 Node.js 22

```bash
# 安装 nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
source ~/.bashrc

# 安装 Node 22
nvm install 22.22.1
nvm use 22.22.1
node -v   # 应显示 v22.22.1
```

### 4. 安装构建依赖

```bash
sudo apt-get update
sudo apt-get install -y build-essential fakeroot rpm dpkg-dev
```

> `fakeroot` 和 `dpkg-dev` 是打 `.deb` 包必需的工具；`rpm` 用于打 `.rpm` 包（可选）。

---

## 二、构建步骤

以下步骤与 CI（`.github/workflows/build.yml`）逻辑保持一致。

### 1. 安装 VS Code 源码依赖

```bash
cd /mnt/d/project/ywcoder/vscode
npm install
```

### 2. 构建 Extension

```bash
cd /mnt/d/project/ywcoder/extension
npm install
npm run build
```

### 3. 同步 Extension 产物到 vscode 目录

```bash
cd /mnt/d/project/ywcoder

# 同步 package.json（修正 tgz 路径，并移除 @dcywzc/ywcoder 避免安装 sharp 等导致 npm list 失败）
cp extension/package.json vscode/extensions/ywcoder/package.json
sed -i 's|"file:../dcywzc-ywcoder-1.0.1.tgz"|"file:../../../dcywzc-ywcoder-1.0.1.tgz"|g' vscode/extensions/ywcoder/package.json
sed -i '/"@dcywzc\/ywcoder"/d' vscode/extensions/ywcoder/package.json

# 同步 resources
rm -rf vscode/extensions/ywcoder/resources
cp -r extension/resources/* vscode/extensions/ywcoder/resources/

# 同步构建产物 dist
rm -rf vscode/extensions/ywcoder/dist
cp -r extension/dist vscode/extensions/ywcoder/
```

### 4. 安装 Extension 依赖（在 vscode 目录内）

```bash
cd /mnt/d/project/ywcoder/vscode/extensions/ywcoder
rm -rf node_modules package-lock.json
npm install
```

### 5. 构建 Linux x64 版本

```bash
cd /mnt/d/project/ywcoder/vscode
npx gulp vscode-linux-x64
```

构建完成后，会在 `/mnt/d/project/ywcoder/VSCode-linux-x64` 目录下生成可直接运行的绿色版。

### 6. 打包成 .deb（统信UOS / 麒麟 推荐）

```bash
cd /mnt/d/project/ywcoder/vscode
npx gulp vscode-linux-x64-build-deb
```

生成的 `.deb` 文件位于：

```
/mnt/d/project/ywcoder/vscode/.build/linux/deb/amd64/deb/
```

文件名格式类似：`ywcoder_1.98.0-1716192000_amd64.deb`

### 7. 打包成 .rpm（可选，部分服务器版麒麟）

```bash
npx gulp vscode-linux-x64-build-rpm
```

生成的 `.rpm` 文件位于：

```
/mnt/d/project/ywcoder/vscode/.build/linux/rpm/x86_64/
```

---

## 三、在统信UOS / 麒麟上安装

将生成的 `.deb` 拷贝到目标系统后：

```bash
# 命令行安装
sudo dpkg -i ywcoder_1.98.0-XXXXXXX_amd64.deb

# 若提示依赖缺失，自动修复
sudo apt-get install -f
```

或在图形界面双击 `.deb` 文件，使用「软件安装器」/「包管理器」打开安装。

---

## 四、常见问题

### 1. `npm install` 卡在 `reify` 很久

WSL2 访问 Windows 磁盘（`/mnt/d`）的 IO 性能较差。如果频繁构建，建议将代码目录迁到 WSL 的 Linux 文件系统内：

```bash
cp -r /mnt/d/project/ywcoder ~/ywcoder
# 后续在 ~/ywcoder 内操作
```

构建完再拷贝产物回 Windows 目录即可。

### 2. `dpkg-deb: error: ... permission denied`

确保第4步中的 `fakeroot` 已安装，且构建时未使用 root 用户。

### 3. 缺少 `libxkbfile1` 等运行依赖

这是目标系统的问题，非构建问题。在统信UOS/麒麟上若启动报错，安装基础依赖：

```bash
sudo apt-get install -y libxkbfile1 libsecret-1-0 libgtk-3-0 libnss3 libgbm1
```

### 4. ARM64 架构（鲲鹏/飞腾芯片）

以上步骤生成的是 `x64`（amd64）包，适用于 Intel/AMD/海光/兆芯 芯片。

如需支持 **ARM64**（鲲鹏、飞腾），在第5、6步将 `x64` 替换为 `arm64`：

```bash
npx gulp vscode-linux-arm64
npx gulp vscode-linux-arm64-build-deb
```

注意：WSL 本身是 x64 环境，交叉编译 ARM64 版本可能遇到原生模块问题。**建议直接在 ARM64 物理机或对应架构的容器/虚拟机中构建 ARM64 版本。**

---

## 五、快速脚本（一键构建）

将以下内容保存为 `build-linux.sh`，放在项目根目录：

```bash
#!/bin/bash
set -e

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_ROOT"

echo "[1/5] 安装 VS Code 依赖..."
cd vscode && npm install

echo "[2/5] 构建 Extension..."
cd "$PROJECT_ROOT/extension"
npm install
npm run build

echo "[3/5] 同步 Extension 产物..."
cd "$PROJECT_ROOT"
cp extension/package.json vscode/extensions/ywcoder/package.json
sed -i 's|"file:../dcywzc-ywcoder-1.0.1.tgz"|"file:../../../dcywzc-ywcoder-1.0.1.tgz"|g' vscode/extensions/ywcoder/package.json
sed -i '/"@dcywzc\/ywcoder"/d' vscode/extensions/ywcoder/package.json
rm -rf vscode/extensions/ywcoder/resources
if [ -d extension/resources ]; then
  cp -r extension/resources/* vscode/extensions/ywcoder/resources/
fi
rm -rf vscode/extensions/ywcoder/dist
cp -r extension/dist vscode/extensions/ywcoder/

echo "[4/5] 安装 Extension 依赖..."
cd "$PROJECT_ROOT/vscode/extensions/ywcoder"
rm -rf node_modules package-lock.json
npm install

echo "[5/5] 构建 Linux x64 并打包 .deb..."
cd "$PROJECT_ROOT/vscode"
npx gulp vscode-linux-x64
npx gulp vscode-linux-x64-build-deb

echo "✅ 构建完成！.deb 文件位于："
echo "   $PROJECT_ROOT/vscode/.build/linux/deb/amd64/deb/"
```

在 WSL 中赋予执行权限并运行：

```bash
chmod +x /mnt/d/project/ywcoder/build-linux.sh
/mnt/d/project/ywcoder/build-linux.sh
```
