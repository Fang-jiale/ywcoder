#!/bin/bash
set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

# 切换到 Node 22
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use 22

echo "[1/5] 安装 VS Code 依赖..."
cd vscode && npm install

echo "[2/5] 构建 Extension..."
cd "$PROJECT_ROOT/extension"
npm install
npm run build

echo "[3/5] 同步 Extension 产物..."
cd "$PROJECT_ROOT"
cp extension/package.json vscode/extensions/ywcoder/package.json
sed -i.bak 's|"file:../deps/dcywzc-ywcoder-1.1.1.tgz"|"file:../../../../deps/dcywzc-ywcoder-1.1.1.tgz"|g' vscode/extensions/ywcoder/package.json
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

echo "[5/5] 构建 macOS arm64 并打包 .zip..."
cd "$PROJECT_ROOT/vscode"

# 清理可能不完整的构建产物
rm -rf ../out/VSCode-darwin-arm64
rm -rf .build/darwin

# 构建 macOS arm64 二进制
npx gulp vscode-darwin-arm64

# 将产物移动到 out/
mv ../VSCode-darwin-arm64 ../out/VSCode-darwin-arm64

# 打包为 zip
APP_NAME="YwCoder"
OUTPUT_ZIP="$PROJECT_ROOT/out/${APP_NAME}-darwin-arm64.zip"
cd "$PROJECT_ROOT/out"
rm -f "$OUTPUT_ZIP"
zip -ry "$OUTPUT_ZIP" "VSCode-darwin-arm64/${APP_NAME}.app"

cd "$PROJECT_ROOT"

echo "✅ 构建完成！.zip 文件位于："
echo "   $OUTPUT_ZIP"
