import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import crossOriginIsolation from 'vite-plugin-cross-origin-isolation';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig({
  base: '/',
  plugins: [
    svelte(),
    basicSsl(),               // self-signed cert for HTTPS (needed for OPFS over LAN)
    crossOriginIsolation(),   // adds COOP/COEP headers needed for SharedArrayBuffer
  ],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
  },
  optimizeDeps: {
    exclude: ['@sqlite.org/sqlite-wasm'],  // must not be pre-bundled — loads its own WASM at runtime
  },
  worker: {
    format: 'es',
  },
});
