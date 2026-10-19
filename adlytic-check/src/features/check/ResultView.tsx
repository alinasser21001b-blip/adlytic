import { useState } from "react";
import type { AnalysisReport, AssessmentItem } from "../../../shared/schemas";
import { t } from "../../i18n/ar";
import { api, ApiFailure } from "./api";
import { fmtDate } from "./CheckForm";

interface Props {
  report: AnalysisReport;
  previewUrl: string | null;
  shareActive: boolean;
  onNewCheck: () => void;
  onDeleted: () => void;
}

const AXES = ["hook", "messageClarity", "visualReadability", "callToAction"] as const;

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

export function ResultView({ report: r, previewUrl, shareActive, onNewCheck, onDeleted }: Props) {
  const [copyState, setCopyState] = useState<"idle" | "ok" | "fail">("idle");
  const copy = r.improvedCopy;
  const fullCopy = `${copy.opening}\n\n${copy.body}\n\n${copy.headline}\n${copy.callToAction}`;

  async function onCopy() {
    const ok = await copyText(fullCopy);
    setCopyState(ok ? "ok" : "fail");
    if (ok) api.event("copy_clicked", r.id);
    setTimeout(() => setCopyState("idle"), 2500);
  }

  async function onDelete() {
    if (!window.confirm(t.deleteConfirm)) return;
    try {
      await api.deleteReport(r.id);
      onDeleted();
    } catch {
      onDeleted();
    }
  }

  return (
    <article className="result" aria-labelledby="result-title">
      <header className="result-head">
        <h2 id="result-title" className="eyebrow">
          {t.reportTitle}
        </h2>
        <p className="perceived-label">{t.perceived}</p>
        <p className="perceived">{r.perceivedMessage}</p>
        <p className="summary">{r.summary}</p>
        {r.mode === "text_only" && <p className="badge na">{t.modeTextOnly}</p>}
      </header>

      <section className={`card first-fix${r.primaryIssue ? "" : " calm"}`} aria-labelledby="first-fix">
        <h3 id="first-fix">{t.firstFix}</h3>
        <p>{r.primaryIssue ?? t.noMajorIssue}</p>
      </section>

      <div className="result-grid">
        <div className="col-main">
          {r.issues.length > 0 && (
            <section aria-labelledby="issues">
              <h3 id="issues" className="section-title">
                {t.issuesTitle}
              </h3>
              <ol className="issues">
                {r.issues.map((i, n) => (
                  <li key={n} className="card issue">
                    <div className="chips">
                      <span className={`chip p-${i.priority}`}>{t.priority[i.priority]}</span>
                      <span className="chip src">{t.evidence[i.evidenceSource]}</span>
                    </div>
                    <p className="obs">{i.observation}</p>
                    <p>
                      <strong>{t.why}: </strong>
                      {i.whyItMatters}
                    </p>
                    <p>
                      <strong>{t.change}: </strong>
                      {i.recommendedChange}
                    </p>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section aria-labelledby="axes" className="card">
            <h3 id="axes" className="section-title">
              {t.axesTitle}
            </h3>
            <ul className="axes">
              {AXES.map((k) => (
                <Axis key={k} label={t.axes[k]} item={r.assessments[k]} />
              ))}
            </ul>
            <p className="meta">
              {t.confidence[r.confidence]} — {t.confidenceNote}
              {r.imageTextLegibility !== "no_image" ? ` ${t.legibility[r.imageTextLegibility]}` : ""}
            </p>
          </section>

          <section aria-labelledby="steps" className="card">
            <h3 id="steps" className="section-title">
              {t.stepsTitle}
            </h3>
            <ol className="steps">
              {r.actionItems.map((a, n) => (
                <li key={n}>{a}</li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="col-side" aria-labelledby="improved">
          <section className="card improved">
            <h3 id="improved" className="section-title">
              {t.improvedTitle}
            </h3>
            <figure className="post" aria-label={t.previewLabel}>
              <figcaption className="post-cap">{t.previewLabel}</figcaption>
              {previewUrl ? <img src={previewUrl} alt="صورة إعلانك" /> : <div className="post-noimg">{t.previewNoImage}</div>}
              <div className="post-body">
                <p className="post-opening">{copy.opening}</p>
                <p className="post-text">{copy.body}</p>
              </div>
              <div className="post-strip">
                <span className="post-headline">{copy.headline}</span>
                <span className="post-cta">{copy.callToAction}</span>
              </div>
            </figure>
            <button type="button" className="btn primary block" onClick={() => void onCopy()}>
              {copyState === "ok" ? t.copied : t.copyImproved}
            </button>
            <p className="status" role="status" aria-live="polite">
              {copyState === "fail" ? t.copyFailed : copyState === "ok" ? t.copied : ""}
            </p>
            {r.factsReadFromImage.length > 0 && (
              <div className="facts">
                <h4>{t.factsRead}</h4>
                <ul>
                  {r.factsReadFromImage.map((f, n) => (
                    <li key={n}>
                      <bdi>{f}</bdi>
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

          <SharePanel reportId={r.id} initiallyActive={shareActive} />

          <div className="row-actions stack">
            <button type="button" className="btn secondary block" onClick={onNewCheck}>
              {t.newCheck}
            </button>
            <button type="button" className="btn ghost block danger" onClick={() => void onDelete()}>
              {t.deleteReport}
            </button>
          </div>
        </aside>
      </div>

      <footer className="limits" aria-labelledby="limits">
        <h3 id="limits">{t.limitsTitle}</h3>
        <ul>
          {r.limitations.map((l, n) => (
            <li key={n}>{l}</li>
          ))}
        </ul>
        <p className="meta">{t.savedUntil(fmtDate(r.expiresAt))}</p>
      </footer>
    </article>
  );
}

function Axis({ label, item }: { label: string; item: AssessmentItem }) {
  const cls = item.status === "strong" ? "ok" : item.status === "needs_improvement" ? "fix" : "na";
  return (
    <li className="axis">
      <div className="axis-head">
        <span className="axis-label">{label}</span>
        <span className={`chip ${cls}`}>{t.status[item.status]}</span>
      </div>
      <p>{item.observation}</p>
      {item.improvement && item.status === "needs_improvement" && <p className="axis-fix">{item.improvement}</p>}
    </li>
  );
}

export function SharePanel({ reportId, initiallyActive }: { reportId: string; initiallyActive: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [active, setActive] = useState(initiallyActive);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    setMsg("");
    try {
      const info = await api.createShare(reportId);
      setUrl(info.url);
      setActive(true);
    } catch (e) {
      setMsg(e instanceof ApiFailure ? e.message : "تعذّر إنشاء الرابط.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    setBusy(true);
    try {
      await api.revokeShare(reportId);
      setUrl(null);
      setActive(false);
      setMsg(t.shareRevoked);
    } catch (e) {
      setMsg(e instanceof ApiFailure ? e.message : "تعذّر إلغاء الرابط.");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!url) return;
    const ok = await copyText(url);
    setMsg(ok ? t.copied : t.copyFailed);
    if (ok) api.event("share_link_copied", reportId);
  }

  async function nativeShare() {
    if (!url) return;
    try {
      await navigator.share({ title: "Adlytic Check", text: t.shareText, url });
    } catch {
      /* the user closed the sheet */
    }
  }

  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  return (
    <section className="card share" aria-labelledby="share-title">
      <h3 id="share-title" className="section-title">
        {t.shareTitle}
      </h3>
      <p className="meta">{t.shareExplain}</p>
      {url ? (
        <>
          <label className="label" htmlFor="share-url">
            {t.shareActive}
          </label>
          <input id="share-url" className="share-url" type="url" readOnly value={url} dir="ltr" onFocus={(e) => e.currentTarget.select()} />
          <div className="row-actions">
            <button type="button" className="btn secondary small" onClick={() => void copyLink()} disabled={busy}>
              {t.shareCopy}
            </button>
            {canNativeShare && (
              <button type="button" className="btn secondary small" onClick={() => void nativeShare()} disabled={busy}>
                {t.shareNative}
              </button>
            )}
            <a className="btn secondary small" href={`https://wa.me/?text=${encodeURIComponent(`${t.shareText} ${url}`)}`} target="_blank" rel="noopener noreferrer">
              {t.shareWhatsapp}
            </a>
            <button type="button" className="btn ghost small danger" onClick={() => void revoke()} disabled={busy}>
              {t.shareRevoke}
            </button>
          </div>
        </>
      ) : (
        <div className="row-actions">
          <button type="button" className="btn secondary small" onClick={() => void create()} disabled={busy}>
            {active ? t.shareRotate : t.shareCreate}
          </button>
          {active && (
            <button type="button" className="btn ghost small danger" onClick={() => void revoke()} disabled={busy}>
              {t.shareRevoke}
            </button>
          )}
        </div>
      )}
      <p className="status" role="status" aria-live="polite">
        {msg}
      </p>
    </section>
  );
}
