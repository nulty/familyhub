import { defineConfig } from 'vite';
import crossOriginIsolation from 'vite-plugin-cross-origin-isolation';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/familyhub/' : '/',
  plugins: [
    basicSsl(),               // self-signed cert for HTTPS (needed for OPFS over LAN)
    crossOriginIsolation(),   // adds COOP/COEP headers needed for SharedArrayBuffer
  ],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  optimizeDeps: {
    exclude: ['@sqlite.org/sqlite-wasm'],  // must not be bundled — loads its own WASM
  },
});
