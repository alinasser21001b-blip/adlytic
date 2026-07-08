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
</style>

<div class="page-header assessor-hero">
  <div class="page-title">تحليل الإعلان</div>
  <div class="page-subtitle">افهم إعلانك قبل أن تنفق المزيد — ثلاث خطوات بسيطة مع مقارنة بإعلانات ناجحة في مجالك</div>
</div>

<div id="assessor-error" class="alert alert-error" style="display:none;"></div>

<div id="assessor-form-view">
  <div class="wizard-steps" id="wizard-steps"></div>
  <div class="wizard-card">
    <div id="step-1">
      <h3>عن إعلانك</h3>
      <p class="hint">أخبرنا ببساطة — لا حاجة لمصطلحات Ads Manager.</p>
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

    <div id="step-2" style="display:none;">
      <h3>محتوى الإعلان</h3>
      <p class="hint">ارفع صورة إعلانك — هذا أهم شيء! سنساعدك تفهم ما يراه المشاهد في أول ثانيتين.</p>
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
    { id: 1, title: 'عن إعلانك', emoji: '🎯' },
    { id: 2, title: 'محتوى الإعلان', emoji: '✨' },
    { id: 3, title: 'أرقامك', emoji: '📊' },
  ];

  const token = localStorage.getItem('adlytic_token');
  if (!token) { window.location.href = '/login'; return; }
  if (!(await ensureAccountActive())) return;

  let step = 1;
  let goal = 'sales';
  let skipImage = false;
  let skipMetrics = true;
  let imageBase64, imageMimeType, imagePreview;

  function esc(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function parseNum(v) {
    if (!v || String(v).trim() === '') return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }

  function renderSteps() {
    const el = document.getElementById('wizard-steps');
    if (!el) return;
    el.innerHTML = STEPS.map((s, i) => {
      const cls = step === s.id ? 'active' : (step > s.id ? 'done' : '');
      const conn = i < STEPS.length - 1
        ? '<div class="wizard-connector' + (step > s.id ? ' done' : '') + '"></div>'
        : '';
      return '<div class="wizard-step ' + cls + '"><span>' + s.emoji + '</span><span>' + s.title + '</span></div>' + conn;
    }).join('');
  }

  function showStep(n) {
    step = n;
    [1,2,3].forEach(function(i) {
      var el = document.getElementById('step-' + i);
      if (el) el.style.display = i === n ? 'block' : 'none';
    });
    document.getElementById('btn-back').style.display = n > 1 ? 'inline-flex' : 'none';
    document.getElementById('btn-next').textContent = n < 3 ? 'التالي ←' : '🔍 افهم إعلاني';
    renderSteps();
    updateMetricLabels();
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
    skipImage = false;
    renderUpload();
  }

  function scoreClass(score) {
    if (score >= 75) return 'score-good';
    if (score >= 50) return 'score-mid';
    return 'score-low';
  }

  function renderResults(result) {
    var usedLib = result.trendContext && result.trendContext.source === 'meta_ad_library';
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
      + (usedLib ? '<span class="result-badge">📊 مقارنة مع Meta Ad Library</span>' : '')
      + '</div>'
      + '<button type="button" class="btn btn-secondary btn-sm" id="btn-new-ad">← إعلان جديد</button>'
      + '</div>'
      + '<p style="margin-top:14px;">' + esc(result.audienceMessage.ar) + '</p>'
      + '<p style="margin-top:8px;font-size:13px;opacity:0.85;">' + esc(result.summaryAr) + '</p>'
      + '</div>';

    if (result.trendComparison) {
      html += '<div class="card result-section"><h3>📈 مقارنتك مع الإعلانات الناجحة</h3>'
        + '<p class="text-sm text-2" style="margin-bottom:10px;">' + (usedLib ? 'تحليل مبني على ' + (result.trendContext.totalAdsAnalyzed || 0) + ' إعلاناً نشطاً' : 'تحليل مبني على اتجاهات MENA في مجالك') + '</p>'
        + '<p style="font-size:13px;line-height:1.65;">' + esc(result.trendComparison.ar) + '</p></div>';
    }

    if (result.trendContext && result.trendContext.exampleAds && result.trendContext.exampleAds.length) {
      html += '<div class="card result-section"><h3>✨ إعلانات ناجحة في مجالك</h3><div>';
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
      html += '<div class="card result-section" style="border-color:rgba(34,197,94,0.3);"><h3>✅ ما يعمل بشكل جيد</h3><ul class="result-list">';
      result.strengths.forEach(function(s) { html += '<li>• ' + esc(s.ar) + '</li>'; });
      html += '</ul></div>';
    }

    html += '<div class="card result-section"><h3>ماذا يجب أن تغيّر؟</h3>';
    (result.actionItems || []).forEach(function(item, i) {
      html += '<div class="action-item"><span class="action-num">' + (i+1) + '</span><p style="font-size:13px;line-height:1.65;">' + esc(item.ar) + '</p></div>';
    });
    html += '</div>';

    if (result.industryTips && result.industryTips.length) {
      html += '<div class="card result-section"><h3>💡 نصائح لمجالك</h3><ul class="result-list">';
      result.industryTips.forEach(function(t) { html += '<li>' + esc(t.ar) + '</li>'; });
      html += '</ul></div>';
    }

    if (result.performanceInsight) {
      html += '<div class="card result-section"><h3>📊 نظرة على الأرقام</h3><p style="font-size:13px;line-height:1.65;">' + esc(result.performanceInsight.ar) + '</p></div>';
    }

    html += '<div style="text-align:center;margin-top:20px;"><button type="button" class="btn btn-primary btn-lg" id="btn-another">حلّل إعلاناً آخر</button></div>';

    document.getElementById('assessor-form-view').style.display = 'none';
    document.getElementById('assessor-result-view').style.display = 'block';
    document.getElementById('assessor-result-view').innerHTML = html;

    document.getElementById('btn-new-ad').addEventListener('click', resetAssessor);
    document.getElementById('btn-another').addEventListener('click', resetAssessor);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function resetAssessor() {
    step = 1; goal = 'sales'; skipImage = false; skipMetrics = true;
    imageBase64 = imageMimeType = imagePreview = undefined;
    document.getElementById('assessor-result-view').style.display = 'none';
    document.getElementById('assessor-result-view').innerHTML = '';
    document.getElementById('assessor-form-view').style.display = 'block';
    document.getElementById('assessor-error').style.display = 'none';
    showStep(1);
    renderGoals();
    renderUpload();
    document.getElementById('btn-skip-metrics').classList.add('selected-skip');
    document.getElementById('btn-add-metrics').classList.remove('selected-metrics');
    document.getElementById('metrics-fields').style.display = 'none';
  }

  async function submitAssessment() {
    var errEl = document.getElementById('assessor-error');
    errEl.style.display = 'none';

    var hasMetrics = !skipMetrics;
    var metrics = hasMetrics ? {
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

  document.getElementById('btn-back').addEventListener('click', function() { if (step > 1) showStep(step - 1); });
  document.getElementById('btn-next').addEventListener('click', function() {
    if (step === 1) { showStep(2); renderUpload(); return; }
    if (step === 2) {
      if (!imagePreview && !skipImage) { toast('ارفع صورة أو اختر التخطي المؤقت', 'warning'); return; }
      showStep(3); return;
    }
    submitAssessment();
  });

  document.getElementById('btn-skip-metrics').addEventListener('click', function() {
    skipMetrics = true;
    document.getElementById('btn-skip-metrics').classList.add('selected-skip');
    document.getElementById('btn-add-metrics').classList.remove('selected-metrics');
    document.getElementById('metrics-fields').style.display = 'none';
  });
  document.getElementById('btn-add-metrics').addEventListener('click', function() {
    skipMetrics = false;
    document.getElementById('btn-add-metrics').classList.add('selected-metrics');
    document.getElementById('btn-skip-metrics').classList.remove('selected-skip');
    document.getElementById('metrics-fields').style.display = 'block';
  });

  renderIndustries();
  renderGoals();
  renderSteps();
})();
</script>`;

  return layout({
    title: 'تحليل الإعلان',
    active: 'ad-analysis',
    content,
    scripts,
  });
}
