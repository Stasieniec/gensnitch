import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync, readdirSync } from 'fs';

// Plugin to copy static files after build
function copyStaticFiles() {
  return {
    name: 'copy-static-files',
    closeBundle() {
      const distDir = resolve(__dirname, 'dist');
      const uiDir = resolve(distDir, 'ui');
      const iconsDir = resolve(distDir, 'icons');
      const wasmDir = resolve(distDir, 'wasm');
      const assetsDir = resolve(distDir, 'assets');
      const offscreenDir = resolve(distDir, 'offscreen');
      
      // Ensure directories exist
      if (!existsSync(uiDir)) mkdirSync(uiDir, { recursive: true });
      if (!existsSync(iconsDir)) mkdirSync(iconsDir, { recursive: true });
      if (!existsSync(wasmDir)) mkdirSync(wasmDir, { recursive: true });
      if (!existsSync(assetsDir)) mkdirSync(assetsDir, { recursive: true });
      if (!existsSync(offscreenDir)) mkdirSync(offscreenDir, { recursive: true });
      
      // Copy manifest.json
      copyFileSync(
        resolve(__dirname, 'manifest.json'),
        resolve(distDir, 'manifest.json')
      );
      
      // Copy result.html
      copyFileSync(
        resolve(__dirname, 'src/ui/result.html'),
        resolve(uiDir, 'result.html')
      );
      
      // Copy result.css
      copyFileSync(
        resolve(__dirname, 'src/ui/result.css'),
        resolve(uiDir, 'result.css')
      );
      
      // Copy offscreen.html
      copyFileSync(
        resolve(__dirname, 'src/offscreen/offscreen.html'),
        resolve(offscreenDir, 'offscreen.html')
      );
      
      // Copy icons
      const publicIconsDir = resolve(__dirname, 'public/icons');
      if (existsSync(publicIconsDir)) {
        const icons = readdirSync(publicIconsDir);
        for (const icon of icons) {
          if (icon.endsWith('.png')) {
            copyFileSync(
              resolve(publicIconsDir, icon),
              resolve(iconsDir, icon)
            );
          }
        }
      }
      
      // Copy trust list
      const trustListSrc = resolve(__dirname, 'src/assets/trust/allowed.sha256.txt');
      if (existsSync(trustListSrc)) {
        copyFileSync(trustListSrc, resolve(assetsDir, 'allowed.sha256.txt'));
      }
      
      // Copy C2PA WASM file from @contentauth/c2pa-web
      const c2paWasmSrc = resolve(__dirname, 'node_modules/@contentauth/c2pa-web/dist/resources/c2pa_bg.wasm');
      if (existsSync(c2paWasmSrc)) {
        copyFileSync(c2paWasmSrc, resolve(wasmDir, 'c2pa_bg.wasm'));
        console.log('[GenSnitch] Copied: c2pa_bg.wasm');
      } else {
        // Try alternative path
        const altWasmSrc = resolve(__dirname, 'node_modules/@contentauth/c2pa-wasm/pkg/c2pa_bg.wasm');
        if (existsSync(altWasmSrc)) {
          copyFileSync(altWasmSrc, resolve(wasmDir, 'c2pa_bg.wasm'));
          console.log('[GenSnitch] Copied: c2pa_bg.wasm (from c2pa-wasm)');
        } else {
          console.warn('[GenSnitch] Warning: C2PA WASM file not found!');
        }
      }
      
      console.log('[GenSnitch] Static files copied to dist/');
    }
  };
}

export default defineConfig({
  // Use relative paths for Chrome extension compatibility
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        background: resolve(__dirname, 'src/background.ts'),
        result: resolve(__dirname, 'src/ui/result.ts'),
        offscreen: resolve(__dirname, 'src/offscreen/offscreen.ts'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'background') {
            return 'background.js';
          }
          if (chunkInfo.name === 'result') {
            return 'ui/result.js';
          }
          if (chunkInfo.name === 'offscreen') {
            return 'offscreen/offscreen.js';
          }
          return '[name].js';
        },
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name?.endsWith('.wasm')) {
            return 'wasm/[name][extname]';
          }
          return 'assets/[name][extname]';
        },
        manualChunks: undefined,
      },
    },
    target: 'esnext',
    minify: false,
    sourcemap: false,
    assetsInlineLimit: 0,
  },
  plugins: [copyStaticFiles()],
  optimizeDeps: {
    exclude: ['@contentauth/c2pa-web', '@contentauth/c2pa-wasm'],
  },
});
