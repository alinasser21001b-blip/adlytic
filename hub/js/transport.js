/* ============================================================
   قريب · النقل — TRANSPORT
   ============================================================
   The only place in the client that touches the network on the record's
   behalf. `js/sync.js` decides WHAT to send and what an outcome means; this
   decides WHEN to try and does the fetch. The split is the same one the rest
   of the codebase uses: the rules are pure and tested in Node, the I/O is
   thin enough to read in one sitting.

   THE RULE IT EXISTS TO KEEP:
   the screen must never show a state the server did not confirm.

   So this file has no optimistic path. A write is enqueued, the UI reads its
   state from the outbox, and the state only becomes `synced` when the server
   said so — which, on the outbox model, means the entry is gone. There is no
   code here that marks anything successful in advance and no `catch` that
   quietly swallows a failure into a green tick.

   IRAQ SPECIFICS THAT SHAPED IT:
   - A drain is attempted on load, on `online`, and after each write. It is
     NOT on a timer: a background poll on a metered connection in a country
     where data is bought in small bundles is someone else's money.
   - The whole batch is small (25) and clinical entries go first, because the
     window may be ninety seconds of a neighbour's hotspot.
   - Two drains never run at once. A second one starting while the first is
     in flight would resend entries already marked `sending` and produce
     duplicate work the idempotency ledger then has to absorb.
   ============================================================ */
(function (root) {
  "use strict";

  const Y = () => root.SYNC;
  const BASE = "/.netlify/functions/record";
  const KEY = "qareeb.record.v1";
  const TOKEN_KEY = "qareeb.token.v1";

  /* `LS` is declared with `const` in app.js, which makes it a LEXICAL global
     and NOT a property of globalThis — so `root.LS` is undefined and every
     read returned null while every write silently did nothing. The record
     screen looked fine because it references LS the same way this now does:
     bare, resolved at call time, after app.js has run. A storage layer that
     fails by doing nothing is the worst kind, because the app keeps
     rendering. */
  const store = () => (typeof LS !== "undefined" ? LS : null);
  const load = () => { const s = store(); return s ? s.get(KEY, null) : null; };
  const save = (d) => { const s = store(); if (s) s.set(KEY, d); };
  const token = () => { const s = store(); return s ? s.get(TOKEN_KEY, null) : null; };

  let draining = false;

  /* ---------- enqueue ----------
     Everything the app writes to the record goes through here, so nothing
     can reach storage without also being queued for the server. A write that
     is saved locally and never queued is the exact failure this whole layer
     exists to prevent — it looks saved forever. */
  function write(collection, id, payload, opts) {
    const d = load();
    if (!d) return { ok: false, reason: "NO_RECORD" };
    const o = opts || {};
    const r = Y().enqueue(d.outbox || [], {
      opId: opId(collection, id),
      op: o.op || "create",
      collection, id, payload,
      baseRev: o.baseRev ?? null,
      deviceId: deviceId(),
    }, Date.now());
    if (!r.ok) return r;
    d.outbox = r.outbox;
    save(d);
    /* Try immediately — but never block the caller on it. The user's write
       is already durable; the network is a separate concern. */
    drain();
    return { ok: true, deduped: !!r.deduped };
  }

  /* A per-operation key that survives a reload and a power cut, because it
     is derived from what is being written plus a monotonic-enough counter
     rather than from a variable in memory. */
  function opId(collection, id) {
    const s = store();
    const n = (s ? s.get("qareeb.opseq", 0) : 0) + 1;
    if (s) s.set("qareeb.opseq", n);
    return `${collection}-${id}-${n}`.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80);
  }

  function deviceId() {
    const s = store();
    let id = s && s.get("qareeb.device", null);
    if (!id) {
      id = "d" + Array.from(crypto.getRandomValues(new Uint8Array(6)), b => b.toString(36).padStart(2, "0")).join("").slice(0, 10);
      if (s) s.set("qareeb.device", id);
    }
    return id;
  }

  /* ---------- drain ---------- */
  async function drain() {
    if (draining) return { ok: false, reason: "ALREADY_DRAINING" };
    const d = load();
    if (!d || !d.patient) return { ok: false, reason: "NO_RECORD" };
    const t = token();
    /* No token is not a failure to report loudly — it is the ordinary state
       of a patient who has not signed in yet. Their record is still theirs
       and still on the device; it simply is not anywhere else, and the UI
       already says exactly that. */
    if (!t) return { ok: false, reason: "NOT_SIGNED_IN" };
    if (root.navigator && root.navigator.onLine === false) return { ok: false, reason: "OFFLINE" };

    const batch = Y().nextBatch(d.outbox, Date.now(), 25);
    if (!batch.length) return { ok: true, sent: 0 };

    draining = true;
    try {
      /* Marked SENDING before the request leaves, so a reload mid-flight
         shows "uploading" rather than "saved on this device only" — and so a
         second drain cannot pick the same entries up. */
      let ob = d.outbox.map((e) => batch.some((b) => b.opId === e.opId)
        ? Y().markSending(e, Date.now()) : e);
      persistOutbox(ob);

      let res, body;
      try {
        res = await fetch(BASE + "/sync", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: "Bearer " + t },
          body: JSON.stringify({ patientId: d.patient.id, entries: batch.map(wire),
            context: { deviceId: deviceId(), channel: "app" } }),
        });
        body = await res.json().catch(() => ({}));
      } catch (err) {
        /* Unreachable. Every entry in the batch goes back to retryable —
           NOT to rejected, because we have no idea whether the server saw
           it, and the idempotency key is what makes guessing unnecessary. */
        ob = settleAll(ob, batch, "retryable", { error: String(err && err.message || err) });
        persistOutbox(ob);
        return { ok: false, reason: "UNREACHABLE" };
      }

      if (res.status === 401) {
        /* The session died. The entries stay exactly where they are. */
        ob = settleAll(ob, batch, "retryable", { error: "UNAUTHENTICATED" });
        persistOutbox(ob);
        return { ok: false, reason: "UNAUTHENTICATED" };
      }
      if (!res.ok || !Array.isArray(body.results)) {
        ob = settleAll(ob, batch, "retryable", { error: body.error || ("HTTP " + res.status) });
        persistOutbox(ob);
        return { ok: false, reason: body.error || "SERVER_ERROR" };
      }

      /* Per-entry outcomes. A batch where three landed and one conflicted is
         not "failed" — telling the client it was is how the three that
         landed get sent again. */
      let cur = load().outbox;
      for (const r of body.results) {
        const outcome = r.outcome === "ack" ? Y().OUTCOME.ACK
          : r.outcome === "conflict" ? Y().OUTCOME.CONFLICT
          : r.outcome === "rejected" ? Y().OUTCOME.REJECTED
          : Y().OUTCOME.RETRYABLE;
        const s = Y().settle(cur, r.opId, outcome,
          { rev: r.rev, error: r.reason, serverRev: r.serverRev, serverPayload: r.serverPayload },
          Date.now());
        if (s.ok) {
          cur = s.outbox;
          if (s.applied) applyRev(s.applied);
        }
      }
      persistOutbox(cur);
      const acked = body.results.filter((r) => r.outcome === "ack").length;
      return { ok: true, sent: batch.length, acked,
        conflicts: body.results.filter((r) => r.outcome === "conflict").length,
        rejected: body.results.filter((r) => r.outcome === "rejected").length };
    } finally {
      draining = false;
    }
  }

  /* Only the fields the server's validator expects. Sending the outbox's own
     bookkeeping (attempts, lastError) would be leaking client state into a
     clinical API. */
  const wire = (e) => ({ opId: e.opId, op: e.op, collection: e.collection,
    id: e.id, payload: e.payload, baseRev: e.baseRev });

  function settleAll(ob, batch, outcome, info) {
    let cur = ob;
    for (const b of batch) {
      const s = Y().settle(cur, b.opId, outcome, info, Date.now());
      if (s.ok) cur = s.outbox;
    }
    return cur;
  }

  function persistOutbox(ob) {
    const d = load();
    if (!d) return;
    d.outbox = ob;
    save(d);
  }

  /* The server's revision is written onto the local record so the NEXT edit
     can declare what it started from. Without this every update after the
     first would arrive with a stale baseRev and conflict forever. */
  function applyRev(applied) {
    const d = load();
    if (!d) return;
    const list = d[applied.collection];
    if (Array.isArray(list)) {
      d[applied.collection] = list.map((x) => x.id === applied.id
        ? { ...x, qRev: applied.rev, qSyncedAt: applied.syncedAt } : x);
    } else if (applied.collection === "patient" && d.patient && d.patient.id === applied.id) {
      d.patient = { ...d.patient, qRev: applied.rev, qSyncedAt: applied.syncedAt };
    }
    save(d);
  }

  /* ---------- pulling a record the device does not hold ----------
     The doctor's side. Their device has no copy of this patient, so the
     snapshot is fetched under the share and held only for the session. */
  async function pull(patientId, scope, purpose) {
    const t = token();
    if (!t) return { ok: false, reason: "NOT_SIGNED_IN" };
    const q = new URLSearchParams({ patient: patientId });
    if (scope) q.set("scope", scope);
    if (purpose) q.set("purpose", purpose);
    q.set("device", deviceId());
    let res, body;
    try {
      res = await fetch(`${BASE}/read?${q}`, { headers: { authorization: "Bearer " + t } });
      body = await res.json().catch(() => ({}));
    } catch (err) {
      return { ok: false, reason: "UNREACHABLE" };
    }
    if (res.status === 403) return { ok: false, reason: body.error, ar: body.ar,
      escalationAvailable: !!body.escalationAvailable };
    if (res.status === 503) return { ok: false, reason: "STORE_UNREADABLE", ar: body.ar };
    if (!res.ok) return { ok: false, reason: body.error || "SERVER_ERROR" };
    return { ok: true, ...body };
  }

  /* Top up the reserved-id pool while there is a connection, so the device
     can register patients during the next outage without inventing numbers
     the server will later reject. */
  async function refillIds(count) {
    const t = token();
    if (!t) return { ok: false, reason: "NOT_SIGNED_IN" };
    try {
      const res = await fetch(BASE + "/ids", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer " + t },
        body: JSON.stringify({ count: count || 50 }),
      });
      if (!res.ok) return { ok: false, reason: "HTTP " + res.status };
      const body = await res.json();
      const d = load();
      if (d) {
        const pool = d.idPool || { ids: [] };
        d.idPool = { ids: [...pool.ids, ...(body.ids || [])], issuedAt: body.issuedAt };
        save(d);
      }
      return { ok: true, added: (body.ids || []).length };
    } catch { return { ok: false, reason: "UNREACHABLE" }; }
  }

  /* ---------- what the UI asks ---------- */
  const status = () => {
    const d = load();
    return Y().outboxSummary(d ? d.outbox : [], Date.now());
  };
  /* The record's own revision is passed in, because "not in the outbox" and
     "the server has it" are different facts. See SYNC.recordState. */
  const stateOf = (collection, id) => {
    const d = load();
    if (!d) return Y().SYNC.LOCAL;
    const list = collection === "patient" ? [d.patient].filter(Boolean) : (d[collection] || []);
    const rec = list.find((x) => x && x.id === id);
    return Y().recordState(d.outbox, collection, id, rec);
  };
  const signedIn = () => !!token();

  if (root.addEventListener) {
    root.addEventListener("online", () => drain());
  }

  root.TRANSPORT = { write, drain, pull, refillIds, status, stateOf, signedIn, deviceId };
})(typeof globalThis !== "undefined" ? globalThis : this);
