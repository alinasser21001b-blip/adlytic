// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/aiPage.ts  —  PHASE 7 (mobile insights)
//
//  Long AI prose is not a mobile experience. This page now leads with a
//  scannable, deterministic briefing in four steps:
//
//      ماذا حدث  →  لماذا  →  الأثر  →  ماذا تفعل
//      WHAT HAPPENED → WHY → IMPACT → WHAT TO DO
//
//  ── WHERE THE NUMBERS COME FROM ─────────────────────────────────────────
//  The briefing is rendered ENTIRELY from the dashboard DTO: the funnel
//  diagnosis, its evidence strings, the objective-aware health facets and the
//  per-unit result breakdown. Not one figure in it is written by a language
//  model.
//
//  The chat below it is the AI, and its job is EXPLANATION. It is labelled as
//  such, and every reply carries a footer pointing back at the computed
//  briefing as the source of record. If a number appears only inside a model
//  reply and nowhere in the DTO, that is a gap in the DTO to be reported —
//  never a number this page should present as measured.
//
//  ── NO ANALYTICS IN THE BROWSER ─────────────────────────────────────────
//  Ratios that arrive on the DTO are multiplied by 100 to be shown as a
//  percentage. That is formatting. Nothing here derives a metric from raw
//  components, thresholds a value, or decides what is healthy. Result counts
//  are shown per unit and never summed across units.
// ════════════════════════════════════════════════════════════════════════

import { layout } from '../layout';

export function aiPage(): string {
  const content = `
<style>
  .ai-page { direction: rtl; max-width: 1120px; margin: 0 auto; }

  .ai-hero {
    display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
    margin-bottom: 14px; flex-wrap: wrap;
  }
  .ai-hero-title { font-size: 21px; font-weight: 800; color: var(--text); letter-spacing: -0.02em; margin: 0; }
  .ai-hero-sub { font-size: 13px; color: var(--text-2); margin: 5px 0 0; line-height: 1.55; max-width: 48ch; }

  /* ── The computed briefing ──────────────────────────────────────────── */
  .ai-brief {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 18px; padding: 16px 16px 12px; margin-bottom: 16px;
  }
  .ai-brief-head {
    display: flex; align-items: center; justify-content: space-between;
    gap: 8px; flex-wrap: wrap; margin-bottom: 12px;
  }
  .ai-brief-kicker {
    font-size: 12px; font-weight: 800; color: var(--accent-2); letter-spacing: 0.02em;
  }
  .ai-conf {
    font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 999px;
    background: var(--surface-2); border: 1px solid var(--border); color: var(--text-2);
  }
  .ai-conf.conf-high { color: var(--success); border-color: var(--success-dim); }
  .ai-conf.conf-medium { color: var(--warning); border-color: var(--warning-dim); }
  .ai-conf.conf-collecting { color: var(--accent-2); border-color: var(--accent-glow); }

  .ai-steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
  .ai-step {
    border-radius: 14px; padding: 12px 13px;
    background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06);
    border-inline-start: 3px solid var(--border-2);
  }
  .ai-step--what { border-inline-start-color: #7BAEC2; }
  .ai-step--why { border-inline-start-color: #E07264; }
  .ai-step--impact { border-inline-start-color: #D9A03F; }
  .ai-step--do { border-inline-start-color: var(--accent); background: var(--accent-dim); }
  .ai-step-label {
    display: flex; align-items: center; gap: 7px;
    font-size: 12px; font-weight: 800; color: var(--accent-2);
    letter-spacing: 0.02em; margin-bottom: 6px;
  }
  .ai-step-ord {
    display: inline-flex; align-items: center; justify-content: center;
    width: 20px; height: 20px; border-radius: 50%;
    background: var(--accent-dim); color: var(--accent-2);
    font-size: 12px; font-weight: 800; flex-shrink: 0;
  }
  .ai-step-lead { font-size: 15px; font-weight: 800; color: var(--text); line-height: 1.45; }
  .ai-step-body { font-size: 13.5px; color: var(--text-2); line-height: 1.7; margin-top: 5px; overflow-wrap: anywhere; }
  .ai-step-list { list-style: none; margin: 6px 0 0; padding: 0; }
  .ai-step-list li {
    font-size: 13px; color: var(--text); line-height: 1.65;
    padding: 7px 10px; border-radius: 9px; margin-bottom: 5px;
    background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05);
    overflow-wrap: anywhere;
  }
  .ai-step-list li:last-child { margin-bottom: 0; }
  .ai-step-list li.is-na { color: var(--text-3); border-style: dashed; }

  .ai-units { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 6px; }
  .ai-unit {
    display: inline-flex; align-items: baseline; gap: 5px;
    padding: 6px 10px; border-radius: 999px;
    background: var(--surface-2); border: 1px solid var(--border);
  }
  .ai-unit b { font-size: 15px; font-weight: 800; color: var(--text); font-variant-numeric: tabular-nums; }
  .ai-unit span { font-size: 12px; color: var(--text-2); font-weight: 600; }
  .ai-approx {
    font-size: 12px; font-weight: 700; color: var(--warning);
    background: var(--warning-dim); border-radius: 6px; padding: 2px 6px;
  }
  .ai-mixed-note { font-size: 12px; color: var(--text-3); line-height: 1.6; margin-top: 7px; }
  .ai-stage-row {
    display: flex; align-items: baseline; justify-content: space-between; gap: 8px;
    font-size: 13px; color: var(--text-2); padding: 6px 0;
    border-bottom: 1px dashed rgba(255,255,255,0.06);
  }
  .ai-stage-row:last-child { border-bottom: none; }
  .ai-stage-row.is-break { color: var(--text); font-weight: 700; }
  .ai-stage-count { font-variant-numeric: tabular-nums; font-weight: 700; color: var(--text); }
  .ai-stage-ratio { font-size: 12px; color: var(--text-3); font-variant-numeric: tabular-nums; }
  .ai-brief-cta { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
  .ai-brief-cta .btn { flex: 1 1 auto; }
  .ai-brief-empty { font-size: 13px; color: var(--text-2); line-height: 1.7; }

  /* ── Chat ───────────────────────────────────────────────────────────── */
  .chat-shell { display: flex; gap: 16px; align-items: flex-start; }
  .chat-sidebar { width: 260px; flex-shrink: 0; display: flex; flex-direction: column; gap: 10px; }
  .chat-main {
    flex: 1; min-width: 0; display: flex; flex-direction: column; background: var(--surface);
    border: 1px solid var(--border); border-radius: 18px; overflow: hidden;
  }
  .chat-header {
    padding: 12px 14px; border-bottom: 1px solid var(--border);
    display: flex; align-items: center; gap: 10px;
    background: linear-gradient(135deg, var(--accent-dim), transparent);
  }
  .chat-header-dot { width: 8px; height: 8px; background: var(--success); border-radius: 50%; animation: pulse 2s infinite; }
  @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.4 } }
  .chat-role {
    font-size: 12px; color: var(--text-3); padding: 8px 14px;
    border-bottom: 1px dashed var(--border); line-height: 1.6;
  }
  .chat-messages {
    min-height: 260px; max-height: 60vh; overflow-y: auto;
    padding: 14px; display: flex; flex-direction: column; gap: 14px;
  }
  .chat-messages::-webkit-scrollbar { width: 4px; }
  .chat-messages::-webkit-scrollbar-thumb { background: var(--border-2); border-radius: 2px; }
  .msg { display: flex; gap: 9px; max-width: 90%; }
  .msg.user { align-self: flex-start; }
  .msg.assistant { align-self: stretch; max-width: 100%; }
  .msg-avatar {
    width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
    font-size: 12px; font-weight: 800; flex-shrink: 0;
  }
  .msg.assistant .msg-avatar { background: linear-gradient(135deg, var(--accent), var(--accent-2)); color: #1A1613; }
  .msg.user .msg-avatar { background: var(--surface-2); color: var(--text-2); border: 1px solid var(--border); }
  .msg-bubble { padding: 11px 13px; border-radius: 14px; font-size: 13.5px; line-height: 1.75; min-width: 0; overflow-wrap: anywhere; }
  .msg.assistant .msg-bubble {
    background: rgba(255,255,255,0.03); color: var(--text);
    border: 1px solid var(--border); border-inline-start: 3px solid var(--accent);
  }
  .msg.user .msg-bubble { background: var(--accent-dim); color: var(--text); border: 1px solid var(--accent-glow); }
  .msg-bubble p { margin: 0 0 8px; }
  .msg-bubble p:last-child { margin-bottom: 0; }
  .msg-bubble ul { margin: 6px 0 6px 16px; padding: 0; }
  .msg-bubble li { margin-bottom: 3px; }
  .msg-bubble strong { font-weight: 700; color: var(--accent-2); }
  .msg-bubble code { background: rgba(255,255,255,0.08); padding: 1px 5px; border-radius: 3px; font-family: monospace; font-size: 12px; }

  .chat-suggest-row {
    display: flex; gap: 7px; padding: 10px 12px 0;
    overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none;
  }
  .chat-suggest-row::-webkit-scrollbar { display: none; }
  .suggested-chip {
    flex: 0 0 auto; min-height: 44px;
    display: inline-flex; align-items: center;
    padding: 8px 13px; border-radius: 999px;
    background: var(--surface-2); border: 1px solid var(--border);
    color: var(--text-2); font-size: 12.5px; font-weight: 600;
    cursor: pointer; white-space: nowrap;
  }
  .suggested-chip:active { border-color: var(--accent-dim); }

  .chat-input-area { padding: 10px 12px calc(12px + env(safe-area-inset-bottom, 0px)); border-top: 1px solid var(--border); background: var(--surface-2); }
  .chat-input-row { display: flex; gap: 8px; align-items: flex-end; }
  .chat-input {
    flex: 1; min-width: 0; background: var(--surface-2); border: 1px solid var(--border);
    border-radius: 12px; padding: 11px 13px; color: var(--text);
    font-size: 16px; font-family: inherit; resize: none; outline: none;
    transition: border-color var(--transition), box-shadow var(--transition);
    min-height: 44px; max-height: 120px;
  }
  .chat-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-glow); }
  .chat-input::placeholder { color: var(--text-3); }
  .chat-send-btn {
    width: 44px; height: 44px; background: linear-gradient(135deg, var(--accent), var(--accent-2));
    border: none; border-radius: 12px; color: #1A1613; cursor: pointer;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-weight: 800;
  }
  .chat-send-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .chat-foot { font-size: 12px; color: var(--text-3); margin-top: 7px; text-align: center; line-height: 1.5; }

  .typing-dots span { animation: blink 1.4s infinite; display: inline-block; }
  .typing-dots span:nth-child(2) { animation-delay: 0.2s; }
  .typing-dots span:nth-child(3) { animation-delay: 0.4s; }
  @keyframes blink { 0%,80%,100% { opacity: 0 } 40% { opacity: 1 } }

  .data-chip {
    display: inline-flex; align-items: center; gap: 4px; padding: 5px 9px;
    background: var(--accent-dim); color: var(--accent-2); border: 1px solid var(--accent-glow);
    border-radius: 999px; font-size: 12px; font-weight: 600; margin: 2px;
  }
  .tool-chips { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 8px; }
  .tool-chip {
    display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px;
    background: var(--surface-2); border: 1px solid var(--border); color: var(--text-3);
    border-radius: 999px; font-size: 12px;
  }
  .evidence-bar {
    display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; padding-top: 8px;
    border-top: 1px dashed var(--border);
  }
  .evidence-pill {
    font-size: 12px; padding: 4px 8px; border-radius: 999px; line-height: 1.5;
    background: rgba(255,255,255,0.04); border: 1px solid var(--border); color: var(--text-3);
  }
  .evidence-pill b { color: var(--text-2); font-weight: 600; }
  .ai-side-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 13px; }
  .ai-side-title { font-size: 12px; font-weight: 700; color: var(--text); margin-bottom: 9px; }

  @media (max-width: 900px) {
    .chat-shell { flex-direction: column; gap: 12px; }
    .chat-sidebar { width: 100%; flex-direction: row; flex-wrap: wrap; }
    .chat-sidebar .ai-side-card { flex: 1 1 100%; }
    .chat-main { width: 100%; }
  }
  @media (max-width: 768px) {
    .ai-brief { padding: 14px 13px 12px; border-radius: 16px; }
    .chat-messages { min-height: 220px; max-height: 56vh; }
    .ai-step-lead { font-size: 14.5px; }
  }
</style>

<div class="ai-page">
  <header class="ai-hero">
    <div>
      <h1 class="ai-hero-title">المساعد الذكي</h1>
      <p class="ai-hero-sub">التحليل محسوب من بيانات حسابك. المساعد يشرحه بالعربية — ولا يخترع أرقاماً.</p>
    </div>
    <button class="btn btn-secondary btn-sm" id="clear-btn" type="button">مسح المحادثة</button>
  </header>

  <!-- Deterministic briefing. Every figure below arrives on the DTO. -->
  <section class="ai-brief" id="ai-brief" aria-label="ملخص محسوب">
    <div class="ai-brief-head">
      <span class="ai-brief-kicker" id="ai-brief-kicker">تحليل محسوب من بيانات حسابك</span>
      <span class="ai-conf" id="ai-brief-conf" style="display:none;"></span>
    </div>
    <div id="ai-brief-body">
      <div class="ai-brief-empty">جارٍ قراءة تحليل حسابك…</div>
    </div>
  </section>

  <div class="chat-shell">
    <div class="chat-sidebar">
      <div class="ai-side-card">
        <div class="ai-side-title">سياق الحساب المباشر</div>
        <div id="context-chips" style="display:flex;flex-wrap:wrap;gap:4px;">
          <div class="spinner" style="width:16px;height:16px;border-width:2px;"></div>
        </div>
      </div>
    </div>

    <div class="chat-main">
      <div class="chat-header">
        <div style="width:34px;height:34px;background:linear-gradient(135deg,var(--accent),var(--accent-2));border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;color:#1A1613;" aria-hidden="true">A</div>
        <div>
          <div style="font-size:13.5px;font-weight:700;color:var(--text);">Adlytic CMO</div>
          <div style="font-size:12px;color:var(--text-3);display:flex;align-items:center;gap:5px;">
            <div class="chat-header-dot" aria-hidden="true"></div>
            <span id="ai-status-line">يشرح التحليل المحسوب أعلاه</span>
          </div>
        </div>
      </div>

      <div class="chat-role" id="ai-role-line">دور المساعد هو الشرح والترتيب. الأرقام مصدرها التحليل المحسوب في الأعلى.</div>

      <div class="chat-messages" id="chat-messages"></div>

      <div class="chat-suggest-row" id="suggestions" role="list">
        <button type="button" class="suggested-chip" role="listitem">ما الذي أنصح به الآن؟</button>
        <button type="button" class="suggested-chip" role="listitem">لماذا انخفض تفاعل إعلاناتي؟</button>
        <button type="button" class="suggested-chip" role="listitem">هل تُنفَق ميزانيتي بشكل فعّال؟</button>
        <button type="button" class="suggested-chip" role="listitem">أي حملة أستحق أن أوسّعها؟</button>
      </div>

      <div class="chat-input-area">
        <div class="chat-input-row">
          <label class="ai-sr-only" for="chat-input" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);">اكتب سؤالك</label>
          <textarea class="chat-input" id="chat-input" placeholder="اسأل عن الحملات، الميزانية، الجمهور، أو الأداء…" rows="1" enterkeyhint="send"></textarea>
          <button class="chat-send-btn" id="send-btn" title="إرسال" aria-label="إرسال" type="button">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </div>
        <div class="chat-foot">الإجابات شرح للتحليل أعلاه — إن ظهر رقم في الرد ولم يظهر في الملخص المحسوب، عامله كتقدير لا كقياس.</div>
      </div>
    </div>
  </div>
</div>`;

  const scripts = `<script>
(async () => {
  function esc(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  const token = localStorage.getItem('adlytic_token');
  if (!token) { window.location.href = '/login'; return; }
  if (!(await ensureAccountActive())) return;
  const wsId  = localStorage.getItem('adlytic_workspace_id');
  if (!wsId)  { window.location.href = '/dashboard'; return; }

  try {
  const me = await apiFetch('/api/auth/me');
  if (!me) return;
  function setText(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value;
  }
  setText('user-name', me.name || me.email);
  setText('user-email', me.email);
  setText('user-avatar', (me.name || me.email || '?')[0].toUpperCase());
  const wsM = me.memberships?.find(m => m.workspaceId === wsId) || me.memberships?.[0];
  setText('ws-name', wsM?.workspace?.name || 'مساحة العمل');
  const userInitial = (me.name || me.email || '?')[0].toUpperCase();
  const userLocale = (me.locale || 'AR').toUpperCase();
  const isAr = userLocale === 'AR';

  if (!isAr) {
    document.querySelector('.ai-hero-title').textContent = 'Smart Assistant';
    document.querySelector('.ai-hero-sub').textContent = 'The analysis is computed from your account data. The assistant explains it — it does not invent numbers.';
    document.getElementById('clear-btn').textContent = 'Clear chat';
    document.getElementById('ai-status-line').textContent = 'Explaining the computed analysis above';
    document.getElementById('ai-role-line').textContent = 'The assistant explains and orders. Every figure comes from the computed briefing above.';
    document.getElementById('ai-brief-kicker').textContent = 'Computed from your account data';
    document.getElementById('chat-input').placeholder = 'Ask about campaigns, budget, audience, or performance…';
  }

  var SUGGESTIONS_AR = [
    'ما الذي أنصح به الآن؟',
    'لماذا انخفض تفاعل إعلاناتي؟',
    'هل تُنفَق ميزانيتي بشكل فعّال؟',
    'أي حملة أستحق أن أوسّعها؟',
    'هل يرى جمهوري نفس الإعلانات كثيراً؟',
  ];
  var SUGGESTIONS_EN = [
    'What should I do next?',
    'Why is my ad engagement dropping?',
    'Is my budget being spent efficiently?',
    'Which campaign should I scale?',
    'Is ad repetition too high?',
  ];
  var suggestions = isAr ? SUGGESTIONS_AR : SUGGESTIONS_EN;
  document.getElementById('suggestions').innerHTML = suggestions.map(function (s) {
    return '<button type="button" class="suggested-chip" role="listitem">' + esc(s) + '</button>';
  }).join('');

  let dashData = null;
  let sending  = false;
  let conversationId = null;
  const messagesEl = document.getElementById('chat-messages');
  const inputEl    = document.getElementById('chat-input');
  const sendBtn    = document.getElementById('send-btn');

  // ══════════════════════════════════════════════════════════════════════
  //  THE COMPUTED BRIEFING — pure projection of the DTO
  // ══════════════════════════════════════════════════════════════════════

  var PROBLEM_HEADLINE = {
    DELIVERY:          { ar: 'مشكلة في الوصول',       en: 'Delivery problem' },
    CLICK:             { ar: 'مشكلة في التصميم',       en: 'Creative problem' },
    POST_CLICK:        { ar: 'مشكلة بعد النقر',        en: 'Post-click problem' },
    CONVERSION:        { ar: 'مشكلة في إتمام النتيجة', en: 'Conversion problem' },
    EFFICIENCY:        { ar: 'ارتفاع التكلفة',         en: 'Rising cost' },
    NO_MATERIAL_BREAK: { ar: 'لا توجد مشكلة جوهرية',   en: 'No material break' }
  };

  // INSUFFICIENT_DATA is a state of its own: still collecting. It is neither
  // low confidence nor an error nor zero.
  var CONFIDENCE_TEXT = {
    HIGH:              { ar: 'الثقة: مرتفعة', en: 'Confidence: high',   cls: 'conf-high' },
    MEDIUM:            { ar: 'الثقة: متوسطة', en: 'Confidence: medium', cls: 'conf-medium' },
    LOW:               { ar: 'الثقة: منخفضة', en: 'Confidence: low',    cls: '' },
    INSUFFICIENT_DATA: { ar: 'لا تزال البيانات قيد التجميع', en: 'Still collecting data', cls: 'conf-collecting' }
  };

  var STAGE_LABELS = {
    impressions:        { ar: 'مرات الظهور',            en: 'Impressions' },
    reach:              { ar: 'الوصول',                 en: 'Reach' },
    link_clicks:        { ar: 'النقرات على الرابط',     en: 'Link clicks' },
    conversations:      { ar: 'المحادثات',              en: 'Conversations' },
    landing_page_views: { ar: 'مشاهدات صفحة الهبوط',   en: 'Landing page views' },
    leads:              { ar: 'العملاء المحتملون',      en: 'Leads' },
    purchases:          { ar: 'المشتريات',              en: 'Purchases' },
    interactions:       { ar: 'التفاعلات',              en: 'Interactions' },
    installs:           { ar: 'التثبيتات',              en: 'Installs' }
  };

  var FACET_LABELS = {
    primaryResult: { ar: 'النتيجة الأساسية', en: 'Primary result' },
    funnelHealth:  { ar: 'صحة المسار',       en: 'Funnel health' },
    efficiency:    { ar: 'الكفاءة',           en: 'Efficiency' },
    delivery:      { ar: 'التسليم',           en: 'Delivery' }
  };

  var BAND_LABELS = {
    critical: { ar: 'حرجة',   en: 'critical' },
    poor:     { ar: 'ضعيفة',  en: 'poor' },
    fair:     { ar: 'مقبولة', en: 'fair' },
    good:     { ar: 'جيدة',   en: 'good' },
    great:    { ar: 'ممتازة', en: 'great' },
    excellent:{ ar: 'ممتازة', en: 'excellent' }
  };

  function txt(entry, fallback) {
    if (!entry) return fallback || '';
    return isAr ? entry.ar : (entry.en || entry.ar);
  }
  function fmtCount(n) {
    return (n == null || !isFinite(Number(n))) ? '—' : Number(n).toLocaleString('en-US');
  }
  /** DTO ratio → percentage string. Formatting, not calculation. */
  function fmtRatio(r) {
    return (r == null || !isFinite(Number(r))) ? '—' : (Number(r) * 100).toFixed(1) + '%';
  }
  function evidenceList(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.map(function (e) { return String(e || '').trim(); }).filter(Boolean);
    var one = String(value).trim();
    return one ? [one] : [];
  }
  function stepHtml(kind, ord, label, leadHtml, bodyHtml) {
    return '<li class="ai-step ai-step--' + kind + '">'
      + '<div class="ai-step-label"><span class="ai-step-ord">' + ord + '</span>' + esc(label) + '</div>'
      + (leadHtml ? '<div class="ai-step-lead">' + leadHtml + '</div>' : '')
      + (bodyHtml || '')
      + '</li>';
  }

  /** Per-unit results. Different units are never added together. */
  function unitsHtml(rb) {
    if (!rb || !Array.isArray(rb.byUnit) || !rb.byUnit.length) return '';
    var chips = rb.byUnit.map(function (u) {
      return '<span class="ai-unit"><b>' + esc(fmtCount(u.count)) + '</b><span>'
        + esc(isAr ? (u.labelAr || u.unit || '') : (u.labelEn || u.unit || '')) + '</span>'
        + (u.approximate ? '<span class="ai-approx">' + (isAr ? 'تقريبي' : 'approx.') + '</span>' : '')
        + '</span>';
    }).join('');
    var note = rb.mixed
      ? '<div class="ai-mixed-note">' + esc(isAr
          ? 'حسابك يشغّل أهدافاً مختلفة. كل نوع نتيجة معروض على حدة — جمعها لا يعطي رقماً له معنى.'
          : 'This account runs different objectives. Each result unit is shown separately; adding them would not be a quantity.') + '</div>'
      : '';
    return '<div class="ai-units">' + chips + '</div>' + note;
  }

  function stagesHtml(funnel) {
    if (!funnel || !funnel.stages || !Array.isArray(funnel.stages.current) || !funnel.stages.current.length) return '';
    var broke = funnel.degradedStage;
    var rows = funnel.stages.current.map(function (s, i) {
      var label = txt(STAGE_LABELS[s.stageKey], s.stageKey);
      // The ratio on a row is the ratio INTO it from the row above. The first
      // stage has no row above it, so it has no ratio — that is NOT the same
      // as a withheld one. Printing "still collecting" against impressions
      // told the merchant data was missing when nothing was missing at all.
      var ratio = '';
      if (i > 0) {
        ratio = (s.status === 'OK' && s.ratioFromPrevious != null)
          ? fmtRatio(s.ratioFromPrevious)
          : (isAr ? 'لا تزال البيانات قيد التجميع' : 'still collecting');
      }
      return '<div class="ai-stage-row' + (broke && s.stageKey === broke ? ' is-break' : '') + '">'
        + '<span>' + esc(label)
        + (s.approximate ? ' <span class="ai-approx">' + (isAr ? 'تقريبي' : 'approx.') + '</span>' : '')
        + '</span>'
        + '<span><span class="ai-stage-count">' + esc(fmtCount(s.count)) + '</span>'
        + (ratio ? ' <span class="ai-stage-ratio">' + esc(ratio) + '</span>' : '')
        + '</span>'
        + '</div>';
    }).join('');
    return '<div class="ai-step-body">' + rows + '</div>';
  }

  function facetsHtml(health) {
    if (!health || !Array.isArray(health.facets) || !health.facets.length) return '';
    var items = health.facets.map(function (f) {
      var label = txt(FACET_LABELS[f.key], f.key);
      if (!f.applicable) {
        // NOT_APPLICABLE, not zero and not missing. The engine already
        // supplies the reason in its own words; only fall back to a generic
        // phrase when it does not, rather than printing both.
        return '<li class="is-na"><b>' + esc(label) + '</b> — '
          + esc(f.evidence || (isAr ? 'لا ينطبق على هذا الهدف' : 'not applicable to this objective'))
          + '</li>';
      }
      return '<li><b>' + esc(label) + '</b>' + (f.evidence ? ' — ' + esc(f.evidence) : '') + '</li>';
    }).join('');
    return '<ul class="ai-step-list">' + items + '</ul>';
  }

  /**
   * Render the four-step briefing. When the DTO carries no diagnosis the
   * section says so plainly instead of inventing a narrative.
   */
  function renderBrief(d) {
    var host = document.getElementById('ai-brief-body');
    var confEl = document.getElementById('ai-brief-conf');
    if (!host) return;
    var intel = d && d.intelligence;
    var funnel = d && d.funnel;
    var rb = d && d.resultBreakdown;

    if (!intel && !rb) {
      confEl.style.display = 'none';
      host.innerHTML = '<div class="ai-brief-empty">' + esc(isAr
        ? 'لا يوجد تحليل محسوب لهذه المساحة بعد. اربط حساب Meta وانتظر أول مزامنة، ثم سيظهر هنا ما حدث ولماذا وما الأثر وما الإجراء.'
        : 'No computed analysis for this workspace yet. Connect Meta and wait for the first sync.') + '</div>';
      return;
    }

    var conf = intel && CONFIDENCE_TEXT[String(intel.confidence || '').toUpperCase()];
    if (conf) {
      confEl.textContent = txt(conf, '');
      confEl.className = 'ai-conf ' + (conf.cls || '');
      confEl.style.display = 'inline-flex';
    } else {
      confEl.style.display = 'none';
    }

    var steps = [];

    // ── 1 · WHAT HAPPENED ──────────────────────────────────────────────
    var whatLead = '';
    var whatBody = '';
    if (rb) {
      whatLead = esc(isAr ? 'نتائج حسابك في الفترة' : 'Results in the period');
      whatBody += unitsHtml(rb);
    }
    var whatEvidence = intel ? evidenceList(intel.evidence) : [];
    if (whatEvidence.length) {
      whatBody += '<ul class="ai-step-list">' + whatEvidence.map(function (e) {
        return '<li>' + esc(e) + '</li>';
      }).join('') + '</ul>';
    }
    if (!whatLead && !whatBody) {
      whatBody = '<div class="ai-step-body">' + esc(isAr ? 'لا تزال البيانات قيد التجميع.' : 'Still collecting data.') + '</div>';
    }
    steps.push(stepHtml('what', '١', isAr ? 'ماذا حدث' : 'What happened', whatLead, whatBody));

    // ── 2 · WHY ────────────────────────────────────────────────────────
    var whyLead = intel
      ? esc(txt(PROBLEM_HEADLINE[intel.problemClass], intel.problemClass || ''))
      : '';
    var whyBody = '';
    if (funnel && funnel.degradedStage) {
      whyBody += '<div class="ai-step-body">' + esc(
        (isAr ? 'أول حلقة تنكسر في المسار: ' : 'First break in the funnel: ')
        + txt(STAGE_LABELS[funnel.degradedStage], funnel.degradedStage)) + '</div>';
    }
    whyBody += stagesHtml(funnel);
    if (funnel && funnel.approximateInvolved) {
      whyBody += '<div class="ai-mixed-note">' + esc(isAr
        ? 'يعتمد جزء من هذا التشخيص على مؤشر تقريبي — تعامل معه كإشارة لا كحقيقة.'
        : 'Part of this diagnosis rests on an approximate metric — treat it as a signal.') + '</div>';
    }
    if (!whyLead && !whyBody) {
      whyBody = '<div class="ai-step-body">' + esc(isAr ? 'لا يوجد تشخيص محسوب بعد.' : 'No computed diagnosis yet.') + '</div>';
    }
    steps.push(stepHtml('why', '٢', isAr ? 'لماذا' : 'Why', whyLead, whyBody));

    // ── 3 · IMPACT ─────────────────────────────────────────────────────
    var health = intel && intel.health;
    var impactLead = '';
    var impactBody = '';
    if (health && health.score != null) {
      impactLead = esc(String(health.score) + '/100')
        + ' <span style="font-size:13px;color:var(--text-2);font-weight:600;">'
        + esc(txt(BAND_LABELS[String(health.band || '').toLowerCase()], String(health.band || ''))) + '</span>';
      impactBody += facetsHtml(health);
    } else if (health) {
      impactBody = '<div class="ai-step-body">' + esc(isAr
        ? 'لم نتمكن من تحديد هدف الحساب — لا نُصدر تقييماً مُخمّناً.'
        : 'Objective unresolved — no guessed score is issued.') + '</div>';
    } else {
      impactBody = '<div class="ai-step-body">' + esc(isAr ? 'لا تزال البيانات قيد التجميع.' : 'Still collecting data.') + '</div>';
    }
    steps.push(stepHtml('impact', '٣', isAr ? 'الأثر' : 'Impact', impactLead, impactBody));

    // ── 4 · WHAT TO DO ─────────────────────────────────────────────────
    var rec = intel && intel.recommendation;
    var doLead = '';
    var doBody = '';
    if (rec) {
      doLead = esc(rec.action || '');
      if (rec.problem) doBody += '<div class="ai-step-body">' + esc(rec.problem) + '</div>';
      if (rec.expectedImpact) {
        doBody += '<div class="ai-step-body">' + esc((isAr ? 'المتوقع: ' : 'Expected: ') + rec.expectedImpact) + '</div>';
      }
      var rConf = CONFIDENCE_TEXT[String(rec.confidence || '').toUpperCase()];
      if (rConf) doBody += '<div class="ai-step-body">' + esc(txt(rConf, '')) + '</div>';
    } else if (intel && !intel.alert) {
      doBody = '<div class="ai-step-body">' + esc(isAr
        ? 'الانخفاض حقيقي لكنه ضمن التقلب الطبيعي لهذا الحساب — لا إجراء عاجل.'
        : 'The dip is real but within this account\\'s normal variation — no urgent action.') + '</div>';
    } else {
      doBody = '<div class="ai-step-body">' + esc(isAr
        ? 'لا يوجد إجراء موصى به مرفق بالتحليل. اسأل المساعد أدناه لشرح الوضع.'
        : 'No recommended action is attached. Ask the assistant below.') + '</div>';
    }
    doBody += '<div class="ai-brief-cta">'
      + '<a class="btn btn-secondary btn-sm" href="/recommendations">' + esc(isAr ? 'كل التوصيات' : 'All recommendations') + '</a>'
      + '</div>';
    steps.push(stepHtml('do', '٤', isAr ? 'ماذا تفعل' : 'What to do', doLead, doBody));

    host.innerHTML = '<ol class="ai-steps">' + steps.join('') + '</ol>';
  }

  try {
    dashData = await apiFetch('/api/dashboard/' + wsId);
    if (dashData) { renderContextChips(dashData); renderBrief(dashData); }
  } catch(e) {
    document.getElementById('context-chips').innerHTML = '<span style="font-size:12px;color:var(--text-3);">' +
      (isAr ? 'لا توجد بيانات محمّلة' : 'No data loaded') + '</span>';
    document.getElementById('ai-brief-body').innerHTML = '<div class="ai-brief-empty">' +
      esc(isAr ? 'تعذّر تحميل التحليل المحسوب.' : 'Could not load the computed analysis.') + '</div>';
  }

  /** When a reply came back offline, ask the server's live AI self-test WHY
   *  and print the verdict under the reply — the exact cause (missing key on
   *  this service, dead key, retired model, no credits) with zero log access. */
  function appendAiHealthDiagnosis(metaBar) {
    if (!metaBar) return;
    apiFetchWithTimeout('/api/health/ai', {}, 15000).then(function (h) {
      if (!h || h.ok) return; // ok=true means the outage was transient — nothing to explain
      var parts = [];
      if (h.reasonAr) parts.push(h.reasonAr);
      if (h.anthropicKeyPresent === false && h.openaiKeyPresent === false) {
        parts.push(isAr ? '(لم يُعثر على أي مفتاح على خدمة الويب)' : '(no AI key found on the web service)');
      }
      if (!parts.length) return;
      var div = document.createElement('div');
      div.className = 'evidence-pill';
      div.style.cssText = 'display:block;margin-top:6px;white-space:normal;color:var(--warning,#e8a33d);';
      div.innerHTML = '<b>' + (isAr ? 'فحص الخادم' : 'Server check') + '</b> ' + esc(parts.join(' '));
      metaBar.appendChild(div);
    }).catch(function () { /* diagnosis is best-effort */ });
  }

  /** Short human label for WHY the cloud model was skipped — so the merchant
   *  (and support) can tell a credits problem from a setup problem at a
   *  glance instead of guessing from a generic "offline" tag. */
  function offlineReasonLabel(code) {
    var map = {
      AI_CREDITS_EXHAUSTED: isAr ? 'نفاد رصيد مزوّد الذكاء' : 'AI provider credits exhausted',
      AI_RATE_LIMITED: isAr ? 'ضغط طلبات مؤقت' : 'Temporary rate limit',
      AI_AUTH_FAILED: isAr ? 'مشكلة إعداد المفتاح أو الموديل على الخادم' : 'Server key/model configuration issue',
      AI_TIMEOUT: isAr ? 'انتهت مهلة الرد' : 'Response timed out',
      AI_UNAVAILABLE: isAr ? 'انقطاع مؤقت لدى المزوّد' : 'Provider temporarily unavailable'
    };
    return map[code] || '';
  }

  function renderContextChips(d) {
    const out = [];
    function textChip(t) { return '<span class="data-chip">' + esc(t) + '</span>'; }
    function htmlChip(inner) { return '<span class="data-chip">' + inner + '</span>'; }
    // Isolate each number with <bdi> so it stays glued to its OWN label. In an
    // RTL string, Western digits + "·" separators can visually reorder (the
    // Unicode bidi algorithm), making a count appear next to the wrong word —
    // e.g. "13 dormant" reading as "13 today". Numbers are coerced with Number()
    // so nothing but a numeric literal is ever inlined.
    function num(v) { return '<bdi>' + (v != null ? String(Number(v)) : '—') + '</bdi>'; }

    // NOTE — dashData.health is deliberately NOT rendered here.
    //
    // The DTO ships two account health scores: the legacy top-level one and
    // the objective-aware intelligence.health, and on the audit fixture they
    // disagree (51 "attention" vs 38 "critical"). Showing
    // both on one screen asks the merchant to pick which number about their
    // own account is true. The briefing above shows the objective-aware one —
    // the one that carries facets, applicability and a confidence — and this
    // chip row no longer contradicts it. Reported as a DTO gap.
    const cc = d.workspace && d.workspace.campaignCounts;
    if (cc) {
      out.push(htmlChip(
        num(cc.deliveringInWindow) + ' ' + esc(isAr ? 'تعمل' : 'delivering') + ' · ' +
        num(cc.spendingToday) + ' ' + esc(isAr ? 'اليوم' : 'today') + ' · ' +
        num(cc.dormantActive) + ' ' + esc(isAr ? 'بدون إنفاق' : 'dormant')
      ));
    } else if (d.workspace && d.workspace.activeCampaigns != null) {
      out.push(htmlChip(num(d.workspace.activeCampaigns) + ' ' + esc(isAr ? 'تعمل' : 'delivering')));
    }
    if (d.issues && d.issues.length) {
      out.push(textChip(d.issues.length + (isAr ? ' ملاحظة' : ' issue' + (d.issues.length > 1 ? 's' : ''))));
    }
    if (d.workspace && d.workspace.lastSyncedAt) {
      out.push(textChip((isAr ? 'آخر مزامنة ' : 'Synced ') + new Date(d.workspace.lastSyncedAt).toLocaleString(isAr ? 'ar' : 'en')));
    }
    document.getElementById('context-chips').innerHTML = out.length
      ? out.join('')
      : '<span style="font-size:12px;color:var(--text-3);">' + (isAr ? 'لا توجد بيانات حملات بعد' : 'No campaign data yet') + '</span>';
  }

  var TOOL_LABELS = {
    list_campaigns:            { ar: 'قائمة الحملات',        en: 'Campaign list' },
    get_campaign_details:      { ar: 'تفاصيل الحملة',        en: 'Campaign details' },
    rank_campaigns:            { ar: 'ترتيب الحملات',        en: 'Ranking' },
    compare_periods:           { ar: 'مقارنة فترات',         en: 'Period comparison' },
    detect_anomaly:            { ar: 'كشف شذوذ',            en: 'Anomaly check' },
    get_audience_breakdown:    { ar: 'تحليل الجمهور',        en: 'Audience breakdown' },
    get_creative_performance:  { ar: 'أداء الإعلانات',       en: 'Creative performance' },
    lookup_knowledge:          { ar: 'مرجع Meta',            en: 'Knowledge lookup' },
    get_hourly_pattern:        { ar: 'نمط الساعات',          en: 'Hourly pattern' },
    find_similar_campaigns:    { ar: 'حملات مشابهة',         en: 'Similar campaigns' },
    simulate_budget_shift:     { ar: 'محاكاة ميزانية',       en: 'Budget simulation' },
    check_suspicious_activity: { ar: 'فحص أمني',            en: 'Security check' },
    save_recommendation:       { ar: 'حفظ توصية',           en: 'Saved recommendation' },
    check_pixel_health:        { ar: 'صحة التتبّع',          en: 'Pixel health' },
  };

  function toolLabel(name) {
    var entry = TOOL_LABELS[name];
    if (!entry) return name;
    return isAr ? entry.ar : entry.en;
  }

  function renderToolChips(msgWrapperEl, toolCalls) {
    if (!toolCalls || !toolCalls.length) return;
    var bubble = msgWrapperEl.querySelector('.msg-bubble');
    if (!bubble) return;
    var row = document.createElement('div');
    row.className = 'tool-chips';
    toolCalls.forEach(function (tc) {
      var chip = document.createElement('span');
      chip.className = 'tool-chip';
      chip.textContent = (tc.ok === false ? '⚠ ' : '✓ ') + toolLabel(tc.toolName);
      row.appendChild(chip);
    });
    var evidence = document.createElement('div');
    evidence.className = 'evidence-bar';
    evidence.innerHTML =
      '<span class="evidence-pill"><b>' + (isAr ? 'الأدلة' : 'Evidence') + '</b> ' +
      toolCalls.length + (isAr ? ' مصدر بيانات' : ' data sources') + '</span>' +
      '<span class="evidence-pill"><b>' + (isAr ? 'الترتيب' : 'Order') + '</b> ' +
      (isAr ? 'ماذا حدث → لماذا → الأثر → ماذا تفعل' : 'What happened → Why → Impact → What to do') + '</span>';
    bubble.appendChild(row);
    bubble.appendChild(evidence);
  }

  /**
   * Every assistant reply gets the same footer: the computed briefing is the
   * source of record for numbers. The AI explains it; it does not measure.
   */
  function appendSourceOfTruthPill(bubble) {
    if (!bubble) return;
    var bar = bubble.querySelector('.evidence-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'evidence-bar';
      bubble.appendChild(bar);
    }
    var pill = document.createElement('span');
    pill.className = 'evidence-pill';
    pill.innerHTML = '<b>' + (isAr ? 'مرجع الأرقام' : 'Numbers') + '</b> ' +
      esc(isAr ? 'الملخص المحسوب في أعلى الصفحة' : 'the computed briefing above');
    bar.appendChild(pill);
    return bar;
  }

  function addMsg(role, html) {
    const div = document.createElement('div');
    div.className = 'msg ' + role;
    const initial = role === 'user' ? userInitial : 'AI';
    div.innerHTML =
      '<div class="msg-avatar" aria-hidden="true">' + initial + '</div>' +
      '<div class="msg-bubble" dir="auto">' + html + '</div>';
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return div;
  }

  function addTyping() {
    return addMsg('assistant', '<span class="typing-dots"><span>●</span><span>●</span><span>●</span></span>');
  }

  // Recognized section labels — the headers aiOfflineReply.ts always emits
  // (## الوضع / ## الدليل / التشخيص / ## التوصية…), the labels the live
  // model's system prompt prefers, and the four-step wording this page leads
  // with. Prefix-matched since labels can carry a suffix.
  var THREAD_LABEL_RE = /^(?:ماذا حدث|لماذا|الأثر|ماذا تفعل|الوضع|الدليل|التشخيص|التوصية|متى تراجع|الثقة|المتابعة|What happened|Why|Impact|What to do|Situation|Evidence|Diagnosis|Recommendation|Confidence|Follow-up)/;
  var ACTION_LABEL_RE = /^(?:التوصية|ماذا تفعل|Recommendation|What to do)/;

  // Re-render a reply's labelled sections as the golden thread (see .thread
  // in layout.ts) instead of plain bold-then-paragraph. Best-effort: only
  // transforms a RUN of 2+ consecutive recognized-label paragraphs, and
  // leaves everything else — single labels, prose, bullet lists, anything
  // the live model phrases differently — completely untouched. Never
  // invents structure the reply doesn't already have.
  function applyThreadFormatting(html) {
    try {
      var parts = String(html || '').split(/(<p>[\\s\\S]*?<\\/p>)/g);
      var out = [];
      var run = []; // { raw, step } — step only valid once .thread wraps it
      function flushRun() {
        if (run.length >= 2) {
          out.push('<div class="thread"><div class="thread-steps">' + run.map(function (r) { return r.step; }).join('') + '</div></div>');
        } else {
          // A lone matched label has no .thread ancestor to supply the
          // indent its dot is positioned against — render it as the plain
          // paragraph it already was rather than an orphaned, misaligned dot.
          run.forEach(function (r) { out.push(r.raw); });
        }
        run = [];
      }
      parts.forEach(function (part) {
        if (!part) return;
        var m = /^<p><strong>([^<]+)<\\/strong>\\s*([\\s\\S]*?)<\\/p>$/.exec(part);
        if (m && THREAD_LABEL_RE.test(m[1])) {
          var isAction = ACTION_LABEL_RE.test(m[1]);
          run.push({
            raw: part,
            step: '<div class="thread-step' + (isAction ? ' thread-step--action' : '') + '">'
              + '<div class="thread-step-label">' + m[1] + '</div>'
              + m[2]
              + '</div>',
          });
        } else {
          flushRun();
          out.push(part);
        }
      });
      flushRun();
      return out.join('');
    } catch (e) {
      return html;
    }
  }

  // Built from a code point so no backtick literal ever enters this bundle.
  var CODE_SPAN_RE = new RegExp('\\u0060(.+?)\\u0060', 'g');

  function mdToHtml(text) {
    return String(text || '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/\\*\\*(.+?)\\*\\*/g,'<strong>$1</strong>')
      .replace(/\\*(.+?)\\*/g,'<em>$1</em>')
      .replace(CODE_SPAN_RE,'<code>$1</code>')
      .replace(/^### (.+)$/gm,'<strong>$1</strong>')
      .replace(/^## (.+)$/gm,'<strong>$1</strong>')
      .replace(/^# (.+)$/gm,'<strong>$1</strong>')
      .replace(/^[•\\-] (.+)$/gm,'<li>$1</li>')
      .replace(/(<li>.*<\\/li>)/gs, '<ul>$1</ul>')
      .replace(/\\n\\n/g,'</p><p>')
      .replace(/^(?!<[ul])/,'<p>').replace(/(?<![>])$/,'</p>');
  }

  const welcomeText = dashData
    ? (isAr
        ? 'الملخص المحسوب فوق هذه المحادثة يجيب على أربعة أسئلة بالترتيب: <strong>ماذا حدث → لماذا → الأثر → ماذا تفعل</strong>.' +
          '<br><br>اسألني لأشرح أي خطوة منه بلغة أبسط، أو لأقارن حملة بأخرى.' +
          '<br><br><em>جرّب: «ما الذي أنصح به الآن؟» أو «لماذا انخفض تفاعل إعلاناتي؟»</em>'
        : 'The computed briefing above answers four questions in order: <strong>What happened → Why → Impact → What to do</strong>.' +
          '<br><br>Ask me to explain any step in plainer language.' +
          '<br><br><em>Try: "What should I do next?"</em>')
    : (isAr
        ? 'مرحباً — أنا مساعد Adlytic. اربط حملاتك ليظهر التحليل المحسوب، ثم اسألني لأشرحه.'
        : 'Hello — I\\'m Adlytic AI. Connect campaigns to get the computed analysis, then ask me to explain it.');
  addMsg('assistant', welcomeText);

  async function sendMessage(question) {
    if (sending || !question.trim()) return;
    sending = true;
    sendBtn.disabled = true;

    addMsg('user', esc(question));
    const typingEl = addTyping();

    try {
      let res = null;
      let usedV2 = false;
      try {
        res = await apiFetch('/api/workspaces/' + wsId + '/ai/chat/v2', {
          method: 'POST',
          body: JSON.stringify({
            message: question,
            conversationId: conversationId || undefined,
          }),
        });
        usedV2 = true;
      } catch (v2err) {
        if (v2err && v2err.code === 'V2_DISABLED') {
          res = await apiFetch('/api/workspaces/' + wsId + '/ai/chat', {
            method: 'POST',
            body: JSON.stringify({ message: question }),
          });
        } else {
          throw v2err;
        }
      }

      typingEl.remove();
      const answer = res && res.reply && String(res.reply).trim()
        ? res.reply
        : (isAr
          ? 'راجعت البيانات لكن الرد لم يكتمل. أعد السؤال أو اختر حملة واحدة محددة.'
          : 'I reviewed the data but the answer did not complete. Retry or ask about one specific campaign.');
      const bubbleWrapper = addMsg('assistant', applyThreadFormatting(mdToHtml(answer)));
      var bubbleEl = bubbleWrapper.querySelector('.msg-bubble');
      if (usedV2 && res) {
        if (res.conversationId) conversationId = res.conversationId;
        renderToolChips(bubbleWrapper, res.toolCalls);
        if (bubbleEl) {
          var metaBar = bubbleEl.querySelector('.evidence-bar');
          if (!metaBar) {
            metaBar = document.createElement('div');
            metaBar.className = 'evidence-bar';
            bubbleEl.appendChild(metaBar);
          }
          var pills = '';
          if (res.usedOffline) {
            pills += '<span class="evidence-pill"><b>' + (isAr ? 'المصدر' : 'Source') + '</b> ' +
              (isAr ? 'تشخيص الحساب (بدون نموذج سحابي)' : 'Account diagnosis (offline)') + '</span>';
            var reason = offlineReasonLabel(res.code);
            if (reason) {
              pills += '<span class="evidence-pill"><b>' + (isAr ? 'السبب' : 'Reason') + '</b> ' + esc(reason) + '</span>';
            }
            appendAiHealthDiagnosis(metaBar);
          }
          if (res.latencyMs != null) {
            pills += '<span class="evidence-pill"><b>' + (isAr ? 'الوقت' : 'Latency') + '</b> ' +
              Math.round(Number(res.latencyMs) / 100) / 10 + (isAr ? ' ث' : 's') + '</span>';
          }
          if (pills) metaBar.insertAdjacentHTML('beforeend', pills);
        }
      } else if (bubbleEl) {
        var evidence = document.createElement('div');
        evidence.className = 'evidence-bar';
        var srcLabel = (res && res.usedOffline)
          ? (isAr ? 'تشخيص الحساب (بدون نموذج سحابي)' : 'Account diagnosis (offline)')
          : (isAr ? 'بيانات لوحة التحكم الحية' : 'Live dashboard context');
        evidence.innerHTML = '<span class="evidence-pill"><b>' + (isAr ? 'المصدر' : 'Source') + '</b> ' +
          srcLabel + '</span>';
        bubbleEl.appendChild(evidence);
      }
      appendSourceOfTruthPill(bubbleEl);
    } catch(e) {
      typingEl.remove();
      var friendly = (typeof friendlyApiError === 'function')
        ? friendlyApiError(e)
        : (e && e.message) || (isAr ? 'فشل الطلب' : 'Request failed');
      addMsg('assistant', '<span style="color:var(--error);">' + esc(friendly) + '</span>');
    } finally {
      sending = false;
      sendBtn.disabled = false;
    }
  }

  function submitCurrent() {
    const q = inputEl.value.trim();
    if (!q) return;
    inputEl.value = '';
    inputEl.style.height = 'auto';
    sendMessage(q);
  }

  sendBtn.addEventListener('click', submitCurrent);

  inputEl.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitCurrent();
    }
  });

  inputEl.addEventListener('input', () => {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
  });

  // On a phone the software keyboard covers the lower third of the screen.
  // Pull the composer into the visible band rather than leaving the merchant
  // typing behind the keyboard.
  inputEl.addEventListener('focus', function () {
    setTimeout(function () {
      try { inputEl.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) {}
    }, 220);
  });

  document.getElementById('suggestions').addEventListener('click', e => {
    const chip = e.target.closest('.suggested-chip');
    if (!chip) return;
    const q = (chip.textContent || '').trim();
    if (q) sendMessage(q);
  });

  document.getElementById('clear-btn').addEventListener('click', () => {
    messagesEl.innerHTML = '';
    conversationId = null;
    addMsg('assistant', isAr
      ? 'تم مسح المحادثة. الملخص المحسوب فوق ما زال كما هو — اسأل عنه في أي وقت.'
      : 'Chat cleared. The computed briefing above is unchanged — ask about it any time.');
  });

  const prefillQ = new URLSearchParams(window.location.search).get('q');
  if (prefillQ && prefillQ.trim()) {
    window.history.replaceState({}, '', '/ai');
    sendMessage(prefillQ.trim());
  }
  } catch (err) {
    console.error('[ai-init] fatal init error:', err);
    var __cc = document.getElementById('context-chips');
    if (__cc) __cc.innerHTML = '<span style="font-size:12px;color:var(--error);">Init error: ' + esc((err && err.message) || err) + '</span>';
  }
})();
</script>`;

  return layout({ title: 'المساعد الذكي', active: 'ai', content, scripts });
}
