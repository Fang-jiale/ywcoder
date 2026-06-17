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
		arch: process.arch,
		downloadNode: false,
		skipBuild: false,
		skipExtensionBuild: false,
		outDir: join(repoRoot, 'dist')
	};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === '--platform' && i + 1 < args.length) {
			options.platform = args[++i];
		} else if (arg === '--arch' && i + 1 < args.length) {
			options.arch = args[++i];
		} else if (arg === '--download-node') {
			options.downloadNode = true;
		} else if (arg === '--skip-build') {
			options.skipBuild = true;
		} else if (arg === '--skip-extension-build') {
			options.skipExtensionBuild = true;
		} else if (arg === '--out-dir' && i + 1 < args.length) {
			options.outDir = args[++i];
		}
	}

	return options;
}

const options = parseArgs();
const platforms = options.platform === 'all'
	? ['win32', 'linux']
	: [options.platform];
const archs = [options.arch];

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
			if (entry.isSymbolicLink()) {
				continue;
			}
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

function makeCopyFilter(sourceRoot, { skipTests = false, skipBin = true } = {}) {
	return src => {
		const relative = src.slice(sourceRoot.length + 1).replace(/\\/g, '/');
		if (relative.endsWith('.map')) { return false; }
		if (skipTests && (relative.includes('/test/') || relative.includes('/tests/'))) { return false; }
		if (skipBin && (relative.includes('/.bin/') || relative.startsWith('.bin/'))) { return false; }
		try {
			statSync(src);
		} catch {
			console.log(`[package] Skipping broken symlink: ${src}`);
			return false;
		}
		return true;
	};
}

function run(command, args, cwd) {
	return new Promise((resolve, reject) => {
		console.log(`[package] Running: ${command} ${args.join(' ')}`);
		if (process.platform === 'win32' && command.includes(' ')) {
			command = `"${command}"`;
		}
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

async function buildServerCode() {
	if (options.skipBuild) {
		console.log('[package] Skipping server code build (--skip-build)');
		return;
	}

	console.log('[package] Building server code...');
	await run(process.execPath, [
		'build/next/index.ts',
		'transpile',
		'--out',
		'out'
	], repoRoot);
}

function syncNLSFilesToOut() {
	console.log('[package] Syncing NLS metadata to out/ for server-side localization...');
	const files = ['nls.messages.json', 'nls.keys.json', 'nls.metadata.json'];
	for (const file of files) {
		const src = join(repoRoot, 'out-vscode-web', file);
		const dest = join(repoRoot, 'out', file);
		if (existsSync(src)) {
			copyFileSync(src, dest);
			console.log(`[package]   ${file} -> out/`);
		}
	}
}

async function buildYwcoderExtension() {
	if (options.skipExtensionBuild) {
		console.log('[package] Skipping YwCoder extension build (--skip-extension-build)');
		return;
	}

	const extensionDir = join(repoRoot, '..', 'extension');
	if (!existsSync(extensionDir)) {
		console.log('[package] YwCoder extension source not found, skipping extension build');
		return;
	}

	console.log('[package] Building YwCoder extension from source...');
	if (!existsSync(join(extensionDir, 'node_modules'))) {
		console.log('[package] Installing extension dependencies...');
		await run('npm', ['ci'], extensionDir);
	}

	await run('npm', ['run', 'build'], extensionDir);

	const sourceDist = join(extensionDir, 'dist');
	const targetDist = join(repoRoot, 'extensions', 'ywcoder', 'dist');
	console.log(`[package] Copying extension dist to ${targetDist}...`);
	if (existsSync(targetDist)) {
		rmSync(targetDist, { recursive: true, force: true });
	}
	ensureDir(targetDist);
	cpSync(sourceDist, targetDist, { recursive: true, dereference: true });
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

	verifyAboutDialogContent();
}

function verifyAboutDialogContent() {
	const bundlePath = join(repoRoot, 'out-vscode-web', 'vs', 'code', 'browser', 'workbench', 'workbench.js');
	if (!existsSync(bundlePath)) {
		throw new Error('Cannot verify about dialog: bundled workbench.js is missing');
	}

	const bundle = readFileSync(bundlePath, 'utf8');
	// The contact line is appended outside localize(), so it appears as a runtime
	// string literal (possibly Unicode-escaped by the bundler/minifier).
	const expectedLiteral = '数据中心运维支持部出品，联系人：方家乐，杨偲嘉';
	const expectedEscaped = expectedLiteral.split('').map(c => `\\u${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`).join('');
	if (!bundle.includes(expectedLiteral) && !bundle.includes(expectedEscaped)) {
		throw new Error('About dialog contact line is missing from the bundled workbench.js; the NLS translation may have overridden it.');
	}
	console.log('[package]   About dialog contact line verified in workbench.js');
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
		// Use unofficial glibc-217 build on Linux so the package runs on older distributions (glibc >= 2.17)
		const url = platform === 'linux'
			? `https://unofficial-builds.nodejs.org/download/release/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${arch}-glibc-217.tar.gz`
			: `${NODE_BASE_URL}/v${NODE_VERSION}/node-v${NODE_VERSION}-${platform}-${arch}.tar.gz`;
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

		// Verify the extracted Linux Node binary is present and linked against a low glibc.
		const nodeBin = join(nodeDir, 'bin', 'node');
		if (!existsSync(nodeBin)) {
			throw new Error(`Bundled Node binary not found after extraction: ${nodeBin}`);
		}
		if (process.platform === 'linux') {
			await verifyGlibc(nodeBin);
		} else {
			console.log(`[package]   ${nodeBin} extracted (glibc verification skipped on ${process.platform})`);
		}
	}
}

function parseVersion(versionStr) {
	return versionStr.split('.').map(Number);
}

function compareVersions(a, b) {
	const av = parseVersion(a);
	const bv = parseVersion(b);
	for (let i = 0; i < Math.max(av.length, bv.length); i++) {
		const ai = av[i] || 0;
		const bi = bv[i] || 0;
		if (ai !== bi) {
			return ai - bi;
		}
	}
	return 0;
}

function verifyGlibc(nodeBin) {
	return new Promise((resolve, reject) => {
		const proc = spawn('objdump', ['-T', nodeBin], { stdio: ['ignore', 'pipe', 'pipe'] });
		let stdout = '';
		proc.stdout.on('data', d => { stdout += d; });
		proc.on('close', code => {
			if (code !== 0) {
				console.log('[package]   Could not verify glibc version (objdump unavailable)');
				resolve();
				return;
			}
			const versions = [...stdout.matchAll(/GLIBC_(\d+\.\d+)/g)].map(m => m[1]);
			const maxVersion = versions.reduce((max, v) => compareVersions(v, max) > 0 ? v : max, '0');
			console.log(`[package]   Bundled Node max glibc requirement: ${maxVersion}`);
			if (compareVersions(maxVersion, '2.17') > 0) {
				reject(new Error(`Bundled Node requires glibc ${maxVersion}; expected <= 2.17. The unofficial glibc-217 build may not have been used.`));
			} else {
				resolve();
			}
		});
		proc.on('error', () => {
			console.log('[package]   Could not verify glibc version (objdump unavailable)');
			resolve();
		});
	});
}

async function packageForPlatform(platform, arch) {
	const folderName = `ywcoder-web-${platform}-${arch}`;
	const destDir = join(options.outDir, folderName);

	console.log(`\n[package] Packaging ${folderName}...`);

	if (existsSync(destDir)) {
		console.log(`[package] Removing existing ${destDir}`);
		rmSync(destDir, { recursive: true, force: true });
	}
	ensureDir(destDir);

	// Server code
	const outSource = join(repoRoot, 'out');
	console.log('[package] Copying server code (out/)...');
	cpSync(outSource, join(destDir, 'out'), {
		recursive: true,
		dereference: true,
		filter: makeCopyFilter(outSource)
	});

	// Web bundle
	const outVscodeWebSource = join(repoRoot, 'out-vscode-web');
	console.log('[package] Copying web bundle (out-vscode-web/)...');
	cpSync(outVscodeWebSource, join(destDir, 'out-vscode-web'), {
		recursive: true,
		dereference: true,
		filter: makeCopyFilter(outVscodeWebSource)
	});

	// Builtin extensions: always start from source extensions/, then overlay .build/extensions if present
	const extensionsBaseSource = join(repoRoot, 'extensions');
	const extensionsBundledSource = join(repoRoot, '.build', 'extensions');
	console.log(`[package] Copying builtin extensions from ${extensionsBaseSource}...`);
	cpSync(extensionsBaseSource, join(destDir, 'extensions'), {
		recursive: true,
		dereference: true,
		filter: makeCopyFilter(extensionsBaseSource, { skipTests: true })
	});
	if (existsSync(extensionsBundledSource)) {
		console.log(`[package] Merging bundled extensions from ${extensionsBundledSource}...`);
		cpSync(extensionsBundledSource, join(destDir, 'extensions'), {
			recursive: true,
			dereference: true,
			filter: makeCopyFilter(extensionsBundledSource, { skipTests: true })
		});
	}

	// Product and package metadata
	console.log('[package] Copying product.json and package.json...');
	copyFileSync(join(repoRoot, 'product.json'), join(destDir, 'product.json'));
	// Use remote/package.json as the deployment package.json (production dependencies)
	copyFileSync(join(repoRoot, 'remote', 'package.json'), join(destDir, 'package.json'));
	if (existsSync(join(repoRoot, 'remote', 'package-lock.json'))) {
		copyFileSync(join(repoRoot, 'remote', 'package-lock.json'), join(destDir, 'package-lock.json'));
	}

	// Node modules
	const isHostMatch = process.platform === platform && process.arch === arch;
	const remoteNodeModulesSource = join(repoRoot, 'remote', 'node_modules');
	if (isHostMatch && existsSync(remoteNodeModulesSource)) {
		console.log('[package] Copying production node_modules (remote/node_modules)...');
		cpSync(remoteNodeModulesSource, join(destDir, 'node_modules'), {
			recursive: true,
			dereference: true,
			filter: makeCopyFilter(remoteNodeModulesSource)
		});

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
		const nodeCheck = options.downloadNode
			? `
$NODE_EXE = Join-Path $YWCODER_DIR 'node-runtime' 'node.exe'
if (-not (Test-Path $NODE_EXE)) {
    Write-Host "Error: bundled Node.js not found at $NODE_EXE."
    Write-Host 'Please re-package with --download-node or restore the node-runtime/ directory.'
    exit 1
}
`
			: `
$NODE_EXE = 'node'
if (-not (Get-Command $NODE_EXE -ErrorAction SilentlyContinue)) {
    Write-Host 'Error: Node.js is not found in PATH.'
    Write-Host 'Please install Node.js ${NODE_VERSION} or package with --download-node.'
    exit 1
}
`;

		const startPs1 = `param(
    [string]$Port = '${port}',
    [string]$ListenHost = 'localhost'
)

$YWCODER_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
${nodeCheck}
$nodeVersion = & $NODE_EXE --version 2>$null
Write-Host "Using Node.js: $nodeVersion"

$env:NODE_ENV = 'production'
$env:VSCODE_NLS_CONFIG = '{"locale":"${locale}","availableLanguages":{"*":"${locale}"}}'

$extDir = Join-Path $env:USERPROFILE '.ywcoder-server\\extensions'
$wsDir = Join-Path $env:USERPROFILE '.ywcoder-server\\workspace'
New-Item -ItemType Directory -Force -Path $extDir | Out-Null
New-Item -ItemType Directory -Force -Path $wsDir | Out-Null

$pidFile = Join-Path $YWCODER_DIR 'ywcoder-server.pid'
if (Test-Path $pidFile) {
    $existingPid = Get-Content $pidFile -TotalCount 1
    $proc = Get-Process -Id $existingPid -ErrorAction SilentlyContinue
    if ($proc) {
        Write-Host "Found existing server process $existingPid, stopping it first..."
        & (Join-Path $YWCODER_DIR 'stop-server.ps1') -Quiet
    } else {
        Remove-Item $pidFile -Force
    }
}

Write-Host "Starting YwCoder Web Server on $ListenHost\`:$Port..."

$logFile = Join-Path $YWCODER_DIR 'ywcoder-server.log'
$errFile = Join-Path $YWCODER_DIR 'ywcoder-server.err.log'

$proc = Start-Process -FilePath $NODE_EXE \`
    -ArgumentList @(
        'out/server-main.js',
        '--host', $ListenHost,
        '--port', $Port,
        '--connection-token', '${token}',
        '--builtin-extensions-dir', 'extensions',
        '--accept-server-license-terms'
    ) \`
    -WorkingDirectory $YWCODER_DIR \`
    -WindowStyle Hidden \`
    -RedirectStandardOutput $logFile \`
    -RedirectStandardError $errFile \`
    -PassThru

$proc.Id | Out-File -FilePath $pidFile -Encoding ASCII -NoNewline
Write-Host "Server started. PID: $($proc.Id)"
Write-Host "Web UI available at http://$ListenHost\`:$($Port)?tkn=${token}"
`;

		const stopPs1 = `param(
    [switch]$Quiet
)

$YWCODER_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$KILLED = $false

$pidFile = Join-Path $YWCODER_DIR 'ywcoder-server.pid'
if (Test-Path $pidFile) {
    $pidValue = Get-Content $pidFile -TotalCount 1
    $proc = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
    if ($proc) {
        Write-Host "Stopping server process $pidValue..."
        Stop-Process -Id $pidValue -Force -ErrorAction SilentlyContinue
        $KILLED = $true
    }
    Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
}

$procs = Get-CimInstance Win32_Process | Where-Object {
    $_.Name -eq 'node.exe' -and
    $_.CommandLine -like "*$YWCODER_DIR*"
}

foreach ($p in $procs) {
    Write-Host "Stopping fallback process $($p.ProcessId)..."
    Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
    $KILLED = $true
}

if ($KILLED) {
    Write-Host 'Server stopped.'
} elseif (-not $Quiet) {
    Write-Host 'No running YwCoder server process found.'
}
`;

		const startBat = `@echo off
setlocal

set "YWCODER_DIR=%~dp0"
cd /d "%YWCODER_DIR%"

powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0start-server.ps1" %*

endlocal
`;

		const stopBat = `@echo off
setlocal

set "YWCODER_DIR=%~dp0"
cd /d "%YWCODER_DIR%"

powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0stop-server.ps1" %*

endlocal
`;

		const restartBat = `@echo off
setlocal

call "%~dp0stop-server.bat"
timeout /t 2 /nobreak >nul
call "%~dp0start-server.bat" %*

endlocal
`;

		writeFileSync(join(destDir, 'start-server.ps1'), startPs1, 'utf8');
		writeFileSync(join(destDir, 'stop-server.ps1'), stopPs1, 'utf8');
		writeFileSync(join(destDir, 'start-server.bat'), startBat, 'utf8');
		writeFileSync(join(destDir, 'stop-server.bat'), stopBat, 'utf8');
		writeFileSync(join(destDir, 'restart-server.bat'), restartBat, 'utf8');
	}

	const nodeCmd = options.downloadNode
		? (platform === 'win32' ? '.\\node-runtime\\node.exe' : './node-runtime/bin/node')
		: 'node';

	const startSh = `#!/usr/bin/env bash
set -e

YWCODER_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$YWCODER_DIR"

PORT="\${1:-${port}}"
HOST="\${2:-localhost}"

NODE_CMD="${nodeCmd}"
if [ ! -f "$NODE_CMD" ]; then
${options.downloadNode ? `
    echo "Error: bundled Node.js not found at $NODE_CMD."
    echo "Please re-package with --download-node or restore the node-runtime/ directory."
    exit 1
` : `
    NODE_CMD="node"
`}
fi

if ! command -v "$NODE_CMD" &> /dev/null; then
    echo "Error: Node.js is not found."
    echo "Please install Node.js ${NODE_VERSION} or run packaging with --download-node."
    exit 1
fi

NODE_VERSION_ACTUAL=$("$NODE_CMD" --version)
echo "Using Node.js: $NODE_VERSION_ACTUAL"

export NODE_ENV=production
export VSCODE_NLS_CONFIG='{"locale":"${locale}","availableLanguages":{"*":"${locale}"}}'

mkdir -p ~/.ywcoder-server/extensions
mkdir -p ~/.ywcoder-server/workspace

if [ -f "ywcoder-server.pid" ]; then
    PID=$(cat ywcoder-server.pid)
    if kill -0 "$PID" 2>/dev/null; then
        echo "Found existing server process $PID, stopping it first..."
        "$YWCODER_DIR/stop-server.sh"
    else
        rm -f ywcoder-server.pid
    fi
fi

echo "Starting YwCoder Web Server on $HOST:$PORT..."

nohup "$NODE_CMD" out/server-main.js \\
    --host "$HOST" \\
    --port "$PORT" \\
    --connection-token ${token} \\
    --builtin-extensions-dir extensions \\
    --accept-server-license-terms \\
    > ywcoder-server.log 2> ywcoder-server.err.log &

SERVER_PID=$!
echo "$SERVER_PID" > ywcoder-server.pid
echo "Server started. PID: $SERVER_PID"
echo "Web UI available at http://$HOST:$PORT?tkn=${token}"
`;

	const stopSh = `#!/usr/bin/env bash
set -e

YWCODER_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$YWCODER_DIR"

KILLED=0

if [ -f "ywcoder-server.pid" ]; then
    PID=$(cat ywcoder-server.pid)
    if kill -0 "$PID" 2>/dev/null; then
        echo "Stopping server process $PID..."
        kill -9 "$PID" 2>/dev/null || true
        KILLED=1
    fi
    rm -f ywcoder-server.pid
fi

PIDS=$(pgrep -f "out/server-main.js" || true)
if [ -n "$PIDS" ]; then
    for PID in $PIDS; do
        CMDLINE=$(cat "/proc/$PID/cmdline" 2>/dev/null | tr '\\0' ' ')
        if echo "$CMDLINE" | grep -q "$YWCODER_DIR"; then
            echo "Stopping fallback process $PID..."
            kill -9 "$PID" 2>/dev/null || true
            KILLED=1
        fi
    done
fi

if [ "$KILLED" -eq 1 ]; then
    echo "Server stopped."
else
    echo "No running YwCoder server process found."
fi
`;

	const restartSh = `#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
"$SCRIPT_DIR/stop-server.sh"
sleep 2
"$SCRIPT_DIR/start-server.sh" "$@"
`;

	const startPath = join(destDir, 'start-server.sh');
	const stopPath = join(destDir, 'stop-server.sh');
	const restartPath = join(destDir, 'restart-server.sh');
	writeFileSync(startPath, startSh, 'utf8');
	writeFileSync(stopPath, stopSh, 'utf8');
	writeFileSync(restartPath, restartSh, 'utf8');

	if (process.platform !== 'win32') {
		try {
			chmodSync(startPath, 0o755);
			chmodSync(stopPath, 0o755);
			chmodSync(restartPath, 0o755);
			const bundledNode = join(destDir, 'node-runtime', 'bin', 'node');
			if (existsSync(bundledNode)) {
				chmodSync(bundledNode, 0o755);
			}
		} catch { /* ignore */ }
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
		await buildYwcoderExtension();
		await buildServerCode();
		await buildWebBundle();
		syncNLSFilesToOut();
		verifyArtifacts();

		ensureDir(options.outDir);

		for (const platform of platforms) {
			for (const arch of archs) {
				await packageForPlatform(platform, arch);
			}
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
