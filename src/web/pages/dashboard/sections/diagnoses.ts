// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/dashboard/sections/diagnoses.ts
//
//  Client-side renderDiagnoses(diagnoses). Exported as a JS string
//  interpolated into the dashboard's IIFE `<script>` block.
//
//  Consumes: #diagnoses-section, #diagnoses-grid.  Uses: escHtml.
// ════════════════════════════════════════════════════════════════════════

export const renderDiagnosesJs = `
  function renderDiagnoses(diagnoses) {
    var section = document.getElementById('diagnoses-section');
    var grid = document.getElementById('diagnoses-grid');
    if (!diagnoses || diagnoses.length === 0) { if (section) section.style.display = 'none'; return; }
    if (section) section.style.display = 'block';
    var DIAGNOSIS_AR = {
      'Creative Fatigue': 'إرهاق الإعلان',
      'Audience Saturation': 'تشبّع الجمهور',
      'Auction Pressure': 'ضغط المزاد',
      'Post-Click Problem': 'مشكلة ما بعد النقر',
      'Rising Cost per Result': 'ارتفاع تكلفة النتيجة',
    };
    grid.innerHTML = diagnoses.map(function (d) {
      var confLevel = d.confidence >= 0.75 ? 'high' : d.confidence >= 0.5 ? 'medium' : 'low';
      var confLabel = d.confidence >= 0.75 ? 'ثقة عالية' : d.confidence >= 0.5 ? 'ثقة متوسطة' : 'ثقة منخفضة';
      var name = DIAGNOSIS_AR[d.name] || d.name;
      return '<div class="diagnosis-card">'
        + '<div class="diagnosis-header">'
          + '<div class="diagnosis-name">' + escHtml(name) + '</div>'
          + '<span class="diagnosis-confidence ' + confLevel + '">' + confLabel + ' ' + Math.round(d.confidence * 100) + '%</span>'
        + '</div>'
        + '<div class="diagnosis-narrative">' + escHtml(d.narrative) + '</div>'
        + '<div class="diagnosis-action">'
          + '<div class="diagnosis-action-label">الإجراء المطلوب</div>'
          + escHtml(d.action)
        + '</div>'
      + '</div>';
    }).join('');
  }
`;
