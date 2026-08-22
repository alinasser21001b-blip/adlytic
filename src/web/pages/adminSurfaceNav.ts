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
  // ── Control Plane domains ──
  | 'control-center'
  | 'graph'
  | 'meta'
  | 'intelligence'
  | 'operations'
  | 'customers'
  | 'support'
  | 'add-client'
  | 'observatory'
  // ── Legacy surfaces, still mounted, no longer in the global sidebar ──
  | 'console'
  | 'inbox'
  | 'observability'
  | 'readiness'
  | 'classic';

export interface AdminDestination {
  id: AdminSurface;
  href: string;
  label: string;
  /** One line on what an operator comes here to answer. */
  purpose: string;
}

export interface AdminSection {
  /** Canonical domain key. Six, one operator question each. */
  key: 'CONTROL_CENTER' | 'META_AND_DATA' | 'INTELLIGENCE' | 'OPERATIONS' | 'CUSTOMERS' | 'SUPPORT';
  label: string;
  /** The question an operator opens this domain to answer. */
  question: string;
  items: AdminDestination[];
}

/**
 * THE MAP — six domains, one Control Plane.
 *
 * ── What changed, and why it is not a rename ─────────────────────────
 *
 * The previous map listed six sections whose destinations were the HISTORICAL
 * PAGES: /admin/classic under "workspaces", /admin/meta-readiness under "Meta
 * & data", /admin/inbox under "support". The headings were domains; the links
 * underneath were the products the domains were supposed to replace. An
 * operator clicking "Meta والبيانات" left the console and arrived somewhere
 * that looked like a different application, with its own layout and its own
 * idea of where things live.
 *
 * Now every destination is a Control Plane surface rendered by ONE shell
 * (src/web/adminShell.ts). The historical pages are still mounted and still
 * work — see ADMIN_LEGACY below — but they are reached from inside the domain
 * that replaced them, not from the global sidebar. That is the difference
 * between consolidating and merely re-labelling.
 *
 * ── SECURITY & AUDIT is still deliberately ABSENT ────────────────────
 *
 * No route serves privileged-action history, deletion events or an audit
 * trail. Settings and payment events are configuration and ledger, not audit.
 * A heading over a link to those would tell an operator a capability exists
 * when it does not — the same dishonesty as rendering UNKNOWN as healthy.
 * Recorded as debt in docs/close-code/13_OPEN_DEBT_REGISTER.md.
 */
export const ADMIN_IA: AdminSection[] = [
  {
    key: 'CONTROL_CENTER', label: 'مركز التحكّم',
    question: 'ما الذي يحدث الآن؟',
    items: [
      { id: 'control-center', href: '/admin', label: 'الحالة الآن', purpose: 'نبض المنظومة وما يحتاج انتباهاً' },
      { id: 'graph', href: '/admin/graph', label: 'خريطة المنظومة', purpose: 'ما الذي يوجد وما الذي يعتمد على ماذا' },
    ],
  },
  {
    key: 'META_AND_DATA', label: 'Meta والبيانات',
    question: 'هل اتصالنا بـMeta وحقيقة بياناتنا سليمة؟',
    items: [
      { id: 'meta', href: '/admin/meta', label: 'Meta والبيانات', purpose: 'الاتصال والقدرات والكيانات والمزامنة والتغطية' },
    ],
  },
  {
    key: 'INTELLIGENCE', label: 'الذكاء',
    question: 'ماذا تعرف أدلَيتِك، وكيف استنتجت، وماذا قرّرت؟',
    items: [
      { id: 'intelligence', href: '/admin/intelligence', label: 'مساحة الذكاء', purpose: 'الأدلة والتشخيص والقرار وحدود المعرفة' },
      { id: 'observatory', href: '/admin/brain-observatory', label: 'مرصد الدماغ', purpose: 'الفحص العميق: من حقيقة Meta إلى القرار طبقة بطبقة' },
    ],
  },
  {
    key: 'OPERATIONS', label: 'العمليات',
    question: 'هل المنصة نفسها تعمل بشكل صحيح؟',
    items: [
      { id: 'operations', href: '/admin/operations', label: 'تشغيل المنصة', purpose: 'الخدمات والطوابير والمزامنة وهوية النسخة' },
    ],
  },
  {
    key: 'CUSTOMERS', label: 'الزبائن ومساحات العمل',
    question: 'من نخدم وكيف أُعدّت مساحاتهم؟',
    items: [
      { id: 'customers', href: '/admin/customers', label: 'الزبائن والاشتراكات', purpose: 'الحسابات والاشتراكات والمدفوعات والإعدادات' },
      { id: 'add-client', href: '/admin/add-client', label: 'إضافة عميل', purpose: 'معالج الإعداد من الصفر حتى أول مزامنة' },
    ],
  },
  {
    key: 'SUPPORT', label: 'الدعم',
    question: 'من يحتاج مساعدة وما الذي لم يُحلّ؟',
    items: [
      { id: 'support', href: '/admin/support', label: 'صندوق الدعم', purpose: 'تذاكر الزبائن غير المحلولة' },
    ],
  },
];

/**
 * Legacy surfaces: mounted, working, and NOT in the global sidebar.
 *
 * This list is the strangler contract, and it is enforced rather than
 * described. `test_admin_control_plane.ts` asserts that every route here is
 * still mounted, that the page named in `reachableFrom` actually links to it,
 * and — the load-bearing one — that a route is removed from this list only
 * when `routeParity()` over the capability registry reports nothing missing.
 *
 * A route that vanished from the sidebar but is not reachable from its
 * successor is not consolidated. It is hidden, which is how capability gets
 * lost while everyone believes it was migrated.
 */
export interface LegacySurface {
  id: AdminSurface;
  href: string;
  label: string;
  /** The Control Plane route that now owns this domain. */
  replacedBy: string;
  /** The page module that must link to it until parity is reached. */
  reachableFrom: string;
  /** Why it still exists. Never "we did not get to it". */
  stillOwns: string;
}

export const ADMIN_LEGACY: LegacySurface[] = [
  {
    id: 'classic', href: '/admin/classic', label: 'الكونسول الكلاسيكي',
    replacedBy: '/admin/customers', reachableFrom: 'customersWorkspacePage',
    stillOwns: 'أدراج تحرير الزبون والاشتراك والإعدادات بتفاصيلها الكاملة',
  },
  {
    id: 'observability', href: '/admin/observability', label: 'مراقبة المنصة',
    replacedBy: '/admin/operations', reachableFrom: 'operationsWorkspacePage',
    stillOwns: 'جداول الوصول والأموال المفصّلة وقائمة المستخدمين',
  },
  {
    id: 'readiness', href: '/admin/meta-readiness', label: 'جاهزية Meta',
    replacedBy: '/admin/meta', reachableFrom: 'metaDataWorkspacePage',
    stillOwns: 'تفاصيل الاستهلاك وسجل تدقيق نداءات Meta',
  },
  {
    id: 'inbox', href: '/admin/inbox', label: 'صندوق الدعم الكلاسيكي',
    replacedBy: '/admin/support', reachableFrom: 'supportWorkspacePage',
    stillOwns: 'محادثة التذكرة الكاملة والرد عليها',
  },
  {
    id: 'console', href: '/admin/os', label: 'Admin OS',
    replacedBy: '/admin', reachableFrom: 'controlCenterPage',
    stillOwns: 'السلّم المعرفي وعرض التجارب بصيغتهما الأصلية',
  },
];

/** Legacy routes as plain hrefs — used by the orphan test. */
export function legacySurfaceHrefs(): string[] {
  return ADMIN_LEGACY.map((l) => l.href);
}

/** Every destination, flattened — used by the route-coverage test. */
export function adminDestinations(): AdminDestination[] {
  return ADMIN_IA.flatMap((s) => s.items);
}

export function adminSurfaceNav(active: AdminSurface): string {
  const sections = ADMIN_IA.map((section) => {
    const items = section.items.map((i) =>
      `      <a class="nav-item${i.id === active ? ' active' : ''}" href="${i.href}" title="${i.purpose}">${i.label}</a>`,
    ).join('\n');
    return `<div class="nav-label" title="${section.question}">${section.label}</div>\n${items}`;
  }).join('\n');
  return `${sections}
<div class="nav-label">&nbsp;</div>
      <a class="nav-item" href="/dashboard">⌂ العودة للتطبيق</a>`;
}
