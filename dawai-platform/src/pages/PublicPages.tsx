import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "../app/router";
import { apiFetch, setCsrfToken } from "../api/client";
import { useSession, type Role } from "../app/SessionContext";
import { Logo } from "../components/AppShell";
import { Icon } from "../Icon";

function rolePath(role: Role): string {
  return role === "PATIENT" ? "/patient" : role === "PHARMACY" ? "/pharmacy" : "/admin";
}

export function WelcomePage() {
  const { session, loading } = useSession();
  if (!loading && session) return <Navigate to={rolePath(session.user.role)} replace />;

  return (
    <div className="welcome-page">
      <header className="public-header">
        <Logo />
        <Link to="/auth/patient/login">تسجيل الدخول</Link>
      </header>
      <main>
        <section className="welcome-copy">
          <p className="overline">منصة العثور على الدواء في العراق</p>
          <h1>دواؤك أقرب مما تتوقع.</h1>
          <p>
            طلب واحد يصل إلى الصيدليات الموثقة والقريبة. تحصل على التوفر والسعر
            والجاهزية، ثم تحجز للاستلام.
          </p>
          <div className="role-choice" aria-labelledby="role-choice-title">
            <h2 id="role-choice-title">كيف ستستخدم دوائي؟</h2>
            <Link to="/auth/patient/register" className="role-card patient">
              <span><Icon name="user" size={28} /></span>
              <div><strong>أنا مريض</strong><small>أبحث عن دواء أو أرسل طلبًا</small></div>
              <Icon name="arrow" size={21} />
            </Link>
            <Link to="/auth/pharmacy/register" className="role-card pharmacy">
              <span><Icon name="store" size={28} /></span>
              <div><strong>أنا صيدلية</strong><small>أستقبل طلبات قريبة وأرسل عروضًا</small></div>
              <Icon name="arrow" size={21} />
            </Link>
          </div>
          <div className="safety-line"><Icon name="shield" size={18} /> دوائي لا يشخّص ولا يصف أو يستبدل الدواء.</div>
        </section>
        <section className="welcome-visual" aria-label="كيف يعمل دوائي">
          <div className="welcome-radar">
            <span className="range-pulse" aria-hidden="true" />
            <span className="range-pulse delay" aria-hidden="true" />
            <span className="center"><Icon name="location" size={25} /> طلبك</span>
            <span className="point p1"><Icon name="store" size={18} /> عرض مؤكد</span>
            <span className="point p2"><Icon name="store" size={18} /> عرض جديد</span>
            <span className="point p3"><Icon name="store" size={18} /> يراجع</span>
          </div>
          <ol>
            <li><span>1</span> أخبرنا ما تحتاجه</li>
            <li><span>2</span> الصيدليات القريبة ترد</li>
            <li><span>3</span> اختر واحجز للاستلام</li>
          </ol>
        </section>
      </main>
      <footer>
        دوائي · منصة مستقلة · بياناتك الصحية لا تستخدم للإعلانات ·{" "}
        <Link to="/legal/privacy">الخصوصية</Link> ·{" "}
        <Link to="/legal/terms">الشروط</Link>
      </footer>
    </div>
  );
}

export function AuthPage() {
  const params = useParams<{ role: string; mode: string }>();
  const role =
    params.role === "pharmacy"
      ? "PHARMACY"
      : params.role === "admin"
        ? "ADMIN"
        : "PATIENT";
  const registering = params.mode === "register" && role !== "ADMIN";
  const { session, refresh } = useSession();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptPharmacyTerms, setAcceptPharmacyTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (session) return <Navigate to={rolePath(session.user.role)} replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const path = registering ? "/api/v1/auth/register" : "/api/v1/auth/login";
      const response = await apiFetch<{
        data: { csrfToken: string; user: { role: Role } };
      }>(path, {
        method: "POST",
        body: JSON.stringify(
          registering
            ? {
                role,
                name,
                phone: phone || undefined,
                email,
                password,
                clientType: "web",
                acceptPrivacy: true as const,
                acceptTerms: true as const,
                acceptPharmacyTerms: role === "PHARMACY" ? true : undefined,
              }
            : { email, password, expectedRole: role, clientType: "web" },
        ),
      });
      setCsrfToken(response.data.csrfToken);
      const nextSession = await refresh();
      navigate(rolePath(nextSession?.user.role ?? response.data.user.role), { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تسجيل الدخول.");
    } finally {
      setBusy(false);
    }
  }

  const roleLabel = role === "PATIENT" ? "المريض" : role === "PHARMACY" ? "الصيدلية" : "الإدارة";
  const consentsReady =
    !registering ||
    (acceptPrivacy &&
      acceptTerms &&
      (role !== "PHARMACY" || acceptPharmacyTerms));
  return (
    <div className="auth-page">
      <header className="public-header">
        <Link to="/"><Logo /></Link>
        <Link to="/">العودة</Link>
      </header>
      <main>
        <section className="auth-context">
          <span className="auth-role-icon"><Icon name={role === "PATIENT" ? "user" : role === "PHARMACY" ? "store" : "shield"} size={30} /></span>
          <p className="overline">بوابة {roleLabel}</p>
          <h1>{registering ? "أنشئ حسابك" : "مرحبًا بعودتك"}</h1>
          <p>
            {role === "PHARMACY"
              ? "حساب الصيدلية منفصل ويحتاج اعتماد الترخيص قبل استقبال الطلبات."
              : role === "ADMIN"
                ? "هذه البوابة للمشرفين المصرح لهم فقط."
                : "احفظ طلباتك وتابع العروض والحجوزات من أي جهاز."}
          </p>
        </section>
        <form className="auth-form" onSubmit={submit}>
          {registering ? (
            <>
              <label className="form-field"><span>الاسم</span><input value={name} onChange={(event) => setName(event.target.value)} required autoComplete="name" /></label>
              <label className="form-field"><span>رقم الهاتف</span><input value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" autoComplete="tel" /></label>
            </>
          ) : null}
          <label className="form-field"><span>البريد الإلكتروني</span><input dir="ltr" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" /></label>
          <label className="form-field"><span>كلمة المرور</span><input dir="ltr" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={registering ? 10 : 1} autoComplete={registering ? "new-password" : "current-password"} /></label>
          {registering ? (
            <div className="consent-stack">
              <label className="confirmation-check"><input type="checkbox" checked={acceptPrivacy} onChange={(event) => setAcceptPrivacy(event.target.checked)} required /><span><Icon name="check" size={14} /></span>أوافق على <Link to="/legal/privacy">سياسة الخصوصية</Link></label>
              <label className="confirmation-check"><input type="checkbox" checked={acceptTerms} onChange={(event) => setAcceptTerms(event.target.checked)} required /><span><Icon name="check" size={14} /></span>أوافق على <Link to="/legal/terms">شروط الاستخدام</Link></label>
              {role === "PHARMACY" ? (
                <label className="confirmation-check"><input type="checkbox" checked={acceptPharmacyTerms} onChange={(event) => setAcceptPharmacyTerms(event.target.checked)} required /><span><Icon name="check" size={14} /></span>أوافق على <Link to="/legal/pharmacy-terms">شروط الصيدلية</Link></label>
              ) : null}
            </div>
          ) : (
            <p className="auth-switch"><Link to="/auth/reset">نسيت كلمة المرور؟</Link></p>
          )}
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <button className="primary-cta" type="submit" disabled={busy || !consentsReady}>
            {busy ? "جارٍ التحقق…" : registering ? "إنشاء الحساب" : "تسجيل الدخول"}
          </button>
          {role !== "ADMIN" ? (
            <p className="auth-switch">
              {registering ? "لديك حساب؟" : "ليس لديك حساب؟"}{" "}
              <Link to={`/auth/${params.role}/${registering ? "login" : "register"}`}>
                {registering ? "سجّل الدخول" : "أنشئ حسابًا"}
              </Link>
            </p>
          ) : null}
        </form>
      </main>
    </div>
  );
}

export function PasswordResetPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function requestReset(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await apiFetch<{
        data: { message: string; resetToken?: string };
      }>("/api/v1/auth/password-reset/request", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setMessage(
        response.data.resetToken
          ? `${response.data.message} (بيئة تطوير: استخدم الرمز من الرابط التالي)`
          : response.data.message,
      );
      if (response.data.resetToken) {
        setMessage(
          `${response.data.message} افتح /auth/reset?token=${response.data.resetToken}`,
        );
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر إرسال الطلب.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmReset(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiFetch("/api/v1/auth/password-reset/confirm", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });
      setMessage("تم تعيين كلمة المرور. يمكنك تسجيل الدخول الآن.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر إعادة التعيين.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <header className="public-header">
        <Link to="/"><Logo /></Link>
        <Link to="/auth/patient/login">تسجيل الدخول</Link>
      </header>
      <main>
        <section className="auth-context">
          <p className="overline">استعادة الحساب</p>
          <h1>{token ? "عيّن كلمة مرور جديدة" : "إعادة تعيين كلمة المرور"}</h1>
          <p>لا نكشف إن كان البريد موجودًا. إن وُجد حساب ستصلك التعليمات.</p>
        </section>
        <form className="auth-form" onSubmit={token ? confirmReset : requestReset}>
          {token ? (
            <label className="form-field"><span>كلمة المرور الجديدة</span><input dir="ltr" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={10} autoComplete="new-password" /></label>
          ) : (
            <label className="form-field"><span>البريد الإلكتروني</span><input dir="ltr" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" /></label>
          )}
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          {message ? <p className="inline-notice" role="status">{message}</p> : null}
          <button className="primary-cta" type="submit" disabled={busy}>{busy ? "جارٍ…" : token ? "حفظ كلمة المرور" : "إرسال التعليمات"}</button>
        </form>
      </main>
    </div>
  );
}

const LEGAL_DOCS: Record<string, { title: string; body: string[] }> = {
  privacy: {
    title: "سياسة الخصوصية",
    body: [
      "دوائي منصة مطابقة طلبات دواء وعروض صيدليات، وليست صيدلية إلكترونية.",
      "نجمع الحد الأدنى من البيانات اللازمة للمطابقة والحجز: الهوية الأساسية، الموقع التقريبي، تفاصيل الطلب، وملفات الوصفة المشفرة عند رفعها.",
      "لا تُكشف هوية المريض أو الوصفة للصيدليات قبل اختيار عرض وتأكيد الحجز.",
      "تُخزَّن صور الوصفات مشفرة (AES-256-GCM) وتُحذف وفق سياسة الاحتفاظ.",
      "لا نستخدم البيانات الصحية للإعلانات. طلبات الحذف متاحة من الحساب.",
      "هذه الوثيقة قالب تشغيلي وتتطلب مراجعة قانونية عراقية قبل الإطلاق العام.",
    ],
  },
  terms: {
    title: "شروط الاستخدام",
    body: [
      "باستخدام دوائي توافق على أن المنصة وسيلة مطابقة وليست جهة صرف أو تشخيص.",
      "المريض مسؤول عن صحة المعلومات المقدمة. الصيدلي مسؤول عن التحقق والصرف وفق القانون.",
      "الحجز المؤقت يبدأ فقط بعد تأكيد الصيدلية حفظ الكمية، ولمدة محدودة.",
      "يُحظر إساءة استخدام المنصة أو إرسال وصفات مزورة أو طلب مواد خاضعة للرقابة خارج القنوات القانونية.",
      "هذه الشروط مسودة تشغيلية وتحتاج اعتماد محامٍ عراقي قبل الإطلاق.",
    ],
  },
  "pharmacy-terms": {
    title: "شروط الصيدلية",
    body: [
      "يجب أن تكون الصيدلية مرخصة وأن يقدم الصيدلي المسؤول بيانات الترخيص الصحيحة.",
      "لا يُسمح باستقبال الطلبات قبل اعتماد الإدارة. الإيقاف ممكن عند المخالفات.",
      "العروض يجب أن تكون صادقة ومؤرخة. التأكيد الكاذب المتكرر يخضع للمراجعة التشغيلية.",
      "لا يُحجز المخزون بمجرد إرسال العرض؛ الحفظ يبدأ بعد اختيار المريض وتأكيد الصيدلية.",
      "هذه الشروط مسودة وتتطلب مراجعة نقابية/قانونية قبل التشغيل العام.",
    ],
  },
  prescriptions: {
    title: "سياسة التعامل مع الوصفات",
    body: [
      "الوصفة وثيقة حساسة. تُرفع اختياريًا، وتُعاد ترميزها وتُشفر قبل التخزين.",
      "الوصول مؤقت ومقصور على الصيدلية المختارة أثناء حجز مؤكد نشط، مع سجل تدقيق.",
      "بعد انتهاء الحجز أو الإلغاء يُمنع الوصول. مدد الاحتفاظ قابلة للتكوين.",
      "دوائي لا يشخص ولا يصف ولا يستبدل دواءً تلقائيًا.",
      "يلزم اعتماد الجهة الصحية المختصة قبل التعامل مع الوصفات الرقمية إن وُجدت.",
    ],
  },
  retention: {
    title: "الاحتفاظ بالبيانات وحذف الحساب",
    body: [
      "سجلات الطلبات والعروض تُحفظ لأغراض التشغيل والسلامة لفترة محدودة قابلة للمراجعة القانونية.",
      "ملفات الوصفة لها تاريخ حذف مجدول. يمكن للمستخدم طلب حذف الحساب (تعطيل ناعم).",
      "سجلات التدقيق الأمنية قد تُحفظ أطول لأغراض التحقيق وفق القانون المعمول به.",
      "هذه السياسة قالب وتخضع لمراجعة خصوصية/قانونية عراقية وKRG عند الحاجة.",
    ],
  },
};

export function LegalPage() {
  const params = useParams<{ doc: string }>();
  const doc = LEGAL_DOCS[params.doc ?? ""] ?? LEGAL_DOCS.privacy;
  return (
    <div className="auth-page legal-page">
      <header className="public-header">
        <Link to="/"><Logo /></Link>
        <Link to="/">العودة</Link>
      </header>
      <main>
        <article className="legal-article">
          <p className="overline">وثيقة قانونية تشغيلية</p>
          <h1>{doc.title}</h1>
          <p className="legal-warning">هذه ليست استشارة قانونية. يلزم مراجعة محامٍ عراقي مؤهل قبل الاعتماد العام.</p>
          {doc.body.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </article>
      </main>
    </div>
  );
}
