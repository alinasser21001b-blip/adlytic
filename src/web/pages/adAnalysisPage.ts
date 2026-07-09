// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/adAnalysisPage.ts  —  Meta Ad Assessor (تحليل الإعلان)
// ════════════════════════════════════════════════════════════════════════

import { layout } from '../layout';
import { CAMPAIGN_GOALS, INDUSTRIES } from '../../adAssessor/data/meta-metrics';

export function adAnalysisPage(): string {
  const industriesJson = JSON.stringify(INDUSTRIES);
  const goalsJson = JSON.stringify(CAMPAIGN_GOALS.map((g) => ({ value: g.value, labelAr: g.labelAr })));

  const content = `
<style>
  .assessor-hero { margin-bottom: 24px; }
  .assessor-hero h2 { font-size: 22px; font-weight: 800; letter-spacing: -0.4px; margin-bottom: 8px; }
  .assessor-hero p { font-size: 13.5px; color: var(--text-2); line-height: 1.65; max-width: 640px; }

  .wizard-steps { display: flex; align-items: center; justify-content: center; gap: 8px; flex-wrap: wrap; margin-bottom: 20px; }
  .wizard-step {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 14px; border-radius: 999px; font-size: 12.5px; font-weight: 600;
    border: 1px solid var(--border); background: var(--surface-2); color: var(--text-3);
    transition: all var(--transition);
  }
  .wizard-step.active { background: var(--grad-accent); color: #fff; border-color: transparent; box-shadow: var(--shadow-accent); }
  .wizard-step.done { background: var(--accent-dim); color: var(--accent-2); border-color: transparent; }
  .wizard-connector { width: 24px; height: 2px; background: var(--border); border-radius: 1px; }
  .wizard-connector.done { background: var(--accent); }

  .wizard-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 24px; }
  .wizard-card h3 { font-size: 17px; font-weight: 700; margin-bottom: 6px; }
  .wizard-card .hint { font-size: 13px; color: var(--text-2); margin-bottom: 18px; line-height: 1.6; }

  .goal-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; }
  .goal-btn {
    padding: 12px 14px; border-radius: var(--radius); border: 2px solid var(--border);
    background: var(--surface-2); color: var(--text); font-size: 13px; font-weight: 600;
    text-align: right; cursor: pointer; transition: all var(--transition);
  }
  .goal-btn:hover { border-color: var(--accent); }
  .goal-btn.selected { border-color: var(--accent); background: var(--accent-dim); color: var(--accent-2); }

  .upload-zone {
    border: 2px dashed var(--border-2); border-radius: var(--radius-lg);
    padding: 36px 20px; text-align: center; cursor: pointer;
    background: var(--surface-2); transition: all var(--transition);
  }
  .upload-zone:hover, .upload-zone.dragover { border-color: var(--accent); background: var(--accent-dim); }
  .upload-zone .emoji { font-size: 36px; margin-bottom: 10px; }
  .upload-preview { position: relative; max-width: 100%; }
  .upload-preview img { max-height: 280px; width: 100%; object-fit: contain; border-radius: var(--radius-lg); border: 1px solid var(--border); }
  .upload-clear {
    position: absolute; top: -8px; left: -8px;
    width: 28px; height: 28px; border-radius: 50%;
    background: var(--error); color: #fff; border: none; font-size: 14px; cursor: pointer;
  }

  .metrics-toggle { display: flex; flex-direction: column; gap: 10px; }
  .metrics-toggle .toggle-btn {
    width: 100%; padding: 14px 18px; border-radius: var(--radius-lg);
    border: 2px solid var(--border); background: var(--surface-2);
    font-size: 14px; font-weight: 700; cursor: pointer; text-align: center;
    transition: all var(--transition); font-family: inherit; color: var(--text);
  }
  .toggle-btn.selected-skip { border-color: var(--success); background: var(--success-dim); color: var(--success); }
  .toggle-btn.selected-metrics { border-color: var(--accent); background: var(--accent-dim); color: var(--accent-2); }
  .metrics-fields { margin-top: 14px; padding: 16px; border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--surface-2); }
  .metrics-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }

  .wizard-nav { display: flex; gap: 10px; margin-top: 24px; }
  .wizard-nav .btn { flex: 1; }

  .score-bar { margin-bottom: 16px; }
  .score-bar-header { display: flex; justify-content: space-between; font-size: 13px; font-weight: 600; margin-bottom: 6px; }
  .score-bar-track { height: 8px; background: var(--surface-2); border-radius: 4px; overflow: hidden; }
  .score-bar-fill { height: 100%; border-radius: 4px; transition: width 0.7s ease; }
  .score-good { background: var(--grad-success); }
  .score-mid { background: var(--grad-warm); }
  .score-low { background: linear-gradient(90deg, #f43f5e, #ef4444); }

  .result-hero {
    background: var(--grad-vibrant); border-radius: var(--radius-lg);
    padding: 28px; color: #fff; margin-bottom: 20px;
  }
  .result-hero h2 { font-size: 20px; font-weight: 800; margin-bottom: 10px; }
  .result-hero p { font-size: 14px; line-height: 1.7; opacity: 0.95; }
  .result-badge {
    display: inline-flex; align-items: center; gap: 6px;
    margin-top: 12px; padding: 4px 12px; border-radius: 999px;
    background: rgba(255,255,255,0.2); font-size: 11.5px; font-weight: 600;
  }

  .result-section { margin-bottom: 16px; }
  .result-section h3 { font-size: 15px; font-weight: 700; margin-bottom: 10px; }
  .result-list { list-style: none; }
  .result-list li { font-size: 13px; line-height: 1.65; color: var(--text-2); padding: 6px 0; border-bottom: 1px solid var(--border); }
  .result-list li:last-child { border-bottom: none; }
  .action-item {
    display: flex; gap: 12px; padding: 12px 14px; margin-bottom: 8px;
    background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius);
  }
  .action-num {
    width: 28px; height: 28px; flex-shrink: 0; border-radius: 50%;
    background: var(--grad-accent); color: #fff; font-size: 12px; font-weight: 700;
    display: flex; align-items: center; justify-content: center;
  }

  #assessor-loading { display: none; }
  #assessor-form-view, #assessor-result-view { display: block; }

  .source-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 18px; }
  .source-btn {
    padding: 16px; border-radius: var(--radius-lg); border: 2px solid var(--border);
    background: var(--surface-2); text-align: right; cursor: pointer; transition: all var(--transition);
    font-family: inherit; color: var(--text);
  }
  .source-btn:hover { border-color: var(--accent); }
  .source-btn.selected { border-color: var(--accent); background: var(--accent-dim); }
  .source-btn .src-title { font-size: 14px; font-weight: 800; margin-bottom: 4px; }
  .source-btn .src-sub { font-size: 12px; color: var(--text-2); line-height: 1.5; }
  .adlytic-strip {
    display: none; margin-bottom: 16px; padding: 14px 16px; border-radius: var(--radius-lg);
    border: 1px solid rgba(217,167,89,0.35); background: rgba(217,167,89,0.08); direction: rtl;
  }
  .adlytic-strip.show { display: block; }
  .adlytic-strip-title { font-size: 12.5px; font-weight: 800; color: var(--accent-2); margin-bottom: 8px; }
  .adlytic-kpis { display: flex; flex-wrap: wrap; gap: 8px; }
  .adlytic-kpi {
    font-size: 11.5px; color: var(--text-2); background: var(--surface);
    border: 1px solid var(--border-2); border-radius: 999px; padding: 4px 10px;
  }
  .adlytic-kpi b { color: var(--text); }
  .ctx-card {
    margin-bottom: 12px; padding: 12px 14px; border-radius: var(--radius);
    background: var(--surface-2); border: 1px solid var(--border); direction: rtl;
  }
  .ctx-card h4 { font-size: 13px; font-weight: 800; margin-bottom: 6px; color: var(--text); }
  .ctx-card p { font-size: 12.5px; color: var(--text-2); line-height: 1.65; margin: 0; }
  .review-panel {
    display: none; margin-top: 8px; padding: 16px; border-radius: var(--radius-lg);
    border: 1px solid rgba(217,167,89,0.35); background: rgba(217,167,89,0.06); direction: rtl;
  }
  .review-panel.show { display: block; }
  .review-panel-title { font-size: 13px; font-weight: 800; color: var(--accent-2); margin-bottom: 10px; }
  .review-creative {
    display: grid; grid-template-columns: 96px 1fr; gap: 14px; align-items: start; margin-bottom: 12px;
  }
  .review-thumb {
    width: 96px; height: 96px; border-radius: 10px; overflow: hidden;
    background: var(--surface); border: 1px solid var(--border-2);
    display: flex; align-items: center; justify-content: center; color: var(--text-3); font-size: 28px;
  }
  .review-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .review-copy .ad-name { font-size: 14px; font-weight: 800; color: var(--text); margin-bottom: 6px; }
  .review-copy .ad-line { font-size: 12.5px; color: var(--text-2); line-height: 1.55; margin-bottom: 4px; }
  .review-copy .ad-muted { color: var(--text-3); font-size: 12px; }
  .manual-fields.hidden-by-adlytic { display: none !important; }
  @media (max-width: 640px) {
    .source-grid { grid-template-columns: 1fr; }
    .review-creative { grid-template-columns: 1fr; }
  }
</style>

<div class="page-header assessor-hero">
  <div class="page-title">تحليل الإعلان</div>
  <div class="page-subtitle">تحليل متقدم يستفيد من بيانات Adlytic الحية — أو حلّل إعلاناً جديداً يدوياً</div>
</div>

<div id="assessor-error" class="alert alert-error" style="display:none;"></div>

<div id="assessor-form-view">
  <div class="wizard-steps" id="wizard-steps"></div>
  <div class="wizard-card">
    <div id="step-0">
      <h3>من أين نحلّل؟</h3>
      <p class="hint">اختر حملة متصلة — المحتوى والأرقام يُجلبان تلقائياً، ثم تراجع وتحلّل مباشرة. أو ابدأ بإعلان جديد يدوياً.</p>
      <div class="source-grid">
        <button type="button" class="source-btn selected" id="src-adlytic" data-source="adlytic">
          <div class="src-title">حملة من Adlytic</div>
          <div class="src-sub">مقاييس حية · صحة الحملة · تشخيصات · توصيات الذكاء الاصطناعي</div>
        </button>
        <button type="button" class="source-btn" id="src-manual" data-source="manual">
          <div class="src-title">إعلان جديد يدوياً</div>
          <div class="src-sub">ارفع صورة ونصاً — بدون ربط بحملة</div>
        </button>
      </div>
      <div id="adlytic-picker" class="form-group">
        <label class="form-label">اختر الحملة</label>
        <select class="form-input" id="field-campaign">
          <option value="">جارٍ تحميل الحملات…</option>
        </select>
        <p class="hint" id="campaign-load-hint" style="margin-top:8px;margin-bottom:0;">لن نطلب منك رفع الصورة أو إعادة كتابة النص — جاهز من حسابك.</p>
      </div>
    </div>

    <div id="step-1" style="display:none;">
      <h3 id="step-1-title">عن إعلانك</h3>
      <p class="hint" id="step-1-hint">أخبرنا ببساطة — لا حاجة لمصطلحات Ads Manager.</p>
      <div class="adlytic-strip" id="adlytic-strip">
        <div class="adlytic-strip-title">بيانات Adlytic الحية</div>
        <div class="adlytic-kpis" id="adlytic-kpis"></div>
      </div>
      <div class="review-panel" id="review-panel">
        <div class="review-panel-title">محتوى الحملة جاهز من Adlytic — لن نطلبه منك مرة أخرى</div>
        <div class="review-creative">
          <div class="review-thumb" id="review-thumb">🎨</div>
          <div class="review-copy" id="review-copy"></div>
        </div>
        <button type="button" class="btn btn-ghost btn-sm" id="btn-edit-creative">تعديل المحتوى يدوياً</button>
      </div>
      <div id="step-1-manual-meta" class="manual-fields">
        <div class="form-group">
          <label class="form-label">مجال عملك</label>
          <select class="form-input" id="field-industry"></select>
        </div>
        <div class="form-group">
          <label class="form-label">ما الذي تريد تحقيقه؟</label>
          <div class="goal-grid" id="goal-grid"></div>
        </div>
        <div class="form-group">
          <label class="form-label">من جمهورك؟ (اختياري)</label>
          <textarea class="form-input" id="field-audience" rows="2" placeholder="مثال: نساء 25-40 في السعودية مهتمات بالعناية"></textarea>
        </div>
      </div>
    </div>

    <div id="step-2" style="display:none;">
      <h3>محتوى الإعلان</h3>
      <p class="hint" id="step-2-hint">ارفع صورة إعلانك — هذا أهم شيء! سنساعدك تفهم ما يراه المشاهد في أول ثانيتين.</p>
      <div id="upload-area"></div>
      <div class="form-group" style="margin-top:16px;">
        <label class="form-label">النص الأساسي (اختياري)</label>
        <textarea class="form-input" id="field-primary" rows="3" placeholder="اكتب نص إعلانك هنا..."></textarea>
      </div>
      <div class="form-group">
        <label class="form-label">العنوان (اختياري)</label>
        <input class="form-input" id="field-headline" placeholder="مثال: خصم 30% — لفترة محدودة" />
      </div>
      <div class="form-group">
        <label class="form-label">ما الذي تريد أن يفعله المشاهد؟</label>
        <input class="form-input" id="field-action" placeholder="مثال: يضغط «تسوق الآن» ويكمل الشراء" />
      </div>
    </div>

    <div id="step-3" style="display:none;">
      <h3>أرقامك</h3>
      <p class="hint">هل لديك أرقام من Ads Manager؟ (اختياري)</p>
      <div class="metrics-toggle">
        <button type="button" class="toggle-btn selected-skip" id="btn-skip-metrics">✨ لا أملك أرقاماً بعد — حلّل الإعلان فقط</button>
        <button type="button" class="toggle-btn" id="btn-add-metrics">لدي أرقام — أريد إضافتها</button>
      </div>
      <div class="metrics-fields" id="metrics-fields" style="display:none;">
        <div class="form-group">
          <label class="form-label">العملة</label>
          <select class="form-input" id="field-currency">
            <option value="USD">USD — دولار</option>
            <option value="SAR">SAR — ريال</option>
            <option value="AED">AED — درهم</option>
            <option value="EUR">EUR — يورو</option>
          </select>
        </div>
        <div class="metrics-grid">
          <div class="form-group"><label class="form-label">المبلغ المنفق</label><input type="number" class="form-input" id="field-spend" min="0" step="0.01" /></div>
          <div class="form-group"><label class="form-label">مرات الظهور</label><input type="number" class="form-input" id="field-impressions" min="0" /></div>
          <div class="form-group"><label class="form-label">النقرات</label><input type="number" class="form-input" id="field-clicks" min="0" /></div>
          <div class="form-group"><label class="form-label" id="label-conversions">عدد النتائج</label><input type="number" class="form-input" id="field-conversions" min="0" /></div>
          <div class="form-group" style="grid-column:1/-1;"><label class="form-label" id="label-efficiency">مقياس الكفاءة (اختياري)</label><input type="number" class="form-input" id="field-roas" min="0" step="0.01" /></div>
        </div>
      </div>
    </div>

    <div class="wizard-nav">
      <button type="button" class="btn btn-secondary" id="btn-back" style="display:none;flex:0;">→ رجوع</button>
      <button type="button" class="btn btn-primary" id="btn-next">التالي ←</button>
    </div>
  </div>
</div>

<div id="assessor-loading" class="loading-overlay">
  <div class="spinner"></div>
  <div class="loading-text">جاري تحليل إعلانك…</div>
</div>

<div id="assessor-result-view" style="display:none;"></div>`;

  const scripts = `<script>
(async () => {
  const INDUSTRIES = ${industriesJson};
  const GOALS = ${goalsJson};
  const STEPS = [
    { id: 0, title: 'المصدر', emoji: '🔗' },
    { id: 1, title: 'عن إعلانك', emoji: '🎯' },
    { id: 2, title: 'محتوى الإعلان', emoji: '✨' },
    { id: 3, title: 'أرقامك', emoji: '📊' },
  ];

  const token = localStorage.getItem('adlytic_token');
  if (!token) { window.location.href = '/login'; return; }
  if (!(await ensureAccountActive())) return;

  let step = 0;
  let goal = 'sales';
  let skipImage = false;
  let skipMetrics = true;
  let imageBase64, imageMimeType, imagePreview;
  let analysisSource = 'adlytic';
  let workspaceId = (typeof getWsId === 'function' ? getWsId() : null) || localStorage.getItem('adlytic_workspace_id') || '';
  let selectedCampaignId = '';
  let prefillAdId = '';
  let adlyticContext = null;
  let campaignsLoaded = false;
  let forceEditCreative = false;

  var CTA_AR = {
    SHOP_NOW: 'تسوق الآن', LEARN_MORE: 'اعرف المزيد', SIGN_UP: 'سجّل الآن',
    BOOK_TRAVEL: 'احجز', CONTACT_US: 'تواصل معنا', DOWNLOAD: 'حمّل',
    GET_OFFER: 'احصل على العرض', GET_QUOTE: 'اطلب عرض سعر', APPLY_NOW: 'قدّم الآن',
    BUY_NOW: 'اشترِ الآن', ORDER_NOW: 'اطلب الآن', SUBSCRIBE: 'اشترك',
    WATCH_MORE: 'شاهد المزيد', SEND_MESSAGE: 'أرسل رسالة', WHATSAPP_MESSAGE: 'راسل عبر واتساب',
    INSTAGRAM_MESSAGE: 'راسل عبر إنستغرام', GET_DIRECTIONS: 'احصل على الاتجاهات',
    CALL_NOW: 'اتصل الآن', NO_BUTTON: 'بدون زر',
  };

  function esc(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function parseNum(v) {
    if (!v || String(v).trim() === '') return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }

  function ctaLabel(raw) {
    if (!raw) return '';
    var key = String(raw).toUpperCase();
    return CTA_AR[key] || String(raw).replace(/_/g, ' ');
  }

  function isAdlyticMode() {
    return analysisSource === 'adlytic' && !!selectedCampaignId && !!adlyticContext;
  }

  function hasAdlyticCreativeReady(ctx) {
    if (!ctx || !ctx.creative) return false;
    var c = ctx.creative;
    return !!(c.thumbnailUrl || c.primaryText || c.headline || c.callToActionType);
  }

  function hasAdlyticMetricsReady(ctx) {
    if (!ctx || !ctx.metrics) return false;
    var m = ctx.metrics;
    return (Number(m.impressions) || 0) > 0
      || (Number(m.spendMajor) || 0) > 0
      || (Number(m.messages) || 0) > 0
      || (Number(m.purchases) || 0) > 0
      || (Number(m.leads) || 0) > 0;
  }

  function shouldSkipContentSteps() {
    return isAdlyticMode() && hasAdlyticCreativeReady(adlyticContext) && !forceEditCreative;
  }

  function visibleSteps() {
    if (shouldSkipContentSteps()) {
      return [
        { id: 0, title: 'المصدر', emoji: '🔗' },
        { id: 1, title: 'مراجعة وتحليل', emoji: '✨' },
      ];
    }
    return STEPS;
  }

  function renderSteps() {
    const el = document.getElementById('wizard-steps');
    if (!el) return;
    var steps = visibleSteps();
    el.innerHTML = steps.map(function(s, i) {
      const cls = step === s.id ? 'active' : (step > s.id ? 'done' : '');
      const conn = i < steps.length - 1
        ? '<div class="wizard-connector' + (step > s.id ? ' done' : '') + '"></div>'
        : '';
      return '<div class="wizard-step ' + cls + '"><span>' + s.emoji + '</span><span>' + s.title + '</span></div>' + conn;
    }).join('');
  }

  function syncStep1Chrome() {
    var title = document.getElementById('step-1-title');
    var hint = document.getElementById('step-1-hint');
    var review = document.getElementById('review-panel');
    var meta = document.getElementById('step-1-manual-meta');
    var skipReady = shouldSkipContentSteps();
    if (title) title.textContent = skipReady ? 'مراجعة الحملة' : 'عن إعلانك';
    if (hint) {
      hint.textContent = skipReady
        ? 'المحتوى والأرقام جاهزة من حسابك. راجعها ثم اضغط «حلّل الآن».'
        : 'أخبرنا ببساطة — لا حاجة لمصطلحات Ads Manager.';
    }
    if (review) review.classList.toggle('show', skipReady);
    if (meta) meta.classList.toggle('hidden-by-adlytic', skipReady && !forceEditCreative);
  }

  function showStep(n) {
    step = n;
    [0,1,2,3].forEach(function(i) {
      var el = document.getElementById('step-' + i);
      if (el) el.style.display = i === n ? 'block' : 'none';
    });
    document.getElementById('btn-back').style.display = n > 0 ? 'inline-flex' : 'none';
    var nextBtn = document.getElementById('btn-next');
    if (shouldSkipContentSteps() && n === 1) {
      nextBtn.textContent = '🔍 حلّل الآن';
    } else {
      nextBtn.textContent = n < 3 ? 'التالي ←' : '🔍 افهم إعلاني';
    }
    renderSteps();
    updateMetricLabels();
    syncStep1Chrome();
    if (n === 1 && adlyticContext) {
      renderAdlyticStrip();
      renderReviewPanel();
    }
  }

  function setAnalysisSource(src) {
    analysisSource = src === 'manual' ? 'manual' : 'adlytic';
    document.getElementById('src-adlytic').classList.toggle('selected', analysisSource === 'adlytic');
    document.getElementById('src-manual').classList.toggle('selected', analysisSource === 'manual');
    document.getElementById('adlytic-picker').style.display = analysisSource === 'adlytic' ? 'block' : 'none';
    if (analysisSource === 'manual') {
      adlyticContext = null;
      selectedCampaignId = '';
      prefillAdId = '';
      forceEditCreative = false;
      document.getElementById('adlytic-strip').classList.remove('show');
      var review = document.getElementById('review-panel');
      if (review) review.classList.remove('show');
    }
    syncStep1Chrome();
    renderSteps();
  }

  async function ensureWorkspaceId() {
    if (workspaceId) return workspaceId;
    try {
      var me = await apiFetch('/api/auth/me');
      if (me && me.memberships && me.memberships.length) {
        workspaceId = me.memberships[0].workspaceId || (me.memberships[0].workspace && me.memberships[0].workspace.id);
        if (workspaceId) {
          if (typeof setWsId === 'function') setWsId(workspaceId);
          else localStorage.setItem('adlytic_workspace_id', workspaceId);
        }
      }
    } catch (e) {}
    return workspaceId;
  }

  async function loadCampaigns() {
    var sel = document.getElementById('field-campaign');
    var hint = document.getElementById('campaign-load-hint');
    var ws = await ensureWorkspaceId();
    if (!ws) {
      sel.innerHTML = '<option value="">لا توجد مساحة عمل — اربط حسابك أولاً</option>';
      if (hint) hint.textContent = 'اربط حساب Meta من مساحة العمل لتفعيل التحليل المتقدم.';
      return;
    }
    try {
      var data = await apiFetch('/api/workspaces/' + ws + '/ad-assessor/campaigns');
      var camps = (data && data.campaigns) || [];
      if (!camps.length) {
        sel.innerHTML = '<option value="">لا توجد حملات متزامنة بعد</option>';
        if (hint) hint.textContent = 'زامِن حسابك من صفحة الحملات ثم عد إلى هنا.';
        return;
      }
      sel.innerHTML = '<option value="">— اختر حملة —</option>' + camps.map(function(c) {
        return '<option value="' + esc(c.id) + '">' + esc(c.name) + (c.status === 'ACTIVE' ? '' : ' (' + esc(c.status) + ')') + '</option>';
      }).join('');
      campaignsLoaded = true;
      if (hint) hint.textContent = 'سنملأ النص والأرقام تلقائياً من بيانات حسابك.';

      var params = new URLSearchParams(window.location.search);
      var qCamp = params.get('campaignId');
      var qAd = params.get('adId') || '';
      if (qCamp && camps.some(function(c) { return c.id === qCamp; })) {
        sel.value = qCamp;
        selectedCampaignId = qCamp;
        prefillAdId = qAd;
        await loadAdlyticContext(qCamp, qAd || null);
      }
    } catch (e) {
      sel.innerHTML = '<option value="">تعذّر تحميل الحملات</option>';
      if (hint) hint.textContent = friendlyApiError(e);
    }
  }

  async function loadAdlyticContext(campaignId, adId) {
    var ws = await ensureWorkspaceId();
    if (!ws || !campaignId) return;
    try {
      var q = '/api/workspaces/' + ws + '/ad-assessor/context?campaignId=' + encodeURIComponent(campaignId);
      if (adId) q += '&adId=' + encodeURIComponent(adId);
      adlyticContext = await apiFetch(q);
      applyAdlyticPrefillToForm(adlyticContext);
      renderAdlyticStrip();
    } catch (e) {
      adlyticContext = null;
      toast(friendlyApiError(e), 'error');
    }
  }

  function applyAdlyticPrefillToForm(ctx) {
    if (!ctx) return;
    if (ctx.industryHint) {
      var ind = document.getElementById('field-industry');
      if (ind) ind.value = ctx.industryHint;
    }
    if (ctx.goalHint) {
      goal = ctx.goalHint;
      renderGoals();
      updateMetricLabels();
    }
    if (ctx.creative) {
      if (ctx.creative.adId) prefillAdId = ctx.creative.adId;
      if (ctx.creative.primaryText) document.getElementById('field-primary').value = ctx.creative.primaryText;
      if (ctx.creative.headline) document.getElementById('field-headline').value = ctx.creative.headline;
      if (ctx.creative.callToActionType) {
        document.getElementById('field-action').value = ctaLabel(ctx.creative.callToActionType);
      }
      if (ctx.creative.thumbnailUrl) {
        imagePreview = ctx.creative.thumbnailUrl;
        // Remote CDN preview only — server uses Adlytic copy + live metrics.
        skipImage = true;
      } else if (ctx.creative.primaryText || ctx.creative.headline) {
        // Copy-only creative: never block the merchant on image upload.
        skipImage = true;
      }
    }
    // Live metrics: never ask the merchant to re-type Ads Manager numbers.
    skipMetrics = true;
    document.getElementById('btn-skip-metrics').classList.add('selected-skip');
    document.getElementById('btn-add-metrics').classList.remove('selected-metrics');
    document.getElementById('metrics-fields').style.display = 'none';
    var skipBtn = document.getElementById('btn-skip-metrics');
    if (skipBtn) skipBtn.textContent = '✓ تم جلب الأرقام من Adlytic تلقائياً';
    forceEditCreative = false;
    renderReviewPanel();
    syncStep1Chrome();
    renderSteps();
  }

  function renderReviewPanel() {
    var panel = document.getElementById('review-panel');
    var thumb = document.getElementById('review-thumb');
    var copy = document.getElementById('review-copy');
    if (!panel || !thumb || !copy) return;
    if (!shouldSkipContentSteps()) {
      panel.classList.remove('show');
      return;
    }
    var c = adlyticContext.creative || {};
    var m = adlyticContext.metrics || {};
    if (c.thumbnailUrl) {
      thumb.innerHTML = '<img src="' + esc(c.thumbnailUrl) + '" alt="" referrerpolicy="no-referrer" />';
    } else {
      thumb.textContent = '🎨';
    }
    var lines = [];
    lines.push('<div class="ad-name">' + esc(c.adName || adlyticContext.campaignName || 'الحملة') + '</div>');
    if (c.headline) lines.push('<div class="ad-line"><b>العنوان:</b> ' + esc(c.headline) + '</div>');
    if (c.primaryText) lines.push('<div class="ad-line"><b>النص:</b> ' + esc(c.primaryText) + '</div>');
    if (c.callToActionType) lines.push('<div class="ad-line"><b>الدعوة:</b> ' + esc(ctaLabel(c.callToActionType)) + '</div>');
    if (!c.headline && !c.primaryText) {
      lines.push('<div class="ad-muted">لا يوجد نص إبداعي مخزّن — سنحلّل الأداء والتشخيصات من بيانات الحملة.</div>');
    }
    if (hasAdlyticMetricsReady(adlyticContext)) {
      lines.push(
        '<div class="ad-muted" style="margin-top:8px;">الأرقام جاهزة: إنفاق '
        + esc(String(m.spendMajor)) + ' ' + esc(m.currency || '')
        + (m.ctr != null ? ' · تفاعل ' + esc(String(m.ctr)) + '%' : '')
        + ' · آخر ' + esc(String(m.windowDays || 30)) + ' يوماً</div>'
      );
    }
    copy.innerHTML = lines.join('');
    panel.classList.add('show');
  }

  function renderAdlyticStrip() {
    var strip = document.getElementById('adlytic-strip');
    var kpis = document.getElementById('adlytic-kpis');
    if (!strip || !kpis || !adlyticContext) {
      if (strip) strip.classList.remove('show');
      return;
    }
    var m = adlyticContext.metrics || {};
    var chips = [];
    chips.push('<span class="adlytic-kpi"><b>' + esc(adlyticContext.campaignName) + '</b></span>');
    chips.push('<span class="adlytic-kpi">إنفاق: <b>' + esc(String(m.spendMajor)) + ' ' + esc(m.currency || '') + '</b></span>');
    if (m.ctr != null) chips.push('<span class="adlytic-kpi">تفاعل: <b>' + esc(String(m.ctr)) + '%</b></span>');
    if (m.messages != null) chips.push('<span class="adlytic-kpi">نتائج: <b>' + esc(String(m.messages)) + '</b></span>');
    if (adlyticContext.healthScore != null) chips.push('<span class="adlytic-kpi">صحة: <b>' + esc(String(adlyticContext.healthScore)) + '/100</b></span>');
    if (adlyticContext.diagnoses && adlyticContext.diagnoses[0]) {
      chips.push('<span class="adlytic-kpi">تشخيص: <b>' + esc(adlyticContext.diagnoses[0].title) + '</b></span>');
    }
    kpis.innerHTML = chips.join('');
    strip.classList.add('show');
  }

  function updateMetricLabels() {
    var conv = document.getElementById('label-conversions');
    var eff = document.getElementById('label-efficiency');
    var roasField = document.getElementById('field-roas');
    if (!conv || !eff) return;
    if (goal === 'leads') {
      conv.textContent = 'عدد العملاء المحتملين';
      eff.textContent = 'تكلفة العميل المحتمل (CPL)';
      if (roasField) roasField.placeholder = '25';
    } else if (goal === 'sales') {
      conv.textContent = 'عدد المشتريات';
      eff.textContent = 'عائد الإعلان (ROAS)';
      if (roasField) roasField.placeholder = '3';
    } else {
      conv.textContent = 'عدد النتائج';
      eff.textContent = 'مقياس الكفاءة (اختياري)';
      if (roasField) roasField.placeholder = '';
    }
    var effWrap = eff.closest('.form-group');
    if (effWrap) effWrap.style.display = (goal === 'awareness') ? 'none' : '';
  }

  function renderGoals() {
    var grid = document.getElementById('goal-grid');
    if (!grid) return;
    grid.innerHTML = GOALS.map(function(g) {
      return '<button type="button" class="goal-btn' + (goal === g.value ? ' selected' : '') + '" data-goal="' + g.value + '">' + esc(g.labelAr) + '</button>';
    }).join('');
    grid.querySelectorAll('.goal-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        goal = btn.getAttribute('data-goal');
        renderGoals();
        updateMetricLabels();
      });
    });
  }

  function renderIndustries() {
    var sel = document.getElementById('field-industry');
    if (!sel) return;
    sel.innerHTML = INDUSTRIES.map(function(i) {
      return '<option value="' + i.value + '">' + esc(i.labelAr) + '</option>';
    }).join('');
  }

  function renderUpload() {
    var area = document.getElementById('upload-area');
    if (!area) return;
    if (imagePreview) {
      area.innerHTML = '<div class="upload-preview"><img src="' + imagePreview + '" alt="معاينة" /><button type="button" class="upload-clear" id="clear-image">✕</button></div>';
      document.getElementById('clear-image').addEventListener('click', clearImage);
      return;
    }
    area.innerHTML = '<div class="upload-zone" id="upload-zone"><input type="file" accept="image/*" id="file-input" style="display:none" /><div class="emoji">📸</div><p style="font-weight:700;margin-bottom:6px;">ارفع صورة إعلانك</p><p class="text-sm text-2">اسحب الصورة أو انقر هنا — PNG, JPG, WEBP حتى 10MB</p><button type="button" class="btn btn-ghost btn-sm" id="skip-image-btn" style="margin-top:12px;">ليس لدي صورة بعد — تخطَّ مؤقتاً</button></div>';
    var zone = document.getElementById('upload-zone');
    var input = document.getElementById('file-input');
    zone.addEventListener('click', function(e) {
      if (e.target.id === 'skip-image-btn') return;
      input.click();
    });
    zone.addEventListener('dragover', function(e) { e.preventDefault(); zone.classList.add('dragover'); });
    zone.addEventListener('dragleave', function() { zone.classList.remove('dragover'); });
    zone.addEventListener('drop', function(e) {
      e.preventDefault(); zone.classList.remove('dragover');
      if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
    });
    input.addEventListener('change', function() {
      if (input.files[0]) handleFile(input.files[0]);
    });
    document.getElementById('skip-image-btn').addEventListener('click', function(e) {
      e.stopPropagation();
      skipImage = true;
      toast('تم التخطي — يمكنك المتابعة بدون صورة', 'info');
    });
  }

  function handleFile(file) {
    if (!file.type.startsWith('image/')) { toast('يرجى اختيار صورة', 'warning'); return; }
    if (file.size > 10 * 1024 * 1024) { toast('حجم الصورة يجب أن يكون أقل من 10MB', 'error'); return; }
    var reader = new FileReader();
    reader.onload = function() {
      imagePreview = reader.result;
      imageBase64 = String(reader.result).split(',')[1];
      imageMimeType = file.type;
      skipImage = false;
      renderUpload();
    };
    reader.readAsDataURL(file);
  }

  function clearImage() {
    imagePreview = imageBase64 = imageMimeType = undefined;
    // If Adlytic still has copy, keep image optional — don't trap the merchant.
    skipImage = isAdlyticMode() && hasAdlyticCreativeReady(adlyticContext);
    if (!skipImage && adlyticContext && adlyticContext.creative && adlyticContext.creative.thumbnailUrl) {
      imagePreview = adlyticContext.creative.thumbnailUrl;
      skipImage = true;
    }
    renderUpload();
  }

  function resetAssessor() {
    step = 0; goal = 'sales'; skipImage = false; skipMetrics = true;
    imageBase64 = imageMimeType = imagePreview = undefined;
    adlyticContext = null; selectedCampaignId = ''; prefillAdId = ''; forceEditCreative = false;
    document.getElementById('assessor-result-view').style.display = 'none';
    document.getElementById('assessor-result-view').innerHTML = '';
    document.getElementById('assessor-form-view').style.display = 'block';
    document.getElementById('assessor-error').style.display = 'none';
    document.getElementById('adlytic-strip').classList.remove('show');
    var review = document.getElementById('review-panel');
    if (review) review.classList.remove('show');
    ['field-primary','field-headline','field-action','field-audience'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.value = '';
    });
    var skipBtn = document.getElementById('btn-skip-metrics');
    if (skipBtn) skipBtn.textContent = '✨ لا أملك أرقاماً بعد — حلّل الإعلان فقط';
    setAnalysisSource('adlytic');
    showStep(0);
    renderGoals();
    renderUpload();
    document.getElementById('btn-skip-metrics').classList.add('selected-skip');
    document.getElementById('btn-add-metrics').classList.remove('selected-metrics');
    document.getElementById('metrics-fields').style.display = 'none';
  }

  function scoreClass(score) {
    if (score >= 75) return 'score-good';
    if (score >= 50) return 'score-mid';
    return 'score-low';
  }

  function renderResults(result) {
    var usedLib = result.trendContext && result.trendContext.source === 'meta_ad_library';
    var ctx = result.dataContext;
    var breakdown = [
      result.creativeBreakdown.hook,
      result.creativeBreakdown.messageClarity,
      result.creativeBreakdown.visualImpact,
      result.creativeBreakdown.ctaStrength,
    ];

    var html = '<div class="result-hero">'
      + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">'
      + '<div><p style="font-size:12px;opacity:0.9;margin-bottom:6px;">تحليل إعلانك</p>'
      + '<h2>ماذا يقول إعلانك للجمهور؟</h2>'
      + (ctx ? '<span class="result-badge">مبني على بيانات Adlytic</span>' : '')
      + (usedLib ? '<span class="result-badge">مقارنة مع Meta Ad Library</span>' : '')
      + (result.analysisMode === 'curated_fallback' ? '<span class="result-badge">وضع احتياطي</span>' : '')
      + '</div>'
      + '<button type="button" class="btn btn-secondary btn-sm" id="btn-new-ad">← إعلان جديد</button>'
      + '</div>'
      + '<p style="margin-top:14px;">' + esc(result.audienceMessage.ar) + '</p>'
      + '<p style="margin-top:8px;font-size:13px;opacity:0.85;">' + esc(result.summaryAr) + '</p>'
      + '</div>';

    if (ctx) {
      html += '<div class="card result-section"><h3>بيانات Adlytic لهذه الحملة</h3>';
      var m = ctx.metrics || {};
      html += '<div class="adlytic-kpis" style="margin-bottom:12px;">'
        + '<span class="adlytic-kpi"><b>' + esc(ctx.campaignName) + '</b></span>'
        + '<span class="adlytic-kpi">إنفاق ' + esc(String(m.windowDays || 30)) + 'ي: <b>' + esc(String(m.spendMajor)) + ' ' + esc(m.currency || '') + '</b></span>'
        + (m.ctr != null ? '<span class="adlytic-kpi">تفاعل: <b>' + esc(String(m.ctr)) + '%</b></span>' : '')
        + (m.frequency != null ? '<span class="adlytic-kpi">تكرار: <b>' + esc(String(m.frequency)) + '</b></span>' : '')
        + (ctx.healthScore != null ? '<span class="adlytic-kpi">صحة: <b>' + esc(String(ctx.healthScore)) + '/100</b></span>' : '')
        + '</div>';
      if (ctx.diagnoses && ctx.diagnoses.length) {
        ctx.diagnoses.forEach(function(d) {
          html += '<div class="ctx-card"><h4>' + esc(d.title) + '</h4><p>' + esc(d.explanation) + '</p>'
            + (d.action ? '<p style="margin-top:6px;color:var(--accent-2);font-weight:700;">' + esc(d.action) + '</p>' : '')
            + '</div>';
        });
      }
      if (ctx.brain && (ctx.brain.arabicTitle || ctx.brain.arabicNarration)) {
        html += '<div class="ctx-card" style="border-color:rgba(217,167,89,0.35);">'
          + '<h4>' + esc(ctx.brain.arabicTitle || 'توصية مراقب الذكاء الاصطناعي') + '</h4>'
          + '<p>' + esc(ctx.brain.arabicNarration || '') + '</p></div>';
      }
      if (ctx.selfBenchmark && ctx.selfBenchmark.winningPatterns && ctx.selfBenchmark.winningPatterns.length) {
        html += '<div class="ctx-card"><h4>مقارنة مع إعلاناتك الأخرى</h4><ul class="result-list">';
        ctx.selfBenchmark.winningPatterns.forEach(function(p) {
          html += '<li>• ' + esc(p) + '</li>';
        });
        html += '</ul></div>';
      }
      if (ctx.campaignId) {
        html += '<a class="btn btn-ghost btn-sm" href="/campaigns">افتح في الحملات</a>';
      }
      html += '</div>';
    }

    if (result.trendComparison) {
      html += '<div class="card result-section"><h3>مقارنتك مع الإعلانات الناجحة</h3>'
        + '<p class="text-sm text-2" style="margin-bottom:10px;">' + (usedLib ? 'تحليل مبني على ' + (result.trendContext.totalAdsAnalyzed || 0) + ' إعلاناً نشطاً' : 'تحليل مبني على اتجاهات MENA في مجالك') + '</p>'
        + '<p style="font-size:13px;line-height:1.65;">' + esc(result.trendComparison.ar) + '</p></div>';
    }

    if (result.trendContext && result.trendContext.exampleAds && result.trendContext.exampleAds.length) {
      html += '<div class="card result-section"><h3>إعلانات ناجحة في مجالك</h3><div>';
      result.trendContext.exampleAds.slice(0, 3).forEach(function(ad) {
        html += '<div style="padding:12px;margin-bottom:8px;background:var(--surface-2);border-radius:var(--radius);border:1px solid var(--border);">'
          + '<p class="text-xs text-3" style="font-weight:600;">' + esc(ad.pageName) + '</p>'
          + '<p style="font-size:13px;margin-top:6px;line-height:1.6;">' + esc(ad.body) + '</p>'
          + (ad.headline ? '<p class="text-xs" style="margin-top:6px;color:var(--accent-2);">← ' + esc(ad.headline) + '</p>' : '')
          + '</div>';
      });
      html += '</div></div>';
    }

    html += '<div class="card result-section"><h3>تحليل المحتوى — ببساطة</h3>';
    breakdown.forEach(function(item) {
      html += '<div class="score-bar" style="padding:12px;background:var(--surface-2);border-radius:var(--radius);margin-bottom:10px;">'
        + '<div class="score-bar-header"><span>' + esc(item.labelAr) + '</span><span>' + item.score + '/100</span></div>'
        + '<div class="score-bar-track"><div class="score-bar-fill ' + scoreClass(item.score) + '" style="width:' + item.score + '%"></div></div>'
        + '<p style="font-size:12.5px;color:var(--text-2);margin-top:8px;line-height:1.6;">' + esc(item.explanationAr) + '</p></div>';
    });
    html += '</div>';

    if (result.strengths && result.strengths.length) {
      html += '<div class="card result-section" style="border-color:rgba(34,197,94,0.3);"><h3>ما يعمل بشكل جيد</h3><ul class="result-list">';
      result.strengths.forEach(function(s) { html += '<li>• ' + esc(s.ar) + '</li>'; });
      html += '</ul></div>';
    }

    html += '<div class="card result-section"><h3>ماذا يجب أن تغيّر؟</h3>';
    (result.actionItems || []).forEach(function(item, i) {
      html += '<div class="action-item"><span class="action-num">' + (i+1) + '</span><p style="font-size:13px;line-height:1.65;">' + esc(item.ar) + '</p></div>';
    });
    html += '</div>';

    if (result.industryTips && result.industryTips.length) {
      html += '<div class="card result-section"><h3>نصائح لمجالك</h3><ul class="result-list">';
      result.industryTips.forEach(function(t) { html += '<li>' + esc(t.ar) + '</li>'; });
      html += '</ul></div>';
    }

    if (result.performanceInsight) {
      html += '<div class="card result-section"><h3>نظرة على الأرقام</h3><p style="font-size:13px;line-height:1.65;">' + esc(result.performanceInsight.ar) + '</p></div>';
    }

    html += '<div style="text-align:center;margin-top:20px;"><button type="button" class="btn btn-primary btn-lg" id="btn-another">حلّل إعلاناً آخر</button></div>';

    document.getElementById('assessor-form-view').style.display = 'none';
    document.getElementById('assessor-result-view').style.display = 'block';
    document.getElementById('assessor-result-view').innerHTML = html;

    document.getElementById('btn-new-ad').addEventListener('click', resetAssessor);
    document.getElementById('btn-another').addEventListener('click', resetAssessor);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function submitAssessment() {
    var errEl = document.getElementById('assessor-error');
    errEl.style.display = 'none';

    var useAdlytic = analysisSource === 'adlytic' && selectedCampaignId && workspaceId;
    var hasMetrics = useAdlytic ? true : !skipMetrics;
    var metrics = (!useAdlytic && hasMetrics) ? {
      spend: parseNum(document.getElementById('field-spend').value),
      impressions: parseNum(document.getElementById('field-impressions').value),
      clicks: parseNum(document.getElementById('field-clicks').value),
      conversions: parseNum(document.getElementById('field-conversions').value),
      roasOrCpl: parseNum(document.getElementById('field-roas').value),
      currency: document.getElementById('field-currency').value,
    } : undefined;

    var payload = {
      industry: document.getElementById('field-industry').value,
      goal: goal,
      targetAudience: document.getElementById('field-audience').value || undefined,
      creative: {
        primaryText: document.getElementById('field-primary').value || undefined,
        headline: document.getElementById('field-headline').value || undefined,
        desiredAction: document.getElementById('field-action').value || undefined,
      },
      metrics: metrics,
      hasMetrics: hasMetrics,
      imageBase64: imageBase64,
      imageMimeType: imageMimeType,
    };
    if (useAdlytic) {
      payload.workspaceId = workspaceId;
      payload.campaignId = selectedCampaignId;
      var adId = prefillAdId
        || (adlyticContext && adlyticContext.creative && adlyticContext.creative.adId)
        || undefined;
      if (adId) payload.adId = adId;
      // Prefer Adlytic creative fields if the form was left empty.
      if (!payload.creative.primaryText && adlyticContext && adlyticContext.creative) {
        payload.creative.primaryText = adlyticContext.creative.primaryText || undefined;
        payload.creative.headline = payload.creative.headline || adlyticContext.creative.headline || undefined;
        payload.creative.desiredAction = payload.creative.desiredAction
          || ctaLabel(adlyticContext.creative.callToActionType) || undefined;
      }
    }

    document.getElementById('assessor-form-view').style.display = 'none';
    document.getElementById('assessor-loading').style.display = 'flex';

    try {
      var data = await apiFetch('/api/ad-assessor/assess', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!data) return;
      renderResults(data);
    } catch (err) {
      document.getElementById('assessor-form-view').style.display = 'block';
      errEl.textContent = err.message || 'الخدمة غير متوفرة مؤقتاً';
      errEl.style.display = 'flex';
      toast(friendlyApiError(err), 'error');
    } finally {
      document.getElementById('assessor-loading').style.display = 'none';
    }
  }

  document.getElementById('btn-back').addEventListener('click', function() {
    if (step <= 0) return;
    if (shouldSkipContentSteps()) {
      showStep(0);
      return;
    }
    // Jump over auto-skipped steps when returning from manual edit path.
    if (step === 3 && isAdlyticMode() && hasAdlyticMetricsReady(adlyticContext) && forceEditCreative) {
      showStep(2);
      return;
    }
    showStep(step - 1);
  });

  document.getElementById('btn-next').addEventListener('click', async function() {
    if (step === 0) {
      if (analysisSource === 'adlytic') {
        selectedCampaignId = document.getElementById('field-campaign').value;
        if (!selectedCampaignId) { toast('اختر حملة من Adlytic أو بدّل إلى الوضع اليدوي', 'warning'); return; }
        if (!adlyticContext || adlyticContext.campaignId !== selectedCampaignId) {
          await loadAdlyticContext(selectedCampaignId, prefillAdId || null);
        }
      }
      showStep(1);
      return;
    }
    if (step === 1) {
      // Adlytic campaign already has creative + metrics → analyze immediately.
      if (shouldSkipContentSteps()) {
        submitAssessment();
        return;
      }
      showStep(2);
      renderUpload();
      return;
    }
    if (step === 2) {
      if (!imagePreview && !skipImage && !(isAdlyticMode() && hasAdlyticCreativeReady(adlyticContext))) {
        toast('ارفع صورة أو اختر التخطي المؤقت', 'warning');
        return;
      }
      // Skip metrics re-entry when Adlytic already has live numbers.
      if (isAdlyticMode() && hasAdlyticMetricsReady(adlyticContext)) {
        submitAssessment();
        return;
      }
      showStep(3);
      return;
    }
    submitAssessment();
  });

  document.getElementById('src-adlytic').addEventListener('click', function() { setAnalysisSource('adlytic'); });
  document.getElementById('src-manual').addEventListener('click', function() {
    forceEditCreative = false;
    setAnalysisSource('manual');
  });
  document.getElementById('field-campaign').addEventListener('change', function() {
    selectedCampaignId = document.getElementById('field-campaign').value;
    forceEditCreative = false;
    // Changing campaign invalidates a deep-linked ad unless same campaign.
    prefillAdId = '';
    if (selectedCampaignId) loadAdlyticContext(selectedCampaignId);
  });
  document.getElementById('btn-edit-creative').addEventListener('click', function() {
    forceEditCreative = true;
    syncStep1Chrome();
    renderSteps();
    showStep(2);
    renderUpload();
    var hint = document.getElementById('step-2-hint');
    if (hint) hint.textContent = 'عدّل المحتوى إن أردت — البيانات الأصلية محفوظة من Adlytic.';
  });

  document.getElementById('btn-skip-metrics').addEventListener('click', function() {
    skipMetrics = true;
    document.getElementById('btn-skip-metrics').classList.add('selected-skip');
    document.getElementById('btn-add-metrics').classList.remove('selected-metrics');
    document.getElementById('metrics-fields').style.display = 'none';
  });
  document.getElementById('btn-add-metrics').addEventListener('click', function() {
    if (isAdlyticMode() && hasAdlyticMetricsReady(adlyticContext)) {
      toast('أرقام هذه الحملة جاهزة من Adlytic — لا حاجة لإعادة إدخالها', 'info');
      return;
    }
    skipMetrics = false;
    document.getElementById('btn-add-metrics').classList.add('selected-metrics');
    document.getElementById('btn-skip-metrics').classList.remove('selected-skip');
    document.getElementById('metrics-fields').style.display = 'block';
  });

  renderIndustries();
  renderGoals();
  renderSteps();
  showStep(0);
  setAnalysisSource('adlytic');
  loadCampaigns();
})();
</script>`;

  return layout({
    title: 'تحليل الإعلان',
    active: 'ad-analysis',
    content,
    scripts,
  });
}
