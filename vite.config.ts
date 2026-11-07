import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

// the one place the version is written: package.json
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  plugins: [react()],
  base: './',
  define: { __APP_VERSION__: JSON.stringify(version) },
  worker: { format: 'es' },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  // dev server: localhost only, and it serves nothing outside the project folder
  server: { port: 5183, strictPort: false, host: 'localhost' },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
} as any);
