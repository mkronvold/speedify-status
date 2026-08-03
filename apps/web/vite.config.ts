import type { Plugin } from 'vite';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const gitSha = process.env.VITE_GIT_SHA || process.env.GITHUB_SHA || 'dev';

/** Emit /version.json matching the baked VITE_GIT_SHA for autoupdate reload checks. */
function versionJsonPlugin(sha: string): Plugin {
  const body = `${JSON.stringify({ sha }, null, 2)}\n`;
  return {
    name: 'speedify-status-version-json',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split('?')[0];
        if (path !== '/version.json') {
          next();
          return;
        }
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(body);
      });
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: body,
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), versionJsonPlugin(gitSha)],
  define: {
    'import.meta.env.VITE_GIT_SHA': JSON.stringify(gitSha),
  },
  server: {
    port: 5174,
    proxy: {
      '/health': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:4090',
        changeOrigin: true,
      },
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:4090',
        changeOrigin: true,
      },
    },
  },
});
