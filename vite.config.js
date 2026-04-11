import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import crossOriginIsolation from 'vite-plugin-cross-origin-isolation';
import basicSsl from '@vitejs/plugin-basic-ssl';

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  base: '/',
  plugins: [svelte(), // self-signed cert for HTTPS (needed for OPFS over LAN)
  basicSsl(), // adds COOP/COEP headers needed for SharedArrayBuffer
  crossOriginIsolation(), cloudflare()],
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