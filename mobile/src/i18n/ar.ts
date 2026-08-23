// ════════════════════════════════════════════════════════════════════════
//  src/i18n/ar.ts — the app's OWN words. Nothing else.
//
//  ── WHAT MAY LIVE HERE ────────────────────────────────────────────────
//  Chrome. Button labels, screen titles, the sentence shown when the
//  network is down, the word for "retry". Text about the APP.
//
//  ── WHAT MAY NOT ──────────────────────────────────────────────────────
//  Any word about a merchant's advertising. Issue titles, KPI names, action
//  labels, confidence wording, diagnosis prose, currency formatting — all of
//  those are localized SERVER-SIDE and arrive finished in the DTO. Adding
//  one here would create a second vocabulary that can disagree with the
//  product's, and the first time an engine's Arabic changed, the phone would
//  keep saying the old thing.
//
//  The rule this file follows is the one the codebase already states:
//  "the frontend never maps codes to text."
// ════════════════════════════════════════════════════════════════════════

export const ar = {
  appName: 'أدلَتِك',

  // ── Auth ──────────────────────────────────────────────────────────────
  signIn: 'تسجيل الدخول',
  email: 'البريد الإلكتروني',
  password: 'كلمة المرور',
  signingIn: 'جارٍ الدخول…',
  signOut: 'تسجيل الخروج',
  signOutConfirmTitle: 'تسجيل الخروج',
  signOutConfirmBody: 'سيتم إنهاء الجلسة على هذا الجهاز.',
  cancel: 'إلغاء',
  wrongCredentials: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
  tooManyAttempts: 'محاولات كثيرة. حاول بعد قليل.',
  sessionExpired: 'انتهت الجلسة. سجّل الدخول من جديد.',
  accountInactive: 'الحساب غير مُفعَّل بعد. تواصل معنا للتفعيل.',

  // ── Navigation ────────────────────────────────────────────────────────
  tabHome: 'الرئيسية',
  tabCampaigns: 'الحملات',
  tabAccount: 'الحساب',
  screenCampaign: 'الحملة',
  screenWhy: 'لماذا؟',
  screenConnect: 'ربط Meta',

  // ── Generic states ────────────────────────────────────────────────────
  loading: 'جارٍ التحميل…',
  retry: 'إعادة المحاولة',
  offline: 'لا يوجد اتصال بالإنترنت.',
  offlineBody: 'تحقّق من الاتصال ثم أعد المحاولة.',
  serverDown: 'تعذّر الوصول إلى أدلَتِك.',
  serverDownBody: 'الخدمة لا تستجيب حالياً. حاول بعد قليل.',
  serverSlow: 'الخدمة تأخذ وقتاً أطول من المعتاد.',
  unexpected: 'حدث خطأ غير متوقع.',
  notFound: 'العنصر غير موجود.',
  forbidden: 'ليس لديك صلاحية على هذا الحساب.',

  // ── Data-truth wording. These describe the STATE OF THE DATA, which is
  //    the app's own subject, not the merchant's advertising. ────────────
  notAvailable: 'غير متاح',
  notAvailableLong: 'لم توفّر Meta هذه القيمة',
  insufficientData: 'البيانات غير كافية',
  noValueExplain: 'لا يعني صفراً — القيمة ببساطة غير موجودة.',

  // ── Home ──────────────────────────────────────────────────────────────
  homeGreeting: 'حالة حسابك الآن',
  accountHealth: 'صحة الحساب',
  noHealthScore: 'لا توجد درجة صحّة بعد',
  priorityAction: 'الأولوية الآن',
  keyNumbers: 'الأرقام الأساسية',
  lastSynced: 'آخر مزامنة',
  neverSynced: 'لم تتم المزامنة بعد',
  attentionItems: 'يحتاج انتباهك',
  noAttentionItems: 'لا شيء يحتاج تدخّلاً عاجلاً الآن.',
  evidenceLabel: 'الدليل',
  expectationLabel: 'ما نتوقّعه',
  costLabel: 'كلفة الاستمرار',

  // ── Campaigns ─────────────────────────────────────────────────────────
  campaignsTitle: 'الحملات',
  noCampaigns: 'لا توجد حملات بعد.',
  noCampaignsBody: 'بمجرد أن تبدأ حملة على Meta ستظهر هنا.',
  campaignHealth: 'الصحة',

  // ── Campaign detail ───────────────────────────────────────────────────
  whatHappened: 'ماذا حدث؟',
  whyButton: 'لماذا يقول أدلَتِك ذلك؟',
  recommendedAction: 'الخطوة المقترحة',
  noRecommendation: 'لا توجد خطوة مقترحة لهذه الحملة الآن.',

  // ── Why / reasoning chain ─────────────────────────────────────────────
  whyTitle: 'كيف وصل أدلَتِك إلى هذه النتيجة',
  whyIntro: 'هذه هي الخطوات التي مرّت بها المنظومة، بالترتيب.',
  stageNotReached: 'لم تصل المنظومة إلى هذه المرحلة',
  stageNoReason: 'لا يوجد سبب مُسجَّل لتوقّف التحليل هنا.',
  dataTruthTitle: 'إلى أي حد يمكن الوثوق بهذه البيانات؟',
  counterEvidenceTitle: 'ما يعارض هذه النتيجة',
  notUnusualNote: 'الخلل موجود فعلاً، لكن حركته ضمن التقلّب الطبيعي لهذا الحساب.',
  forbiddenTitle: 'إجراءات لا ننصح بها هنا',
  deterministicNote: 'كل ما سبق مبني على قواعد ثابتة وأرقام مخزّنة — لا على نصّ مولَّد.',
  whyUnavailable: 'لا توجد فترة قابلة للقياس لهذه الحملة بعد.',
  whyUnavailableBody: 'عندما تتجمّع أيام كافية من البيانات ستظهر سلسلة التحليل هنا.',
  daysStored: 'أيام فيها بيانات',
  daysMissing: 'أيام بلا بيانات',

  // ── Meta connection ───────────────────────────────────────────────────
  metaTitle: 'حساب Meta الإعلاني',
  metaConnected: 'مرتبط',
  metaNotConnected: 'غير مرتبط',
  metaConnect: 'اربط حساب Meta',
  metaReconnect: 'أعد ربط حساب Meta',
  metaConnecting: 'جارٍ الربط…',
  metaCancelled: 'أُلغي الربط قبل اكتماله.',
  metaDenied: 'لم تُمنح الصلاحيات المطلوبة، فلم يكتمل الربط.',
  metaNoAccounts: 'لا توجد حسابات إعلانية يمكن لأدلَتِك قراءتها بهذه الصلاحيات.',
  metaUnavailable: 'ربط Meta غير متاح على الخادم حالياً.',
  metaChooseAccount: 'اختر الحساب الإعلاني',
  metaLinkAccount: 'اربط هذا الحساب',
  metaLinking: 'جارٍ الحفظ…',
  metaExpired: 'انتهت صلاحية ربط Meta. أعد الربط ليستمر التحديث.',

  // ── Account ───────────────────────────────────────────────────────────
  accountTitle: 'الحساب',
  deleteAccount: 'حذف الحساب',
  deleteAccountTitle: 'حذف الحساب نهائياً',
  deleteAccountBody: 'سيتم حذف حسابك وكل بياناته بشكل نهائي. لا يمكن التراجع عن هذا الإجراء.',
  deleteAccountConfirm: 'حذف نهائي',
  workspaceLabel: 'مساحة العمل',
  buildLabel: 'إصدار التطبيق',
  privacyPolicy: 'سياسة الخصوصية',
  dataDeletion: 'حذف البيانات',
} as const;

export type ArKey = keyof typeof ar;
