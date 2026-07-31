import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiFetch } from "../api/client";
import { useApi } from "../app/useApi";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatusBadge,
} from "../components/AppShell";
import { Icon } from "../Icon";

function asDate(value: string) {
  return new Intl.DateTimeFormat("ar-IQ", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function AdminDashboardPage() {
  const dashboard = useApi(async () => (await apiFetch<{ data: Record<string, number> }>("/api/v1/admin/dashboard")).data, []);
  if (dashboard.loading) return <LoadingState />;
  if (dashboard.error || !dashboard.data) return <ErrorState error={dashboard.error} retry={dashboard.reload} />;
  const data = dashboard.data;
  return (
    <>
      <PageHeader eyebrow="مركز العمليات" title="إدارة دوائي" description="التحقق والثقة وسلامة دورة الطلب من مكان واحد." />
      <div className="metric-grid admin-metrics"><article><span>مستخدمون نشطون</span><strong>{data.active_users}</strong></article><article><span>بانتظار التحقق</span><strong>{data.pending_verifications}</strong></article><article><span>صيدليات معتمدة</span><strong>{data.verified_pharmacies}</strong></article><article><span>طلبات نشطة</span><strong>{data.active_requests}</strong></article><article><span>مكتملة اليوم</span><strong>{data.completed_today}</strong></article><article><span>بلاغات مفتوحة</span><strong>{data.open_reports}</strong></article></div>
      <div className="admin-quick-grid"><Link to="/admin/verifications"><Icon name="shield" size={25} /><strong>مراجعة الصيدليات</strong><span>{data.pending_verifications} ملفات تنتظر قرارًا</span></Link><Link to="/admin/requests"><Icon name="prescription" size={25} /><strong>تتبع الطلبات</strong><span>Dispatch → Offer → Reservation</span></Link><Link to="/admin/reports"><Icon name="bell" size={25} /><strong>البلاغات</strong><span>مراجعة السلوك والمشكلات</span></Link></div>
    </>
  );
}

interface Verification {
  id: string;
  name: string;
  pharmacist_name: string;
  license_number: string;
  license_issuer: string;
  verification_status: string;
  branch_name: string;
  governorate: string;
  district: string;
  address: string;
  owner_name: string;
  owner_email: string;
  document_count: number;
  created_at: string;
}

export function VerificationQueuePage() {
  const [status, setStatus] = useState("PENDING");
  const queue = useApi(async () => (await apiFetch<{ data: Verification[] }>(`/api/v1/admin/verifications?status=${status}`)).data, [status]);
  const [message, setMessage] = useState("");
  async function approve(id: string) {
    setMessage("");
    try { await apiFetch(`/api/v1/admin/verifications/${id}/approve`, { method: "POST", body: JSON.stringify({}) }); setMessage("تم اعتماد الصيدلية."); await queue.reload(); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "تعذر الاعتماد."); }
  }
  async function reject(id: string) {
    const reason = window.prompt("اكتب سببًا واضحًا يمكن للصيدلية تصحيحه:");
    if (!reason) return;
    try { await apiFetch(`/api/v1/admin/verifications/${id}/reject`, { method: "POST", body: JSON.stringify({ reason }) }); setMessage("تم إرسال القرار للصيدلية."); await queue.reload(); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "تعذر الرفض."); }
  }
  return (
    <>
      <PageHeader eyebrow="التحقق" title="طلبات اعتماد الصيدليات" description="لا تحصل أي صيدلية على شارة موثقة قبل قرار إداري مسجل." actions={<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="PENDING">بانتظار المراجعة</option><option value="VERIFIED">معتمدة</option><option value="REJECTED">مرفوضة</option><option value="SUSPENDED">معلقة</option></select>} />
      {message ? <p className="inline-notice" role="status">{message}</p> : null}
      {queue.loading ? <LoadingState /> : queue.error ? <ErrorState error={queue.error} retry={queue.reload} /> : !queue.data?.length ? <EmptyState title="لا توجد ملفات بهذه الحالة" description="غيّر المرشح أو عد لاحقًا." /> : <div className="admin-table verification-table">{queue.data.map((item) => <article key={item.id}><div><StatusBadge status={item.verification_status} /><h2>{item.name}</h2><p>{item.pharmacist_name} · {item.owner_email}</p></div><dl><div><dt>الإجازة</dt><dd dir="ltr">{item.license_number}</dd></div><div><dt>الموقع</dt><dd>{item.governorate} · {item.district}</dd></div><div><dt>المستندات</dt><dd>{item.document_count}</dd></div><div><dt>تاريخ الطلب</dt><dd>{asDate(item.created_at)}</dd></div></dl><div className="row-actions"><Link className="secondary-cta" to={`/admin/verifications/${item.id}`}>فتح الملف</Link>{item.verification_status === "PENDING" ? <><button className="primary-cta" type="button" onClick={() => void approve(item.id)}>اعتماد</button><button className="secondary-cta" type="button" onClick={() => void reject(item.id)}>رفض مع سبب</button></> : null}</div></article>)}</div>}
    </>
  );
}

export function VerificationDetailPage() {
  const { pharmacyId = "" } = useParams();
  const detail = useApi(async () => (await apiFetch<{ data: Verification & { verification_reason: string | null; opening_hours: object; documents: Array<{ id: string; document_type: string; status: string; secure_file_id: string | null; created_at: string }> } }>(`/api/v1/admin/verifications/${pharmacyId}`)).data, [pharmacyId]);
  const [message, setMessage] = useState("");
  if (detail.loading) return <LoadingState />;
  if (detail.error || !detail.data) return <ErrorState error={detail.error} retry={detail.reload} />;
  const item = detail.data;
  async function decide(action: "approve" | "reject") {
    const reason = action === "reject" ? window.prompt("اكتب سبب الرفض بوضوح:") : null;
    if (action === "reject" && !reason) return;
    try {
      await apiFetch(`/api/v1/admin/verifications/${item.id}/${action}`, { method: "POST", body: JSON.stringify(action === "reject" ? { reason } : {}) });
      setMessage(action === "approve" ? "تم اعتماد الصيدلية." : "تم رفض الطلب وإبلاغ الصيدلية.");
      await detail.reload();
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "تعذر تسجيل القرار."); }
  }
  return (
    <>
      <PageHeader eyebrow="ملف تحقق الصيدلية" title={item.name} description={`${item.governorate} · ${item.district} · ${item.address}`} actions={<StatusBadge status={item.verification_status} />} />
      {message ? <p className="inline-notice" role="status">{message}</p> : null}
      <div className="verification-detail-grid"><section><h2>الهوية والترخيص</h2><dl><div><dt>الصيدلي</dt><dd>{item.pharmacist_name}</dd></div><div><dt>المالك</dt><dd>{item.owner_name}</dd></div><div><dt>الإجازة</dt><dd dir="ltr">{item.license_number}</dd></div><div><dt>الجهة</dt><dd>{item.license_issuer}</dd></div><div><dt>البريد</dt><dd dir="ltr">{item.owner_email}</dd></div></dl></section><section><h2>المستندات المشفرة</h2>{item.documents.length ? item.documents.map((document) => <div className="document-row" key={document.id}><div><strong>{document.document_type}</strong><span>{asDate(document.created_at)}</span></div>{document.secure_file_id ? <a className="secondary-cta" href={`/api/v1/files/${document.secure_file_id}`} target="_blank" rel="noreferrer">فتح مع تسجيل الوصول</a> : <StatusBadge status="MISSING">غير مرفق</StatusBadge>}</div>) : <p>لا توجد مستندات مرفقة.</p>}</section></div>
      {item.verification_status === "PENDING" ? <div className="row-actions decision-bar"><button className="primary-cta" type="button" onClick={() => void decide("approve")}>اعتماد الصيدلية</button><button className="secondary-cta" type="button" onClick={() => void decide("reject")}>رفض مع سبب</button></div> : null}
    </>
  );
}

interface AdminPharmacy {
  id: string;
  name: string;
  pharmacist_name: string;
  verification_status: string;
  license_number: string;
  branch_id: string;
  district: string;
  operational_status: string;
  accepting_requests: boolean;
  response_rate: number | null;
  completed_requests: number | null;
  confirmed_not_found: number | null;
}

export function AdminPharmaciesPage() {
  const pharmacies = useApi(async () => (await apiFetch<{ data: AdminPharmacy[] }>("/api/v1/admin/pharmacies")).data, []);
  const [message, setMessage] = useState("");
  async function suspend(item: AdminPharmacy) {
    const reason = window.prompt("سبب التعليق:");
    if (!reason) return;
    try { await apiFetch(`/api/v1/admin/pharmacies/${item.id}/suspend`, { method: "POST", body: JSON.stringify({ reason }) }); setMessage("عُلقت الصيدلية وألغيت جلساتها."); await pharmacies.reload(); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "تعذر التعليق."); }
  }
  async function restore(item: AdminPharmacy) {
    try { await apiFetch(`/api/v1/admin/pharmacies/${item.id}/restore`, { method: "POST", body: JSON.stringify({}) }); setMessage("تمت استعادة الصيدلية."); await pharmacies.reload(); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "تعذر الاستعادة."); }
  }
  if (pharmacies.loading) return <LoadingState />;
  if (pharmacies.error) return <ErrorState error={pharmacies.error} retry={pharmacies.reload} />;
  return (
    <>
      <PageHeader eyebrow="شبكة العرض" title="الصيدليات" description="إدارة الحالة التشغيلية والاعتماد والموثوقية." />
      {message ? <p className="inline-notice" role="status">{message}</p> : null}
      <div className="admin-list">{pharmacies.data?.map((item) => <article key={item.id}><div className="pharmacy-avatar"><Icon name="store" size={22} /></div><div><h2>{item.name}</h2><p>{item.district} · إجازة <bdi>{item.license_number}</bdi></p><div className="service-tags"><span>استجابة {Math.round((item.response_rate ?? 0) * 100)}%</span><span>{item.completed_requests ?? 0} مكتمل</span><span>{item.confirmed_not_found ?? 0} عدم تطابق</span></div></div><StatusBadge status={item.verification_status} /><div className="row-actions">{item.verification_status === "VERIFIED" ? <button className="danger-link" type="button" onClick={() => void suspend(item)}>تعليق</button> : item.verification_status === "SUSPENDED" ? <button className="secondary-cta" type="button" onClick={() => void restore(item)}>استعادة</button> : null}</div></article>)}</div>
    </>
  );
}

interface AdminRequest {
  id: string;
  public_reference: string;
  medicine_name: string;
  patient_name: string;
  status: string;
  area: string;
  dispatch_count: number;
  offer_count: number;
  created_at: string;
}

export function AdminRequestsPage() {
  const requests = useApi(async () => (await apiFetch<{ data: AdminRequest[] }>("/api/v1/admin/requests")).data, []);
  if (requests.loading) return <LoadingState />;
  if (requests.error) return <ErrorState error={requests.error} retry={requests.reload} />;
  return (
    <>
      <PageHeader eyebrow="المراقبة التشغيلية" title="طلبات الدواء" description="تتبع الحالات دون فتح الوصفات أو عرض الموقع الدقيق." />
      {!requests.data?.length ? <EmptyState title="لا توجد طلبات" description="ستظهر الطلبات عند بدء استخدام المنصة." /> : <div className="admin-request-list">{requests.data.map((request) => <Link key={request.id} to={`/admin/requests/${request.id}`}><div><StatusBadge status={request.status} /><h2 dir="auto">{request.medicine_name}</h2><p>{request.public_reference} · {request.area} · {asDate(request.created_at)}</p></div><div><span>{request.dispatch_count} إرسال</span><span>{request.offer_count} عرض</span><Icon name="chevron" size={18} /></div></Link>)}</div>}
    </>
  );
}

export function AdminRequestTracePage() {
  const { requestId = "" } = useParams();
  const trace = useApi(async () => (await apiFetch<{ data: { request: Record<string, string | number>; dispatches: Array<Record<string, string | number>>; offers: Array<Record<string, string | number>>; reservations: Array<Record<string, string | number | null>> } }>(`/api/v1/admin/requests/${requestId}`)).data, [requestId]);
  if (trace.loading) return <LoadingState />;
  if (trace.error || !trace.data) return <ErrorState error={trace.error} retry={trace.reload} />;
  return (
    <>
      <PageHeader eyebrow={String(trace.data.request.public_reference)} title={String(trace.data.request.medicine_name)} description="سجل تشغيلي للطلب والعروض والحجز." actions={<StatusBadge status={String(trace.data.request.status)} />} />
      <div className="trace-grid"><section><h2>الإرسالات</h2>{trace.data.dispatches.map((row) => <div key={String(row.id)}><strong>{String(row.pharmacy_name)}</strong><span>{String(row.status)} · {Number(row.distance_km).toFixed(1)} كم</span></div>)}</section><section><h2>العروض</h2>{trace.data.offers.length ? trace.data.offers.map((row) => <div key={String(row.id)}><strong>{String(row.pharmacy_name)}</strong><span>{String(row.offer_type)} · {String(row.status)}</span></div>) : <p>لا عروض</p>}</section><section><h2>الحجز</h2>{trace.data.reservations.length ? trace.data.reservations.map((row) => <div key={String(row.id)}><strong>{String(row.public_reference)}</strong><span>{String(row.status)}</span></div>) : <p>لا حجز</p>}</section></div>
    </>
  );
}

interface AdminUser {
  id: string;
  role: string;
  status: string;
  name: string;
  email: string;
  phone: string | null;
  created_at: string;
}

export function AdminUsersPage() {
  const users = useApi(async () => (await apiFetch<{ data: AdminUser[] }>("/api/v1/admin/users")).data, []);
  const [message, setMessage] = useState("");
  if (users.loading) return <LoadingState />;
  if (users.error) return <ErrorState error={users.error} retry={users.reload} />;
  async function changeStatus(user: AdminUser) {
    const suspending = user.status === "ACTIVE";
    const reason = suspending ? window.prompt("سبب تعليق الحساب:") : null;
    if (suspending && !reason) return;
    try {
      await apiFetch(`/api/v1/admin/users/${user.id}/${suspending ? "suspend" : "restore"}`, { method: "POST", body: JSON.stringify(suspending ? { reason } : {}) });
      setMessage(suspending ? "تم تعليق الحساب وإلغاء جلساته." : "تمت استعادة الحساب.");
      await users.reload();
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "تعذر تحديث الحساب."); }
  }
  return <><PageHeader eyebrow="الحسابات" title="المستخدمون" description="الأدوار ثابتة على الخادم ولا يغيرها العميل." />{message ? <p className="inline-notice" role="status">{message}</p> : null}<div className="admin-user-list">{users.data?.map((user) => <article key={user.id}><div className="pharmacy-avatar"><Icon name={user.role === "PATIENT" ? "user" : user.role === "PHARMACY" ? "store" : "shield"} size={20} /></div><div><h2>{user.name}</h2><p dir="ltr">{user.email}</p></div><StatusBadge status={user.status} /><span>{user.role}</span><time>{asDate(user.created_at)}</time>{user.role !== "ADMIN" ? <button className={user.status === "ACTIVE" ? "danger-link" : "secondary-cta"} type="button" onClick={() => void changeStatus(user)}>{user.status === "ACTIVE" ? "تعليق" : "استعادة"}</button> : null}</article>)}</div></>;
}

interface Report {
  id: string;
  reporter_name: string;
  target_type: string;
  target_id: string;
  category: string;
  description: string;
  status: string;
  created_at: string;
}

export function AdminReportsPage() {
  const reports = useApi(async () => (await apiFetch<{ data: Report[] }>("/api/v1/admin/reports")).data, []);
  const [message, setMessage] = useState("");
  async function resolve(report: Report, status: "RESOLVED" | "DISMISSED") {
    const resolution = window.prompt("سجل نتيجة المراجعة:");
    if (!resolution) return;
    try { await apiFetch(`/api/v1/admin/reports/${report.id}/resolve`, { method: "POST", body: JSON.stringify({ status, resolution }) }); setMessage("تم تحديث البلاغ."); await reports.reload(); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "تعذر التحديث."); }
  }
  if (reports.loading) return <LoadingState />;
  if (reports.error) return <ErrorState error={reports.error} retry={reports.reload} />;
  return (
    <>
      <PageHeader eyebrow="الثقة والسلامة" title="البلاغات" description="كل قرار يحتفظ بالمشرف والوقت والنتيجة." />
      {message ? <p className="inline-notice" role="status">{message}</p> : null}
      {!reports.data?.length ? <EmptyState title="لا توجد بلاغات" description="لا توجد مشكلات تحتاج المراجعة الآن." /> : <div className="report-list">{reports.data.map((report) => <article key={report.id}><div><StatusBadge status={report.status} /><h2>{report.category}</h2><p>{report.description}</p><small>{report.reporter_name} · {report.target_type} · {asDate(report.created_at)}</small></div>{["OPEN", "INVESTIGATING"].includes(report.status) ? <div className="row-actions"><button className="primary-cta" type="button" onClick={() => void resolve(report, "RESOLVED")}>حل البلاغ</button><button className="secondary-cta" type="button" onClick={() => void resolve(report, "DISMISSED")}>رفض البلاغ</button></div> : null}</article>)}</div>}
    </>
  );
}
