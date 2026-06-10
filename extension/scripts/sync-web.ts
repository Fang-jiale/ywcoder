import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', 'ide-for-web');
const EXTENSION_ROOT = path.resolve(__dirname, '..');

const TARGETS = [
	path.join(REPO_ROOT, 'extensions', 'ywcoder'),
	path.join(REPO_ROOT, '.build', 'extensions', 'ywcoder'),
];

const FILES_TO_COPY = [
	'package.json',
	'LICENSE',
	'README.md',
	'README_CN.md',
	'.vscodeignore',
];

const DIRS_TO_COPY = [
	'dist',
	'resources',
];

async function copyFile(src: string, dst: string) {
	const dir = path.dirname(dst);
	await fs.mkdir(dir, { recursive: true });
	await fs.copyFile(src, dst);
}

async function copyDir(src: string, dst: string) {
	await fs.mkdir(dst, { recursive: true });
	const entries = await fs.readdir(src, { withFileTypes: true });
	for (const ent of entries) {
		const s = path.join(src, ent.name);
		const d = path.join(dst, ent.name);
		if (ent.isDirectory()) {
			await copyDir(s, d);
		} else if (ent.isFile()) {
			await copyFile(s, d);
		}
	}
}

async function preparePackageJSON(): Promise<object> {
	const pkgPath = path.join(EXTENSION_ROOT, 'package.json');
	const raw = await fs.readFile(pkgPath, 'utf-8');
	const pkg = JSON.parse(raw);

	// Remove development-only fields for the web distribution
	delete pkg.scripts;
	delete pkg.devDependencies;
	delete pkg.dependencies;

	// Ensure web-specific fields are present
	pkg.browser = './dist/browser.cjs';
	pkg.extensionKind = ['workspace'];

	return pkg;
}

async function syncTarget(targetDir: string) {
	console.log(`[sync-web] Syncing to ${path.relative(REPO_ROOT, targetDir)}`);

	// Ensure target exists
	await fs.mkdir(targetDir, { recursive: true });

	// Copy static files
	for (const file of FILES_TO_COPY) {
		const src = path.join(EXTENSION_ROOT, file);
		try {
			await fs.access(src);
			if (file === 'package.json') {
				const cleaned = await preparePackageJSON();
				await fs.writeFile(
					path.join(targetDir, file),
					JSON.stringify(cleaned, null, 2) + '\n',
					'utf-8'
				);
				console.log(`[sync-web]   -> ${file} (cleaned)`);
			} else {
				await copyFile(src, path.join(targetDir, file));
				console.log(`[sync-web]   -> ${file}`);
			}
		} catch {
			// File doesn't exist, skip
		}
	}

	// Copy directories
	for (const dir of DIRS_TO_COPY) {
		const src = path.join(EXTENSION_ROOT, dir);
		const dst = path.join(targetDir, dir);
		try {
			await fs.access(src);
			await copyDir(src, dst);
			console.log(`[sync-web]   -> ${dir}/`);
		} catch {
			// Directory doesn't exist, skip
		}
	}

	console.log(`[sync-web] Done: ${targetDir}`);
}

async function main() {
	console.log('[sync-web] Starting sync...');
	for (const target of TARGETS) {
		await syncTarget(target);
	}
	console.log('[sync-web] All targets synced.');
}

main().catch(e => {
	console.error('[sync-web] Error:', e);
	process.exit(1);
});
