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

function objectiveAr(obj: unknown): string {
  switch (String(obj || '').toUpperCase()) {
    case 'MESSAGES':
      return 'رسائل';
    case 'CONVERSIONS':
      return 'تحويلات';
    case 'TRAFFIC':
    case 'LINK_CLICKS':
      return 'زيارات';
    case 'ENGAGEMENT':
    case 'POST_ENGAGEMENT':
      return 'تفاعل';
    case 'REACH':
      return 'وصول';
    case 'BRAND_AWARENESS':
      return 'وعي بالعلامة';
    case 'VIDEO_VIEWS':
      return 'مشاهدات فيديو';
    case 'LEAD_GENERATION':
      return 'توليد عملاء';
    case 'APP_INSTALLS':
      return 'تثبيت تطبيقات';
    default:
      return String(obj || '—');
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
  const objAr = objective ? objectiveAr(objective) : null;

  const spend = metricCurrent(metrics, 'spend');
  const spendStr = num(spend, 0);
  const ctr = metricCurrent(metrics, 'ctr');
  const ctrStr = num(ctr, 2);
  const impressions = metricCurrent(metrics, 'impressions');
  const impressionsStr = int(impressions);
  const messages = metricCurrent(metrics, 'messages');
  const messagesStr = int(messages);
  const cpm = metricCurrent(metrics, 'cpm');
  const cpmStr = num(cpm, 2);
  const spendDelta = metricDelta(metrics, 'spend');
  const spendDeltaStr = pct(spendDelta);
  const ctrDelta = metricDelta(metrics, 'ctr');
  const ctrDeltaStr = pct(ctrDelta);

  const evidence = joinSentences([
    name ? `الحملة «${name}» حالتها ${status || '—'}، هدفها ${objAr || objective || '—'}.` : null,
    spendStr != null ? `إنفاق النافذة الحالية ${spendStr}${spendDeltaStr ? ` (${spendDeltaStr} مقابل الفترة السابقة)` : ''}.` : null,
    impressionsStr != null ? `عدد مرات الظهور ${impressionsStr}.` : null,
    ctrStr != null ? `معدل التفاعل (CTR) ${ctrStr}%${ctrDeltaStr ? ` (${ctrDeltaStr})` : ''}.` : null,
    messagesStr != null ? `إجمالي الرسائل/النتائج ${messagesStr}.` : null,
    cpmStr != null ? `تكلفة الألف ظهور (CPM) ${cpmStr}.` : null,
  ]);

  // Build specific diagnosis from issues
  let diagnosis: string;
  if (issues.length > 0) {
    const issueTexts = issues.slice(0, 3).map((iss) => {
      const r = asRecord(iss);
      if (!r) return null;
      const code = String(r['code'] || '');
      const evidenceArr = Array.isArray(r['evidence']) ? r['evidence'] : [];
      const severity = String(r['severity'] || '');
      const sevAr = severity === 'high' ? '(عالية)' : severity === 'medium' ? '(متوسطة)' : '';
      return `${code}${sevAr}${evidenceArr[0] ? ` — ${String(evidenceArr[0])}` : ''}`;
    }).filter(Boolean);
    diagnosis = issueTexts.length
      ? `المشاكل المكتشفة: ${issueTexts.join('؛ ')}.`
      : 'لا توجد مشاكل مكتشفة بقوة عالية في هذه النافذة.';
  } else {
    // No issues — give a data-driven status summary
    if (status === 'متوقفة') {
      diagnosis = 'الحملة متوقفة حالياً ولا تستقبل ظهوراً جديداً.';
    } else if (ctr != null && ctr < 0.5) {
      diagnosis = `معدل التفاعل ${ctrStr}% منخفض — قد يحتاج الإبداع أو الاستهداف مراجعة.`;
    } else if (ctr != null && ctr > 3) {
      diagnosis = `معدل التفاعل ${ctrStr}% مرتفع وجيد.`;
    } else {
      diagnosis = 'لا توجد مشاكل واضحة في هذه النافذة.';
    }
  }

  // Build action from recommendations or data
  let action: string;
  const topRec = asRecord(recs[0]);
  if (topRec?.['text']) {
    action = `الخطوة التالية المقترحة: ${String(topRec['text'])}.`;
  } else if (ctrDelta != null && ctrDelta <= -20) {
    action = `التفاعل تراجع بنسبة ${pct(ctrDelta)} — راجع الإبداعات والجمهور المستهدف.`;
  } else if (spendDelta != null && spendDelta >= 50) {
    action = `الإنفاق ارتفع بنسبة ${pct(spendDelta)} — تأكد أن الزيادة مقصودة ومتناسبة مع النتائج.`;
  } else if (status === 'متوقفة') {
    action = 'فعّل الحملة مجدداً أو أنشئ حملة بديلة إذا كان الإيقاف مؤقتاً.';
  } else {
    action = 'استمر في المراقبة وقارن نتائج هذه الفترة بالفترة السابقة.';
  }

  return joinSentences([evidence, diagnosis, action]);
}

function budgetNarrative(data: unknown): string {
  const pacing = asRecord(data);
  if (!pacing) return NO_DATA;
  const todaySpend = Number(pacing['todaySpend'] ?? NaN);
  const dailyBudget = Number(pacing['dailyBudget'] ?? NaN);
  const pctOfBudget = Number(pacing['pctOfBudget'] ?? NaN);
  const burnRate = Number(pacing['burnRatePerHour'] ?? NaN);

  const todayStr = num(todaySpend, 0);
  const budgetStr = num(dailyBudget, 0);
  const pctStr = num(pctOfBudget, 0);
  const burnStr = num(burnRate, 2);

  if (todayStr == null && budgetStr == null) return NO_DATA;

  const evidence = joinSentences([
    todayStr != null && budgetStr != null
      ? `إنفاق اليوم ${todayStr} من أصل ميزانية يومية ${budgetStr}.`
      : todayStr != null ? `إنفاق اليوم حتى الآن ${todayStr}.` : `الميزانية اليومية ${budgetStr}.`,
    pctStr != null ? `نسبة الاستهلاك ${pctStr}% من الميزانية اليومية.` : null,
    burnStr != null ? `معدل الحرق ${burnStr} لكل ساعة.` : null,
  ]);

  let diagnosis: string;
  let action: string;
  const currentHour = new Date().getUTCHours();

  if (Number.isFinite(pctOfBudget)) {
    if (pctOfBudget >= 95) {
      diagnosis = 'الميزانية شبه مستنفدة — الحملة قد توقفت أو ستتوقف قريباً عن التسليم اليوم.';
      action = budgetStr != null
        ? `ارفع الميزانية اليومية (حالياً ${budgetStr}) إذا أردت استمرار التسليم، أو انتظر اليوم التالي.`
        : 'ارفع الميزانية اليومية إذا أردت استمرار التسليم.';
    } else if (pctOfBudget >= 80) {
      const remainingBudget = Number.isFinite(dailyBudget) && Number.isFinite(todaySpend)
        ? num(dailyBudget - todaySpend, 0) : null;
      diagnosis = `الاستهلاك مرتفع (${pctStr}%) — ${remainingBudget != null ? `المتبقي حوالي ${remainingBudget}` : 'قد ينفد الرصيد قبل نهاية اليوم'}.`;
      if (Number.isFinite(burnRate) && burnRate > 0) {
        const hoursLeft = (dailyBudget - todaySpend) / burnRate;
        action = hoursLeft < 3
          ? `بمعدل الحرق الحالي (${burnStr}/ساعة)، المتبقي يكفي لأقل من ${Math.ceil(hoursLeft)} ساعات. قلّل الإنفاق على المواضع الأغلى أو ارفع الميزانية.`
          : `بمعدل الحرق الحالي (${burnStr}/ساعة)، المتبقي يكفي لحوالي ${Math.round(hoursLeft)} ساعات.`;
      } else {
        action = 'راقب الإنفاق خلال الساعات القادمة وقرر ما إذا تحتاج رفع الميزانية.';
      }
    } else if (pctOfBudget <= 15 && currentHour >= 12) {
      diagnosis = `الاستهلاك منخفض جداً (${pctStr}%) رغم مرور أكثر من نصف اليوم.`;
      action = 'تحقق من حالة الحملة — قد تكون متوقفة، أو الجمهور المستهدف ضيق جداً، أو مجموعات الإعلانات في مرحلة التعلّم.';
    } else if (pctOfBudget <= 30) {
      diagnosis = `وتيرة الإنفاق هادئة (${pctStr}%).`;
      action = Number.isFinite(burnRate) && burnRate > 0
        ? `بمعدل ${burnStr}/ساعة، الميزانية كافية لباقي اليوم.`
        : 'وتيرة الإنفاق ضمن النطاق الطبيعي.';
    } else {
      diagnosis = `وتيرة الإنفاق معتدلة (${pctStr}%).`;
      if (Number.isFinite(burnRate) && burnRate > 0 && Number.isFinite(dailyBudget) && Number.isFinite(todaySpend)) {
        const hoursLeft = (dailyBudget - todaySpend) / burnRate;
        action = `بمعدل الحرق الحالي (${burnStr}/ساعة)، الميزانية تكفي لحوالي ${Math.round(hoursLeft)} ساعات.`;
      } else {
        action = 'الإنفاق يسير بوتيرة مناسبة مقارنة بالميزانية اليومية.';
      }
    }
  } else {
    diagnosis = 'لا يمكن حساب نسبة الاستهلاك — تأكد من إعداد الميزانية اليومية.';
    action = 'راجع إعدادات الميزانية اليومية في الحملة.';
  }

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
  const suc = Number(lp['success'] || 0);
  let diagnosis: string;
  if (lim > 0 && inL > 0) {
    diagnosis = `${limited} مجموعة محدودة التعلّم و${inLearning} لا تزال في التعلّم — الأداء غير مستقر ومعرّض للتذبذب.`;
  } else if (lim > 0) {
    diagnosis = `${limited} مجموعة محدودة التعلّم — غالباً بسبب تعديلات متكررة أو ميزانية/أحداث غير كافية.`;
  } else if (inL > 0) {
    diagnosis = `${inLearning} مجموعة لا تزال في مرحلة التعلّم — النتائج ستتذبذب حتى اكتمال التعلّم.`;
  } else if (suc > 0) {
    diagnosis = `جميع المجموعات المُبلّغة (${success}) خرجت من التعلّم بنجاح — التسليم مستقر.`;
  } else {
    diagnosis = 'مرحلة التعلّم مستقرة نسبياً.';
  }

  let action: string;
  if (lim > 0) {
    action = `قلّل التعديلات الكبيرة لمدة 3–5 أيام. المجموعات المحدودة (${limited}) تحتاج ميزانية كافية لتحقيق 50 حدثاً أسبوعياً.`;
  } else if (inL > 0) {
    action = `لا تعدّل المجموعات التي في التعلّم (${inLearning}) — انتظر حتى تخرج أو تتحول لمحدودة قبل أي تغيير.`;
  } else {
    action = 'التعلّم مكتمل. يمكنك إجراء تعديلات محسوبة دون خطر إعادة التعلّم.';
  }

  return joinSentences([evidence, diagnosis, action]);
}

function audienceOrPlacementNarrative(data: unknown, kind: 'audience' | 'placement'): string {
  const root = asRecord(data);
  if (!root) return NO_DATA;
  const best = asRecord(root['best']);
  const worst = asRecord(root['worst']);
  const verdict = root['concentrationVerdict'] ? String(root['concentrationVerdict']) : null;
  const concentration = root['concentrationIndex'] != null ? Number(root['concentrationIndex']) : null;
  const segments = Array.isArray(root['segments']) ? root['segments'] : [];
  const dimension = root['dimension'] ? String(root['dimension']) : kind;

  if (segments.length === 0) return NO_DATA;

  const label = kind === 'placement' ? 'المواضع' : 'الشرائح العمرية';
  const labelSingle = kind === 'placement' ? 'موضع' : 'شريحة';

  // Build segment breakdown listing (top 3)
  const topSegments = segments.slice(0, 3).map((seg) => {
    const s = asRecord(seg);
    if (!s) return null;
    const name = String(s['segment'] || '—');
    const share = num(s['shareOfSpendPct'], 0);
    const display = s['metricDisplay'] ? String(s['metricDisplay']) : null;
    return share != null
      ? `${name} (${share}% من الإنفاق${display ? `، ${display}` : ''})`
      : name;
  }).filter(Boolean);

  const evidence = joinSentences([
    `عدد ${label} بالبيانات: ${segments.length}.`,
    topSegments.length > 0
      ? `أعلى ${label}: ${topSegments.join('، ')}.`
      : null,
    best?.['reason'] ? String(best['reason']) + '.' : null,
    worst?.['reason'] ? String(worst['reason']) + '.' : null,
  ]);

  // Build diagnosis from concentration + best/worst gap
  let diagnosis: string;
  const bestSeg = asRecord(segments[0]);
  const bestShare = bestSeg ? Number(bestSeg['shareOfSpendPct'] ?? 0) : 0;

  if (verdict === 'narrow') {
    const topName = bestSeg ? String(bestSeg['segment'] || '—') : '—';
    diagnosis = `التركيز ضيق — ${labelSingle} «${topName}» يستحوذ على ${num(bestShare, 0)}% من الإنفاق.${concentration != null ? ` مؤشر التركيز ${num(concentration, 2)}.` : ''}`;
  } else if (verdict === 'broad') {
    diagnosis = `التوزيع واسع عبر ${segments.length} ${labelSingle}، لا يوجد ${labelSingle} واحد مهيمن.`;
  } else {
    diagnosis = `التوزيع متوازن نسبياً بين ${label}.`;
  }

  // Add best vs worst comparison if both exist
  if (best && worst && best['segment'] !== worst['segment']) {
    const bestName = String(best['segment']);
    const worstName = String(worst['segment']);
    diagnosis += ` فارق واضح بين «${bestName}» (الأفضل) و«${worstName}» (الأضعف).`;
  }

  // Build specific action
  let action: string;
  if (kind === 'placement') {
    if (worst?.['segment']) {
      action = `اختبر تقليل الإنفاق على «${String(worst['segment'])}» (الأضعف أداءً) لمدة 48–72 ساعة وراقب تأثيره على تكلفة النتيجة.`;
    } else if (verdict === 'narrow' && bestSeg) {
      action = `الإنفاق مركّز على «${String(bestSeg['segment'] || '—')}». اختبر إضافة مواضع أخرى لتوسيع الوصول وخفض التكلفة.`;
    } else {
      action = 'راقب أداء المواضع خلال الأيام القادمة وأوقف أي موضع يرفع التكلفة دون نتائج.';
    }
  } else {
    if (worst?.['segment']) {
      action = `راجع أداء الشريحة «${String(worst['segment'])}» (الأضعف) — قد تحتاج استبعادها أو تعديل الاستهداف.`;
    } else if (verdict === 'narrow' && bestSeg) {
      action = `الإنفاق مركّز على شريحة «${String(bestSeg['segment'] || '—')}». اختبر توسيع الفئة العمرية لاكتشاف شرائح جديدة.`;
    } else {
      action = 'التوزيع سليم. راقب الشرائح ذات الأداء الأضعف في حال تراجعها.';
    }
  }

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
  const totalAds = creative ? Number(creative['totalAdsWithData'] ?? 0) : 0;

  if (totalAds === 0 && ranked.length === 0) return NO_DATA;

  const top = asRecord(ranked[0]);
  const second = asRecord(ranked[1]);
  const bottom = ranked.length >= 2 ? asRecord(ranked[ranked.length - 1]) : null;
  const corr = asRecord(correlations[0]);
  const ctrWorse = anomalies
    .map(asRecord)
    .filter((a) => a && a['metric'] === 'ctr' && a['direction'] === 'worse');

  // Build detailed evidence
  const evidence = joinSentences([
    `عدد الإعلانات ذات البيانات: ${int(totalAds)}.`,
    top?.['adName']
      ? `أفضل إعلان: «${String(top['adName'])}»${
          top['metricDisplay'] ? ` بمقياس ${String(top['metricDisplay'])}` : ''
        }${top['shareOfSpendPct'] != null ? ` (${num(top['shareOfSpendPct'], 0)}% من الإنفاق)` : ''}.`
      : null,
    bottom?.['adName'] && bottom['adName'] !== top?.['adName']
      ? `أضعف إعلان: «${String(bottom['adName'])}»${
          bottom['metricDisplay'] ? ` بمقياس ${String(bottom['metricDisplay'])}` : ''
        }.`
      : null,
    corr?.['note'] ? String(corr['note']) : null,
    ctrWorse[0]
      ? `رُصد تراجع غير طبيعي في التفاعل (z=${num(ctrWorse[0]!['zScore'], 1) || '—'}).`
      : null,
  ]);

  if (evidence === NO_DATA) return NO_DATA;

  // Specific diagnosis
  let diagnosis: string;
  if (ctrWorse.length > 0) {
    const affectedAd = ctrWorse[0]?.['entityName'] ? ` في «${String(ctrWorse[0]!['entityName'])}»` : '';
    diagnosis = `تراجع غير طبيعي في التفاعل${affectedAd} — علامة محتملة على تعب إبداعي أو تشبّع الجمهور.`;
  } else if (top && bottom && top['adName'] !== bottom['adName']) {
    const topMetric = top['metricValue'] != null ? Number(top['metricValue']) : null;
    const bottomMetric = bottom['metricValue'] != null ? Number(bottom['metricValue']) : null;
    if (topMetric != null && bottomMetric != null && bottomMetric > 0) {
      const ratio = topMetric / bottomMetric;
      if (ratio >= 3) {
        diagnosis = `فجوة كبيرة بين أفضل وأضعف إعلان (${num(ratio, 1)}x) — الإعلان الأضعف يهدر الميزانية.`;
      } else if (ratio >= 1.5) {
        diagnosis = `فارق ملحوظ بين أفضل وأضعف إعلان (${num(ratio, 1)}x).`;
      } else {
        diagnosis = 'الإعلانات متقاربة في الأداء — لا تعب إبداعي واضح.';
      }
    } else {
      diagnosis = `يوجد ${int(totalAds)} إعلان نشط — لا إشارة قوية لتعب إبداعي.`;
    }
  } else {
    diagnosis = ranked.length === 1
      ? 'إعلان واحد فقط نشط — لا توجد مقارنة. اختبر إبداعاً ثانياً لقياس الأداء.'
      : `لا توجد إشارة قوية لتعب إبداعي بين ${int(totalAds)} إعلان.`;
  }

  // Specific action
  let action: string;
  if (ctrWorse.length > 0 && bottom?.['adName']) {
    action = `أوقف «${String(bottom['adName'])}» (الأضعف أداءً) وانشر إبداعاً جديداً بدلاً منه.`;
  } else if (bottom?.['adName'] && top?.['adName'] && bottom['adName'] !== top['adName']) {
    const bottomShare = bottom['shareOfSpendPct'] != null ? Number(bottom['shareOfSpendPct']) : null;
    if (bottomShare != null && bottomShare > 30) {
      action = `«${String(bottom['adName'])}» يستهلك ${num(bottomShare, 0)}% من الإنفاق رغم ضعف أدائه — فكّر في إيقافه.`;
    } else {
      action = `أبقِ «${String(top['adName'])}» (الأفضل) نشطاً واختبر نسخة محسّنة من «${String(bottom['adName'])}» (الأضعف).`;
    }
  } else if (ranked.length === 1 && top?.['adName']) {
    action = `أنشئ إعلاناً ثانياً بجانب «${String(top['adName'])}» لإجراء A/B test.`;
  } else {
    action = 'استمر بالإعلانات الحالية وراقب أي تراجع في التفاعل خلال الأيام القادمة.';
  }

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
        ? `عدد الأحداث المتتبّعة: ${coverage.length}.`
        : null,
  ]);

  let diagnosis: string;
  if (cov != null && goal != null && Number(purchase?.['coveragePct']) < Number(purchase?.['goalPct'])) {
    const gap = Number(purchase?.['goalPct']) - Number(purchase?.['coveragePct']);
    diagnosis = `تغطية التحويل أقل من الهدف بـ ${num(gap, 0)}% — النتائج المسجّلة أقل من الفعلية.`;
  } else if (cov != null && Number(purchase?.['coveragePct']) >= 90) {
    diagnosis = `تغطية التحويل ممتازة (${cov}%) — البيانات موثوقة.`;
  } else if (last) {
    diagnosis = 'التتبّع نشط ويستقبل أحداثاً.';
  } else {
    diagnosis = 'حالة التتبّع تحتاج مراجعة — لم يُسجّل نشاط حديث.';
  }

  const action = cov != null && goal != null && Number(purchase?.['coveragePct']) < Number(purchase?.['goalPct'])
    ? `فعّل Conversions API في Events Manager لرفع تغطية الشراء من ${cov}% إلى ${goal}%.`
    : 'تحقق من إعدادات Pixel/Conversions API في Meta Events Manager.';

  return joinSentences([evidence, diagnosis, action]);
}

function historicalNarrative(data: unknown): string {
  const root = asRecord(data);
  if (!root) return NO_DATA;
  const baseline = asRecord(root['historicalBaseline']);
  const vs = asRecord(root['vsBaseline']);
  if (!baseline && !vs) return NO_DATA;

  const days = baseline ? int(baseline['days']) : null;
  const ctrMean = baseline ? num(baseline['ctrMean'], 2) : null;
  const ctrPctVal = vs ? Number(vs['ctrPct'] ?? NaN) : NaN;
  const ctrPctStr = vs ? pct(vs['ctrPct']) : null;
  const spendPctVal = vs ? Number(vs['spendPct'] ?? NaN) : NaN;
  const spendPctStr = vs ? pct(vs['spendPct']) : null;
  const msgPctVal = vs ? Number(vs['messagesPct'] ?? NaN) : NaN;
  const msgPctStr = vs ? pct(vs['messagesPct']) : null;
  const cpmPctStr = vs ? pct(vs['cpmPct']) : null;
  const cpmPctVal = vs ? Number(vs['cpmPct'] ?? NaN) : NaN;

  const evidence = joinSentences([
    days != null ? `خط الأساس التاريخي مبني على ${days} يوماً.` : null,
    ctrMean != null ? `متوسط التفاعل التاريخي ${ctrMean}%.` : null,
    ctrPctStr != null ? `التفاعل الحالي مقابل الأساس ${ctrPctStr}.` : null,
    spendPctStr != null ? `الإنفاق مقابل الأساس ${spendPctStr}.` : null,
    msgPctStr != null ? `النتائج/الرسائل مقابل الأساس ${msgPctStr}.` : null,
    cpmPctStr != null ? `تكلفة الألف ظهور مقابل الأساس ${cpmPctStr}.` : null,
  ]);

  if (evidence === NO_DATA) return NO_DATA;

  // Build nuanced diagnosis comparing multiple metrics
  let diagnosis: string;
  const ctrDown = Number.isFinite(ctrPctVal) && ctrPctVal <= -15;
  const ctrUp = Number.isFinite(ctrPctVal) && ctrPctVal >= 15;
  const spendUp = Number.isFinite(spendPctVal) && spendPctVal >= 20;
  const spendDown = Number.isFinite(spendPctVal) && spendPctVal <= -20;
  const msgDown = Number.isFinite(msgPctVal) && msgPctVal <= -15;
  const cpmUp = Number.isFinite(cpmPctVal) && cpmPctVal >= 20;

  if (ctrDown && spendUp) {
    diagnosis = `تراجع التفاعل بنسبة ${ctrPctStr} مع ارتفاع الإنفاق بنسبة ${spendPctStr} — إنفاق أكثر بنتائج أقل.`;
  } else if (ctrDown && msgDown) {
    diagnosis = `التفاعل (${ctrPctStr}) والنتائج (${msgPctStr}) كلاهما أقل من خط الأساس — انحدار واضح في الأداء.`;
  } else if (ctrUp && cpmUp) {
    diagnosis = `التفاعل تحسّن (${ctrPctStr}) لكن تكلفة الظهور ارتفعت (${cpmPctStr}) — التحسّن قد يكون مكلفاً.`;
  } else if (ctrDown) {
    diagnosis = `الأداء الحالي أضعف من خط الأساس بنسبة ${ctrPctStr}.`;
  } else if (ctrUp) {
    diagnosis = `الأداء الحالي أفضل من خط الأساس بنسبة ${ctrPctStr}.`;
  } else if (spendDown) {
    diagnosis = `الإنفاق انخفض بنسبة ${spendPctStr} مقابل الأساس — تحقق من سبب التراجع.`;
  } else {
    diagnosis = 'الأداء الحالي قريب من خط الأساس التاريخي — لا انحراف جوهري.';
  }

  // Build specific action
  let action: string;
  if (ctrDown && spendUp) {
    action = 'راجع التغييرات الأخيرة في الجمهور أو الإبداع — الإنفاق الإضافي لا يحقق عائداً مكافئاً.';
  } else if (ctrDown) {
    action = `بما أن التفاعل تراجع (${ctrPctStr})، راجع الإبداعات والمواضع التي تغيرت مؤخراً.`;
  } else if (ctrUp) {
    action = 'الأداء جيد مقارنة بالأساس التاريخي. حافظ على الإعدادات الحالية.';
  } else {
    action = 'راقب الاتجاه خلال الأيام القادمة قبل إجراء تعديلات كبيرة.';
  }

  return joinSentences([evidence, diagnosis, action]);
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
