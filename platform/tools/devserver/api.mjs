/**
 * A development server speaking the contracts in docs/technical/05-api-contracts.
 *
 * NOT product. It exists so the patient workflow can be walked and verified
 * before a backend exists, and it answers exactly what the contract declares —
 * the same statuses, the same shapes, the same refusals. Where it invents, it
 * invents DATA (a catalogue of real Iraqi pharmacy stock, three pharmacies in
 * Karrada) and never BEHAVIOUR: no endpoint here answers anything the contract
 * does not describe.
 *
 * Offers arrive on a timer because in the product they arrive when pharmacists
 * answer. That is the one honest way to show R7's wait without a pharmacy app.
 */
const CATALOGUE = [
  { itemId: "i-panadol", name: "بانادول", latinName: "Panadol", form: "أقراص", strength: "500mg", requestable: true, requiresPrescription: false, isControlled: false },
  { itemId: "i-panadol-extra", name: "بانادول اكسترا", latinName: "Panadol Extra", form: "أقراص", strength: "500mg", requestable: true, requiresPrescription: false, isControlled: false },
  { itemId: "i-amoxil", name: "أموكسيسيلين", latinName: "Amoxicillin", form: "كبسول", strength: "500mg", requestable: true, requiresPrescription: true, isControlled: false },
  { itemId: "i-augmentin", name: "أوغمنتين", latinName: "Augmentin", form: "أقراص", strength: "625mg", requestable: true, requiresPrescription: true, isControlled: false },
  { itemId: "i-brufen", name: "بروفين", latinName: "Brufen", form: "أقراص", strength: "400mg", requestable: true, requiresPrescription: false, isControlled: false },
  { itemId: "i-ventolin", name: "فنتولين", latinName: "Ventolin", form: "بخاخ", strength: "100mcg", requestable: true, requiresPrescription: true, isControlled: false },
  { itemId: "i-cetamol", name: "سيتامول", latinName: "Cetamol", form: "أقراص", strength: "500mg", requestable: true, requiresPrescription: false, isControlled: false },
  { itemId: "i-vitamin-d", name: "فيتامين د", latinName: "Vitamin D3", form: "كبسول", strength: "50000IU", requestable: true, requiresPrescription: false, isControlled: false },
  { itemId: "i-tramadol", name: "ترامادول", latinName: "Tramadol", form: "أقراص", strength: "50mg", requestable: true, requiresPrescription: true, isControlled: true },
];

const BRANCHES = [
  { branchId: "b-rasheed", branchName: "صيدلية الرشيد", districtName: "الكرادة", distanceM: 450, honoured: "trusted", openNow: true },
  { branchId: "b-karrada", branchName: "صيدلية الكرادة", districtName: "الكرادة", distanceM: 1200, honoured: "new", openNow: true },
  { branchId: "b-nahrain", branchName: "صيدلية النهرين", districtName: "الكرادة", distanceM: 2300, honoured: "needs_attention", openNow: false },
];

/** Requests, offers and reservations for this dev session. Memory only. */
const state = { requests: new Map(), offers: new Map(), reservations: new Map(), challenges: new Map() };

const norm = (s) => (s ?? "")
  .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
  .replace(/[ـ]/g, "").replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه")
  .replace(/\s+/g, " ").trim();

const json = (res, status, body) => {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
};

const readBody = (req) => new Promise((resolve) => {
  let raw = "";
  req.on("data", (c) => { raw += c; });
  req.on("end", () => { try { resolve(JSON.parse(raw || "{}")); } catch { resolve({}); } });
});

/** Price in fils, stable per branch+item so a refresh does not reprice. */
const priceFor = (branchId, itemId) => {
  let h = 0;
  for (const ch of branchId + itemId) h = (h * 31 + ch.charCodeAt(0)) % 9973;
  return 1_000 + (h % 12) * 250;
};

export async function handle(req, res) {
  const url = new URL(req.url, "http://localhost");
  const path = url.pathname;
  if (!path.startsWith("/v1/")) return false;

  /* ── Catalogue ─────────────────────────────────────────────────────── */
  if (path === "/v1/catalogue/search" && req.method === "GET") {
    const q = norm(url.searchParams.get("q"));
    const hits = q === "" ? [] : CATALOGUE.filter((c) => norm(c.name).includes(q) || norm(c.latinName).toLowerCase().includes(q.toLowerCase()));
    return json(res, 200, { hits, at: Date.now() });
  }

  /* ── Identity — POST /v1/auth/phone, POST /v1/auth/verify ──────────── */
  if (path === "/v1/auth/phone" && req.method === "POST") {
    const body = await readBody(req);
    const challengeId = `ch-${Math.random().toString(36).slice(2, 10)}`;
    // The code is printed, never returned: the contract does not carry it, and
    // returning it would be inventing a response field.
    state.challenges.set(challengeId, { code: "123456", used: 0, phone: body.phone });
    console.log(`\n  [dev] SMS to ${body.phone}: your code is 123456\n`);
    return json(res, 202, { challengeId, resendAfter: 45 });
  }

  if (path === "/v1/auth/verify" && req.method === "POST") {
    const body = await readBody(req);
    const ch = state.challenges.get(body.challengeId);
    if (!ch) return json(res, 404, { error: "not_found_or_not_yours" });
    if (body.code !== ch.code) {
      ch.used += 1;
      const attemptsLeft = Math.max(0, 5 - ch.used);
      return attemptsLeft === 0
        ? json(res, 429, { error: "too_many_attempts" })
        : json(res, 400, { error: "wrong_code", attemptsLeft });
    }
    return json(res, 200, {
      account: { accountId: "acc-dev" },
      subjects: [{ subjectId: "subj-dev", name: "أم علي" }],
    });
  }

  /* ── Requests — POST /v1/requests ──────────────────────────────────── */
  if (path === "/v1/requests" && req.method === "POST") {
    const body = await readBody(req);
    const requestId = `req-${Math.random().toString(36).slice(2, 8)}`;
    const windowMs = body.urgency === "now" ? 20 * 60_000 : body.urgency === "today" ? 4 * 3_600_000 : 2 * 86_400_000;
    const lines = (body.lines ?? []).map((l, i) => ({ ...l, requestLineId: `${requestId}-l${i + 1}` }));
    state.requests.set(requestId, { requestId, lines, sentAt: Date.now(), urgency: body.urgency });
    state.offers.set(requestId, []);
    scheduleOffers(requestId, lines);
    return json(res, 201, {
      request: { requestId, lines },
      windowEndsAt: Date.now() + windowMs,
      branchesAsked: BRANCHES.filter((b) => b.openNow).length,
    });
  }

  /* ── The request as it stands — GET /v1/requests/{id} ──────────────── */
  /* The declared route, and the declared body: { request, responders:{asked,
     replied, thinking}, offers[] }. An earlier version of this file served
     `/v1/requests/{id}/offers`, which is a route no contract declares — this
     file may invent data and may not invent behaviour, and a path is
     behaviour. `thinking` is asked minus replied: a branch that was asked and
     has not answered is still thinking, which is what R7 needs in order to
     say how many are left rather than only how many came. */
  const readMatch = path.match(/^\/v1\/requests\/([^/]+)$/);
  if (readMatch && req.method === "GET") {
    const request = state.requests.get(readMatch[1]);
    const list = state.offers.get(readMatch[1]);
    if (!request || !list) return json(res, 404, { error: "not_found_or_not_yours" });
    const asked = BRANCHES.filter((b) => b.openNow).length;
    return json(res, 200, {
      request,
      responders: { asked, replied: list.length, thinking: Math.max(0, asked - list.length) },
      offers: list,
    });
  }

  /* ── Accept — POST /v1/offers/{id}/accept ──────────────────────────── */
  const acceptMatch = path.match(/^\/v1\/offers\/([^/]+)\/accept$/);
  if (acceptMatch && req.method === "POST") {
    const offerId = acceptMatch[1];
    let found = null;
    for (const list of state.offers.values()) for (const o of list) if (o.offerId === offerId) found = o;
    if (!found) return json(res, 404, { error: "not_found_or_not_yours" });
    if (found.state === "withdrawn") return json(res, 409, { error: "offer_withdrawn" });
    if (found.state !== "sent") return json(res, 409, { error: "offer_expired" });

    const body = await readBody(req);
    const hasSub = found.lines.some((l) => l.answer.kind === "substitute");
    if (hasSub && body.substitutionAcknowledged !== true)
      return json(res, 400, { error: "substitution_not_acknowledged" });

    found.state = "accepted";
    const reservationId = `res-${Math.random().toString(36).slice(2, 8)}`;
    const code = String(Math.floor(100000 + Math.random() * 899999));
    const confirmedAt = Date.now();
    const reservation = {
      reservationId, code, branchName: found.branchName, holderName: "أم علي",
      branchPhone: "07701234567", address: `${found.districtName} — قرب الساحة`,
      confirmedAt, expiresAt: confirmedAt + 4 * 3_600_000,
      totalMinor: found.lines.filter((l) => l.answer.kind !== "unavailable")
        .reduce((n, l) => n + (l.answer.priceMinor ?? 0), 0),
      lines: found.lines.filter((l) => l.answer.kind !== "unavailable")
        .map((l) => ({ itemName: l.itemName, packs: l.packs ?? 1, priceMinor: l.answer.priceMinor ?? 0 })),
    };
    state.reservations.set(reservationId, reservation);
    console.log(`\n  [dev] reservation ${code} held at ${found.branchName}\n`);
    return json(res, 201, { reservation });
  }

  return json(res, 404, { error: "not_found_or_not_yours" });
}

/**
 * Pharmacies answer over the next several seconds, the way they would in the
 * product. R7's wait is real, not simulated with a spinner.
 */
function scheduleOffers(requestId, lines) {
  BRANCHES.forEach((branch, i) => {
    if (!branch.openNow) return; // a closed pharmacy does not answer (§8)
    setTimeout(() => {
      const list = state.offers.get(requestId);
      if (!list) return;
      const offerLines = lines.map((l, n) => {
        const item = CATALOGUE.find((c) => c.itemId === l.itemId) ?? CATALOGUE[0];
        // The second pharmacy proposes a substitute for one line, so R9 and
        // the §4 R10 consent gate are reachable by walking the workflow.
        if (i === 1 && n === 0 && item.itemId === "i-panadol")
          return {
            requestLineId: l.requestLineId, itemName: item.name, latinName: item.latinName, packs: l.packs,
            answer: { kind: "substitute", priceMinor: priceFor(branch.branchId, item.itemId), itemId: "i-cetamol", note: "نفس المادة الفعالة — الباراسيتامول ٥٠٠" },
            substituteName: "سيتامول", substituteLatinName: "Cetamol",
            proposedBy: { name: "د. أحمد الجبوري", licenceVerified: true, branchName: branch.branchName },
          };
        // The third pharmacy is short one line, so partial coverage is visible.
        if (i === 2 && n === lines.length - 1 && lines.length > 1)
          return { requestLineId: l.requestLineId, itemName: item.name, latinName: item.latinName, packs: l.packs, answer: { kind: "unavailable", reason: "out_of_stock" } };
        return { requestLineId: l.requestLineId, itemName: item.name, latinName: item.latinName, packs: l.packs, answer: { kind: "available", priceMinor: priceFor(branch.branchId, item.itemId) } };
      });
      list.push({
        offerId: `off-${requestId}-${branch.branchId}`, branchId: branch.branchId, branchName: branch.branchName,
        districtName: branch.districtName, distanceM: branch.distanceM, honoured: branch.honoured,
        openNow: branch.openNow, state: "sent", lines: offerLines,
      });
      console.log(`  [dev] ${branch.branchName} answered request ${requestId}`);
    }, 3_000 + i * 4_000);
  });
}
