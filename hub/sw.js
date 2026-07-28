/* ==================================================================
   QAREEB — SERVICE WORKER
   ==================================================================
   Baghdad mobile data drops mid-session. The app is a fixed shell plus data
   held in memory, so a cached shell means a dropped connection costs nothing:
   discovery, hours, the whole model keep working offline. Only the WhatsApp
   handoff genuinely needs the network.

   WHY THIS IS NOT CACHE-FIRST ANY MORE. It was, with a hand-written version
   string as the only cache-buster. Three deploys shipped without that string
   changing, so `activate` purged nothing and every visitor was served the
   previous build — the new one arrived in the background and only appeared on
   the load AFTER the one they were looking at. Shipping became invisible.
   A caching strategy that can hide a deploy is not a caching strategy, it is
   a bug with a schedule.

   So: the shell (navigations, HTML, CSS, JS) is NETWORK-FIRST with a short
   race — whatever the radio returns within SHELL_MS wins, otherwise the cache
   answers instantly and the network's copy is still written for next time.
   Online, you always see what was deployed. Offline or on a stalled 3G, you
   see the last good copy rather than a dinosaur. Everything else (icons) stays
   cache-first, because it does not change.

   The version below is stamped by tools/stamp.mjs, not typed by hand — see
   that file for why.
   ================================================================== */
const V = "qareeb-20260728-0917";
const SHELL = [
  "./", "./index.html",
  "./css/qareeb.css", "./src/styles/identity.css",
  "./js/data.js", "./js/app.js",
  "./favicon.svg",
];
/* Long enough that a slow-but-alive Baghdad connection still delivers the
   real thing; short enough that a dead one never holds the screen hostage. */
const SHELL_MS = 3500;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== V).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Fetch, cache whatever comes back, but give up on WAITING after ms. The
   request itself is never cancelled: if it lands late, the cache is still
   updated, so the slow-network visitor is at most one load behind instead of
   permanently behind.

   `cache: "reload"` is not decoration. A plain fetch() here is allowed to be
   answered from the browser's OWN http cache, which put the whole strategy
   back where it started: measured against a fresh deploy, two consecutive
   loads still showed the old build. Network-first has to mean the network. */
function raceNetwork(req, ms) {
  return new Promise((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => { if (!done) { done = true; reject(new Error("slow")); } }, ms);
    fetch(req.url, { cache: "reload", credentials: "same-origin" }).then((res) => {
      if (res && res.ok) { const copy = res.clone(); caches.open(V).then((c) => c.put(req, copy)); }
      if (!done) { done = true; clearTimeout(timer); resolve(res); }
    }).catch((err) => { if (!done) { done = true; clearTimeout(timer); reject(err); } });
  });
}

const isShell = (req, url) =>
  req.mode === "navigate" ||
  url.pathname.endsWith("/") ||
  /\.(html|css|js)$/.test(url.pathname);

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  /* The connectivity probe must never be answered from cache — its whole
     job is to find out whether the network is actually there. */
  if (req.url.includes("?ping=")) return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  const fallback = () =>
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match("./index.html"));

  if (isShell(req, url)) {
    e.respondWith(raceNetwork(req, SHELL_MS).catch(fallback));
    return;
  }

  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) =>
      hit || fetch(req).then((res) => {
        if (res && res.ok) { const copy = res.clone(); caches.open(V).then((c) => c.put(req, copy)); }
        return res;
      }).catch(fallback)
    )
  );
});

/* The page can ask which build is actually answering its requests. That is
   how the app's footer can state a version it has verified rather than one it
   merely believes. */
self.addEventListener("message", (e) => {
  if (e.data === "version" && e.source) e.source.postMessage({ build: V });
});
