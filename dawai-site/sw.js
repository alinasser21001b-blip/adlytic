/* Dawai app-shell service worker.
 * Navigations are NETWORK-FIRST with cache fallback: users always get the
 * newest deploy when online, and the last known shell when offline.
 * Static assets are cache-first. Bump CACHE on every shell change.
 */
const CACHE = "dawai-shell-v8";
const SHELL = [
  "./", "./index.html",
  "./manifest.webmanifest",
  "./icon.svg",
  "./icon-maskable.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET") return;

  // Page loads: network-first so deploys are visible immediately.
  if (event.request.mode === "navigate" || url.pathname.endsWith("/index.html")) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(event.request, copy));
          return res;
        })
        .catch(() => caches.match(event.request).then((hit) => hit || caches.match("./index.html")))
    );
    return;
  }

  const isShellAsset = url.origin === location.origin && SHELL.some((p) => url.pathname.endsWith(p.slice(1)));
  if (isShellAsset) {
    event.respondWith(
      caches.match(event.request).then((hit) => hit || fetch(event.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(event.request, copy));
        return res;
      }))
    );
    return;
  }

  // Fonts and other static third-party assets: stale-while-revalidate.
  if (url.hostname.endsWith("gstatic.com") || url.hostname.endsWith("googleapis.com")) {
    event.respondWith(
      caches.open(CACHE).then(async (c) => {
        const hit = await c.match(event.request);
        const refresh = fetch(event.request).then((res) => {
          c.put(event.request, res.clone());
          return res;
        }).catch(() => hit);
        return hit || refresh;
      })
    );
  }
});
