import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useParams } from "../app/router";
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
            <span className="center"><Icon name="location" size={25} /> طلبك</span>
            <span className="point p1"><Icon name="store" size={18} /> متوفر</span>
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
      <footer>دوائي · منصة مستقلة · بياناتك الصحية لا تستخدم للإعلانات</footer>
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
            ? { role, name, phone: phone || undefined, email, password, clientType: "web" }
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
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <button className="primary-cta" type="submit" disabled={busy}>
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
