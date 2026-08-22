// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/adminCapabilities.ts
//
//  THE ADMIN CAPABILITY REGISTRY — what the operator can actually do.
//
//  ── Why this file exists ──────────────────────────────────────────────
//
//  The admin surface accumulated in generations: a classic console, an
//  Admin OS, a platform-observability page, a Meta readiness page, a
//  support inbox, an onboarding wizard, a Brain Observatory. Each was
//  built for a real reason and each still owns capability nobody else has.
//
//  The danger in consolidating them is not ugliness. It is SILENT LOSS —
//  a capability that lived in a tab nobody re-read, deleted because the
//  page around it looked old. `docs/close-code/12` already recorded one
//  near-miss: redirecting /admin/classic into /admin would have removed
//  settings, subscriptions and payment events without anyone noticing.
//
//  So migration is not tracked in prose. It is tracked HERE, per
//  capability, and a test computes parity from this table. A legacy route
//  may be retired only when every capability it owns reports a home in the
//  Control Plane. The registry is the gate; the document merely reports it.
//
//  ── Discipline ────────────────────────────────────────────────────────
//
//  Every row was read out of `src/api/server.ts` and the page that calls
//  it. `canonicalBackend` names a route that exists; the test asserts it is
//  mounted. Nothing here is aspirational — a capability we want but have
//  not built has no row, because a registry that lists intentions cannot
//  be used to prove nothing was lost.
// ════════════════════════════════════════════════════════════════════════

/** The six Control Plane domains. One question each, from the closure spec. */
export type ControlPlaneDomain =
  | 'CONTROL_CENTER'   // what is happening right now?
  | 'META_AND_DATA'    // is our connection to Meta and our data truth healthy?
  | 'INTELLIGENCE'     // what does Adlytic know, how did it reason, what did it decide?
  | 'OPERATIONS'       // is the platform itself operating correctly?
  | 'CUSTOMERS'        // who are we serving and how are their workspaces configured?
  | 'SUPPORT';         // who needs assistance and what is unresolved?

/**
 * What we are allowed to do with a capability during consolidation.
 *
 * KEEP  — stays exactly where it is; the Control Plane links to it.
 * REUSE — the Control Plane renders it from the SAME backend, no new API.
 * MOVE  — its home route changes; the backend does not.
 * WRAP  — hosted inside the shell without rewriting its internals.
 * MERGE — two duplicate surfaces collapse onto one renderer.
 * DEPRECATE_AFTER_PARITY — the legacy host may retire once parity is 100%.
 * REMOVE_AFTER_PROOF     — removable only with proof nothing consumes it.
 */
export type MigrationAction =
  | 'KEEP' | 'REUSE' | 'MOVE' | 'WRAP' | 'MERGE'
  | 'DEPRECATE_AFTER_PARITY' | 'REMOVE_AFTER_PROOF';

/**
 * Write classification, copied from `docs/close-code/09` rather than
 * re-invented, so one vocabulary describes admin danger everywhere.
 */
export type CapabilityAccess =
  | 'READ_ONLY' | 'SAFE_MUTATION' | 'PRIVILEGED_MUTATION' | 'DESTRUCTIVE';

export interface AdminCapability {
  id: string;
  /** Arabic operator-facing name. */
  name: string;
  /** The route an operator uses today. */
  currentRoute: string;
  /** The module that renders it today. */
  currentPage: string;
  /**
   * The ONE server route that owns this capability's data or effect.
   * `—` where the capability is a view over another capability's payload
   * (the ops snapshot serves six of them), which is itself a fact worth
   * recording: those cannot diverge, because there is nothing to diverge.
   */
  canonicalBackend: string;
  access: CapabilityAccess;
  /** Every admin capability is platform-admin. Stated so a future one that isn't stands out. */
  authLevel: 'PLATFORM_ADMIN' | 'PUBLIC';
  /** What an operator loses if this disappears. Impact, not restatement. */
  operatorValue: string;
  /** Another capability id this duplicates, when one surface shadows another. */
  duplicateOf?: string;
  /** Capability ids this one needs to be meaningful. */
  dependencies: string[];
  domain: ControlPlaneDomain;
  action: MigrationAction;
  /**
   * Where the Control Plane serves it. Null means: not yet hosted in the
   * Control Plane — which is precisely what blocks its legacy route from
   * being deprecated. Never fill this in optimistically.
   */
  controlPlaneRoute: string | null;
}

import { adminDestinations } from './adminSurfaceNav';

const C = (c: AdminCapability): AdminCapability => c;

export const ADMIN_CAPABILITIES: AdminCapability[] = [
  // ── CONTROL CENTER ────────────────────────────────────────────────────
  // Six views over ONE payload (`/api/admin/ops`). Listed separately because
  // an operator loses a distinct answer if any one stops being rendered.
  C({
    id: 'cap.pulse.subsystems', name: 'نبض المنظومة',
    currentRoute: '/admin/os', currentPage: 'adminOsPage', canonicalBackend: 'GET /api/admin/ops',
    access: 'READ_ONLY', authLevel: 'PLATFORM_ADMIN',
    operatorValue: 'حالة قاعدة البيانات وRedis والطوابير والعمال وMeta في مكان واحد',
    dependencies: [], domain: 'CONTROL_CENTER', action: 'REUSE',
    controlPlaneRoute: '/admin',
  }),
  C({
    id: 'cap.pulse.attention', name: 'ما يحتاج انتباهاً',
    currentRoute: '/admin/os', currentPage: 'adminOsPage', canonicalBackend: 'GET /api/admin/ops',
    access: 'READ_ONLY', authLevel: 'PLATFORM_ADMIN',
    operatorValue: 'طابور واحد مرتّب بالخطورة لكل ما يحتاج تدخّلاً',
    dependencies: ['cap.pulse.subsystems'], domain: 'CONTROL_CENTER', action: 'REUSE',
    controlPlaneRoute: '/admin',
  }),
  C({
    id: 'cap.pulse.workspaces', name: 'مساحات العمل المعرّضة للخطر',
    currentRoute: '/admin/os', currentPage: 'adminOsPage', canonicalBackend: 'GET /api/admin/ops',
    access: 'READ_ONLY', authLevel: 'PLATFORM_ADMIN',
    operatorValue: 'أي زبون متأثر الآن — اتصال Meta وحداثة البيانات لكل مساحة',
    dependencies: ['cap.pulse.subsystems'], domain: 'CONTROL_CENTER', action: 'REUSE',
    controlPlaneRoute: '/admin',
  }),
  C({
    id: 'cap.pulse.activity', name: 'الخط الزمني التشغيلي',
    currentRoute: '/admin/os', currentPage: 'adminOsPage', canonicalBackend: 'GET /api/admin/ops',
    access: 'READ_ONLY', authLevel: 'PLATFORM_ADMIN',
    operatorValue: 'ما الذي تغيّر: عمليات المزامنة وحالاتها',
    dependencies: ['cap.pulse.subsystems'], domain: 'CONTROL_CENTER', action: 'REUSE',
    controlPlaneRoute: '/admin',
  }),
  C({
    id: 'cap.pulse.build', name: 'هوية النسخة العاملة',
    currentRoute: '/admin/os', currentPage: 'adminOsPage', canonicalBackend: 'GET /api/admin/ops',
    access: 'READ_ONLY', authLevel: 'PLATFORM_ADMIN',
    operatorValue: 'أي commit يعمل الآن — الفرق بين ما دُفع وما ينفَّذ',
    dependencies: ['cap.pulse.subsystems'], domain: 'CONTROL_CENTER', action: 'REUSE',
    controlPlaneRoute: '/admin',
  }),
  C({
    id: 'cap.graph.system', name: 'خريطة المنظومة',
    currentRoute: '/admin/graph', currentPage: 'systemGraphPage',
    canonicalBackend: 'GET /api/admin/graph/architecture',
    access: 'READ_ONLY', authLevel: 'PLATFORM_ADMIN',
    operatorValue: 'ما الذي يوجد، وما الذي يعتمد على ماذا، وأين تتدفق البيانات',
    dependencies: [], domain: 'CONTROL_CENTER', action: 'KEEP',
    controlPlaneRoute: '/admin/graph',
  }),

  // ── META & DATA ───────────────────────────────────────────────────────
  C({
    id: 'cap.meta.readiness', name: 'جاهزية Meta',
    currentRoute: '/admin/meta-readiness', currentPage: 'metaReadinessPage',
    canonicalBackend: 'GET /api/admin/meta-usage',
    access: 'READ_ONLY', authLevel: 'PLATFORM_ADMIN',
    operatorValue: 'الصلاحيات والقدرات وحدود الاستهلاك مقابل Meta',
    dependencies: [], domain: 'META_AND_DATA', action: 'WRAP',
    controlPlaneRoute: '/admin/meta',
  }),
  C({
    id: 'cap.meta.probe', name: 'مرقاب قدرات Meta',
    currentRoute: '/admin/classic', currentPage: 'adminConsolePage',
    canonicalBackend: 'POST /api/admin/capability-probe',
    access: 'SAFE_MUTATION', authLevel: 'PLATFORM_ADMIN',
    operatorValue: 'هل يقبل Meta هذا الحقل فعلاً — قياس، لا افتراض',
    // Both consoles run the same probe against the same route.
    dependencies: [], domain: 'META_AND_DATA', action: 'MERGE',
    controlPlaneRoute: '/admin/meta',
  }),
  C({
    id: 'cap.meta.probe.os', name: 'التجارب (مرقاب القدرات في Admin OS)',
    currentRoute: '/admin/os', currentPage: 'adminOsPage',
    canonicalBackend: 'POST /api/admin/capability-probe',
    access: 'SAFE_MUTATION', authLevel: 'PLATFORM_ADMIN',
    operatorValue: 'نفس المرقاب معروضاً في نافذة ثانية',
    duplicateOf: 'cap.meta.probe',
    dependencies: ['cap.meta.probe'], domain: 'META_AND_DATA', action: 'MERGE',
    controlPlaneRoute: '/admin/meta',
  }),
  C({
    id: 'cap.meta.usage', name: 'استهلاك واجهة Meta',
    currentRoute: '/admin/meta-readiness', currentPage: 'metaReadinessPage',
    canonicalBackend: 'GET /api/admin/meta-usage',
    access: 'READ_ONLY', authLevel: 'PLATFORM_ADMIN',
    operatorValue: 'أين نحن من حدود المعدّل قبل أن نصطدم بها',
    dependencies: [], domain: 'META_AND_DATA', action: 'REUSE',
    controlPlaneRoute: '/admin/meta',
  }),
  C({
    id: 'cap.meta.audit', name: 'تدقيق مكالمات Meta',
    currentRoute: '/admin/meta-readiness', currentPage: 'metaReadinessPage',
    canonicalBackend: 'GET /api/admin/meta-audit',
    access: 'READ_ONLY', authLevel: 'PLATFORM_ADMIN',
    operatorValue: 'أي نداء فشل ولماذا — سجل الإخفاقات لا ملخّصها',
    dependencies: [], domain: 'META_AND_DATA', action: 'REUSE',
    controlPlaneRoute: '/admin/meta',
  }),
  C({
    id: 'cap.meta.discover', name: 'اكتشاف الحسابات الإعلانية',
    currentRoute: '/admin/add-client', currentPage: 'addClientPage',
    canonicalBackend: 'GET /api/admin/meta/discover-accounts',
    access: 'READ_ONLY', authLevel: 'PLATFORM_ADMIN',
    operatorValue: 'أي حسابات يملكها هذا الرمز فعلاً',
    dependencies: [], domain: 'META_AND_DATA', action: 'REUSE',
    controlPlaneRoute: '/admin/meta',
  }),
  C({
    id: 'cap.meta.checkAccount', name: 'فحص حساب إعلاني',
    currentRoute: '/admin/add-client', currentPage: 'addClientPage',
    canonicalBackend: 'GET /api/admin/meta/check-account',
    access: 'READ_ONLY', authLevel: 'PLATFORM_ADMIN',
    operatorValue: 'هل هذا الحساب صالح للربط قبل أن نربطه',
    dependencies: ['cap.meta.discover'], domain: 'META_AND_DATA', action: 'REUSE',
    controlPlaneRoute: '/admin/meta',
  }),
  C({
    id: 'cap.meta.sync', name: 'حالة المزامنة والتغطية',
    currentRoute: '/admin/os', currentPage: 'adminOsPage', canonicalBackend: 'GET /api/admin/ops',
    access: 'READ_ONLY', authLevel: 'PLATFORM_ADMIN',
    operatorValue: 'آخر مزامنة ناجحة وعمر أحدث بيانات لكل حساب',
    dependencies: ['cap.pulse.subsystems'], domain: 'META_AND_DATA', action: 'REUSE',
    controlPlaneRoute: '/admin/meta',
  }),

  // ── INTELLIGENCE ──────────────────────────────────────────────────────
  C({
    id: 'cap.brain.campaigns', name: 'اختيار حملة للفحص',
    currentRoute: '/admin/brain-observatory', currentPage: 'brainObservatoryPage',
    canonicalBackend: 'GET /api/admin/brain-observatory/campaigns',
    access: 'READ_ONLY', authLevel: 'PLATFORM_ADMIN',
    operatorValue: 'أي حملة يمكن تتبّع تفكير الدماغ عليها',
    dependencies: [], domain: 'INTELLIGENCE', action: 'REUSE',
    controlPlaneRoute: '/admin/brain-observatory',
  }),
  C({
    id: 'cap.brain.observatory', name: 'مرصد الدماغ',
    currentRoute: '/admin/brain-observatory', currentPage: 'brainObservatoryPage',
    canonicalBackend: 'GET /api/admin/brain-observatory/:campaignId',
    access: 'READ_ONLY', authLevel: 'PLATFORM_ADMIN',
    operatorValue: 'من حقيقة Meta إلى القرار — طبقة بطبقة، بالبرهان',
    dependencies: ['cap.brain.campaigns'], domain: 'INTELLIGENCE', action: 'KEEP',
    controlPlaneRoute: '/admin/brain-observatory',
  }),
  C({
    id: 'cap.brain.trace', name: 'أثر الذكاء على الخريطة',
    currentRoute: '/admin/graph', currentPage: 'systemGraphPage',
    canonicalBackend: 'GET /api/admin/graph/trace/:campaignId',
    access: 'READ_ONLY', authLevel: 'PLATFORM_ADMIN',
    operatorValue: 'أي مكوّنات شاركت فعلاً في قرار بعينه',
    dependencies: ['cap.brain.observatory', 'cap.graph.system'],
    domain: 'INTELLIGENCE', action: 'KEEP',
    controlPlaneRoute: '/admin/graph',
  }),
  C({
    id: 'cap.knowledge.limits', name: 'حدود المعرفة',
    currentRoute: '/admin/os', currentPage: 'adminOsPage', canonicalBackend: 'GET /api/admin/ops',
    access: 'READ_ONLY', authLevel: 'PLATFORM_ADMIN',
    operatorValue: 'ما لا نعرفه ولماذا وما الذي يغلق الفجوة — حافة الخريطة',
    dependencies: ['cap.pulse.subsystems'], domain: 'INTELLIGENCE', action: 'REUSE',
    controlPlaneRoute: '/admin/intelligence',
  }),
  C({
    id: 'cap.intel.coverage', name: 'تغطية السرد والقطات',
    currentRoute: '/admin/observability', currentPage: 'adminDashboardPage',
    canonicalBackend: 'GET /api/admin/platform-stats',
    access: 'READ_ONLY', authLevel: 'PLATFORM_ADMIN',
    operatorValue: 'كم حملة وصلها الدماغ فعلاً، وكم منها سُردت',
    dependencies: [], domain: 'INTELLIGENCE', action: 'REUSE',
    controlPlaneRoute: '/admin/intelligence',
  }),

  // ── OPERATIONS ────────────────────────────────────────────────────────
  C({
    id: 'cap.ops.platformStats', name: 'إحصاءات المنصة',
    currentRoute: '/admin/observability', currentPage: 'adminDashboardPage',
    canonicalBackend: 'GET /api/admin/platform-stats',
    access: 'READ_ONLY', authLevel: 'PLATFORM_ADMIN',
    operatorValue: 'الوصول والميزانيات وصحة الدماغ على مستوى المنصة',
    dependencies: [], domain: 'OPERATIONS', action: 'REUSE',
    controlPlaneRoute: '/admin/operations',
  }),
  C({
    id: 'cap.ops.cacheBust', name: 'إبطال ذاكرة الإحصاءات',
    currentRoute: '/admin/observability', currentPage: 'adminDashboardPage',
    canonicalBackend: 'POST /api/admin/cache/bust',
    access: 'SAFE_MUTATION', authLevel: 'PLATFORM_ADMIN',
    operatorValue: 'إجبار إعادة الحساب بعد إصلاح عاجل',
    dependencies: ['cap.ops.platformStats'], domain: 'OPERATIONS', action: 'REUSE',
    controlPlaneRoute: '/admin/operations',
  }),
  C({
    id: 'cap.ops.users', name: 'قائمة المستخدمين وحالة التفعيل',
    currentRoute: '/admin/observability', currentPage: 'adminDashboardPage',
    canonicalBackend: 'GET /api/admin/users',
    access: 'READ_ONLY', authLevel: 'PLATFORM_ADMIN',
    operatorValue: 'من ينتظر التفعيل يدوياً',
    dependencies: [], domain: 'OPERATIONS', action: 'REUSE',
    controlPlaneRoute: '/admin/operations',
  }),
  C({
    id: 'cap.ops.userActivate', name: 'تفعيل حساب',
    currentRoute: '/admin/classic', currentPage: 'adminConsolePage',
    canonicalBackend: 'POST /api/admin/users/activate',
    access: 'PRIVILEGED_MUTATION', authLevel: 'PLATFORM_ADMIN',
    operatorValue: 'فتح الوصول لزبون بعد التحقق',
    dependencies: ['cap.ops.users'], domain: 'OPERATIONS', action: 'REUSE',
    controlPlaneRoute: '/admin/operations',
  }),
  C({
    id: 'cap.ops.userDeactivate', name: 'تعليق حساب',
    currentRoute: '/admin/classic', currentPage: 'adminConsolePage',
    canonicalBackend: 'POST /api/admin/users/deactivate',
    access: 'PRIVILEGED_MUTATION', authLevel: 'PLATFORM_ADMIN',
    operatorValue: 'إيقاف وصول زبون فوراً',
    dependencies: ['cap.ops.users'], domain: 'OPERATIONS', action: 'REUSE',
    controlPlaneRoute: '/admin/operations',
  }),
  C({
    id: 'cap.ops.reconcileActions', name: 'إصلاح تداخل الأحداث التاريخية',
    currentRoute: '(no UI — operator calls the route directly)', currentPage: '—',
    canonicalBackend: 'POST /api/admin/reconcile-actions',
    access: 'PRIVILEGED_MUTATION', authLevel: 'PLATFORM_ADMIN',
    operatorValue: 'معالجة ازدواج الأحداث المخزّنة بأثر رجعي',
    dependencies: [], domain: 'OPERATIONS', action: 'KEEP',
    // Deliberately null: it has no operator surface today, in either console.
    // Recording it as hosted would be the exact dishonesty this file prevents.
    controlPlaneRoute: null,
  }),

  // ── CUSTOMERS & WORKSPACES ────────────────────────────────────────────
  C({
    id: 'cap.customers.overview', name: 'مؤشرات الكونسول',
    currentRoute: '/admin/classic', currentPage: 'adminConsolePage',
    canonicalBackend: 'GET /api/admin/overview',
    access: 'READ_ONLY', authLevel: 'PLATFORM_ADMIN',
    operatorValue: 'شريط الأرقام العلوي: زبائن، مساحات، اشتراكات',
    dependencies: [], domain: 'CUSTOMERS', action: 'REUSE',
    controlPlaneRoute: '/admin/customers',
  }),
  C({
    id: 'cap.customers.list', name: 'قائمة الزبائن',
    currentRoute: '/admin/classic', currentPage: 'adminConsolePage',
    canonicalBackend: 'GET /api/admin/customers',
    access: 'READ_ONLY', authLevel: 'PLATFORM_ADMIN',
    operatorValue: 'البحث عن زبون بالاسم أو البريد',
    dependencies: [], domain: 'CUSTOMERS', action: 'REUSE',
    controlPlaneRoute: '/admin/customers',
  }),
  C({
    id: 'cap.customers.detail', name: 'تفاصيل زبون',
    currentRoute: '/admin/classic', currentPage: 'adminConsolePage',
    canonicalBackend: 'GET /api/admin/customers/:userId',
    access: 'READ_ONLY', authLevel: 'PLATFORM_ADMIN',
    operatorValue: 'مساحاته واشتراكه ونشاطه في لوح واحد',
    dependencies: ['cap.customers.list'], domain: 'CUSTOMERS', action: 'REUSE',
    controlPlaneRoute: '/admin/customers',
  }),
  C({
    id: 'cap.customers.create', name: 'إنشاء حساب زبون',
    currentRoute: '/admin/classic', currentPage: 'adminConsolePage',
    canonicalBackend: 'POST /api/admin/customers',
    access: 'PRIVILEGED_MUTATION', authLevel: 'PLATFORM_ADMIN',
    operatorValue: 'إنشاء زبون ومساحة عمل دفعة واحدة',
    dependencies: [], domain: 'CUSTOMERS', action: 'REUSE',
    controlPlaneRoute: '/admin/customers',
  }),
  C({
    id: 'cap.customers.edit', name: 'تعديل بيانات زبون',
    currentRoute: '/admin/classic', currentPage: 'adminConsolePage',
    canonicalBackend: 'PATCH /api/admin/customers/:userId',
    access: 'PRIVILEGED_MUTATION', authLevel: 'PLATFORM_ADMIN',
    operatorValue: 'تصحيح الاسم أو البريد أو اللغة',
    dependencies: ['cap.customers.detail'], domain: 'CUSTOMERS', action: 'REUSE',
    controlPlaneRoute: '/admin/customers',
  }),
  C({
    id: 'cap.customers.resetPassword', name: 'إعادة تعيين كلمة المرور',
    currentRoute: '/admin/classic', currentPage: 'adminConsolePage',
    canonicalBackend: 'POST /api/admin/customers/:userId/reset-password',
    access: 'PRIVILEGED_MUTATION', authLevel: 'PLATFORM_ADMIN',
    operatorValue: 'استعادة وصول زبون فقد كلمته',
    dependencies: ['cap.customers.detail'], domain: 'CUSTOMERS', action: 'REUSE',
    controlPlaneRoute: '/admin/customers',
  }),
  C({
    id: 'cap.customers.delete', name: 'حذف زبون نهائياً',
    currentRoute: '/admin/classic', currentPage: 'adminConsolePage',
    canonicalBackend: 'DELETE /api/admin/customers/:userId',
    access: 'DESTRUCTIVE', authLevel: 'PLATFORM_ADMIN',
    operatorValue: 'الامتثال لطلب حذف بيانات',
    dependencies: ['cap.customers.detail'], domain: 'CUSTOMERS', action: 'REUSE',
    controlPlaneRoute: '/admin/customers',
  }),
  C({
    id: 'cap.subscriptions.list', name: 'الاشتراكات',
    currentRoute: '/admin/classic', currentPage: 'adminConsolePage',
    canonicalBackend: 'GET /api/admin/subscriptions',
    access: 'READ_ONLY', authLevel: 'PLATFORM_ADMIN',
    operatorValue: 'كل مساحة عمل وحالتها الفوترية',
    dependencies: [], domain: 'CUSTOMERS', action: 'REUSE',
    controlPlaneRoute: '/admin/customers',
  }),
  C({
    id: 'cap.subscriptions.activate', name: 'تفعيل اشتراك يدوياً',
    currentRoute: '/admin/classic', currentPage: 'adminConsolePage',
    canonicalBackend: 'POST /api/admin/subscriptions/activate-manual',
    access: 'PRIVILEGED_MUTATION', authLevel: 'PLATFORM_ADMIN',
    operatorValue: 'منح Premium بعد دفع خارج البوابة',
    dependencies: ['cap.subscriptions.list'], domain: 'CUSTOMERS', action: 'REUSE',
    controlPlaneRoute: '/admin/customers',
  }),
  C({
    id: 'cap.subscriptions.cancel', name: 'إلغاء اشتراك',
    currentRoute: '/admin/classic', currentPage: 'adminConsolePage',
    canonicalBackend: 'POST /api/admin/subscriptions/cancel-manual',
    access: 'PRIVILEGED_MUTATION', authLevel: 'PLATFORM_ADMIN',
    operatorValue: 'سحب Premium عند انتهاء العلاقة',
    dependencies: ['cap.subscriptions.list'], domain: 'CUSTOMERS', action: 'REUSE',
    controlPlaneRoute: '/admin/customers',
  }),
  C({
    id: 'cap.subscriptions.extend', name: 'تمديد اشتراك',
    currentRoute: '/admin/classic', currentPage: 'adminConsolePage',
    canonicalBackend: 'POST /api/admin/subscriptions/extend',
    access: 'PRIVILEGED_MUTATION', authLevel: 'PLATFORM_ADMIN',
    operatorValue: 'دفع تاريخ الانتهاء للأمام دون إعادة إنشاء',
    dependencies: ['cap.subscriptions.list'], domain: 'CUSTOMERS', action: 'REUSE',
    controlPlaneRoute: '/admin/customers',
  }),
  C({
    id: 'cap.payments.ledger', name: 'سجل المدفوعات',
    currentRoute: '/admin/classic', currentPage: 'adminConsolePage',
    canonicalBackend: 'GET /api/admin/payment-events',
    access: 'READ_ONLY', authLevel: 'PLATFORM_ADMIN',
    operatorValue: 'أحداث الدفع الأخيرة — الأقرب الموجود إلى أثر مالي',
    dependencies: [], domain: 'CUSTOMERS', action: 'REUSE',
    controlPlaneRoute: '/admin/customers',
  }),
  C({
    id: 'cap.settings.read', name: 'قراءة إعدادات المنصة',
    currentRoute: '/admin/classic', currentPage: 'adminConsolePage',
    canonicalBackend: 'GET /api/admin/settings',
    access: 'READ_ONLY', authLevel: 'PLATFORM_ADMIN',
    operatorValue: 'ما هي القيم الفعلية التي تعمل بها المنصة',
    dependencies: [], domain: 'CUSTOMERS', action: 'REUSE',
    controlPlaneRoute: '/admin/customers',
  }),
  C({
    id: 'cap.settings.write', name: 'تعديل إعدادات المنصة',
    currentRoute: '/admin/classic', currentPage: 'adminConsolePage',
    canonicalBackend: 'PUT /api/admin/settings/:key',
    access: 'PRIVILEGED_MUTATION', authLevel: 'PLATFORM_ADMIN',
    operatorValue: 'تغيير سلوك المنصة دون إعادة نشر',
    dependencies: ['cap.settings.read'], domain: 'CUSTOMERS', action: 'REUSE',
    controlPlaneRoute: '/admin/customers',
  }),
  C({
    id: 'cap.settings.seed', name: 'زرع الإعدادات الافتراضية',
    currentRoute: '/admin/classic', currentPage: 'adminConsolePage',
    canonicalBackend: 'POST /api/admin/settings/seed',
    access: 'PRIVILEGED_MUTATION', authLevel: 'PLATFORM_ADMIN',
    operatorValue: 'تهيئة منصة جديدة بقيم معروفة',
    dependencies: ['cap.settings.read'], domain: 'CUSTOMERS', action: 'REUSE',
    controlPlaneRoute: '/admin/customers',
  }),
  C({
    id: 'cap.onboarding.start', name: 'بدء إعداد عميل',
    currentRoute: '/admin/add-client', currentPage: 'addClientPage',
    canonicalBackend: 'POST /api/admin/onboarding',
    access: 'PRIVILEGED_MUTATION', authLevel: 'PLATFORM_ADMIN',
    operatorValue: 'معالج الربط الكامل من الصفر حتى أول مزامنة',
    dependencies: ['cap.meta.discover'], domain: 'CUSTOMERS', action: 'WRAP',
    controlPlaneRoute: '/admin/add-client',
  }),
  C({
    id: 'cap.onboarding.track', name: 'متابعة إعداد عميل',
    currentRoute: '/admin/add-client', currentPage: 'addClientPage',
    canonicalBackend: 'GET /api/admin/onboarding/:id',
    access: 'READ_ONLY', authLevel: 'PLATFORM_ADMIN',
    operatorValue: 'أين توقّف الإعداد ولماذا — بخط زمني مدقّق',
    dependencies: ['cap.onboarding.start'], domain: 'CUSTOMERS', action: 'WRAP',
    controlPlaneRoute: '/admin/add-client',
  }),
  C({
    id: 'cap.onboarding.check', name: 'تحقّق الآن من الإعداد',
    currentRoute: '/admin/add-client', currentPage: 'addClientPage',
    canonicalBackend: 'POST /api/admin/onboarding/:id/check',
    access: 'SAFE_MUTATION', authLevel: 'PLATFORM_ADMIN',
    operatorValue: 'دفع الفحص يدوياً بدل انتظار الدورة',
    dependencies: ['cap.onboarding.track'], domain: 'CUSTOMERS', action: 'WRAP',
    controlPlaneRoute: '/admin/add-client',
  }),

  // ── SUPPORT ───────────────────────────────────────────────────────────
  C({
    id: 'cap.support.counts', name: 'عدّادات الدعم',
    currentRoute: '/admin/inbox', currentPage: 'adminInboxPage',
    canonicalBackend: 'GET /api/admin/support/counts',
    access: 'READ_ONLY', authLevel: 'PLATFORM_ADMIN',
    operatorValue: 'كم تذكرة مفتوحة وعاجلة الآن',
    dependencies: [], domain: 'SUPPORT', action: 'REUSE',
    controlPlaneRoute: '/admin/support',
  }),
  C({
    id: 'cap.support.tickets', name: 'قائمة التذاكر',
    currentRoute: '/admin/inbox', currentPage: 'adminInboxPage',
    canonicalBackend: 'GET /api/admin/support/tickets',
    access: 'READ_ONLY', authLevel: 'PLATFORM_ADMIN',
    operatorValue: 'من ينتظر رداً، مرتّباً بالأولوية',
    dependencies: ['cap.support.counts'], domain: 'SUPPORT', action: 'WRAP',
    controlPlaneRoute: '/admin/support',
  }),
  C({
    id: 'cap.support.thread', name: 'محادثة تذكرة',
    currentRoute: '/admin/inbox', currentPage: 'adminInboxPage',
    canonicalBackend: 'GET /api/admin/support/tickets/:ticketId',
    access: 'READ_ONLY', authLevel: 'PLATFORM_ADMIN',
    operatorValue: 'السياق الكامل قبل الرد — بما فيه مساحة عمل الزبون',
    dependencies: ['cap.support.tickets'], domain: 'SUPPORT', action: 'WRAP',
    controlPlaneRoute: '/admin/support',
  }),
  C({
    id: 'cap.support.reply', name: 'الرد على تذكرة',
    currentRoute: '/admin/inbox', currentPage: 'adminInboxPage',
    canonicalBackend: 'POST /api/admin/support/tickets/:ticketId/reply',
    access: 'SAFE_MUTATION', authLevel: 'PLATFORM_ADMIN',
    operatorValue: 'الرد على الزبون من داخل المنصة',
    dependencies: ['cap.support.thread'], domain: 'SUPPORT', action: 'WRAP',
    controlPlaneRoute: '/admin/support',
  }),
  C({
    id: 'cap.support.triage', name: 'تغيير حالة/أولوية تذكرة',
    currentRoute: '/admin/inbox', currentPage: 'adminInboxPage',
    canonicalBackend: 'PATCH /api/admin/support/tickets/:ticketId',
    access: 'SAFE_MUTATION', authLevel: 'PLATFORM_ADMIN',
    operatorValue: 'إغلاق ما حُلّ وترفيع ما استعجل',
    dependencies: ['cap.support.thread'], domain: 'SUPPORT', action: 'WRAP',
    controlPlaneRoute: '/admin/support',
  }),
];

// ── Derived views. Computed, never hand-maintained ──────────────────────

export function capabilitiesForDomain(d: ControlPlaneDomain): AdminCapability[] {
  return ADMIN_CAPABILITIES.filter((c) => c.domain === d);
}

/** Capabilities a legacy route owns today. */
export function capabilitiesOfRoute(route: string): AdminCapability[] {
  return ADMIN_CAPABILITIES.filter((c) => c.currentRoute === route);
}

export interface RouteParity {
  legacyRoute: string;
  legacyCapabilityCount: number;
  migratedCapabilityCount: number;
  missingCapabilities: string[];
  /** 0–100, integer. 100 with an empty `missing` list is the only pass. */
  parityPct: number;
  safeToDeprecate: boolean;
}

/**
 * Parity for one legacy route, COMPUTED.
 *
 * A capability counts as migrated when the Control Plane names a route that
 * serves it. Not when a document says so, and not when a menu links to the
 * legacy page — a link back to the old product is the thing we are trying
 * to stop doing, not evidence that we stopped.
 */
export function routeParity(legacyRoute: string): RouteParity {
  const owned = capabilitiesOfRoute(legacyRoute);
  const missing = owned.filter((c) => c.controlPlaneRoute === null);
  const migrated = owned.length - missing.length;
  return {
    legacyRoute,
    legacyCapabilityCount: owned.length,
    migratedCapabilityCount: migrated,
    missingCapabilities: missing.map((c) => c.id),
    parityPct: owned.length === 0 ? 100 : Math.round((migrated / owned.length) * 100),
    safeToDeprecate: missing.length === 0,
  };
}

/**
 * Legacy routes: those hosting at least one capability whose canonical home
 * is somewhere else.
 *
 * Defined by the DIFFERENCE between where a capability lives and where it
 * belongs, not by a hand-kept list — so a route stops being legacy exactly
 * when the last capability it shadows is served from its own home, and never
 * because somebody deleted a line.
 */
export function legacyRoutes(): string[] {
  const canonical = new Set(adminDestinations().map((d) => d.href));
  return [...new Set(
    ADMIN_CAPABILITIES
      .map((c) => c.currentRoute)
      .filter((r) => r.startsWith('/admin') && !canonical.has(r)),
  )].sort();
}

/** Capabilities with no Control Plane home — the deprecation blockers. */
export function unhostedCapabilities(): AdminCapability[] {
  return ADMIN_CAPABILITIES.filter((c) => c.controlPlaneRoute === null);
}

/** Duplicated surfaces: same capability rendered by two products. */
export function duplicatedCapabilities(): AdminCapability[] {
  return ADMIN_CAPABILITIES.filter((c) => c.duplicateOf !== undefined);
}
