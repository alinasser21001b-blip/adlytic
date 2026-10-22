/**
 * Serve the assembled preview, for a host that runs a process rather than a CDN.
 *
 * Netlify reads `netlify.toml` and applies the rewrites and headers itself. A
 * container host does not: it starts a process and sends it traffic, so the
 * rules that file declares have to exist in code or they simply do not happen.
 * They are not decoration — the front door is a REWRITE, so without it the
 * deployed site answers 404 at `/`, which is a fault this project has already
 * shipped once and found by opening the URL.
 *
 * Deliberately dependency-free. `tools/deps-check.mjs` requires every binary a
 * script runs to resolve to a declared dependency, and the honest way to
 * satisfy it is to need nothing: this is `node:http` and `node:fs`. A static
 * file server is not where this project should acquire a supply chain.
 *
 * Run AFTER `npm run build:web && node tools/assemble-preview.mjs`.
 */
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";

const ROOT = resolve("dist-web");
/** The host names the port; a hard-coded one binds to nothing it routes to. */
const PORT = Number(process.env.PORT ?? 8080);

if (!existsSync(join(ROOT, "apps/patient/web/index.html"))) {
  console.error("serve: dist-web has no app entry — run `npm run build:web && node tools/assemble-preview.mjs` first");
  process.exit(1);
}

/** Vite emits the entry at the path it occupies in the source tree, so the
 *  front door is a rewrite rather than a file. Same target as netlify.toml. */
const ENTRY = "/apps/patient/web/index.html";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

/**
 * The security headers netlify.toml declares, applied to everything.
 *
 * `camera=(self)` is load-bearing rather than boilerplate: R2 asks a patient to
 * photograph a prescription, and `camera=()` would refuse it in a way no error
 * message on that screen could explain. Geolocation stays denied because the
 * product asks for a district instead of reading where anyone is (E8).
 */
const SECURITY = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "SAMEORIGIN",
  "Permissions-Policy": "camera=(self), geolocation=(), microphone=()",
};

/** Hashed asset names are immutable; a document must never be. Serving an HTML
 *  file from a long cache is how a deploy fails to reach the person who asked
 *  for it. */
const cacheFor = (path) =>
  path.startsWith("/assets/") ? "public, max-age=31536000, immutable"
  : path.endsWith(".html") ? "public, max-age=0, must-revalidate"
  : "public, max-age=300";

/**
 * The file a URL asks for, or null if it asks for something outside the build.
 *
 * `normalize` after decoding is what stops `/../` escaping the root — this
 * process can read the whole container, and a static server that will hand out
 * any path it is given is the one bug in a file server that actually matters.
 */
function fileFor(urlPath) {
  let decoded;
  try { decoded = decodeURIComponent(urlPath); } catch { return null; }
  const clean = normalize(decoded).replace(/\\/g, "/");
  if (clean.includes("\0")) return null;
  const candidate = resolve(join(ROOT, clean));
  if (candidate !== ROOT && !candidate.startsWith(ROOT + "/")) return null;
  if (!existsSync(candidate)) return null;
  // A directory means the assembled sub-sites: /design/ and /review/ are whole
  // static sites with their own index.
  if (statSync(candidate).isDirectory()) {
    const index = join(candidate, "index.html");
    return existsSync(index) ? index : null;
  }
  return candidate;
}

const server = createServer((req, res) => {
  const method = req.method ?? "GET";
  if (method !== "GET" && method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD", ...SECURITY });
    res.end();
    return;
  }

  const urlPath = (req.url ?? "/").split("?")[0].split("#")[0];

  // Railway health-checks a path; answering it from the app's own entry would
  // report healthy whenever the file exists rather than whenever the process
  // can serve. This is the process saying it is listening, and nothing more.
  if (urlPath === "/healthz") {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", ...SECURITY });
    res.end("ok");
    return;
  }

  // The rewrite, both rules from netlify.toml in one: the front door, and every
  // unknown path. The app owns its own navigation and reads nothing from the
  // URL, so one entry answers all of them — and a 200 rather than a redirect,
  // because the address stays the one the visitor typed.
  const file = fileFor(urlPath) ?? fileFor(ENTRY);
  if (!file) {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8", ...SECURITY });
    res.end("the build is missing its entry");
    return;
  }

  const served = "/" + file.slice(ROOT.length + 1);
  res.writeHead(200, {
    "Content-Type": TYPES[extname(file).toLowerCase()] ?? "application/octet-stream",
    "Content-Length": statSync(file).size,
    "Cache-Control": cacheFor(served),
    ...SECURITY,
  });
  if (method === "HEAD") { res.end(); return; }
  createReadStream(file).pipe(res);
});

// 0.0.0.0 rather than the default: a container host routes to the container's
// address, and a process bound to loopback is one the platform cannot reach —
// which presents as a health check that times out with no error anywhere.
server.listen(PORT, "0.0.0.0", () => {
  console.log(`dawai preview on :${PORT} — / (app) · /design/ (prototype) · /review/ (gallery)`);
});

// A container host stops a process by asking; without this the platform waits
// out its grace period on every deploy and every restart takes longer than it
// needs to.
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
