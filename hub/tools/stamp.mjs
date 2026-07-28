#!/usr/bin/env node
/* ==================================================================
   QAREEB — BUILD STAMP
   ==================================================================
   Netlify runs no build for this site (the whole point: zero dependencies,
   nothing to break at deploy time), so nothing was ever writing a version
   into the artefacts. The service worker's cache key was therefore typed by
   hand, and a hand-typed cache key is a key that gets forgotten — three
   deploys once shipped behind a stale one, invisible to everyone looking.

   This writes ONE stamp into both places that need to agree:
     · hub/sw.js      → const V   (the cache name; changing it purges the old)
     · hub/js/data.js → CONFIG.build (what the app shows in its footer)

   Run it before committing:  node tools/stamp.mjs
   The stamp is a UTC minute — monotonic, needs no git history, and readable
   out loud over the phone when someone asks "which version are you on?".
   ================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HUB = join(dirname(fileURLToPath(import.meta.url)), "..");
const d = new Date();
const p = (n, w = 2) => String(n).padStart(w, "0");
const STAMP = `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}`;

function stamp(file, re, next) {
  const path = join(HUB, file);
  const src = readFileSync(path, "utf8");
  const hits = src.match(re);
  if (!hits) { console.error(`  ✗ ${file}: no stamp site found — refusing to guess`); process.exit(1); }
  if (hits.length > 1) { console.error(`  ✗ ${file}: ${hits.length} stamp sites, expected 1`); process.exit(1); }
  writeFileSync(path, src.replace(re, next), "utf8");
  console.log(`  ✓ ${file}`);
}

stamp("sw.js", /const V = "qareeb-[^"]*";/, `const V = "qareeb-${STAMP}";`);
stamp("js/data.js", /build: "[^"]*",/, `build: "${STAMP}",`);

console.log(`stamped ${STAMP}`);
