import { useState } from "react";
import { apiFetch } from "../api/client";
import { useApi } from "../app/useApi";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
} from "../components/AppShell";
import { Icon } from "../Icon";

/**
 * Medication timeline — MM-P2/MM-P3/MM-X3.
 *
 * Calm by construction: one card per medicine, the pharmacist-confirmed
 * instruction in plain Arabic, and a days-of-cover line that is either a
 * confident statement or an honest silence. It never shows a guessed date.
 */

interface CoverState {
  daysRemaining: number | null;
  runsOutOn: string | null;
  suppressed: boolean;
  suppressionReason?: string;
}

interface TimelineEntry {
  id: string;
  medicineName: string;
  strength: string | null;
  sigTextAr: string;
  sigSource: string;
  dosesPerDay: number;
  takenCount: number;
  lastConfirmedAt: string | null;
  cover: CoverState;
  needsReorder: boolean;
}

function coverLine(cover: CoverState): string {
  if (!cover.suppressed && cover.daysRemaining !== null) {
    if (cover.daysRemaining === 0) return "انتهت الكمية على الأرجح.";
    if (cover.daysRemaining === 1) return "تكفيك ليوم واحد تقريبًا.";
    if (cover.daysRemaining === 2) return "تكفيك ليومين تقريبًا.";
    return `تكفيك نحو ${cover.daysRemaining} أيام.`;
  }
  // Silence with a reason, never a guess.
  switch (cover.suppressionReason) {
    case "SNOOZED":
      return "أجّلت التذكير بإعادة الطلب.";
    case "CONFLICTING_DATA":
      return "بياناتنا غير متطابقة — لا نقدّر المدة المتبقية.";
    case "NO_DISPENSE_CYCLE":
    default:
      return "نحتاج دورة صرف كاملة قبل تقدير المدة.";
  }
}

/** Source is always named — an instruction is only as good as its provenance. */
function sourceLabel(source: string): string {
  if (source === "PHARMACIST") return "أكّدها الصيدلي";
  if (source === "MONOGRAPH_TEMPLATE") return "من النشرة الدوائية";
  return "أدخلتها بنفسك";
}

export function MedicationTimelinePage() {
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const timeline = useApi(
    async () =>
      (await apiFetch<{ data: TimelineEntry[] }>("/api/v1/clinical/timeline")).data,
    [],
  );

  async function confirmDose(entry: TimelineEntry) {
    setBusy(entry.id);
    setNotice("");
    try {
      await apiFetch(`/api/v1/clinical/schedules/${entry.id}/events`, {
        method: "POST",
        body: JSON.stringify({
          scheduledAt: new Date().toISOString(),
          status: "TAKEN",
          // Stable per dose-slot so a retry cannot double-count adherence.
          clientEventId: `${entry.id}:${new Date().toISOString().slice(0, 13)}`,
        }),
      });
      setNotice("سُجّلت الجرعة.");
      await timeline.reload();
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "تعذّر تسجيل الجرعة.");
    } finally {
      setBusy("");
    }
  }

  async function snooze(entry: TimelineEntry) {
    setBusy(entry.id);
    try {
      await apiFetch(`/api/v1/clinical/schedules/${entry.id}/snooze`, {
        method: "POST",
        body: JSON.stringify({ days: 14 }),
      });
      setNotice("أجّلنا التذكير أسبوعين.");
      await timeline.reload();
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "تعذّر التأجيل.");
    } finally {
      setBusy("");
    }
  }

  if (timeline.loading && !timeline.data) return <LoadingState label="نحمّل أدويتك…" />;
  if (timeline.error && !timeline.data) {
    return <ErrorState error={timeline.error} retry={timeline.reload} />;
  }

  return (
    <>
      <PageHeader
        eyebrow="أدويتي"
        title="خط الدواء"
        description="ما تأخذه، ومتى، ومن أكّد التعليمات. لا نشخّص ولا نقترح جرعة."
      />
      {notice ? (
        <p className="inline-notice" role="status">
          {notice}
        </p>
      ) : null}
      {!timeline.data?.length ? (
        <EmptyState
          title="لا توجد أدوية بعد"
          description="صوّر وصفتك أو اطلب من الصيدلي إضافتها عند الصرف."
        />
      ) : (
        <div className="timeline-list">
          {timeline.data.map((entry) => (
            <article key={entry.id} className={entry.needsReorder ? "needs-reorder" : ""}>
              <header>
                <div>
                  <h2>
                    <bdi dir="auto">{entry.medicineName}</bdi>
                    {entry.strength ? (
                      <>
                        {" "}
                        <bdi dir="ltr">{entry.strength}</bdi>
                      </>
                    ) : null}
                  </h2>
                  <p className="meta">{sourceLabel(entry.sigSource)}</p>
                </div>
                {entry.needsReorder ? (
                  <span className="status-pill amber">قارب على الانتهاء</span>
                ) : null}
              </header>
              <p className="sig-card">{entry.sigTextAr}</p>
              <p className="cover-line">{coverLine(entry.cover)}</p>
              <div className="timeline-actions">
                <button
                  type="button"
                  className="primary-cta"
                  disabled={busy === entry.id}
                  onClick={() => void confirmDose(entry)}
                >
                  <Icon name="check" size={17} /> أخذت الجرعة
                </button>
                {entry.needsReorder ? (
                  <button
                    type="button"
                    className="secondary-cta"
                    disabled={busy === entry.id}
                    onClick={() => void snooze(entry)}
                  >
                    عندي كمية — أجّل
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

interface FamilyLink {
  id: string;
  display_name: string;
  relation: string;
  proxy_scope: "VIEW" | "ORDER" | "CONFIRM";
  consent_granted_at: string | null;
  side: "PROXY" | "SUBJECT";
}

const SCOPE_LABEL: Record<FamilyLink["proxy_scope"], string> = {
  VIEW: "الاطلاع فقط",
  ORDER: "الاطلاع والطلب",
  CONFIRM: "الاطلاع والطلب وتأكيد الجرعات",
};

/**
 * Family access — the consent surface. The patient always sees who can reach
 * their medicines and can revoke instantly, which is what makes the proxy
 * feature safe to offer at all.
 */
export function FamilyAccessPage() {
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const links = useApi(
    async () => (await apiFetch<{ data: FamilyLink[] }>("/api/v1/clinical/family")).data,
    [],
  );

  async function act(link: FamilyLink, action: "grant" | "revoke") {
    setBusy(link.id);
    setNotice("");
    try {
      await apiFetch(`/api/v1/clinical/family/${link.id}/${action}`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setNotice(action === "grant" ? "مُنح الوصول." : "أُلغي الوصول فورًا.");
      await links.reload();
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "تعذّر تنفيذ الإجراء.");
    } finally {
      setBusy("");
    }
  }

  if (links.loading && !links.data) return <LoadingState />;
  if (links.error && !links.data) return <ErrorState error={links.error} retry={links.reload} />;

  const incoming = (links.data ?? []).filter(
    (link) => link.side === "SUBJECT" && !link.consent_granted_at,
  );
  const active = (links.data ?? []).filter((link) => link.consent_granted_at);

  return (
    <>
      <PageHeader
        eyebrow="العائلة"
        title="من يصل إلى أدويتي"
        description="لا يُمنح أي وصول إلا بموافقتك، ويمكنك سحبه في أي لحظة."
      />
      {notice ? (
        <p className="inline-notice" role="status">
          {notice}
        </p>
      ) : null}

      {incoming.length ? (
        <section className="consent-requests">
          <h2>طلبات بانتظار موافقتك</h2>
          {incoming.map((link) => (
            <article key={link.id}>
              <div>
                <strong>{link.display_name}</strong>
                <p className="meta">
                  {link.relation} · يطلب: {SCOPE_LABEL[link.proxy_scope]}
                </p>
              </div>
              <div className="timeline-actions">
                <button
                  type="button"
                  className="primary-cta"
                  disabled={busy === link.id}
                  onClick={() => void act(link, "grant")}
                >
                  أوافق
                </button>
                <button
                  type="button"
                  className="secondary-cta"
                  disabled={busy === link.id}
                  onClick={() => void act(link, "revoke")}
                >
                  أرفض
                </button>
              </div>
            </article>
          ))}
        </section>
      ) : null}

      {!active.length ? (
        <EmptyState
          title="لا أحد يصل إلى ملفك"
          description="يمكنك دعوة أحد أفراد عائلتك لمساعدتك في متابعة أدويتك."
        />
      ) : (
        <div className="admin-list">
          {active.map((link) => (
            <article key={link.id}>
              <div>
                <h2>{link.display_name}</h2>
                <p className="meta">
                  {link.relation} · {SCOPE_LABEL[link.proxy_scope]} ·{" "}
                  {link.side === "PROXY" ? "أنت تتابعه" : "يتابع ملفك"}
                </p>
              </div>
              <button
                type="button"
                className="danger-link"
                disabled={busy === link.id}
                onClick={() => void act(link, "revoke")}
              >
                سحب الوصول
              </button>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
