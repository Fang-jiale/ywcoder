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
