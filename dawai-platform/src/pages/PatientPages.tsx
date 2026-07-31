import { useEffect, useState, type FormEvent } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "../app/router";
import { apiFetch, newIdempotencyKey } from "../api/client";
import { useApi } from "../app/useApi";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatusBadge,
} from "../components/AppShell";
import { Icon } from "../Icon";

interface MedicineRequest {
  id: string;
  public_reference: string;
  medicine_name: string;
  strength: string | null;
  dosage_form: string | null;
  quantity: number;
  urgency: string;
  status: string;
  area: string;
  radius_km: number;
  expires_at: string;
  created_at: string;
  offer_count: number;
  dispatched_count?: number;
  reservation?: Reservation | null;
}

interface Offer {
  id: string;
  offer_type: string;
  offered_brand: string;
  offered_strength: string;
  offered_form: string;
  available_quantity: number;
  price_iqd: number;
  pickup_enabled: boolean;
  delivery_enabled: boolean;
  preparation_minutes: number;
  note: string | null;
  expires_at: string;
  created_at: string;
  pharmacy_name: string;
  branch_name: string;
  district: string;
  address: string;
  distance_km: number;
  response_rate: number | null;
  average_response_seconds: number | null;
}

interface Reservation {
  id: string;
  public_reference: string;
  status: string;
  fulfillment_method?: "PICKUP" | "DELIVERY";
  acknowledgement_deadline: string;
  hold_expires_at: string | null;
  medicine_name?: string;
  offered_brand?: string;
  offered_strength?: string;
  offered_form?: string;
  price_iqd?: number;
  preparation_minutes?: number;
  pharmacy_name?: string;
  pharmacy_phone?: string;
  address?: string;
  district?: string;
  latitude?: number;
  longitude?: number;
  conversation_id?: string | null;
}

interface Pharmacy {
  id: string;
  pharmacy_name: string;
  branch_name: string;
  district: string;
  address: string;
  distanceKm: number;
  latitude: number;
  longitude: number;
  pickup_enabled: boolean;
  delivery_enabled: boolean;
  accepting_requests: boolean;
  response_rate: number | null;
  average_response_seconds: number | null;
}

function formatIqd(value: number) {
  return `${new Intl.NumberFormat("en-IQ").format(value)} د.ع`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ar-IQ", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

const offerPlural = new Intl.PluralRules("ar");
function offersLabel(count: number): string {
  const category = offerPlural.select(count);
  if (category === "zero") return "لا عروض بعد";
  if (category === "one") return "عرض واحد";
  if (category === "two") return "عرضان";
  if (category === "few") return `${count} عروض`;
  if (category === "many") return `${count} عرضًا`;
  return `${count} عرض`;
}

function remaining(value: string | null): string {
  if (!value) return "بانتظار تأكيد الصيدلية";
  const seconds = Math.max(0, Math.floor((new Date(value).getTime() - Date.now()) / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function PatientHomePage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const requests = useApi(async () => {
    const response = await apiFetch<{ data: MedicineRequest[] }>(
      "/api/v1/patient/requests?limit=5",
    );
    return response.data;
  }, []);

  function search(event: FormEvent) {
    event.preventDefault();
    if (query.trim()) navigate(`/patient/search?q=${encodeURIComponent(query.trim())}`);
  }

  const active = requests.data?.find((request) =>
    ["ACTIVE", "NO_MATCH", "HOLD_PENDING", "RESERVED", "READY"].includes(request.status),
  );
  return (
    <>
      <section className="patient-hero">
        <div>
          <p className="overline">طلب واحد يصل إلى الصيدليات المناسبة</p>
          <h1>ما الدواء الذي تحتاجه؟</h1>
          <p>ابحث أولًا، أو أرسل طلبًا لتحصل على تأكيد وسعر من صيدلية قريبة.</p>
          <form className="medicine-search" onSubmit={search}>
            <Icon name="search" size={21} />
            <label className="sr-only" htmlFor="patient-search">اسم الدواء</label>
            <input id="patient-search" dir="auto" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="مثال: Panadol Extra" />
            <button type="submit">بحث</button>
          </form>
          <div className="quick-actions">
            <Link to="/patient/requests/new?mode=scan"><Icon name="camera" size={20} /> صوّر الدواء</Link>
            <Link to="/patient/requests/new?mode=upload"><Icon name="upload" size={20} /> ارفع وصفة</Link>
            <Link to="/patient/requests/new"><Icon name="message" size={20} /> اكتب طلبك</Link>
          </div>
        </div>
        <div className="patient-promise">
          <Icon name="shield" size={28} />
          <strong>قرار الدواء للصيدلي، لا للخوارزمية.</strong>
          <p>نستخدم التقنية لتنظيم طلبك ومطابقته فقط. لا نشخّص ولا نقترح جرعة أو بديلًا تلقائيًا.</p>
        </div>
      </section>
      {requests.loading ? <LoadingState label="نراجع طلباتك النشطة…" /> : requests.error ? <ErrorState error={requests.error} retry={requests.reload} /> : active ? (
        <section className="active-request-card">
          <div><span className="live-dot" /><p><strong>لديك طلب نشط</strong><bdi>{active.medicine_name} {active.strength}</bdi></p></div>
          <StatusBadge status={active.status} />
          <Link className="primary-cta" to={`/patient/requests/${active.id}`}>متابعة الطلب</Link>
        </section>
      ) : null}
      <section className="home-explainer">
        <PageHeader eyebrow="كيف يعمل" title="من الحاجة إلى الحجز بثلاث خطوات" />
        <div className="explainer-grid">
          <article><span>1</span><Icon name="prescription" size={25} /><h2>صف الدواء</h2><p>بالاسم أو الصورة أو الوصفة.</p></article>
          <article><span>2</span><Icon name="bell" size={25} /><h2>نطلب التأكيد</h2><p>من الصيدليات المفتوحة والقريبة فقط.</p></article>
          <article><span>3</span><Icon name="reserve" size={25} /><h2>قارن واحجز</h2><p>السعر والجاهزية ووقت آخر تأكيد.</p></article>
        </div>
      </section>
    </>
  );
}

export function MedicineSearchPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [coords, setCoords] = useState({ lat: 33.3152, lng: 44.3661 });
  const [results, setResults] = useState<Array<{
    signal_id: string;
    pharmacy_name: string;
    district: string;
    state: string;
    source: string;
    observed_at: string;
    latest_price_iqd: number | null;
    distanceKm: number;
    pickup_enabled: boolean;
    delivery_enabled: boolean;
  }> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function runSearch(value = query) {
    if (value.trim().length < 2) return;
    setLoading(true);
    setError("");
    setParams({ q: value });
    try {
      const response = await apiFetch<{ data: typeof results }>(
        `/api/v1/availability?medicine=${encodeURIComponent(value)}&lat=${coords.lat}&lng=${coords.lng}&radiusKm=10`,
      );
      setResults(response.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر البحث.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (query) void runSearch(query);
  }, []);

  function useLocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) => setCoords({ lat: position.coords.latitude, lng: position.coords.longitude }),
      () => setError("تعذر الوصول إلى الموقع. نستخدم المنصور مؤقتًا ويمكنك إنشاء طلب وتعديل المنطقة."),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 },
    );
  }

  return (
    <>
      <PageHeader eyebrow="بحث مباشر — بلا إرسال طلب" title="ابحث عن توفر حديث" description="إشارة المخزون ليست حجزًا. اطلب تأكيدًا قبل الذهاب." actions={<button className="secondary-cta" type="button" onClick={useLocation}><Icon name="location" size={17} /> موقعي</button>} />
      <form className="search-page-form" onSubmit={(event) => { event.preventDefault(); void runSearch(); }}>
        <input dir="auto" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="اسم الدواء والقوة" required minLength={2} />
        <button className="primary-cta" type="submit" disabled={loading}>{loading ? "نبحث…" : "بحث"}</button>
      </form>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {loading ? <LoadingState label="نبحث في إشارات التوفر الحديثة…" /> : results && results.length === 0 ? (
        <EmptyState title="لا توجد إشارة حديثة" description="هذا لا يعني أن الدواء غير موجود. أرسل طلبًا ليجيبك الصيادلة مباشرة." action={<button className="primary-cta" type="button" onClick={() => navigate(`/patient/requests/new?medicine=${encodeURIComponent(query)}`)}>أنشئ طلبًا</button>} />
      ) : results ? (
        <div className="availability-list">
          {results.map((result) => (
            <article key={result.signal_id}>
              <div className="pharmacy-avatar"><Icon name="store" size={22} /></div>
              <div><h2>{result.pharmacy_name}</h2><p>{result.district} · {result.distanceKm.toFixed(1)} كم</p><span className="fresh-line"><span className="live-dot" /> تأكد {formatDate(result.observed_at)}</span></div>
              <StatusBadge status={result.state}>{result.source === "PHARMACIST_CONFIRMATION" ? "تأكيد صيدلي" : result.source === "MANUAL_STOCK" ? "إشارة يدوية" : "مزامنة مخزون"}</StatusBadge>
              <strong>{result.latest_price_iqd ? formatIqd(result.latest_price_iqd) : "السعر عند التأكيد"}</strong>
              <p className="fresh-line">آخر تحديث: {formatDate(result.observed_at)} · ليس ضمان مخزون حي</p>
              <div className="service-tags"><span>استلام</span></div>
            </article>
          ))}
        </div>
      ) : null}
    </>
  );
}

export function NewRequestPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [medicineName, setMedicineName] = useState(params.get("medicine") ?? "");
  const [presentationId, setPresentationId] = useState<string | undefined>();
  const [strength, setStrength] = useState("");
  const [dosageForm, setDosageForm] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [urgency, setUrgency] = useState("NOW");
  const [area, setArea] = useState("المنصور، بغداد");
  const [coords, setCoords] = useState({ lat: 33.3152, lng: 44.3661 });
  const [file, setFile] = useState<File | null>(null);
  const [attachmentKind, setAttachmentKind] = useState<"PRESCRIPTION" | "BOX_IMAGE">("PRESCRIPTION");
  const [prescriptionConsent, setPrescriptionConsent] = useState(false);
  const [permissionState, setPermissionState] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const mode = params.get("mode");

  function locate() {
    setPermissionState("جارٍ تحديد الموقع…");
    navigator.geolocation?.getCurrentPosition(
      (position) => {
        setCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
        setPermissionState("تم استخدام موقعك التقريبي للمطابقة.");
      },
      () => setPermissionState("لم يُسمح بالموقع. أدخل المنطقة وسنستخدم مركزها التقريبي."),
      { timeout: 8000, maximumAge: 300000 },
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (file && attachmentKind === "PRESCRIPTION" && !prescriptionConsent) {
        throw new Error("وافق على مشاركة الوصفة مع الصيدلية المختارة فقط قبل الإرسال.");
      }
      let prescriptionFileId: string | undefined;
      if (file) {
        const form = new FormData();
        form.set("purpose", "PRESCRIPTION");
        form.set("attachmentKind", attachmentKind);
        form.set("file", file);
        const uploaded = await apiFetch<{ data: { id: string } }>("/api/v1/files", {
          method: "POST",
          body: form,
        });
        prescriptionFileId = uploaded.data.id;
      }
      const response = await apiFetch<{ data: MedicineRequest }>("/api/v1/patient/requests", {
        method: "POST",
        idempotencyKey: newIdempotencyKey(),
        body: JSON.stringify({
          medicineName,
          presentationId,
          strength: strength || undefined,
          dosageForm: dosageForm || undefined,
          quantity,
          urgency,
          prescriptionFileId,
          prescriptionConsent:
            prescriptionFileId && attachmentKind === "PRESCRIPTION" ? true : undefined,
          attachmentKind: prescriptionFileId ? attachmentKind : undefined,
          area,
          latitude: coords.lat,
          longitude: coords.lng,
          pickupPreferred: true,
          deliveryPreferred: false,
        }),
      });
      navigate(`/patient/requests/${response.data.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر إرسال الطلب.");
    } finally {
      setBusy(false);
    }
  }

  const [step, setStep] = useState(0);
  const steps = ["الدواء", "الكمية والوصفة", "الموقع والتأكيد"] as const;
  const stepValid =
    step === 0
      ? medicineName.trim().length >= 2
      : step === 1
        ? !(file && attachmentKind === "PRESCRIPTION" && !prescriptionConsent)
        : area.trim().length > 0;

  return (
    <>
      <PageHeader eyebrow="طلب دواء جديد" title="أخبرنا بما تحتاجه" description="لا نخمّن دواءً من وصف غامض. اكتب ما تعرفه أو أرفق صورة ليراجعها الصيدلي. المرحلة التجريبية: الاستلام من الصيدلية فقط." />
      <ol className="wizard-steps">
        {steps.map((label, index) => (
          <li key={label} aria-current={index === step ? "step" : undefined} className={index < step ? "done" : ""}>
            <span className="n">{index + 1}</span>
            {label}
          </li>
        ))}
      </ol>
      <form className="product-form" onSubmit={submit}>
        <div className="wizard-pane" hidden={step !== 0}>
          <label className="form-field"><span>اسم الدواء أو وصف واضح</span><textarea dir="auto" value={medicineName} onChange={(event) => { setMedicineName(event.target.value); setPresentationId(undefined); }} required minLength={2} placeholder="مثال: Augmentin 625 mg" /></label>
          <label className="form-field"><span>القوة (إن عُرفت)</span><input dir="ltr" inputMode="text" value={strength} onChange={(event) => setStrength(event.target.value)} placeholder="625 mg" /></label>
          <label className="form-field"><span>الشكل</span><input value={dosageForm} onChange={(event) => setDosageForm(event.target.value)} placeholder="أقراص / شراب" /></label>
        </div>
        <div className="wizard-pane" hidden={step !== 1}>
          <label className="form-field"><span>الكمية</span>
            <div className="quantity-stepper">
              <button type="button" aria-label="إنقاص الكمية" onClick={() => setQuantity((current) => Math.max(1, current - 1))}>−</button>
              <input type="number" min={1} max={20} inputMode="numeric" dir="ltr" value={quantity} onChange={(event) => setQuantity(Math.min(20, Math.max(1, Number(event.target.value) || 1)))} aria-label="الكمية" />
              <button type="button" aria-label="زيادة الكمية" onClick={() => setQuantity((current) => Math.min(20, current + 1))}>＋</button>
            </div>
          </label>
          <label className="form-field"><span>متى تحتاجه؟</span><select value={urgency} onChange={(event) => setUrgency(event.target.value)}><option value="NOW">الآن</option><option value="TODAY">اليوم</option><option value="TOMORROW">غدًا</option></select></label>
          <label className="upload-zone compact-upload">
            <input type="file" accept="image/png,image/jpeg,image/webp" capture={mode === "scan" ? "environment" : undefined} onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
            <Icon name={mode === "scan" ? "camera" : "upload"} size={27} />
            <strong>{file?.name ?? "صورة علبة أو وصفة (اختياري)"}</strong>
            <span>تُفحص الصورة، تزال بيانات الموقع منها، وتُخزّن مشفرة. لا تُكشف قبل اختيار صيدلية وتأكيد الحجز.</span>
          </label>
          {file ? (
            <label className="form-field"><span>نوع الصورة</span>
              <select value={attachmentKind} onChange={(event) => setAttachmentKind(event.target.value as "PRESCRIPTION" | "BOX_IMAGE")}>
                <option value="PRESCRIPTION">وصفة طبية</option>
                <option value="BOX_IMAGE">صورة علبة / عبوة</option>
              </select>
            </label>
          ) : null}
          {file && attachmentKind === "PRESCRIPTION" ? <label className="confirmation-check"><input type="checkbox" checked={prescriptionConsent} onChange={(event) => setPrescriptionConsent(event.target.checked)} required /><span><Icon name="check" size={14} /></span>أوافق على مشاركة صورة الوصفة فقط مع الصيدلية التي أختارها وبعد تأكيد الحجز.</label> : null}
        </div>
        <div className="wizard-pane" hidden={step !== 2}>
          <div className="location-box">
            <label className="form-field"><span>المنطقة</span><input value={area} onChange={(event) => setArea(event.target.value)} required /></label>
            <button type="button" className="secondary-cta" onClick={locate}><Icon name="location" size={18} /> استخدم موقعي</button>
            {permissionState ? <p role="status">{permissionState}</p> : null}
          </div>
          <div className="wizard-summary" aria-label="ملخص الطلب">
            <div><span>الدواء</span><strong dir="auto">{medicineName || "—"}{strength ? <bdi dir="ltr"> {strength}</bdi> : null}</strong></div>
            <div><span>الكمية</span><strong>{quantity}</strong></div>
            <div><span>متى</span><strong>{urgency === "NOW" ? "الآن" : urgency === "TODAY" ? "اليوم" : "غدًا"}</strong></div>
            <div><span>المرفق</span><strong>{file ? (attachmentKind === "PRESCRIPTION" ? "وصفة" : "صورة علبة") : "بدون"}</strong></div>
          </div>
          <div className="safety-note"><Icon name="shield" size={20} /><p>الصورة للمراجعة وليست وصفة يصدرها دوائي. لن تُكشف للصيدليات قبل حجز نشط ومؤكد. التوصيل خارج نطاق الـMVP الحالي.</p></div>
        </div>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="action-bar">
          <div className="action-bar-row">
            {/* One persistent element that changes role between steps: swapping
                two buttons in place lets a single tap fall through from
                "متابعة" onto "إرسال" — an accidental submit. */}
            <button
              className="primary-cta"
              type={step < 2 ? "button" : "submit"}
              disabled={step < 2 ? !stepValid : busy || !stepValid}
              onClick={step < 2 ? () => setStep((current) => current + 1) : undefined}
            >
              {step < 2 ? "متابعة" : busy ? "جارٍ الإرسال الآمن…" : "إرسال الطلب للصيدليات القريبة"}
            </button>
            {step > 0 ? <button className="secondary-cta" type="button" onClick={() => setStep((current) => current - 1)}>رجوع</button> : null}
          </div>
        </div>
      </form>
    </>
  );
}

export function RequestHistoryPage() {
  const requests = useApi(async () => (await apiFetch<{ data: MedicineRequest[] }>("/api/v1/patient/requests")).data, []);
  if (requests.loading) return <LoadingState />;
  if (requests.error) return <ErrorState error={requests.error} retry={requests.reload} />;
  return (
    <>
      <PageHeader eyebrow="السجل" title="طلبات الدواء" description="كل حالة هنا صادرة من الخادم وليست محاكاة." actions={<Link className="primary-cta" to="/patient/requests/new"><Icon name="plus" size={18} /> طلب جديد</Link>} />
      {!requests.data?.length ? <EmptyState title="لا توجد طلبات بعد" description="أنشئ أول طلب وسيظهر تقدمه وعروضه هنا." action={<Link className="primary-cta" to="/patient/requests/new">إنشاء طلب</Link>} /> : (
        <div className="request-history-list">{requests.data.map((request) => <Link key={request.id} to={`/patient/requests/${request.id}`}><div><StatusBadge status={request.status} /><h2 dir="auto">{request.medicine_name}</h2><p>{request.area} · {formatDate(request.created_at)}</p></div><div><strong>{request.offer_count ?? 0}</strong><span>عروض</span><Icon name="chevron" size={18} /></div></Link>)}</div>
      )}
    </>
  );
}

export function RequestDetailPage() {
  const { requestId = "" } = useParams();
  const navigate = useNavigate();
  const request = useApi(async () => (await apiFetch<{ data: MedicineRequest }>(`/api/v1/patient/requests/${requestId}`)).data, [requestId], 8000);
  const [offerSort, setOfferSort] = useState<"best" | "distance" | "price">("best");
  const offers = useApi(async () => (await apiFetch<{ data: Offer[] }>(`/api/v1/patient/requests/${requestId}/offers?sort=${offerSort}`)).data, [requestId, offerSort], 8000);
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState("");
  const [candidates, setCandidates] = useState<Array<{ id: string; brand_name: string; strength: string; dosage_form: string; pack_size: string | null }>>([]);
  const item = request.data;

  // Hooks must run unconditionally — never after early returns.
  useEffect(() => {
    if (!item || item.status !== "NEEDS_CLARIFICATION") return;
    void apiFetch<{ data: Array<{ id: string; brand_name: string; strength: string; dosage_form: string; pack_size: string | null }> }>(
      `/api/v1/medicines/search?q=${encodeURIComponent(item.medicine_name)}`,
    ).then((response) => setCandidates(response.data)).catch(() => setCandidates([]));
  }, [item?.status, item?.medicine_name]);

  if (request.loading && !item) return <LoadingState label="نحمّل حالة الطلب الحقيقية…" />;
  if (!item) return <ErrorState error={request.error} retry={request.reload} />;

  async function clarify(presentationId: string) {
    setBusy(presentationId);
    setActionError("");
    try {
      await apiFetch(`/api/v1/patient/requests/${requestId}/clarify`, {
        method: "POST",
        body: JSON.stringify({ presentationId }),
      });
      await Promise.all([request.reload(), offers.reload()]);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "تعذر تثبيت هوية الدواء.");
    } finally {
      setBusy("");
    }
  }

  async function selectOffer(offer: Offer) {
    setBusy(offer.id);
    setActionError("");
    try {
      const response = await apiFetch<{ data: Reservation }>(`/api/v1/patient/requests/${requestId}/reservations`, {
        method: "POST",
        idempotencyKey: newIdempotencyKey(),
        body: JSON.stringify({
          offerId: offer.id,
          fulfillmentMethod: "PICKUP",
        }),
      });
      navigate(`/patient/reservations/${response.data.id}`);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "تعذر اختيار العرض.");
    } finally {
      setBusy("");
    }
  }

  async function expand(radiusKm: 5 | 10) {
    setBusy("expand");
    try {
      await apiFetch(`/api/v1/patient/requests/${requestId}/expand`, { method: "POST", body: JSON.stringify({ radiusKm }) });
      await Promise.all([request.reload(), offers.reload()]);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "تعذر توسيع النطاق.");
    } finally { setBusy(""); }
  }

  async function cancel() {
    setBusy("cancel");
    try {
      await apiFetch(`/api/v1/patient/requests/${requestId}/cancel`, { method: "POST", body: JSON.stringify({}) });
      await request.reload();
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : "تعذر الإلغاء."); }
    finally { setBusy(""); }
  }

  return (
    <>
      <PageHeader eyebrow={`طلب ${item.public_reference}`} title={item.medicine_name} description={`${item.strength ?? ""} · الكمية ${item.quantity} · ${item.area}`} actions={<StatusBadge status={item.status} />} />
      <div className="request-live-panel">
        <div className="live-radar"><span><Icon name="search" size={22} /></span></div>
        <div><strong>{item.status === "NEEDS_CLARIFICATION" ? "ثبّت هوية الدواء قبل الإرسال" : item.status === "ACTIVE" ? "ننتظر ردود الصيدليات" : item.status === "NO_MATCH" ? "لا توجد استجابة في النطاق الحالي" : item.status === "HOLD_PENDING" ? "بانتظار تأكيد الحجز من الصيدلية" : item.status === "RESERVED" || item.status === "READY" ? "تم تأكيد الحجز" : "اكتملت هذه المرحلة"}</strong><p>أُرسل إلى {item.dispatched_count ?? 0} صيدليات · النطاق {item.radius_km} كم</p><small>ينتهي الطلب: {formatDate(item.expires_at)}</small></div>
      </div>
      {item.status === "NEEDS_CLARIFICATION" ? (
        <section className="offers-section">
          <PageHeader eyebrow="توضيح مطلوب" title="أي عرض دوائي تقصد؟" description="وجدنا أكثر من احتمال. لن نخمن القوة أو الشكل نيابةً عنك." />
          <div className="real-offer-list">
            {candidates.map((candidate) => (
              <article key={candidate.id}>
                <div className="offer-heading"><div><h2 dir="auto">{candidate.brand_name}</h2><p dir="ltr">{candidate.strength} · {candidate.dosage_form}{candidate.pack_size ? ` · ${candidate.pack_size}` : ""}</p></div></div>
                <button className="primary-cta" type="button" disabled={Boolean(busy)} onClick={() => void clarify(candidate.id)}>{busy === candidate.id ? "جارٍ التثبيت…" : "هذا هو المطلوب"}</button>
              </article>
            ))}
          </div>
        </section>
      ) : null}
      {item.reservation ? <Link className="reservation-banner" to={`/patient/reservations/${item.reservation.id}`}><Icon name="reserve" size={22} /><div><strong>لديك حجز مرتبط بهذا الطلب</strong><span>الحالة: {item.reservation.status}</span></div><Icon name="chevron" size={19} /></Link> : null}
      <section className="offers-section">
        <PageHeader eyebrow="العروض المؤكدة" title={offersLabel(offers.data?.length ?? 0)} description="التوفر والسعر من الصيدلية وفي الوقت الموضح." actions={
          <label className="form-field compact-sort"><span>ترتيب</span>
            <select value={offerSort} onChange={(event) => setOfferSort(event.target.value as "best" | "distance" | "price")}>
              <option value="best">الأنسب</option>
              <option value="distance">الأقرب</option>
              <option value="price">الأرخص</option>
            </select>
          </label>
        } />
        {offers.loading && !offers.data ? <LoadingState label="نراجع العروض…" /> : offers.error && !offers.data ? <ErrorState error={offers.error} retry={offers.reload} /> : !offers.data?.length ? (
          <EmptyState title="لم يصل عرض صالح بعد" description="يمكنك الانتظار أو توسيع البحث يدويًا. عدم الرد لا يعني عدم وجود الدواء." action={item.radius_km < 10 && ["ACTIVE", "NO_MATCH"].includes(item.status) ? <button className="secondary-cta" type="button" disabled={busy === "expand"} onClick={() => void expand(item.radius_km === 2 ? 5 : 10)}>توسيع إلى {item.radius_km === 2 ? 5 : 10} كم</button> : undefined} />
        ) : (
          <div className="real-offer-list">{offers.data.map((offer) => <article key={offer.id}>
            <div className="offer-heading"><div className="pharmacy-avatar"><Icon name="store" size={21} /></div><div><h2>{offer.pharmacy_name}</h2><p>{offer.district} · {Number(offer.distance_km).toFixed(1)} كم</p></div><StatusBadge status={offer.offer_type}>{offer.offer_type === "EXACT" ? "مطابق" : offer.offer_type === "ALTERNATIVE_REVIEW_REQUIRED" ? "بديل للمراجعة" : "جزئي"}</StatusBadge></div>
            <div className="offer-facts"><div><span>السعر</span><strong>{formatIqd(offer.price_iqd)}</strong></div><div><span>التجهيز</span><strong>{offer.preparation_minutes === 0 ? "جاهز الآن" : `${offer.preparation_minutes} دقيقة`}</strong></div><div><span>آخر تأكيد</span><strong>{formatDate(offer.created_at)}</strong></div></div>
            {offer.note ? <p className="offer-note">{offer.note}</p> : null}
            <div className="service-tags"><span>استلام من الصيدلية</span></div>
            <p className="fresh-line">أكدت الصيدلية هذا العرض في {formatDate(offer.created_at)} · صالح حتى {formatDate(offer.expires_at)}</p>
            <button className={offer.offer_type === "ALTERNATIVE_REVIEW_REQUIRED" || offer.offer_type === "ORDERABLE" ? "secondary-cta" : "primary-cta"} type="button" disabled={busy === offer.id || item.status === "NEEDS_CLARIFICATION"} onClick={() => offer.offer_type === "ALTERNATIVE_REVIEW_REQUIRED" ? setActionError("البديل لا يُحجز تلقائيًا. انتظر حجزًا مطابقًا أو تواصل مع الصيدلي بعد اختيار آمن.") : offer.offer_type === "ORDERABLE" ? setActionError("العرض القابل للطلب لا يُحفظ بحجز 15 دقيقة. اختر عرضًا جاهزًا.") : void selectOffer(offer)}>{busy === offer.id ? "جارٍ إرسال الاختيار…" : offer.offer_type === "ALTERNATIVE_REVIEW_REQUIRED" ? "يتطلب مراجعة صيدلي" : offer.offer_type === "ORDERABLE" ? "غير قابل للحجز الفوري" : "حجز للاستلام"}</button>
          </article>)}</div>
        )}
      </section>
      {actionError ? <p className="form-error" role="alert">{actionError}</p> : null}
      {["ACTIVE", "NO_MATCH", "HOLD_PENDING", "NEEDS_CLARIFICATION", "RESERVED", "READY"].includes(item.status) ? <button className="danger-link" type="button" disabled={busy === "cancel"} onClick={() => void cancel()}>إلغاء الطلب</button> : null}
    </>
  );
}

export function ReservationPage() {
  const { reservationId = "" } = useParams();
  const reservation = useApi(async () => (await apiFetch<{ data: Reservation }>(`/api/v1/patient/reservations/${reservationId}`)).data, [reservationId], 4000);
  const [now, setNow] = useState(Date.now());
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Array<{ id: string; sender_name: string; body: string; created_at: string }>>([]);
  const [error, setError] = useState("");
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  useEffect(() => {
    if (!reservation.data?.conversation_id) return;
    void apiFetch<{ data: typeof messages }>(`/api/v1/conversations/${reservation.data.conversation_id}/messages`).then((response) => setMessages(response.data));
  }, [reservation.data?.conversation_id]);
  if (reservation.loading && !reservation.data) return <LoadingState label="نراجع تأكيد الصيدلية…" />;
  if (!reservation.data) return <ErrorState error={reservation.error} retry={reservation.reload} />;
  const item = reservation.data;
  void now;

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    if (!item.conversation_id || !message.trim()) return;
    try {
      const response = await apiFetch<{ data: { id: string; body: string; createdAt: string } }>(`/api/v1/conversations/${item.conversation_id}/messages`, { method: "POST", body: JSON.stringify({ body: message }) });
      setMessages((current) => [...current, { id: response.data.id, sender_name: "أنت", body: response.data.body, created_at: response.data.createdAt }]);
      setMessage("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر إرسال الرسالة."); }
  }

  return (
    <>
      <PageHeader eyebrow={`حجز ${item.public_reference}`} title={item.status === "PENDING_ACK" ? "بانتظار تأكيد الصيدلية" : item.status === "ACTIVE" ? "دواؤك محفوظ مؤقتًا" : item.status === "READY" ? "دواؤك جاهز للاستلام" : item.status === "COMPLETED" ? "اكتمل الاستلام" : "حالة الحجز"} description="العد التنازلي يبدأ فقط بعد أن تؤكد الصيدلية حفظ الكمية." actions={<StatusBadge status={item.status} />} />
      <section className="reservation-card">
        <div className="reservation-countdown"><Icon name="clock" size={22} /><span>{item.status === "PENDING_ACK" ? "مهلة رد الصيدلية" : "الوقت المتبقي للحجز"}</span><strong dir="ltr">{remaining(item.status === "PENDING_ACK" ? item.acknowledgement_deadline : item.hold_expires_at)}</strong></div>
        <div className="reservation-grid"><div><span>الدواء</span><strong dir="auto">{item.offered_brand} {item.offered_strength}</strong></div><div><span>السعر</span><strong>{item.price_iqd !== undefined ? formatIqd(item.price_iqd) : "—"}</strong></div><div><span>طريقة التنفيذ</span><strong>{item.fulfillment_method === "DELIVERY" ? "توصيل" : "استلام من الصيدلية"}</strong></div><div><span>الصيدلية</span><strong>{item.pharmacy_name ?? "بانتظار التأكيد"}</strong></div><div><span>العنوان</span><strong>{item.address ?? "يظهر بعد التأكيد"}</strong></div></div>
        {["ACTIVE", "READY"].includes(item.status) ? <div className="reservation-contact"><a className="primary-cta" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${item.latitude},${item.longitude}`}><Icon name="directions" size={18} /> الاتجاهات</a><a className="secondary-cta" href={`tel:${item.pharmacy_phone}`}><Icon name="phone" size={18} /> اتصال</a></div> : null}
      </section>
      {item.conversation_id && ["ACTIVE", "READY"].includes(item.status) ? <section className="conversation-panel"><h2>محادثة الحجز</h2><div className="message-list">{messages.length ? messages.map((entry) => <div key={entry.id}><strong>{entry.sender_name}</strong><p>{entry.body}</p><time>{formatDate(entry.created_at)}</time></div>) : <p>لا توجد رسائل. استخدم المحادثة للتنسيق فقط، وليس للاستشارة الطبية.</p>}</div><form onSubmit={sendMessage}><input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="رسالة قصيرة للصيدلية" maxLength={1000} /><button className="primary-cta" type="submit">إرسال</button></form></section> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
    </>
  );
}

export function NearbyPharmaciesPage() {
  const [coords, setCoords] = useState({ lat: 33.3152, lng: 44.3661 });
  const [display, setDisplay] = useState<"list" | "map">("list");
  const [message, setMessage] = useState("");
  const pharmacies = useApi(async () => (await apiFetch<{ data: Pharmacy[] }>(`/api/v1/pharmacies?lat=${coords.lat}&lng=${coords.lng}&radiusKm=10`)).data, [coords.lat, coords.lng]);
  function locate() {
    navigator.geolocation?.getCurrentPosition((position) => setCoords({ lat: position.coords.latitude, lng: position.coords.longitude }), () => setMessage("تعذر استخدام الموقع. نعرض منطقة المنصور مؤقتًا."), { timeout: 8000 });
  }
  async function save(branchId: string) {
    try { await apiFetch(`/api/v1/patient/saved-pharmacies/${branchId}`, { method: "POST", body: JSON.stringify({}) }); setMessage("تم حفظ الصيدلية."); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "تعذر الحفظ."); }
  }
  return (
    <>
      <PageHeader eyebrow="الدليل الموثق" title="صيدليات قريبة منك" description="المسافة والنشاط لا يعنيان توفر دواء محدد." actions={<><button className="secondary-cta" type="button" onClick={locate}><Icon name="location" size={17} /> موقعي</button><div className="display-switch"><button className={display === "list" ? "active" : ""} type="button" onClick={() => setDisplay("list")}><Icon name="list" size={17} /> قائمة</button><button className={display === "map" ? "active" : ""} type="button" onClick={() => setDisplay("map")}><Icon name="map" size={17} /> خريطة</button></div></>} />
      {message ? <p className="inline-notice" role="status">{message}</p> : null}
      {pharmacies.loading ? <LoadingState /> : pharmacies.error ? <ErrorState error={pharmacies.error} retry={pharmacies.reload} /> : !pharmacies.data?.length ? <EmptyState title="لا توجد صيدليات معتمدة ضمن النطاق" description="جرّب موقعًا آخر أو وسّع النطاق لاحقًا." /> : <>
        {display === "map" ? <div className="map-panel real-map">{pharmacies.data.map((pharmacy, index) => <a key={pharmacy.id} className="map-pin" style={{ "--x": `${20 + ((index * 27) % 65)}%`, "--y": `${22 + ((index * 19) % 60)}%` } as React.CSSProperties} href={`https://www.google.com/maps/search/?api=1&query=${pharmacy.latitude},${pharmacy.longitude}`} target="_blank" rel="noreferrer" aria-label={pharmacy.pharmacy_name}><Icon name="store" size={17} /><span>{index + 1}</span></a>)}</div> : null}
        <div className="pharmacy-directory">{pharmacies.data.map((pharmacy, index) => <article className="directory-card" key={pharmacy.id}><span className="directory-index">{index + 1}</span><div className="pharmacy-avatar"><Icon name="store" size={22} /></div><div className="directory-main"><div className="card-title-line"><h2>{pharmacy.pharmacy_name}</h2><Icon name="shield" size={16} /></div><p>{pharmacy.district} · {pharmacy.address}</p><div className="service-tags">{pharmacy.pickup_enabled ? <span>استلام</span> : null}{pharmacy.delivery_enabled ? <span>توصيل</span> : null}</div><div className="fresh-line"><span className="live-dot" /> {pharmacy.accepting_requests ? "تستقبل الطلبات" : "متوقفة مؤقتًا"}</div></div><strong className="distance">{pharmacy.distanceKm.toFixed(1)} كم</strong><div className="directory-actions"><button type="button" onClick={() => void save(pharmacy.id)} aria-label={`حفظ ${pharmacy.pharmacy_name}`}><Icon name="reserve" size={18} /></button><a href={`https://www.google.com/maps/search/?api=1&query=${pharmacy.latitude},${pharmacy.longitude}`} target="_blank" rel="noreferrer" aria-label={`اتجاهات ${pharmacy.pharmacy_name}`}><Icon name="directions" size={18} /></a></div></article>)}</div>
      </>}
    </>
  );
}

export function PatientProfilePage() {
  const profile = useApi(async () => (await apiFetch<{ data: { name: string; email: string; phone: string | null; default_area: string | null; latitude: number | null; longitude: number | null; notification_preferences: { inApp: boolean; push: boolean } } }>("/api/v1/patient/profile")).data, []);
  const [saved, setSaved] = useState("");
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  async function deleteAccount() {
    setDeleting(true);
    try {
      await apiFetch("/api/v1/auth/account/delete", { method: "POST", body: JSON.stringify({}) });
      window.location.assign("/");
    } catch (cause) {
      setSaved(cause instanceof Error ? cause.message : "تعذر حذف الحساب.");
      setDeleting(false);
    }
  }
  if (profile.loading) return <LoadingState />;
  if (profile.error || !profile.data) return <ErrorState error={profile.error} retry={profile.reload} />;
  const data = profile.data;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await apiFetch("/api/v1/patient/profile", { method: "PUT", body: JSON.stringify({ name: form.get("name"), phone: form.get("phone") || null, defaultArea: form.get("area") || null, latitude: data.latitude, longitude: data.longitude, notificationPreferences: { inApp: true, push: form.get("push") === "on" } }) });
      setSaved("تم حفظ الملف الشخصي.");
      await profile.reload();
    } catch (cause) { setSaved(cause instanceof Error ? cause.message : "تعذر الحفظ."); }
  }
  return (
    <>
      <PageHeader eyebrow="الحساب" title="ملف المريض" description="نحتفظ بالحد الأدنى اللازم لإدارة طلباتك." />
      <form className="product-form" onSubmit={submit}><label className="form-field"><span>الاسم</span><input name="name" defaultValue={data.name} required /></label><label className="form-field"><span>البريد</span><input dir="ltr" value={data.email} disabled /></label><label className="form-field"><span>الهاتف</span><input name="phone" defaultValue={data.phone ?? ""} /></label><label className="form-field"><span>المنطقة الافتراضية</span><input name="area" defaultValue={data.default_area ?? ""} /></label><label className="toggle-field"><input name="push" type="checkbox" defaultChecked={data.notification_preferences.push} /><span>إشعارات الدفع عند تفعيلها على هذا الجهاز</span></label><Link className="secondary-cta" to="/patient/saved-pharmacies"><Icon name="reserve" size={18} /> إدارة الصيدليات المحفوظة</Link>{saved ? <p className="inline-notice" role="status">{saved}</p> : null}<button className="primary-cta" type="submit">حفظ التغييرات</button></form>
      <section className="danger-zone" aria-labelledby="delete-account-title">
        <h2 id="delete-account-title">حذف الحساب</h2>
        <p>يعطّل الحساب ويجدول حذف بياناتك وفق <Link to="/legal/retention">سياسة الاحتفاظ</Link>. لا يمكن التراجع.</p>
        {deleteArmed ? (
          <div className="action-bar-row">
            <button className="danger-link" type="button" disabled={deleting} onClick={() => void deleteAccount()}>{deleting ? "جارٍ الحذف…" : "تأكيد حذف الحساب نهائيًا"}</button>
            <button className="secondary-cta" type="button" disabled={deleting} onClick={() => setDeleteArmed(false)}>تراجع</button>
          </div>
        ) : (
          <button className="danger-link" type="button" onClick={() => setDeleteArmed(true)}>حذف حسابي</button>
        )}
      </section>
    </>
  );
}

export function SavedPharmaciesPage() {
  const saved = useApi(async () => (await apiFetch<{ data: Array<{ id: string; pharmacy_name: string; branch_name: string; district: string; address: string; pickup_enabled: boolean; delivery_enabled: boolean }> }>("/api/v1/patient/saved-pharmacies")).data, []);
  if (saved.loading) return <LoadingState />;
  if (saved.error) return <ErrorState error={saved.error} retry={saved.reload} />;
  async function remove(branchId: string) {
    await apiFetch(`/api/v1/patient/saved-pharmacies/${branchId}`, { method: "DELETE", body: JSON.stringify({}) });
    await saved.reload();
  }
  return (
    <>
      <PageHeader eyebrow="المفضلة" title="الصيدليات المحفوظة" description="اختصار للوصول إلى الفروع التي تثق بها، وليس دليلًا على مخزون حالي." />
      {!saved.data?.length ? <EmptyState title="لم تحفظ صيدلية بعد" description="احفظ فرعًا من صفحة الصيدليات القريبة." action={<Link className="primary-cta" to="/patient/pharmacies">استكشاف الصيدليات</Link>} /> : <div className="admin-list">{saved.data.map((pharmacy) => <article key={pharmacy.id}><div className="pharmacy-avatar"><Icon name="store" size={21} /></div><div><h2>{pharmacy.pharmacy_name}</h2><p>{pharmacy.district} · {pharmacy.address}</p><div className="service-tags">{pharmacy.pickup_enabled ? <span>استلام</span> : null}{pharmacy.delivery_enabled ? <span>توصيل</span> : null}</div></div><button className="danger-link" type="button" onClick={() => void remove(pharmacy.id)}>إزالة</button></article>)}</div>}
    </>
  );
}

export function NotificationsPage() {
  const notifications = useApi(async () => (await apiFetch<{ data: Array<{ id: string; title: string; body: string; event_type: string; resource_type: string | null; resource_id: string | null; read_at: string | null; created_at: string }> }>("/api/v1/notifications")).data, []);
  if (notifications.loading) return <LoadingState />;
  if (notifications.error) return <ErrorState error={notifications.error} retry={notifications.reload} />;
  async function markRead(id: string) { await apiFetch(`/api/v1/notifications/${id}/read`, { method: "POST", body: JSON.stringify({}) }); await notifications.reload(); }
  return (
    <>
      <PageHeader eyebrow="التحديثات" title="الإشعارات" description="لا نضع اسم الدواء في إشعارات شاشة القفل." />
      {!notifications.data?.length ? <EmptyState title="لا توجد إشعارات" description="ستظهر العروض وتحديثات الحجز هنا." /> : <div className="notification-list">{notifications.data.map((notification) => <button key={notification.id} className={notification.read_at ? "read" : ""} type="button" onClick={() => void markRead(notification.id)}><span className="notification-icon"><Icon name="bell" size={19} /></span><div><strong>{notification.title}</strong><p>{notification.body}</p><time>{formatDate(notification.created_at)}</time></div>{!notification.read_at ? <span className="unread-dot" /> : null}</button>)}</div>}
    </>
  );
}
