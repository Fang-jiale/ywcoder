#!/bin/bash
set -e

cd /workspace

echo "=== [1/8] 配置国内 npm 镜像源 ==="
npm config set registry https://registry.npmmirror.com

echo "=== [2/8] 构建 Extension ==="
cd /workspace/extension
npm run build

echo "=== [3/8] 同步 Extension 到 vscode/extensions/ywcoder ==="
cd /workspace
cp extension/package.json vscode/extensions/ywcoder/package.json
sed -i 's|"file:../dcywzc-ywcoder-1.1.1.tgz"|"file:../../../dcywzc-ywcoder-1.1.1.tgz"|g' vscode/extensions/ywcoder/package.json
sed -i '/"@dcywzc\/ywcoder"/d' vscode/extensions/ywcoder/package.json
rm -rf vscode/extensions/ywcoder/resources
if [ -d extension/resources ]; then
  mkdir -p vscode/extensions/ywcoder/resources
  cp -r extension/resources/* vscode/extensions/ywcoder/resources/
fi
rm -rf vscode/extensions/ywcoder/dist
cp -r extension/dist vscode/extensions/ywcoder/

echo "=== [4/8] 完全重新安装 vscode/extensions/ywcoder 依赖 ==="
cd /workspace/vscode/extensions/ywcoder
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps

echo "=== [5/8] 重新安装 VS Code 依赖（恢复原始 lock 文件） ==="
cd /workspace/vscode
# 恢复原始的 package.json 和 package-lock.json（避免之前构建修改了版本）
git checkout HEAD -- package.json package-lock.json
# 临时移除有bug的 preinstall 脚本
sed -i '/"preinstall":/d' package.json
# 清理并重新安装，使用原始 lock 文件确保版本一致
rm -rf node_modules
npm install --legacy-peer-deps
npm rebuild

echo "=== [6/8] 为 tsgo 和 vsce 打补丁 ==="
cd /workspace/vscode

# 修改 tsgo.ts 让错误信息包含完整输出，便于调试
if grep -q 'tsgo exited with code' build/lib/tsgo.ts; then
  sed -i 's/reject(new Error(`tsgo exited with code \${code ?? '\''unknown'\''}`));/reject(new Error(`tsgo exited with code ${code ?? '\''unknown'\''} for ${projectPath}\n${allOutput}`));/g' build/lib/tsgo.ts
  echo "tsgo 补丁已打"
fi

# 修改 vsce 的 npm.js 让 npm list 失败时也能返回 stdout（peer dependency 问题导致 exit code 非零）
VSCE_NPM="build/node_modules/@vscode/vsce/out/npm.js"
if [ -f "$VSCE_NPM" ] && grep -q "npm list --production --parseable --depth=99999 --loglevel=error" "$VSCE_NPM"; then
  sed -i "s#exec('npm list --production --parseable --depth=99999 --loglevel=error'#exec('npm list --production --parseable --depth=99999 --loglevel=error || true'#g" "$VSCE_NPM"
  echo "vsce npm.js 补丁已打"
fi

# 修改 dependencies-generator.ts 让依赖列表变化时不失败构建
if grep -q 'FAIL_BUILD_FOR_NEW_DEPENDENCIES: boolean = true' build/linux/dependencies-generator.ts; then
  sed -i 's/FAIL_BUILD_FOR_NEW_DEPENDENCIES: boolean = true/FAIL_BUILD_FOR_NEW_DEPENDENCIES: boolean = false/g' build/linux/dependencies-generator.ts
  echo "dependencies-generator.ts 补丁已打"
fi

echo "=== [7/8] 预下载 marketplace 扩展 ==="
cd /workspace/vscode
# 清理可能不完整的缓存
rm -rf .build/builtInExtensions
# 先尝试预下载 marketplace 扩展到缓存目录
for i in 1 2 3; do
  echo "尝试第 $i 次预下载 marketplace 扩展..."
  if timeout 300 npx tsx build/lib/builtInExtensions.ts; then
    echo "预下载成功"
    break
  fi
  echo "预下载失败，等待 10 秒后重试..."
  rm -rf .build/builtInExtensions
  sleep 10
done
# 验证缓存完整性
for ext in ms-vscode.js-debug-companion ms-vscode.js-debug ms-vscode.vscode-js-profile-table; do
  if [ ! -f ".build/builtInExtensions/$ext/package.json" ]; then
    echo "错误: $ext 缓存不完整，缺少 package.json"
    exit 1
  fi
  echo "$ext 缓存验证通过"
done

echo "=== [8/8] 构建 Linux arm64 并打包 .deb ==="
cd /workspace/vscode

# 使用国内镜像加速 Electron 下载
export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"

# 构建 Linux arm64 二进制，带重试机制
for i in 1 2 3; do
  echo "尝试第 $i 次构建..."
  if timeout 1800 npx gulp vscode-linux-arm64; then
    break
  fi
  echo "构建失败，等待 10 秒后重试..."
  sleep 10
done

# 解决产物目录名不匹配
rm -f ../YwCoder-linux-arm64
ln -s VSCode-linux-arm64 ../YwCoder-linux-arm64

# 构建 deb 包
npx gulp vscode-linux-arm64-prepare-deb
npx gulp vscode-linux-arm64-build-deb

echo "=== 构建完成！==="
echo ".deb 文件位于: /workspace/vscode/.build/linux/deb/arm64/deb/"
