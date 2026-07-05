// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/beginnerDashboardPage.ts
//
//  Dashboard — Beginner Mode (وضع المبتدئ).
//
//  Visual contract:
//    • Icon-heavy metric cards (💰 الإنفاق · 👥 الوصول · 📩 الرسائل · …)
//    • Simple horizontal progress bars (الميزانية المستخدمة · الحملات النشطة)
//    • Traffic-light status pill on the account-health score
//    • Big trend arrows (⬆️/⬇️/➡️) instead of dense charts
//    • Ample whitespace, soft palette, 100% Arabic, RTL layout.
//
//  Data contract:
//    Identical to the Pro dashboard — calls /api/dashboard/:wsId and
//    /api/workspaces/:wsId. No new DTO, no new endpoint, no new DB query.
//
//  Number formatting:
//    • All currency renders as whole units (no decimals) + Arabic currency
//      word: "٢٬٩٩٢ دولار" (instead of "2,992.41 USD"). See ARABIC_CURRENCY.
//    • Counts/money use toLocaleString('ar-EG', { useGrouping: false }) — plain digits.
//    • Percentages round to whole numbers with useGrouping: false.
// ════════════════════════════════════════════════════════════════════════

import { layout } from '../layout';

export function beginnerDashboardPage(): string {
  const extraHead = `<style>
    /* ── Beginner mode palette + RTL ───────────────────────────────── */
    .bgn-shell { direction: rtl; text-align: right; max-width: 980px; margin: 0 auto; letter-spacing: normal; line-height: 1.6; }
    .bgn-shell *, .bgn-shell *::before, .bgn-shell *::after { box-sizing: border-box; }

    /* Greeting */
    .bgn-greeting {
      display: flex; align-items: center; gap: 14px;
      padding: 22px 26px; margin-bottom: 22px;
      background: linear-gradient(135deg, #241C15 0%, #100E0D 70%);
      border: 1px solid rgba(217,167,89,0.25);
      border-radius: 18px;
    }
    .bgn-greeting-emoji { font-size: 38px; line-height: 1; }
    .bgn-greeting-text-wrap { flex: 1; }
    .bgn-greeting-title { font-size: 19px; font-weight: 700; color: var(--text); line-height: 1.6; letter-spacing: normal; }
    .bgn-greeting-sub { font-size: 13.5px; color: var(--text-2); margin-top: 4px; line-height: 1.6; letter-spacing: normal; }

    /* Status pill (traffic-light) */
    .bgn-status-pill {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 7px 14px;
      border-radius: 999px;
      font-size: 13px; font-weight: 700;
    }
    .bgn-status-pill .bgn-dot {
      width: 10px; height: 10px; border-radius: 50%;
      box-shadow: 0 0 0 3px rgba(255,255,255,0.06);
    }
    .bgn-status-pill.green  { background: rgba(52,168,113,0.14);  color: #5CC08F; }
    .bgn-status-pill.green  .bgn-dot { background: #34A871; }
    .bgn-status-pill.yellow { background: rgba(199,122,31,0.14); color: #E0A050; }
    .bgn-status-pill.yellow .bgn-dot { background: #C77A1F; }
    .bgn-status-pill.red    { background: rgba(226,96,79,0.14);  color: #EB9186; }
    .bgn-status-pill.red    .bgn-dot { background: #E2604F; }
    .bgn-status-pill.gray   { background: rgba(255,255,255,0.05); color: var(--text-3); }
    .bgn-status-pill.gray   .bgn-dot { background: var(--text-3); }

    /* Big metric cards */
    .bgn-metric-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      margin-bottom: 22px;
    }
    @media (max-width: 760px) { .bgn-metric-grid { grid-template-columns: 1fr; } }
    .bgn-metric-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 22px 20px;
      display: flex; align-items: center; gap: 18px;
      transition: transform var(--transition), border-color var(--transition);
    }
    .bgn-metric-card:hover { transform: translateY(-2px); border-color: var(--border-2); }
    .bgn-metric-icon {
      font-size: 40px; line-height: 1;
      width: 64px; height: 64px;
      display: flex; align-items: center; justify-content: center;
      background: rgba(217,167,89,0.10);
      border-radius: 16px; flex-shrink: 0;
    }
    .bgn-metric-card.green  .bgn-metric-icon { background: rgba(52,168,113,0.12); }
    .bgn-metric-card.blue   .bgn-metric-icon { background: rgba(59,130,246,0.12); }
    .bgn-metric-card.purple .bgn-metric-icon { background: rgba(168,85,247,0.12); }
    .bgn-metric-body { flex: 1; min-width: 0; }
    .bgn-metric-label { font-size: 13px; font-weight: 600; color: var(--text-2); margin-bottom: 6px; line-height: 1.6; letter-spacing: normal; }
    .bgn-metric-value { font-size: 30px; font-weight: 800; color: var(--text); letter-spacing: normal; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .bgn-metric-trend { margin-top: 6px; font-size: 13px; display: inline-flex; align-items: center; gap: 4px; line-height: 1.6; letter-spacing: normal; }
    .bgn-metric-trend.up   { color: #5CC08F; }
    .bgn-metric-trend.down { color: #EB9186; }
    .bgn-metric-trend.flat { color: var(--text-3); }

    /* Section title */
    .bgn-section { margin-bottom: 22px; }
    .bgn-section-head { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
    .bgn-section-emoji { font-size: 22px; line-height: 1; }
    .bgn-section-title { font-size: 16px; font-weight: 700; color: var(--text); line-height: 1.6; letter-spacing: normal; }

    /* Progress bar */
    .bgn-bar-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 18px 22px 22px;
    }
    .bgn-bar-row { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 9px; }
    .bgn-bar-label { font-size: 14px; font-weight: 600; color: var(--text); line-height: 1.6; letter-spacing: normal; }
    .bgn-bar-value { font-size: 13px; color: var(--text-2); font-weight: 600; }
    .bgn-bar-track {
      width: 100%; height: 14px;
      background: rgba(255,255,255,0.05);
      border-radius: 999px; overflow: hidden;
    }
    .bgn-bar-fill {
      height: 100%;
      border-radius: 999px;
      background: linear-gradient(90deg, #34A871, #5CC08F);
      transition: width 0.6s ease;
    }
    .bgn-bar-fill.warning { background: linear-gradient(90deg, #C77A1F, #E0A050); }
    .bgn-bar-fill.danger  { background: linear-gradient(90deg, #E2604F, #EB9186); }
    .bgn-bar-fill.blue    { background: linear-gradient(90deg, #3b82f6, #60a5fa); }
    .bgn-bar-hint { font-size: 12px; color: var(--text-3); margin-top: 8px; }

    /* Priority action card */
    .bgn-action-card {
      background: linear-gradient(135deg, rgba(217,167,89,0.10) 0%, var(--surface) 100%);
      border: 1px solid rgba(217,167,89,0.30);
      border-radius: 16px;
      padding: 20px 22px;
      display: flex; align-items: flex-start; gap: 14px;
    }
    .bgn-action-emoji { font-size: 32px; line-height: 1; flex-shrink: 0; }
    .bgn-action-title { font-size: 14px; font-weight: 700; color: var(--accent-2); margin-bottom: 5px; }
    .bgn-action-text { font-size: 14px; color: var(--text); line-height: 1.6; letter-spacing: normal; }

    /* Active campaigns count */
    .bgn-mini-cards { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; margin-bottom: 22px; }
    @media (max-width: 760px) { .bgn-mini-cards { grid-template-columns: 1fr; } }
    .bgn-mini-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 16px 18px;
      display: flex; align-items: center; gap: 14px;
    }
    .bgn-mini-emoji { font-size: 28px; line-height: 1; }
    .bgn-mini-label { font-size: 13px; color: var(--text-2); }
    .bgn-mini-value { font-size: 22px; font-weight: 800; color: var(--text); line-height: 1.1; margin-top: 2px; }

    /* Empty / loading states */
    .bgn-empty {
      text-align: center;
      padding: 64px 24px;
      background: var(--surface);
      border: 1px dashed var(--border-2);
      border-radius: 18px;
    }
    .bgn-empty-emoji { font-size: 54px; opacity: 0.6; margin-bottom: 12px; }
    .bgn-empty-title { font-size: 17px; font-weight: 700; color: var(--text); margin-bottom: 8px; }
    .bgn-empty-text { font-size: 14px; color: var(--text-2); max-width: 360px; margin: 0 auto; line-height: 1.6; }
    .bgn-empty-btn {
      display: inline-block; margin-top: 18px;
      padding: 10px 20px; border-radius: 10px;
      background: var(--accent); color: #fff;
      font-size: 14px; font-weight: 600;
      text-decoration: none;
    }

    .bgn-loading { text-align: center; padding: 80px 24px; color: var(--text-3); font-size: 14px; }
  </style>`;

  const content = `
    <div class="bgn-shell">
      <div id="bgn-loading" class="bgn-loading">جاري تحميل لوحة التحكم…</div>
      <div id="bgn-empty" style="display:none;">
        <div class="bgn-empty">
          <div class="bgn-empty-emoji">📡</div>
          <div class="bgn-empty-title">لم يتم ربط حساب إعلانات بعد</div>
          <div class="bgn-empty-text">للبدء، اربط حساب فيسبوك الإعلاني الخاص بك لرؤية أداء حملاتك.</div>
          <a href="/workspace" class="bgn-empty-btn">ربط حساب فيسبوك</a>
        </div>
      </div>

      <div id="bgn-main" style="display:none;">
        <!-- Greeting + status pill -->
        <div class="bgn-greeting">
          <div class="bgn-greeting-emoji">👋</div>
          <div class="bgn-greeting-text-wrap">
            <div class="bgn-greeting-title" id="bgn-greeting-title">مرحباً بك!</div>
            <div class="bgn-greeting-sub" id="bgn-greeting-sub">ها هي نظرة سريعة على حملاتك.</div>
            <div class="bgn-bar-hint" id="bgn-last-updated" style="margin-top:6px;"></div>
          </div>
          <span id="bgn-status-pill" class="bgn-status-pill gray">
            <span class="bgn-dot"></span>
            <span id="bgn-status-text">—</span>
          </span>
        </div>

        <!-- Top metrics: spend, reach, messages -->
        <div class="bgn-metric-grid" id="bgn-metric-grid"></div>

        <!-- Two mini cards: active campaigns + CTR -->
        <div class="bgn-mini-cards" id="bgn-mini-cards"></div>

        <!-- Progress: budget used + health score -->
        <div class="bgn-section">
          <div class="bgn-section-head">
            <span class="bgn-section-emoji">📊</span>
            <h2 class="bgn-section-title">تقدم اليوم</h2>
          </div>
          <div class="bgn-bar-card" id="bgn-progress-card"></div>
        </div>

        <!-- Priority action -->
        <div class="bgn-section" id="bgn-action-section" style="display:none;">
          <div class="bgn-section-head">
            <span class="bgn-section-emoji">✨</span>
            <h2 class="bgn-section-title">الاقتراح الأهم</h2>
          </div>
          <div class="bgn-action-card">
            <div class="bgn-action-emoji">💡</div>
            <div style="flex:1;">
              <div class="bgn-action-title">ننصحك بـ:</div>
              <div class="bgn-action-text" id="bgn-action-text">—</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  const scripts = `<script>
  // ── Arabic currency word table ─────────────────────────────────────
  // Keys are ISO codes; the value is the singular noun in Arabic. We
  // intentionally avoid pluralization rules — keeping the word singular
  // matches conversational Arabic on dashboards ("٢٬٩٩٢ دولار").
  var ARABIC_CURRENCY = {
    USD: 'دولار', EUR: 'يورو', GBP: 'جنيه إسترليني',
    SAR: 'ريال', AED: 'درهم', IQD: 'دينار',
    EGP: 'جنيه', JOD: 'دينار', KWD: 'دينار',
    QAR: 'ريال', OMR: 'ريال', BHD: 'دينار',
  };
  function arabicCurrencyWord(code) {
    return ARABIC_CURRENCY[code] || code || '';
  }

  var AR_LOCALE = 'ar-EG';
  var AR_NUM_PLAIN = { useGrouping: false };

  /** Strip decimals, group with Arabic thousands separators, append currency word. */
  function fmtSimpleMoney(minor, currency, factor) {
    if (minor == null || !isFinite(Number(minor))) return '—';
    var f = factor == null ? (currency === 'IQD' ? 1 : 100) : factor;
    var whole = Math.round(Number(minor) / f);
    // Arabic numerals with Arabic thousands separator (U+066C). The browser's
    // built-in 'ar-EG' locale produces "٢٬٩٩٢" which matches design intent.
    var nf = whole.toLocaleString(AR_LOCALE, AR_NUM_PLAIN);
    return nf + ' ' + arabicCurrencyWord(currency);
  }

  /** Round a count to a whole number and group with Arabic separators. */
  function fmtSimpleCount(n) {
    if (n == null || !isFinite(Number(n))) return '—';
    return Math.round(Number(n)).toLocaleString(AR_LOCALE, AR_NUM_PLAIN);
  }

  /** Round a percent (0–100) to a whole number and append %. No grouping. */
  function fmtSimplePct(n) {
    if (n == null || !isFinite(Number(n))) return '—';
    return Math.round(Number(n)).toLocaleString(AR_LOCALE, AR_NUM_PLAIN) + '٪';
  }

  function trendArrow(dir, goodWhenUp) {
    if (dir === 'flat' || dir == null) return { sym: '➡️', cls: 'flat', label: '' };
    var good = goodWhenUp !== false;
    if (dir === 'up')   return { sym: '⬆️', cls: good ? 'up' : 'down', label: 'تحسّن' };
    /* down */          return { sym: '⬇️', cls: good ? 'down' : 'up', label: 'تراجع' };
  }

  function healthBandPill(band) {
    // Map DTO health.band → traffic-light pill class + Arabic label.
    var map = {
      excellent: { cls: 'green',  label: 'ممتاز' },
      good:      { cls: 'green',  label: 'جيد' },
      attention: { cls: 'yellow', label: 'يحتاج انتباه' },
      poor:      { cls: 'red',    label: 'ضعيف' },
      none:      { cls: 'gray',   label: 'لا توجد بيانات بعد' },
    };
    return map[band] || map.none;
  }

  function getKpi(dash, key) {
    var k = (dash.kpis || []).find(function (x) { return x.key === key; });
    return k || null;
  }

  function renderMetricCards(dash, currency, factor) {
    var grid = document.getElementById('bgn-metric-grid');
    var spend = getKpi(dash, 'spend');
    var reach = getKpi(dash, 'reach');
    var msgs  = getKpi(dash, 'messages');

    var cards = [
      { emoji: '💰', label: 'الإنفاق (٣٠ يوماً)', tone: 'green',
        value: spend ? fmtSimpleMoney(spend.value, currency, factor) : '—',
        delta: spend ? trendArrow(spend.direction, spend.goodWhenUp !== false) : null,
        deltaPct: spend && spend.deltaPct != null ? spend.deltaPct : null },
      { emoji: '👥', label: 'الأشخاص الذين شاهدوا إعلاناتك', tone: 'blue',
        value: reach ? fmtSimpleCount(reach.value) : '—',
        delta: reach ? trendArrow(reach.direction, true) : null,
        deltaPct: null },
      { emoji: '📩', label: 'الرسائل (المحادثات)', tone: 'purple',
        value: msgs ? fmtSimpleCount(msgs.value) : '—',
        delta: msgs ? trendArrow(msgs.direction, true) : null,
        deltaPct: msgs && msgs.deltaPct != null ? msgs.deltaPct : null },
    ];

    grid.innerHTML = cards.map(function (c) {
      var trendHtml = '';
      if (c.delta) {
        // deltaPct is stored as a ratio (0.05 = 5%) — multiply before display.
        var pctText = c.deltaPct != null
          ? (' ' + Math.round(Math.abs(Number(c.deltaPct) * 100)) + '٪')
          : '';
        trendHtml = '<div class="bgn-metric-trend ' + c.delta.cls + '">' + c.delta.sym + ' ' + c.delta.label + pctText + '</div>';
      }
      return '<div class="bgn-metric-card ' + c.tone + '">'
        + '<div class="bgn-metric-icon">' + c.emoji + '</div>'
        + '<div class="bgn-metric-body">'
          + '<div class="bgn-metric-label">' + c.label + '</div>'
          + '<div class="bgn-metric-value">' + c.value + '</div>'
          + trendHtml
        + '</div>'
      + '</div>';
    }).join('');
  }

  function renderMiniCards(dash) {
    var mini = document.getElementById('bgn-mini-cards');
    var ctr = getKpi(dash, 'ctr');
    var activeCampaigns = (dash.workspace && dash.workspace.activeCampaigns) || 0;

    var cards = [
      { emoji: '📣', label: 'الحملات النشطة', value: fmtSimpleCount(activeCampaigns) },
      { emoji: '🎯', label: 'تفاعل الإعلان', value: ctr && ctr.value != null && isFinite(Number(ctr.value)) ? fmtSimplePct(ctr.value) : '—' },
    ];
    mini.innerHTML = cards.map(function (c) {
      return '<div class="bgn-mini-card">'
        + '<div class="bgn-mini-emoji">' + c.emoji + '</div>'
        + '<div>'
          + '<div class="bgn-mini-label">' + c.label + '</div>'
          + '<div class="bgn-mini-value">' + c.value + '</div>'
        + '</div>'
      + '</div>';
    }).join('');
  }

  function renderProgressCard(dash) {
    // Two stacked bars:
    //   1) Health score (0-100) — colored by band.
    //   2) Active campaigns ratio (active / max(3, active)) — never below 0.
    var el = document.getElementById('bgn-progress-card');
    var score = (dash.health && typeof dash.health.score === 'number') ? dash.health.score : 0;
    var band  = (dash.health && dash.health.band) || 'none';
    var scoreCls = band === 'poor' ? 'danger' : band === 'attention' ? 'warning' : (band === 'none' ? 'blue' : '');

    var active = (dash.workspace && dash.workspace.activeCampaigns) || 0;
    // Target: 3 active campaigns is a "healthy" beginner baseline. The bar
    // visualizes progress toward that informal goal, capped at 100%.
    var target = 3;
    var pct = Math.min(100, Math.round((active / target) * 100));

    el.innerHTML =
      '<div class="bgn-bar-row">'
        + '<span class="bgn-bar-label">🩺 صحة حسابك</span>'
        + '<span class="bgn-bar-value">' + Math.round(score) + ' من ١٠٠</span>'
      + '</div>'
      + '<div class="bgn-bar-track"><div class="bgn-bar-fill ' + scoreCls + '" style="width:' + Math.max(0, Math.min(100, Math.round(score))) + '%;"></div></div>'
      + '<div class="bgn-bar-hint">كلما زاد الرقم، كان أداء حسابك أفضل.</div>'
      + '<div style="height:14px;"></div>'
      + '<div class="bgn-bar-row">'
        + '<span class="bgn-bar-label">📣 الحملات النشطة</span>'
        + '<span class="bgn-bar-value">' + fmtSimpleCount(active) + ' / ' + fmtSimpleCount(target) + '</span>'
      + '</div>'
      + '<div class="bgn-bar-track"><div class="bgn-bar-fill blue" style="width:' + pct + '%;"></div></div>'
      + '<div class="bgn-bar-hint">يُنصح بتشغيل ٣ حملات على الأقل في نفس الوقت لرؤية نتائج أفضل.</div>';
  }

  function renderAction(dash) {
    var sec = document.getElementById('bgn-action-section');
    var text = document.getElementById('bgn-action-text');
    var pa = dash.priorityAction;
    if (!pa) { sec.style.display = 'none'; return; }
    var t = (typeof pa === 'string') ? pa : (pa.text || pa.actionCode || '');
    if (!t) { sec.style.display = 'none'; return; }
    text.textContent = t;
    sec.style.display = 'block';
  }

  function renderStatus(dash) {
    var pill = document.getElementById('bgn-status-pill');
    var txt  = document.getElementById('bgn-status-text');
    var p = healthBandPill((dash.health && dash.health.band) || 'none');
    pill.className = 'bgn-status-pill ' + p.cls;
    txt.textContent = p.label;
  }

  function renderGreeting(dash) {
    var titleEl = document.getElementById('bgn-greeting-title');
    var subEl   = document.getElementById('bgn-greeting-sub');
    var wsName = (dash.workspace && dash.workspace.name) || 'مساحة العمل';
    titleEl.textContent = 'أهلاً بك في ' + wsName + ' 👋';
    var msgs  = getKpi(dash, 'messages');
    var count = msgs ? Math.round(Number(msgs.value || 0)) : 0;
    if (count > 0) {
      subEl.textContent = 'وصلتك ' + fmtSimpleCount(count) + ' رسالة جديدة خلال آخر ٣٠ يوماً.';
    } else {
      subEl.textContent = 'ها هي نظرة سريعة على حملاتك.';
    }
  }

  var BGN_REFRESH_MS = 90000;
  var bgnRefreshTimer = null;

  function bgnFormatLastUpdated(isoOrDate) {
    if (!isoOrDate) return '';
    try {
      return new Date(isoOrDate).toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' });
    } catch (e) { return ''; }
  }

  function updateBgnLastUpdated(dash) {
    var el = document.getElementById('bgn-last-updated');
    if (!el) return;
    var synced = dash.workspace && dash.workspace.lastSyncedAt;
    el.textContent = synced
      ? ('آخر مزامنة: ' + bgnFormatLastUpdated(synced))
      : ('تم التحديث: ' + bgnFormatLastUpdated(new Date()));
  }

  function renderBeginnerDashboard(dash) {
    var currency = dash.workspace.currency || 'USD';
    var factor   = currency === 'IQD' ? 1
      : (dash.workspace.currencyMinorFactor != null && dash.workspace.currencyMinorFactor > 0
        ? dash.workspace.currencyMinorFactor
        : 100);

    renderGreeting(dash);
    renderStatus(dash);
    renderMetricCards(dash, currency, factor);
    renderMiniCards(dash);
    renderProgressCard(dash);
    renderAction(dash);
    updateBgnLastUpdated(dash);
  }

  function startBgnAutoRefresh(wsId) {
    async function refresh() {
      if (document.hidden) return;
      try {
        var dash = await apiFetch('/api/dashboard/' + wsId);
        if (!dash || dash.empty || !dash.workspace) return;
        renderBeginnerDashboard(dash);
      } catch (e) { /* silent background refresh */ }
    }
    function armTimer() {
      if (bgnRefreshTimer) clearInterval(bgnRefreshTimer);
      bgnRefreshTimer = setInterval(refresh, BGN_REFRESH_MS);
    }
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) {
        refresh();
        armTimer();
      } else if (bgnRefreshTimer) {
        clearInterval(bgnRefreshTimer);
        bgnRefreshTimer = null;
      }
    });
    armTimer();
  }

  async function loadBeginnerDashboard() {
    var wsId = getWsId();
    if (!wsId) { window.location.href = '/workspace'; return; }
    try {
      var dash = await apiFetch('/api/dashboard/' + wsId);
      if (!dash) return; // 401 already handled by apiFetch (logout redirect)
      document.getElementById('bgn-loading').style.display = 'none';

      if (dash.empty || !dash.workspace) {
        document.getElementById('bgn-empty').style.display = 'block';
        return;
      }
      document.getElementById('bgn-main').style.display = 'block';

      renderBeginnerDashboard(dash);
      startBgnAutoRefresh(wsId);
    } catch (err) {
      document.getElementById('bgn-loading').textContent = 'حدث خطأ أثناء تحميل البيانات.';
      console.error('[beginner-dashboard]', err);
    }
  }

  document.addEventListener('DOMContentLoaded', loadBeginnerDashboard);
  </script>`;

  return layout({
    title: 'لوحة التحكم — وضع المبتدئ',
    active: 'dashboard',
    content,
    scripts,
    extraHead,
    mode: 'beginner',
  });
}
