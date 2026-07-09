// ════════════════════════════════════════════════════════════════════════
//  src/lib/plainArabicAdvice.ts
//
//  Single presentation contract for merchant-facing advice:
//    فهم → قرار → فعل → تحقق
//  No engine codes, no raw English jargon in UI/AI context.
// ════════════════════════════════════════════════════════════════════════

export type AdviceSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface AdviceTask {
  /** Stable key for apply/ignore closed-loop (issue:CODE | priority:ACTION). */
  itemKey: string;
  issueCode: string | null;
  actionCode: string | null;
  severity: AdviceSeverity;
  severityLabel: string;
  /** ماذا يحدث؟ */
  title: string;
  /** لماذا يهم؟ */
  why: string;
  /** ماذا تفعل الآن؟ (headline) */
  action: string;
  /** خطوات قابلة للتنفيذ */
  steps: string[];
  /** ماذا تتوقع؟ / متى تراجع؟ */
  expect: string;
  /** Ask-AI prefill without jargon */
  askAi: string;
}

const ISSUE_TITLES: Record<string, string> = {
  LOW_CTR: 'الإعلان لا يجذب النقرات بما يكفي',
  HIGH_CPM: 'تكلفة الوصول أصبحت مرتفعة',
  HIGH_FREQUENCY: 'نفس الأشخاص يرون الإعلان كثيراً',
  AUDIENCE_FATIGUE: 'الجمهور بدأ يتعب من الإعلان',
  DECLINING_RESULTS: 'النتائج تتراجع',
  BUDGET_BURNING_FAST: 'الميزانية تُصرف بسرعة',
  LOW_REACH: 'الوصول للجمهور محدود',
  RISING_COST_PER_RESULT: 'تكلفة كل نتيجة ترتفع',
  STALLED_DELIVERY: 'الحملة توقفت عن الظهور',
  CPMSG_PAUSE_BLEEDERS: 'بعض الحملات تخسر أكثر مما تفيد',
};

const ISSUE_WHY: Record<string, string> = {
  LOW_CTR: 'الناس يرون الإعلان لكن قليل منهم ينقرون عليه.',
  HIGH_FREQUENCY: 'نفس الأشخاص يشاهدون الإعلان مرات كثيرة فتقلّ استجابتهم.',
  AUDIENCE_FATIGUE: 'التصميم أو الجمهور أصبح مألوفاً جداً للجمهور الحالي.',
  DECLINING_RESULTS: 'النتائج أضعف من الفترة السابقة.',
  RISING_COST_PER_RESULT: 'تدفع أكثر مقابل كل نتيجة مقارنة بما قبل.',
  HIGH_CPM: 'الوصول لنفس العدد من الناس أصبح أغلى.',
  BUDGET_BURNING_FAST: 'الميزانية اليومية تُستهلك أسرع من المعتاد.',
  LOW_REACH: 'الإعلان يصل لعدد أقل من الأشخاص مما تحتاج.',
  STALLED_DELIVERY: 'الحملة لا تظهر بشكل منتظم للجمهور.',
};

const ISSUE_ACTION: Record<string, string> = {
  LOW_CTR: 'جرّب صورة أو جملة افتتاحية جديدة خلال هذا الأسبوع',
  HIGH_FREQUENCY: 'أوقف أضعف إعلان وقدّم تصميماً جديداً',
  AUDIENCE_FATIGUE: 'جدّد التصميم ووسّع الجمهور قليلاً',
  DECLINING_RESULTS: 'راجع أفضل إعلان وأوقف الأضعف',
  RISING_COST_PER_RESULT: 'خفّض الميزانية على الأغلى وأبقِ الأفضل',
  HIGH_CPM: 'راجع الاستهداف والميزانية قبل زيادة الإنفاق',
  BUDGET_BURNING_FAST: 'خفّض الميزانية اليومية حتى تستقر النتائج',
  LOW_REACH: 'وسّع الجمهور أو زد الميزانية بحذر',
  STALLED_DELIVERY: 'راجع حالة الحملة والميزانية في مدير الإعلانات',
};

const ISSUE_EXPECT: Record<string, string> = {
  LOW_CTR: 'بعد ٣–٥ أيام راقب هل زاد عدد النقرات دون رفع التكلفة كثيراً.',
  HIGH_FREQUENCY: 'خلال ٥–٧ أيام يفترض أن يتحسن التفاعل إذا وصل التصميم الجديد لجمهور أوسع.',
  AUDIENCE_FATIGUE: 'خلال أسبوع راقب انخفاض مرات الظهور لنفس الشخص وتحسّن النتائج.',
  DECLINING_RESULTS: 'راجع بعد ٤٨–٧٢ ساعة: هل توقفت النتائج عن التراجع؟',
  RISING_COST_PER_RESULT: 'خلال ٣–٥ أيام راقب تكلفة كل نتيجة — الهدف أن تتوقف عن الارتفاع.',
  HIGH_CPM: 'خلال أيام قليلة راقب هل انخفضت تكلفة الوصول بعد تعديل الاستهداف.',
  BUDGET_BURNING_FAST: 'خلال يومين راقب سرعة الصرف — يجب أن تصبح أقرب للوتيرة اليومية المعتادة.',
  LOW_REACH: 'خلال ٣ أيام راقب هل زاد عدد الأشخاص الذين رأوا الإعلان.',
  STALLED_DELIVERY: 'خلال ٢٤ ساعة تأكد أن الحملة تظهر وتنفق بشكل طبيعي.',
};

const ACTION_LABELS: Record<string, string> = {
  IMPROVE_HOOKS: 'حسّن بداية الإعلان',
  REFRESH_CREATIVES: 'جدّد صورة أو فيديو الإعلان',
  REFRESH_CREATIVE: 'جدّد التصميم',
  EXPAND_AUDIENCE: 'وسّع الجمهور',
  BROADEN_AUDIENCE: 'وسّع الجمهور',
  PAUSE_CAMPAIGN: 'أوقف الحملة مؤقتاً',
  PAUSE_AND_RELAUNCH: 'أوقف ثم أعد الإطلاق بتصميم جديد',
  REDUCE_BUDGET: 'خفّض الميزانية',
  SCALE_BUDGET: 'زِد الميزانية بحذر',
  REVIEW_BUDGET_PACING: 'راجع سرعة صرف الميزانية',
  CHECK_TARGETING: 'راجع استهداف الجمهور',
  CPMSG_PAUSE_BLEEDERS: 'أوقف الحملات الخاسرة أولاً',
  PAUSE_URGENT: 'أوقف الحملة فوراً',
  HOLD_AND_MONITOR: 'راقب دون تغيير كبير الآن',
  KEEP_COLLECTING: 'اترك الحملة تجمع بيانات أكثر',
  RESCUE_WATCH: 'راقب إشارة تحسّن قبل الإيقاف',
  EMERGENCY_PAUSE: 'أوقف الحملة فوراً',
  CTR_TEST_NEW_HOOKS: 'جرّب افتتاحية جديدة للإعلان',
  CTR_REFRESH_CREATIVES: 'جدّد تصميم الإعلان',
  FREQ_EXPAND_AUDIENCE: 'وسّع الجمهور لتقليل التكرار',
  FREQ_REFRESH_CREATIVE: 'جدّد التصميم لأن الجمهور تكرّر عليه',
};

const ISSUE_STEPS: Record<string, string[]> = {
  LOW_CTR: [
    'افتح أفضل حملة حالياً في مدير إعلانات فيسبوك.',
    'بدّل الصورة أو الجملة الأولى فقط — لا تغيّر كل شيء دفعة واحدة.',
    'اترك التعديل يعمل ٣–٥ أيام ثم راجع عدد النقرات.',
  ],
  HIGH_FREQUENCY: [
    'حدد الإعلان الذي يظهر كثيراً لنفس الأشخاص.',
    'أوقفه مؤقتاً أو استبدله بتصميم جديد.',
    'وسّع الجمهور قليلاً إن أمكن.',
  ],
  AUDIENCE_FATIGUE: [
    'قدّم تصميماً جديداً (صورة/فيديو/نص مختلف).',
    'وسّع الجمهور أو أضف شريحة مشابهة.',
    'راقب التفاعل خلال أسبوع.',
  ],
  DECLINING_RESULTS: [
    'قارن أفضل حملة بأضعف حملة.',
    'أوقف الأضعف أو خفّض ميزانيته.',
    'أبقِ الميزانية على ما يعمل.',
  ],
  RISING_COST_PER_RESULT: [
    'حدد الحملات الأغلى مقابل كل نتيجة.',
    'خفّض ميزانيتها أو أوقفها.',
    'راجع بعد ٣ أيام هل التكلفة استقرت.',
  ],
  HIGH_CPM: [
    'راجع الاستهداف — هل الجمهور ضيق جداً؟',
    'لا ترفع الميزانية قبل تحسين التصميم أو الجمهور.',
    'راقب تكلفة الوصول خلال أيام.',
  ],
  BUDGET_BURNING_FAST: [
    'خفّض الميزانية اليومية قليلاً.',
    'تأكد أن الحملات لا تتنافس على نفس الجمهور.',
    'راقب الصرف خلال يومين.',
  ],
};

export function severityLabelAr(sev: string | null | undefined): string {
  const s = String(sev || 'LOW').toUpperCase();
  if (s === 'CRITICAL') return 'مستعجل';
  if (s === 'HIGH') return 'مهم';
  if (s === 'MEDIUM') return 'للمتابعة';
  return 'معلومة';
}

export function normalizeSeverity(sev: string | null | undefined): AdviceSeverity {
  const s = String(sev || 'LOW').toUpperCase();
  if (s === 'CRITICAL' || s === 'HIGH' || s === 'MEDIUM') return s;
  return 'LOW';
}

/** Strip jargon / English-only sentences for merchant surfaces. */
export function simplifyMerchantText(text: string | null | undefined): string {
  if (!text) return '';
  let t = String(text);
  t = t.replace(/\bCTR\b/gi, 'نسبة النقر');
  t = t.replace(/\bCPM\b/gi, 'تكلفة الوصول');
  t = t.replace(/\bCPC\b/gi, 'تكلفة النقرة');
  t = t.replace(/\bCPA\b/gi, 'تكلفة النتيجة');
  t = t.replace(/\bROAS\b/gi, 'العائد على الإنفاق');
  t = t.replace(/\bCVR\b/gi, 'نسبة التحويل');
  t = t.replace(/\bfrequency\b/gi, 'مرات الظهور لنفس الشخص');
  t = t.replace(/\blookalike\b/gi, 'جمهور مشابه');
  t = t.replace(/\bad set(s)?\b/gi, 'مجموعة إعلانات');
  t = t.replace(/\bcreative(s)?\b/gi, 'التصميم');
  t = t.replace(/\bauction\b/gi, 'المزاد');
  t = t.replace(/\bbreak-even\b/gi, 'نقطة التعادل');
  t = t.replace(/\(Source:[^)]+\)/gi, '');
  t = t.replace(/Click-Through Rate/gi, 'نسبة النقر');
  t = t.replace(/Cost per (message|result|conversation)/gi, 'تكلفة النتيجة');
  t = t.replace(/\b(REFRESH_CREATIVES?|BROADEN_AUDIENCE|IMPROVE_HOOKS|PAUSE_AND_RELAUNCH|REVIEW_BUDGET_PACING|CHECK_TARGETING|RESCUE_WATCH|KEEP_COLLECTING|EMERGENCY_PAUSE|SCALE_BUDGET|HOLD_AND_MONITOR)\b/g, (m) => actionLabelAr(m) || 'إجراء مقترح');
  t = t.replace(/\b(LOW_CTR|HIGH_CPM|HIGH_FREQUENCY|AUDIENCE_FATIGUE|DECLINING_RESULTS|BUDGET_BURNING_FAST|LOW_REACH|RISING_COST_PER_RESULT|STALLED_DELIVERY)\b/g, (m) => issueTitleAr(m));
  // Drop English-only sentences that slipped through KB.
  if (/[A-Za-z]{4,}/.test(t) && !/[\u0600-\u06FF]/.test(t)) {
    return '';
  }
  return t.replace(/\s+/g, ' ').trim();
}

export function issueTitleAr(code: string | null | undefined, fallbackTitle?: string | null): string {
  if (fallbackTitle) {
    const cleaned = simplifyMerchantText(fallbackTitle);
    if (cleaned && !/^[A-Z0-9_]+$/.test(String(fallbackTitle))) return cleaned;
  }
  const c = String(code || '');
  return ISSUE_TITLES[c] || (c ? c.replace(/_/g, ' ') : 'ملاحظة على الحساب');
}

export function actionLabelAr(code: string | null | undefined): string {
  if (!code) return '';
  return ACTION_LABELS[String(code)] || '';
}

export function issueWhyAr(code: string | null | undefined, causes?: string[] | null): string {
  const cleaned = (causes || []).map(simplifyMerchantText).filter(Boolean);
  if (cleaned.length) return cleaned.slice(0, 2).join(' · ');
  return ISSUE_WHY[String(code || '')] || 'راجع الحملة واتخذ خطوة بسيطة اليوم.';
}

export function issueActionAr(
  code: string | null | undefined,
  opts?: { actionCode?: string | null; recommendations?: string[] | null; priorityText?: string | null },
): string {
  const labeled = actionLabelAr(opts?.actionCode);
  if (labeled) return labeled;
  for (const r of opts?.recommendations || []) {
    const s = simplifyMerchantText(r);
    if (s) return s;
  }
  const p = simplifyMerchantText(opts?.priorityText);
  if (p) return p;
  return ISSUE_ACTION[String(code || '')] || 'افتح الحملات وطبّق تعديلاً واحداً واضحاً';
}

export function issueExpectAr(code: string | null | undefined): string {
  return ISSUE_EXPECT[String(code || '')] || 'راجع النتيجة خلال ٣–٧ أيام بعد تطبيق الخطوة.';
}

export function issueStepsAr(
  code: string | null | undefined,
  opts?: { recommendations?: string[] | null; action?: string | null },
): string[] {
  const fromIssue = ISSUE_STEPS[String(code || '')];
  if (fromIssue?.length) return fromIssue.slice(0, 3);
  const fromRecs = (opts?.recommendations || []).map(simplifyMerchantText).filter(Boolean).slice(0, 3);
  if (fromRecs.length) return fromRecs;
  const action = opts?.action || issueActionAr(code);
  return [action, 'طبّق التعديل في مدير إعلانات فيسبوك.', 'راجع النتيجة بعد بضعة أيام.'];
}

/** Build a merchant task card from dashboard issue (+ optional recommendation row). */
export function buildAdviceTask(input: {
  code?: string | null;
  title?: string | null;
  severity?: string | null;
  causes?: string[] | null;
  recommendations?: string[] | null;
  actionCode?: string | null;
  priorityText?: string | null;
  itemKey?: string | null;
}): AdviceTask {
  const code = input.code || null;
  const actionCode = input.actionCode || null;
  const title = issueTitleAr(code, input.title);
  const why = issueWhyAr(code, input.causes);
  const action = issueActionAr(code, {
    actionCode,
    recommendations: input.recommendations,
    priorityText: input.priorityText,
  });
  const steps = issueStepsAr(code, { recommendations: input.recommendations, action });
  const expect = issueExpectAr(code);
  const severity = normalizeSeverity(input.severity);
  const itemKey =
    input.itemKey ||
    (code ? `issue:${code}` : actionCode ? `priority:${actionCode}` : `issue:UNKNOWN`);

  return {
    itemKey,
    issueCode: code,
    actionCode,
    severity,
    severityLabel: severityLabelAr(severity),
    title,
    why,
    action,
    steps,
    expect,
    askAi: `اشرح لي ببساطة: ${title}. ماذا أفعل الآن خطوة بخطوة؟ ومتى أراجع النتيجة؟`,
  };
}

/** Sanitize issue arrays before they leave the API / enter AI context. */
export function sanitizeIssueForMerchant<T extends {
  code: string;
  title: string;
  severity: string;
  causes: string[];
  recommendations: string[];
}>(issue: T): T {
  const title = issueTitleAr(issue.code, issue.title);
  const causes = (issue.causes || []).map(simplifyMerchantText).filter(Boolean);
  const recommendations = (issue.recommendations || [])
    .map(simplifyMerchantText)
    .filter(Boolean);
  return {
    ...issue,
    title,
    causes: causes.length ? causes : [issueWhyAr(issue.code)],
    recommendations: recommendations.length
      ? recommendations
      : [issueActionAr(issue.code)],
  };
}

export function sanitizePriorityActionText(
  actionCode: string | null | undefined,
  text: string | null | undefined,
): string {
  const labeled = actionLabelAr(actionCode);
  if (labeled) return labeled;
  const cleaned = simplifyMerchantText(text);
  if (cleaned) return cleaned;
  if (actionCode && /^[A-Z0-9_]+$/.test(actionCode)) {
    return 'راجع الحملات وطبّق تعديلاً واحداً واضحاً';
  }
  return text || 'راجع الحملات وطبّق تعديلاً واحداً واضحاً';
}
