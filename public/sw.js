// Service worker for iCodeForBananas.
//
// Chrome only offers to install a site that has one of these with a fetch
// handler, so this exists first to make the app installable — and second to
// give a page loaded with no connection something better than the browser's
// dinosaur.
//
// It deliberately caches nothing but the offline page. Next.js serves hashed
// JS and CSS that a stale cache would happily hand back forever, so every
// request other than a page navigation goes straight to the network.

// Bump this whenever offline.html changes: the browser only re-runs install
// when sw.js itself differs, and the old cache would otherwise stick around.
const CACHE = "icfb-offline-v1";
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

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (event.request.mode !== "navigate") return;

  event.respondWith(
    fetch(event.request).catch(async () => {
      const cached = await caches.match(OFFLINE_URL);
      return (
        cached ??
        new Response("You're offline.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        })
      );
    })
  );
});
