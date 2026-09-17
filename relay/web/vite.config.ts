import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  root,
  css: {
    postcss: resolve(root, 'postcss.config.js'),
  },
  build: {
    outDir: resolve(root, 'dist'),
    emptyOutDir: true,
  },
});
