import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [vue()],
  server: { host: '127.0.0.1', port: 4173, strictPort: true, fs: { strict: true, allow: [fileURLToPath(new URL('.', import.meta.url)), fileURLToPath(new URL('../../packages/contracts', import.meta.url)), fileURLToPath(new URL('../../node_modules', import.meta.url))], deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.local/**', '**/.env*', '**/*.{key,pem,crt}'] }, proxy: {
    '/api': 'http://127.0.0.1:4300', '/auth': 'http://127.0.0.1:4300', '/health': 'http://127.0.0.1:4300'
  } },
  build: { outDir: 'dist', emptyOutDir: true }
});
