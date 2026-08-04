/**
 * Assemble the preview: everything this project has built, on one URL.
 *
 * @blueprint §3 · TD-1 · TD-2
 * @owner patient-app
 * @why The preview URL used to serve the design prototype (dawai-site). When
 *      the deploy was repointed at the built app, that prototype VANISHED from
 *      the URL and the front door became a lone search box — and to the person
 *      reviewing 48 hours of work, it looked like the app had shrunk to one
 *      feature. It had not. This puts every surface on the same deploy:
 *
 *        /         the working patient app (vite build, mock API)
 *        /design/  the full design prototype, exactly as delivered
 *        /review/  the screen gallery — every contracted screen, every state
 *
 *      Runs AFTER `npm run build:web` (which empties dist-web), from the
 *      platform directory. Copies are verbatim, with one exception below.
 */
import { cpSync, existsSync, rmSync } from "node:fs";

const OUT = "dist-web";
if (!existsSync(`${OUT}/apps/patient/web/index.html`)) {
  console.error("assemble-preview: run `npm run build:web` first — the app entry is missing");
  process.exit(1);
}

cpSync("../dawai-site", `${OUT}/design`, { recursive: true });
// The one exception: the prototype ships a service worker, and a worker served
// from this origin could claim scope over the APP and keep serving stale
// copies of it. The prototype renders fine without it; the app must never be
// behind a cache this deploy cannot invalidate.
rmSync(`${OUT}/design/sw.js`, { force: true });
// The prototype's own netlify.toml is config, not content.
rmSync(`${OUT}/design/netlify.toml`, { force: true });

cpSync("../review", `${OUT}/review`, { recursive: true });

console.log("preview assembled: / (app) · /design/ (prototype) · /review/ (gallery)");
