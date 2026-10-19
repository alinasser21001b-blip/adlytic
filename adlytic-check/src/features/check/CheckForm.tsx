import { useEffect, useId, useRef, useState, type DragEvent } from "react";
import { GOALS, INDUSTRIES, LIMITS, type Goal, type Industry } from "../../../shared/constants";
import type { AnyAnalysisReport, SessionInfo } from "../../../shared/schemas";
import { t } from "../../i18n/ar";
import { fmtIQD, fmtWhen, loginHref, type Me } from "../account/api";
import { BuyChecks } from "../account/Purchase";
import { ApiFailure, newIdempotencyKey, submitCheck, type CheckPhase } from "./api";
import { ImageRejected, prepareImage } from "./image";
import { Turnstile, type TurnstileHandle } from "./Turnstile";
import { extractVideo, isVideoFile, VideoRejected, type ExtractedVideo } from "./video";

interface Props {
  session: SessionInfo;
  me: Me | null;
  onDone: (report: AnyAnalysisReport, previewUrl: string | null) => void;
  onQuotaChanged: () => void;
}

interface FormError {
  message: string;
  retryable: boolean;
  offerTextOnly: boolean;
  /** Account mode: what the owner can do next. */
  next?: "login" | "consent" | "buy";
}

export function CheckForm({ session, me, onDone, onQuotaChanged }: Props) {
  const ids = { copy: useId(), copyHint: useId(), industry: useId(), audience: useId(), context: useId(), image: useId(), imageHint: useId() };
  const [image, setImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [prepStep, setPrepStep] = useState("");
  const [video, setVideo] = useState<ExtractedVideo | null>(null);
  const [link, setLink] = useState("");
  const [linkMsg, setLinkMsg] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [adCopy, setAdCopy] = useState("");
  const [industry, setIndustry] = useState<Industry | "">("");
  const [goal, setGoal] = useState<Goal>("messages");
  const [audience, setAudience] = useState("");
  const [context, setContext] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [turnstileBroken, setTurnstileBroken] = useState(false);
  const [phase, setPhase] = useState<CheckPhase | null>(null);
  const [uploaded, setUploaded] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<FormError | null>(null);
  const keyRef = useRef<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  tokenRef.current = token;

  function waitForToken(ms: number): Promise<string | null> {
    return new Promise((resolve) => {
      const until = Date.now() + ms;
      const tick = () => {
        if (tokenRef.current) return resolve(tokenRef.current);
        if (Date.now() > until) return resolve(null);
        setTimeout(tick, 150);
      };
      tick();
    });
  }
  const turnstile = useRef<TurnstileHandle>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Any change to what is being sent invalidates the in-flight idempotency key.
  useEffect(() => {
    keyRef.current = null;
  }, [image, video, adCopy, industry, goal, audience, context]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  async function acceptFile(file: File | undefined) {
    setImageError(null);
    setError(null);
    if (!file) return;
    setPreparing(true);
    if (isVideoFile(file)) {
      if (!session.videoEnabled) {
        setPreparing(false);
        setImageError("فحص الفيديو غير متاح حالياً. ارفع لقطة شاشة من الإعلان.");
        return;
      }
      try {
        clearImage();
        const v = await extractVideo(file, setPrepStep);
        setVideo(v);
        setPreviewUrl(v.posterUrl);
      } catch (e) {
        setVideo(null);
        setImageError(e instanceof VideoRejected && e.message.length > 12 ? e.message : "لم نتمكن من قراءة هذا الفيديو. جرّب ملف MP4.");
      } finally {
        setPreparing(false);
        setPrepStep("");
      }
      return;
    }
    setVideo(null);
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

  /** Import from a link: the server fetches safely; social platforms get a plain explanation. */
  async function importFromLink() {
    if (!link.trim()) return;
    setLinkBusy(true);
    setLinkMsg("");
    try {
      const res = await fetch("/api/import-link", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: link.trim() }) });
      const type = res.headers.get("content-type") ?? "";
      if (!res.ok) {
        setLinkMsg(res.status === 429 ? "استوردت روابط كثيرة خلال وقت قصير. انتظر قليلاً." : "تعذّر استيراد الرابط.");
        return;
      }
      if (type.includes("json")) {
        const j = (await res.json()) as { state: string; reason: string };
        setLinkMsg(
          j.state === "AUTH_REQUIRED"
            ? "روابط إنستغرام وفيسبوك تحتاج ربطاً رسمياً بحسابك عبر ميتا، وهو غير متاح بعد. احفظ الصورة أو الفيديو من التطبيق وارفعه هنا."
            : j.state === "UNAVAILABLE"
              ? "تعذّر الوصول إلى الرابط الآن. تأكد أنه يعمل أو ارفع الملف مباشرة."
              : j.reason === "platform_has_no_official_import"
                ? "لا نستورد من هذه المنصة. احفظ الإعلان على جهازك وارفعه هنا."
                : "هذا الرابط لا يشير إلى صورة أو فيديو يمكن استيراده بأمان.",
        );
        return;
      }
      const blob = await res.blob();
      const kind = res.headers.get("x-link-kind");
      const file = new File([blob], kind === "video" ? "linked-video" : "linked-image", { type: blob.type });
      await acceptFile(file);
      setLinkMsg(res.headers.get("x-link-state") === "PREVIEW_ONLY" ? "استوردنا صورة المعاينة من الصفحة — قد لا تكون الإعلان نفسه. ارفع الإعلان مباشرة إن كان مختلفاً." : "تم الاستيراد من الرابط.");
    } catch {
      setLinkMsg("تعذّر استيراد الرابط.");
    } finally {
      setLinkBusy(false);
    }
  }

  function clearImage() {
    setImage(null);
    setVideo(null);
    setPreviewUrl(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragOver(false);
    void acceptFile(e.dataTransfer.files?.[0]);
  }

  async function submit(opts: { textOnly?: boolean; paid?: boolean } = {}) {
    setError(null);
    const sendImage = opts.textOnly ? null : image;
    const sendVideo = opts.textOnly ? null : video;
    if (!sendImage && !sendVideo && !adCopy.trim()) {
      setError({ message: t.needInput, retryable: false, offerTextOnly: false });
      return;
    }
    if (!industry) {
      setError({ message: "اختر مجال عملك.", retryable: false, offerTextOnly: false });
      return;
    }
    // A reset widget re-issues its token within a moment; wait for it rather than failing.
    const tk = tokenRef.current ?? (turnstileBroken ? null : await waitForToken(6000));
    if (!tk) {
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
    if (sendVideo) {
      fd.append(
        "video_meta",
        JSON.stringify({ durationSec: sendVideo.durationSec, width: sendVideo.width, height: sendVideo.height, frameTimes: sendVideo.frames.map((f) => f.timeSec), audio: sendVideo.audioPresence }),
      );
      sendVideo.frames.forEach((f, i) => fd.append(`frame${i}`, f.blob, `frame${i}.jpg`));
      if (sendVideo.audio) fd.append("audio", sendVideo.audio, "audio.wav");
    }
    fd.append("adCopy", adCopy.trim());
    fd.append("industry", industry);
    fd.append("goal", goal);
    fd.append("audience", audience.trim());
    fd.append("additionalContext", context.trim());
    fd.append("idempotencyKey", keyRef.current);
    fd.append("turnstileToken", tk);
    if (opts.paid && me?.balance) {
      // Explicit consent: one paid unit at the price the owner was shown.
      fd.append("credit", "paid");
      fd.append("priceVersion", me.balance.priceVersion);
    }

    try {
      setUploaded(0);
      const report = await submitCheck(fd, setPhase, undefined, setUploaded, sendVideo ? "/api/check?media=video" : "/api/check");
      keyRef.current = null;
      onDone(report, sendImage || sendVideo ? previewUrl : null);
    } catch (e) {
      const f = e instanceof ApiFailure ? e : new ApiFailure(0, "NETWORK", "", true);
      const lostInTransit = f.code === "NETWORK" || f.code === "TIMEOUT";
      // Keep the key only when we never learned the outcome: the replay is then idempotent.
      if (!lostInTransit && f.code !== "REQUEST_IN_PROGRESS") keyRef.current = null;
      const message = f.code === "NETWORK" ? t.networkError : f.code === "TIMEOUT" ? t.timeoutError : f.message;
      setError({
        message,
        retryable: lostInTransit || f.retryable || f.code === "VERIFICATION_FAILED" || f.code === "REQUEST_IN_PROGRESS",
        offerTextOnly: Boolean(sendImage || sendVideo) && Boolean(adCopy.trim()) && f.code === "ANALYSIS_UNAVAILABLE",
        next: f.code === "LOGIN_REQUIRED" ? "login" : f.code === "PAID_CONSENT_REQUIRED" ? "consent" : f.code === "FREE_QUOTA_EXHAUSTED" || f.code === "INSUFFICIENT_CREDITS" ? "buy" : undefined,
      });
      onQuotaChanged();
    } finally {
      setPhase(null);
      turnstile.current?.reset();
    }
  }

  // Honest progress: real upload fraction, then elapsed seconds — never an invented percentage.
  useEffect(() => {
    if (phase !== "analysing") return setElapsed(0);
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [phase]);

  const busy = phase !== null || preparing;
  const accountsMode = session.accounts.enabled;
  const loggedIn = Boolean(me?.user);
  const balance = me?.balance ?? null;
  const quota = session.quota;
  const noQuota = accountsMode ? false : quota.remaining <= 0;
  const disabled = busy || !session.analysisAvailable || noQuota || (accountsMode && !loggedIn);
  const quotaText = !session.analysisAvailable
    ? t.serviceNotReady
    : accountsMode
      ? balance
        ? `فحوصك المجانية: ${balance.freeAvailable} من 2${balance.freeAvailable < 2 && balance.nextRefillAt ? ` · فحص جديد ${fmtWhen(balance.nextRefillAt)}` : ""}${balance.paidAvailable ? ` · مدفوعة: ${balance.paidAvailable}` : ""}`
        : "سجّل الدخول لتحصل على فحصين مجانيين، ثم فحص جديد كل 24 ساعة."
      : `${t.quotaLine(quota.remaining, quota.limit)}${noQuota && quota.resetsAt ? " " + t.quotaReset(fmtDate(quota.resetsAt)) : ""}`;

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
      {accountsMode && !loggedIn && session.accounts.loginAvailable && (
        <div className="login-callout">
          <p>سجّل الدخول بحساب Google لتحصل على فحصين مجانيين، ثم فحص جديد كل 24 ساعة. لا نحفظ بريدك أو اسمك.</p>
          <a className="btn primary small" href={loginHref("/")}>
            تسجيل الدخول عبر Google
          </a>
        </div>
      )}

      <div className="field">
        <span className="label" id={ids.image}>{t.imageLabel}</span>
        {previewUrl ? (
          <div className="preview">
            <img src={previewUrl} alt={video ? "أول لقطة من فيديو الإعلان" : "معاينة صورة الإعلان المرفوعة"} />
            {video && (
              <p className="meta">
                فيديو <bdi>{video.durationSec}</bdi> ث · <bdi>{video.frames.length}</bdi> لقطات ·{" "}
                {video.audioPresence === "present" ? "الصوت جاهز للتحليل" : video.audioPresence === "no_audio" ? "بلا صوت" : "تعذّر تجهيز الصوت في هذا المتصفح"} — لا يُرفع الفيديو نفسه.
              </p>
            )}
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
              accept={session.videoEnabled ? "image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm" : "image/jpeg,image/png,image/webp"}
              className="visually-hidden"
              aria-labelledby={ids.image}
              aria-describedby={ids.imageHint}
              onChange={(e) => void acceptFile(e.target.files?.[0])}
              disabled={busy}
            />
            <span className="dz-icon" aria-hidden="true">＋</span>
            <span className="dz-cta">{preparing ? prepStep || t.imagePreparing : session.videoEnabled ? "اختر صورة أو فيديو" : t.imagePick}</span>
            <span className="hint" id={ids.imageHint}>
              {session.videoEnabled ? "صورة JPEG/PNG/WebP حتى 3 ميغابايت، أو فيديو حتى 60 ثانية و50 ميغابايت (نحلل لقطات وصوتاً منه على جهازك)." : t.imageHint}
            </span>
          </label>
        )}
        {imageError && (
          <p className="inline-error" role="alert">
            {imageError}
          </p>
        )}
        {!previewUrl && (
          <div className="link-import">
            <label htmlFor="link-url" className="hint">
              أو الصق رابط ملف الإعلان أو صفحة منتجك
            </label>
            <div className="link-row">
              <input id="link-url" type="url" inputMode="url" dir="ltr" placeholder="https://" value={link} onChange={(e) => setLink(e.target.value)} disabled={busy || linkBusy} />
              <button type="button" className="btn secondary small" onClick={() => void importFromLink()} disabled={busy || linkBusy || !link.trim()}>
                {linkBusy ? "جارٍ الاستيراد…" : "استورد"}
              </button>
            </div>
          </div>
        )}
        {linkMsg && (
          <p className="meta" role="status">
            {linkMsg}
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
          <span>{image || video ? t.copyHintWithImage : t.copyHintNoImage}</span>
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
            {error.next === "login" && (
              <a className="btn primary small" href={loginHref("/")}>
                تسجيل الدخول عبر Google
              </a>
            )}
            {error.next === "consent" && balance && (
              <button type="button" className="btn primary small" onClick={() => void submit({ paid: true })} disabled={busy}>
                استخدم فحصاً مدفوعاً ({fmtIQD(balance.unitPriceIQD)} من رصيدك)
              </button>
            )}
          </div>
          {error.next === "buy" && <BuyChecks />}
        </div>
      )}

      <button type="submit" className="btn primary block" disabled={disabled} aria-describedby="quota-line">
        {phase === "uploading" ? t.uploading : phase === "analysing" ? "جارٍ التحليل…" : t.submit}
      </button>

      {phase && (
        <div className={`progress ${phase}`} aria-hidden="true">
          <span className="progress-fill" style={phase === "uploading" ? { inlineSize: `${Math.max(4, Math.round(uploaded * 100))}%` } : undefined} />
        </div>
      )}
      <p className="status" role="status" aria-live="polite">
        {phase === "uploading"
          ? `${t.uploading} ${Math.round(uploaded * 100)}٪`
          : phase === "analysing"
            ? `${t.analysing} (${elapsed} ث)`
            : ""}
      </p>
      <p className="quota" id="quota-line">
        {quotaText}
      </p>
    </form>
  );
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ar-u-nu-latn", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}
