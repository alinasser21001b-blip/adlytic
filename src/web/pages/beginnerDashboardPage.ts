// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/beginnerDashboardPage.ts
//
//  Dashboard — Beginner Mode (وضع المبتدئ / لوحة الإنقاذ).
//
//  Goal: explain what's happening in plain Arabic — no jargon, no charts.
//  Same /api/dashboard/:wsId DTO as Pro; richer client-side storytelling.
// ════════════════════════════════════════════════════════════════════════

import { layout } from '../layout';

export function beginnerDashboardPage(): string {
  const extraHead = `<style>
    .bgn-shell { direction: rtl; text-align: right; max-width: 980px; margin: 0 auto; letter-spacing: normal; line-height: 1.6; }
    .bgn-shell *, .bgn-shell *::before, .bgn-shell *::after { box-sizing: border-box; }

    /* ── Motion: entrance + reduced-motion ── */
    @keyframes bgn-rise {
      from { opacity: 0; transform: translateY(12px); }
      to   { opacity: 1; transform: none; }
    }
    @keyframes bgn-pulse-dot {
      0%, 100% { transform: scale(1); box-shadow: 0 0 0 3px rgba(255,255,255,0.06); }
      50% { transform: scale(1.15); box-shadow: 0 0 0 6px rgba(226,96,79,0.18); }
    }
    @keyframes bgn-wave {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
    @keyframes bgn-soft-spin {
      to { transform: rotate(360deg); }
    }
    .bgn-anim {
      opacity: 0;
      animation: bgn-rise 420ms cubic-bezier(0.22, 0.61, 0.36, 1) forwards;
    }
    .bgn-anim.d1 { animation-delay: 40ms; }
    .bgn-anim.d2 { animation-delay: 90ms; }
    .bgn-anim.d3 { animation-delay: 140ms; }
    .bgn-anim.d4 { animation-delay: 190ms; }
    .bgn-anim.d5 { animation-delay: 240ms; }
    .bgn-anim.d6 { animation-delay: 290ms; }
    .bgn-anim.d7 { animation-delay: 340ms; }
    @media (prefers-reduced-motion: reduce) {
      .bgn-anim { opacity: 1; animation: none; }
      .bgn-status-pill.red .bgn-dot,
      .bgn-status-pill.yellow .bgn-dot { animation: none; }
      .bgn-bar-fill { transition: none !important; }
      .bgn-metric-value, .bgn-mini-value { transition: none; }
    }

    /* ── Greeting ── */
    .bgn-greeting {
      display: flex; align-items: flex-start; gap: 14px;
      padding: 22px 26px; margin-bottom: 18px;
      background: linear-gradient(135deg, #241C15 0%, #100E0D 70%);
      border: 1px solid rgba(217,167,89,0.25);
      border-radius: 18px;
      transition: border-color 200ms ease, box-shadow 200ms ease;
    }
    .bgn-greeting:hover { border-color: rgba(217,167,89,0.4); box-shadow: 0 8px 28px rgba(0,0,0,0.18); }
    .bgn-greeting-emoji { font-size: 38px; line-height: 1; flex-shrink: 0; transition: transform 280ms ease; }
    .bgn-greeting:hover .bgn-greeting-emoji { transform: scale(1.08) rotate(-6deg); }
    .bgn-greeting-text-wrap { flex: 1; min-width: 0; }
    .bgn-greeting-title { font-size: 19px; font-weight: 700; color: var(--text); line-height: 1.5; }
    .bgn-greeting-sub { font-size: 13.5px; color: var(--text-2); margin-top: 4px; line-height: 1.6; }
    .bgn-greeting-meta { font-size: 12px; color: var(--text-3); margin-top: 6px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .bgn-refresh-btn {
      display: inline-flex; align-items: center; gap: 5px;
      padding: 3px 9px; border-radius: 999px;
      border: 1px solid var(--border); background: rgba(255,255,255,0.03);
      color: var(--text-3); font-size: 11px; font-weight: 600;
      font-family: inherit; cursor: pointer;
      transition: color 160ms ease, border-color 160ms ease, background 160ms ease;
    }
    .bgn-refresh-btn:hover { color: var(--accent-2); border-color: rgba(217,167,89,0.35); background: rgba(217,167,89,0.08); }
    .bgn-refresh-btn.is-busy { pointer-events: none; opacity: 0.7; }
    .bgn-refresh-btn.is-busy .bgn-refresh-ico { animation: bgn-soft-spin 0.8s linear infinite; }
    .bgn-refresh-ico { width: 12px; height: 12px; display: inline-block; }
    .bgn-status-wrap { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; flex-shrink: 0; }
    .bgn-status-pill {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 7px 14px; border-radius: 999px;
      font-size: 13px; font-weight: 700;
      cursor: help;
      transition: transform 180ms ease, box-shadow 180ms ease;
    }
    .bgn-status-pill:hover { transform: scale(1.04); }
    .bgn-status-pill .bgn-dot { width: 10px; height: 10px; border-radius: 50%; box-shadow: 0 0 0 3px rgba(255,255,255,0.06); }
    .bgn-status-pill.green  { background: rgba(52,168,113,0.14);  color: #5CC08F; }
    .bgn-status-pill.green  .bgn-dot { background: #34A871; }
    .bgn-status-pill.yellow { background: rgba(199,122,31,0.14); color: #E0A050; }
    .bgn-status-pill.yellow .bgn-dot { background: #C77A1F; animation: bgn-pulse-dot 1.8s ease-in-out infinite; }
    .bgn-status-pill.red    { background: rgba(226,96,79,0.14);  color: #EB9186; }
    .bgn-status-pill.red    .bgn-dot { background: #E2604F; animation: bgn-pulse-dot 1.4s ease-in-out infinite; }
    .bgn-status-pill.gray   { background: rgba(255,255,255,0.05); color: var(--text-3); }
    .bgn-status-pill.gray   .bgn-dot { background: var(--text-3); }
    .bgn-status-hint { font-size: 11px; color: var(--text-3); max-width: 140px; text-align: end; line-height: 1.4; }

    /* ── "What's happening now" summary ── */
    .bgn-summary {
      background: linear-gradient(135deg, rgba(217,167,89,0.08) 0%, var(--surface) 100%);
      border: 1px solid rgba(217,167,89,0.22);
      border-radius: 16px;
      padding: 18px 20px;
      margin-bottom: 20px;
      display: flex; gap: 14px; align-items: flex-start;
      transition: border-color 200ms ease, transform 200ms ease;
    }
    .bgn-summary:hover { border-color: rgba(217,167,89,0.4); transform: translateY(-1px); }
    .bgn-summary-icon { font-size: 26px; line-height: 1; flex-shrink: 0; }
    .bgn-summary-label { font-size: 11px; font-weight: 700; color: var(--accent-2); letter-spacing: 0.04em; margin-bottom: 5px; }
    .bgn-summary-text { font-size: 14.5px; color: var(--text); line-height: 1.65; }

    /* ── Metric cards ── */
    .bgn-metric-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-bottom: 18px; }
    @media (max-width: 760px) { .bgn-metric-grid { grid-template-columns: 1fr; } }
    .bgn-metric-card {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 16px; padding: 18px 16px;
      cursor: pointer; user-select: none;
      transition: transform 200ms ease, border-color 200ms ease, box-shadow 200ms ease, background 200ms ease;
    }
    .bgn-metric-card:hover { transform: translateY(-3px); border-color: var(--border-2); box-shadow: 0 10px 28px rgba(0,0,0,0.2); }
    .bgn-metric-card:active { transform: translateY(-1px) scale(0.99); }
    .bgn-metric-card.is-open {
      border-color: rgba(217,167,89,0.4);
      background: linear-gradient(180deg, rgba(217,167,89,0.06), var(--surface));
    }
    .bgn-metric-top { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
    .bgn-metric-icon {
      font-size: 28px; line-height: 1; width: 48px; height: 48px;
      display: flex; align-items: center; justify-content: center;
      background: rgba(217,167,89,0.10); border-radius: 12px; flex-shrink: 0;
      transition: transform 220ms ease;
    }
    .bgn-metric-card:hover .bgn-metric-icon { transform: scale(1.06); }
    .bgn-metric-card.green  .bgn-metric-icon { background: rgba(52,168,113,0.12); }
    .bgn-metric-card.blue   .bgn-metric-icon { background: rgba(59,130,246,0.12); }
    .bgn-metric-card.purple .bgn-metric-icon { background: rgba(168,85,247,0.12); }
    .bgn-metric-label { font-size: 12.5px; font-weight: 600; color: var(--text-2); line-height: 1.45; flex: 1; }
    .bgn-metric-expand {
      font-size: 10px; font-weight: 700; color: var(--text-3);
      padding: 2px 7px; border-radius: 999px;
      border: 1px solid var(--border); background: rgba(255,255,255,0.03);
      transition: color 160ms ease, border-color 160ms ease;
    }
    .bgn-metric-card.is-open .bgn-metric-expand { color: var(--accent-2); border-color: rgba(217,167,89,0.35); }
    .bgn-metric-value { font-size: 28px; font-weight: 800; color: var(--text); line-height: 1.15; margin-bottom: 4px; }
    .bgn-metric-trend { font-size: 12px; display: inline-flex; align-items: center; gap: 4px; margin-bottom: 6px; }
    .bgn-metric-trend.up   { color: #5CC08F; }
    .bgn-metric-trend.down { color: #EB9186; }
    .bgn-metric-trend.flat { color: var(--text-3); }
    .bgn-metric-hint {
      font-size: 11.5px; color: var(--text-3); line-height: 1.5;
      border-top: 1px solid rgba(255,255,255,0.05); padding-top: 8px; margin-top: 4px;
      max-height: 0; opacity: 0; overflow: hidden; padding-top: 0; border-top-width: 0; margin-top: 0;
      transition: max-height 280ms ease, opacity 200ms ease, padding 200ms ease, margin 200ms ease, border-width 200ms ease;
    }
    .bgn-metric-card.is-open .bgn-metric-hint {
      max-height: 80px; opacity: 1; padding-top: 8px; border-top-width: 1px; margin-top: 4px;
    }

    /* ── Mini cards ── */
    .bgn-mini-cards { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 20px; }
    @media (max-width: 760px) { .bgn-mini-cards { grid-template-columns: 1fr; } }
    .bgn-mini-card {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 14px; padding: 14px 16px;
      cursor: pointer;
      transition: transform 200ms ease, border-color 200ms ease, box-shadow 200ms ease;
    }
    .bgn-mini-card:hover { transform: translateY(-2px); border-color: var(--border-2); box-shadow: 0 8px 22px rgba(0,0,0,0.16); }
    .bgn-mini-card:active { transform: scale(0.99); }
    .bgn-mini-card.is-open { border-color: rgba(217,167,89,0.35); }
    .bgn-mini-top { display: flex; align-items: center; gap: 12px; margin-bottom: 6px; }
    .bgn-mini-emoji { font-size: 24px; line-height: 1; transition: transform 220ms ease; }
    .bgn-mini-card:hover .bgn-mini-emoji { transform: scale(1.08); }
    .bgn-mini-label { font-size: 12.5px; color: var(--text-2); font-weight: 600; }
    .bgn-mini-value { font-size: 22px; font-weight: 800; color: var(--text); line-height: 1.1; }
    .bgn-mini-hint {
      font-size: 11.5px; color: var(--text-3); line-height: 1.45; margin-top: 0;
      max-height: 0; opacity: 0; overflow: hidden;
      transition: max-height 260ms ease, opacity 180ms ease, margin 180ms ease;
    }
    .bgn-mini-card.is-open .bgn-mini-hint { max-height: 70px; opacity: 1; margin-top: 6px; }

    /* ── Sections ── */
    .bgn-section { margin-bottom: 20px; }
    .bgn-section-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
    .bgn-section-emoji { font-size: 20px; line-height: 1; }
    .bgn-section-title { font-size: 15px; font-weight: 700; color: var(--text); }
    .bgn-section-sub { font-size: 12px; color: var(--text-3); margin-inline-start: auto; }

    /* ── Progress bars ── */
    .bgn-bar-card {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 16px; padding: 18px 20px 20px;
    }
    .bgn-bar-block { margin-bottom: 16px; }
    .bgn-bar-block:last-child { margin-bottom: 0; }
    .bgn-bar-row { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 8px; gap: 8px; }
    .bgn-bar-label { font-size: 13.5px; font-weight: 600; color: var(--text); }
    .bgn-bar-value { font-size: 12.5px; color: var(--text-2); font-weight: 600; white-space: nowrap; }
    .bgn-bar-track { width: 100%; height: 12px; background: rgba(255,255,255,0.05); border-radius: 999px; overflow: hidden; }
    .bgn-bar-fill {
      height: 100%; width: 0;
      border-radius: 999px;
      background: linear-gradient(90deg, #34A871, #5CC08F);
      transition: width 900ms cubic-bezier(0.22, 0.61, 0.36, 1);
      background-size: 200% 100%;
    }
    .bgn-bar-fill.warning { background: linear-gradient(90deg, #C77A1F, #E0A050); }
    .bgn-bar-fill.danger  { background: linear-gradient(90deg, #E2604F, #EB9186); }
    .bgn-bar-fill.blue    { background: linear-gradient(90deg, #3b82f6, #60a5fa); }
    .bgn-bar-fill.gold    {
      background: linear-gradient(90deg, #C4903E, #E6BD7A, #C4903E);
      background-size: 200% 100%;
      animation: bgn-wave 2.8s linear infinite;
    }
    .bgn-bar-hint { font-size: 11.5px; color: var(--text-3); margin-top: 6px; line-height: 1.45; }

    /* ── Issue notice ── */
    .bgn-issue-card {
      background: rgba(226,96,79,0.06);
      border: 1px solid rgba(226,96,79,0.22);
      border-radius: 14px; padding: 16px 18px;
      display: flex; gap: 12px; align-items: flex-start;
      transition: transform 200ms ease, border-color 200ms ease;
    }
    .bgn-issue-card:hover { transform: translateY(-1px); }
    .bgn-issue-card.warn {
      background: rgba(199,122,31,0.06);
      border-color: rgba(199,122,31,0.22);
    }
    .bgn-issue-icon { font-size: 22px; line-height: 1; flex-shrink: 0; }
    .bgn-issue-title { font-size: 13.5px; font-weight: 700; color: var(--text); margin-bottom: 4px; }
    .bgn-issue-body { font-size: 13px; color: var(--text-2); line-height: 1.55; }

    /* ── Next step / guidance ── */
    .bgn-action-card {
      background: linear-gradient(135deg, rgba(217,167,89,0.10) 0%, var(--surface) 100%);
      border: 1px solid rgba(217,167,89,0.30);
      border-radius: 16px; padding: 18px 20px;
      transition: box-shadow 220ms ease, border-color 220ms ease;
    }
    .bgn-action-card:hover { border-color: rgba(217,167,89,0.5); box-shadow: 0 10px 30px rgba(217,167,89,0.08); }
    .bgn-action-head { display: flex; gap: 12px; align-items: flex-start; margin-bottom: 14px; }
    .bgn-action-emoji { font-size: 28px; line-height: 1; flex-shrink: 0; }
    .bgn-action-title { font-size: 13px; font-weight: 700; color: var(--accent-2); margin-bottom: 4px; }
    .bgn-action-text { font-size: 14px; color: var(--text); line-height: 1.6; }
    .bgn-action-cta {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 9px 16px; border-radius: 10px;
      background: var(--accent); color: #100E0D;
      font-size: 13px; font-weight: 700;
      text-decoration: none; border: none; cursor: pointer;
      font-family: inherit;
      transition: background 180ms ease, transform 180ms ease, box-shadow 180ms ease;
    }
    .bgn-action-cta:hover { background: var(--accent-2); transform: translateY(-1px); box-shadow: 0 6px 16px rgba(217,167,89,0.28); }
    .bgn-action-cta:active { transform: scale(0.98); }
    .bgn-action-cta.secondary {
      background: rgba(255,255,255,0.06); color: var(--text);
      border: 1px solid var(--border);
    }
    .bgn-action-cta.secondary:hover { background: rgba(255,255,255,0.09); }

    /* ── Quick links ── */
    .bgn-quick-links {
      display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;
      margin-top: 4px;
    }
    @media (max-width: 600px) { .bgn-quick-links { grid-template-columns: 1fr; } }
    .bgn-quick-link {
      display: flex; align-items: center; justify-content: center; gap: 8px;
      padding: 12px 14px; border-radius: 12px;
      background: var(--surface); border: 1px solid var(--border);
      color: var(--text-2); font-size: 13px; font-weight: 600;
      text-decoration: none; transition: all 180ms ease;
    }
    .bgn-quick-link:hover { border-color: rgba(217,167,89,0.35); color: var(--accent-2); background: rgba(217,167,89,0.06); transform: translateY(-2px); }
    .bgn-quick-link:active { transform: scale(0.98); }
    .bgn-quick-link span { font-size: 16px; transition: transform 200ms ease; }
    .bgn-quick-link:hover span { transform: scale(1.12); }

    /* ── Empty / loading ── */
    .bgn-empty { text-align: center; padding: 64px 24px; background: var(--surface); border: 1px dashed var(--border-2); border-radius: 18px; }
    .bgn-empty-emoji { font-size: 54px; opacity: 0.6; margin-bottom: 12px; }
    .bgn-empty-title { font-size: 17px; font-weight: 700; color: var(--text); margin-bottom: 8px; }
    .bgn-empty-text { font-size: 14px; color: var(--text-2); max-width: 360px; margin: 0 auto; line-height: 1.6; }
    .bgn-empty-btn { display: inline-block; margin-top: 18px; padding: 10px 20px; border-radius: 10px; background: var(--accent); color: #fff; font-size: 14px; font-weight: 600; text-decoration: none; }
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
        <div class="bgn-greeting bgn-anim d1">
          <div class="bgn-greeting-emoji">👋</div>
          <div class="bgn-greeting-text-wrap">
            <div class="bgn-greeting-title" id="bgn-greeting-title">مرحباً بك!</div>
            <div class="bgn-greeting-sub" id="bgn-greeting-sub">ها هي نظرة سريعة على حملاتك.</div>
            <div class="bgn-greeting-meta">
              <span id="bgn-last-updated"></span>
              <button type="button" class="bgn-refresh-btn" id="bgn-refresh-btn" title="تحديث الآن">
                <svg class="bgn-refresh-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
                تحديث
              </button>
            </div>
          </div>
          <div class="bgn-status-wrap">
            <span id="bgn-status-pill" class="bgn-status-pill gray" title="حالة صحة الحساب">
              <span class="bgn-dot"></span>
              <span id="bgn-status-text">—</span>
            </span>
            <span class="bgn-status-hint" id="bgn-status-hint"></span>
          </div>
        </div>

        <div class="bgn-summary bgn-anim d2" id="bgn-summary">
          <div class="bgn-summary-icon">📋</div>
          <div style="flex:1;">
            <div class="bgn-summary-label">ما يحدث الآن</div>
            <div class="bgn-summary-text" id="bgn-summary-text">جاري التحميل…</div>
          </div>
        </div>

        <div class="bgn-metric-grid bgn-anim d3" id="bgn-metric-grid"></div>
        <div class="bgn-mini-cards bgn-anim d4" id="bgn-mini-cards"></div>

        <div class="bgn-section bgn-anim d5">
          <div class="bgn-section-head">
            <span class="bgn-section-emoji">🩺</span>
            <h2 class="bgn-section-title">حالة حسابك</h2>
            <span class="bgn-section-sub">آخر ٣٠ يوماً</span>
          </div>
          <div class="bgn-bar-card" id="bgn-progress-card"></div>
        </div>

        <div class="bgn-section bgn-anim d6" id="bgn-issue-section" style="display:none;">
          <div class="bgn-section-head">
            <span class="bgn-section-emoji">⚠️</span>
            <h2 class="bgn-section-title">ملاحظة مهمة</h2>
          </div>
          <div class="bgn-issue-card" id="bgn-issue-card"></div>
        </div>

        <div class="bgn-section bgn-anim d6" id="bgn-action-section">
          <div class="bgn-section-head">
            <span class="bgn-section-emoji">✨</span>
            <h2 class="bgn-section-title">الخطوة التالية</h2>
          </div>
          <div class="bgn-action-card" id="bgn-action-card"></div>
        </div>

        <div class="bgn-section bgn-anim d7">
          <div class="bgn-section-head">
            <span class="bgn-section-emoji">🔗</span>
            <h2 class="bgn-section-title">انتقل إلى</h2>
          </div>
          <div class="bgn-quick-links">
            <a href="/recommendations" class="bgn-quick-link"><span>💡</span> التوصيات</a>
            <a href="/campaigns" class="bgn-quick-link"><span>📣</span> الحملات</a>
            <a href="/ai" class="bgn-quick-link"><span>🤖</span> المساعد الذكي</a>
          </div>
        </div>
      </div>
    </div>
  `;

  const scripts = `<script>
  var ARABIC_CURRENCY = {
    USD: 'دولار', EUR: 'يورو', GBP: 'جنيه إسترليني',
    SAR: 'ريال', AED: 'درهم', IQD: 'دينار',
    EGP: 'جنيه', JOD: 'دينار', KWD: 'دينار',
    QAR: 'ريال', OMR: 'ريال', BHD: 'دينار',
  };
  function arabicCurrencyWord(code) { return ARABIC_CURRENCY[code] || code || ''; }

  var AR_LOCALE = 'ar-EG';
  var AR_NUM_PLAIN = { useGrouping: false };

  function fmtSimpleMoney(minor, currency, factor) {
    if (minor == null || !isFinite(Number(minor))) return '—';
    var f = factor == null ? (currency === 'IQD' ? 1 : 100) : factor;
    var whole = Math.round(Number(minor) / f);
    return whole.toLocaleString(AR_LOCALE, AR_NUM_PLAIN) + ' ' + arabicCurrencyWord(currency);
  }
  function fmtSimpleCount(n) {
    if (n == null || !isFinite(Number(n))) return '—';
    return Math.round(Number(n)).toLocaleString(AR_LOCALE, AR_NUM_PLAIN);
  }
  function fmtSimplePct(n) {
    if (n == null || !isFinite(Number(n))) return '—';
    return Math.round(Number(n)).toLocaleString(AR_LOCALE, AR_NUM_PLAIN) + '٪';
  }

  function trendArrow(dir, goodWhenUp) {
    if (dir === 'flat' || dir == null) return { sym: '➡️', cls: 'flat', label: 'ثابت' };
    var good = goodWhenUp !== false;
    if (dir === 'up')   return { sym: '⬆️', cls: good ? 'up' : 'down', label: good ? 'تحسّن' : 'ارتفاع' };
    return { sym: '⬇️', cls: good ? 'down' : 'up', label: good ? 'انخفاض' : 'تحسّن' };
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

  function healthBandHint(band, score) {
    var s = typeof score === 'number' ? Math.round(score) : null;
    var map = {
      excellent: 'أداء ممتاز — استمر على نفس المسار.',
      good:      'أداء جيد — يمكنك تحسينه أكثر.',
      attention: (s != null ? ('النتيجة ' + s + '/١٠٠ — راجع الملاحظات.') : 'هناك نقاط تحتاج متابعة.'),
      poor:      (s != null ? ('النتيجة ' + s + '/١٠٠ — يُنصح بإجراء سريع.') : 'الأداء ضعيف — يُنصح بإجراء سريع.'),
      none:      'بانتظار بيانات كافية من فيسبوك.',
    };
    return map[band] || map.none;
  }

  function getKpi(dash, key) {
    return (dash.kpis || []).find(function (x) { return x.key === key; }) || null;
  }

  function activeCampaignCount(dash) {
    var cc = dash.workspace && dash.workspace.campaignCounts;
    return cc ? cc.deliveringInWindow : ((dash.workspace && dash.workspace.activeCampaigns) || 0);
  }

  function buildNowSummary(dash) {
    var band = (dash.health && dash.health.band) || 'none';
    var msgs = getKpi(dash, 'messages');
    var spend = getKpi(dash, 'spend');
    var active = activeCampaignCount(dash);
    var issueCount = (dash.issues || []).length;
    var parts = [];

    if (band === 'poor') parts.push('حسابك يحتاج اهتماماً عاجلاً هذه الفترة.');
    else if (band === 'attention') parts.push('هناك بعض النقاط التي تحتاج مراجعة في حسابك.');
    else if (band === 'excellent' || band === 'good') parts.push('حسابك يعمل بشكل جيد بشكل عام.');

    if (msgs && Number(msgs.value) > 0) {
      parts.push('وصلتك ' + fmtSimpleCount(msgs.value) + ' رسالة من العملاء خلال آخر ٣٠ يوماً.');
    } else if (spend && Number(spend.value) > 0) {
      parts.push('أنفقت ' + fmtSimpleMoney(spend.value, dash.workspace.currency, dash.workspace.currencyMinorFactor) + ' على الإعلانات خلال آخر ٣٠ يوماً.');
    }

    if (active === 0) parts.push('لا توجد حملات تُنفِق حالياً — فكّر بتشغيل حملة.');
    else if (active < 3) parts.push('لديك ' + fmtSimpleCount(active) + ' حملة تعمل — تشغيل ٣ حملات يعطي نتائج أفضل.');

    if (issueCount > 0) parts.push('رصدنا ' + fmtSimpleCount(issueCount) + ' ملاحظة تحتاج متابعة.');

    return parts.length
      ? parts.join(' ')
      : 'ها نظرة مبسّطة على أداء إعلاناتك خلال آخر ٣٠ يوماً.';
  }

  function pickTopIssue(dash) {
    var issues = dash.issues || [];
    if (!issues.length) return null;
    var rank = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    return issues.slice().sort(function (a, b) {
      return (rank[a.severity] != null ? rank[a.severity] : 9) - (rank[b.severity] != null ? rank[b.severity] : 9);
    })[0];
  }

  function guidanceCta(dash, kind) {
    if (kind === 'issue' || (dash.priorityAction && dash.priorityAction.actionCode)) {
      var code = dash.priorityAction && dash.priorityAction.actionCode ? dash.priorityAction.actionCode : '';
      if (/CREATIVE|REFRESH/i.test(code)) return { href: '/campaigns', label: 'مراجعة الحملات' };
      if (/PAUSE|SCALE|BUDGET|RESCUE/i.test(code)) return { href: '/campaigns', label: 'إدارة الحملات' };
      return { href: '/recommendations', label: 'عرض التوصيات' };
    }
    return { href: '/ai', label: 'اسأل المساعد الذكي' };
  }

  function renderSummary(dash) {
    var el = document.getElementById('bgn-summary-text');
    if (el) el.textContent = buildNowSummary(dash);
  }

  function renderStatus(dash) {
    var pill = document.getElementById('bgn-status-pill');
    var txt  = document.getElementById('bgn-status-text');
    var hint = document.getElementById('bgn-status-hint');
    var band = (dash.health && dash.health.band) || 'none';
    var score = dash.health && dash.health.score;
    var p = healthBandPill(band);
    pill.className = 'bgn-status-pill ' + p.cls;
    txt.textContent = p.label;
    if (hint) hint.textContent = healthBandHint(band, score);
  }

  function renderGreeting(dash) {
    var titleEl = document.getElementById('bgn-greeting-title');
    var subEl   = document.getElementById('bgn-greeting-sub');
    var wsName = (dash.workspace && dash.workspace.name) || 'مساحة العمل';
    if (titleEl) titleEl.textContent = 'أهلاً بك في ' + wsName;
    if (subEl) subEl.textContent = 'لوحة مبسّطة — كل ما تحتاج معرفته في مكان واحد.';
  }

  function escAttr(s) {
    return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
  }

  function renderMetricCards(dash, currency, factor) {
    var grid = document.getElementById('bgn-metric-grid');
    if (!grid) return;
    var spend = getKpi(dash, 'spend');
    var reach = getKpi(dash, 'reach');
    var msgs  = getKpi(dash, 'messages');

    var cards = [
      { emoji: '💰', label: 'الإنفاق (٣٠ يوماً)', tone: 'green', hint: 'مجموع ما دفعته لفيسبوك على الإعلانات.',
        value: spend ? fmtSimpleMoney(spend.value, currency, factor) : '—',
        delta: spend ? trendArrow(spend.direction, spend.goodWhenUp !== false) : null,
        deltaPct: spend && spend.deltaPct != null ? spend.deltaPct : null },
      { emoji: '👥', label: 'من شاهد إعلاناتك', tone: 'blue', hint: 'عدد الأشخاص المختلفين الذين رأوا إعلانك.',
        value: reach ? fmtSimpleCount(reach.value) : '—',
        delta: reach ? trendArrow(reach.direction, true) : null, deltaPct: null },
      { emoji: '📩', label: 'الرسائل والمحادثات', tone: 'purple', hint: 'رسائل بدأها العملاء بعد رؤية إعلانك.',
        value: msgs ? fmtSimpleCount(msgs.value) : '—',
        delta: msgs ? trendArrow(msgs.direction, true) : null,
        deltaPct: msgs && msgs.deltaPct != null ? msgs.deltaPct : null },
    ];

    grid.innerHTML = cards.map(function (c) {
      var trendHtml = '';
      if (c.delta) {
        var pctText = c.deltaPct != null ? (' ' + Math.round(Math.abs(Number(c.deltaPct) * 100)) + '٪') : '';
        trendHtml = '<div class="bgn-metric-trend ' + c.delta.cls + '">' + c.delta.sym + ' ' + c.delta.label + pctText + '</div>';
      }
      return '<div class="bgn-metric-card ' + c.tone + '" role="button" tabindex="0" aria-expanded="false">'
        + '<div class="bgn-metric-top"><div class="bgn-metric-icon">' + c.emoji + '</div><div class="bgn-metric-label">' + c.label + '</div><span class="bgn-metric-expand">شرح</span></div>'
        + '<div class="bgn-metric-value" data-tick="' + escAttr(c.value) + '">٠</div>'
        + trendHtml
        + '<div class="bgn-metric-hint">' + c.hint + '</div>'
      + '</div>';
    }).join('');
  }

  function renderMiniCards(dash) {
    var mini = document.getElementById('bgn-mini-cards');
    if (!mini) return;
    var ctr = getKpi(dash, 'ctr');
    var active = activeCampaignCount(dash);
    var cards = [
      { emoji: '📣', label: 'حملات تعمل الآن', value: fmtSimpleCount(active),
        hint: 'حملات تُنفِق مالاً وتُسلِّم إعلاناتك حالياً.' },
      { emoji: '🎯', label: 'نسبة النقر (CTR)', value: ctr && ctr.value != null && isFinite(Number(ctr.value)) ? fmtSimplePct(ctr.value) : '—',
        hint: 'كم شخصاً ضغط على إعلانك من بين من شاهدوه.' },
    ];
    mini.innerHTML = cards.map(function (c) {
      return '<div class="bgn-mini-card" role="button" tabindex="0" aria-expanded="false">'
        + '<div class="bgn-mini-top"><div class="bgn-mini-emoji">' + c.emoji + '</div><div class="bgn-mini-label">' + c.label + '</div></div>'
        + '<div class="bgn-mini-value" data-tick="' + escAttr(c.value) + '">٠</div>'
        + '<div class="bgn-mini-hint">' + c.hint + '</div>'
      + '</div>';
    }).join('');
  }

  function renderProgressCard(dash) {
    var el = document.getElementById('bgn-progress-card');
    if (!el) return;
    var score = (dash.health && typeof dash.health.score === 'number') ? dash.health.score : 0;
    var band  = (dash.health && dash.health.band) || 'none';
    var scoreCls = band === 'poor' ? 'danger' : band === 'attention' ? 'warning' : (band === 'none' ? 'blue' : '');
    var active = activeCampaignCount(dash);
    var target = 3;
    var campPct = Math.min(100, Math.round((active / target) * 100));
    var scorePct = Math.max(0, Math.min(100, Math.round(score)));
    var pulse = dash.brain && dash.brain.livePulse;
    var todayHtml = '';

    if (pulse && pulse.intraDaySpendPct != null && isFinite(Number(pulse.intraDaySpendPct))) {
      var dayPct = Math.max(0, Math.min(100, Math.round(Number(pulse.intraDaySpendPct))));
      todayHtml =
        '<div class="bgn-bar-block">'
          + '<div class="bgn-bar-row"><span class="bgn-bar-label">⏱️ ميزانية اليوم</span>'
          + '<span class="bgn-bar-value">' + fmtSimplePct(dayPct) + ' مستخدمة</span></div>'
          + '<div class="bgn-bar-track"><div class="bgn-bar-fill gold" data-width="' + dayPct + '"></div></div>'
          + '<div class="bgn-bar-hint">نسبة ما أُنفق اليوم من الميزانية اليومية لحملاتك.</div>'
        + '</div>';
    }

    el.innerHTML = todayHtml
      + '<div class="bgn-bar-block">'
        + '<div class="bgn-bar-row"><span class="bgn-bar-label">🩺 صحة الحساب</span>'
        + '<span class="bgn-bar-value">' + Math.round(score) + ' من ١٠٠</span></div>'
        + '<div class="bgn-bar-track"><div class="bgn-bar-fill ' + scoreCls + '" data-width="' + scorePct + '"></div></div>'
        + '<div class="bgn-bar-hint">' + healthBandHint(band, score) + '</div>'
      + '</div>'
      + '<div class="bgn-bar-block">'
        + '<div class="bgn-bar-row"><span class="bgn-bar-label">📣 الحملات النشطة</span>'
        + '<span class="bgn-bar-value">' + fmtSimpleCount(active) + ' / ' + fmtSimpleCount(target) + '</span></div>'
        + '<div class="bgn-bar-track"><div class="bgn-bar-fill blue" data-width="' + campPct + '"></div></div>'
        + '<div class="bgn-bar-hint">يُنصح بتشغيل ٣ حملات على الأقل لنتائج أفضل.</div>'
      + '</div>';
  }

  function renderTopIssue(dash) {
    var sec = document.getElementById('bgn-issue-section');
    var card = document.getElementById('bgn-issue-card');
    if (!sec || !card) return;
    var issue = pickTopIssue(dash);
    if (!issue) { sec.style.display = 'none'; return; }
    var isWarn = issue.severity === 'MEDIUM' || issue.severity === 'LOW';
    card.className = 'bgn-issue-card' + (isWarn ? ' warn' : '');
    var body = (issue.recommendations && issue.recommendations[0]) || issue.title || '';
    card.innerHTML = '<div class="bgn-issue-icon">' + (isWarn ? '💡' : '⚠️') + '</div>'
      + '<div><div class="bgn-issue-title">' + (issue.title || 'ملاحظة') + '</div>'
      + '<div class="bgn-issue-body">' + body + '</div></div>';
    sec.style.display = 'block';
  }

  function renderNextStep(dash) {
    var card = document.getElementById('bgn-action-card');
    if (!card) return;
    var pa = dash.priorityAction;
    var steady = dash.steadyState;
    var title = 'ماذا تفعل الآن؟';
    var text = '';
    var cta = guidanceCta(dash, 'default');

    if (pa) {
      text = (typeof pa === 'string') ? pa : (pa.text || '');
      if (!text || /^[A-Z0-9_]+$/.test(String(text))) {
        text = 'راجع الحملات وطبّق تعديلاً واحداً واضحاً اليوم.';
      }
      cta = guidanceCta(dash, 'action');
    } else if (steady && (steady.mainMoveNarrative || steady.backgroundSummary)) {
      title = steady.mainMoveTitle || 'الوضع الحالي';
      text = steady.mainMoveNarrative || steady.backgroundSummary || '';
      cta = { href: '/ai', label: 'اسأل المساعد الذكي' };
    } else {
      var issue = pickTopIssue(dash);
      if (issue && issue.recommendations && issue.recommendations[0]) {
        text = issue.recommendations[0];
        cta = guidanceCta(dash, 'issue');
      } else {
        text = 'كل شيء مستقر نسبياً. تابع الأرقام أعلاه أو اسأل المساعد الذكي عن أي شيء غير واضح.';
        cta = { href: '/ai', label: 'اسأل المساعد الذكي' };
      }
    }

    card.innerHTML = '<div class="bgn-action-head">'
      + '<div class="bgn-action-emoji">💡</div>'
      + '<div style="flex:1;"><div class="bgn-action-title">' + title + '</div>'
      + '<div class="bgn-action-text">' + text + '</div></div>'
      + '</div>'
      + '<a href="' + cta.href + '" class="bgn-action-cta">' + cta.label + ' ←</a>';
  }

  function updateBgnLastUpdated(dash) {
    var el = document.getElementById('bgn-last-updated');
    if (!el) return;
    var synced = dash.workspace && dash.workspace.lastSyncedAt;
    try {
      el.textContent = synced
        ? ('آخر مزامنة مع فيسبوك: ' + new Date(synced).toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' }))
        : ('تم التحديث: ' + new Date().toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' }));
    } catch (e) { el.textContent = ''; }
  }

  function animateBars() {
    document.querySelectorAll('.bgn-bar-fill[data-width]').forEach(function (bar) {
      bar.style.width = '0%';
    });
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        document.querySelectorAll('.bgn-bar-fill[data-width]').forEach(function (bar) {
          bar.style.width = (bar.getAttribute('data-width') || '0') + '%';
        });
      });
    });
  }

  function tickValues() {
    if (typeof tickText !== 'function') {
      document.querySelectorAll('[data-tick]').forEach(function (el) {
        el.textContent = el.getAttribute('data-tick') || el.textContent;
      });
      return;
    }
    document.querySelectorAll('[data-tick]').forEach(function (el) {
      var target = el.getAttribute('data-tick');
      if (target != null) tickText(el, target);
    });
  }

  function playInteractions() {
    animateBars();
    tickValues();
  }

  function renderBeginnerDashboard(dash, opts) {
    var currency = dash.workspace.currency || 'USD';
    var factor = currency === 'IQD' ? 1
      : (dash.workspace.currencyMinorFactor != null && dash.workspace.currencyMinorFactor > 0
        ? dash.workspace.currencyMinorFactor : 100);
    renderGreeting(dash);
    renderStatus(dash);
    renderSummary(dash);
    renderMetricCards(dash, currency, factor);
    renderMiniCards(dash);
    renderProgressCard(dash);
    renderTopIssue(dash);
    renderNextStep(dash);
    updateBgnLastUpdated(dash);
    playInteractions();
  }

  // Event delegation so expandable cards keep working after auto-refresh re-renders.
  document.addEventListener('click', function (e) {
    var card = e.target && e.target.closest ? e.target.closest('.bgn-metric-card, .bgn-mini-card') : null;
    if (!card || !document.getElementById('bgn-main') || !document.getElementById('bgn-main').contains(card)) return;
    var open = card.classList.toggle('is-open');
    card.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var card = e.target && e.target.closest ? e.target.closest('.bgn-metric-card, .bgn-mini-card') : null;
    if (!card) return;
    e.preventDefault();
    var open = card.classList.toggle('is-open');
    card.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  var BGN_REFRESH_MS = 90000;
  var bgnRefreshTimer = null;
  var bgnWsId = null;

  async function refreshBeginnerDashboard(manual) {
    if (!bgnWsId) return;
    var btn = document.getElementById('bgn-refresh-btn');
    if (manual && btn) btn.classList.add('is-busy');
    try {
      var dash = await apiFetch('/api/dashboard/' + bgnWsId);
      if (!dash || dash.empty || !dash.workspace) return;
      renderBeginnerDashboard(dash, { refresh: true });
      if (manual && typeof toast === 'function') toast('تم تحديث اللوحة', 'success');
    } catch (e) {
      if (manual && typeof toast === 'function') toast('تعذّر التحديث', 'error');
    } finally {
      if (btn) btn.classList.remove('is-busy');
    }
  }

  function startBgnAutoRefresh(wsId) {
    bgnWsId = wsId;
    async function refresh() {
      if (document.hidden) return;
      await refreshBeginnerDashboard(false);
    }
    function armTimer() {
      if (bgnRefreshTimer) clearInterval(bgnRefreshTimer);
      bgnRefreshTimer = setInterval(refresh, BGN_REFRESH_MS);
    }
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) { refresh(); armTimer(); }
      else if (bgnRefreshTimer) { clearInterval(bgnRefreshTimer); bgnRefreshTimer = null; }
    });
    var refreshBtn = document.getElementById('bgn-refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function () { refreshBeginnerDashboard(true); });
    }
    armTimer();
  }

  async function loadBeginnerDashboard() {
    var wsId = getWsId();
    if (!wsId) { window.location.href = '/workspace'; return; }
    try {
      var dash = await apiFetch('/api/dashboard/' + wsId);
      if (!dash) return;
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
