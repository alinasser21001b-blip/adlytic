// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/adminSurfaceNav.ts
//
//  ONE navigation block shared by every admin surface.
//
//  The five operator pages grew five different sidebars: the inbox was a
//  dead end (status filters only — no way back to the console at all),
//  observability linked to the customer app in English, add-client knew
//  about three of the five surfaces. Moving between admin windows meant
//  learning a different map on every page — the operator experienced that
//  as "navigation is broken", and they were right.
//
//  Every surface renders THIS block, so the same six destinations sit in
//  the same order everywhere. Host pages style it through their own
//  .nav-label / .nav-item rules — the block carries no styling of its own.
// ════════════════════════════════════════════════════════════════════════

export type AdminSurface = 'console' | 'inbox' | 'add-client' | 'observability' | 'readiness';

const SURFACES: { id: AdminSurface | null; href: string; label: string }[] = [
  { id: 'console',       href: '/admin',                label: 'لوحة الإدارة' },
  { id: 'inbox',         href: '/admin/inbox',          label: 'صندوق الدعم' },
  { id: 'add-client',    href: '/admin/add-client',     label: 'إضافة عميل' },
  { id: 'observability', href: '/admin/observability',  label: 'مراقبة المنصة' },
  { id: 'readiness',     href: '/admin/meta-readiness', label: 'جاهزية Meta' },
  { id: null,            href: '/dashboard',            label: '⌂ العودة للتطبيق' },
];

export function adminSurfaceNav(active: AdminSurface): string {
  return `<div class="nav-label">منصات الإدارة</div>
${SURFACES.map((s) =>
    `      <a class="nav-item${s.id === active ? ' active' : ''}" href="${s.href}">${s.label}</a>`,
  ).join('\n')}`;
}
