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
      
      // Ensure directories exist
      if (!existsSync(uiDir)) mkdirSync(uiDir, { recursive: true });
      if (!existsSync(iconsDir)) mkdirSync(iconsDir, { recursive: true });
      
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
      
      console.log('[GenSnitch] Static files copied to dist/');
    }
  };
}

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        background: resolve(__dirname, 'src/background.ts'),
        result: resolve(__dirname, 'src/ui/result.ts'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'background') {
            return 'background.js';
          }
          if (chunkInfo.name === 'result') {
            return 'ui/result.js';
          }
          return '[name].js';
        },
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name][extname]',
        // Ensure no code splitting for service worker
        manualChunks: undefined,
      },
    },
    target: 'esnext',
    minify: false,
    sourcemap: false,
  },
  plugins: [copyStaticFiles()],
});
