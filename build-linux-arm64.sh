#!/bin/bash
set -e

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_ROOT"

# 检查 Node.js 版本（VS Code 要求 v22.x）
NODE_VERSION=$(node --version 2>/dev/null || echo "none")
if [[ "$NODE_VERSION" != v22.* ]]; then
  echo "警告：当前 Node.js 版本为 $NODE_VERSION，VS Code 要求 v22.x"
  echo "请使用 nvm 切换：nvm use 22"
  exit 1
fi

echo "[1/5] 安装 VS Code 依赖..."
cd vscode && npm install

echo "[2/5] 构建 Extension..."
cd "$PROJECT_ROOT/extension"
npm install
npm run build

echo "[3/5] 同步 Extension 产物..."
cd "$PROJECT_ROOT"
cp extension/package.json vscode/extensions/ywcoder/package.json
sed -i.bak 's|"file:../dcywzc-ywcoder-1.1.1.tgz"|"file:../../../dcywzc-ywcoder-1.1.1.tgz"|g' vscode/extensions/ywcoder/package.json
rm -f vscode/extensions/ywcoder/package.json.bak
sed -i.bak '/"@dcywzc\/ywcoder"/d' vscode/extensions/ywcoder/package.json
rm -f vscode/extensions/ywcoder/package.json.bak
rm -rf vscode/extensions/ywcoder/resources
if [ -d extension/resources ]; then
  mkdir -p vscode/extensions/ywcoder/resources
  cp -r extension/resources/* vscode/extensions/ywcoder/resources/
fi
rm -rf vscode/extensions/ywcoder/dist
cp -r extension/dist vscode/extensions/ywcoder/

echo "[4/5] 安装 Extension 依赖..."
cd "$PROJECT_ROOT/vscode/extensions/ywcoder"
rm -rf node_modules package-lock.json
npm install

echo "[5/5] 构建 Linux arm64 并打包 .deb（适配麒麟操作系统）..."
cd "$PROJECT_ROOT/vscode"

# 使用系统代理加速 GitHub 和 Electron 下载（按需修改端口）
export HTTP_PROXY="http://127.0.0.1:29290"
export HTTPS_PROXY="http://127.0.0.1:29290"
# 使用国内镜像加速 Electron 下载
export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"

# 清理可能不完整的构建产物
rm -rf ../VSCode-linux-arm64
rm -rf .build/linux/deb/arm64

# 构建 Linux arm64 二进制
npx gulp vscode-linux-arm64

# 解决产物目录名不匹配：gulpfile.vscode.ts 输出 VSCode-linux-arm64，
# 但 gulpfile.vscode.linux.ts 查找 YwCoder-linux-arm64
rm -f ../YwCoder-linux-arm64
ln -s VSCode-linux-arm64 ../YwCoder-linux-arm64

# 构建 deb 包
npx gulp vscode-linux-arm64-prepare-deb
npx gulp vscode-linux-arm64-build-deb

echo "✅ 构建完成！.deb 文件位于："
echo "   $PROJECT_ROOT/vscode/.build/linux/deb/arm64/deb/"
