import { defineConfig } from 'vite';

// Static single-page app. No backend. Assets served from /assets.
export default defineConfig({
  root: '.',
  base: './',
  server: {
    host: true,
    port: 5173,
    open: false,
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsInlineLimit: 0, // keep audio/json as real files so they can be swapped
  },
});
