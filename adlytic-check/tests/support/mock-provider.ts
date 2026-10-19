/**
 * Out-of-process test double for the Anthropic Messages API and Turnstile
 * siteverify. Production code has no mock branch: tests point the Worker's
 * PROVIDER_BASE_URL / TURNSTILE_VERIFY_URL (honoured only outside production)
 * at this server. Behaviour is selected by a marker inside the ad text.
 */
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

export function startMock(port: number): Promise<{ server: Server; state: MockState }> {
  const state: MockState = { calls: 0, last: null, siteverifyCalls: 0 };
  const server = createServer(async (req, res) => {
    const body = await readBody(req);
    const send = (status: number, obj: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(obj));
    };

    if (req.url === "/__state") return send(200, state);

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

      let input: unknown = goodReport();
      if (text.includes("[[MOCK:500]]")) return send(500, { type: "error", error: { type: "api_error", message: "upstream boom" } });
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
        content: [{ type: "tool_use", id: `toolu_${state.calls}`, name: "submit_ad_review", input }],
        stop_reason: "tool_use",
        stop_sequence: null,
        usage: { input_tokens: 1500, output_tokens: 900 },
      });
    }
    send(404, { error: "not found" });
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve({ server, state })));
}
