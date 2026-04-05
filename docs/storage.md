# Storage & Cross-Origin Isolation

## OPFS (Origin Private File System)

- Uses `@sqlite.org/sqlite-wasm` (official SQLite WebAssembly) loaded from CDN
- Database file stored at `/familytree.db` in OPFS via the SAH pool VFS
- Data is per-origin (tied to the domain) and persists across page reloads
- Not visible in the regular filesystem — inspect via DevTools: Application > Storage > File System
- Clearing site data in the browser will delete the database
- Falls back to in-memory if OPFS is unavailable (data won't persist)

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
- **GitHub Pages:** `coi-serviceworker.js` (in `public/`) intercepts fetch responses and adds the headers via a service worker, since GitHub Pages doesn't support custom headers
- **Other static hosts:** Add the headers via `_headers` file (Netlify/Cloudflare Pages) or host config (Vercel, nginx, etc.)
