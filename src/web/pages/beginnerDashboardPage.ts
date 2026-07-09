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

    /* ── Greeting ── */
    .bgn-greeting {
      display: flex; align-items: flex-start; gap: 14px;
      padding: 22px 26px; margin-bottom: 18px;
      background: linear-gradient(135deg, #241C15 0%, #100E0D 70%);
      border: 1px solid rgba(217,167,89,0.25);
      border-radius: 18px;
    }
    .bgn-greeting-emoji { font-size: 38px; line-height: 1; flex-shrink: 0; }
    .bgn-greeting-text-wrap { flex: 1; min-width: 0; }
    .bgn-greeting-title { font-size: 19px; font-weight: 700; color: var(--text); line-height: 1.5; }
    .bgn-greeting-sub { font-size: 13.5px; color: var(--text-2); margin-top: 4px; line-height: 1.6; }
    .bgn-greeting-meta { font-size: 12px; color: var(--text-3); margin-top: 6px; }
    .bgn-status-wrap { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; flex-shrink: 0; }
    .bgn-status-pill {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 7px 14px; border-radius: 999px;
      font-size: 13px; font-weight: 700;
    }
    .bgn-status-pill .bgn-dot { width: 10px; height: 10px; border-radius: 50%; box-shadow: 0 0 0 3px rgba(255,255,255,0.06); }
    .bgn-status-pill.green  { background: rgba(52,168,113,0.14);  color: #5CC08F; }
    .bgn-status-pill.green  .bgn-dot { background: #34A871; }
    .bgn-status-pill.yellow { background: rgba(199,122,31,0.14); color: #E0A050; }
    .bgn-status-pill.yellow .bgn-dot { background: #C77A1F; }
    .bgn-status-pill.red    { background: rgba(226,96,79,0.14);  color: #EB9186; }
    .bgn-status-pill.red    .bgn-dot { background: #E2604F; }
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
    }
    .bgn-summary-icon { font-size: 26px; line-height: 1; flex-shrink: 0; }
    .bgn-summary-label { font-size: 11px; font-weight: 700; color: var(--accent-2); letter-spacing: 0.04em; margin-bottom: 5px; }
    .bgn-summary-text { font-size: 14.5px; color: var(--text); line-height: 1.65; }

    /* ── Metric cards ── */
    .bgn-metric-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-bottom: 18px; }
    @media (max-width: 760px) { .bgn-metric-grid { grid-template-columns: 1fr; } }
    .bgn-metric-card {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 16px; padding: 18px 16px;
      transition: transform var(--transition), border-color var(--transition);
    }
    .bgn-metric-card:hover { transform: translateY(-2px); border-color: var(--border-2); }
    .bgn-metric-top { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
    .bgn-metric-icon {
      font-size: 28px; line-height: 1; width: 48px; height: 48px;
      display: flex; align-items: center; justify-content: center;
      background: rgba(217,167,89,0.10); border-radius: 12px; flex-shrink: 0;
    }
    .bgn-metric-card.green  .bgn-metric-icon { background: rgba(52,168,113,0.12); }
    .bgn-metric-card.blue   .bgn-metric-icon { background: rgba(59,130,246,0.12); }
    .bgn-metric-card.purple .bgn-metric-icon { background: rgba(168,85,247,0.12); }
    .bgn-metric-label { font-size: 12.5px; font-weight: 600; color: var(--text-2); line-height: 1.45; }
    .bgn-metric-value { font-size: 28px; font-weight: 800; color: var(--text); line-height: 1.15; margin-bottom: 4px; }
    .bgn-metric-trend { font-size: 12px; display: inline-flex; align-items: center; gap: 4px; margin-bottom: 6px; }
    .bgn-metric-trend.up   { color: #5CC08F; }
    .bgn-metric-trend.down { color: #EB9186; }
    .bgn-metric-trend.flat { color: var(--text-3); }
    .bgn-metric-hint { font-size: 11.5px; color: var(--text-3); line-height: 1.5; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 8px; margin-top: 4px; }

    /* ── Mini cards ── */
    .bgn-mini-cards { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 20px; }
    @media (max-width: 760px) { .bgn-mini-cards { grid-template-columns: 1fr; } }
    .bgn-mini-card {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 14px; padding: 14px 16px;
    }
    .bgn-mini-top { display: flex; align-items: center; gap: 12px; margin-bottom: 6px; }
    .bgn-mini-emoji { font-size: 24px; line-height: 1; }
    .bgn-mini-label { font-size: 12.5px; color: var(--text-2); font-weight: 600; }
    .bgn-mini-value { font-size: 22px; font-weight: 800; color: var(--text); line-height: 1.1; }
    .bgn-mini-hint { font-size: 11.5px; color: var(--text-3); line-height: 1.45; margin-top: 4px; }

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
    .bgn-bar-fill { height: 100%; border-radius: 999px; background: linear-gradient(90deg, #34A871, #5CC08F); transition: width 0.6s ease; }
    .bgn-bar-fill.warning { background: linear-gradient(90deg, #C77A1F, #E0A050); }
    .bgn-bar-fill.danger  { background: linear-gradient(90deg, #E2604F, #EB9186); }
    .bgn-bar-fill.blue    { background: linear-gradient(90deg, #3b82f6, #60a5fa); }
    .bgn-bar-fill.gold    { background: linear-gradient(90deg, #C4903E, #E6BD7A); }
    .bgn-bar-hint { font-size: 11.5px; color: var(--text-3); margin-top: 6px; line-height: 1.45; }

    /* ── Issue notice ── */
    .bgn-issue-card {
      background: rgba(226,96,79,0.06);
      border: 1px solid rgba(226,96,79,0.22);
      border-radius: 14px; padding: 16px 18px;
      display: flex; gap: 12px; align-items: flex-start;
    }
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
    }
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
      transition: background var(--transition), transform var(--transition);
    }
    .bgn-action-cta:hover { background: var(--accent-2); transform: translateY(-1px); }
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
      text-decoration: none; transition: all var(--transition);
    }
    .bgn-quick-link:hover { border-color: rgba(217,167,89,0.35); color: var(--accent-2); background: rgba(217,167,89,0.06); }
    .bgn-quick-link span { font-size: 16px; }

    /* ── Account overview pills ── */
    .bgn-pills { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 18px; }
    .bgn-pill {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 7px 12px; border-radius: 999px;
      background: var(--surface); border: 1px solid var(--border);
      font-size: 12px; font-weight: 600; color: var(--text-2);
    }
    .bgn-pill strong { color: var(--text); font-weight: 800; }
    .bgn-pill.gold { border-color: rgba(217,167,89,0.3); background: rgba(217,167,89,0.08); color: var(--accent-2); }
    .bgn-pill.green { border-color: rgba(52,168,113,0.3); background: rgba(52,168,113,0.08); color: #5CC08F; }
    .bgn-pill.warn { border-color: rgba(199,122,31,0.3); background: rgba(199,122,31,0.08); color: #E0A050; }

    /* ── 7-day trend bars ── */
    .bgn-trend-card {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 16px; padding: 16px 18px 18px; margin-bottom: 18px;
    }
    .bgn-trend-bars {
      display: flex; align-items: flex-end; gap: 6px;
      height: 72px; margin-top: 10px;
    }
    .bgn-trend-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 0; }
    .bgn-trend-bar-wrap { width: 100%; height: 56px; display: flex; align-items: flex-end; justify-content: center; }
    .bgn-trend-bar {
      width: 100%; max-width: 28px; min-height: 3px;
      border-radius: 6px 6px 3px 3px;
      background: linear-gradient(180deg, var(--accent-2), var(--accent));
      transition: height 0.5s ease;
    }
    .bgn-trend-day { font-size: 10px; color: var(--text-3); white-space: nowrap; }
    .bgn-trend-legend { font-size: 11.5px; color: var(--text-3); margin-top: 8px; line-height: 1.45; }

    /* ── Benchmark verdicts ── */
    .bgn-bench-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 18px; }
    @media (max-width: 600px) { .bgn-bench-grid { grid-template-columns: 1fr; } }
    .bgn-bench-card {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 14px; padding: 14px 16px;
      display: flex; gap: 10px; align-items: flex-start;
    }
    .bgn-bench-card.positive { border-color: rgba(52,168,113,0.28); background: rgba(52,168,113,0.05); }
    .bgn-bench-card.negative { border-color: rgba(226,96,79,0.22); background: rgba(226,96,79,0.04); }
    .bgn-bench-icon { font-size: 20px; line-height: 1; flex-shrink: 0; }
    .bgn-bench-label { font-size: 12px; font-weight: 700; color: var(--text-2); margin-bottom: 2px; }
    .bgn-bench-value { font-size: 16px; font-weight: 800; color: var(--text); }
    .bgn-bench-verdict { font-size: 11.5px; color: var(--text-3); margin-top: 3px; line-height: 1.4; }

    /* ── Campaign spotlight ── */
    .bgn-camp-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 18px; }
    @media (max-width: 700px) { .bgn-camp-grid { grid-template-columns: 1fr; } }
    .bgn-camp-card {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 14px; padding: 14px 16px;
    }
    .bgn-camp-card.best { border-color: rgba(52,168,113,0.28); }
    .bgn-camp-card.worst { border-color: rgba(226,96,79,0.22); }
    .bgn-camp-badge { font-size: 10px; font-weight: 700; letter-spacing: 0.03em; margin-bottom: 6px; }
    .bgn-camp-card.best .bgn-camp-badge { color: #5CC08F; }
    .bgn-camp-card.worst .bgn-camp-badge { color: #EB9186; }
    .bgn-camp-name { font-size: 14px; font-weight: 700; color: var(--text); margin-bottom: 6px; line-height: 1.35; }
    .bgn-camp-stats { font-size: 12px; color: var(--text-2); line-height: 1.55; }
    .bgn-camp-link { display: inline-block; margin-top: 8px; font-size: 12px; font-weight: 600; color: var(--accent-2); text-decoration: none; }
    .bgn-camp-link:hover { color: var(--text); }

    /* ── Issues list ── */
    .bgn-issues-list { display: flex; flex-direction: column; gap: 10px; }
    .bgn-issue-item {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 12px; padding: 12px 14px;
      display: flex; gap: 10px; align-items: flex-start;
    }
    .bgn-issue-item.high { border-color: rgba(226,96,79,0.25); background: rgba(226,96,79,0.05); }
    .bgn-issue-item.mid { border-color: rgba(199,122,31,0.22); background: rgba(199,122,31,0.04); }

    /* ── Insight tips ── */
    .bgn-tips { display: flex; flex-direction: column; gap: 10px; }
    .bgn-tip {
      background: rgba(217,167,89,0.06); border: 1px solid rgba(217,167,89,0.18);
      border-radius: 12px; padding: 12px 14px;
    }
    .bgn-tip-title { font-size: 13px; font-weight: 700; color: var(--accent-2); margin-bottom: 3px; }
    .bgn-tip-body { font-size: 12.5px; color: var(--text-2); line-height: 1.55; }

    /* ── AI prompt chips ── */
    .bgn-prompts { display: flex; flex-wrap: wrap; gap: 8px; }
    .bgn-prompt {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 8px 13px; border-radius: 999px;
      background: var(--surface); border: 1px solid var(--border);
      font-size: 12.5px; font-weight: 600; color: var(--text-2);
      text-decoration: none; transition: all var(--transition);
    }
    .bgn-prompt:hover { border-color: rgba(217,167,89,0.35); color: var(--accent-2); background: rgba(217,167,89,0.06); }

    /* ── FAQ accordion ── */
    .bgn-faq { display: flex; flex-direction: column; gap: 8px; }
    .bgn-faq-item {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 12px; overflow: hidden;
    }
    .bgn-faq-q {
      width: 100%; padding: 12px 14px; border: none; background: transparent;
      text-align: right; font-family: inherit; font-size: 13px; font-weight: 700;
      color: var(--text); cursor: pointer; display: flex; align-items: center;
      justify-content: space-between; gap: 10px;
    }
    .bgn-faq-q:hover { background: rgba(255,255,255,0.02); }
    .bgn-faq-q span { font-size: 11px; color: var(--text-3); transition: transform 0.2s; }
    .bgn-faq-item.open .bgn-faq-q span { transform: rotate(180deg); }
    .bgn-faq-a {
      display: none; padding: 0 14px 12px;
      font-size: 12.5px; color: var(--text-2); line-height: 1.6;
    }
    .bgn-faq-item.open .bgn-faq-a { display: block; }

    /* ── Extra metric row ── */
    .bgn-extra-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 18px; }
    @media (max-width: 760px) { .bgn-extra-grid { grid-template-columns: 1fr; } }

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
        <div class="bgn-greeting">
          <div class="bgn-greeting-emoji">👋</div>
          <div class="bgn-greeting-text-wrap">
            <div class="bgn-greeting-title" id="bgn-greeting-title">مرحباً بك!</div>
            <div class="bgn-greeting-sub" id="bgn-greeting-sub">ها هي نظرة سريعة على حملاتك.</div>
            <div class="bgn-greeting-meta" id="bgn-last-updated"></div>
          </div>
          <div class="bgn-status-wrap">
            <span id="bgn-status-pill" class="bgn-status-pill gray">
              <span class="bgn-dot"></span>
              <span id="bgn-status-text">—</span>
            </span>
            <span class="bgn-status-hint" id="bgn-status-hint"></span>
          </div>
        </div>

        <div class="bgn-summary" id="bgn-summary">
          <div class="bgn-summary-icon">📋</div>
          <div style="flex:1;">
            <div class="bgn-summary-label">ما يحدث الآن</div>
            <div class="bgn-summary-text" id="bgn-summary-text">جاري التحميل…</div>
          </div>
        </div>

        <div class="bgn-pills" id="bgn-pills"></div>

        <div class="bgn-metric-grid" id="bgn-metric-grid"></div>

        <div class="bgn-extra-grid" id="bgn-extra-grid"></div>

        <div class="bgn-section" id="bgn-trend-section" style="display:none;">
          <div class="bgn-section-head">
            <span class="bgn-section-emoji">📈</span>
            <h2 class="bgn-section-title">آخر ٧ أيام — الرسائل</h2>
          </div>
          <div class="bgn-trend-card" id="bgn-trend-card"></div>
        </div>

        <div class="bgn-mini-cards" id="bgn-mini-cards"></div>

        <div class="bgn-section" id="bgn-bench-section" style="display:none;">
          <div class="bgn-section-head">
            <span class="bgn-section-emoji">✅</span>
            <h2 class="bgn-section-title">هل الأرقام جيدة؟</h2>
            <span class="bgn-section-sub">مقارنة بسيطة</span>
          </div>
          <div class="bgn-bench-grid" id="bgn-bench-grid"></div>
        </div>

        <div class="bgn-section" id="bgn-camp-section" style="display:none;">
          <div class="bgn-section-head">
            <span class="bgn-section-emoji">🏆</span>
            <h2 class="bgn-section-title">حملاتك</h2>
          </div>
          <div class="bgn-camp-grid" id="bgn-camp-grid"></div>
        </div>

        <div class="bgn-section">
          <div class="bgn-section-head">
            <span class="bgn-section-emoji">🩺</span>
            <h2 class="bgn-section-title">حالة حسابك</h2>
            <span class="bgn-section-sub">آخر ٣٠ يوماً</span>
          </div>
          <div class="bgn-bar-card" id="bgn-progress-card"></div>
        </div>

        <div class="bgn-section" id="bgn-issue-section" style="display:none;">
          <div class="bgn-section-head">
            <span class="bgn-section-emoji">⚠️</span>
            <h2 class="bgn-section-title">ملاحظات تحتاج متابعة</h2>
            <span class="bgn-section-sub" id="bgn-issue-count"></span>
          </div>
          <div class="bgn-issues-list" id="bgn-issues-list"></div>
        </div>

        <div class="bgn-section" id="bgn-tips-section" style="display:none;">
          <div class="bgn-section-head">
            <span class="bgn-section-emoji">💬</span>
            <h2 class="bgn-section-title">نصائح سريعة</h2>
          </div>
          <div class="bgn-tips" id="bgn-tips"></div>
        </div>

        <div class="bgn-section" id="bgn-action-section">
          <div class="bgn-section-head">
            <span class="bgn-section-emoji">✨</span>
            <h2 class="bgn-section-title">الخطوة التالية</h2>
          </div>
          <div class="bgn-action-card" id="bgn-action-card"></div>
        </div>

        <div class="bgn-section">
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

        <div class="bgn-section">
          <div class="bgn-section-head">
            <span class="bgn-section-emoji">❓</span>
            <h2 class="bgn-section-title">اسأل المساعد</h2>
          </div>
          <div class="bgn-prompts" id="bgn-prompts"></div>
        </div>

        <div class="bgn-section">
          <div class="bgn-section-head">
            <span class="bgn-section-emoji">📖</span>
            <h2 class="bgn-section-title">شرح المصطلحات</h2>
          </div>
          <div class="bgn-faq" id="bgn-faq"></div>
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
      return '<div class="bgn-metric-card ' + c.tone + '">'
        + '<div class="bgn-metric-top"><div class="bgn-metric-icon">' + c.emoji + '</div><div class="bgn-metric-label">' + c.label + '</div></div>'
        + '<div class="bgn-metric-value">' + c.value + '</div>'
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
      return '<div class="bgn-mini-card">'
        + '<div class="bgn-mini-top"><div class="bgn-mini-emoji">' + c.emoji + '</div><div class="bgn-mini-label">' + c.label + '</div></div>'
        + '<div class="bgn-mini-value">' + c.value + '</div>'
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
    var pulse = dash.brain && dash.brain.livePulse;
    var todayHtml = '';

    if (pulse && pulse.intraDaySpendPct != null && isFinite(Number(pulse.intraDaySpendPct))) {
      var dayPct = Math.max(0, Math.min(100, Math.round(Number(pulse.intraDaySpendPct))));
      todayHtml =
        '<div class="bgn-bar-block">'
          + '<div class="bgn-bar-row"><span class="bgn-bar-label">⏱️ ميزانية اليوم</span>'
          + '<span class="bgn-bar-value">' + fmtSimplePct(dayPct) + ' مستخدمة</span></div>'
          + '<div class="bgn-bar-track"><div class="bgn-bar-fill gold" style="width:' + dayPct + '%;"></div></div>'
          + '<div class="bgn-bar-hint">نسبة ما أُنفق اليوم من الميزانية اليومية لحملاتك.</div>'
        + '</div>';
    }

    el.innerHTML = todayHtml
      + '<div class="bgn-bar-block">'
        + '<div class="bgn-bar-row"><span class="bgn-bar-label">🩺 صحة الحساب</span>'
        + '<span class="bgn-bar-value">' + Math.round(score) + ' من ١٠٠</span></div>'
        + '<div class="bgn-bar-track"><div class="bgn-bar-fill ' + scoreCls + '" style="width:' + Math.max(0, Math.min(100, Math.round(score))) + '%;"></div></div>'
        + '<div class="bgn-bar-hint">' + healthBandHint(band, score) + '</div>'
      + '</div>'
      + '<div class="bgn-bar-block">'
        + '<div class="bgn-bar-row"><span class="bgn-bar-label">📣 الحملات النشطة</span>'
        + '<span class="bgn-bar-value">' + fmtSimpleCount(active) + ' / ' + fmtSimpleCount(target) + '</span></div>'
        + '<div class="bgn-bar-track"><div class="bgn-bar-fill blue" style="width:' + campPct + '%;"></div></div>'
        + '<div class="bgn-bar-hint">يُنصح بتشغيل ٣ حملات على الأقل لنتائج أفضل.</div>'
      + '</div>';
  }

  function costPerMessage(dash, currency, factor) {
    var spend = getKpi(dash, 'spend');
    var msgs = getKpi(dash, 'messages');
    if (!spend || !msgs || !Number(msgs.value)) return null;
    var f = factor || 100;
    var major = Number(spend.value) / f;
    return major / Number(msgs.value);
  }

  function bandLabelAr(b) {
    var map = { excellent: 'ممتاز', good: 'جيد', attention: 'يحتاج انتباه', poor: 'ضعيف', none: '—' };
    return map[b] || b || '—';
  }

  function renderAccountPills(dash) {
    var el = document.getElementById('bgn-pills');
    if (!el) return;
    var cc = dash.workspace && dash.workspace.campaignCounts;
    if (!cc) { el.innerHTML = ''; return; }
    var pills = [
      { cls: '', icon: '📁', label: 'إجمالي الحملات', val: cc.total },
      { cls: 'green', icon: '▶️', label: 'تعمل الآن', val: cc.deliveringInWindow },
      { cls: 'gold', icon: '💸', label: 'تنفق اليوم', val: cc.spendingToday },
      { cls: cc.dormantActive > 0 ? 'warn' : '', icon: '⏸️', label: 'نشطة بدون إنفاق', val: cc.dormantActive },
      { cls: '', icon: '⏯️', label: 'متوقفة', val: cc.paused },
    ];
    el.innerHTML = pills.filter(function (p) { return p.val > 0 || p.label === 'تعمل الآن'; }).map(function (p) {
      return '<span class="bgn-pill ' + p.cls + '">' + p.icon + ' ' + p.label + ': <strong>' + fmtSimpleCount(p.val) + '</strong></span>';
    }).join('');
  }

  function renderExtraMetrics(dash, currency, factor) {
    var grid = document.getElementById('bgn-extra-grid');
    if (!grid) return;
    var cpm = getKpi(dash, 'cpm');
    var freq = getKpi(dash, 'frequency');
    var cpr = costPerMessage(dash, currency, factor);
    var cards = [
      { emoji: '💬', label: 'تكلفة كل رسالة', tone: 'green',
        value: cpr != null ? fmtSimpleMoney(Math.round(cpr * factor), currency, factor) : '—',
        hint: 'كم دفعت في المتوسط مقابل كل رسالة من عميل.' },
      { emoji: '👁️', label: 'تكلفة ألف ظهور (CPM)', tone: 'blue',
        value: (cpm && cpm.display && cpm.display !== '—') ? String(cpm.display).replace(/USD/g, arabicCurrencyWord(currency)) : '—',
        hint: 'سعر الوصول لألف شخص — كلما انخفض كان أفضل.' },
      { emoji: '🔁', label: 'تكرار الظهور', tone: 'purple',
        value: freq && freq.value != null && isFinite(Number(freq.value)) ? Number(freq.value).toFixed(1) : '—',
        hint: 'كم مرة شاهد نفس الشخص إعلانك — الأعلى من ٣ قد يُ tired الجمهور.' },
    ];
    grid.innerHTML = cards.map(function (c) {
      return '<div class="bgn-mini-card">'
        + '<div class="bgn-mini-top"><div class="bgn-mini-emoji">' + c.emoji + '</div><div class="bgn-mini-label">' + c.label + '</div></div>'
        + '<div class="bgn-mini-value">' + c.value + '</div>'
        + '<div class="bgn-mini-hint">' + c.hint + '</div>'
      + '</div>';
    }).join('');
  }

  function renderWeekTrend(dash) {
    var sec = document.getElementById('bgn-trend-section');
    var card = document.getElementById('bgn-trend-card');
    if (!sec || !card) return;
    var ts = dash.trendSeries;
    if (!ts || !ts.dates || ts.dates.length < 2) { sec.style.display = 'none'; return; }
    var series = (ts.results && ts.results.length) ? ts.results : (ts.messages || []);
    var n = Math.min(7, series.length);
    var slice = series.slice(-n);
    var dates = ts.dates.slice(-n);
    var max = Math.max.apply(null, slice.map(function (v) { return Number(v) || 0; }).concat([1]));
    var total = slice.reduce(function (s, v) { return s + (Number(v) || 0); }, 0);
    var bars = slice.map(function (v, i) {
      var h = Math.max(4, Math.round(((Number(v) || 0) / max) * 52));
      var d = dates[i] || '';
      var dayLabel = d.length >= 10 ? d.slice(8, 10) + '/' + d.slice(5, 7) : d;
      return '<div class="bgn-trend-col"><div class="bgn-trend-bar-wrap"><div class="bgn-trend-bar" style="height:' + h + 'px;" title="' + fmtSimpleCount(v) + '"></div></div><div class="bgn-trend-day">' + dayLabel + '</div></div>';
    }).join('');
    card.innerHTML = bars
      + '<div class="bgn-trend-legend">المجموع: ' + fmtSimpleCount(total) + ' نتيجة خلال آخر ' + fmtSimpleCount(n) + ' أيام. كل عمود = يوم واحد.</div>';
    sec.style.display = 'block';
  }

  function renderBenchmarks(dash) {
    var sec = document.getElementById('bgn-bench-section');
    var grid = document.getElementById('bgn-bench-grid');
    if (!sec || !grid) return;
    var items = [];
    var steady = dash.steadyState;
    if (steady && steady.benchmarks && steady.benchmarks.length) {
      steady.benchmarks.forEach(function (b) {
        items.push({ icon: b.positive ? '✅' : '⚠️', label: b.label, value: b.valueDisplay, verdict: b.verdict, positive: b.positive });
      });
    } else {
      var ctr = getKpi(dash, 'ctr');
      if (ctr && ctr.value != null) {
        var good = Number(ctr.value) >= 1.5;
        items.push({ icon: good ? '✅' : '⚠️', label: 'نسبة النقر', value: fmtSimplePct(ctr.value),
          verdict: good ? 'فوق المعيار الجيد (١.٥٪+)' : 'تحت المعيار — جرّب تحسين الإعلان', positive: good });
      }
      var cpr = costPerMessage(dash, dash.workspace.currency, dash.workspace.currencyMinorFactor);
      if (cpr != null) {
        var cprGood = cpr <= 5;
        items.push({ icon: cprGood ? '✅' : '⚠️', label: 'تكلفة الرسالة', value: fmtSimpleMoney(Math.round(cpr * (dash.workspace.currencyMinorFactor || 100)), dash.workspace.currency, dash.workspace.currencyMinorFactor),
          verdict: cprGood ? 'ضمن نطاق صحي' : 'مرتفعة — راقب الإنفاق', positive: cprGood });
      }
    }
    if (!items.length) { sec.style.display = 'none'; return; }
    grid.innerHTML = items.map(function (b) {
      return '<div class="bgn-bench-card ' + (b.positive ? 'positive' : 'negative') + '">'
        + '<div class="bgn-bench-icon">' + b.icon + '</div>'
        + '<div><div class="bgn-bench-label">' + b.label + '</div>'
        + '<div class="bgn-bench-value">' + b.value + '</div>'
        + '<div class="bgn-bench-verdict">' + b.verdict + '</div></div>'
      + '</div>';
    }).join('');
    sec.style.display = 'block';
  }

  function renderCampaignSpotlight(dash) {
    var sec = document.getElementById('bgn-camp-section');
    var grid = document.getElementById('bgn-camp-grid');
    if (!sec || !grid) return;
    var best = dash.bestCampaign;
    var worst = dash.worstCampaign;
    if (!best && !worst) { sec.style.display = 'none'; return; }
    function campCard(c, kind) {
      if (!c) return '';
      var msgs = fmtSimpleCount(c.messages || 0);
      var ctr = c.ctr != null ? Number(c.ctr).toFixed(1) + '٪' : '—';
      return '<div class="bgn-camp-card ' + kind + '">'
        + '<div class="bgn-camp-badge">' + (kind === 'best' ? '🏆 أفضل حملة' : '⚡ تحتاج اهتمام') + '</div>'
        + '<div class="bgn-camp-name">' + (c.name || '—') + '</div>'
        + '<div class="bgn-camp-stats">صحة: ' + Math.round(c.health || 0) + '/١٠٠ (' + bandLabelAr(c.band) + ')<br>'
        + 'رسائل: ' + msgs + ' · نقر: ' + ctr + '</div>'
        + '<a href="/campaigns?id=' + encodeURIComponent(c.id || c.metaId || '') + '" class="bgn-camp-link">عرض التفاصيل ←</a>'
      + '</div>';
    }
    grid.innerHTML = campCard(best, 'best') + campCard(worst, 'worst');
    sec.style.display = 'block';
  }

  function renderAllIssues(dash) {
    var sec = document.getElementById('bgn-issue-section');
    var list = document.getElementById('bgn-issues-list');
    var countEl = document.getElementById('bgn-issue-count');
    if (!sec || !list) return;
    var issues = (dash.issues || []).slice();
    if (!issues.length) { sec.style.display = 'none'; return; }
    var rank = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    issues.sort(function (a, b) {
      return (rank[a.severity] != null ? rank[a.severity] : 9) - (rank[b.severity] != null ? rank[b.severity] : 9);
    });
    var show = issues.slice(0, 4);
    if (countEl) countEl.textContent = fmtSimpleCount(issues.length) + ' ملاحظة';
    list.innerHTML = show.map(function (issue) {
      var cls = issue.severity === 'CRITICAL' || issue.severity === 'HIGH' ? 'high' : 'mid';
      var body = (issue.recommendations && issue.recommendations[0]) || '';
      return '<div class="bgn-issue-item ' + cls + '">'
        + '<div class="bgn-issue-icon">' + (cls === 'high' ? '⚠️' : '💡') + '</div>'
        + '<div><div class="bgn-issue-title">' + (issue.title || 'ملاحظة') + '</div>'
        + (body ? '<div class="bgn-issue-body">' + body + '</div>' : '')
        + '</div></div>';
    }).join('');
    sec.style.display = 'block';
  }

  function renderTips(dash) {
    var sec = document.getElementById('bgn-tips-section');
    var el = document.getElementById('bgn-tips');
    if (!sec || !el) return;
    var tips = [];
    var steady = dash.steadyState;
    if (steady && steady.insights && steady.insights.length) {
      steady.insights.slice(0, 3).forEach(function (ins) {
        tips.push({ title: ins.title, body: ins.body });
      });
    }
    var feed = dash.brain && dash.brain.cmoFeedV2;
    if (feed && feed.length && tips.length < 3) {
      feed.slice(0, 3 - tips.length).forEach(function (item) {
        var body = item.summary || item.headline || item.title || '';
        if (body) tips.push({ title: 'من المراقبة الذكية', body: body });
      });
    }
    if (steady && steady.backgroundSummary && tips.length < 3) {
      tips.push({ title: 'الوضع العام', body: steady.backgroundSummary });
    }
    if (!tips.length) { sec.style.display = 'none'; return; }
    el.innerHTML = tips.map(function (t) {
      return '<div class="bgn-tip"><div class="bgn-tip-title">' + t.title + '</div><div class="bgn-tip-body">' + t.body + '</div></div>';
    }).join('');
    sec.style.display = 'block';
  }

  function buildAiPrompts(dash) {
    var prompts = [];
    var band = (dash.health && dash.health.band) || 'none';
    var active = activeCampaignCount(dash);
    if (band === 'poor' || band === 'attention') {
      prompts.push('لماذا صحة حسابي ضعيفة؟');
      prompts.push('ما الخطوة الأولى لتحسين الأداء؟');
    }
    if (active < 3) prompts.push('كيف أشغّل حملات أكثر بأمان؟');
    var msgs = getKpi(dash, 'messages');
    if (msgs && Number(msgs.value) > 0) prompts.push('كيف أزيد عدد الرسائل؟');
    var ctr = getKpi(dash, 'ctr');
    if (ctr && Number(ctr.value) < 1.5) prompts.push('كيف أحسّن نسبة النقر على إعلاناتي؟');
    if (dash.priorityAction && dash.priorityAction.text) {
      prompts.unshift('اشرح لي: ' + dash.priorityAction.text.slice(0, 60));
    }
    prompts.push('لخص لي أداء حسابي بلغة بسيطة');
    return prompts.slice(0, 5);
  }

  function renderAiPrompts(dash) {
    var el = document.getElementById('bgn-prompts');
    if (!el) return;
    el.innerHTML = buildAiPrompts(dash).map(function (q) {
      return '<a href="/ai?q=' + encodeURIComponent(q) + '" class="bgn-prompt">💬 ' + q + '</a>';
    }).join('');
  }

  var BGN_FAQ = [
    { q: 'ما معنى صحة الحساب؟', a: 'رقم من ٠ إلى ١٠٠ يجمع أداء حملاتك: الإنفاق، النتائج، والتفاعل. كلما ارتفع كان حسابك أفضل.' },
    { q: 'ما الفرق بين «حملات تعمل» و«تنفق اليوم»؟', a: '«تعمل» = حملات أُنفق عليها مؤخراً. «تنفق اليوم» = حملات أنفقت مالاً فعلياً اليوم.' },
    { q: 'ما هي نسبة النقر (CTR)؟', a: 'نسبة الأشخاص الذين ضغطوا على إعلانك من بين من شاهدوه. ٢٪ يعني ٢ من كل ١٠٠ شخص.' },
    { q: 'ما تكلفة الرسالة؟', a: 'مجموع الإنفاق ÷ عدد الرسائل. تخبرك كم تدفع مقابل كل عميل يتواصل معك.' },
    { q: 'لماذا يظهر «ضعيف» رغم وجود رسائل؟', a: 'الرسائل جزء واحد. الصحة تراجع أيضاً التكلفة، التفاعل، وتنوع الحملات.' },
  ];

  function renderFaq() {
    var el = document.getElementById('bgn-faq');
    if (!el) return;
    el.innerHTML = BGN_FAQ.map(function (item, i) {
      return '<div class="bgn-faq-item" id="bgn-faq-' + i + '">'
        + '<button type="button" class="bgn-faq-q" data-faq="' + i + '">' + item.q + '<span>▼</span></button>'
        + '<div class="bgn-faq-a">' + item.a + '</div></div>';
    }).join('');
    el.querySelectorAll('.bgn-faq-q').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var item = document.getElementById('bgn-faq-' + btn.getAttribute('data-faq'));
        if (item) item.classList.toggle('open');
      });
    });
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
      text = (typeof pa === 'string') ? pa : (pa.text || pa.actionCode || '');
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

  function renderBeginnerDashboard(dash) {
    var currency = dash.workspace.currency || 'USD';
    var factor = currency === 'IQD' ? 1
      : (dash.workspace.currencyMinorFactor != null && dash.workspace.currencyMinorFactor > 0
        ? dash.workspace.currencyMinorFactor : 100);
    renderGreeting(dash);
    renderStatus(dash);
    renderSummary(dash);
    renderAccountPills(dash);
    renderMetricCards(dash, currency, factor);
    renderExtraMetrics(dash, currency, factor);
    renderWeekTrend(dash);
    renderMiniCards(dash);
    renderBenchmarks(dash);
    renderCampaignSpotlight(dash);
    renderProgressCard(dash);
    renderAllIssues(dash);
    renderTips(dash);
    renderNextStep(dash);
    renderAiPrompts(dash);
    updateBgnLastUpdated(dash);
  }

  var BGN_REFRESH_MS = 90000;
  var bgnRefreshTimer = null;

  function startBgnAutoRefresh(wsId) {
    async function refresh() {
      if (document.hidden) return;
      try {
        var dash = await apiFetch('/api/dashboard/' + wsId);
        if (!dash || dash.empty || !dash.workspace) return;
        renderBeginnerDashboard(dash);
      } catch (e) { /* silent */ }
    }
    function armTimer() {
      if (bgnRefreshTimer) clearInterval(bgnRefreshTimer);
      bgnRefreshTimer = setInterval(refresh, BGN_REFRESH_MS);
    }
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) { refresh(); armTimer(); }
      else if (bgnRefreshTimer) { clearInterval(bgnRefreshTimer); bgnRefreshTimer = null; }
    });
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

  document.addEventListener('DOMContentLoaded', function () {
    renderFaq();
    loadBeginnerDashboard();
  });
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
