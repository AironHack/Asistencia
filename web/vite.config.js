import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const certDir = path.resolve('certs');
const keyPath = path.join(certDir, 'local.key');
const certPath = path.join(certDir, 'local.crt');

export default defineConfig(({ mode }) => {
  const usarHttpsLocal = mode === 'https-local' && fs.existsSync(keyPath) && fs.existsSync(certPath);

  if (mode === 'https-local' && !usarHttpsLocal) {
    throw new Error('No existen certificados HTTPS locales. Ejecuta: npm run cert:https');
  }

  return {
    plugins: [react()],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('react') || id.includes('react-dom')) return 'vendor-react';
            if (id.includes('@mantine')) return 'vendor-mantine';
            if (id.includes('@tabler')) return 'vendor-icons';
            if (id.includes('html5-qrcode')) return 'vendor-qr-scanner';
            if (id.includes('qrcode')) return 'vendor-qr';
            return undefined;
          }
        }
      }
    },
    server: {
      host: '0.0.0.0',
      port: 5180,
      strictPort: true,
      https: usarHttpsLocal
        ? {
            key: fs.readFileSync(keyPath),
            cert: fs.readFileSync(certPath)
          }
        : undefined,
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true
        }
      }
    }
  };
});
