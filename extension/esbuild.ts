import esbuild from "esbuild";
import { createRequire } from "module";
import path from "path";
import fs from "fs/promises";

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
	name: 'esbuild-problem-matcher',

    setup(build: { onStart: (arg0: () => void) => void; onEnd: (arg0: (result: esbuild.BuildResult) => void) => void; }) {
        build.onStart(() => {
            console.log('[watch] build started');
        });
        build.onEnd((result) => {
            result.errors.forEach(({ text, location }) => {
                console.error(`✘ [ERROR] ${text}`);
                if (location) {
                    console.error(`    ${location.file}:${location.line}:${location.column}:`);
                }
            });
            console.log('[watch] build finished');
        });
	},
};


/**
 * 在构建完成后，将 @dcywzc/ywcoder 的 CLI 文件复制到 dist/ywcoder/
 * 用于离线部署，确保 vsix 打包后无需依赖外部 node_modules。
 * @type {import('esbuild').Plugin}
 */
const copyYwcoderCliPlugin = {
    name: 'copy-ywcoder-cli',
    setup(build: { onEnd: (arg0: () => Promise<void>) => void; }) {
        build.onEnd(async () => {
            try {
                const require = createRequire(import.meta.url);
                const pkgDir = path.dirname(require.resolve('@dcywzc/ywcoder/package.json'));
                const outDir = path.resolve(process.cwd(), 'dist', 'ywcoder');
                await fs.mkdir(outDir, { recursive: true });

                // copy cli.mjs
                const cliSrc = path.join(pkgDir, 'dist', 'cli.mjs');
                const cliDst = path.join(outDir, 'cli.mjs');
                if ((await fs.stat(cliSrc)).isFile()) {
                    await fs.copyFile(cliSrc, cliDst);
                    console.log(`[build] Copied YwCoder CLI -> ${path.relative(process.cwd(), cliDst)}`);
                }

                // copy vendor directory (contains ripgrep binaries needed at runtime)
                const vendorSrc = path.join(pkgDir, 'dist', 'vendor');
                try {
                    const st = await fs.stat(vendorSrc);
                    if (st.isDirectory()) {
                        const vendorDst = path.join(outDir, 'vendor');
                        await copyDir(vendorSrc, vendorDst);
                        console.log('[build] Copied YwCoder vendor/ directory');
                    }
                } catch {
                    console.warn('[build] vendor/ not found, ripgrep features may fail');
                }

                // 补充 resources/ywcoder/vendor/ripgrep/ 中缺失的平台（如 Windows）
                const resourcesRipgrepSrc = path.resolve(process.cwd(), 'resources', 'ywcoder', 'vendor', 'ripgrep');
                const ripgrepDst = path.join(outDir, 'vendor', 'ripgrep');
                try {
                    const st = await fs.stat(resourcesRipgrepSrc);
                    if (st.isDirectory()) {
                        await fs.mkdir(ripgrepDst, { recursive: true });
                        const entries = await fs.readdir(resourcesRipgrepSrc, { withFileTypes: true });
                        for (const ent of entries) {
                            const srcPlatform = path.join(resourcesRipgrepSrc, ent.name);
                            const dstPlatform = path.join(ripgrepDst, ent.name);
                            if (ent.isDirectory()) {
                                await copyDir(srcPlatform, dstPlatform);
                            }
                        }
                        console.log('[build] Patched vendor/ripgrep with all platforms from resources');
                    }
                } catch {
                    // resources/ywcoder/vendor/ripgrep may not exist
                }
            } catch (err: any) {
                console.warn('[build] copy-ywcoder-cli failed:', err?.message || err);
            }
        });
    },
};

async function copyDir(src: string, dst: string) {
    await fs.mkdir(dst, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });
    for (const ent of entries) {
        const s = path.join(src, ent.name);
        const d = path.join(dst, ent.name);
        if (ent.isDirectory()) {
            await copyDir(s, d);
        } else if (ent.isFile()) {
            await fs.copyFile(s, d);
        }
    }
}

async function main() {
	const ctx = await esbuild.context({
		entryPoints: [
			'src/extension.ts'
		],
		bundle: true,
		format: 'cjs',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'node',
    outfile: 'dist/extension.cjs',
		external: ['vscode'],
		logLevel: 'silent',
		plugins: [
			/* add to the end of plugins array */
			esbuildProblemMatcherPlugin,
			copyYwcoderCliPlugin,
		],
	});
	if (watch) {
		await ctx.watch();
	} else {
		await ctx.rebuild();
		await ctx.dispose();
	}
}

main().catch(e => {
	console.error(e);
	process.exit(1);
});
