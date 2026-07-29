/* ============================================================
   قريب · الكتابة دون اتصال والمزامنة — OFFLINE WRITES & SYNC
   ============================================================
   Section 16 of the brief, and the one whose failure mode is silent.

   WHY THIS IS ABOUT ELECTRICITY, NOT BANDWIDTH.

   The Iraq research pass was unambiguous on this: technical generating
   capacity around 26 GW against demand above 50, a national grid collapse in
   August 2025, shorter cuts almost daily, and businesses running on private
   generators. Mobile connections meanwhile run at about 103% of population
   with 83% on 3G/4G/5G.

   So the failure to design for is not "the connection is slow". It is "the
   device died mid-write". That is a different engineering problem and it has
   a different answer: nothing important may live only in RAM, every write is
   journalled before it is attempted, and the journal survives a hard power
   loss because it is on disk before the network is ever touched.

   THE RULE EVERYTHING ELSE SERVES:
   NEVER REPORT A SYNC THAT DID NOT HAPPEN.

   A screen that shows a tick when the write is still in the outbox teaches a
   clinician that the record is safe when it is not — and they will act on
   that, close the laptop, and the diagnosis they typed will be gone. Every
   record carries its own sync state, that state is DERIVED from the outbox
   rather than set by an optimistic handler, and the honest state has four
   values, not two: `local`, `sending`, `synced`, `failed`. There is no
   "probably fine".

   This file is pure. It owns no timers, no fetch and no storage — the caller
   provides the clock, the transport and the persistence, so every rule here
   runs in Node against the shipped bytes.
   ============================================================ */
(function (root) {
  "use strict";

  const ms = (t) => (t == null ? null : (typeof t === "number" ? t : new Date(t).getTime()));
  const txt = (v) => String(v == null ? "" : v).trim();
  const SEC = 1000, MIN = 60000;

  /* =========================================================
     ١ · حالة المزامنة — SYNC STATE
     ========================================================= */

  const SYNC = {
    LOCAL: "local",     /* written here, never attempted — the honest default */
    SENDING: "sending", /* in flight right now */
    SYNCED: "synced",   /* the server acknowledged THIS revision */
    FAILED: "failed",   /* attempted, refused or unreachable, still held */
    CONFLICT: "conflict", /* the server has a version we did not start from */
  };

  /* What the user is told. Deliberately blunt in Arabic: a patient or a
     clinician must be able to tell at a glance whether the thing they just
     typed exists anywhere but this phone. */
  const SYNC_LABEL = {
    local: { ar: "محفوظ على هذا الجهاز فقط", en: "saved on this device only" },
    sending: { ar: "جارٍ الرفع", en: "uploading" },
    synced: { ar: "محفوظ", en: "saved" },
    failed: { ar: "ما انرفع — محفوظ محلياً", en: "not uploaded — held locally" },
    conflict: { ar: "يحتاج مراجعتك — تغيّر من مكان ثاني", en: "needs your review — changed elsewhere" },
  };
  const syncLabel = (s, lang) => (SYNC_LABEL[s] || SYNC_LABEL.local)[lang === "en" ? "en" : "ar"];

  /* =========================================================
     ٢ · صندوق الصادر — THE OUTBOX
     =========================================================
     A journal, not a queue of callbacks. Every entry is a complete,
     self-contained description of an intended change, written to disk BEFORE
     any network attempt, so a power cut between "user pressed save" and "the
     radio woke up" loses nothing.
     ========================================================= */

  const OP = { CREATE: "create", UPDATE: "update", APPEND: "append" };

  /* Deliberately NO `delete`. Clinical data is never hard-deleted — a
     correction is an addendum and a retraction is a status change, both of
     which are ordinary updates. An outbox that can carry a delete is an
     outbox that can lose a record to a replay bug. */

  function enqueue(outbox, entry, at) {
    if (!entry) return { ok: false, reason: "NO_ENTRY" };
    if (!Object.values(OP).includes(entry.op)) return { ok: false, reason: "BAD_OP" };
    if (!txt(entry.collection)) return { ok: false, reason: "COLLECTION_REQUIRED" };
    if (!txt(entry.id)) return { ok: false, reason: "ID_REQUIRED" };
    if (entry.payload == null) return { ok: false, reason: "PAYLOAD_REQUIRED" };
    /* The idempotency key is what makes a retry safe. Without it, a request
       that succeeded on the server but whose response was lost in a dropped
       connection gets replayed and creates a second encounter — a duplicate
       clinical assertion that looks exactly like a real one. */
    if (!txt(entry.opId)) return { ok: false, reason: "OP_ID_REQUIRED" };

    const list = outbox || [];
    /* Replaying the same operation is a no-op, not a second write. */
    if (list.some((e) => e.opId === entry.opId)) return { ok: true, outbox: list, deduped: true };

    return { ok: true, deduped: false, outbox: [...list, {
      opId: entry.opId, op: entry.op, collection: entry.collection, id: entry.id,
      payload: entry.payload,
      /* The revision this change was made FROM. It is what lets the server
         detect that someone else moved the record underneath us, which is
         the only way to catch a conflict rather than silently overwrite. */
      baseRev: entry.baseRev ?? null,
      state: SYNC.LOCAL, attempts: 0, lastAttemptAt: null, lastError: null,
      queuedAt: at, deviceId: entry.deviceId || null,
      /* Clinical writes go first when the window is short. A power cut gives
         you ninety seconds of hotspot, and a signed encounter matters more
         than a saved bookmark. */
      priority: entry.priority ?? priorityFor(entry.collection),
    }] };
  }

  const CRITICAL_COLLECTIONS = ["encounters", "results", "prescriptions", "allergies",
                                "medications", "conditions", "accessLog", "shares"];
  const priorityFor = (c) => (CRITICAL_COLLECTIONS.indexOf(c) !== -1 ? 0 : 1);

  /* What to send next: highest priority, then oldest, and never something
     already in flight or parked in conflict. */
  function nextBatch(outbox, now, limit) {
    return (outbox || [])
      .filter((e) => e.state === SYNC.LOCAL || (e.state === SYNC.FAILED && isDue(e, now)))
      .sort((a, b) => a.priority - b.priority || ms(a.queuedAt) - ms(b.queuedAt))
      .slice(0, limit || 10);
  }

  /* =========================================================
     ٣ · إعادة المحاولة — BACKOFF
     =========================================================
     Exponential with a ceiling, and a cap on attempts after which the entry
     stops retrying and starts ASKING. An entry that retries forever is an
     entry the user is never told about.
     ========================================================= */

  const BACKOFF = [2 * SEC, 5 * SEC, 15 * SEC, 60 * SEC, 5 * MIN, 15 * MIN];
  const MAX_ATTEMPTS = 12;

  /* `attempts` is how many have ALREADY failed, so the wait after the first
     failure is BACKOFF[0]. Indexing by `attempts` directly skipped the first
     rung and made the very first retry — the one most likely to succeed,
     because a Baghdad connection usually returns in seconds — wait five
     instead of two. */
  function backoffFor(attempts) {
    return BACKOFF[Math.min(Math.max(attempts - 1, 0), BACKOFF.length - 1)];
  }
  function isDue(entry, now) {
    if (!entry.lastAttemptAt) return true;
    if (entry.attempts >= MAX_ATTEMPTS) return false;   /* stops retrying; still held, still visible */
    return ms(now) - ms(entry.lastAttemptAt) >= backoffFor(entry.attempts);
  }
  const isStuck = (entry) => entry.attempts >= MAX_ATTEMPTS && entry.state === SYNC.FAILED;

  const markSending = (entry, now) => ({ ...entry, state: SYNC.SENDING, lastAttemptAt: now });

  /* =========================================================
     ٤ · نتيجة المحاولة — SETTLING AN ATTEMPT
     =========================================================
     The three outcomes are NOT "ok" and "not ok". A refusal the server
     understood (422, a validation error) must never be retried — retrying it
     twelve times just delays telling the user their input was rejected.
     ========================================================= */

  const OUTCOME = {
    ACK: "ack",             /* the server stored it and returned the new revision */
    RETRYABLE: "retryable", /* unreachable, timeout, 5xx — the write may still land */
    REJECTED: "rejected",   /* the server understood and refused — do not retry */
    CONFLICT: "conflict",   /* the server's revision is not the one we started from */
  };

  function settle(outbox, opId, outcome, info, now) {
    const list = outbox || [];
    const i = list.findIndex((e) => e.opId === opId);
    if (i === -1) return { ok: false, reason: "NOT_IN_OUTBOX" };
    const e = list[i];

    if (outcome === OUTCOME.ACK) {
      /* Acknowledged entries LEAVE the outbox. Keeping them would make the
         outbox grow without bound on a device that is offline half the day. */
      return { ok: true, outbox: list.filter((x) => x.opId !== opId),
        applied: { collection: e.collection, id: e.id, rev: (info && info.rev) ?? null,
          state: SYNC.SYNCED, syncedAt: now } };
    }
    const next = { ...e, attempts: e.attempts + 1, lastAttemptAt: now,
      lastError: (info && info.error) || null };
    if (outcome === OUTCOME.CONFLICT) {
      next.state = SYNC.CONFLICT;
      next.serverRev = (info && info.serverRev) ?? null;
      next.serverPayload = (info && info.serverPayload) ?? null;
    } else if (outcome === OUTCOME.REJECTED) {
      /* Refused, permanently. It stays in the outbox — it is the user's data
         and deleting it because a server disliked it would be the worst
         possible resolution — but it never retries and it surfaces. */
      next.state = SYNC.FAILED;
      next.attempts = MAX_ATTEMPTS;
      next.permanent = true;
    } else {
      next.state = SYNC.FAILED;
    }
    const out = list.slice(); out[i] = next;
    return { ok: true, outbox: out, applied: null };
  }

  /* =========================================================
     ٥ · التعارض — CONFLICT
     =========================================================
     Two providers editing the same record is section 27's question, and the
     answer differs by WHAT is being edited. This is not one policy.
     ========================================================= */

  const RESOLUTION = {
    /* Immutable clinical assertions never merge. Two signed encounters are
       two encounters, and the "conflict" was an illusion created by giving
       them the same id — the fix is to keep both, always. */
    KEEP_BOTH: "keep-both",
    /* Longitudinal lists are append-and-supersede: whoever wrote last owns
       the current value, but the previous one stays readable with its author. */
    SUPERSEDE: "supersede",
    /* Anything a human must look at. The default when in doubt. */
    ASK_HUMAN: "ask-human",
  };

  const IMMUTABLE_COLLECTIONS = ["encounters", "prescriptions", "results", "studies", "documents", "accessLog"];
  const LIST_COLLECTIONS = ["conditions", "medications", "allergies", "procedures", "immunizations"];

  function resolutionFor(collection) {
    if (IMMUTABLE_COLLECTIONS.indexOf(collection) !== -1) return RESOLUTION.KEEP_BOTH;
    if (LIST_COLLECTIONS.indexOf(collection) !== -1) return RESOLUTION.SUPERSEDE;
    return RESOLUTION.ASK_HUMAN;
  }

  function resolveConflict(entry, choice, actor, now) {
    if (!entry || entry.state !== SYNC.CONFLICT) return { ok: false, reason: "NOT_IN_CONFLICT" };
    if (!actor || !txt(actor.id)) return { ok: false, reason: "ACTOR_REQUIRED" };
    const policy = resolutionFor(entry.collection);

    if (policy === RESOLUTION.KEEP_BOTH) {
      /* Re-queued under a NEW id and a new op id, so it lands beside the
         server's copy instead of on top of it. Nothing is lost and nothing
         is silently merged. */
      return { ok: true, action: RESOLUTION.KEEP_BOTH, entry: {
        ...entry, id: entry.id + "-dup", opId: entry.opId + "-dup",
        state: SYNC.LOCAL, attempts: 0, baseRev: null,
        payload: { ...entry.payload, id: entry.id + "-dup",
          duplicateOf: entry.id, duplicateReason: "CONCURRENT_WRITE", resolvedBy: actor.id, resolvedAt: now },
      } };
    }
    if (policy === RESOLUTION.SUPERSEDE) {
      if (choice !== "mine" && choice !== "theirs") return { ok: false, reason: "CHOICE_REQUIRED" };
      if (choice === "theirs") {
        return { ok: true, action: RESOLUTION.SUPERSEDE, entry: null, keepServer: true };
      }
      /* Rebased onto the server's revision, carrying who decided and when. */
      return { ok: true, action: RESOLUTION.SUPERSEDE, entry: {
        ...entry, state: SYNC.LOCAL, attempts: 0, baseRev: entry.serverRev,
        payload: { ...entry.payload, supersedes: entry.serverRev,
          resolvedBy: actor.id, resolvedAt: now },
      } };
    }
    return { ok: false, reason: "HUMAN_REQUIRED", policy };
  }

  /* =========================================================
     ٦ · حالة الجهاز — WHAT THE USER IS TOLD
     ========================================================= */

  function outboxSummary(outbox, now) {
    const list = outbox || [];
    const pending = list.filter((e) => e.state === SYNC.LOCAL || e.state === SYNC.SENDING);
    const failed = list.filter((e) => e.state === SYNC.FAILED);
    const stuck = failed.filter(isStuck);
    const conflicts = list.filter((e) => e.state === SYNC.CONFLICT);
    const clinical = list.filter((e) => e.priority === 0);
    const oldest = list.length
      ? list.reduce((a, b) => (ms(a.queuedAt) <= ms(b.queuedAt) ? a : b)).queuedAt : null;
    return {
      total: list.length, pending: pending.length, failed: failed.length,
      stuck: stuck.length, conflicts: conflicts.length, clinical: clinical.length,
      oldestQueuedAt: oldest,
      /* The single boolean a screen should key off. TRUE means: some of what
         you are looking at exists only here. */
      hasUnsynced: list.length > 0,
      /* Loud when clinical data has been stranded long enough that the person
         who wrote it has probably forgotten. */
      needsAttention: stuck.length > 0 || conflicts.length > 0
        || (clinical.length > 0 && oldest != null && ms(now) - ms(oldest) > 24 * 3600000),
    };
  }

  /* The state of ONE record, derived from the outbox rather than stored on
     the record. A stored flag is exactly what starts lying the moment a sync
     fails and nobody clears it. */
  function recordState(outbox, collection, id) {
    const mine = (outbox || []).filter((e) => e.collection === collection && e.id === id);
    if (!mine.length) return SYNC.SYNCED;
    if (mine.some((e) => e.state === SYNC.CONFLICT)) return SYNC.CONFLICT;
    if (mine.some((e) => e.state === SYNC.SENDING)) return SYNC.SENDING;
    if (mine.some((e) => e.state === SYNC.FAILED)) return SYNC.FAILED;
    return SYNC.LOCAL;
  }

  /* =========================================================
     ٧ · معرّفات دون اتصال — OFFLINE IDS
     =========================================================
     DHIS2's pattern, which is what a national-scale system actually runs:
     the device downloads a block of server-issued identifiers while it has a
     connection and hands them out locally while it does not. Two clinics
     registering a patient during the same outage cannot collide, because
     neither is inventing numbers.

     Client-side UUIDs would also not collide, but they cannot be reconciled
     with a server-side sequence later, and they make every id opaque to the
     humans who have to read them down a phone line.
     ========================================================= */

  const POOL_LOW = 20;

  function takeId(pool) {
    const p = pool || { ids: [], issuedAt: null };
    if (!p.ids.length) {
      /* NOT a silent fallback to a random id. Running out is a real
         operational state and the app must say so rather than paper over it
         with something the server will later reject. */
      return { ok: false, reason: "POOL_EMPTY" };
    }
    const [id, ...rest] = p.ids;
    return { ok: true, id, pool: { ...p, ids: rest }, low: rest.length <= POOL_LOW };
  }
  const poolNeedsRefill = (pool) => !pool || !pool.ids || pool.ids.length <= POOL_LOW;

  /* =========================================================
     ٨ · نطاق العيادة — CATCHMENT
     =========================================================
     Bahmni's pattern: a device syncs the patients that clinic actually sees,
     not the national dataset. On a phone with 2 GB of storage in a clinic
     with four hours of mains power, "download everything" is not a strategy.
     ========================================================= */

  function catchmentFilter(patients, ctx) {
    const { facilityId, districts, sinceDays, now } = ctx || {};
    const cutoff = sinceDays ? ms(now) - sinceDays * 86400000 : null;
    return (patients || []).filter((p) => {
      if (facilityId && (p.facilityIds || []).indexOf(facilityId) !== -1) return true;
      if (districts && districts.indexOf(p.district) !== -1) return true;
      if (cutoff && ms(p.lastSeenAt) >= cutoff) return true;
      return false;
    });
  }

  root.SYNC = {
    SYNC, SYNC_LABEL, syncLabel,
    OP, enqueue, nextBatch, priorityFor, CRITICAL_COLLECTIONS,
    BACKOFF, MAX_ATTEMPTS, backoffFor, isDue, isStuck, markSending,
    OUTCOME, settle,
    RESOLUTION, IMMUTABLE_COLLECTIONS, LIST_COLLECTIONS, resolutionFor, resolveConflict,
    outboxSummary, recordState,
    POOL_LOW, takeId, poolNeedsRefill,
    catchmentFilter,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
