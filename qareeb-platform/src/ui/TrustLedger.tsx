import type {
  AvailabilityBroadcast,
  DemandSignalEvent,
  EncryptedPrescriptionEnvelope,
  GudeaLookupResult,
  PrescriptionAccessAuditEvent,
  RadarEvent,
} from "../domain/contracts";
import { GUDEA_UNAVAILABLE_MESSAGE } from "../domain/gudea";
import { formatClock, formatIqd, formatTimestamp } from "./format";

export type GudeaViewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; result: GudeaLookupResult };

interface TrustLedgerProps {
  demandEvents: readonly DemandSignalEvent[];
  radarEvents: readonly RadarEvent[];
  broadcast: AvailabilityBroadcast | null;
  envelope: EncryptedPrescriptionEnvelope | null;
  auditEntries: readonly PrescriptionAccessAuditEvent[];
  gudea: GudeaViewState;
  connection: "online" | "offline";
}

const EVENT_LABELS: Record<RadarEvent["type"], string> = {
  RequestCreated: "أُنشئ الطلب",
  BroadcastDispatched: "أُرسل البث المجهول",
  PharmacyReviewing: "بدأت مراجعة صيدلية",
  PharmacyDeclined: "اعتذرت صيدلية",
  PharmacyConfirmed: "أكدت صيدلية العرض والسعر",
  PrescriptionAccessGranted: "مُنح وصول مدقّق للوصفة",
  PrescriptionMatched: "طابق الصيدلي العرض",
  HoldActivated: "فُعّل الحجز المؤقت",
  HoldExpired: "انتهى الحجز",
  RequestTimedOut: "انتهت مهلة الطلب",
  DispensingConfirmed: "سُجل الاستلام في المحاكاة",
};

function eventDetail(event: RadarEvent): string | null {
  switch (event.type) {
    case "BroadcastDispatched":
      return `${event.licensedRecipients} مستلمين مرخّصين`;
    case "PharmacyReviewing":
    case "PharmacyDeclined":
    case "PrescriptionAccessGranted":
      return event.pharmacyId;
    case "PharmacyConfirmed":
      return `${event.confirmation.pharmacyName} · ${formatIqd(event.confirmation.amountIqd)}`;
    case "PrescriptionMatched":
      return event.canonicalId;
    case "HoldActivated":
    case "HoldExpired":
    case "DispensingConfirmed":
      return event.reference;
    case "RequestCreated":
    case "RequestTimedOut":
      return event.requestId;
  }
}

export function TrustLedger({
  demandEvents,
  radarEvents,
  broadcast,
  envelope,
  auditEntries,
  gudea,
  connection,
}: TrustLedgerProps) {
  const recentEvents = radarEvents.slice(-6).reverse();

  return (
    <aside className="trust-ledger" aria-label="سجل الثقة والخصوصية">
      <div className="ledger-heading">
        <div>
          <p className="eyebrow">سجل الثقة</p>
          <h2>ما حدث فعلاً</h2>
        </div>
        <span
          className={`connection-mark ${connection}`}
          aria-label={connection === "online" ? "بث الأحداث متصل" : "بث الأحداث منقطع"}
        >
          {connection === "online" ? "متصل" : "منقطع"}
        </span>
      </div>

      <section className="ledger-section">
        <h3>حدود المحاكاة</h3>
        <p>
          أحداث محلية بعقود النطاق نفسها. لا توجد صيدليات أو Gudea أو مفاتيح KMS
          إنتاجية متصلة.
        </p>
      </section>

      {broadcast ? (
        <section className="ledger-section" data-testid="broadcast-allowlist">
          <h3>حمولة البث المسموح بها</h3>
          <dl className="mini-ledger">
            <div>
              <dt>هوية العرض</dt>
              <dd dir="ltr">{broadcast.canonicalId}</dd>
            </div>
            <div>
              <dt>الموقع</dt>
              <dd>{broadcast.coarseDistrict}</dd>
            </div>
            <div>
              <dt>الفئة</dt>
              <dd dir="ltr">{broadcast.requestClass}</dd>
            </div>
          </dl>
          <p className="privacy-proof">
            لا صورة وصفة · لا ملاحظة طبية · لا اسم مريض
          </p>
        </section>
      ) : null}

      {envelope ? (
        <section className="ledger-section">
          <h3>غلاف الوصفة</h3>
          <p>
            <strong dir="ltr">{envelope.algorithm}</strong> قبل التهيئة المحلية،
            مع مفتاح بيانات ملفوف تجريبياً.
          </p>
          {envelope.retention.status === "MARKED_FOR_DELETION" ? (
            <p className="ledger-meta">
              معلّمة للحذف: {formatTimestamp(envelope.retention.deleteAt)}
            </p>
          ) : (
            <p className="ledger-meta">بانتظار نتيجة الحجز لتحديد موعد الحذف.</p>
          )}
        </section>
      ) : null}

      {gudea.status !== "idle" ? (
        <section className="ledger-section">
          <h3>مرجع Gudea</h3>
          {gudea.status === "loading" ? (
            <p>جارٍ طلب سجل العرض…</p>
          ) : gudea.result.status === "verified" ? (
            <p>
              سعر مرجعي رسمي:{" "}
              <strong className="numeric">
                {formatIqd(gudea.result.officialPriceIqd)}
              </strong>
            </p>
          ) : (
            <p>{GUDEA_UNAVAILABLE_MESSAGE}</p>
          )}
        </section>
      ) : null}

      {demandEvents.length > 0 ? (
        <section className="ledger-section">
          <h3>إشارات الطلب</h3>
          <ol className="stage-trail">
            {demandEvents.map((event) => (
              <li key={event.id}>
                <strong dir="ltr">{event.stage}</strong>
                <span>{formatClock(event.occurredAt)}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <section className="ledger-section event-ledger" aria-live="polite">
        <h3>نبضات المصدر</h3>
        {recentEvents.length === 0 ? (
          <p className="empty-ledger">لا حدث بعد؛ لا نعرض تقدماً مفترضاً.</p>
        ) : (
          <ol>
            {recentEvents.map((event, index) => (
              <li key={`${event.type}-${event.at}-${index}`}>
                <time dateTime={event.at}>{formatClock(event.at)}</time>
                <div>
                  <strong>{EVENT_LABELS[event.type]}</strong>
                  {eventDetail(event) ? (
                    <span dir="auto">{eventDetail(event)}</span>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {auditEntries.length > 0 ? (
        <section className="ledger-section">
          <h3>تدقيق وصول الوصفة</h3>
          {auditEntries.map((entry) => (
            <p className="audit-entry" key={entry.id}>
              صيدلي <span dir="ltr">{entry.pharmacistId}</span>
              <br />
              بصمة <code dir="ltr">{entry.entryHash.slice(0, 12)}…</code>
            </p>
          ))}
        </section>
      ) : null}
    </aside>
  );
}

