// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/aiPage.ts  —  AI Assistant (global-standard CMO UX)
// ════════════════════════════════════════════════════════════════════════

import { layout } from '../layout';

export function aiPage(): string {
  const content = `
<style>
  .ai-page { direction: rtl; max-width: 1120px; margin: 0 auto; }
  .ai-hero {
    display: flex; align-items: flex-start; justify-content: space-between; gap: 16px;
    margin-bottom: 18px; flex-wrap: wrap;
  }
  .ai-hero-title { font-size: 22px; font-weight: 800; color: var(--text); letter-spacing: -0.02em; }
  .ai-hero-sub { font-size: 13px; color: var(--text-2); margin-top: 4px; line-height: 1.5; max-width: 520px; }
  .ai-method-row {
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px;
  }
  @media (max-width: 900px) { .ai-method-row { grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 520px) { .ai-method-row { grid-template-columns: 1fr; } }
  .ai-method-card {
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg);
    padding: 12px 14px;
  }
  .ai-method-step { font-size: 10px; font-weight: 700; color: var(--accent-2); letter-spacing: 0.06em; margin-bottom: 4px; }
  .ai-method-label { font-size: 13px; font-weight: 700; color: var(--text); }
  .ai-method-desc { font-size: 11.5px; color: var(--text-3); margin-top: 3px; line-height: 1.45; }

  .chat-shell { display:flex; gap:18px; height:calc(100vh - var(--topbar-h) - 220px); min-height:480px; }
  .chat-sidebar { width:280px; flex-shrink:0; display:flex; flex-direction:column; gap:12px; overflow-y:auto; }
  .chat-main {
    flex:1; display:flex; flex-direction:column; background:var(--surface);
    border:1px solid var(--border); border-radius:var(--radius-lg); overflow:hidden;
    box-shadow: 0 8px 28px rgba(0,0,0,0.18);
  }
  .chat-header {
    padding:14px 18px; border-bottom:1px solid var(--border);
    display:flex; align-items:center; gap:12px;
    background: linear-gradient(135deg, rgba(217,167,89,0.08), transparent);
  }
  .chat-header-dot { width:8px;height:8px;background:var(--success);border-radius:50%;animation:pulse 2s infinite; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
  .chat-messages { flex:1; overflow-y:auto; padding:20px; display:flex; flex-direction:column; gap:16px; }
  .chat-messages::-webkit-scrollbar { width:4px; }
  .chat-messages::-webkit-scrollbar-thumb { background:var(--border-2); border-radius:2px; }
  .msg { display:flex; gap:10px; max-width:88%; }
  .msg.user { align-self:flex-start; }
  .msg.assistant { align-self:stretch; max-width:100%; }
  .msg-avatar {
    width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;
    font-size:11px;font-weight:800;flex-shrink:0;
  }
  .msg.assistant .msg-avatar {
    background: linear-gradient(135deg, var(--accent), var(--accent-2)); color:#1A1613;
  }
  .msg.user .msg-avatar { background:var(--surface-2); color:var(--text-2); border:1px solid var(--border); }
  .msg-bubble { padding:12px 15px; border-radius:14px; font-size:13.5px; line-height:1.7; }
  .msg.assistant .msg-bubble {
    background: rgba(255,255,255,0.03); color:var(--text);
    border:1px solid var(--border); border-inline-start: 3px solid var(--accent);
  }
  .msg.user .msg-bubble { background:var(--accent-dim); color:var(--text); border:1px solid rgba(217,167,89,0.25); }
  .msg-bubble p { margin:0 0 8px; }
  .msg-bubble p:last-child { margin-bottom:0; }
  .msg-bubble ul { margin:6px 0 6px 16px; }
  .msg-bubble li { margin-bottom:3px; }
  .msg-bubble strong { font-weight:700; color: var(--accent-2); }
  .msg-bubble code { background:rgba(255,255,255,0.08); padding:1px 5px; border-radius:3px; font-family:monospace; font-size:12px; }
  .chat-input-area { padding:14px 16px; border-top:1px solid var(--border); background: rgba(0,0,0,0.12); }
  .chat-input-row { display:flex; gap:8px; align-items:flex-end; }
  .chat-input {
    flex:1; background:var(--surface-2); border:1px solid var(--border);
    border-radius:12px; padding:11px 14px; color:var(--text);
    font-size:13.5px; font-family:inherit; resize:none; outline:none;
    transition:border-color var(--transition); min-height:44px; max-height:120px;
  }
  .chat-input:focus { border-color:var(--accent); }
  .chat-input::placeholder { color:var(--text-3); }
  .chat-send-btn {
    width:42px;height:42px;background:linear-gradient(135deg, var(--accent), var(--accent-2));
    border:none;border-radius:12px;color:#1A1613;cursor:pointer;display:flex;align-items:center;
    justify-content:center;flex-shrink:0;font-weight:800;
  }
  .chat-send-btn:disabled { opacity:0.4;cursor:not-allowed; }
  .suggested-card {
    background:var(--surface); border:1px solid var(--border); border-radius:12px;
    padding:12px 14px; cursor:pointer; transition: border-color 0.15s, background 0.15s;
  }
  .suggested-card:hover { background:var(--surface-2); border-color: rgba(217,167,89,0.35); }
  .suggested-label { font-size:10px;font-weight:700;color:var(--accent-2);letter-spacing:.04em;margin-bottom:4px; }
  .suggested-text { font-size:12.5px;color:var(--text-2);line-height:1.45; }
  .typing-dots span { animation:blink 1.4s infinite; display:inline-block; }
  .typing-dots span:nth-child(2) { animation-delay:0.2s; }
  .typing-dots span:nth-child(3) { animation-delay:0.4s; }
  @keyframes blink { 0%,80%,100%{opacity:0} 40%{opacity:1} }
  .data-chip {
    display:inline-flex;align-items:center;gap:4px;padding:4px 9px;
    background:rgba(217,167,89,0.1);color:var(--accent-2);border:1px solid rgba(217,167,89,0.22);
    border-radius:999px;font-size:11px;font-weight:600;margin:2px;
  }
  .tool-chips { display:flex; flex-wrap:wrap; gap:5px; margin-top:8px; }
  .tool-chip {
    display:inline-flex; align-items:center; gap:4px; padding:3px 8px;
    background:var(--surface-2); border:1px solid var(--border); color:var(--text-3);
    border-radius:999px; font-size:10.5px;
  }
  .evidence-bar {
    display:flex; flex-wrap:wrap; gap:6px; margin-top:10px; padding-top:8px;
    border-top:1px dashed var(--border);
  }
  .evidence-pill {
    font-size:10.5px; padding:3px 8px; border-radius:999px;
    background: rgba(255,255,255,0.04); border:1px solid var(--border); color:var(--text-3);
  }
  .evidence-pill b { color: var(--text-2); font-weight: 600; }
  .ai-side-card {
    background:var(--surface); border:1px solid var(--border); border-radius:var(--radius-lg); padding:14px;
  }
  .ai-side-title { font-size:12px; font-weight:700; color:var(--text); margin-bottom:10px; }

  @media (max-width: 768px) {
    .chat-shell { flex-direction:column; height:auto; min-height:420px; }
    .chat-sidebar { width:100%; max-height:160px; overflow-x:auto; overflow-y:hidden; flex-direction:row; }
    .chat-sidebar .ai-side-card { min-width:220px; flex-shrink:0; }
    .chat-main { min-height:420px; }
  }
</style>

<div class="ai-page">
  <div class="ai-hero">
    <div>
      <div class="ai-hero-title">المساعد الذكي</div>
      <div class="ai-hero-sub">تحليل وفق معايير مديري التسويق العالميين: دليل رقمي → تشخيص → توصية واحدة واضحة مع مستوى ثقة</div>
    </div>
    <button class="btn btn-secondary btn-sm" id="clear-btn">مسح المحادثة</button>
  </div>

  <div class="ai-method-row" id="ai-method-row">
    <div class="ai-method-card"><div class="ai-method-step">01</div><div class="ai-method-label">الوضع</div><div class="ai-method-desc">ماذا يحدث الآن في الحساب؟</div></div>
    <div class="ai-method-card"><div class="ai-method-step">02</div><div class="ai-method-label">الدليل</div><div class="ai-method-desc">أرقام حية مقارنة بالفترة السابقة أو المعيار</div></div>
    <div class="ai-method-card"><div class="ai-method-step">03</div><div class="ai-method-label">التشخيص</div><div class="ai-method-desc">السبب الأرجح: إبداع / جمهور / ميزانية / تتبّع</div></div>
    <div class="ai-method-card"><div class="ai-method-step">04</div><div class="ai-method-label">التوصية</div><div class="ai-method-desc">خطوة واحدة قابلة للتنفيذ + مستوى الثقة</div></div>
  </div>

  <div class="chat-shell">
    <div class="chat-sidebar">
      <div class="ai-side-card">
        <div class="ai-side-title">سياق الحساب المباشر</div>
        <div id="context-chips" style="display:flex;flex-wrap:wrap;gap:4px;">
          <div class="spinner" style="width:16px;height:16px;border-width:2px;"></div>
        </div>
      </div>
      <div>
        <div style="font-size:11px;font-weight:700;color:var(--text-3);margin-bottom:8px;padding:0 2px;">أسئلة تحليلية</div>
        <div style="display:flex;flex-direction:column;gap:7px;" id="suggestions">
          <div class="suggested-card"><div class="suggested-label">الأداء</div><div class="suggested-text">لماذا انخفض تفاعل إعلاناتي؟</div></div>
          <div class="suggested-card"><div class="suggested-label">الميزانية</div><div class="suggested-text">هل تُنفَق ميزانيتي بشكل فعّال؟</div></div>
          <div class="suggested-card"><div class="suggested-label">الجمهور</div><div class="suggested-text">هل يرى جمهوري نفس الإعلانات كثيراً؟</div></div>
          <div class="suggested-card"><div class="suggested-label">الاستراتيجية</div><div class="suggested-text">أي حملة أستحق أن أوسّعها؟</div></div>
          <div class="suggested-card"><div class="suggested-label">الإجراء</div><div class="suggested-text">ما الذي أنصح به الآن؟</div></div>
          <div class="suggested-card"><div class="suggested-label">الصحة</div><div class="suggested-text">ما سبب تراجع النتائج؟</div></div>
        </div>
      </div>
    </div>

    <div class="chat-main">
      <div class="chat-header">
        <div style="width:34px;height:34px;background:linear-gradient(135deg,var(--accent),var(--accent-2));border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;color:#1A1613;">A</div>
        <div>
          <div style="font-size:13.5px;font-weight:700;color:var(--text);">Adlytic CMO</div>
          <div style="font-size:11.5px;color:var(--text-3);display:flex;align-items:center;gap:5px;">
            <div class="chat-header-dot"></div>
            <span id="ai-status-line">يحلّل بيانات حسابك الحية</span>
          </div>
        </div>
      </div>

      <div class="chat-messages" id="chat-messages"></div>

      <div class="chat-input-area">
        <div class="chat-input-row">
          <textarea class="chat-input" id="chat-input" placeholder="اسأل عن الحملات، الميزانية، الجمهور، أو الأداء…" rows="1"></textarea>
          <button class="chat-send-btn" id="send-btn" title="إرسال">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </div>
        <div style="font-size:11px;color:var(--text-3);margin-top:7px;text-align:center;">الإجابات مبنية على بيانات حسابك الفعلية — مع مقارنة زمنية ومعايير الصناعة عند التوفر</div>
      </div>
    </div>
  </div>
</div>`;

  const scripts = `<script>
(async () => {
  function esc(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
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
    document.querySelector('.ai-hero-sub').textContent = 'Global CMO standard: evidence → diagnosis → one clear recommendation with confidence';
    document.getElementById('clear-btn').textContent = 'Clear chat';
    document.getElementById('ai-status-line').textContent = 'Analyzing your live account data';
    document.getElementById('chat-input').placeholder = 'Ask about campaigns, budget, audience, or performance…';
    var methodLabels = [
      ['Situation', 'What is happening in the account now?'],
      ['Evidence', 'Live numbers vs prior period or benchmark'],
      ['Diagnosis', 'Likely cause: creative / audience / budget / tracking'],
      ['Recommendation', 'One actionable step + confidence'],
    ];
    document.querySelectorAll('.ai-method-card').forEach(function (card, i) {
      card.querySelector('.ai-method-label').textContent = methodLabels[i][0];
      card.querySelector('.ai-method-desc').textContent = methodLabels[i][1];
    });
  }

  var SUGGESTIONS_AR = [
    { label: 'الأداء', text: 'لماذا انخفض تفاعل إعلاناتي؟' },
    { label: 'الميزانية', text: 'هل تُنفَق ميزانيتي بشكل فعّال؟' },
    { label: 'الجمهور', text: 'هل يرى جمهوري نفس الإعلانات كثيراً؟' },
    { label: 'الاستراتيجية', text: 'أي حملة أستحق أن أوسّعها؟' },
    { label: 'الإجراء', text: 'ما الذي أنصح به الآن؟' },
    { label: 'الصحة', text: 'ما سبب تراجع النتائج؟' },
  ];
  var SUGGESTIONS_EN = [
    { label: 'Performance', text: 'Why is my ad engagement dropping?' },
    { label: 'Budget', text: 'Is my budget being spent efficiently?' },
    { label: 'Audience', text: 'Is ad repetition too high on my campaigns?' },
    { label: 'Strategy', text: 'Which campaign should I scale?' },
    { label: 'Action', text: 'What should I do next?' },
    { label: 'Health', text: "What's causing declining results?" },
  ];
  var suggestions = isAr ? SUGGESTIONS_AR : SUGGESTIONS_EN;
  document.getElementById('suggestions').innerHTML = suggestions.map(function (s) {
    return '<div class="suggested-card"><div class="suggested-label">' + esc(s.label) + '</div><div class="suggested-text">' + esc(s.text) + '</div></div>';
  }).join('');

  let dashData = null;
  let sending  = false;
  let conversationId = null;
  const messagesEl = document.getElementById('chat-messages');
  const inputEl    = document.getElementById('chat-input');
  const sendBtn    = document.getElementById('send-btn');

  try {
    dashData = await apiFetch('/api/dashboard/' + wsId);
    if (dashData) renderContextChips(dashData);
  } catch(e) {
    document.getElementById('context-chips').innerHTML = '<span style="font-size:12px;color:var(--text-3);">' +
      (isAr ? 'لا توجد بيانات محمّلة' : 'No data loaded') + '</span>';
  }

  function renderContextChips(d) {
    const chips = [];
    if (d.health) {
      chips.push((isAr ? 'الصحة: ' : 'Health: ') + d.health.score + ' (' + d.health.band + ')');
    }
    const cc = d.workspace && d.workspace.campaignCounts;
    if (cc) {
      chips.push(
        (cc.deliveringInWindow != null ? cc.deliveringInWindow : '—') + (isAr ? ' تعمل' : ' delivering') +
        ' · ' + (cc.spendingToday != null ? cc.spendingToday : '—') + (isAr ? ' اليوم' : ' today') +
        ' · ' + (cc.dormantActive != null ? cc.dormantActive : '—') + (isAr ? ' بدون إنفاق' : ' dormant')
      );
    } else if (d.workspace && d.workspace.activeCampaigns != null) {
      chips.push(d.workspace.activeCampaigns + (isAr ? ' تعمل' : ' delivering'));
    }
    if (d.issues && d.issues.length) {
      chips.push(d.issues.length + (isAr ? ' ملاحظة' : ' issue' + (d.issues.length > 1 ? 's' : '')));
    }
    if (d.workspace && d.workspace.lastSyncedAt) {
      chips.push((isAr ? 'آخر مزامنة ' : 'Synced ') + new Date(d.workspace.lastSyncedAt).toLocaleString(isAr ? 'ar' : 'en'));
    }
    document.getElementById('context-chips').innerHTML = chips.length
      ? chips.map(function (c) { return '<span class="data-chip">' + esc(c) + '</span>'; }).join('')
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
      '<span class="evidence-pill"><b>' + (isAr ? 'المنهج' : 'Method') + '</b> ' +
      (isAr ? 'وضع → دليل → تشخيص → توصية' : 'Situation → Evidence → Diagnosis → Action') + '</span>';
    bubble.appendChild(row);
    bubble.appendChild(evidence);
  }

  function addMsg(role, html) {
    const div = document.createElement('div');
    div.className = 'msg ' + role;
    const initial = role === 'user' ? userInitial : 'AI';
    div.innerHTML =
      '<div class="msg-avatar">' + initial + '</div>' +
      '<div class="msg-bubble" dir="auto">' + html + '</div>';
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return div;
  }

  function addTyping() {
    return addMsg('assistant', '<span class="typing-dots"><span>●</span><span>●</span><span>●</span></span>');
  }

  function mdToHtml(text) {
    return String(text || '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/\\*\\*(.+?)\\*\\*/g,'<strong>$1</strong>')
      .replace(/\\*(.+?)\\*/g,'<em>$1</em>')
      .replace(/\`(.+?)\`/g,'<code>$1</code>')
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
        ? 'مرحباً — أنا مساعد Adlytic CMO. أحلّل بيانات حسابك الحية' +
          (dashData.workspace && dashData.workspace.name ? ' لـ <strong>' + esc(dashData.workspace.name) + '</strong>' : '') +
          ' بمنهج: <strong>الوضع → الدليل → التشخيص → التوصية</strong>.' +
          (dashData.issues && dashData.issues.length
            ? ' رصدت <strong>' + Number(dashData.issues.length) + '</strong> ملاحظة حالياً.'
            : ' الحساب يبدو مستقراً نسبياً.') +
          '<br><br><em>جرّب: «ما الذي أنصح به الآن؟» أو «لماذا انخفض تفاعل إعلاناتي؟»</em>'
        : 'Hello — I\\'m your Adlytic CMO assistant. I analyze live account data' +
          (dashData.workspace && dashData.workspace.name ? ' for <strong>' + esc(dashData.workspace.name) + '</strong>' : '') +
          ' using <strong>Situation → Evidence → Diagnosis → Recommendation</strong>.' +
          (dashData.issues && dashData.issues.length
            ? ' I detected <strong>' + Number(dashData.issues.length) + '</strong> issue' + (dashData.issues.length > 1 ? 's' : '') + '.'
            : ' Your account looks relatively steady.') +
          '<br><br><em>Try: "What should I do next?" or "Why is ad engagement dropping?"</em>')
    : (isAr
        ? 'مرحباً — أنا مساعد Adlytic. اربط حملاتك للحصول على تحليل مبني على بياناتك.'
        : 'Hello — I\\'m Adlytic AI. Connect campaigns to get data-driven insights.');
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
      const bubbleWrapper = addMsg('assistant', mdToHtml(answer));
      if (usedV2 && res) {
        if (res.conversationId) conversationId = res.conversationId;
        renderToolChips(bubbleWrapper, res.toolCalls);
        if (res.latencyMs != null) {
          var bubble = bubbleWrapper.querySelector('.msg-bubble');
          if (bubble) {
            var latency = document.createElement('div');
            latency.className = 'evidence-bar';
            latency.innerHTML = '<span class="evidence-pill"><b>' + (isAr ? 'الوقت' : 'Latency') + '</b> ' +
              Math.round(Number(res.latencyMs) / 100) / 10 + (isAr ? ' ث' : 's') + '</span>';
            bubble.appendChild(latency);
          }
        }
      } else {
        var bubble = bubbleWrapper.querySelector('.msg-bubble');
        if (bubble) {
          var evidence = document.createElement('div');
          evidence.className = 'evidence-bar';
          evidence.innerHTML = '<span class="evidence-pill"><b>' + (isAr ? 'المصدر' : 'Source') + '</b> ' +
            (isAr ? 'بيانات لوحة التحكم الحية' : 'Live dashboard context') + '</span>';
          bubble.appendChild(evidence);
        }
      }
    } catch(e) {
      typingEl.remove();
      addMsg('assistant', '<span style="color:var(--error);">' + esc(isAr ? 'خطأ: ' : 'Error: ') + esc(e.message || (isAr ? 'فشل الطلب' : 'Request failed')) + '</span>');
    } finally {
      sending = false;
      sendBtn.disabled = false;
      inputEl.focus();
    }
  }

  sendBtn.addEventListener('click', () => {
    const q = inputEl.value.trim();
    if (!q) return;
    inputEl.value = '';
    inputEl.style.height = 'auto';
    sendMessage(q);
  });

  inputEl.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const q = inputEl.value.trim();
      if (!q) return;
      inputEl.value = '';
      inputEl.style.height = 'auto';
      sendMessage(q);
    }
  });

  inputEl.addEventListener('input', () => {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
  });

  document.getElementById('suggestions').addEventListener('click', e => {
    const card = e.target.closest('.suggested-card');
    if (!card) return;
    const q = card.querySelector('.suggested-text')?.textContent?.trim();
    if (q) sendMessage(q);
  });

  document.getElementById('clear-btn').addEventListener('click', () => {
    messagesEl.innerHTML = '';
    conversationId = null;
    addMsg('assistant', isAr
      ? 'تم مسح المحادثة. اسأل عن أداء حملاتك في أي وقت.'
      : 'Chat cleared. Ask me anything about your campaign performance.');
  });

  const prefillQ = new URLSearchParams(window.location.search).get('q');
  if (prefillQ && prefillQ.trim()) {
    window.history.replaceState({}, '', '/ai');
    sendMessage(prefillQ.trim());
  }

  inputEl.focus();
  } catch (err) {
    console.error('[ai-init] fatal init error:', err);
    var __cc = document.getElementById('context-chips');
    if (__cc) __cc.innerHTML = '<span style="font-size:12px;color:var(--error);">Init error: ' + esc((err && err.message) || err) + '</span>';
  }
})();
</script>`;

  return layout({ title: 'المساعد الذكي', active: 'ai', content, scripts });
}
