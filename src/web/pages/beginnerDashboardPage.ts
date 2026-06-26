// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/beginnerDashboardPage.ts
//
//  Dashboard — Beginner Mode (وضع المبتدئ).
//  Clean, minimal first view: 4 hero KPIs, one trend chart, simple campaign
//  list. Secondary metrics live behind "تفاصيل أكثر".
//
//  Data contract: /api/dashboard/:wsId + /api/workspaces/:wsId/campaigns
// ════════════════════════════════════════════════════════════════════════

import { layout } from '../layout';

export function beginnerDashboardPage(): string {
  const extraHead = `<style>
    .bgn-shell { direction: rtl; text-align: right; max-width: 960px; margin: 0 auto; }
    .bgn-shell *, .bgn-shell *::before, .bgn-shell *::after { box-sizing: border-box; }

    .bgn-top {
      display: flex; align-items: center; justify-content: space-between; gap: 16px;
      margin-bottom: 20px; flex-wrap: wrap;
    }
    .bgn-greeting-title { font-size: 20px; font-weight: 700; color: var(--text); line-height: 1.3; }
    .bgn-greeting-sub { font-size: 13px; color: var(--text-2); margin-top: 4px; }

    .bgn-status-pill {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 8px 16px; border-radius: 999px;
      font-size: 13px; font-weight: 700; flex-shrink: 0;
    }
    .bgn-status-pill .bgn-dot { width: 10px; height: 10px; border-radius: 50%; }
    .bgn-status-pill.green  { background: rgba(34,197,94,0.14); color: #4ade80; }
    .bgn-status-pill.green  .bgn-dot { background: #22c55e; }
    .bgn-status-pill.yellow { background: rgba(245,158,11,0.14); color: #fbbf24; }
    .bgn-status-pill.yellow .bgn-dot { background: #f59e0b; }
    .bgn-status-pill.red    { background: rgba(239,68,68,0.14); color: #f87171; }
    .bgn-status-pill.red    .bgn-dot { background: #ef4444; }
    .bgn-status-pill.gray   { background: rgba(255,255,255,0.05); color: var(--text-3); }
    .bgn-status-pill.gray   .bgn-dot { background: var(--text-3); }

    .bgn-kpi-grid {
      display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 20px;
    }
    @media (max-width: 860px) { .bgn-kpi-grid { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 480px) { .bgn-kpi-grid { grid-template-columns: 1fr; } }

    .bgn-kpi {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 16px; padding: 18px 16px;
    }
    .bgn-kpi-label { font-size: 12px; font-weight: 600; color: var(--text-3); margin-bottom: 8px; }
    .bgn-kpi-value { font-size: 28px; font-weight: 800; color: var(--text); letter-spacing: -0.5px; line-height: 1.1; }
    .bgn-kpi-trend { margin-top: 8px; font-size: 12px; font-weight: 600; display: inline-flex; align-items: center; gap: 4px; }
    .bgn-kpi-trend.up   { color: #4ade80; }
    .bgn-kpi-trend.down { color: #f87171; }
    .bgn-kpi-trend.flat { color: var(--text-3); }

    .bgn-panel {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 16px; padding: 18px 20px; margin-bottom: 18px;
    }
    .bgn-panel-head {
      display: flex; align-items: baseline; justify-content: space-between;
      margin-bottom: 14px; gap: 10px;
    }
    .bgn-panel-title { font-size: 14px; font-weight: 700; color: var(--text); }
    .bgn-panel-meta  { font-size: 12px; color: var(--text-3); }
    .bgn-chart-wrap  { position: relative; height: 240px; }

    .bgn-campaign-list { display: flex; flex-direction: column; gap: 0; }
    .bgn-campaign-row {
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      padding: 12px 0; border-bottom: 1px solid var(--border);
    }
    .bgn-campaign-row:last-child { border-bottom: none; }
    .bgn-campaign-name { font-size: 14px; font-weight: 600; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0; }
    .bgn-campaign-spend { font-size: 13px; font-weight: 600; color: var(--text-2); flex-shrink: 0; }

    .bgn-action-box {
      background: linear-gradient(135deg, rgba(99,102,241,0.08) 0%, var(--surface) 100%);
      border: 1px solid rgba(99,102,241,0.25); border-radius: 14px;
      padding: 16px 18px; margin-bottom: 18px;
    }
    .bgn-action-label { font-size: 12px; font-weight: 700; color: var(--accent-2); margin-bottom: 6px; }
    .bgn-action-text  { font-size: 14px; color: var(--text); line-height: 1.6; }
    .bgn-expand-btn {
      background: none; border: none; color: var(--accent-2);
      font-size: 12px; font-weight: 600; cursor: pointer; padding: 4px 0; margin-top: 6px;
    }

    .bgn-details summary {
      cursor: pointer; list-style: none;
      padding: 12px 16px; background: var(--surface); border: 1px solid var(--border);
      border-radius: 14px; font-size: 13px; font-weight: 600; color: var(--text);
      display: flex; align-items: center; justify-content: space-between;
    }
    .bgn-details summary::-webkit-details-marker { display: none; }
    .bgn-details summary::after { content: '▾'; color: var(--text-3); transition: transform 0.2s; }
    .bgn-details[open] summary::after { transform: rotate(180deg); }
    .bgn-details summary span { color: var(--text-3); font-weight: 500; font-size: 12px; }
    .bgn-details-body { padding: 16px 0 0; }
    .bgn-secondary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    @media (max-width: 640px) { .bgn-secondary-grid { grid-template-columns: 1fr; } }
    .bgn-secondary-card {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 12px; padding: 14px 16px;
    }
    .bgn-secondary-label { font-size: 11px; color: var(--text-3); font-weight: 600; margin-bottom: 6px; }
    .bgn-secondary-value { font-size: 20px; font-weight: 700; color: var(--text); }

    .bgn-bar-track { width: 100%; height: 10px; background: rgba(255,255,255,0.05); border-radius: 999px; overflow: hidden; margin-top: 8px; }
    .bgn-bar-fill  { height: 100%; border-radius: 999px; background: linear-gradient(90deg, #22c55e, #4ade80); }
    .bgn-bar-fill.warning { background: linear-gradient(90deg, #f59e0b, #fbbf24); }
    .bgn-bar-fill.danger  { background: linear-gradient(90deg, #ef4444, #f87171); }

    .bgn-empty { text-align: center; padding: 64px 24px; background: var(--surface); border: 1px dashed var(--border-2); border-radius: 18px; }
    .bgn-empty-emoji { font-size: 48px; opacity: 0.6; margin-bottom: 12px; }
    .bgn-empty-title { font-size: 17px; font-weight: 700; color: var(--text); margin-bottom: 8px; }
    .bgn-empty-text  { font-size: 14px; color: var(--text-2); max-width: 360px; margin: 0 auto; line-height: 1.6; }
    .bgn-empty-btn   { display: inline-block; margin-top: 18px; padding: 10px 20px; border-radius: 10px; background: var(--accent); color: #fff; font-size: 14px; font-weight: 600; text-decoration: none; }
    .bgn-loading     { text-align: center; padding: 80px 24px; color: var(--text-3); font-size: 14px; }
  </style>`;

  const content = `
    <div class="bgn-shell">
      <div id="bgn-loading" class="bgn-loading">جاري تحميل لوحة التحكم…</div>
      <div id="bgn-empty" style="display:none;">
        <div class="bgn-empty">
          <div class="bgn-empty-emoji">📡</div>
          <div class="bgn-empty-title">لم يتم ربط حساب إعلانات بعد</div>
          <div class="bgn-empty-text">اربط حساب فيسبوك الإعلاني لرؤية أداء حملاتك.</div>
          <a href="/workspace" class="bgn-empty-btn">ربط الحساب</a>
        </div>
      </div>

      <div id="bgn-main" style="display:none;">
        <div class="bgn-top">
          <div>
            <div class="bgn-greeting-title" id="bgn-greeting-title">مرحباً!</div>
            <div class="bgn-greeting-sub" id="bgn-greeting-sub">نظرة سريعة على آخر ٣٠ يوماً</div>
          </div>
          <span id="bgn-status-pill" class="bgn-status-pill gray">
            <span class="bgn-dot"></span>
            <span id="bgn-status-text">—</span>
          </span>
        </div>

        <div class="bgn-kpi-grid" id="bgn-kpi-grid"></div>

        <div class="bgn-panel">
          <div class="bgn-panel-head">
            <div class="bgn-panel-title">📈 الإنفاق عبر الزمن</div>
            <div class="bgn-panel-meta" id="bgn-chart-meta">—</div>
          </div>
          <div class="bgn-chart-wrap"><canvas id="bgn-chart"></canvas></div>
        </div>

        <div class="bgn-panel">
          <div class="bgn-panel-head">
            <div class="bgn-panel-title">📣 الحملات</div>
            <div class="bgn-panel-meta" id="bgn-campaign-meta">—</div>
          </div>
          <div class="bgn-campaign-list" id="bgn-campaign-list"></div>
        </div>

        <div id="bgn-action-box" class="bgn-action-box" style="display:none;">
          <div class="bgn-action-label">💡 اقتراح اليوم</div>
          <div class="bgn-action-text" id="bgn-action-text"></div>
          <button type="button" class="bgn-expand-btn" id="bgn-action-expand" style="display:none;">اقرأ المزيد</button>
        </div>

        <details class="bgn-details">
          <summary>تفاصيل أكثر <span>الوصول · CPM · التكرار</span></summary>
          <div class="bgn-details-body">
            <div class="bgn-secondary-grid" id="bgn-secondary-grid"></div>
          </div>
        </details>
      </div>
    </div>
  `;

  const scripts = `
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<script>
  var ARABIC_CURRENCY = {
    USD: 'دولار', EUR: 'يورو', GBP: 'جنيه', SAR: 'ريال', AED: 'درهم',
    IQD: 'دينار', EGP: 'جنيه', JOD: 'دينار', KWD: 'دينار', QAR: 'ريال',
  };
  var AR_LOCALE = 'ar-EG';
  var TRUNC_LEN = 120;

  function arabicCurrencyWord(code) { return ARABIC_CURRENCY[code] || code || ''; }

  function fmtMoney(minor, currency, factor) {
    if (minor == null || !isFinite(Number(minor))) return '—';
    var f = factor == null ? (currency === 'IQD' ? 1 : 100) : factor;
    var whole = Math.round(Number(minor) / f);
    if (currency === 'USD') return '$' + whole.toLocaleString('en-US');
    if (currency === 'IQD') return whole.toLocaleString('ar-EG') + ' IQD';
    return whole.toLocaleString(AR_LOCALE) + ' ' + arabicCurrencyWord(currency);
  }

  function fmtCount(n) {
    if (n == null || !isFinite(Number(n))) return '—';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e4) return (n / 1e3).toFixed(1) + 'K';
    return Math.round(Number(n)).toLocaleString(AR_LOCALE);
  }

  function fmtPct(n) {
    if (n == null || !isFinite(Number(n))) return '—';
    return Math.round(Number(n)).toLocaleString(AR_LOCALE, { useGrouping: false }) + '٪';
  }

  function trendHtml(kpi) {
    if (!kpi || kpi.direction === 'flat' || kpi.deltaPct == null) {
      return '<div class="bgn-kpi-trend flat">➡️</div>';
    }
    var good = kpi.goodWhenUp !== false;
    var up = kpi.direction === 'up';
    var cls = (up === good) ? 'up' : 'down';
    var sym = up ? '↑' : '↓';
    var pct = Math.round(Math.abs(Number(kpi.deltaPct) * 100));
    return '<div class="bgn-kpi-trend ' + cls + '">' + sym + ' ' + pct + '٪</div>';
  }

  function getKpi(dash, key) {
    return (dash.kpis || []).find(function (x) { return x.key === key; }) || null;
  }

  function healthBandPill(band) {
    var map = {
      excellent: { cls: 'green',  label: 'ممتاز' },
      good:      { cls: 'green',  label: 'جيد' },
      attention: { cls: 'yellow', label: 'يحتاج انتباه' },
      poor:      { cls: 'red',    label: 'ضعيف' },
      none:      { cls: 'gray',   label: 'لا بيانات' },
    };
    return map[band] || map.none;
  }

  function renderKpis(dash, currency, factor) {
    var grid = document.getElementById('bgn-kpi-grid');
    var spend = getKpi(dash, 'spend');
    var msgs  = getKpi(dash, 'messages');
    var ctr   = getKpi(dash, 'ctr');
    var score = (dash.health && typeof dash.health.score === 'number') ? Math.round(dash.health.score) : 0;

    var cards = [
      { label: 'الإنفاق', value: spend ? fmtMoney(spend.value, currency, factor) : '—', trend: spend },
      { label: 'الرسائل', value: msgs ? fmtCount(msgs.value) : '—', trend: msgs },
      { label: 'نسبة النقر', value: ctr && ctr.value != null ? fmtPct(ctr.value) : '—', trend: ctr },
      { label: 'صحة الحساب', value: fmtCount(score) + ' / ١٠٠', trend: null },
    ];

    grid.innerHTML = cards.map(function (c) {
      return '<div class="bgn-kpi">'
        + '<div class="bgn-kpi-label">' + c.label + '</div>'
        + '<div class="bgn-kpi-value">' + c.value + '</div>'
        + (c.trend ? trendHtml(c.trend) : '')
      + '</div>';
    }).join('');
  }

  function renderChart(dash, currency, factor) {
    var ts = dash.trendSeries || { dates: [], spend: [] };
    if (!ts.dates || ts.dates.length === 0) return;

    var labels = ts.dates.map(function (d) {
      return new Date(d).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' });
    });
    var spendMajor = ts.spend.map(function (s) { return Number(s) / factor; });

    document.getElementById('bgn-chart-meta').textContent = 'آخر ' + ts.dates.length + ' يوم';

    var ctx = document.getElementById('bgn-chart').getContext('2d');
    new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'الإنفاق',
          data: spendMajor,
          borderColor: '#6366f1',
          backgroundColor: 'rgba(99,102,241,0.10)',
          fill: true, tension: 0.35, borderWidth: 2, pointRadius: 0,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#5a5a6a', maxTicksLimit: 6, font: { size: 11 } } },
          y: { grid: { color: '#232326' }, ticks: { color: '#5a5a6a', maxTicksLimit: 5, font: { size: 11 } } },
        },
      },
    });
  }

  function renderCampaigns(campaigns, currency, factor) {
    var list = document.getElementById('bgn-campaign-list');
    var meta = document.getElementById('bgn-campaign-meta');
    if (!campaigns || campaigns.length === 0) {
      list.innerHTML = '<div style="color:var(--text-3);font-size:13px;padding:8px 0;">لا توجد حملات بعد.</div>';
      meta.textContent = '';
      return;
    }
    meta.textContent = campaigns.length + ' حملة';
    list.innerHTML = campaigns.slice(0, 8).map(function (c) {
      var amt = c.dailyBudget
        ? fmtMoney(c.dailyBudget, currency, factor) + '/يوم'
        : (c.lifetimeBudget ? fmtMoney(c.lifetimeBudget, currency, factor) : '—');
      return '<div class="bgn-campaign-row">'
        + '<span class="bgn-campaign-name" title="' + String(c.name || '').replace(/"/g, '&quot;') + '">' + (c.name || '—') + '</span>'
        + '<span class="bgn-campaign-spend">' + amt + '</span>'
        + statusBadge(c.status || 'UNKNOWN')
      + '</div>';
    }).join('');
  }

  function renderAction(dash) {
    var box = document.getElementById('bgn-action-box');
    var textEl = document.getElementById('bgn-action-text');
    var expandBtn = document.getElementById('bgn-action-expand');
    var pa = dash.priorityAction;
    if (!pa) { box.style.display = 'none'; return; }
    var full = (typeof pa === 'string') ? pa : (pa.text || pa.actionCode || '');
    if (!full) { box.style.display = 'none'; return; }
    box.style.display = 'block';
    if (full.length <= TRUNC_LEN) {
      textEl.textContent = full;
      expandBtn.style.display = 'none';
    } else {
      textEl.textContent = full.slice(0, TRUNC_LEN).trim() + '…';
      expandBtn.style.display = 'block';
      expandBtn.onclick = function () {
        textEl.textContent = full;
        expandBtn.style.display = 'none';
      };
    }
  }

  function renderSecondary(dash, currency, factor) {
    var grid = document.getElementById('bgn-secondary-grid');
    var reach = getKpi(dash, 'reach');
    var cpm   = getKpi(dash, 'cpm');
    var freq  = getKpi(dash, 'frequency');
    var active = (dash.workspace && dash.workspace.activeCampaigns) || 0;
    var score = (dash.health && dash.health.score) || 0;
    var band  = (dash.health && dash.health.band) || 'none';
    var barCls = band === 'poor' ? 'danger' : band === 'attention' ? 'warning' : '';

    var items = [
      { label: 'الوصول', value: reach ? fmtCount(reach.value) : '—' },
      { label: 'تكلفة الألف ظهور', value: cpm && cpm.display ? cpm.display : '—' },
      { label: 'التكرار', value: freq && freq.display ? freq.display : '—' },
    ];

    grid.innerHTML = items.map(function (it) {
      return '<div class="bgn-secondary-card">'
        + '<div class="bgn-secondary-label">' + it.label + '</div>'
        + '<div class="bgn-secondary-value">' + it.value + '</div>'
      + '</div>';
    }).join('')
      + '<div class="bgn-secondary-card" style="grid-column:1/-1;">'
        + '<div class="bgn-secondary-label">📣 حملات نشطة · ' + fmtCount(active) + '</div>'
        + '<div class="bgn-bar-track"><div class="bgn-bar-fill ' + barCls + '" style="width:' + Math.max(0, Math.min(100, Math.round(score))) + '%;"></div></div>'
      + '</div>';
  }

  function renderStatus(dash) {
    var pill = document.getElementById('bgn-status-pill');
    var txt  = document.getElementById('bgn-status-text');
    var p = healthBandPill((dash.health && dash.health.band) || 'none');
    pill.className = 'bgn-status-pill ' + p.cls;
    txt.textContent = p.label;
  }

  function renderGreeting(dash) {
    document.getElementById('bgn-greeting-title').textContent =
      'أهلاً · ' + ((dash.workspace && dash.workspace.name) || 'مساحة العمل');
    document.getElementById('bgn-greeting-sub').textContent = 'آخر ٣٠ يوماً';
  }

  async function loadBeginnerDashboard() {
    var wsId = getWsId();
    if (!wsId) { window.location.href = '/workspace'; return; }
    try {
      var results = await Promise.all([
        apiFetch('/api/dashboard/' + wsId),
        apiFetch('/api/workspaces/' + wsId + '/campaigns').catch(function () { return []; }),
      ]);
      var dash = results[0];
      var campaigns = results[1] || [];
      if (!dash) return;

      document.getElementById('bgn-loading').style.display = 'none';
      if (dash.empty || !dash.workspace) {
        document.getElementById('bgn-empty').style.display = 'block';
        return;
      }
      document.getElementById('bgn-main').style.display = 'block';

      var currency = dash.workspace.currency || 'USD';
      var factor = currency === 'IQD' ? 1
        : (dash.workspace.currencyMinorFactor > 0 ? dash.workspace.currencyMinorFactor : 100);

      renderGreeting(dash);
      renderStatus(dash);
      renderKpis(dash, currency, factor);
      renderChart(dash, currency, factor);
      renderCampaigns(campaigns, currency, factor);
      renderAction(dash);
      renderSecondary(dash, currency, factor);
    } catch (err) {
      document.getElementById('bgn-loading').textContent = 'حدث خطأ أثناء التحميل.';
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
