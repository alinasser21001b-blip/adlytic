import { useEffect, useId, useRef, useState, type DragEvent } from "react";
import { GOALS, INDUSTRIES, LIMITS, type Goal, type Industry } from "../../../shared/constants";
import type { AnalysisReport, SessionInfo } from "../../../shared/schemas";
import { t } from "../../i18n/ar";
import { ApiFailure, newIdempotencyKey, submitCheck, type CheckPhase } from "./api";
import { ImageRejected, prepareImage } from "./image";
import { Turnstile, type TurnstileHandle } from "./Turnstile";

interface Props {
  session: SessionInfo;
  onDone: (report: AnalysisReport, previewUrl: string | null) => void;
  onQuotaChanged: () => void;
}

interface FormError {
  message: string;
  retryable: boolean;
  offerTextOnly: boolean;
}

export function CheckForm({ session, onDone, onQuotaChanged }: Props) {
  const ids = { copy: useId(), copyHint: useId(), industry: useId(), audience: useId(), context: useId(), image: useId(), imageHint: useId() };
  const [image, setImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [adCopy, setAdCopy] = useState("");
  const [industry, setIndustry] = useState<Industry | "">("");
  const [goal, setGoal] = useState<Goal>("messages");
  const [audience, setAudience] = useState("");
  const [context, setContext] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [turnstileBroken, setTurnstileBroken] = useState(false);
  const [phase, setPhase] = useState<CheckPhase | null>(null);
  const [error, setError] = useState<FormError | null>(null);
  const keyRef = useRef<string | null>(null);
  const turnstile = useRef<TurnstileHandle>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Any change to what is being sent invalidates the in-flight idempotency key.
  useEffect(() => {
    keyRef.current = null;
  }, [image, adCopy, industry, goal, audience, context]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  async function acceptFile(file: File | undefined) {
    setImageError(null);
    setError(null);
    if (!file) return;
    setPreparing(true);
    try {
      const prepared = await prepareImage(file);
      setImage(prepared);
      setPreviewUrl(URL.createObjectURL(prepared));
    } catch (e) {
      clearImage();
      setImageError(e instanceof ImageRejected ? e.message : t.imageUnreadable);
    } finally {
      setPreparing(false);
    }
  }

  function clearImage() {
    setImage(null);
    setPreviewUrl(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragOver(false);
    void acceptFile(e.dataTransfer.files?.[0]);
  }

  async function submit(opts: { textOnly?: boolean } = {}) {
    setError(null);
    const sendImage = opts.textOnly ? null : image;
    if (!sendImage && !adCopy.trim()) {
      setError({ message: t.needInput, retryable: false, offerTextOnly: false });
      return;
    }
    if (!industry) {
      setError({ message: "اختر مجال عملك.", retryable: false, offerTextOnly: false });
      return;
    }
    if (!token) {
      setError({ message: turnstileBroken ? t.verifyFailed : t.verifying, retryable: false, offerTextOnly: false });
      return;
    }
    if (opts.textOnly) {
      clearImage();
      keyRef.current = null;
    }
    keyRef.current ??= newIdempotencyKey();

    const fd = new FormData();
    if (sendImage) fd.append("image", sendImage, "ad.jpg");
    fd.append("adCopy", adCopy.trim());
    fd.append("industry", industry);
    fd.append("goal", goal);
    fd.append("audience", audience.trim());
    fd.append("additionalContext", context.trim());
    fd.append("idempotencyKey", keyRef.current);
    fd.append("turnstileToken", token);

    try {
      const report = await submitCheck(fd, setPhase);
      keyRef.current = null;
      onDone(report, sendImage ? previewUrl : null);
    } catch (e) {
      const f = e instanceof ApiFailure ? e : new ApiFailure(0, "NETWORK", "", true);
      const lostInTransit = f.code === "NETWORK" || f.code === "TIMEOUT";
      // Keep the key only when we never learned the outcome: the replay is then idempotent.
      if (!lostInTransit && f.code !== "REQUEST_IN_PROGRESS") keyRef.current = null;
      const message = f.code === "NETWORK" ? t.networkError : f.code === "TIMEOUT" ? t.timeoutError : f.message;
      setError({
        message,
        retryable: lostInTransit || f.retryable || f.code === "VERIFICATION_FAILED" || f.code === "REQUEST_IN_PROGRESS",
        offerTextOnly: Boolean(sendImage) && Boolean(adCopy.trim()) && f.code === "ANALYSIS_UNAVAILABLE",
      });
      onQuotaChanged();
    } finally {
      setPhase(null);
      turnstile.current?.reset();
    }
  }

  const busy = phase !== null || preparing;
  const quota = session.quota;
  const noQuota = quota.remaining <= 0;
  const disabled = busy || !session.analysisAvailable || noQuota;

  return (
    <form
      ref={formRef}
      className="card form"
      id="check"
      aria-labelledby="form-title"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <h2 id="form-title">{t.formTitle}</h2>

      <div className="field">
        <span className="label" id={ids.image}>{t.imageLabel}</span>
        {previewUrl ? (
          <div className="preview">
            <img src={previewUrl} alt="معاينة صورة الإعلان المرفوعة" />
            <button type="button" className="btn ghost small" onClick={clearImage} disabled={busy}>
              {t.imageRemove}
            </button>
          </div>
        ) : (
          <label
            className={`dropzone${dragOver ? " over" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
          >
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="visually-hidden"
              aria-labelledby={ids.image}
              aria-describedby={ids.imageHint}
              onChange={(e) => void acceptFile(e.target.files?.[0])}
              disabled={busy}
            />
            <span className="dz-icon" aria-hidden="true">＋</span>
            <span className="dz-cta">{preparing ? t.imagePreparing : t.imagePick}</span>
            <span className="hint" id={ids.imageHint}>{t.imageHint}</span>
          </label>
        )}
        {imageError && (
          <p className="inline-error" role="alert">
            {imageError}
          </p>
        )}
      </div>

      <div className="field">
        <label htmlFor={ids.copy} className="label">
          {t.copyLabel}
        </label>
        <textarea
          id={ids.copy}
          rows={5}
          maxLength={LIMITS.adCopy}
          value={adCopy}
          onChange={(e) => setAdCopy(e.target.value)}
          placeholder={t.copyPlaceholder}
          aria-describedby={ids.copyHint}
          disabled={busy}
        />
        <span className="hint row" id={ids.copyHint}>
          <span>{image ? t.copyHintWithImage : t.copyHintNoImage}</span>
          <bdi className="count">
            {adCopy.length}/{LIMITS.adCopy}
          </bdi>
        </span>
      </div>

      <div className="field">
        <label htmlFor={ids.industry} className="label">
          {t.industryLabel}
        </label>
        <select id={ids.industry} value={industry} onChange={(e) => setIndustry(e.target.value as Industry)} disabled={busy} required>
          <option value="" disabled>
            اختر المجال
          </option>
          {INDUSTRIES.map((i) => (
            <option key={i.value} value={i.value}>
              {i.labelAr}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="field">
        <legend className="label">{t.goalLabel}</legend>
        <div className="segmented">
          {GOALS.map((g) => (
            <label key={g.value} className={goal === g.value ? "on" : ""}>
              <input type="radio" name="goal" value={g.value} checked={goal === g.value} onChange={() => setGoal(g.value)} disabled={busy} />
              {g.labelAr}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="field">
        <label htmlFor={ids.audience} className="label">
          {t.audienceLabel}
        </label>
        <input
          id={ids.audience}
          type="text"
          maxLength={LIMITS.audience}
          value={audience}
          onChange={(e) => setAudience(e.target.value)}
          placeholder={t.audiencePlaceholder}
          disabled={busy}
        />
      </div>

      <details className="more">
        <summary>{t.moreContext}</summary>
        <div className="field">
          <label htmlFor={ids.context} className="label">
            {t.contextLabel}
          </label>
          <textarea
            id={ids.context}
            rows={3}
            maxLength={LIMITS.additionalContext}
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder={t.contextPlaceholder}
            disabled={busy}
          />
        </div>
      </details>

      {session.turnstileSiteKey ? (
        <Turnstile ref={turnstile} siteKey={session.turnstileSiteKey} onToken={setToken} onError={() => setTurnstileBroken(true)} />
      ) : null}

      <p className="privacy-note">
        {t.privacyNotice} <a href="/privacy">{t.privacyLink}</a>
      </p>

      {error && (
        <div className="form-error" role="alert">
          <p>{error.message}</p>
          <div className="row-actions">
            {error.retryable && (
              <button type="button" className="btn secondary small" onClick={() => void submit()} disabled={disabled}>
                {t.retry}
              </button>
            )}
            {error.offerTextOnly && (
              <button type="button" className="btn ghost small" onClick={() => void submit({ textOnly: true })} disabled={disabled}>
                {t.textOnlyInstead}
              </button>
            )}
          </div>
        </div>
      )}

      <button type="submit" className="btn primary block" disabled={disabled} aria-describedby="quota-line">
        {phase === "uploading" ? t.uploading : phase === "analysing" ? "جارٍ التحليل…" : t.submit}
      </button>

      <p className="status" role="status" aria-live="polite">
        {phase === "uploading" ? t.uploading : phase === "analysing" ? t.analysing : ""}
      </p>
      <p className="quota" id="quota-line">
        {!session.analysisAvailable
          ? t.serviceNotReady
          : `${t.quotaLine(quota.remaining, quota.limit)}${noQuota && quota.resetsAt ? " " + t.quotaReset(fmtDate(quota.resetsAt)) : ""}`}
      </p>
    </form>
  );
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ar-u-nu-latn", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}
