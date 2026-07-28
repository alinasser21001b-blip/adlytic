/* ==================================================================
   QAREEB — SERVICE WORKER
   ==================================================================
   Baghdad mobile data drops mid-session. The app is a fixed shell plus data
   held in memory, so a cache-first shell means a dropped connection costs
   nothing at all: discovery, hours, the whole model keep working offline.
   Only the WhatsApp handoff genuinely needs the network.

   Cache-first for the shell (it changes only on deploy, and the version
   string below is the cache-buster). Network-first for nothing, because
   there is nothing dynamic to fetch. Anything unrecognised falls through to
   the network and, if that fails, to whatever we have.
   ================================================================== */
const V = "qareeb-v3-2";
const SHELL = [
  "./", "./index.html",
  "./css/qareeb.css", "./src/styles/identity.css",
  "./js/data.js", "./js/app.js",
  "./favicon.svg",
];

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

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  /* The connectivity probe must never be answered from cache — its whole
     job is to find out whether the network is actually there. */
  if (req.url.includes("?ping=")) return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) {
        /* Refresh in the background so the next load is current, without
           making this one wait for the radio. */
        fetch(req).then((res) => {
          if (res && res.ok) caches.open(V).then((c) => c.put(req, res.clone()));
        }).catch(() => {});
        return hit;
      }
      return fetch(req)
        .then((res) => {
          if (res && res.ok) { const cl = res.clone(); caches.open(V).then((c) => c.put(req, cl)); }
          return res;
        })
        .catch(() => caches.match("./index.html"));
    })
  );
});
