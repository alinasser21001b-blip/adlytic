#!/bin/sh
# ==================================================================
# Local test environment for a fresh checkout or a git worktree.
# ==================================================================
# Two things are needed and neither is in git, because node_modules is ignored:
#
#   1. playwright — a dev dependency, used only by tools/journeys.mjs and
#      tools/audit-ui.mjs. Symlinked from the session cache rather than
#      installed, because outbound npm is proxied in this environment.
#
#   2. an IN-MEMORY @netlify/blobs stub. package.json depends on the real SDK
#      and Netlify installs it at deploy time, but the real client needs a site
#      ID and a token, so getStore() throws in a bare Node process and every
#      function 503s NO_BLOB_STORE — correct fail-closed behaviour, useless for
#      tests. tools/test-e2e.mjs states this substitution in its own header.
#      Deleting node_modules destroys it and takes 12 assertions with it, which
#      is exactly how this script came to exist.
#
# Run from hub/:   sh tools/dev-setup.sh
# ==================================================================
set -e
CACHE=/tmp/claude-0/-home-user-adlytic/30c5cf51-55fb-5b53-a1de-65634dd53fa8/scratchpad/node_modules
mkdir -p node_modules/@netlify

if [ -d "$CACHE/playwright" ]; then
  ln -sfn "$CACHE/playwright" node_modules/playwright
  ln -sfn "$CACHE/playwright-core" node_modules/playwright-core
  echo "playwright: linked"
else
  echo "playwright: cache missing — journeys.mjs and audit-ui.mjs will not run"
fi

STUB=node_modules/@netlify/blobs
if [ ! -f "$STUB/stub.mjs" ]; then
  mkdir -p "$STUB"
  cat > "$STUB/package.json" <<'JSON'
{ "name": "@netlify/blobs", "version": "8.1.0-inmemory-test-stub", "type": "module",
  "main": "./stub.mjs", "exports": { ".": "./stub.mjs" } }
JSON
  cat > "$STUB/stub.mjs" <<'JS'
/* In-memory @netlify/blobs — local test substitute for the storage ONLY.
   The handlers under test are the ones that ship. get() resolves null for a
   missing key, which is the SDK's 404 contract and several call sites rely on
   it. See tools/dev-setup.sh for why this is not the real client. */
const stores = new Map();
class Store {
  constructor(name) { this.name = name; this.data = new Map(); }
  async get(key, opts = {}) {
    if (!this.data.has(key)) return null;
    const raw = this.data.get(key);
    return opts.type === "json" ? JSON.parse(raw) : raw;
  }
  async set(key, value) { this.data.set(key, String(value)); }
  async setJSON(key, value) { this.data.set(key, JSON.stringify(value)); }
  async delete(key) { this.data.delete(key); }
  async list(opts = {}) {
    const prefix = opts.prefix || "";
    return { blobs: [...this.data.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })), directories: [] };
  }
}
export function getStore(n) {
  const name = typeof n === "string" ? n : (n && n.name) || "default";
  if (!stores.has(name)) stores.set(name, new Store(name));
  return stores.get(name);
}
export const getDeployStore = getStore;
export function connectLambda() {}
export async function listStores() { return { stores: [...stores.keys()] }; }
JS
  echo "@netlify/blobs: in-memory stub created"
else
  echo "@netlify/blobs: stub already present"
fi
echo
echo "verify:  npm test   (expect 495 passing, 0 failed)"
