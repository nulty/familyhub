# Storage & Cross-Origin Isolation

## Storage Modes

The app supports two modes:

- **Local mode** — all data stored client-side in OPFS. Fully offline, no server required.
- **Collaborative mode** — writes go to the API (`api.sinsear.org`) which stores data in a per-tree Turso database. OPFS serves as a read-only cache for offline reads. Switching between modes is handled by `src/db/worker.js` based on the current collab state.

## OPFS (Origin Private File System)

- Uses `@sqlite.org/sqlite-wasm` (official SQLite WebAssembly) loaded from CDN
- Database file stored at `/familytree.db` in OPFS via the SAH pool VFS
- Data is per-origin (tied to the domain) and persists across page reloads
- Not visible in the regular filesystem — inspect via DevTools: Application > Storage > File System
- Clearing site data in the browser will delete the database
- Falls back to in-memory if OPFS is unavailable (data won't persist)
- In collaborative mode, OPFS is synced from the server on tab focus and serves reads when offline

## Browser Support

- Chrome/Edge: full support
- Safari 17+: supported
- Firefox 111+: supported

## Cross-Origin Isolation

SharedArrayBuffer (required by OPFS) needs these HTTP headers:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: credentialless
```

- **Dev server:** `vite-plugin-cross-origin-isolation` injects the headers automatically
- **Cloudflare Pages (production):** Headers configured via `_headers` file or Cloudflare Pages settings at `sinsear.org`
- **GitHub Pages (legacy):** Previously used `coi-serviceworker.js` to inject headers via service worker (removed — no longer deployed to GitHub Pages)
