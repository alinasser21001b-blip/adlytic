import type { ReactNode } from "react";
import { NavLink, useNavigate } from "../app/router";
import { Icon } from "../Icon";
import { useSession, type Role } from "../app/SessionContext";
import { apiFetch } from "../api/client";
import { useApi } from "../app/useApi";
import { PillBar, type AttentionEvent } from "./PillBar";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`brand ${compact ? "compact" : ""}`}>
      <span className="brand-mark" aria-hidden="true">
        <span />
        <span />
      </span>
      <span>
        <strong>دوائي</strong>
        {!compact ? <small>نجد دواءك بالقرب منك</small> : null}
      </span>
    </span>
  );
}

const navByRole: Record<Role, Array<{ to: string; label: string; icon: Parameters<typeof Icon>[0]["name"] }>> = {
  PATIENT: [
    { to: "/patient", label: "الرئيسية", icon: "search" },
    { to: "/patient/requests/new", label: "طلب جديد", icon: "plus" },
    { to: "/patient/history", label: "طلباتي", icon: "clock" },
    { to: "/patient/pharmacies", label: "الصيدليات", icon: "store" },
    { to: "/patient/profile", label: "حسابي", icon: "user" },
  ],
  PHARMACY: [
    { to: "/pharmacy", label: "لوحة التحكم", icon: "spark" },
    { to: "/pharmacy/inbox", label: "الطلبات", icon: "bell" },
    { to: "/pharmacy/reservations", label: "الحجوزات", icon: "reserve" },
    { to: "/pharmacy/inventory", label: "التوفر", icon: "list" },
    { to: "/pharmacy/settings", label: "الإعدادات", icon: "filter" },
  ],
  ADMIN: [
    { to: "/admin", label: "نظرة عامة", icon: "spark" },
    { to: "/admin/verifications", label: "التحقق", icon: "shield" },
    { to: "/admin/pharmacies", label: "الصيدليات", icon: "store" },
    { to: "/admin/requests", label: "الطلبات", icon: "prescription" },
    { to: "/admin/users", label: "المستخدمون", icon: "user" },
    { to: "/admin/reports", label: "البلاغات", icon: "bell" },
  ],
};

export function AppShell({
  children,
  role,
}: {
  children: ReactNode;
  role: Role;
}) {
  const { session, logout, offline } = useSession();
  const navigate = useNavigate();
  const nav = navByRole[role];

  // Attention feed drives the Pill Bar. Polled rather than pushed for now; the
  // outbox already carries the same events to push channels when configured.
  const attention = useApi(
    async () =>
      (await apiFetch<{ data: AttentionEvent[] }>("/api/v1/clinical/attention")).data,
    [role],
    30_000,
  );

  async function handleLogout() {
    await logout();
    navigate("/");
  }

  async function dismissAttention(event: AttentionEvent) {
    // Optimistic: the bar must feel instant on a slow Baghdad connection.
    attention.setData((current) =>
      (current ?? []).filter((item) => item.id !== event.id),
    );
    try {
      await apiFetch(`/api/v1/clinical/attention/${event.id}/dismiss`, {
        method: "POST",
        body: JSON.stringify({}),
      });
    } catch {
      await attention.reload({ soft: true });
    }
  }

  function openAttention(event: AttentionEvent) {
    if (event.resource_type === "DOSE_SCHEDULE") navigate("/patient/timeline");
    else if (event.resource_type === "FAMILY_MEMBER") navigate("/patient/family");
    else navigate(`/${role.toLowerCase()}/notifications`);
  }

  return (
    <div className={`product-shell role-${role.toLowerCase()}`}>
      <a className="skip-link" href="#main-content">
        انتقل إلى المحتوى
      </a>
      <header className="product-header">
        <NavLink to={nav[0].to} className="logo-link" aria-label="دوائي">
          <Logo />
        </NavLink>
        <nav className="desktop-nav" aria-label="التنقل الرئيسي">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to.split("/").length === 2}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="account-menu">
          <NavLink to={`/${role.toLowerCase()}/notifications`} aria-label="الإشعارات">
            <Icon name="bell" size={19} />
          </NavLink>
          <span>{session?.user.name}</span>
          <button type="button" onClick={handleLogout}>
            خروج
          </button>
        </div>
      </header>
      {offline ? (
        <div className="offline-banner" role="status">
          أنت غير متصل. سنعرض آخر حالة معروفة ولن نؤكد أي إجراء حتى يعود الاتصال.
        </div>
      ) : null}
      <main id="main-content" className="product-main">
        {children}
      </main>
      <PillBar
        events={attention.data ?? []}
        onAction={openAttention}
        onDismiss={(event) => void dismissAttention(event)}
      />
      <nav className="mobile-nav" aria-label="التنقل على الهاتف">
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to.split("/").length === 2}
          >
            <Icon name={item.icon} size={20} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        {eyebrow ? <p className="overline">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}

export function LoadingState({ label = "جارٍ التحميل…" }: { label?: string }) {
  return (
    <div className="state-panel loading-state" role="status">
      <span className="loader" />
      <strong>{label}</strong>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="state-panel empty-state">
      <Icon name="search" size={30} />
      <strong>{title}</strong>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function ErrorState({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => void;
}) {
  return (
    <div className="state-panel error-state" role="alert">
      <Icon name="shield" size={28} />
      <strong>تعذر إكمال الطلب</strong>
      <p>{error instanceof Error ? error.message : "حدث خطأ غير متوقع."}</p>
      {retry ? (
        <button type="button" className="secondary-cta" onClick={retry}>
          أعد المحاولة
        </button>
      ) : null}
    </div>
  );
}

export function StatusBadge({
  status,
  children,
}: {
  status: string;
  children?: ReactNode;
}) {
  const positive = ["VERIFIED", "ACTIVE", "READY", "COMPLETED", "EXACT"].includes(
    status,
  );
  const warning = [
    "PENDING",
    "PENDING_ACK",
    "HOLD_PENDING",
    "UNDER_REVIEW",
    "ALTERNATIVE_REVIEW_REQUIRED",
  ].includes(status);
  return (
    <span className={`status-pill ${positive ? "green" : warning ? "amber" : "blue"}`}>
      {children ?? status}
    </span>
  );
}
