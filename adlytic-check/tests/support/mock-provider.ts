/**
 * Out-of-process test double for the Anthropic Messages API and Turnstile
 * siteverify. Production code has no mock branch: tests point the Worker's
 * PROVIDER_BASE_URL / TURNSTILE_VERIFY_URL (honoured only outside production)
 * at this server. Behaviour is selected by a marker inside the ad text.
 */
import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type Server } from "node:http";

export function goodReport(overrides: Record<string, unknown> = {}) {
  return {
    summary: "الإعلان واضح في عرض المنتج لكن طريقة الطلب غير ظاهرة.",
    perceivedMessage: "كنبة مخمل بألوان متعددة متوفرة للطلب.",
    primaryIssue: "لا يظهر في الإعلان كيف يطلب المشاهد أو يتواصل.",
    imageTextLegibility: "clear",
    factsReadFromImage: [],
    assessments: {
      hook: { status: "needs_improvement", observation: "الجملة الأولى عامة ولا تذكر فائدة.", evidenceSource: "ad_copy", improvement: "ابدأ بما يميز الكنبة." },
      messageClarity: { status: "strong", observation: "المنتج واضح من النص.", evidenceSource: "ad_copy" },
      visualReadability: { status: "strong", observation: "النص على الصورة كبير ومقروء.", evidenceSource: "image" },
      callToAction: { status: "needs_improvement", observation: "لا توجد دعوة واضحة لإرسال رسالة.", evidenceSource: "ad_copy", improvement: "أضف: راسلنا لمعرفة الألوان." },
    },
    issues: [
      { priority: "high", observation: "لا توجد طريقة طلب واضحة.", evidenceSource: "ad_copy", whyItMatters: "المشاهد لا يعرف الخطوة التالية.", recommendedChange: "أضف جملة تدعو لإرسال رسالة." },
      { priority: "medium", observation: "الصورة مزدحمة بالعناصر.", evidenceSource: "image", whyItMatters: "يتشتت الانتباه عن المنتج.", recommendedChange: "اترك المنتج وحده في الصورة." },
    ],
    actionItems: ["أضف دعوة واضحة لإرسال رسالة.", "ابدأ النص بميزة الكنبة الأساسية."],
    improvedCopy: {
      opening: "كنبة مخمل تريّح جلستك وتزيّن صالتك.",
      body: "متوفرة بأكثر من لون، وتقدر تختار اللون المناسب لبيتك.",
      headline: "كنبة مخمل بألوان متعددة",
      callToAction: "راسلنا لمعرفة الألوان",
    },
    missingInformation: ["أضف المقاسات إذا كانت معروفة."],
    limitations: ["هذه مراجعة لوضوح المحتوى فقط، ولا تتنبأ بعدد الطلبات أو المبيعات."],
    shareableTips: ["اجعل طريقة الطلب واضحة في آخر النص.", "خلي المنتج هو العنصر الأوضح في الصورة.", "اذكر السعر 25 ألف دائماً"],
    confidence: "high",
    ...overrides,
  };
}

export function goodReportV2(overrides: Record<string, unknown> = {}) {
  return {
    evidence: [
      { id: "T1", source: "visible_text", text: "كنبة مخمل", location: "top", size: "large", confidence: "high" },
      { id: "V1", source: "visual_observation", text: "كنبة بنية في وسط الصورة", location: "middle", confidence: "high" },
    ],
    imageTextLegibility: "clear",
    summary: "الإعلان يوضح المنتج لكن طريقة الطلب ناقصة.",
    perceivedMessage: "كنبة مخمل للبيع.",
    dimensions: [
      { dimension: "offer_clarity", status: "strong", level: 4, evidenceIds: ["T1", "V1"], ruleIds: ["R-OFFER-01"], observation: "المنتج ظاهر ومسمّى." },
      { dimension: "cta", status: "needs_improvement", level: 1, evidenceIds: ["U1"], ruleIds: ["R-CTA-01"], observation: "لا توجد طريقة طلب واضحة." },
      { dimension: "opening", status: "strong", level: 3, evidenceIds: ["U1"], ruleIds: ["R-OPEN-01"], observation: "السطر الأول يذكر المنتج." },
      { dimension: "legibility", status: "strong", level: 4, evidenceIds: ["T1"], ruleIds: ["R-LEG-01"], observation: "النص كبير وواضح." },
    ],
    fixes: [{ dimension: "cta", change: "أضف «راسلنا على الخاص» في آخر النص.", why: "حتى يعرف المشتري الخطوة التالية.", evidenceIds: ["U1"], ruleIds: ["R-CTA-01"] }],
    actionSteps: ["أضف طريقة الطلب في آخر النص."],
    improvedCopy: { opening: "كنبة مخمل تريّح جلستك.", body: "متوفرة بأكثر من لون.", headline: "كنبة مخمل", callToAction: "راسلنا على الخاص" },
    alternateOpenings: ["تبحث عن كنبة مريحة لصالتك؟"],
    alternateCallsToAction: ["اكتب لنا «كنبة» بالخاص"],
    missingInformation: ["أضف المقاسات إذا كانت معروفة."],
    limitations: [],
    shareableTips: ["اجعل طريقة الطلب واضحة في آخر النص."],
    confidence: "high",
    ...overrides,
  };
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Fake ZainCash v2 gateway state. */
const zcTx = new Map<string, { amount: number; ref: string; successUrl: string; failureUrl: string; status: string; paidAmount?: number }>();

let nextSub: string | null = null;

/** Fake Google IdP state: authorization codes waiting to be exchanged. */
const codes = new Map<string, { sub: string; nonce: string; challenge: string; redirectUri: string; clientId: string }>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

export interface MockState {
  calls: number;
  last: unknown;
  siteverifyCalls: number;
}

let MOCK_SELF = "";

export function startMock(port: number): Promise<{ server: Server; state: MockState }> {
  MOCK_SELF = `http://127.0.0.1:${port}`;
  const state: MockState = { calls: 0, last: null, siteverifyCalls: 0 };
  const server = createServer(async (req, res) => {
    const body = await readBody(req);
    const send = (status: number, obj: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(obj));
    };

    if (req.url === "/__state") return send(200, state);

    // ── Fake Google OIDC ──
    const u = new URL(req.url ?? "/", "http://mock");
    if (u.pathname === "/__idp/next-sub" && req.method === "POST") {
      nextSub = body.toString("utf8").trim() || null;
      return send(200, { ok: true });
    }
    if (u.pathname === "/o/oauth2/v2/auth") {
      // The test adds &sub=… (or sets /__idp/next-sub) to choose the account; "deny" simulates a cancel.
      const p = u.searchParams;
      if (!p.get("sub") && nextSub) {
        p.set("sub", nextSub);
        nextSub = null;
      }
      const redirect = new URL(p.get("redirect_uri")!);
      if (p.get("sub") === "deny") {
        redirect.searchParams.set("error", "access_denied");
      } else {
        const code = `code_${Math.random().toString(36).slice(2)}`;
        codes.set(code, { sub: p.get("sub") ?? "user-a", nonce: p.get("nonce") ?? "", challenge: p.get("code_challenge") ?? "", redirectUri: p.get("redirect_uri")!, clientId: p.get("client_id")! });
        redirect.searchParams.set("code", code);
      }
      redirect.searchParams.set("state", p.get("state") ?? "");
      res.writeHead(302, { location: redirect.toString() });
      return res.end();
    }
    // ── Fake ZainCash Payment Gateway v2 ──
    if (u.pathname === "/zc/oauth2/token" && req.method === "POST") {
      const f = new URLSearchParams(body.toString("utf8"));
      if (f.get("client_id") !== "zc-client" || f.get("client_secret") !== "zc-secret" || f.get("grant_type") !== "client_credentials") return send(401, { error: "invalid_client" });
      return send(200, { access_token: "zc-access", expires_in: 300, token_type: "Bearer" });
    }
    if (u.pathname.startsWith("/zc/api/") && req.headers.authorization !== "Bearer zc-access") return send(401, { error: "unauthorized" });
    if (u.pathname === "/zc/api/v2/payment-gateway/transaction/init" && req.method === "POST") {
      const j = JSON.parse(body.toString("utf8"));
      if (j.currency !== "IQD" || !Number.isInteger(j.amount) || j.amount <= 0) return send(400, { error: "bad amount" });
      const id = `zc_${Math.random().toString(36).slice(2, 12)}`;
      zcTx.set(id, { amount: j.amount, ref: j.externalReferenceId, successUrl: j.successUrl, failureUrl: j.failureUrl, status: "PENDING" });
      return send(200, { data: { transactionId: id, redirectUrl: `${MOCK_SELF}/zc/pay/${id}` } });
    }
    const inq = u.pathname.match(/^\/zc\/api\/v2\/payment-gateway\/transaction\/inquiry\/(.+)$/);
    if (inq) {
      const t = zcTx.get(decodeURIComponent(inq[1]!));
      if (!t) return send(404, { error: "not found" });
      return send(200, { data: { transactionId: inq[1], currentStatus: t.status, amount: t.paidAmount ?? t.amount } });
    }
    const pay = u.pathname.match(/^\/zc\/pay\/(.+)$/);
    if (pay) {
      // The customer pays (or fails) on the gateway page; ?amount= simulates a tampered amount.
      const t = zcTx.get(pay[1]!)!;
      const ok = u.searchParams.get("result") !== "fail";
      t.status = ok ? "SUCCESS" : "FAILED";
      if (u.searchParams.get("amount")) t.paidAmount = Number(u.searchParams.get("amount"));
      const back = new URL(ok ? t.successUrl : t.failureUrl);
      back.searchParams.set("token", `${b64url(JSON.stringify({ alg: "HS256" }))}.${b64url(JSON.stringify({ data: { externalReferenceId: t.ref, currentStatus: t.status } }))}.sig`);
      res.writeHead(302, { location: back.toString() });
      return res.end();
    }

    if (u.pathname === "/token" && req.method === "POST") {
      const f = new URLSearchParams(body.toString("utf8"));
      const entry = codes.get(f.get("code") ?? "");
      codes.delete(f.get("code") ?? "");
      if (!entry || f.get("client_secret") !== "test-google-secret" || f.get("redirect_uri") !== entry.redirectUri) return send(400, { error: "invalid_grant" });
      const challenge = b64url(createHash("sha256").update(f.get("code_verifier") ?? "").digest());
      if (challenge !== entry.challenge) return send(400, { error: "invalid_grant", error_description: "PKCE" });
      const now = Math.floor(Date.now() / 1000);
      const claims: Record<string, unknown> = { iss: "https://accounts.google.com", aud: entry.clientId, sub: entry.sub, iat: now, exp: now + 3600, nonce: entry.nonce };
      if (entry.sub === "wrong-aud") claims.aud = "someone-else";
      if (entry.sub === "wrong-nonce") claims.nonce = "not-the-nonce";
      if (entry.sub === "expired") claims.exp = now - 3600;
      if (entry.sub === "wrong-iss") claims.iss = "https://evil.example";
      const idToken = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(JSON.stringify(claims))}.sig`;
      return send(200, { access_token: "at", id_token: idToken, expires_in: 3600, token_type: "Bearer" });
    }

    if (req.url === "/siteverify") {
      state.siteverifyCalls++;
      const form = await new Request("http://x", { method: "POST", headers: { "content-type": String(req.headers["content-type"]) }, body: new Uint8Array(body) }).formData();
      const token = String(form.get("response") ?? "");
      if (token === "bad") return send(200, { success: false, "error-codes": ["invalid-input-response"] });
      if (token === "wronghost") return send(200, { success: true, hostname: "evil.example", action: "check" });
      if (token === "wrongaction") return send(200, { success: true, hostname: "127.0.0.1", action: "login" });
      return send(200, { success: true, hostname: "127.0.0.1", action: "check" });
    }

    if (req.url === "/v1/messages" && req.method === "POST") {
      state.calls++;
      const payload = JSON.parse(body.toString("utf8"));
      state.last = payload;
      const userBlocks = payload.messages?.[0]?.content ?? [];
      const text: string = userBlocks.filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("\n");
      const isRepair = text.includes("A previous attempt was rejected");
      const slow = text.match(/\[\[MOCK:slow:(\d+)\]\]/);
      if (slow) await sleep(Number(slow[1]));

      const v2 = payload.tools?.[0]?.name === "submit_ad_review_v2";
      let input: unknown = v2 ? goodReportV2() : goodReport();
      if (text.includes("[[MOCK:500]]")) return send(500, { type: "error", error: { type: "api_error", message: "upstream boom" } });
      if (text.includes("[[MOCK:credit]]")) {
        return send(400, { type: "error", error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API." } });
      }
      if (text.includes("[[MOCK:timeout]]")) {
        await sleep(30_000);
        return send(500, {});
      }
      if (text.includes("[[MOCK:invalid]]") || (text.includes("[[MOCK:invalid_then_ok]]") && !isRepair)) input = { summary: "ناقص" };
      if (text.includes("[[MOCK:invent]]")) {
        input = goodReport({
          improvedCopy: {
            opening: "كنبة مخمل تريّح جلستك.",
            body: "السعر 25000 دينار فقط. خصم 20% لفترة محدودة. متوفرة بأكثر من لون.",
            headline: "كنبة مخمل بألوان متعددة",
            callToAction: "راسلنا الآن",
          },
        });
      }
      if (text.includes("[[MOCK:leak]]")) input = goodReport({ summary: "سأستدعي submit_ad_review الآن" });
      return send(200, {
        id: `msg_${state.calls}`,
        type: "message",
        role: "assistant",
        model: payload.model,
        content: [{ type: "tool_use", id: `toolu_${state.calls}`, name: v2 ? "submit_ad_review_v2" : "submit_ad_review", input }],
        stop_reason: "tool_use",
        stop_sequence: null,
        usage: { input_tokens: 1500, output_tokens: 900 },
      });
    }
    send(404, { error: "not found" });
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve({ server, state })));
}
