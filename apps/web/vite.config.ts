import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const apiProxy = {
  changeOrigin: true,
  rewrite: (path: string) => path.replace(/^\/api/u, ''),
  target: process.env.HOTELCUT_API_PROXY_TARGET ?? 'http://localhost:3000',
};

export default defineConfig({
  plugins: [react()],
  preview: {
    proxy: {
      '/api': apiProxy,
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': apiProxy,
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
});
