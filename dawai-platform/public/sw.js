/* Dawai service worker — offline shell only. Never caches prescriptions or API bodies. */
const SHELL = "dawai-shell-v1";
const SHELL_URLS = ["/", "/offline.html", "/manifest.webmanifest", "/dawai-icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) => cache.addAll(SHELL_URLS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== SHELL).map((key) => caches.delete(key))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET") return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/health/")) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (
          response.ok &&
          (url.pathname === "/" ||
            url.pathname.startsWith("/assets/") ||
            SHELL_URLS.includes(url.pathname))
        ) {
          const copy = response.clone();
          void caches.open(SHELL).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === "navigate") {
          const offline = await caches.match("/offline.html");
          if (offline) return offline;
        }
        return Response.error();
      }),
  );
});
