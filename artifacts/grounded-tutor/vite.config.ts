import http from 'node:http';
import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';

// Browsers open "localhost" as either 127.0.0.1 or ::1. Vite binds only one of
// them, so the other gets ERR_CONNECTION_REFUSED. Stay on loopback, not the LAN.
function loopbackTwin(listenPort: number): Plugin {
  return {
    name: 'loopback-twin',
    apply: 'serve',
    configureServer(server) {
      if (process.env.VITE_AUTH_DRIVER !== 'local') return;
      return () => {
        const primary = server.httpServer;
        if (!primary) return;
        primary.once('listening', () => {
          const bound = primary.address();
          if (!bound || typeof bound === 'string') return;
          const other = bound.address === '127.0.0.1' ? '::1' : '127.0.0.1';
          const extra = http.createServer();
          for (const event of ['request', 'upgrade'] as const) {
            for (const listener of primary.listeners(event)) {
              extra.on(event, listener as (...args: unknown[]) => void);
            }
          }
          extra.on('error', (err) => {
            server.config.logger.warn(`Local ${other} listen failed: ${err.message}`);
          });
          extra.listen(listenPort, other);
        });
      };
    },
  };
}

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    'PORT environment variable is required but was not provided.',
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    'BASE_PATH environment variable is required but was not provided.',
  );
}

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss({ optimize: false }),
    runtimeErrorOverlay(),
    loopbackTwin(port),
    ...(process.env.NODE_ENV !== 'production' &&
    process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      strict: true,
    },
    // Local dev only: forward /api to the API server (Replit routes this itself).
    proxy: process.env.API_PROXY_TARGET
      ? { '/api': { target: process.env.API_PROXY_TARGET, changeOrigin: true } }
      : undefined,
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
