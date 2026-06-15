#!/usr/bin/env node
/**
 * Package YwCoder Web deployment bundles for Windows and Linux.
 *
 * Usage:
 *   node scripts/package-web-deployment.mjs --platform win32
 *   node scripts/package-web-deployment.mjs --platform linux
 *   node scripts/package-web-deployment.mjs --platform all
 *
 * Options:
 *   --platform win32|linux|all   Target platform(s) (default: current platform)
 *   --download-node              Bundle Node.js 22 runtime in the package
 *   --skip-build                 Skip rebuilding out-vscode-web
 *   --out-dir <dir>              Output directory (default: dist)
 */

import {
	existsSync, copyFileSync, mkdirSync, readFileSync, writeFileSync,
	rmSync, cpSync, statSync, createWriteStream, chmodSync, readdirSync
} from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import https from 'https';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

function parseArgs() {
	const args = process.argv.slice(2);
	const options = {
		platform: process.platform === 'win32' ? 'win32' : 'linux',
		downloadNode: false,
		skipBuild: false,
		outDir: join(repoRoot, 'dist')
	};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === '--platform' && i + 1 < args.length) {
			options.platform = args[++i];
		} else if (arg === '--download-node') {
			options.downloadNode = true;
		} else if (arg === '--skip-build') {
			options.skipBuild = true;
		} else if (arg === '--out-dir' && i + 1 < args.length) {
			options.outDir = args[++i];
		}
	}

	return options;
}

const options = parseArgs();
const platforms = options.platform === 'all' ? ['win32', 'linux'] : [options.platform];

const NODE_VERSION = '22.22.1';
const NODE_BASE_URL = 'https://nodejs.org/dist';
const YWCODER_VERSION = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).version;

const requiredArtifacts = [
	'out/server-main.js',
	'out/vs/server/node/webClientServer.js',
	'out-vscode-web/vs/code/browser/workbench/workbench.html',
	'out-vscode-web/nls.messages.js',
	'out-vscode-web/nls.messages.zh-cn.js',
	'extensions/vscode-language-pack-zh-hans/translations/main.i18n.json'
];

function ensureDir(dir) {
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
}

function syncNativeBinaries(sourceRoot, destRoot) {
	const nativeExts = ['.node', '.dll', '.exe'];
	let copied = 0;
	function walk(dir) {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const srcPath = join(dir, entry.name);
			if (entry.isDirectory()) {
				walk(srcPath);
			} else if (nativeExts.some(ext => entry.name.toLowerCase().endsWith(ext))) {
				const relative = srcPath.slice(sourceRoot.length + 1);
				const destPath = join(destRoot, relative);
				if (!existsSync(destPath)) {
					ensureDir(dirname(destPath));
					copyFileSync(srcPath, destPath);
					copied++;
				}
			}
		}
	}
	walk(sourceRoot);
	if (copied > 0) {
		console.log(`[package] Synced ${copied} native binaries from root node_modules`);
	}
}

function fileSize(path) {
	try {
		return (statSync(path).size / 1024 / 1024).toFixed(2) + ' MB';
	} catch {
		return 'unknown';
	}
}

function run(command, args, cwd) {
	return new Promise((resolve, reject) => {
		console.log(`[package] Running: ${command} ${args.join(' ')}`);
		const proc = spawn(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
		proc.on('close', code => {
			if (code === 0) {
				resolve();
			} else {
				reject(new Error(`Command failed with exit code ${code}`));
			}
		});
		proc.on('error', reject);
	});
}

async function buildWebBundle() {
	if (options.skipBuild) {
		console.log('[package] Skipping web bundle build (--skip-build)');
		return;
	}

	console.log('[package] Building web bundle with NLS...');
	await run(process.execPath, [
		'build/next/index.ts',
		'bundle',
		'--nls',
		'--target',
		'web',
		'--out',
		'out-vscode-web'
	], repoRoot);

	console.log('[package] Generating Chinese NLS...');
	await run(process.execPath, ['scripts/generate-nls-zh-cn.mjs'], repoRoot);
}

function verifyArtifacts() {
	console.log('[package] Verifying build artifacts...');
	const missing = [];
	for (const artifact of requiredArtifacts) {
		const fullPath = join(repoRoot, artifact);
		if (!existsSync(fullPath)) {
			missing.push(artifact);
		} else {
			console.log(`[package]   ${artifact} (${fileSize(fullPath)})`);
		}
	}
	if (missing.length > 0) {
		throw new Error(`Missing required artifacts:\n  - ${missing.join('\n  - ')}`);
	}
}

function downloadFile(url, dest) {
	return new Promise((resolve, reject) => {
		https.get(url, response => {
			if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
				downloadFile(response.headers.location, dest).then(resolve).catch(reject);
			} else if (response.statusCode === 200) {
				const file = createWriteStream(dest);
				response.pipe(file);
				file.on('finish', () => { file.close(); resolve(); });
				file.on('error', reject);
				response.on('error', reject);
			} else {
				reject(new Error(`Download failed: HTTP ${response.statusCode} for ${url}`));
			}
		}).on('error', reject);
	});
}

async function downloadNode(platform, arch, destDir) {
	const nodeDir = join(destDir, 'node-runtime');
	ensureDir(nodeDir);

	if (platform === 'win32') {
		const url = `${NODE_BASE_URL}/v${NODE_VERSION}/win-${arch}/node.exe`;
		const outFile = join(nodeDir, 'node.exe');
		console.log(`[package] Downloading Node.js for ${platform}-${arch}...`);
		console.log(`[package]   ${url}`);
		await downloadFile(url, outFile);
		console.log(`[package] Node.js downloaded to ${outFile}`);
	} else {
		const url = `${NODE_BASE_URL}/v${NODE_VERSION}/node-v${NODE_VERSION}-${platform}-${arch}.tar.gz`;
		const tarPath = join(nodeDir, 'node.tar.gz');
		console.log(`[package] Downloading Node.js for ${platform}-${arch}...`);
		console.log(`[package]   ${url}`);
		await downloadFile(url, tarPath);
		console.log('[package] Extracting Node.js tarball...');
		await new Promise((resolve, reject) => {
			// Use relative paths and cwd to avoid tar on Windows interpreting "D:" as a remote host
			const proc = spawn('tar', ['-xzf', 'node-runtime/node.tar.gz', '-C', 'node-runtime', '--strip-components=1'], { cwd: destDir, stdio: 'inherit' });
			proc.on('close', code => code === 0 ? resolve() : reject(new Error(`tar exit ${code}`)));
			proc.on('error', reject);
		});
		rmSync(tarPath, { force: true });
		console.log(`[package] Node.js extracted to ${nodeDir}`);
	}
}

async function packageForPlatform(platform) {
	const arch = 'x64';
	const folderName = `ywcoder-web-${platform}-${arch}`;
	const destDir = join(options.outDir, folderName);

	console.log(`\n[package] Packaging ${folderName}...`);

	if (existsSync(destDir)) {
		console.log(`[package] Removing existing ${destDir}`);
		rmSync(destDir, { recursive: true, force: true });
	}
	ensureDir(destDir);

	// Server code
	console.log('[package] Copying server code (out/)...');
	cpSync(join(repoRoot, 'out'), join(destDir, 'out'), {
		recursive: true,
		dereference: true,
		filter: src => !src.endsWith('.map')
	});

	// Web bundle
	console.log('[package] Copying web bundle (out-vscode-web/)...');
	cpSync(join(repoRoot, 'out-vscode-web'), join(destDir, 'out-vscode-web'), {
		recursive: true,
		dereference: true,
		filter: src => !src.endsWith('.map')
	});

	// Builtin extensions: prefer bundled .build/extensions if available
	const extensionsSource = existsSync(join(repoRoot, '.build', 'extensions'))
		? join(repoRoot, '.build', 'extensions')
		: join(repoRoot, 'extensions');
	console.log(`[package] Copying builtin extensions from ${extensionsSource}...`);
	cpSync(extensionsSource, join(destDir, 'extensions'), {
		recursive: true,
		dereference: true,
		filter: src => {
			const relative = src.slice(extensionsSource.length + 1).replace(/\\/g, '/');
			// Skip source maps and test files
			if (relative.endsWith('.map')) { return false; }
			if (relative.includes('/test/') || relative.includes('/tests/')) { return false; }
			return true;
		}
	});

	// Product and package metadata
	console.log('[package] Copying product.json and package.json...');
	copyFileSync(join(repoRoot, 'product.json'), join(destDir, 'product.json'));
	// Use remote/package.json as the deployment package.json (production dependencies)
	copyFileSync(join(repoRoot, 'remote', 'package.json'), join(destDir, 'package.json'));
	if (existsSync(join(repoRoot, 'remote', 'package-lock.json'))) {
		copyFileSync(join(repoRoot, 'remote', 'package-lock.json'), join(destDir, 'package-lock.json'));
	}

	// Node modules
	const isHostMatch = process.platform === platform;
	if (isHostMatch && existsSync(join(repoRoot, 'remote', 'node_modules'))) {
		console.log('[package] Copying production node_modules (remote/node_modules)...');
		cpSync(join(repoRoot, 'remote', 'node_modules'), join(destDir, 'node_modules'), { recursive: true, dereference: true });

		// remote/node_modules may be missing prebuilt native binaries; fill gaps from root node_modules
		if (existsSync(join(repoRoot, 'node_modules'))) {
			syncNativeBinaries(join(repoRoot, 'node_modules'), join(destDir, 'node_modules'));
		}
	} else {
		console.log(`[package] Skipping bundled node_modules for ${platform} (host mismatch or not found).`);
		console.log('[package] Target system must run `npm ci` using package.json/package-lock.json before first start.');
	}

	// Ensure package.json declares ESM so Node.js doesn't warn/reparse server-main.js
	const destPackageJsonPath = join(destDir, 'package.json');
	const destPackageJson = JSON.parse(readFileSync(destPackageJsonPath, 'utf8'));
	destPackageJson.type = 'module';
	writeFileSync(destPackageJsonPath, JSON.stringify(destPackageJson, null, 2), 'utf8');

	// Node runtime
	if (options.downloadNode) {
		await downloadNode(platform, arch, destDir);

		// One-click launcher script
		if (platform === 'win32') {
			const launcherSrc = join(repoRoot, 'scripts', 'launch-server.js');
			if (existsSync(launcherSrc)) {
				copyFileSync(launcherSrc, join(destDir, 'launch-server.cjs'));
			}
		}
	}

	// Dependency installer for cross-platform packages
	if (!isHostMatch || !existsSync(join(destDir, 'node_modules'))) {
		createInstallDepsScript(destDir, platform);
	}

	// Startup scripts
	console.log('[package] Creating startup scripts...');
	createStartupScripts(destDir, platform, arch);

	// README
	createReadme(destDir, platform, arch);

	console.log(`[package] Done: ${destDir}`);
}

function createInstallDepsScript(destDir, platform) {
	console.log('[package] Creating dependency installer...');
	if (platform === 'win32') {
		const bat = `@echo off
setlocal

cd /d "%~dp0"

if exist "node_modules" (
    echo node_modules already exists. Skipping install.
    exit /b 0
)

if not exist "package-lock.json" (
    echo Error: package-lock.json not found.
    exit /b 1
)

echo Installing production dependencies for YwCoder Web Server...
npm ci --production

endlocal
`;
		writeFileSync(join(destDir, 'install-deps.bat'), bat, 'utf8');
	} else {
		const sh = `#!/usr/bin/env bash
set -e

YWCODER_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$YWCODER_DIR"

if [ -d "node_modules" ]; then
    echo "node_modules already exists. Skipping install."
    exit 0
fi

if [ ! -f "package-lock.json" ]; then
    echo "Error: package-lock.json not found."
    exit 1
fi

echo "Installing production dependencies for YwCoder Web Server..."
npm ci --production

echo "Dependencies installed. You can now run ./start-server.sh"
`;
		const shPath = join(destDir, 'install-deps.sh');
		writeFileSync(shPath, sh, 'utf8');
		if (process.platform !== 'win32') {
			try { chmodSync(shPath, 0o755); } catch { /* ignore */ }
		}
	}
}

function createStartupScripts(destDir, platform, arch) {
	const port = 8001;
	const locale = 'zh-cn';
	const token = generateToken();

	if (platform === 'win32') {
		const bat = options.downloadNode
			? `@echo off
setlocal

set "YWCODER_DIR=%~dp0"
cd /d "%YWCODER_DIR%"

set NODE_EXE=.\\node-runtime\\node.exe
if not exist "%NODE_EXE%" (
    echo Error: bundled Node.js not found at %NODE_EXE%.
    exit /b 1
)

for /f "tokens=1 delims=v" %%a in ('"%NODE_EXE%" --version') do (
    echo Using bundled Node.js: %%a
)

set NODE_ENV=production
set VSCODE_NLS_CONFIG={"locale":"${locale}","availableLanguages":{"*":"${locale}"}}

echo Starting YwCoder Web Server on port ${port}...
"%NODE_EXE%" out/server-main.js --port ${port} --connection-token ${token} --accept-server-license-terms %*

endlocal
`
			: `@echo off
setlocal

set "YWCODER_DIR=%~dp0"
cd /d "%YWCODER_DIR%"

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo Error: Node.js is not found in PATH.
    echo Please install Node.js ${NODE_VERSION} or run packaging with --download-node.
    exit /b 1
)

for /f "tokens=1 delims=v" %%a in ('node --version') do (
    echo Using Node.js: %%a
)

set NODE_ENV=production
set VSCODE_NLS_CONFIG={"locale":"${locale}","availableLanguages":{"*":"${locale}"}}

echo Starting YwCoder Web Server on port ${port}...
node out/server-main.js --port ${port} --connection-token ${token} --accept-server-license-terms %*

endlocal
`;
		writeFileSync(join(destDir, 'start-server.bat'), bat, 'utf8');

		if (options.downloadNode) {
			const launcherBat = `@echo off
setlocal

set "YWCODER_DIR=%~dp0"
cd /d "%YWCODER_DIR%"

set NODE_EXE=.\\node-runtime\\node.exe
if not exist "%NODE_EXE%" (
    echo Error: bundled Node.js not found at %NODE_EXE%.
    exit /b 1
)

"%NODE_EXE%" launch-server.cjs %*

endlocal
`;
			writeFileSync(join(destDir, 'YwCoder-Web.bat'), launcherBat, 'utf8');

			const stopBat = `@echo off
setlocal

cd /d "%~dp0"

if not exist "server.pid" (
    echo YwCoder Web Server is not running.
    exit /b 0
)

set /p PID=<server.pid
if "%PID%"=="" (
    echo YwCoder Web Server is not running.
    del server.pid
    exit /b 0
)

echo Stopping YwCoder Web Server (PID %PID%)...
taskkill /PID %PID% /T /F >nul 2>&1
del server.pid

echo Stopped.

endlocal
`;
			writeFileSync(join(destDir, 'YwCoder-Web-Stop.bat'), stopBat, 'utf8');
		}
	}

	const nodeCmd = options.downloadNode
		? (platform === 'win32' ? '.\\node-runtime\\node.exe' : './node-runtime/bin/node')
		: 'node';
	const sh = `#!/usr/bin/env bash
set -e

YWCODER_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$YWCODER_DIR"

NODE_CMD="${nodeCmd}"
if ! command -v "$NODE_CMD" &> /dev/null; then
    echo "Error: Node.js is not found in PATH."
    echo "Please install Node.js ${NODE_VERSION} or run packaging with --download-node."
    exit 1
fi

NODE_VERSION_ACTUAL=$("$NODE_CMD" --version)
echo "Using Node.js: $NODE_VERSION_ACTUAL"

export NODE_ENV=production
export VSCODE_NLS_CONFIG='{"locale":"${locale}","availableLanguages":{"*":"${locale}"}}'

echo "Starting YwCoder Web Server on port ${port}..."
"$NODE_CMD" out/server-main.js --port ${port} --connection-token ${token} --accept-server-license-terms "$@"
`;
	const shPath = join(destDir, 'start-server.sh');
	writeFileSync(shPath, sh, 'utf8');
	if (process.platform !== 'win32') {
		try { chmodSync(shPath, 0o755); } catch { /* ignore */ }
	}
}

function generateToken() {
	return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

function createReadme(destDir, platform, arch) {
	const nodeSection = options.downloadNode
		? 'This package includes a Node.js runtime in `node-runtime/`. No separate Node.js installation is required.'
		: `This package requires Node.js ${NODE_VERSION} to be installed on the target machine.`;

	const nodeModulesSection = existsSync(join(destDir, 'node_modules'))
		? 'Production dependencies are included in `node_modules/`.'
		: '`node_modules/` is NOT bundled in this package. On the target machine, run `npm ci --production` using the included `package.json` and `package-lock.json` before first start.';

	const readme = `# YwCoder Web Deployment Package

- Platform: ${platform} (${arch})
- Version: ${YWCODER_VERSION}
- Generated: ${new Date().toISOString()}

## Contents

- \`out/\` - Server-side code
- \`out-vscode-web/\` - Web workbench bundle (Chinese NLS included)
- \`extensions/\` - Builtin extensions (including Simplified Chinese language pack)
- \`product.json\` - Product configuration
- \`package.json\` / \`package-lock.json\` - Production dependencies manifest
- \`start-server.bat\` / \`start-server.sh\` - Startup scripts
${platform === 'win32' && options.downloadNode ? '- `YwCoder-Web.bat` - One-click launcher (starts server in background and opens browser)\n- `YwCoder-Web-Stop.bat` - Stop the background server\n' : ''}- \`install-deps.bat\` / \`install-deps.sh\` - Dependency installer (when node_modules is not bundled)

## Requirements

${nodeSection}

${nodeModulesSection}

## Quick Start

### ${platform === 'win32' ? 'Windows' : 'Linux'}

${platform === 'win32' && options.downloadNode ? 'Double-click `YwCoder-Web.bat`. A terminal opens, the server starts in the background, and the browser opens. You can close the terminal after the browser opens.\n\nTo stop the server later, double-click `YwCoder-Web-Stop.bat`.\n\nOr run from the command line:\n\n```bash\nYwCoder-Web.bat\n```\n\nAlternatively, use the manual startup script:\n\n' : ''}\`\`\`bash
${platform === 'win32' ? 'start-server.bat' : './start-server.sh'}
\`\`\`

Then open: http://localhost:8001

## Configuration

Edit the startup script to change:

- \`--port 8001\` - Listen port
- \`--connection-token ...\` - Access token (generate a strong random token for production)
- \`--server-data-dir\` - Data directory (defaults to ~/.ywcoder-server)

## Updating NLS translations

If you update the language pack, rebuild the web bundle and regenerate Chinese NLS:

\`\`\`bash
node build/next/index.ts bundle --nls --target web --out out-vscode-web
node scripts/generate-nls-zh-cn.mjs
\`\`\`

Then re-run this packaging script.

## Security Notes

- Replace the auto-generated connection token with a strong secret.
- Run behind a reverse proxy (nginx, IIS, etc.) with HTTPS in production.
- Bind to localhost or a private interface if not using a reverse proxy.
`;

	writeFileSync(join(destDir, 'README.md'), readme, 'utf8');
}

async function main() {
	try {
		await buildWebBundle();
		verifyArtifacts();

		ensureDir(options.outDir);

		for (const platform of platforms) {
			await packageForPlatform(platform);
		}

		console.log('\n[package] All packages created successfully.');
		console.log(`[package] Output directory: ${options.outDir}`);
	} catch (err) {
		console.error('[package] Error:', err.message);
		if (err.stack) {
			console.error(err.stack);
		}
		process.exit(1);
	}
}

main();
