#!/usr/bin/env node
/**
 * Create a platform-independent incremental update package for the YwCoder
 * extension targeting the VS Code Web (browser) deployment.
 *
 * The output zip contains only files whose content changed compared to the
 * baseline deployment. It is structured as `extensions/ywcoder/...` so it can
 * be extracted directly into any YwCoder Web deployment package
 * (win32-x64, linux-x64, linux-arm64).
 *
 * Usage:
 *   node scripts/package-ywcoder-web-incremental.mjs
 *   node scripts/package-ywcoder-web-incremental.mjs --baseline <dir> --out <zip>
 */

import {
	createReadStream,
	createWriteStream,
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
	statSync
} from 'fs';
import { createHash } from 'crypto';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';
import { ZipFile } from 'yazl';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

function parseArgs() {
	const args = process.argv.slice(2);
	const options = {
		source: join(repoRoot, 'extensions', 'ywcoder'),
		baseline: join(repoRoot, 'dist', 'ywcoder-web-win32-x64', 'extensions', 'ywcoder'),
		out: join(repoRoot, 'dist', `ywcoder-web-incremental-update-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.zip`)
	};
	for (let i = 0; i < args.length; i++) {
		if (args[i] === '--source' && i + 1 < args.length) options.source = args[++i];
		else if (args[i] === '--baseline' && i + 1 < args.length) options.baseline = args[++i];
		else if (args[i] === '--out' && i + 1 < args.length) options.out = args[++i];
	}
	return options;
}

const options = parseArgs();

const STATIC_FILES = new Set([
	'package.json',
	'LICENSE',
	'README.md',
	'README_CN.md',
	'.vscodeignore'
]);

function isWebRelevant(relPath) {
	if (STATIC_FILES.has(relPath)) return true;
	if (relPath === 'dist/browser.cjs') return true;
	if (relPath.startsWith('dist/media/')) return true;
	if (relPath.startsWith('resources/')) return true;
	return false;
}

function sha256(path) {
	return new Promise((resolve, reject) => {
		const hash = createHash('sha256');
		const stream = createReadStream(path);
		stream.on('data', chunk => hash.update(chunk));
		stream.on('end', () => resolve(hash.digest('hex')));
		stream.on('error', reject);
	});
}

function cleanPackageJson(pkgPath) {
	const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
	delete pkg.scripts;
	delete pkg.devDependencies;
	delete pkg.dependencies;
	return JSON.stringify(pkg, null, 2);
}

async function* walk(dir, baseLen) {
	if (!existsSync(dir)) return;
	const entries = await import('fs').then(m => m.promises.readdir(dir, { withFileTypes: true }));
	for (const ent of entries) {
		const full = join(dir, ent.name);
		const rel = full.slice(baseLen + 1).replace(/\\/g, '/');
		if (ent.isDirectory()) {
			yield* walk(full, baseLen);
		} else if (ent.isFile()) {
			yield { full, rel };
		}
	}
}

async function main() {
	if (!existsSync(options.source)) {
		console.error(`Source not found: ${options.source}`);
		process.exit(1);
	}
	if (!existsSync(options.baseline)) {
		console.warn(`Baseline not found: ${options.baseline}; falling back to full replacement package.`);
	}

	// Clean package.json in a temporary source mirror so we compare/hash the
	// same cleaned manifest that is shipped in deployment packages.
	const tmpSource = join(repoRoot, '.build', 'ywcoder-incremental-tmp');
	if (existsSync(tmpSource)) rmSync(tmpSource, { recursive: true, force: true });
	mkdirSync(tmpSource, { recursive: true });

	for await (const { full, rel } of walk(options.source, options.source.length)) {
		if (!isWebRelevant(rel)) continue;
		const dest = join(tmpSource, rel);
		mkdirSync(dirname(dest), { recursive: true });
		if (rel === 'package.json') {
			writeFileSync(dest, cleanPackageJson(full), 'utf8');
		} else {
			writeFileSync(dest, readFileSync(full));
		}
	}

	const changes = [];
	for await (const { full, rel } of walk(tmpSource, tmpSource.length)) {
		const baselineFile = join(options.baseline, rel);
		if (!existsSync(baselineFile)) {
			changes.push({ rel, reason: 'add' });
			continue;
		}
		const srcHash = await sha256(full);
		const baseHash = await sha256(baselineFile);
		if (srcHash !== baseHash) {
			changes.push({ rel, reason: 'change' });
		}
	}

	if (changes.length === 0) {
		console.log('No changes detected against baseline. Nothing to package.');
		rmSync(tmpSource, { recursive: true, force: true });
		return;
	}

	mkdirSync(dirname(options.out), { recursive: true });
	if (existsSync(options.out)) rmSync(options.out, { force: true });

	const zip = new ZipFile();
	const outStream = createWriteStream(options.out);
	zip.outputStream.pipe(outStream);

	for (const { rel, reason } of changes) {
		const src = join(tmpSource, rel);
		const zipPath = `extensions/ywcoder/${rel}`;
		zip.addFile(src, zipPath);
		console.log(`[${reason}] ${zipPath}`);
	}

	zip.end();
	await new Promise((resolve, reject) => {
		outStream.on('close', resolve);
		outStream.on('error', reject);
	});

	const sizeMB = (statSync(options.out).size / 1024 / 1024).toFixed(2);
	console.log(`\nCreated incremental update package:`);
	console.log(`  ${options.out}`);
	console.log(`  ${changes.length} files, ${sizeMB} MB`);

	rmSync(tmpSource, { recursive: true, force: true });
}

main().catch(err => {
	console.error(err);
	process.exit(1);
});
