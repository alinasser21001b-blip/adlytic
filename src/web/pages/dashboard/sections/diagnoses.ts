// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/dashboard/sections/diagnoses.ts
//
//  Client-side renderDiagnoses(diagnoses). Plain Arabic cards:
//  title → confidence → evidence → ماذا تفعل الآن.
//  Primary diagnosis lives above the fold; this grid shows extras only.
// ════════════════════════════════════════════════════════════════════════

export const renderDiagnosesJs = `
  function renderDiagnoses(diagnoses) {
    var section = document.getElementById('diagnoses-section');
    var grid = document.getElementById('diagnoses-grid');
    if (!diagnoses || diagnoses.length === 0) { if (section) section.style.display = 'none'; return; }
    // Primary diagnosis already owns the above-fold hero — show extras only.
    var rest = diagnoses.length > 1 ? diagnoses.slice(1) : [];
    if (!rest.length) { if (section) section.style.display = 'none'; return; }
    if (section) section.style.display = 'block';
    var headTitle = section.querySelector('.adv-panel-title');
    if (headTitle) headTitle.textContent = 'تشخيصات إضافية';
    var FALLBACK_NAME = {
      'Creative Fatigue': 'إرهاق الإعلان',
      'Audience Saturation': 'تشبّع الجمهور',
      'Auction Pressure': 'ارتفاع تكلفة الوصول',
      'Post-Click Problem': 'مشكلة بعد النقر',
      'Rising Cost per Result': 'ارتفاع تكلفة النتيجة',
      CREATIVE_FATIGUE: 'إرهاق الإعلان',
      AUDIENCE_SATURATION: 'تشبّع الجمهور',
      AUCTION_PRESSURE: 'ارتفاع تكلفة الوصول',
      POST_CLICK_PROBLEM: 'مشكلة بعد النقر',
      RISING_COST_PER_RESULT: 'ارتفاع تكلفة النتيجة',
      WEAK_CREATIVE: 'ضعف التفاعل مع الإعلان',
      HIGH_FREQUENCY_PRESSURE: 'تكرار ظهور مرتفع',
      DECLINING_OUTCOMES: 'تراجع النتائج',
    };
    function simplifyDiagText(text) {
      if (!text) return '';
      var t = String(text);
      t = t.replace(/\\bCTR\\b/gi, 'نسبة النقر');
      t = t.replace(/\\bCPM\\b/gi, 'تكلفة الوصول');
      t = t.replace(/\\bROAS\\b/gi, 'العائد على الإنفاق');
      t = t.replace(/\\bfrequency\\b/gi, 'مرات الظهور لنفس الشخص');
      t = t.replace(/\\blookalike\\b/gi, 'جمهور مشابه');
      t = t.replace(/\\bcreative(s)?\\b/gi, 'التصميم');
      t = t.replace(/\\bauction\\b/gi, 'المزاد');
      return t.replace(/\\s+/g, ' ').trim();
    }
    grid.innerHTML = rest.map(function (d) {
      var confLevel = d.confidence >= 0.75 ? 'high' : d.confidence >= 0.5 ? 'medium' : 'low';
      var confLabel = d.confidence >= 0.75 ? 'ثقة عالية' : d.confidence >= 0.5 ? 'ثقة متوسطة' : 'ثقة منخفضة';
      var name = FALLBACK_NAME[d.code] || FALLBACK_NAME[d.name] || d.name;
      var narrative = simplifyDiagText(d.narrative);
      var action = simplifyDiagText(d.action);
      return '<article class="diagnosis-card">'
        + '<div class="diagnosis-header">'
          + '<div class="diagnosis-name">' + escHtml(name) + '</div>'
          + '<span class="diagnosis-confidence ' + confLevel + '">' + confLabel + ' ' + Math.round(d.confidence * 100) + '%</span>'
        + '</div>'
        + '<div class="diagnosis-narrative">' + escHtml(narrative) + '</div>'
        + '<div class="diagnosis-action">'
          + '<div class="diagnosis-action-label">ماذا تفعل الآن؟</div>'
          + escHtml(action)
        + '</div>'
      + '</article>';
    }).join('');
  }
`;
