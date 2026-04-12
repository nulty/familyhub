import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';
import crossOriginIsolation from 'vite-plugin-cross-origin-isolation';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig({
  base: '/',
  plugins: [
    svelte(),
    basicSsl(),               // self-signed cert for HTTPS (needed for OPFS over LAN)
    crossOriginIsolation(),   // adds COOP/COEP headers needed for SharedArrayBuffer
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Sinsear',
        short_name: 'Sinsear',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#fafafa',
        background_color: '#fafafa',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,wasm,sql}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/[abc]\.tile\.openstreetmap\.org\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-tiles',
              expiration: {
                maxEntries: 2000,
                maxAgeSeconds: 30 * 24 * 60 * 60,
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
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
