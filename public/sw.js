const CACHE = 'icfb-v1';
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

  // Everything else: network-first, fall back to cache
  e.respondWith(
    fetch(request)
      .then(res => {
        if (res.ok && res.type === 'basic') {
          const toCache = res.clone();
          caches.open(CACHE).then(c => c.put(request, toCache));
        }
        return res;
      })
      .catch(() => caches.match(request).then(r => r || Response.error()))
  );
});
