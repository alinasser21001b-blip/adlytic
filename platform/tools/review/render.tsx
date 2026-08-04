/**
 * Render every screen state to a standalone HTML page for photographing.
 *
 * Run through vite-node so the screens resolve exactly as they do in the test
 * runner: same aliases, same source, no build step that could drift.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SHOTS } from "./screens.js";
import { themeFor } from "../../apps/patient/src/ui/theme.js";

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../review/screens");
mkdirSync(OUT, { recursive: true });

const t = themeFor("light");

/** A device-sized frame that takes its size from the VIEWPORT rather than from
 *  a number baked into the page — so the same artefact can be photographed at
 *  320, 360, 390 and 430 without re-rendering, and so a width can never be
 *  asserted by the harness and contradicted by the document.
 *
 *  390×844 is the iPhone 14 viewport and the smallest
 *  common Android is narrower still, so the review shoots the tighter of the
 *  two dimensions the app must survive. */
const page = (body: string) => `<!doctype html>
<html dir="rtl" lang="ar"><head><meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 100%; height: 100vh; overflow: hidden; }
  body { font-family: system-ui, sans-serif; background: ${t.color.surface}; }
  #root { width: 100%; height: 100vh; display: flex; flex-direction: column; }
  #root > div { flex: 1; min-height: 0; }
  input { border: none; outline: none; background: transparent; font: inherit; }
</style></head><body><div id="root">${body}</div></body></html>`;

for (const shot of SHOTS) {
  writeFileSync(join(OUT, `${shot.id}.html`), page(renderToStaticMarkup(shot.element)), "utf8");
}

console.log(`rendered ${SHOTS.length} screen state(s) to review/screens`);
