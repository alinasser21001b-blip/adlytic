import type { AssessmentStatus, PublicShareView } from "../../shared/schemas";

const AXIS_LABELS: Record<keyof PublicShareView["axes"], string> = {
  hook: "الافتتاحية",
  messageClarity: "وضوح الرسالة",
  visualReadability: "وضوح الصورة",
  callToAction: "طريقة الطلب",
};

const STATUS: Record<AssessmentStatus, { label: string; cls: string }> = {
  strong: { label: "واضح", cls: "ok" },
  needs_improvement: { label: "يحتاج تحسيناً", cls: "fix" },
  not_assessed: { label: "لم يُقيّم", cls: "na" },
};

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}

export const SHARE_HEADERS: Record<string, string> = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy":
    "default-src 'none'; style-src 'unsafe-inline'; font-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
};

function shell(title: string, body: string): string {
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)}</title>
<meta property="og:title" content="راجعنا وضوح هذا الإعلان قبل الترويج">
<meta property="og:description" content="ملخص عام من Adlytic Check — افحص إعلانك قبل ما تروّجه.">
<style>
@font-face{font-family:"Plex Arabic";src:url(/fonts/ibm-plex-sans-arabic-arabic-400-normal.woff2) format("woff2");font-weight:400;font-display:swap}
@font-face{font-family:"Plex Arabic";src:url(/fonts/ibm-plex-sans-arabic-arabic-700-normal.woff2) format("woff2");font-weight:700;font-display:swap}
:root{--bg:#f6f3ee;--card:#fff;--ink:#1d2421;--muted:#55605b;--accent:#0b6b52;--line:#e4ded4;--fix:#9a4a06;--fixbg:#fdf0e1;--okbg:#e3f3ec;--nabg:#eeeeea}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:400 17px/1.7 "Plex Arabic",system-ui,sans-serif}
main{max-width:560px;margin:0 auto;padding:28px 16px 48px}
.brand{font-weight:700;color:var(--accent);letter-spacing:.2px}
h1{font-size:24px;line-height:1.4;margin:10px 0 6px}p{margin:0 0 14px;color:var(--muted)}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px;margin:18px 0}
ul{list-style:none;margin:0;padding:0}li.axis{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--line)}li.axis:last-child{border-bottom:0}
.chip{font-size:14px;font-weight:700;border-radius:999px;padding:3px 12px;white-space:nowrap}.ok{background:var(--okbg);color:var(--accent)}.fix{background:var(--fixbg);color:var(--fix)}.na{background:var(--nabg);color:var(--muted)}
ol{margin:0;padding-inline-start:20px}ol li{margin:6px 0}
a.cta{display:block;text-align:center;background:var(--accent);color:#fff;text-decoration:none;font-weight:700;border-radius:12px;padding:14px;margin-top:22px}
a.cta:focus-visible{outline:3px solid var(--ink);outline-offset:3px}
small{display:block;color:var(--muted);font-size:14px;margin-top:14px}
</style>
</head>
<body><main>${body}</main></body>
</html>`;
}

export function renderSharePage(v: PublicShareView): string {
  const date = new Date(v.createdAt).toLocaleDateString("ar-u-nu-latn", { year: "numeric", month: "long", day: "numeric" });
  const axes = (Object.keys(AXIS_LABELS) as Array<keyof PublicShareView["axes"]>)
    .map((k) => {
      const s = STATUS[v.axes[k]];
      return `<li class="axis"><span>${AXIS_LABELS[k]}</span><span class="chip ${s.cls}">${s.label}</span></li>`;
    })
    .join("");
  const tips = v.tips.length
    ? `<section class="card"><h2 style="font-size:18px;margin:0 0 8px">نصائح عامة من المراجعة</h2><ol>${v.tips.map((t) => `<li>${esc(t)}</li>`).join("")}</ol></section>`
    : "";
  return shell(
    "ملخص مراجعة إعلان — Adlytic Check",
    `<div class="brand">Adlytic Check</div>
<h1>راجعنا وضوح هذا الإعلان قبل الترويج</h1>
<p>ملخص عام شاركه صاحب الإعلان بتاريخ ${esc(date)}. لا يتضمن صورة الإعلان ولا نصه.</p>
<section class="card" aria-label="نتيجة المحاور"><ul>${axes}</ul></section>
${tips}
<a class="cta" href="/">افحص إعلانك مجاناً</a>
<small>المراجعة تقيّم وضوح المحتوى فقط، ولا تتنبأ بعدد الطلبات أو المبيعات.</small>`,
  );
}

export function renderShareNotFound(): string {
  return shell(
    "الرابط غير متاح — Adlytic Check",
    `<div class="brand">Adlytic Check</div>
<h1>هذا الرابط غير متاح</h1>
<p>ربما ألغاه صاحبه أو انتهت صلاحية التقرير.</p>
<a class="cta" href="/">افحص إعلانك مجاناً</a>`,
  );
}
