import { useState } from "react";
import type { AnalysisReportV2, DimensionResult, EvidenceItem } from "../../../shared/schemas";
import { t } from "../../i18n/ar";
import { api } from "./api";
import { fmtDate } from "./CheckForm";
import { copyText, SharePanel } from "./ResultView";

interface Props {
  report: AnalysisReportV2;
  previewUrl: string | null;
  shareActive: boolean;
  onNewCheck: () => void;
  onDeleted: () => void;
}

const STATUS_AR: Record<DimensionResult["status"], string> = {
  strong: "واضح",
  needs_improvement: "يحتاج تحسيناً",
  unknown: "لم نتمكن من الحكم",
  not_applicable: "لا ينطبق",
};

const SOURCE_AR: Record<EvidenceItem["source"], string> = {
  user_supplied: "من نصك",
  visible_text: "نص في الصورة",
  visual_observation: "ملاحظة من الصورة",
  audio_transcript: "من الصوت",
  measured_metadata: "قياس",
};

const EVIDENCE_TYPE_AR: Record<string, string> = {
  official_guidance: "إرشاد رسمي",
  vendor_experiment: "بحث من منصة إعلانية",
  observational_study: "دراسة رصدية",
  peer_reviewed_experiment: "دراسة محكّمة",
  engineering_description: "وصف تقني",
  product_hypothesis: "فرضية من فريقنا",
};

const STRENGTH_AR = { strong: "قوي", moderate: "متوسط", weak: "ضعيف", hypothesis: "فرضية" } as const;
const JUDGE_AR = { detectable: "يُرى مباشرة", inference: "استنتاج", not_judgeable: "لا يُحكم عليه من المحتوى" } as const;

export function ReportV2({ report: r, previewUrl, shareActive, onNewCheck, onDeleted }: Props) {
  const evidence = new Map(r.evidence.map((e) => [e.id, e]));
  const top = r.fixes[0];
  const copy = r.improvedCopy;
  const improvedText = `${copy.opening}\n\n${copy.body}\n\n${copy.callToAction}`;

  async function onDelete() {
    if (!window.confirm(t.deleteConfirm)) return;
    await api.deleteReport(r.id).catch(() => {});
    onDeleted();
  }

  return (
    <article className="result v2" aria-labelledby="result-title">
      {/* 1. Summary */}
      <header className="result-head reveal">
        <h2 id="result-title" className="eyebrow" tabIndex={-1}>
          {t.reportTitle}
        </h2>
        <p className="perceived-label">{t.perceived}</p>
        <p className="perceived">{r.perceivedMessage}</p>
        <p className="summary">{r.summary}</p>
        {r.mode === "text_only" && <p className="badge na">{t.modeTextOnly}</p>}
      </header>

      {/* 2. The one fix that matters most */}
      <section className={`card lens first-fix reveal${top ? "" : " calm"}`} aria-labelledby="first-fix">
        <h3 id="first-fix">{t.firstFix}</h3>
        {top ? (
          <>
            <p className="fix-change">{top.change}</p>
            <p className="fix-why">{top.why}</p>
            <EvidenceChips ids={top.evidenceIds} evidence={evidence} />
          </>
        ) : (
          <p>{t.noMajorIssue}</p>
        )}
      </section>

      {/* 3. At most three steps */}
      <section className="card reveal" aria-labelledby="steps">
        <h3 id="steps" className="section-title">
          {t.stepsTitle}
        </h3>
        <ol className="steps">
          {r.actionSteps.slice(0, 3).map((s, n) => (
            <li key={n}>{s}</li>
          ))}
        </ol>
      </section>

      {/* 4. Index — only when the flag allows it */}
      {r.index.shown && r.index.value !== null && <IndexMeter value={r.index.value} measured={r.index.measured} applicable={r.index.applicable} />}

      {/* 5. Before / after copy */}
      <section className="card reveal" aria-labelledby="copy-title">
        <h3 id="copy-title" className="section-title">
          {t.improvedTitle}
        </h3>
        <div className="before-after">
          {r.originalCopy && (
            <div className="ba before">
              <span className="ba-label">نصك الحالي</span>
              <p>{r.originalCopy}</p>
            </div>
          )}
          <div className="ba after">
            <span className="ba-label">المقترح</span>
            {previewUrl && <img src={previewUrl} alt="صورة إعلانك" className="ba-img" />}
            <p className="post-opening">{copy.opening}</p>
            <p>{copy.body}</p>
            <p className="post-cta">{copy.callToAction}</p>
            <CopyButton text={improvedText} label={t.copyImproved} reportId={r.id} />
          </div>
        </div>
        {(r.alternateOpenings.length > 0 || r.alternateCallsToAction.length > 0) && (
          <div className="alternates">
            <h4>بدائل لتجربتها في اختبار A/B من مدير الإعلانات</h4>
            <ul>
              {[...r.alternateOpenings, ...r.alternateCallsToAction].map((a, n) => (
                <li key={n}>
                  <span>{a}</span>
                  <CopyButton text={a} label="انسخ" small reportId={r.id} />
                </li>
              ))}
            </ul>
          </div>
        )}
        {r.missingInformation.length > 0 && (
          <div className="facts">
            <h4>{t.missingTitle}</h4>
            <ul>
              {r.missingInformation.map((m, n) => (
                <li key={n}>{m}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* 6. Video timeline: what was seen and heard, by time — samples, not every frame */}
      {r.media.kind === "video" && (
        <section className="card reveal" aria-labelledby="timeline-title">
          <h3 id="timeline-title" className="section-title">
            ما رأيناه وسمعناه في الفيديو
          </h3>
          {r.coverageAr && <p className="meta coverage">{r.coverageAr}</p>}
          {r.timeline && r.timeline.length > 0 ? (
            <ol className="timeline">
              {r.timeline.map((e, n) => (
                <li key={n}>
                  <span className="tl-time">
                    <bdi>{e.timeSec.toFixed(1)}</bdi> ث
                  </span>
                  <span className="ev-src">{SOURCE_AR[e.source]}</span>
                  <bdi className="tl-text">{e.text}</bdi>
                </li>
              ))}
            </ol>
          ) : (
            <p className="meta">لم نسجّل ملاحظات مرتبطة بوقت محدد.</p>
          )}
        </section>
      )}

      {/* 7. Why */}
      {r.fixes.length > 0 && (
        <section className="card reveal" aria-labelledby="why-title">
          <h3 id="why-title" className="section-title">
            لماذا هذه التعديلات
          </h3>
          <ol className="whys">
            {r.fixes.map((f, n) => (
              <li key={n}>
                <span className="chip">{f.labelAr}</span>
                <p className="obs">{f.change}</p>
                <p className="meta">{f.why}</p>
                <EvidenceChips ids={f.evidenceIds} evidence={evidence} />
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* 8. What we checked, with the evidence and the sources behind it */}
      <section className="card reveal" aria-labelledby="checked-title">
        <h3 id="checked-title" className="section-title">
          ماذا فحصنا
        </h3>
        <ul className="axes">
          {r.dimensions.map((d) => (
            <li key={d.dimension} className="axis">
              <div className="axis-head">
                <span className="axis-label">{d.labelAr}</span>
                <span className={`chip ${d.status === "strong" ? "ok" : d.status === "needs_improvement" ? "fix" : "na"}`}>{STATUS_AR[d.status]}</span>
              </div>
              <p>{d.observation}</p>
              <EvidenceChips ids={d.evidenceIds} evidence={evidence} />
            </li>
          ))}
        </ul>
        {r.imageTextLegibility !== "no_image" && <p className="meta">{t.legibility[r.imageTextLegibility]}</p>}
        <details className="more">
          <summary>القواعد والمصادر ({r.checkedRules.length} قاعدة، {r.citations.length} مصدراً)</summary>
          <ul className="rules">
            {r.checkedRules.map((rule) => (
              <li key={rule.ruleId}>
                <p>{rule.principleAr}</p>
                <p className="meta">
                  <bdi>{rule.ruleId}</bdi> · {JUDGE_AR[rule.judgeability]} · قوة الدليل: {STRENGTH_AR[rule.evidenceStrength]}
                </p>
              </li>
            ))}
          </ul>
          <ul className="sources">
            {r.citations.map((c) => (
              <li key={c.sourceId}>
                {c.url ? (
                  <a href={c.url} target="_blank" rel="noopener noreferrer" dir="auto">
                    {c.title}
                  </a>
                ) : (
                  <span>{c.title}</span>
                )}
                <span className="meta">
                  {" "}
                  — {c.publisher} · {EVIDENCE_TYPE_AR[c.evidenceType] ?? c.evidenceType}
                  {c.access === "search_excerpt" ? " · قُرئ ملخصه فقط" : ""}
                  {c.secondaryOnly ? " · عبر مصدر ثانوي" : ""}
                  {c.publishedAt ? ` · ${c.publishedAt}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </details>
      </section>

      {/* 9. Share / history / delete */}
      <SharePanel reportId={r.id} initiallyActive={shareActive} />
      <div className="row-actions">
        <button type="button" className="btn primary" onClick={onNewCheck}>
          {t.newCheck}
        </button>
        <button type="button" className="btn ghost danger" onClick={() => void onDelete()}>
          {t.deleteReport}
        </button>
      </div>

      <footer className="limits" aria-labelledby="limits">
        <h3 id="limits">{t.limitsTitle}</h3>
        <ul>
          {r.limitations.map((l, n) => (
            <li key={n}>{l}</li>
          ))}
        </ul>
        <p className="meta">
          {t.savedUntil(fmtDate(r.expiresAt))} · <bdi>{r.versions.rubricVersion}</bdi> / <bdi>{r.versions.knowledgeVersion}</bdi>
        </p>
      </footer>
    </article>
  );
}

function EvidenceChips({ ids, evidence }: { ids: string[]; evidence: Map<string, EvidenceItem> }) {
  const items = ids.map((id) => evidence.get(id)).filter((e): e is EvidenceItem => Boolean(e));
  if (!items.length) return null;
  return (
    <ul className="evidence" aria-label="الدليل">
      {items.map((e) => (
        <li key={e.id}>
          <span className="ev-src">{SOURCE_AR[e.source]}</span> <bdi>{e.text}</bdi>
        </li>
      ))}
    </ul>
  );
}

function CopyButton({ text, label, small, reportId }: { text: string; label: string; small?: boolean; reportId: string }) {
  const [state, setState] = useState<"idle" | "ok" | "fail">("idle");
  return (
    <>
      <button
        type="button"
        className={`btn ${small ? "ghost small" : "primary"}`}
        onClick={async () => {
          const ok = await copyText(text);
          setState(ok ? "ok" : "fail");
          if (ok) api.event("copy_clicked", reportId);
          setTimeout(() => setState("idle"), 2500);
        }}
      >
        {state === "ok" ? t.copied : label}
      </button>
      {state === "fail" && (
        <span className="status" role="status">
          {t.copyFailed}
        </span>
      )}
    </>
  );
}

/** The liquid meter: a droplet filled to the index, with what was actually measured. */
function IndexMeter({ value, measured, applicable }: { value: number; measured: number; applicable: number }) {
  const level = 100 - value;
  return (
    <section className="card index reveal" aria-labelledby="index-title">
      <svg className="droplet" viewBox="0 0 100 120" role="img" aria-label={`مؤشر وضوح وجودة المحتوى ${value} من 100`}>
        <defs>
          <clipPath id="drop-clip">
            <path d="M50 4 C50 4 12 52 12 76 a38 38 0 0 0 76 0 C88 52 50 4 50 4z" />
          </clipPath>
        </defs>
        <path d="M50 4 C50 4 12 52 12 76 a38 38 0 0 0 76 0 C88 52 50 4 50 4z" className="drop-shell" />
        <g clipPath="url(#drop-clip)">
          <path className="drop-wave" d={`M-40 ${10 + level} q15 -6 30 0 t30 0 t30 0 t30 0 t30 0 t30 0 V130 H-40 Z`} />
        </g>
        <text x="50" y="84" textAnchor="middle" className="drop-value">
          {value}
        </text>
      </svg>
      <div>
        <h3 id="index-title">مؤشر وضوح وجودة المحتوى</h3>
        <p className="meta">
          محسوب من {measured} من {applicable} جوانب أمكن قياسها. يقيس وضوح المحتوى فقط، ولا يتنبأ بالمبيعات أو بأداء الإعلان.
        </p>
      </div>
    </section>
  );
}
