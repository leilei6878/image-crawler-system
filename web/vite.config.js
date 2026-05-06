import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const devPort = Number(process.env.VITE_DEV_PORT || 5000);
const apiTarget = process.env.VITE_API_TARGET || 'http://127.0.0.1:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: devPort,
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true
      }
    }
  }
});
