import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiFetch, newIdempotencyKey } from "../api/client";
import { useSession } from "../app/SessionContext";
import { useApi } from "../app/useApi";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatusBadge,
} from "../components/AppShell";
import { Icon } from "../Icon";

interface PharmacyProfile {
  id: string;
  name: string;
  pharmacist_name: string;
  phone: string;
  email: string;
  license_number: string;
  license_issuer: string;
  verification_status: string;
  verification_reason: string | null;
  branch_id: string;
  branch_name: string;
  governorate: string;
  district: string;
  address: string;
  latitude: number;
  longitude: number;
  opening_hours: Record<string, [string, string][]>;
  pickup_enabled: boolean;
  delivery_enabled: boolean;
  accepting_requests: boolean;
  operational_status: string;
}

interface InboxRequest {
  id: string;
  public_reference: string;
  medicine_name: string;
  strength: string | null;
  dosage_form: string | null;
  quantity: number;
  urgency: string;
  prescription_status: string;
  area: string;
  status: string;
  expires_at: string;
  created_at: string;
  distance_km: number;
  match_score: number;
  dispatch_status: string;
  offer_id: string | null;
}

interface PharmacyReservation {
  id: string;
  public_reference: string;
  status: string;
  acknowledgement_deadline: string;
  hold_expires_at: string | null;
  medicine_name: string;
  strength: string | null;
  quantity: number;
  offered_brand: string;
  price_iqd: number;
  preparation_minutes: number;
  created_at: string;
}

function iqd(value: number) {
  return `${new Intl.NumberFormat("en-IQ").format(value)} د.ع`;
}

function date(value: string) {
  return new Intl.DateTimeFormat("ar-IQ", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function standardHours() {
  return Object.fromEntries(
    Array.from({ length: 7 }, (_, day) => [String(day), [["08:00", "23:59"]]]),
  );
}

export function PharmacyGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = useApi(async () => (await apiFetch<{ data: PharmacyProfile | null }>("/api/v1/pharmacy/profile")).data, []);
  if (profile.loading) return <LoadingState label="نراجع حالة اعتماد الصيدلية…" />;
  if (profile.error) return <ErrorState error={profile.error} retry={profile.reload} />;
  if (!profile.data) return <PharmacyOnboardingPage onComplete={profile.reload} />;
  if (profile.data.verification_status !== "VERIFIED") {
    return <VerificationStatus profile={profile.data} reload={profile.reload} />;
  }
  return <>{children}</>;
}

export function PharmacyOnboardingPage({
  onComplete,
}: {
  onComplete?: () => Promise<unknown>;
}) {
  const { session } = useSession();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [locationMessage, setLocationMessage] = useState("");
  const [coords, setCoords] = useState({ lat: 33.3152, lng: 44.3661 });

  function locate() {
    navigator.geolocation?.getCurrentPosition(
      (position) => {
        setCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
        setLocationMessage("تم تثبيت موقع الفرع.");
      },
      () => setLocationMessage("تعذر استخدام الموقع. تحقق من الدبوس قبل الإرسال."),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const opensAt = String(form.get("opensAt"));
      const closesAt = String(form.get("closesAt"));
      const openingHours = Object.fromEntries(
        Array.from({ length: 7 }, (_, day) => [
          String(day),
          [[opensAt, closesAt]],
        ]),
      );
      await apiFetch("/api/v1/pharmacy/onboarding", {
        method: "POST",
        body: JSON.stringify({
          pharmacyName: form.get("pharmacyName"),
          pharmacistName: form.get("pharmacistName"),
          phone: form.get("phone"),
          licenseNumber: form.get("licenseNumber"),
          licenseIssuer: form.get("licenseIssuer"),
          licenseExpiresAt: form.get("licenseExpiresAt") || null,
          branchName: form.get("branchName"),
          governorate: form.get("governorate"),
          district: form.get("district"),
          address: form.get("address"),
          landmark: form.get("landmark") || null,
          latitude: coords.lat,
          longitude: coords.lng,
          openingHours,
          pickupEnabled: form.get("pickup") === "on",
          deliveryEnabled: form.get("delivery") === "on",
        }),
      });
      if (file) {
        const upload = new FormData();
        upload.set("purpose", "PHARMACY_LICENSE");
        upload.set("file", file);
        await apiFetch("/api/v1/files", { method: "POST", body: upload });
      }
      await onComplete?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر إرسال الطلب.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader eyebrow="تهيئة حساب الصيدلية" title="عرّفنا بفرعك" description="لن تستقبل أي طلب قبل مراجعة الترخيص واعتماد الفرع." />
      <form className="product-form wide-form" onSubmit={submit}>
        <div className="form-row"><label className="form-field"><span>اسم الصيدلية</span><input name="pharmacyName" required /></label><label className="form-field"><span>اسم الصيدلي المسؤول</span><input name="pharmacistName" defaultValue={session?.user.name} required /></label></div>
        <div className="form-row"><label className="form-field"><span>الهاتف</span><input name="phone" defaultValue={session?.user.phone ?? ""} required /></label><label className="form-field"><span>اسم الفرع</span><input name="branchName" defaultValue="الفرع الرئيسي" required /></label></div>
        <div className="form-divider"><span>الترخيص</span></div>
        <div className="form-row"><label className="form-field"><span>رقم إجازة الصيدلية</span><input name="licenseNumber" required /></label><label className="form-field"><span>الجهة المصدرة</span><input name="licenseIssuer" defaultValue="نقابة صيادلة العراق" required /></label></div>
        <label className="form-field"><span>انتهاء الإجازة (إن وجد)</span><input name="licenseExpiresAt" type="date" /></label>
        <label className="upload-zone compact-upload"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /><Icon name="upload" size={25} /><strong>{file?.name ?? "صورة الإجازة"}</strong><span>تخزن مشفرة ولا يفتحها إلا المشرف المخول.</span></label>
        <div className="form-divider"><span>موقع الفرع</span></div>
        <div className="form-row"><label className="form-field"><span>المحافظة</span><input name="governorate" defaultValue="بغداد" required /></label><label className="form-field"><span>المنطقة</span><input name="district" defaultValue="المنصور" required /></label></div>
        <label className="form-field"><span>العنوان</span><input name="address" required /></label>
        <label className="form-field"><span>أقرب معلم</span><input name="landmark" /></label>
        <button className="secondary-cta" type="button" onClick={locate}><Icon name="location" size={18} /> تحديد موقع الفرع الحالي</button>
        {locationMessage ? <p className="inline-notice" role="status">{locationMessage}</p> : null}
        <div className="form-row"><label className="form-field"><span>يفتح الفرع</span><input name="opensAt" type="time" defaultValue="08:00" required /></label><label className="form-field"><span>يغلق الفرع</span><input name="closesAt" type="time" defaultValue="23:59" required /></label></div>
        <div className="form-row toggle-row"><label className="toggle-field"><input name="pickup" type="checkbox" defaultChecked /><span>الاستلام متاح</span></label><label className="toggle-field"><input name="delivery" type="checkbox" /><span>التوصيل متاح</span></label></div>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <button className="primary-cta" type="submit" disabled={busy}>{busy ? "جارٍ إرسال الملف الآمن…" : "إرسال طلب التحقق"}</button>
      </form>
    </>
  );
}

function VerificationStatus({
  profile,
  reload,
}: {
  profile: PharmacyProfile;
  reload: () => Promise<unknown>;
}) {
  return (
    <section className="verification-state">
      <span className="verification-icon"><Icon name="shield" size={34} /></span>
      <StatusBadge status={profile.verification_status} />
      <h1>{profile.verification_status === "REJECTED" ? "تحتاج البيانات إلى تعديل" : profile.verification_status === "SUSPENDED" ? "الحساب معلّق" : "طلب التحقق قيد المراجعة"}</h1>
      <p>{profile.verification_reason ?? "يراجع المشرف بيانات الإجازة وموقع الفرع. لن يظهر شارة اعتماد قبل صدور القرار."}</p>
      <dl><div><dt>الصيدلية</dt><dd>{profile.name}</dd></div><div><dt>رقم الإجازة</dt><dd dir="ltr">{profile.license_number}</dd></div><div><dt>الفرع</dt><dd>{profile.district}</dd></div></dl>
      <button className="secondary-cta" type="button" onClick={() => void reload()}>تحديث الحالة</button>
    </section>
  );
}

export function PharmacyDashboardPage() {
  const dashboard = useApi(async () => (await apiFetch<{ data: Record<string, number> }>("/api/v1/pharmacy/dashboard")).data, [], 10000);
  if (dashboard.loading) return <LoadingState />;
  if (dashboard.error || !dashboard.data) return <ErrorState error={dashboard.error} retry={dashboard.reload} />;
  const data = dashboard.data;
  return (
    <>
      <PageHeader eyebrow="لوحة الصيدلية" title="الطلبات القريبة اليوم" description="الأرقام تشغيلية وخاصة بفرعك، وليست تقييمات علنية." actions={<Link className="primary-cta" to="/pharmacy/inbox"><Icon name="bell" size={18} /> فتح صندوق الطلبات</Link>} />
      <div className="metric-grid"><article><span>طلبات اليوم</span><strong>{data.requests_today ?? 0}</strong><small>وصلت للفرع</small></article><article><span>بانتظار رد</span><strong>{data.waiting ?? 0}</strong><small>مطابقة ونشطة</small></article><article><span>عروض اليوم</span><strong>{data.offers_today ?? 0}</strong><small>أرسلتها الصيدلية</small></article><article><span>مكتملة اليوم</span><strong>{data.completed_today ?? 0}</strong><small>استلام مؤكد</small></article></div>
      <section className="reliability-panel"><div><p className="overline">الثقة التشغيلية</p><h2>أداء الفرع</h2><p>نستخدمه لتحسين المطابقة وحماية المرضى من التوفر غير الدقيق.</p></div><dl><div><dt>معدل الاستجابة</dt><dd>{Math.round((data.response_rate ?? 0) * 100)}%</dd></div><div><dt>متوسط الرد</dt><dd>{Math.round((data.average_response_seconds ?? 0) / 60)} د</dd></div><div><dt>حجوزات ناجحة</dt><dd>{data.successful_reservations ?? 0}</dd></div><div><dt>عدم تطابق بعد التأكيد</dt><dd>{data.confirmed_not_found ?? 0}</dd></div></dl></section>
    </>
  );
}

export function PharmacyInboxPage() {
  const inbox = useApi(async () => (await apiFetch<{ data: InboxRequest[] }>("/api/v1/pharmacy/inbox")).data, [], 5000);
  if (inbox.loading) return <LoadingState label="نحمّل الطلبات المطابقة…" />;
  if (inbox.error) return <ErrorState error={inbox.error} retry={inbox.reload} />;
  return (
    <>
      <PageHeader eyebrow="صندوق الطلبات الحي" title="طلبات قريبة بانتظارك" description="الترتيب يراعي المسافة والملاءمة. لا تظهر هوية المريض أو موقعه الدقيق." />
      {!inbox.data?.length ? <EmptyState title="لا توجد طلبات نشطة الآن" description="الفرع متصل. ستظهر هنا الطلبات المطابقة ضمن نطاق المرضى." /> : <div className="pharmacy-inbox-list">{inbox.data.map((request) => <article key={request.id}><div className="request-clock-line"><StatusBadge status={request.dispatch_status} /><span><Icon name="clock" size={15} /> ينتهي {date(request.expires_at)}</span></div><div className="request-body"><div><small>{request.public_reference} · {date(request.created_at)}</small><h2 dir="auto">{request.medicine_name} {request.strength}</h2><p>{request.dosage_form ?? "الشكل يراجعه الصيدلي"} · الكمية {request.quantity}</p></div><div className="request-distance"><strong>{Number(request.distance_km).toFixed(1)} كم</strong><span>{request.area}</span></div></div><div className="request-flags"><span><Icon name="prescription" size={16} /> {request.prescription_status === "PROVIDED" ? "الوصفة موجودة — مقيدة الوصول" : "لم ترفق وصفة"}</span><span><Icon name="clock" size={16} /> {request.urgency === "NOW" ? "يحتاجه الآن" : "خلال اليوم"}</span></div>{request.offer_id ? <StatusBadge status="ACTIVE">تم إرسال عرض</StatusBadge> : <Link className="primary-cta" to={`/pharmacy/inbox/${request.id}`}>مراجعة ورد سريع</Link>}</article>)}</div>}
    </>
  );
}

export function PharmacyRequestPage() {
  const { requestId = "" } = useParams();
  const navigate = useNavigate();
  const request = useApi(async () => (await apiFetch<{ data: InboxRequest }>(`/api/v1/pharmacy/inbox/${requestId}`)).data, [requestId]);
  const [offerType, setOfferType] = useState("EXACT");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (request.loading) return <LoadingState />;
  if (request.error || !request.data) return <ErrorState error={request.error} retry={request.reload} />;
  const item = request.data;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await apiFetch(`/api/v1/pharmacy/inbox/${requestId}/offers`, { method: "POST", idempotencyKey: newIdempotencyKey(), body: JSON.stringify({ offerType, offeredBrand: form.get("brand"), offeredStrength: form.get("strength"), offeredForm: form.get("form"), availableQuantity: Number(form.get("quantity")), priceIqd: Number(form.get("price")), pickupEnabled: form.get("pickup") === "on", deliveryEnabled: form.get("delivery") === "on", preparationMinutes: Number(form.get("preparation")), note: form.get("note") || null }) });
      navigate("/pharmacy/inbox");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر إرسال العرض."); }
    finally { setBusy(false); }
  }
  async function decline() {
    setBusy(true);
    try { await apiFetch(`/api/v1/pharmacy/inbox/${requestId}/decline`, { method: "POST", body: JSON.stringify({}) }); navigate("/pharmacy/inbox"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر الاعتذار."); }
    finally { setBusy(false); }
  }
  return (
    <>
      <PageHeader eyebrow={`${item.public_reference} · ${Number(item.distance_km).toFixed(1)} كم`} title={item.medicine_name} description={`${item.strength ?? ""} · ${item.dosage_form ?? "الشكل غير محدد"} · الكمية ${item.quantity}`} actions={<StatusBadge status={item.urgency}>{item.urgency === "NOW" ? "يحتاجه الآن" : "خلال اليوم"}</StatusBadge>} />
      <form className="product-form offer-form" onSubmit={submit}>
        <fieldset className="response-types"><legend>نوع الرد</legend>{[["EXACT", "مطابق تمامًا"], ["PARTIAL", "كمية جزئية"], ["ORDERABLE", "يمكن توفيره لاحقًا"], ["ALTERNATIVE_REVIEW_REQUIRED", "بديل يحتاج مراجعة"]].map(([value, label]) => <label className={offerType === value ? "selected" : ""} key={value}><input type="radio" name="type" value={value} checked={offerType === value} onChange={() => setOfferType(value)} /><span>{label}</span></label>)}</fieldset>
        {offerType === "ALTERNATIVE_REVIEW_REQUIRED" ? <div className="safety-note"><Icon name="shield" size={19} /><p>سيظهر للمريض أنه اقتراح للمراجعة ولن يستطيع حجزه تلقائيًا.</p></div> : null}
        <div className="form-row"><label className="form-field"><span>العلامة التجارية المتوفرة</span><input name="brand" defaultValue={offerType === "EXACT" ? item.medicine_name : ""} required /></label><label className="form-field"><span>القوة</span><input name="strength" defaultValue={item.strength ?? ""} required /></label></div>
        <div className="form-row"><label className="form-field"><span>الشكل</span><input name="form" defaultValue={item.dosage_form ?? ""} required /></label><label className="form-field"><span>الكمية المتاحة</span><input name="quantity" type="number" min={1} defaultValue={item.quantity} required /></label></div>
        <div className="form-row"><label className="form-field"><span>السعر الكلي IQD</span><input name="price" dir="ltr" inputMode="numeric" type="number" min={0} required /></label><label className="form-field"><span>التجهيز بالدقائق</span><select name="preparation" defaultValue="10"><option value="0">جاهز الآن</option><option value="10">10 دقائق</option><option value="20">20 دقيقة</option><option value="60">ساعة</option></select></label></div>
        <div className="form-row toggle-row"><label className="toggle-field"><input name="pickup" type="checkbox" defaultChecked /><span>استلام</span></label><label className="toggle-field"><input name="delivery" type="checkbox" /><span>توصيل</span></label></div>
        <label className="form-field"><span>ملاحظة اختيارية</span><textarea name="note" maxLength={500} placeholder="مثال: أحضر الوصفة الأصلية." /></label>
        <label className="confirmation-check"><input type="checkbox" required /><span><Icon name="check" size={14} /></span>أؤكد أن البيانات دقيقة وأن الفرع يستطيع حفظ الكمية 15 دقيقة بعد اختيار المريض.</label>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <button className="primary-cta" type="submit" disabled={busy}>{busy ? "جارٍ الإرسال…" : "إرسال العرض للمريض"}</button>
        <button className="danger-link" type="button" disabled={busy} onClick={() => void decline()}>غير متوفر — اعتذار</button>
      </form>
    </>
  );
}

export function PharmacyReservationsPage() {
  const reservations = useApi(async () => (await apiFetch<{ data: PharmacyReservation[] }>("/api/v1/pharmacy/reservations")).data, [], 4000);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  if (reservations.loading) return <LoadingState />;
  if (reservations.error) return <ErrorState error={reservations.error} retry={reservations.reload} />;
  async function transition(id: string, action: "acknowledge" | "ready" | "complete" | "fail") {
    setBusy(`${id}:${action}`);
    setError("");
    try {
      await apiFetch(`/api/v1/pharmacy/reservations/${id}/${action}`, { method: "POST", body: JSON.stringify(action === "fail" ? { reason: "تعذر تأكيد المخزون عند التجهيز" } : {}) });
      await reservations.reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر تحديث الحجز."); }
    finally { setBusy(""); }
  }
  return (
    <>
      <PageHeader eyebrow="التنفيذ" title="الحجوزات" description="الحجز لا يبدأ حتى تؤكد حفظ الكمية. كل انتقال محفوظ في الخادم." />
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {!reservations.data?.length ? <EmptyState title="لا توجد حجوزات" description="عندما يختار مريض عرضك سيظهر هنا طلب التأكيد." /> : <div className="reservation-management">{reservations.data.map((reservation) => <article key={reservation.id}><div className="reservation-management-head"><div><small>{reservation.public_reference}</small><h2 dir="auto">{reservation.medicine_name} {reservation.strength}</h2><p>{reservation.offered_brand} · {iqd(reservation.price_iqd)}</p></div><StatusBadge status={reservation.status} /></div><div className="reservation-deadline"><Icon name="clock" size={17} /><span>{reservation.status === "PENDING_ACK" ? `أكد قبل ${date(reservation.acknowledgement_deadline)}` : reservation.hold_expires_at ? `الحفظ حتى ${date(reservation.hold_expires_at)}` : "حالة نهائية"}</span></div><div className="management-actions">{reservation.status === "PENDING_ACK" ? <><button className="primary-cta" type="button" disabled={Boolean(busy)} onClick={() => void transition(reservation.id, "acknowledge")}>تأكيد الحجز</button><button className="secondary-cta" type="button" disabled={Boolean(busy)} onClick={() => void transition(reservation.id, "fail")}>تعذر الحفظ</button></> : reservation.status === "ACTIVE" ? <><button className="primary-cta" type="button" disabled={Boolean(busy)} onClick={() => void transition(reservation.id, "ready")}>الدواء جاهز</button><button className="secondary-cta" type="button" disabled={Boolean(busy)} onClick={() => void transition(reservation.id, "fail")}>مشكلة في التنفيذ</button></> : reservation.status === "READY" ? <button className="primary-cta" type="button" disabled={Boolean(busy)} onClick={() => void transition(reservation.id, "complete")}>تأكيد الاستلام</button> : null}</div></article>)}</div>}
    </>
  );
}

export function PharmacySettingsPage() {
  const profile = useApi(async () => (await apiFetch<{ data: PharmacyProfile }>("/api/v1/pharmacy/profile")).data, []);
  const [message, setMessage] = useState("");
  if (profile.loading) return <LoadingState />;
  if (profile.error || !profile.data) return <ErrorState error={profile.error} retry={profile.reload} />;
  const data = profile.data;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const opensAt = String(form.get("opensAt"));
      const closesAt = String(form.get("closesAt"));
      const openingHours = Object.fromEntries(
        Array.from({ length: 7 }, (_, day) => [
          String(day),
          form.get(`day-${day}`) === "on" ? [[opensAt, closesAt]] : [],
        ]),
      );
      await apiFetch("/api/v1/pharmacy/settings", { method: "PUT", body: JSON.stringify({ openingHours, pickupEnabled: form.get("pickup") === "on", deliveryEnabled: form.get("delivery") === "on", acceptingRequests: form.get("accepting") === "on", operationalStatus: form.get("paused") === "on" ? "PAUSED" : "ACTIVE" }) });
      setMessage("تم حفظ إعدادات الفرع.");
      await profile.reload();
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "تعذر الحفظ."); }
  }
  return (
    <>
      <PageHeader eyebrow="الفرع" title="إعدادات التشغيل" description="أوقف الطلبات عند الازدحام بدل ترك المرضى بلا رد." />
      <form className="product-form" onSubmit={submit}><div className="settings-identity"><Icon name="store" size={25} /><div><strong>{data.name}</strong><span>{data.district} · {data.address}</span></div><StatusBadge status={data.verification_status} /></div><label className="toggle-field"><input name="accepting" type="checkbox" defaultChecked={data.accepting_requests} /><span>استقبال طلبات جديدة</span></label><label className="toggle-field"><input name="paused" type="checkbox" defaultChecked={data.operational_status === "PAUSED"} /><span>إيقاف الفرع مؤقتًا</span></label><label className="toggle-field"><input name="pickup" type="checkbox" defaultChecked={data.pickup_enabled} /><span>الاستلام متاح</span></label><label className="toggle-field"><input name="delivery" type="checkbox" defaultChecked={data.delivery_enabled} /><span>التوصيل متاح</span></label><div className="form-divider"><span>ساعات العمل</span></div><div className="form-row"><label className="form-field"><span>يفتح</span><input name="opensAt" type="time" defaultValue="08:00" required /></label><label className="form-field"><span>يغلق</span><input name="closesAt" type="time" defaultValue="23:59" required /></label></div><div className="weekday-grid">{["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"].map((day, index) => <label className="toggle-field" key={day}><input name={`day-${index}`} type="checkbox" defaultChecked={(data.opening_hours?.[String(index)] ?? []).length > 0} /><span>{day}</span></label>)}</div>{message ? <p className="inline-notice" role="status">{message}</p> : null}<button className="primary-cta" type="submit">حفظ الإعدادات</button></form>
    </>
  );
}
