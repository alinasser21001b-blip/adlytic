// Adlytic Service Worker — cache-first for app shell, network-only for API.
//
// Cache version is bumped on any change to caching behavior so old shells are
// evicted on activate (the previous 'adlytic-v1' was never invalidated across
// deploys, which could serve a stale UI). Sensitive/identity-bearing surfaces
// (/admin*, /support) are NEVER cached, so a shell rendered for one role can
// never be replayed from cache to another.
const CACHE_NAME = 'adlytic-v4';
const SHELL_ASSETS = [
  '/dashboard',
  '/campaigns',
  '/ai',
  '/settings',
];

// Paths whose HTML must always come from the network and never be cached.
function isNoCachePath(pathname) {
  return pathname.startsWith('/admin') || pathname === '/support' || pathname.startsWith('/support/');
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Allow the page to force-drop all caches (e.g. on logout / account switch).
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'clear-caches') {
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))));
  }
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API calls: network-only (never cache identity-bearing or per-user data).
  if (url.pathname.startsWith('/api/')) return;

  // Admin / support surfaces: network-only, never cached.
  if (isNoCachePath(url.pathname)) return;

  // App shell pages: network-first with cache fallback.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
