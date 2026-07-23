// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/dashboard/index.ts
//
//  Public entry point for the dashboard module. Re-exports the
//  composer from the sibling `dashboardPage.ts` so callers can import
//  from either `../pages/dashboardPage` (legacy) or `../pages/dashboard`
//  (new) without churn.
// ════════════════════════════════════════════════════════════════════════

export { dashboardPage } from '../dashboardPage';
