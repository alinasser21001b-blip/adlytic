// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/adminSurfaceNav.ts
//
//  THE admin information architecture. One map, rendered by every surface.
//
//  ── What was wrong ────────────────────────────────────────────────────
//
//  Three navigation vocabularies coexisted. This module listed five
//  cross-page destinations; adminConsolePage carried its own seven groups
//  mixing in-page tabs with cross-page links; adminOsPage carried four groups
//  of its own. An operator moving between admin windows had to learn a
//  different map on each one.
//
//  And none of the three listed the Brain Observatory. The system's primary
//  intelligence diagnostic was reachable only by typing its URL — it existed
//  but could not be found.
//
//  ── The rule ──────────────────────────────────────────────────────────
//
//  Sections come from the closure specification: Overview, Meta & Data,
//  Intelligence, Operations, Security & Audit, Workspaces. A section appears
//  ONLY if it has a real destination. Empty sections are not rendered, because
//  a heading with nothing under it tells an operator a capability exists when
//  it does not — the same class of dishonesty as a UI that turns UNKNOWN into
//  healthy.
//
//  Destinations are ROUTES. In-page tabs stay owned by their page; this is the
//  level above them. Host pages style the block through their own
//  .nav-label / .nav-item rules — it carries no styling of its own.
// ════════════════════════════════════════════════════════════════════════

export type AdminSurface =
  | 'console'
  | 'inbox'
  | 'add-client'
  | 'observability'
  | 'readiness'
  | 'observatory'
  | 'classic';

export interface AdminDestination {
  id: AdminSurface;
  href: string;
  label: string;
  /** One line on what an operator comes here to answer. */
  purpose: string;
}

export interface AdminSection {
  /** Canonical section key from the closure specification. */
  key: 'OVERVIEW' | 'META_AND_DATA' | 'INTELLIGENCE' | 'OPERATIONS' | 'WORKSPACES' | 'SUPPORT';
  label: string;
  items: AdminDestination[];
}

/**
 * The map.
 *
 * SECURITY_AND_AUDIT is deliberately ABSENT. The specification asks for it,
 * but no route today serves privileged-action history, deletion events or an
 * audit trail — the closest surfaces (settings, payment events) live as tabs
 * inside the console and are configuration, not audit. Rendering the heading
 * over a link to those would misrepresent what the platform can currently
 * answer. Recorded as open debt in docs/close-code/13_OPEN_DEBT_REGISTER.md
 * rather than papered over with a plausible-looking menu entry.
 */
export const ADMIN_IA: AdminSection[] = [
  {
    key: 'OVERVIEW', label: 'النظرة العامة',
    items: [
      { id: 'console', href: '/admin', label: 'لوحة التشغيل', purpose: 'حالة المنصة الآن وما يحتاج انتباهاً' },
    ],
  },
  {
    key: 'META_AND_DATA', label: 'Meta والبيانات',
    items: [
      { id: 'readiness', href: '/admin/meta-readiness', label: 'جاهزية Meta', purpose: 'الصلاحيات والقدرات والاكتشاف' },
    ],
  },
  {
    key: 'INTELLIGENCE', label: 'الذكاء',
    items: [
      // The destination that did not exist in any menu before this.
      { id: 'observatory', href: '/admin/brain-observatory', label: 'مرصد الدماغ', purpose: 'من حقيقة Meta إلى القرار — طبقة بطبقة' },
    ],
  },
  {
    key: 'OPERATIONS', label: 'العمليات',
    items: [
      { id: 'observability', href: '/admin/observability', label: 'مراقبة المنصة', purpose: 'الخدمات والمزامنة وهوية النسخة' },
    ],
  },
  {
    key: 'WORKSPACES', label: 'مساحات العمل والزبائن',
    items: [
      { id: 'classic', href: '/admin/classic', label: 'الإدارة الكاملة', purpose: 'الزبائن والاشتراكات والإعدادات' },
      { id: 'add-client', href: '/admin/add-client', label: 'إضافة عميل', purpose: 'معالج الإعداد' },
    ],
  },
  {
    key: 'SUPPORT', label: 'الدعم',
    items: [
      { id: 'inbox', href: '/admin/inbox', label: 'صندوق الدعم', purpose: 'تذاكر الزبائن' },
    ],
  },
];

/** Every destination, flattened — used by the route-coverage test. */
export function adminDestinations(): AdminDestination[] {
  return ADMIN_IA.flatMap((s) => s.items);
}

export function adminSurfaceNav(active: AdminSurface): string {
  const sections = ADMIN_IA.map((section) => {
    const items = section.items.map((i) =>
      `      <a class="nav-item${i.id === active ? ' active' : ''}" href="${i.href}" title="${i.purpose}">${i.label}</a>`,
    ).join('\n');
    return `<div class="nav-label">${section.label}</div>\n${items}`;
  }).join('\n');
  return `${sections}
<div class="nav-label">&nbsp;</div>
      <a class="nav-item" href="/dashboard">⌂ العودة للتطبيق</a>`;
}
