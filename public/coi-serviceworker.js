/*! coi-serviceworker v0.1.7 - Guido Zuidhof, licensed under MIT */
// Injects COOP/COEP headers via a service worker for hosts that don't support custom headers (e.g. GitHub Pages)
if (typeof window === 'undefined') {
  self.addEventListener('install', () => self.skipWaiting());
  self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
  self.addEventListener('fetch', (e) => {
    if (e.request.cache === 'only-if-cached' && e.request.mode !== 'same-origin') return;
    e.respondWith(
      fetch(e.request).then((r) => {
        if (r.status === 0) return r;
        const headers = new Headers(r.headers);
        headers.set('Cross-Origin-Embedder-Policy', 'credentialless');
        headers.set('Cross-Origin-Opener-Policy', 'same-origin');
        return new Response(r.body, { status: r.status, statusText: r.statusText, headers });
      }).catch((err) => console.error(err))
    );
  });
} else {
  (async () => {
    if (window.crossOriginIsolated !== false) return;
    const r = await navigator.serviceWorker.register(window.document.currentScript.src);
    if (r.active && !navigator.serviceWorker.controller) {
      window.location.reload();
    } else if (!r.active) {
      r.addEventListener('updatefound', () => {
        r.installing.addEventListener('statechange', (evt) => {
          if (evt.target.state === 'activated') window.location.reload();
        });
      });
    }
  })();
}
