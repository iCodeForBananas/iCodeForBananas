// Service worker for iCodeForBananas.
//
// Chrome only offers to install a site that has one of these with a fetch
// handler, so this exists first to make the app installable — and second to
// give a page loaded with no connection something better than the browser's
// dinosaur.
//
// Two things get cached, both scoped so the rest of the site keeps the
// original "network only" behavior:
//   - /_next/static/* — Next names these by content hash, so a cached copy
//     can never go stale; a new build gets new filenames instead of new
//     content at an old one.
//   - anything under /lead-sheet-editor — network-first, falling back to
//     whatever was last fetched successfully. This is what lets a song
//     you've opened before stay reachable with no connection: the page shell
//     comes from here, and IndexedDB (see offlineCache.ts) supplies the song
//     data once the shell boots.
//
// Bump CACHE whenever this strategy changes, or after a deploy you want
// offline users to pick up right away — activate() drops every other cache,
// same as the plain offline-page version this replaced.
const CACHE = "icfb-shell-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" })))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

/** Hashed and immutable: whatever's cached is correct forever, so check first. */
async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

/**
 * The freshest copy whenever there's a connection; whatever was cached last
 * when there isn't. A page that was never opened before still falls through
 * to the generic offline page rather than a bare network error.
 */
async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (request.mode === "navigate") return offlinePage();
    throw err;
  }
}

async function offlinePage() {
  const cached = await caches.match(OFFLINE_URL);
  return (
    cached ??
    new Response("You're offline.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    })
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (url.pathname === "/lead-sheet-editor" || url.pathname.startsWith("/lead-sheet-editor/")) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (request.mode !== "navigate") return;

  event.respondWith(fetch(request).catch(offlinePage));
});
