#!/usr/bin/env node
/**
 * Create a full platform-independent replacement package for the YwCoder
 * extension targeting the VS Code Web (browser) deployment.
 *
 * Unlike the incremental package, this includes all web-relevant files so it
 * can safely replace the extension in any deployment regardless of baseline
 * version.
 *
 * Usage:
 *   node scripts/package-ywcoder-web-full.mjs
 *   node scripts/package-ywcoder-web-full.mjs --source <dir> --out <zip>
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
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';
import { ZipFile } from 'yazl';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

function parseArgs() {
	const args = process.argv.slice(2);
	const options = {
		source: join(repoRoot, 'extensions', 'ywcoder'),
		out: join(repoRoot, 'dist', `ywcoder-extension-web-full-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.zip`)
	};
	for (let i = 0; i < args.length; i++) {
		if (args[i] === '--source' && i + 1 < args.length) options.source = args[++i];
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

function isIncluded(relPath) {
	if (STATIC_FILES.has(relPath)) return true;
	if (relPath.startsWith('dist/')) return true;
	if (relPath.startsWith('resources/')) return true;
	return false;
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

	const tmpSource = join(repoRoot, '.build', 'ywcoder-full-tmp');
	if (existsSync(tmpSource)) rmSync(tmpSource, { recursive: true, force: true });
	mkdirSync(tmpSource, { recursive: true });

	const included = [];
	for await (const { full, rel } of walk(options.source, options.source.length)) {
		if (!isIncluded(rel)) continue;
		const dest = join(tmpSource, rel);
		mkdirSync(dirname(dest), { recursive: true });
		if (rel === 'package.json') {
			writeFileSync(dest, cleanPackageJson(full), 'utf8');
		} else {
			writeFileSync(dest, readFileSync(full));
		}
		included.push(rel);
	}

	if (included.length === 0) {
		console.error('No extension files found.');
		rmSync(tmpSource, { recursive: true, force: true });
		process.exit(1);
	}

	mkdirSync(dirname(options.out), { recursive: true });
	if (existsSync(options.out)) rmSync(options.out, { force: true });

	const zip = new ZipFile();
	const outStream = createWriteStream(options.out);
	zip.outputStream.pipe(outStream);

	for (const rel of included) {
		const src = join(tmpSource, rel);
		const zipPath = `extensions/ywcoder/${rel}`;
		zip.addFile(src, zipPath);
	}

	zip.end();
	await new Promise((resolve, reject) => {
		outStream.on('close', resolve);
		outStream.on('error', reject);
	});

	const sizeMB = (statSync(options.out).size / 1024 / 1024).toFixed(2);
	console.log(`Created full replacement package:`);
	console.log(`  ${options.out}`);
	console.log(`  ${included.length} files, ${sizeMB} MB`);

	rmSync(tmpSource, { recursive: true, force: true });
}

main().catch(err => {
	console.error(err);
	process.exit(1);
});
