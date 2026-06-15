#!/usr/bin/env node
/**
 * Archive YwCoder Web deployment bundles.
 *
 * Usage:
 *   node scripts/archive-web-deployment.mjs --platform win32
 *   node scripts/archive-web-deployment.mjs --platform linux
 *   node scripts/archive-web-deployment.mjs --platform all
 *
 * Options:
 *   --platform win32|linux|all   Target platform(s) (default: all)
 *   --out-dir <dir>              Output directory (default: dist)
 */

import { existsSync, rmSync, writeFileSync, mkdtempSync } from 'fs';
import { join, basename } from 'path';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import os from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

function parseArgs() {
	const args = process.argv.slice(2);
	const options = {
		platform: 'all',
		outDir: join(repoRoot, 'dist')
	};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === '--platform' && i + 1 < args.length) {
			options.platform = args[++i];
		} else if (arg === '--out-dir' && i + 1 < args.length) {
			options.outDir = args[++i];
		}
	}

	return options;
}

const options = parseArgs();
const platforms = options.platform === 'all' ? ['win32', 'linux'] : [options.platform];

function run(command, args, cwd) {
	return new Promise((resolve, reject) => {
		console.log(`[archive] Running: ${command} ${args.join(' ')}`);
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

function canRun(command) {
	return new Promise(resolve => {
		const check = process.platform === 'win32' ? 'where' : 'command';
		const checkArg = process.platform === 'win32' ? command : ['-v', command];
		const proc = spawn(check, Array.isArray(checkArg) ? checkArg : [checkArg], { stdio: 'ignore' });
		proc.on('close', code => resolve(code === 0));
		proc.on('error', () => resolve(false));
	});
}

async function archiveWin32() {
	const sourceDir = join(options.outDir, 'ywcoder-web-win32-x64');
	const zipPath = join(options.outDir, 'ywcoder-web-win32-x64.zip');
	const tarPath = join(options.outDir, 'ywcoder-web-win32-x64.tar.gz');

	if (!existsSync(sourceDir)) {
		throw new Error(`Source directory not found: ${sourceDir}`);
	}

	if (existsSync(zipPath)) {
		console.log(`[archive] Removing existing ${basename(zipPath)}`);
		rmSync(zipPath, { force: true });
	}
	if (existsSync(tarPath)) {
		console.log(`[archive] Removing existing ${basename(tarPath)}`);
		rmSync(tarPath, { force: true });
	}

	// Prefer Python zipfile (fast with many small files), then 7z, then tar.gz
	const hasPython = await canRun('python');
	if (hasPython) {
		console.log(`[archive] Creating ${basename(zipPath)} with Python zipfile...`);
		const tmpDir = mkdtempSync(join(os.tmpdir(), 'ywcoder-archive-'));
		const pyScript = join(tmpDir, 'makezip.py');
		writeFileSync(pyScript, `
import os, sys, zipfile
source = sys.argv[1]
output = sys.argv[2]
with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED, compresslevel=1) as zf:
    for root, dirs, files in os.walk(source):
        for f in files:
            path = os.path.join(root, f)
            arcname = os.path.relpath(path, os.path.dirname(source))
            zf.write(path, arcname)
print('Created', output)
`, 'utf8');
		await run('python', [pyScript, sourceDir, zipPath], repoRoot);
		rmSync(tmpDir, { recursive: true, force: true });
		console.log(`[archive] Done: ${zipPath}`);
		return;
	}

	const has7z = await canRun('7z');
	if (has7z) {
		console.log(`[archive] Creating ${basename(zipPath)} with 7-Zip...`);
		await run('7z', ['a', '-r', zipPath, sourceDir], repoRoot);
		console.log(`[archive] Done: ${zipPath}`);
		return;
	}

	console.log('[archive] No fast zip tool found; falling back to tar.gz (Windows 10/11 can extract it natively)');
	await run('tar', ['-czf', tarPath, '-C', options.outDir, basename(sourceDir)], repoRoot);
	console.log(`[archive] Done: ${tarPath}`);
}

async function archiveLinux() {
	const sourceDir = join(options.outDir, 'ywcoder-web-linux-x64');
	const tarPath = join(options.outDir, 'ywcoder-web-linux-x64.tar.gz');

	if (!existsSync(sourceDir)) {
		throw new Error(`Source directory not found: ${sourceDir}`);
	}

	if (existsSync(tarPath)) {
		console.log(`[archive] Removing existing ${basename(tarPath)}`);
		rmSync(tarPath, { force: true });
	}

	console.log(`[archive] Creating ${basename(tarPath)}...`);
	await run('tar', ['-czf', tarPath, '-C', options.outDir, basename(sourceDir)], repoRoot);
	console.log(`[archive] Done: ${tarPath}`);
}

async function main() {
	try {
		for (const platform of platforms) {
			if (platform === 'win32') {
				await archiveWin32();
			} else if (platform === 'linux') {
				await archiveLinux();
			}
		}
		console.log('\n[archive] All archives created successfully.');
	} catch (err) {
		console.error('[archive] Error:', err.message);
		process.exit(1);
	}
}

main();
