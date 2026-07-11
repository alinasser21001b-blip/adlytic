// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/recommendationsPage.ts
//
//  Recommendations with Meta-sourced benchmarks and evidence-backed advice.
//  فهم → قرار → ��عل → تحقق
// ════════════════════════════════════════════════════════════════════════

import { layout } from '../layout';

export function recommendationsPage(): string {
  const content = `
<div class="rec-page">
  <div class="rec-hero">
    <div class="rec-hero-content">
      <div class="page-title rec-title">التوصيات الذكية</div>
      <div class="page-subtitle rec-subtitle">تحليل مبني على معايير Meta الرسمية — كل توصية مدعومة بمصدر موثوق</div>
    </div>
    <div class="rec-hero-actions">
      <button class="btn btn-secondary btn-sm rec-refresh-btn" id="refresh-btn" type="button">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0115-6.7L21 8M3 22v-6h6"/><path d="M21 12a9 9 0 01-15 6.7L3 16"/></svg>
        تحديث
      </button>
    </div>
  </div>

  <div class="rec-meta-banner" id="rec-meta-banner">
    <div class="rec-meta-badge">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
      <span>مدعوم بمعايير Meta Ads 2026</span>
    </div>
    <div class="rec-meta-sources">
      المصادر: Meta Business Help Center · Pengwing Benchmarks · Industry Standards
    </div>
  </div>

  <div class="rec-stats-grid" id="rec-stats-grid">
    <div class="rec-stat-card rec-stat-total">
      <div class="rec-stat-icon">📋</div>
      <div class="rec-stat-num" id="stat-total">—</div>
      <div class="rec-stat-desc">إجمالي التوصيات</div>
    </div>
    <div class="rec-stat-card rec-stat-urgent">
      <div class="rec-stat-icon">🔴</div>
      <div class="rec-stat-num" id="stat-critical">—</div>
      <div class="rec-stat-desc">تحتاج تنفيذ فوري</div>
    </div>
    <div class="rec-stat-card rec-stat-important">
      <div class="rec-stat-icon">🟠</div>
      <div class="rec-stat-num" id="stat-high">—</div>
      <div class="rec-stat-desc">مهمة هذا الأسبوع</div>
    </div>
    <div class="rec-stat-card rec-stat-monitor">
      <div class="rec-stat-icon">🟡</div>
      <div class="rec-stat-num" id="stat-medium">—</div>
      <div class="rec-stat-desc">للمتابعة</div>
    </div>
  </div>

  <div class="rec-top-action" id="rec-top-action" style="display:none;">
    <div class="rec-top-action-label">أهم خطوة الآن</div>
    <div class="rec-top-action-text" id="stat-action">—</div>
  </div>

  <div class="rec-controls">
    <div class="tabs rec-tabs" id="severity-tabs">
      <button class="tab active" data-filter="all" type="button">الكل</button>
      <button class="tab" data-filter="CRITICAL" type="button">مستعجل</button>
      <button class="tab" data-filter="HIGH" type="button">مهم</button>
      <button class="tab" data-filter="MEDIUM" type="button">للمتابعة</button>
      <button class="tab" data-filter="LOW" type="button">معلومة</button>
    </div>
    <div class="search-wrap rec-search">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input type="text" class="form-input search-input" id="search-input" placeholder="ابحث في التوصيات…" style="width:220px;">
    </div>
  </div>

  <div id="issues-container">
    <div class="loading-overlay"><div class="spinner"></div><div class="loading-text">جارٍ تحليل حملاتك…</div></div>
  </div>
</div>

<div id="rec-task-modal" class="modal-overlay" style="display:none;" onclick="if(event.target===this) closeRecTaskModal()">
  <div class="modal rec-modal-enhanced">
    <div class="rec-modal-header">
      <div class="rec-modal-icon">✓</div>
      <div>
        <div class="modal-title" id="rec-task-modal-title">طبّق المهمة</div>
        <div class="modal-subtitle" id="rec-task-modal-sub">اتبع الخطوات في مدير إعلانات فيسبوك ثم أكّد.</div>
      </div>
    </div>
    <div id="rec-task-modal-steps" class="rec-modal-steps"></div>
    <div class="rec-modal-tip">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
      <span>سنراقب النتائج تلقائياً خلال ٧ أيام وننبّهك إذا تحسّن الأداء.</span>
    </div>
    <div class="modal-footer" style="gap:8px;">
      <button type="button" class="btn btn-secondary btn-sm" id="rec-task-modal-cancel">إلغاء</button>
      <button type="button" class="btn btn-primary btn-sm" id="rec-task-modal-confirm">نفّذت المهمة ✓</button>
    </div>
  </div>
</div>

<style>
  .rec-page { direction: rtl; max-width: 960px; margin: 0 auto; }

  .rec-hero {
    display: flex; align-items: flex-start; justify-content: space-between;
    gap: 16px; flex-wrap: wrap; margin-bottom: 20px;
  }
  .rec-title { font-family: var(--font-display); letter-spacing: -0.02em; }
  .rec-subtitle { max-width: 420px; }
  .rec-refresh-btn { display: inline-flex; align-items: center; gap: 6px; }

  .rec-meta-banner {
    display: flex; align-items: center; justify-content: space-between;
    gap: 12px; flex-wrap: wrap;
    padding: 12px 18px; margin-bottom: 22px;
    background: linear-gradient(135deg, rgba(24,119,242,0.06), rgba(24,119,242,0.02));
    border: 1px solid rgba(24,119,242,0.18);
    border-radius: 14px;
  }
  .rec-meta-badge {
    display: inline-flex; align-items: center; gap: 8px;
    font-size: 12.5px; font-weight: 700; color: #1877F2;
  }
  .rec-meta-sources {
    font-size: 11px; color: var(--text-3); font-weight: 500;
  }

  .rec-stats-grid {
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;
    margin-bottom: 18px;
  }
  @media (max-width: 720px) { .rec-stats-grid { grid-template-columns: repeat(2, 1fr); } }
  .rec-stat-card {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 16px; padding: 18px 16px; text-align: center;
    position: relative; overflow: hidden;
  }
  .rec-stat-card::before {
    content: ''; position: absolute; inset: 0;
    background: radial-gradient(ellipse at top, rgba(255,255,255,0.03), transparent);
    pointer-events: none;
  }
  .rec-stat-icon { font-size: 20px; margin-bottom: 6px; }
  .rec-stat-num {
    font-size: 28px; font-weight: 800; color: var(--text);
    font-variant-numeric: tabular-nums; font-family: var(--font-display);
  }
  .rec-stat-desc { font-size: 11.5px; color: var(--text-3); margin-top: 4px; font-weight: 600; }
  .rec-stat-urgent .rec-stat-num { color: var(--critical, #d32f2f); }
  .rec-stat-important .rec-stat-num { color: var(--error, #e65100); }
  .rec-stat-monitor .rec-stat-num { color: var(--warning, #f9a825); }

  .rec-top-action {
    padding: 14px 20px; margin-bottom: 20px;
    background: linear-gradient(135deg, rgba(217,167,89,0.08), rgba(217,167,89,0.03));
    border: 1px solid rgba(217,167,89,0.22); border-radius: 14px;
  }
  .rec-top-action-label {
    font-size: 11px; font-weight: 800; color: var(--accent-2);
    margin-bottom: 4px; letter-spacing: 0.03em;
  }
  .rec-top-action-text {
    font-size: 14px; font-weight: 700; color: var(--text); line-height: 1.5;
  }

  .rec-controls {
    display: flex; align-items: center; justify-content: space-between;
    gap: 12px; flex-wrap: wrap; margin-bottom: 20px;
  }

  /* ── Recommendation Cards ── */
  .rec-group { margin-bottom: 28px; }
  .rec-group-title {
    display: flex; align-items: center; gap: 10px; margin-bottom: 14px;
    font-size: 12.5px; font-weight: 800; color: var(--text-2);
  }
  .rec-group-title::after { content: ''; flex: 1; height: 1px; background: rgba(255,255,255,0.06); }

  .rec-card {
    background: var(--surface); border: 1px solid rgba(255,255,255,0.07);
    border-radius: 18px; padding: 22px 22px 18px; margin-bottom: 14px;
    border-inline-start: 4px solid var(--border);
    transition: transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease;
    position: relative;
  }
  .rec-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 12px 32px rgba(0,0,0,0.18);
  }
  .rec-card.is-done { opacity: 0.45; pointer-events: none; }

  .rec-card-header {
    display: flex; align-items: flex-start; gap: 12px; margin-bottom: 14px;
  }
  .rec-sev-badge {
    font-size: 10.5px; font-weight: 800; padding: 4px 10px; border-radius: 999px;
    white-space: nowrap; flex-shrink: 0; letter-spacing: 0.02em;
  }
  .rec-card-title {
    font-size: 15.5px; font-weight: 800; color: var(--text);
    flex: 1; min-width: 0; line-height: 1.45;
  }

  .rec-section { margin-bottom: 14px; }
  .rec-section-label {
    font-size: 10.5px; font-weight: 800; color: var(--accent-2);
    margin-bottom: 5px; letter-spacing: 0.03em;
    display: flex; align-items: center; gap: 6px;
  }
  .rec-section-text {
    font-size: 13.5px; color: var(--text-2); line-height: 1.7;
  }

  .rec-benchmark-box {
    background: rgba(24,119,242,0.05); border: 1px solid rgba(24,119,242,0.15);
    border-radius: 12px; padding: 12px 14px; margin-bottom: 14px;
  }
  .rec-benchmark-label {
    font-size: 10.5px; font-weight: 800; color: #1877F2;
    margin-bottom: 6px; letter-spacing: 0.02em;
    display: flex; align-items: center; gap: 6px;
  }
  .rec-benchmark-label svg { flex-shrink: 0; }
  .rec-benchmark-text {
    font-size: 12.5px; color: var(--text-2); line-height: 1.6;
  }
  .rec-benchmark-source {
    font-size: 10.5px; color: var(--text-3); margin-top: 6px;
    font-style: italic;
  }

  .rec-action-box {
    background: linear-gradient(135deg, rgba(217,167,89,0.08), rgba(217,167,89,0.03));
    border: 1px solid rgba(217,167,89,0.22);
    border-radius: 14px; padding: 14px 16px; margin-bottom: 14px;
  }
  .rec-action-label {
    font-size: 10.5px; font-weight: 800; color: var(--accent-2);
    margin-bottom: 5px; letter-spacing: 0.03em;
  }
  .rec-action-text {
    font-size: 14.5px; font-weight: 700; color: var(--text); line-height: 1.5;
  }

  .rec-steps { margin: 0; padding-inline-start: 0; list-style: none; counter-reset: step; }
  .rec-steps li {
    counter-increment: step;
    display: flex; align-items: flex-start; gap: 10px;
    font-size: 13px; color: var(--text-2); line-height: 1.6;
    margin-bottom: 8px; padding: 8px 12px;
    background: rgba(255,255,255,0.02); border-radius: 10px;
    border: 1px solid rgba(255,255,255,0.04);
  }
  .rec-steps li::before {
    content: counter(step);
    width: 22px; height: 22px; border-radius: 50%;
    display: inline-flex; align-items: center; justify-content: center;
    background: rgba(217,167,89,0.16); color: var(--accent-2);
    font-size: 11px; font-weight: 800; flex-shrink: 0;
  }

  .rec-expect-box {
    font-size: 12.5px; color: var(--text-3); line-height: 1.6;
    padding: 10px 14px; border-radius: 10px;
    background: rgba(52,168,113,0.05); border: 1px solid rgba(52,168,113,0.15);
    margin-bottom: 14px;
    display: flex; align-items: flex-start; gap: 8px;
  }
  .rec-expect-box svg { flex-shrink: 0; margin-top: 2px; color: var(--success); }

  .rec-card-footer {
    display: flex; gap: 8px; flex-wrap: wrap; padding-top: 4px;
    border-top: 1px solid rgba(255,255,255,0.04); margin-top: 4px; padding-top: 12px;
  }

  /* ── Modal enhanced ── */
  .rec-modal-enhanced { max-width: 500px; }
  .rec-modal-header { display: flex; align-items: center; gap: 14px; margin-bottom: 16px; }
  .rec-modal-icon {
    width: 40px; height: 40px; border-radius: 50%;
    background: linear-gradient(135deg, var(--accent), var(--accent-2));
    display: flex; align-items: center; justify-content: center;
    font-size: 18px; color: #1A1613; font-weight: 800; flex-shrink: 0;
  }
  .rec-modal-steps { display: flex; flex-direction: column; gap: 10px; margin: 8px 0 16px; }
  .rec-modal-step {
    display: flex; gap: 10px; align-items: flex-start;
    padding: 12px 14px; border-radius: 12px;
    background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);
    font-size: 13px; color: var(--text-2); line-height: 1.55;
  }
  .rec-modal-step b {
    width: 24px; height: 24px; border-radius: 50%;
    display: inline-flex; align-items: center; justify-content: center;
    background: rgba(217,167,89,0.16); color: var(--accent-2);
    font-size: 11px; flex-shrink: 0;
  }
  .rec-modal-tip {
    display: flex; align-items: center; gap: 8px;
    padding: 10px 14px; border-radius: 10px; margin-bottom: 16px;
    background: rgba(52,168,113,0.06); border: 1px solid rgba(52,168,113,0.15);
    font-size: 12px; color: var(--text-2);
  }
  .rec-modal-tip svg { flex-shrink: 0; color: var(--success); }

  @media (max-width: 520px) {
    .rec-card { padding: 16px 14px 14px; }
    .rec-stats-grid { grid-template-columns: 1fr 1fr; }
  }
</style>`;

  const scripts = `<script>
(async () => {
  const token = localStorage.getItem('adlytic_token');
  if (!token) { window.location.href = '/login'; return; }
  const wsId = localStorage.getItem('adlytic_workspace_id');
  if (!wsId) { window.location.href = '/dashboard'; return; }

  const me = await apiFetch('/api/auth/me');
  if (!me) return;
  var nameEl = document.getElementById('user-name');
  var emailEl = document.getElementById('user-email');
  var avEl = document.getElementById('user-avatar-initials') || document.getElementById('user-avatar');
  if (nameEl) nameEl.textContent = me.name || me.email;
  if (emailEl) emailEl.textContent = me.email;
  if (avEl) avEl.textContent = (me.name || me.email || '?')[0].toUpperCase();
  const wsM = me.memberships?.find(m => m.workspaceId === wsId) || me.memberships?.[0];
  var wsNameEl = document.getElementById('ws-name');
  if (wsNameEl) wsNameEl.textContent = wsM?.workspace?.name || 'مساحة العمل';

  let allIssues = [];
  let recs = [];
  let dashData = null;
  let activeFilter = 'all';
  let pendingTask = null;

  // ── Meta benchmark data for evidence-backed recommendations ──
  var META_BENCHMARKS = {
    LOW_CTR: {
      metric: 'CTR',
      standard: '0.9% – 2.0%',
      source: 'Meta Business Help Center — معايير CTR حسب الهدف الإعلاني',
      explanation: 'المعدل الطبيعي لنسبة النقر في إعلانات Meta يتراوح بين 0.9% و 2% حسب الهدف. أقل من ذلك يشير لضعف في التصميم أو الاستهداف.'
    },
    HIGH_CPM: {
      metric: 'CPM',
      standard: 'يعتمد على السوق والمنافسة',
      source: 'Pengwing Meta Ads Benchmarks 2026 — متوسطات CPM الإقليمية',
      explanation: 'ارتفاع CPM يعني أن المنافسة على جمهورك عالية أو أن Meta يقيّم إعلانك بجودة منخفضة.'
    },
    HIGH_FREQUENCY: {
      metric: 'Frequency',
      standard: '1.5 – 3.0 مرات',
      source: 'Meta Business Help Center — إرشادات التكرار الإعلاني',
      explanation: 'التكرار الصحي بين 1.5 و 3 مرات. فوق 5 مرات يُسبب إرهاق الجمهور وانخفاض الاستجابة بنسبة 30-50%.'
    },
    AUDIENCE_FATIGUE: {
      metric: 'تراجع الأداء',
      standard: 'انخفاض > 20% خلال 7 أيام',
      source: 'Meta Ads Creative Best Practices 2026',
      explanation: 'عندما يرى نفس الجمهور نفس التصميم ��ثيراً، تنخفض الاستجابة. Meta توصي بتجديد التصميمات كل 2-4 أسابيع.'
    },
    DECLINING_RESULTS: {
      metric: 'اتجاه النتائج',
      standard: 'مقارنة ٧ أيام بالفترة السابقة',
      source: 'Meta Performance Insights — تحليل الاتجاهات',
      explanation: 'تراجع مستمر لأكثر من أسبوع يستدعي مراجعة — Meta تنصح بعدم تغيير الحملة قبل خروجها من مرحلة التعلّم.'
    },
    RISING_COST_PER_RESULT: {
      metric: 'CPA / Cost per Result',
      standard: 'مقارنة بمتوسط الحساب',
      source: 'Meta Ads Delivery System — آلية المزايد�� والتحسين',
      explanation: 'ارتفاع التكلفة يحدث عند تشبّع ال��مهور أو زيادة المنافسة. Meta تقترح توسيع الاستهداف أو تحسين التصميم.'
    },
    BUDGET_BURNING_FAST: {
      metric: 'معدل الإنفاق',
      standard: 'الميزانية اليومية / 24 ساعة',
      source: 'Meta Budget Optimization Guide',
      explanation: 'إنفاق الميزانية بسرعة يعني أن Meta وجد فرصاً كثيرة — لكن قد لا تكون كلها ذات جودة عالية.'
    },
    LOW_REACH: {
      metric: 'الوصول',
      standard: 'حسب حجم ا��جمهور والميزانية',
      source: 'Meta Audience Network — Reach Estimation',
      explanation: 'وصول م��خفض يشير إلى جمهور ضيق جداً أو ميزانية غير كافية أو تكلفة وصول مرتفعة.'
    },
    STALLED_DELIVERY: {
      metric: 'حالة التسليم',
      standard: 'إنفاق منتظم يومياً',
      source: 'Meta Ads Delivery Troubleshooting',
      explanation: 'توقف التسليم يحدث بسبب: استنفاد الميزانية، مشاكل الفوترة، رفض الإعلان، أو جمهور صغير جداً.'
    },
  };

  var ISSUE_TITLES = {
    LOW_CTR: 'نسبة النقر أقل من المعيار المتوقع',
    HIGH_CPM: 'تكلفة الوصول مرتفعة مقارنة بالمعدل',
    HIGH_FREQUENCY: 'التكرار تجاوز الحد الصحي',
    AUDIENCE_FATIGUE: 'إرهاق الجمهور — التصميم يحتاج تجديد',
    DECLINING_RESULTS: 'النتائج في انخفاض مستمر',
    BUDGET_BURNING_FAST: 'الميزانية تُستهلك أسرع من الطبيعي',
    LOW_REACH: 'الوصول محدو�� — الجمهور ضيق',
    RISING_COST_PER_RESULT: 'تكلفة النتيجة الواحدة ترتفع',
    STALLED_DELIVERY: 'الحملة متوقفة عن التسليم',
    CPMSG_PAUSE_BLEEDERS: 'حملات تخسر أكثر مما تفيد',
  };

  var ISSUE_WHY = {
    LOW_CTR: 'الناس يرون إعلانك لكن لا ينقرون — غالباً بسبب ضعف الصورة أو العنوان أو عدم ملاءمة الجمهور.',
    HIGH_FREQUENCY: 'نفس الأشخاص يرون إعلانك أكثر من 3 مرات. بعد هذا الحد تنخفض الاستجابة بشكل ملحوظ حسب معايير Meta.',
    AUDIENCE_FATIGUE: 'الجمهور أصبح مألوفاً مع تص��يمك. Meta توصي بتغيير التصميمات كل 2-4 أسابيع للحفاظ على الأداء.',
    DECLINING_RESULTS: 'النتائج هذا الأسبوع أضعف من الأسبوع الماضي. إذا استمر التراجع أكثر من 7 أيام ��جب التدخل.',
    RISING_COST_PER_RESULT: 'تد��ع أكثر مقابل كل نتيجة. هذا يحدث عند تشبّع الجمهور الحالي أو زيادة المنافسة في المزاد.',
    HIGH_CPM: 'الوصول لنفس العدد أص��ح أغلى. Meta تقيّم جودة إعلانك — جودة أعلى = تكلفة أقل.',
    BUDGET_BURNING_FAST: 'الميزانية تُصرف ��ي ساعات قليلة بدل توزيعها على اليوم كاملاً.',
    LOW_REACH: 'إعلانك يصل لعدد قليل جداً. السبب غالباً: جمهور ضيق، ميزانية منخفضة، أو منافسة عالية.',
    STALLED_DELIVERY: 'الحملة لا تعرض إعلاناتك. تحقق من: الميزانية، حالة الإعلان، والفوترة.',
  };

  var ISSUE_ACTION = {
    LOW_CTR: 'غيّر صورة أو عنوان الإعلان الأضعف — اختبر نسخة واحدة فقط',
    HIGH_FREQUENCY: 'أوقف الإعلان الأكثر تكراراً وأضف تصميماً جديداً',
    AUDIENCE_FATIGUE: 'جدّد التصميم الرئيسي ووسّع الجمهور بجمهور مشاب�� (Lookalike)',
    DECLINING_RESULTS: 'أوقف ��لأضعف أداءً وركّز ا��ميزانية على الأفضل',
    RISING_COST_PER_RESULT: 'خفّض ميزانية الحملات الأغلى وأبقِ فقط على ما يحقق نتائج',
    HIGH_CPM: 'وسّع الاستهداف قليلاً أو حسّن جودة التصميم لتقل��ل التكلفة',
    BUDGET_BURNING_FAST: 'فعّل "توزيع الميزانية على اليوم" أو خفّ�� المبلغ اليومي',
    LOW_REACH: 'وسّع الجمهور أو ارفع الميزانية تدريجياً (20% كل 3 أيام)',
    STALLED_DELIVERY: 'تحقق من حالة الإعلان ورصيد الفوترة في مدير الإعلانات',
  };

  var ISSUE_EXPECT = {
    LOW_CTR: 'راقب ��عد 3-5 أيام: هل ارتفعت نسبة النقر؟ الهدف الوصول إلى 0.9% على الأقل.',
    HIGH_FREQUENCY: 'خلال 5-7 أيام يجب أن ينخفض التكرار ويتحسن التفاعل مع التصميم الجديد.',
    AUDIENCE_FATIGUE: 'خلال ��سبوع راقب: هل تحسنت النتائج مع التصميم والجمهور الجديد؟',
    DECLINING_RESULTS: 'بعد 48-72 ساعة: هل توقف التراجع؟ إذا استمر، جرّب تغيير الجمهور.',
    RISING_COST_PER_RESULT: 'خلال 3-5 أيام: هل استقرت تكلفة النتيجة أو انخفضت؟',
    HIGH_CPM: 'خلال أيام: ��ل انخفضت تكلفة الوصول بعد توسيع الاستهداف أو تحسين التصميم؟',
    BUDGET_BURNING_FAST: 'خلال يومين: هل أصبح الإنفاق موزّعاً بشكل أفضل على اليوم؟',
    LOW_REACH: 'خلال 3 أيام: هل زاد عدد الأشخاص الذين رأوا الإعلان؟',
    STALLED_DELIVERY: 'خلال 24 ساعة: تأكد أن الحملة تنفق بشكل طبيعي.',
  };

  var ISSUE_STEPS = {
    LOW_CTR: [
      'افتح مدير الإعلانات وحدد الإعلان الأقل نقراً.',
      'غيّر العنصر الأضعف فقط: الصورة أو الجملة الأولى (لا تغيّر كل شيء).',
      'اترك التعديل يعمل 3-5 أيام قبل الحكم على النتائج.',
    ],
    HIGH_FREQUENCY: [
      'حدد الإعلان الذي تكراره أعلى من 3 في مدير الإعلانات.',
      'أوقفه و��ستبدله بتصميم جديد (صورة أو نص مختلف).',
      'اختيارياً: وسّع الجمهور لتقليل تكرار الظهور لنفس الأشخاص.',
    ],
    AUDIENCE_FATIGUE: [
      'جهّ�� تصميماً جديداً (صورة/فيديو/نص) يختلف بشكل واضح.',
      'أضف جمهور��ً مشابهاً (Lookalike 1-3%) أو وسّع الجمهور الحالي.',
      'فعّل التصميم الجديد ورا��ب الأداء لمدة أسبوع.',
    ],
    DECLINING_RESULTS: [
      'قارن أداء حملات�� — حدد الأفضل والأضعف.',
      'أوقف الأضعف أداءً أو خفّض ميزانيته.',
      'ركّز الميزانية على ما يعمل — راجع بعد 3 أيام.',
    ],
    RISING_COST_PER_RESULT: [
      'رتّب حملاتك حسب تكلفة النتيجة (من الأغلى للأرخص).',
      'أوقف أو خفّض ميزانية الأغلى.',
      'أبقِ الميزانية على الحملات ��ات التكلفة المقبولة.',
    ],
    HIGH_CPM: [
      'راجع ��لاستهداف — هل الجمهور أقل من 100,000 شخص؟',
      'جرّب توسيع العمر أو الموقع أو الاهتما��ات.',
      'حسّن التصميم — إعلانات أعلى جودة تحصل على CPM أقل من Meta.',
    ],
    BUDGET_BURNING_FAST: [
      'تأكد ��ن "توزيع الميزانية" مفعّل (Campaign Budget Optimization).',
      'خفّض الميزانية اليومية 20-30%.',
      'تأكد أن الحملات لا تتنافس على نفس الجمهور.',
    ],
  };

  function simplifyText(text) {
    if (!text) return '';
    var t = String(text);
    t = t.replace(/\\bCTR\\b/gi, 'نسبة النقر');
    t = t.replace(/\\bCPM\\b/gi, 'تكلفة الوصول');
    t = t.replace(/\\bCPC\\b/gi, 'تكلفة النقرة');
    t = t.replace(/\\bCPA\\b/gi, 'تكلفة النتيجة');
    t = t.replace(/\\bROAS\\b/gi, 'العائد على الإنفاق');
    t = t.replace(/\\bfrequency\\b/gi, 'التكرار');
    t = t.replace(/\\blookalike\\b/gi, 'جمهور مشابه');
    t = t.replace(/\\bad set(s)?\\b/gi, 'مجموعة إعلانات');
    t = t.replace(/\\bcreative(s)?\\b/gi, 'التصميم');
    t = t.replace(/\\(Source:[^)]+\\)/gi, '');
    if (/[A-Za-z]{4,}/.test(t) && !/[\\u0600-\\u06FF]/.test(t)) return '';
    return t.replace(/\\s+/g, ' ').trim();
  }

  function issueKey(issue) { return issue.code || issue.issueCode || ''; }

  function severityLabel(sev) {
    var s = String(sev || 'LOW').toUpperCase();
    if (s === 'CRITICAL') return { text: 'مستعجل', color: 'var(--critical)', key: 'CRITICAL' };
    if (s === 'HIGH') return { text: 'مهم', color: 'var(--error)', key: 'HIGH' };
    if (s === 'MEDIUM') return { text: 'للمتابعة', color: 'var(--warning)', key: 'MEDIUM' };
    return { text: 'معلومة', color: 'var(--text-3)', key: 'LOW' };
  }

  function findRec(issue) {
    var code = issueKey(issue);
    return recs.find(function(r) {
      var src = r.sourceIssuesJson;
      return Array.isArray(src) && src.includes(code);
    }) || null;
  }

  function buildTask(issue) {
    var code = issueKey(issue);
    var rec = findRec(issue);
    var actionCode = rec && rec.actionCode ? rec.actionCode : null;
    var title = ISSUE_TITLES[code] || simplifyText(issue.title) || 'ملاحظة على الحساب';
    var why = ISSUE_WHY[code] || (Array.isArray(issue.causes) ? issue.causes.map(simplifyText).filter(Boolean).slice(0,2).join(' ') : 'راجع الحملة واتخذ خطوة.');
    var action = ISSUE_ACTION[code] || 'افتح الحملات وطبّق تعديلاً واحداً واضحاً';
    var steps = ISSUE_STEPS[code] || [action, 'طبّق التعديل في مدير إعلانات فيسبوك.', 'راجع النتيجة بعد بضعة أيام.'];
    var expect = ISSUE_EXPECT[code] || 'راجع النتيجة خلال 3-7 أيام بعد تطبيق الخطوة.';
    var benchmark = META_BENCHMARKS[code] || null;
    var sev = severityLabel(issue.severity);
    return {
      itemKey: 'issue:' + (code || 'UNKNOWN'),
      issueCode: code,
      actionCode: actionCode,
      severity: sev,
      title: title,
      why: why,
      action: action,
      steps: steps,
      expect: expect,
      benchmark: benchmark,
      askAi: 'اشرح لي: ' + title + '. ما السبب، وماذا أفعل خطوة بخطوة، ومتى أراجع النتيجة؟',
    };
  }

  function renderCard(task) {
    var sev = task.severity;
    var benchmarkHtml = '';
    if (task.benchmark) {
      benchmarkHtml = '<div class="rec-benchmark-box">'
        + '<div class="rec-benchmark-label"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> معيار Meta</div>'
        + '<div class="rec-benchmark-text">'
        + '<strong>' + escHtml(task.benchmark.metric) + ':</strong> المعيار المتوقع: ' + escHtml(task.benchmark.standard)
        + '<br>' + escHtml(task.benchmark.explanation)
        + '</div>'
        + '<div class="rec-benchmark-source">المصدر: ' + escHtml(task.benchmark.source) + '</div>'
        + '</div>';
    }

    var stepsHtml = '<ol class="rec-steps">' + task.steps.map(function(s) {
      return '<li><span>' + escHtml(s) + '</span></li>';
    }).join('') + '</ol>';

    return '<article class="rec-card" style="border-inline-start-color:' + sev.color + ';" data-severity="' + escHtml(sev.key) + '" data-item-key="' + escHtml(task.itemKey) + '">'
      + '<div class="rec-card-header">'
      +   '<div class="rec-card-title">' + escHtml(task.title) + '</div>'
      +   '<span class="rec-sev-badge" style="background:' + sev.color + '1a;color:' + sev.color + ';">' + escHtml(sev.text) + '</span>'
      + '</div>'
      + '<div class="rec-section"><div class="rec-section-label">لماذا هذا مهم؟</div><div class="rec-section-text">' + escHtml(task.why) + '</div></div>'
      + benchmarkHtml
      + '<div class="rec-action-box"><div class="rec-action-label">الإجراء المطلوب</div><div class="rec-action-text">' + escHtml(task.action) + '</div></div>'
      + '<div class="rec-section"><div class="rec-section-label">الخطوات</div>' + stepsHtml + '</div>'
      + '<div class="rec-expect-box"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><span>' + escHtml(task.expect) + '</span></div>'
      + '<div class="rec-card-footer">'
      +   '<button type="button" class="btn btn-primary btn-sm rec-do-btn" data-item-key="' + escHtml(task.itemKey) + '">نفّذت ✓</button>'
      +   '<button type="button" class="btn btn-secondary btn-sm rec-ignore-btn" data-item-key="' + escHtml(task.itemKey) + '">تجاهل</button>'
      +   '<a class="btn btn-ghost btn-sm" href="/ai?q=' + encodeURIComponent(task.askAi || '') + '">اسأل المساعد الذكي</a>'
      + '</div>'
      + '</article>';
  }

  function allTasks() {
    if (Array.isArray(dashData && dashData.merchantTasks) && dashData.merchantTasks.length) {
      return dashData.merchantTasks.map(function(t) {
        if (!t.benchmark && META_BENCHMARKS[t.issueCode]) t.benchmark = META_BENCHMARKS[t.issueCode];
        return t;
      });
    }
    return (allIssues || []).map(buildTask);
  }

  function render() {
    var q = (document.getElementById('search-input').value || '').toLowerCase();
    var tasks = allTasks();

    document.getElementById('stat-total').textContent = tasks.length;
    var critCount = tasks.filter(function(i) { return (i.severity && i.severity.key || String(i.severity)).toUpperCase() === 'CRITICAL'; }).length;
    var highCount = tasks.filter(function(i) { return (i.severity && i.severity.key || String(i.severity)).toUpperCase() === 'HIGH'; }).length;
    var medCount = tasks.filter(function(i) { return (i.severity && i.severity.key || String(i.severity)).toUpperCase() === 'MEDIUM'; }).length;
    document.getElementById('stat-critical').textContent = critCount;
    document.getElementById('stat-high').textContent = highCount;
    document.getElementById('stat-medium').textContent = medCount;

    var topTask = tasks.slice().sort(function(a, b) {
      var ra = a.severity && a.severity.key ? severityRank(a.severity.key) : severityRank(a.severity);
      var rb = b.severity && b.severity.key ? severityRank(b.severity.key) : severityRank(b.severity);
      return ra - rb;
    })[0];
    var actionEl = document.getElementById('rec-top-action');
    if (topTask && topTask.action) {
      document.getElementById('stat-action').textContent = topTask.action;
      actionEl.style.display = 'block';
    }

    if (activeFilter !== 'all') {
      tasks = tasks.filter(function(i) {
        var key = i.severity && i.severity.key ? i.severity.key : String(i.severity || '');
        return key.toUpperCase() === activeFilter;
      });
    }
    if (q) {
      tasks = tasks.filter(function(t) {
        return (t.title || '').toLowerCase().includes(q) || (t.action || '').toLowerCase().includes(q) || (t.why || '').toLowerCase().includes(q);
      });
    }

    tasks.sort(function(a, b) {
      var ra = a.severity && a.severity.key ? severityRank(a.severity.key) : severityRank(a.severity);
      var rb = b.severity && b.severity.key ? severityRank(b.severity.key) : severityRank(b.severity);
      return ra - rb;
    });

    var container = document.getElementById('issues-container');
    if (!tasks.length) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">✅</div><div class="empty-title">'
        + (activeFilter === 'all' ? 'حسابك بحالة ممتازة — لا توجد توصيات الآن' : 'لا توجد توصيات في هذه الفئة')
        + '</div><div class="empty-text">سنراقب حملاتك باستمرار وننبّهك عند وجود فرصة تحسين.</div></div>';
      return;
    }

    var urgent = tasks.filter(function(i) {
      var key = i.severity && i.severity.key ? i.severity.key : String(i.severity || '');
      return ['CRITICAL', 'HIGH'].includes(key.toUpperCase());
    });
    var later = tasks.filter(function(i) {
      var key = i.severity && i.severity.key ? i.severity.key : String(i.severity || '');
      return !['CRITICAL', 'HIGH'].includes(key.toUpperCase());
    });

    var html = '';
    if (urgent.length) {
      html += '<section class="rec-group"><div class="rec-group-title">يحتاج تنفيذ الآن · ' + urgent.length + '</div>'
        + urgent.map(renderCard).join('') + '</section>';
    }
    if (later.length) {
      html += '<section class="rec-group"><div class="rec-group-title">للمتابعة والتحسين · ' + later.length + '</div>'
        + later.map(renderCard).join('') + '</section>';
    }
    container.innerHTML = html;
  }

  function severityRank(sev) {
    var s = String(sev || '').toUpperCase();
    if (s === 'CRITICAL') return 0;
    if (s === 'HIGH') return 1;
    if (s === 'MEDIUM') return 2;
    return 3;
  }

  function findTaskByKey(itemKey) {
    return allTasks().find(function(t) { return t.itemKey === itemKey; }) || null;
  }

  window.closeRecTaskModal = function() {
    document.getElementById('rec-task-modal').style.display = 'none';
    pendingTask = null;
  };

  function openDoModal(itemKey) {
    var task = findTaskByKey(itemKey);
    if (!task) return;
    pendingTask = task;
    document.getElementById('rec-task-modal-title').textContent = task.action;
    document.getElementById('rec-task-modal-sub').textContent = task.title;
    document.getElementById('rec-task-modal-steps').innerHTML = (task.steps || []).map(function(s, idx) {
      return '<div class="rec-modal-step"><b>' + (idx + 1) + '</b><span>' + escHtml(s) + '</span></div>';
    }).join('');
    document.getElementById('rec-task-modal').style.display = 'flex';
  }

  async function postAction(action, task) {
    await apiFetch('/api/workspaces/' + encodeURIComponent(wsId) + '/recommendations/action', {
      method: 'POST',
      body: JSON.stringify({
        action: action,
        itemKey: task.itemKey,
        itemKind: 'issue',
        actionCode: task.actionCode || null,
        title: task.title,
      }),
    });
  }

  async function confirmDo() {
    if (!pendingTask) return;
    var btn = document.getElementById('rec-task-modal-confirm');
    if (btn) btn.disabled = true;
    try {
      await postAction('EXECUTED', pendingTask);
      toast('تم تسجيل ال��همة — سنراقب النتائج خلال 7 أيام', 'success');
      closeRecTaskModal();
      await loadData();
    } catch (e) {
      toast(e.message || 'تعذّر تسجيل المهمة', 'error');
    } finally { if (btn) btn.disabled = false; }
  }

  async function ignoreTask(itemKey) {
    var task = findTaskByKey(itemKey);
    if (!task) return;
    try {
      await postAction('IGNORED', task);
      toast('تم تجاهل التوصية', 'info');
      await loadData();
    } catch (e) { toast(e.message || 'تعذّر التجاهل', 'error'); }
  }

  document.getElementById('issues-container').addEventListener('click', function(e) {
    var doBtn = e.target.closest('.rec-do-btn');
    if (doBtn) { openDoModal(doBtn.getAttribute('data-item-key')); return; }
    var igBtn = e.target.closest('.rec-ignore-btn');
    if (igBtn) { ignoreTask(igBtn.getAttribute('data-item-key')); }
  });
  document.getElementById('rec-task-modal-cancel').addEventListener('click', closeRecTaskModal);
  document.getElementById('rec-task-modal-confirm').addEventListener('click', confirmDo);

  async function loadData() {
    document.getElementById('issues-container').innerHTML =
      '<div class="loading-overlay"><div class="spinner"></div><div class="loading-text">جارٍ تحليل حملاتك بمعايير Meta���</div></div>';
    try {
      var results = await Promise.all([
        apiFetch('/api/dashboard/' + wsId),
        apiFetch('/api/workspaces/' + wsId + '/recommendations'),
      ]);
      dashData = results[0] || {};
      recs = Array.isArray(results[1]) ? results[1] : [];
      allIssues = Array.isArray(dashData.issues) ? dashData.issues : [];
      render();
    } catch (e) {
      document.getElementById('issues-container').innerHTML =
        '<div class="alert alert-error">' + escHtml(e.message || 'تعذّر التحميل') + '</div>';
    }
  }

  document.getElementById('severity-tabs').addEventListener('click', function(e) {
    var btn = e.target.closest('[data-filter]');
    if (!btn) return;
    activeFilter = btn.dataset.filter;
    document.querySelectorAll('#severity-tabs .tab').forEach(function(t) { t.classList.toggle('active', t === btn); });
    render();
  });
  document.getElementById('search-input').addEventListener('input', render);
  document.getElementById('refresh-btn').addEventListener('click', loadData);

  await loadData();
})();
</script>`;

  return layout({ title: 'التوصيات', active: 'recommendations', content, scripts });
}
