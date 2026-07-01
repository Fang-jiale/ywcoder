import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { createSvgIconsPlugin } from 'vite-plugin-svg-icons';

export default defineConfig(({ mode }) => ({
  root: __dirname,
  server: {
    port: Number(process.env.VITE_DEV_PORT) || 5173,
    strictPort: true,
    fs: {
      // 允许从工作区根目录及外部资源目录读取文件（用于别名资源与图标目录）
      allow: [
        path.resolve(__dirname, '../..'),
        path.resolve(__dirname, '../../assets'),
        path.resolve(__dirname, '../../resources'),
        path.resolve(__dirname, '../../node_modules'),
      ],
    },
  },
  plugins: [
    vue(),
    tailwindcss(),
    createSvgIconsPlugin({
      iconDirs: [path.resolve(__dirname, '../../assets/icons')],
      symbolId: 'icon-[name]',
      svgoOptions: true,
    }),
    {
      name: 'filter-mdi-fonts',
      generateBundle(options, bundle) {
        // 只保留 woff2 格式的 MDI 字体，删除其他格式
        for (const fileName of Object.keys(bundle)) {
          if (fileName.includes('materialdesignicons-webfont') && !fileName.endsWith('.woff2')) {
            delete bundle[fileName];
          }
        }
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // 使用本地的 codicon 资源替换依赖包中的资源
      '@vscode/codicons/dist/codicon.css': path.resolve(__dirname, '../../assets/codicons/codicon.css'),
      '@vscode/codicons/dist/codicon.ttf': path.resolve(__dirname, '../../assets/codicons/codicon.ttf'),
    },
  },
  base: '',
  build: {
    outDir: path.resolve(__dirname, '../../dist/media'),
    emptyOutDir: true,
    assetsDir: '',
    sourcemap: false,
    rolldownOptions: {
      output: {
        entryFileNames: 'main.js',
        assetFileNames: (assetInfo) => {
          const name = assetInfo.name ?? '';
          if (name.endsWith('.css')) return 'style.css';
          if (name.includes('materialdesignicons-webfont') && name.endsWith('.woff2')) {
            return 'materialicon.woff2';
          }
          return '[name][extname]';
        },
      },
    },
  },
}));
