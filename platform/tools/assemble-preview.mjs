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

/**
 * The two extras are SIBLINGS of this directory, and a host that builds from a
 * subdirectory does not have them.
 *
 * Netlify sets `base = "platform"` but still checks out the whole repository,
 * so both are there. Railway's Root Directory does not work that way: it makes
 * the subdirectory the build context, and `../dawai-site` simply does not
 * exist. Failing there would fail the DEPLOY over two extras, and shipping the
 * app without saying they are missing is how the prototype vanished from the
 * preview URL the first time. So it carries what it has and says what it did.
 */
const carried = ["/ (app)"];

if (existsSync("../dawai-site")) {
  cpSync("../dawai-site", `${OUT}/design`, { recursive: true });
  // The one exception: the prototype ships a service worker, and a worker served
  // from this origin could claim scope over the APP and keep serving stale
  // copies of it. The prototype renders fine without it; the app must never be
  // behind a cache this deploy cannot invalidate.
  rmSync(`${OUT}/design/sw.js`, { force: true });
  // The prototype's own netlify.toml is config, not content.
  rmSync(`${OUT}/design/netlify.toml`, { force: true });
  carried.push("/design/ (prototype)");
} else {
  console.log("assemble-preview: ../dawai-site is not in this build context — the design prototype is NOT in this deploy");
}

if (existsSync("../review")) {
  cpSync("../review", `${OUT}/review`, { recursive: true });
  carried.push("/review/ (gallery)");
} else {
  console.log("assemble-preview: ../review is not in this build context — the screen gallery is NOT in this deploy");
}

console.log(`preview assembled: ${carried.join(" · ")}`);
