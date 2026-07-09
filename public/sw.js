const CACHE = 'icfb-v4';
const PRECACHE = ['/', '/manifest.json', '/icon.svg'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE))
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const { request } = e;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Local development: never serve from cache. Turbopack reuses stable chunk
  // paths, so cache-first would hand back stale dev bundles after an edit.
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return;

  // API routes: network only
  if (url.pathname.startsWith('/api/')) return;

  // Next.js static chunks are content-addressed — cache aggressively
  if (url.pathname.startsWith('/_next/static/')) {
    e.respondWith(
      caches.match(request).then(
        cached => cached || fetch(request).then(res => {
          if (!res || res.status !== 200 || res.type !== 'basic') return res;
          const toCache = res.clone();
          caches.open(CACHE).then(c => c.put(request, toCache));
          return res;
        })
      )
    );
    return;
  }

  // Lead-sheet-editor routes cache their HTML documents for offline use.
  // Safe to do with strict network-first because:
  //   1. Online users always get a fresh response (cache is only the offline fallback).
  //   2. The cache-version bump on each deploy (icfb-v3 etc.) purges old HTML and its
  //      matching chunk set together, so a cached HTML page will never reference
  //      chunk hashes from a different deploy.
  // All other HTML documents remain excluded to avoid the stale-chunk-reload bug
  // that motivated the original exclusion.
  const isLeadSheetRoute = url.pathname.startsWith('/lead-sheet-editor');

  // Everything else: network-first, fall back to cache
  e.respondWith(
    fetch(request)
      .then(res => {
        const isDocument = request.destination === 'document' ||
          res.headers.get('content-type')?.includes('text/html');
        const shouldCache = res.ok && res.type === 'basic' && (!isDocument || isLeadSheetRoute);
        if (shouldCache) {
          const toCache = res.clone();
          caches.open(CACHE).then(c => c.put(request, toCache));
        }
        return res;
      })
      .catch(() => caches.match(request).then(r => r ?? new Response('Network error', { status: 503 })))
  );
});
