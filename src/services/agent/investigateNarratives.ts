// ════════════════════════════════════════════════════════════════════════
//  src/services/agent/investigateNarratives.ts
//
//  Deterministic Arabic investigation sections from tool JSON only.
//  Used when Claude is unavailable (credits, timeout, missing key) so the
//  «تحقيق شامل» tab never hard-fails with a red error for merchants.
// ════════════════════════════════════════════════════════════════════════

export type InvestigationSectionKey =
  | 'structure'
  | 'budget'
  | 'learning_phase'
  | 'audience'
  | 'creative_fatigue'
  | 'placement'
  | 'pixel_health'
  | 'historical_trend';

const NO_DATA = 'لا تتوفر بيانات كافية لهذا القسم حالياً.';

function num(v: unknown, digits = 2): string | null {
  if (v == null || !Number.isFinite(Number(v))) return null;
  const n = Number(v);
  return n.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function int(v: unknown): string | null {
  if (v == null || !Number.isFinite(Number(v))) return null;
  return Math.round(Number(v)).toLocaleString('en-US');
}

function pct(v: unknown): string | null {
  if (v == null || !Number.isFinite(Number(v))) return null;
  const n = Number(v);
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
}

function statusAr(status: unknown): string {
  switch (String(status || '').toUpperCase()) {
    case 'ACTIVE':
      return 'نشطة';
    case 'PAUSED':
      return 'متوقفة';
    case 'ARCHIVED':
      return 'مؤرشفة';
    default:
      return String(status || 'غير معروف');
  }
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function metricCurrent(metrics: Record<string, unknown> | null, key: string): number | null {
  const m = asRecord(metrics?.[key]);
  if (!m) return null;
  const c = m['current'];
  return c == null || !Number.isFinite(Number(c)) ? null : Number(c);
}

function metricDelta(metrics: Record<string, unknown> | null, key: string): number | null {
  const m = asRecord(metrics?.[key]);
  if (!m) return null;
  const d = m['deltaPct'];
  return d == null || !Number.isFinite(Number(d)) ? null : Number(d);
}

function joinSentences(parts: Array<string | null | undefined>): string {
  const clean = parts.map((p) => (p || '').trim()).filter(Boolean);
  return clean.length ? clean.join(' ') : NO_DATA;
}

function structureNarrative(data: unknown): string {
  const root = asRecord(data);
  if (!root) return NO_DATA;
  const campaign = asRecord(root['campaign']);
  const metrics = asRecord(root['windowMetrics']);
  const issues = Array.isArray(root['topIssues']) ? root['topIssues'] : [];
  const recs = Array.isArray(root['topRecommendations']) ? root['topRecommendations'] : [];

  const name = campaign?.['name'] ? String(campaign['name']) : null;
  const status = campaign ? statusAr(campaign['status']) : null;
  const objective = campaign?.['objective'] ? String(campaign['objective']) : null;
  const spend = num(metricCurrent(metrics, 'spend'), 0);
  const ctr = num(metricCurrent(metrics, 'ctr'), 2);
  const spendDelta = pct(metricDelta(metrics, 'spend'));

  const evidence = joinSentences([
    name ? `الحملة «${name}» حالتها ${status || '—'}${objective ? ` وهدفها ${objective}` : ''}.` : null,
    spend != null ? `إنفاق النافذة الحالية ${spend}${spendDelta ? ` (${spendDelta} مقابل الفترة السابقة)` : ''}.` : null,
    ctr != null ? `معدل التفاعل الحالي ${ctr}%.` : null,
  ]);

  const topIssue = asRecord(issues[0]);
  const diagnosis = topIssue
    ? `أبرز إشارة مكتشفة: ${String(topIssue['code'] || 'مشكلة')}${
        Array.isArray(topIssue['evidence']) && topIssue['evidence'][0]
          ? ` — ${String(topIssue['evidence'][0])}`
          : ''
      }.`
    : 'لا توجد مشاكل مكتشفة بقوة عالية في هذه النافذة.';

  const topRec = asRecord(recs[0]);
  const action = topRec?.['text']
    ? `الخطوة التالية المقترحة: ${String(topRec['text'])}.`
    : 'راجع تبويب النظرة العامة ثم طبّق أول مهمة واضحة من لوحة التحكم.';

  return joinSentences([evidence, diagnosis, action]);
}

function budgetNarrative(data: unknown): string {
  const pacing = asRecord(data);
  if (!pacing) return NO_DATA;
  const today = num(pacing['todaySpend'], 0);
  const budget = num(pacing['dailyBudget'], 0);
  const pctOf = num(pacing['pctOfBudget'], 0);
  const burn = num(pacing['burnRatePerHour'], 2);

  if (today == null && budget == null) return NO_DATA;

  const evidence = joinSentences([
    today != null ? `إنفاق اليوم حتى الآن ${today}.` : null,
    budget != null ? `الميزانية اليومية ${budget}.` : null,
    pctOf != null ? `نسبة الاستهلاك ${pctOf}% من الميزانية اليومية.` : null,
    burn != null ? `معدل الحرق التقريبي ${burn} لكل ساعة.` : null,
  ]);

  let diagnosis: string | null = null;
  const pctN = pacing['pctOfBudget'] == null ? null : Number(pacing['pctOfBudget']);
  if (pctN != null && Number.isFinite(pctN)) {
    if (pctN >= 90) diagnosis = 'الاستهلاك مرتفع جداً وقد ينفد الميزان قبل نهاية اليوم.';
    else if (pctN <= 20) diagnosis = 'الاستهلاك منخفض — قد تكون الحملة محدودة بالتعلّم أو بالجمهور أو بالإيقاف الجزئي.';
    else diagnosis = 'وتيرة الإنفاق ضمن نطاق معقول مقارنة بالميزانية اليومية.';
  }

  const action =
    pctN != null && pctN >= 90
      ? 'راجع الميزانية اليومية أو قيّد الاستهداف/المواضع الأغلى قبل نفاد الرصيد.'
      : 'راقب الإنفاق حتى نهاية اليوم وقارنه بنتائج الهدف في تبويب النظرة العامة.';

  return joinSentences([evidence, diagnosis, action]);
}

function learningNarrative(data: unknown): string {
  const lp = asRecord(data);
  if (!lp) return NO_DATA;
  const reported = Number(lp['reportedAdSets'] || 0);
  if (!Number.isFinite(reported) || reported <= 0) {
    return 'لا تتوفر إشارة واضحة عن مرحلة التعلّم من Meta لهذه الحملة بعد. انتظر مزامنة أحدث لمجموعات الإعلانات ثم أعد فتح التحقيق.';
  }
  const total = int(lp['totalAdSets']);
  const inLearning = int(lp['inLearning']);
  const limited = int(lp['learningLimited']);
  const success = int(lp['success']);

  const evidence = `من ${total || '—'} مجموعة إعلانات، Meta أبلغت عن ${int(reported)} مجموعة: ${inLearning || '0'} في التعلّم، ${limited || '0'} محدودة التعلّم، ${success || '0'} خرجت إلى تسليم مستقر.`;

  const inL = Number(lp['inLearning'] || 0);
  const lim = Number(lp['learningLimited'] || 0);
  let diagnosis = 'مرحلة التعلّم مستقرة نسبياً.';
  if (lim > 0) diagnosis = 'يوجد مجموعات محدودة التعلّم — غالباً بسبب تعديلات متكررة أو ميزانية/أحداث غير كافية.';
  else if (inL > 0) diagnosis = 'ما زالت بعض المجموعات داخل مرحلة التعلّم؛ النتائج قد تتذبذب حتى تخرج منها.';

  const action =
    lim > 0
      ? 'قلّل التعديلات الكبيرة لمدة 3–5 أيام وامنح كل مجموعة ميزانية كافية للأحداث.'
      : 'تجنّب تغيير الجمهور أو الإبداع بشكل جذري حتى تخرج المجموعات من التعلّم.';

  return joinSentences([evidence, diagnosis, action]);
}

function audienceOrPlacementNarrative(data: unknown, kind: 'audience' | 'placement'): string {
  const root = asRecord(data);
  if (!root) return NO_DATA;
  const best = asRecord(root['best']);
  const worst = asRecord(root['worst']);
  const verdict = root['concentrationVerdict'] ? String(root['concentrationVerdict']) : null;
  const segments = Array.isArray(root['segments']) ? root['segments'] : [];

  const bestReason = best?.['reason'] ? String(best['reason']) : null;
  const worstReason = worst?.['reason'] ? String(worst['reason']) : null;
  const top = asRecord(segments[0]);
  const topShare = top ? num(top['shareOfSpendPct'], 0) : null;
  const topName = top?.['segment'] ? String(top['segment']) : null;

  const label = kind === 'placement' ? 'المواضع' : 'شرائح الجمهور';
  const evidence = joinSentences([
    bestReason,
    worstReason,
    topName && topShare != null ? `أعلى حصة إنفاق في ${label}: ${topName} بنسبة ${topShare}%.` : null,
    verdict === 'narrow'
      ? 'التركيز ضيق على شريحة/موضع واحد.'
      : verdict === 'broad'
        ? 'التوزيع واسع عبر عدة شرائح/مواضع.'
        : verdict === 'balanced'
          ? 'التوزيع متوازن نسبياً.'
          : null,
  ]);

  if (evidence === NO_DATA) return NO_DATA;

  const diagnosis =
    bestReason && worstReason
      ? 'هناك فرق واضح بين أفضل وأسوأ شريحة — هذا يستحق إعادة توزيع الميزانية.'
      : 'بيانات الشرائح محدودة؛ اعتمد على أعلى حصة إنفاق كنقطة بداية.';

  const action =
    kind === 'placement'
      ? 'اختبر تقليل الإنفاق على الموضع الأسوأ لمدة 48–72 ساعة وراقب تكلفة النتيجة.'
      : 'وسّع أو قلّص الشريحة الأضعف حسب الدليل أعلاه، ثم راجع النتائج بعد يومين.';

  return joinSentences([evidence, diagnosis, action]);
}

function creativeNarrative(data: unknown): string {
  const root = asRecord(data);
  if (!root) return NO_DATA;
  const creative = asRecord(root['creative']);
  const anomaly = asRecord(root['anomaly']);
  const ranked = creative && Array.isArray(creative['ranked']) ? creative['ranked'] : [];
  const correlations =
    creative && Array.isArray(creative['featureCorrelations']) ? creative['featureCorrelations'] : [];
  const anomalies = anomaly && Array.isArray(anomaly['anomalies']) ? anomaly['anomalies'] : [];
  const totalAds = creative ? int(creative['totalAdsWithData']) : null;

  const top = asRecord(ranked[0]);
  const corr = asRecord(correlations[0]);
  const ctrWorse = anomalies
    .map(asRecord)
    .filter((a) => a && a['metric'] === 'ctr' && a['direction'] === 'worse');

  const evidence = joinSentences([
    totalAds != null ? `عدد الإعلانات ذات البيانات: ${totalAds}.` : null,
    top?.['adName']
      ? `أفضل إعلان حالياً «${String(top['adName'])}»${
          top['metricDisplay'] ? ` بمقياس ${String(top['metricDisplay'])}` : ''
        }.`
      : null,
    corr?.['note'] ? String(corr['note']) : null,
    ctrWorse[0]
      ? `رُصد تراجع غير طبيعي في التفاعل (z=${num(ctrWorse[0]!['zScore'], 1) || '—'}).`
      : null,
  ]);

  if (evidence === NO_DATA) return NO_DATA;

  const diagnosis =
    ctrWorse.length > 0 || (ranked.length >= 2 && top)
      ? 'قد يكون هناك تعب إبداعي أو تفاوت كبير بين الإعلانات.'
      : 'لا توجد إشارة قوية لتعب إبداعي من البيانات الحالية.';

  const action =
    ctrWorse.length > 0
      ? 'أوقف أو قلّل الإعلان المتعب، وانشر إبداعاً جديداً ثم راجع بعد 48–72 ساعة.'
      : 'أبقِ أفضل إعلان نشطاً واختبر نسخة واحدة جديدة فقط حتى لا تعيد مرحلة التعلّم.';

  return joinSentences([evidence, diagnosis, action]);
}

function pixelNarrative(data: unknown): string {
  const root = asRecord(data);
  if (!root) return NO_DATA;
  const name = root['pixelName'] ? String(root['pixelName']) : 'Pixel';
  const last = root['lastFiredAt'] ? String(root['lastFiredAt']) : null;
  const coverage = Array.isArray(root['eventCoverage']) ? root['eventCoverage'] : [];
  const purchase = coverage.map(asRecord).find((e) => e && String(e['eventName']) === 'Purchase');
  const cov = purchase ? num(purchase['coveragePct'], 0) : null;
  const goal = purchase ? num(purchase['goalPct'], 0) : null;

  const evidence = joinSentences([
    `التتبّع المرتبط: ${name}.`,
    last ? `آخر نشاط مسجّل: ${last}.` : 'لا يوجد وقت آخر إطلاق واضح.',
    cov != null
      ? `تغطية حدث الشراء ${cov}%${goal != null ? ` (الهدف ${goal}%)` : ''}.`
      : coverage.length
        ? `عدد أحداث التغطية المعروضة: ${coverage.length}.`
        : null,
  ]);

  let diagnosis = 'حالة التتبّع تحتاج مراجعة سريعة في Events Manager.';
  if (cov != null && goal != null && Number(purchase?.['coveragePct']) < Number(purchase?.['goalPct'])) {
    diagnosis = 'تغطية التحويل أقل من الهدف — قد تكون النتائج أقل اكتمالاً مما تبدو.';
  } else if (last) {
    diagnosis = 'التتبّع يستقبل أحداثاً؛ راقب تغطية الأحداث الحرجة.';
  }

  return joinSentences([
    evidence,
    diagnosis,
    'تحقق من Pixel / Conversions API في Meta Events Manager وتأكد أن أحداث الشراء أو الرسائل تصل بانتظام.',
  ]);
}

function historicalNarrative(data: unknown): string {
  const root = asRecord(data);
  if (!root) return NO_DATA;
  const baseline = asRecord(root['historicalBaseline']);
  const vs = asRecord(root['vsBaseline']);
  if (!baseline && !vs) return NO_DATA;

  const days = baseline ? int(baseline['days']) : null;
  const ctrMean = baseline ? num(baseline['ctrMean'], 2) : null;
  const ctrPct = vs ? pct(vs['ctrPct']) : null;
  const spendPct = vs ? pct(vs['spendPct']) : null;
  const msgPct = vs ? pct(vs['messagesPct']) : null;
  const cpmPct = vs ? pct(vs['cpmPct']) : null;

  const evidence = joinSentences([
    days != null ? `خط الأساس التاريخي مبني على ${days} يوماً.` : null,
    ctrMean != null ? `متوسط التفاعل التاريخي ${ctrMean}%.` : null,
    ctrPct != null ? `التفاعل الحالي مقابل الأساس ${ctrPct}.` : null,
    spendPct != null ? `الإنفاق مقابل الأساس ${spendPct}.` : null,
    msgPct != null ? `النتائج/الرسائل مقابل الأساس ${msgPct}.` : null,
    cpmPct != null ? `تكلفة الألف ظهور مقابل الأساس ${cpmPct}.` : null,
  ]);

  if (evidence === NO_DATA) return NO_DATA;

  const ctrN = vs?.['ctrPct'] == null ? null : Number(vs['ctrPct']);
  const diagnosis =
    ctrN != null && ctrN <= -15
      ? 'الأداء الحالي أضعف من خط الأساس التاريخي للحملة نفسها.'
      : ctrN != null && ctrN >= 15
        ? 'الأداء الحالي أفضل من خط الأساس التاريخي.'
        : 'الانحراف عن خط الأساس محدود حتى الآن.';

  return joinSentences([
    evidence,
    diagnosis,
    'قارن آخر 7 أيام بالأساس التاريخي قبل أي تعديل كبير على الميزانية أو الجمهور.',
  ]);
}

/**
 * Build all investigation section narratives from the same dataForPrompt
 * object used by the LLM path — numbers only from tool JSON.
 */
export function buildDeterministicInvestigationNarratives(
  dataForPrompt: Record<string, unknown>,
  keys: string[],
): Record<string, string> {
  const builders: Record<string, (data: unknown) => string> = {
    structure: structureNarrative,
    budget: budgetNarrative,
    learning_phase: learningNarrative,
    audience: (d) => audienceOrPlacementNarrative(d, 'audience'),
    creative_fatigue: creativeNarrative,
    placement: (d) => audienceOrPlacementNarrative(d, 'placement'),
    pixel_health: pixelNarrative,
    historical_trend: historicalNarrative,
  };

  const out: Record<string, string> = {};
  for (const key of keys) {
    const build = builders[key];
    if (!build) continue;
    const narrative = build(dataForPrompt[key]);
    if (narrative && narrative.trim()) out[key] = narrative.trim();
  }
  return out;
}

export { NO_DATA as INVESTIGATION_NO_DATA };
