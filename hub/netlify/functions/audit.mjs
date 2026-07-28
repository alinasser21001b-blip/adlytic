/* ==================================================================
   QAREEB — SERVER-SIDE AUDIT
   ==================================================================
   Closes AUDIT_CLIENT_SIDE. The browser chain in js/domain.js detects
   tampering; it cannot prevent it, because whoever holds the phone can
   rewrite the whole chain from the start and recompute every link. That is
   fine for showing a pharmacist their own history and useless as evidence.

   Here the chain is written to Netlify Blobs by a process the claimant does
   not control, and every append requires a signed session — so an entry
   cannot be added in someone else's name, and existing entries cannot be
   edited or removed through this endpoint at all. There is no update path
   and no delete path; that is the design, not an omission.

   HONEST LIMIT, because it is the difference between append-only and
   append-only-by-us: Blobs are mutable storage. Somebody with the site's
   deploy credentials could still rewrite history out of band. Real WORM
   needs storage that refuses overwrites — object-lock or an append-only
   database role. Until that exists /status reports `wormBacked: false` and
   the operator console shows this control as partial rather than done.
   ================================================================== */
import { getStore } from "@netlify/blobs";
import { json, misconfigured, secret, verify, entryHash, GENESIS, verifyChain, rateLimit } from "./_lib.mjs";

const STORE = "qareeb-audit";
const KEY = "chain";

/* Actions the server will record. An open vocabulary means a client can
   write anything into the record that protects a patient, which defeats it. */
const ACTIONS = new Set([
  "PHARMACY_SIGNIN", "STOCK_CLAIMED", "STOCK_DECLINED",
  "PRESCRIPTION_VIEWED", "HANDOFF_OPENED", "REQUEST_PUBLISHED", "REQUEST_CANCELLED",
]);

async function load(store) {
  try {
    const raw = await store.get(KEY, { type: "json" });
    return Array.isArray(raw) ? raw : [];
  } catch { return []; }
}

export default async (request) => {
  if (!secret()) return misconfigured();

  let store;
  try { store = getStore(STORE); }
  catch {
    return json(503, { error: "NO_BLOB_STORE",
      ar: "تخزين السجل غير متاح على هذا النشر." });
  }

  /* ---------- read: verification is public, contents are not ----------
     Anyone may confirm the chain is intact — that is what makes the claim
     checkable rather than something we assert. Reading the entries needs a
     session, because they name pharmacies and requests. */
  if (request.method === "GET") {
    const chain = await load(store);
    const url = new URL(request.url);
    const broken = verifyChain(chain);
    const summary = {
      ok: true, length: chain.length, intact: broken === -1,
      brokenAt: broken === -1 ? null : broken,
      head: chain.length ? chain[chain.length - 1].entryHash : GENESIS,
      wormBacked: false,
      ar: broken === -1
        ? "السجل مترابط وسليم."
        : `السجل مكسور عند القيد رقم ${broken}.`,
    };
    if (url.searchParams.get("entries") !== "1") return json(200, summary);

    const claims = verify((request.headers.get("authorization") || "").replace(/^Bearer\s+/i, ""));
    if (!claims) return json(401, { error: "AUTH_REQUIRED" });
    /* A pharmacy sees its own history, never the whole network's. */
    return json(200, { ...summary, entries: chain.filter((e) => e.pharmacyId === claims.pharmacyId) });
  }

  if (request.method !== "POST") return json(405, { error: "METHOD_NOT_ALLOWED" });

  const claims = verify((request.headers.get("authorization") || "").replace(/^Bearer\s+/i, ""));
  if (!claims) return json(401, { error: "AUTH_REQUIRED", ar: "الجلسة غير صالحة." });

  const ip = request.headers.get("x-nf-client-connection-ip") || "unknown";
  if (!rateLimit("audit:" + claims.pharmacyId + ":" + ip, 120, 60 * 1000)) {
    return json(429, { error: "TOO_MANY" });
  }

  let body;
  try { body = await request.json(); } catch { return json(400, { error: "BAD_JSON" }); }
  if (!ACTIONS.has(body.action)) return json(400, { error: "UNKNOWN_ACTION" });

  /* The actor and the pharmacy come from the SIGNED SESSION, never from the
     request body. A client that could name its own actor could write an
     entry blaming another pharmacy — which would make the log worse than
     having none, because it would be trusted. */
  const entry = {
    action: body.action,
    actor: claims.pharmacistId,
    pharmacyId: claims.pharmacyId,
    subject: body.subject ? String(body.subject).slice(0, 64) : null,
    reason: body.reason ? String(body.reason).slice(0, 120) : null,
    at: Date.now(),
  };

  const chain = await load(store);
  const previousHash = chain.length ? chain[chain.length - 1].entryHash : GENESIS;
  const rec = { ...entry, previousHash, entryHash: entryHash(previousHash, entry) };
  chain.push(rec);
  await store.setJSON(KEY, chain);

  return json(200, { ok: true, entryHash: rec.entryHash, length: chain.length });
};

export const config = { path: "/api/audit" };
