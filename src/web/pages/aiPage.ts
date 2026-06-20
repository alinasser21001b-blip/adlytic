// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/aiPage.ts  —  AI Assistant page
// ════════════════════════════════════════════════════════════════════════

import { layout } from '../layout';

export function aiPage(): string {
  const content = `
<style>
  .chat-shell { display:flex; gap:20px; height:calc(100vh - var(--topbar-h) - 80px); min-height:500px; }
  .chat-sidebar { width:260px; flex-shrink:0; display:flex; flex-direction:column; gap:12px; }
  .chat-main { flex:1; display:flex; flex-direction:column; background:var(--surface); border:1px solid var(--border); border-radius:var(--radius-lg); overflow:hidden; }
  .chat-header { padding:16px 20px; border-bottom:1px solid var(--border); display:flex; align-items:center; gap:10px; }
  .chat-header-dot { width:8px;height:8px;background:var(--success);border-radius:50%;animation:pulse 2s infinite; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
  .chat-messages { flex:1; overflow-y:auto; padding:20px; display:flex; flex-direction:column; gap:16px; }
  .chat-messages::-webkit-scrollbar { width:4px; }
  .chat-messages::-webkit-scrollbar-track { background:transparent; }
  .chat-messages::-webkit-scrollbar-thumb { background:var(--border-2); border-radius:2px; }
  .msg { display:flex; gap:10px; max-width:85%; }
  .msg.user { align-self:flex-end; flex-direction:row-reverse; }
  .msg-avatar { width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0; }
  .msg.assistant .msg-avatar { background:var(--accent); color:#fff; }
  .msg.user .msg-avatar { background:var(--surface-2); color:var(--text-2); border:1px solid var(--border); }
  .msg-bubble { padding:11px 14px; border-radius:var(--radius); font-size:13.5px; line-height:1.6; }
  .msg.assistant .msg-bubble { background:var(--surface-2); color:var(--text); border:1px solid var(--border); }
  .msg.user .msg-bubble { background:var(--accent); color:#fff; }
  .msg-bubble p { margin:0 0 8px; }
  .msg-bubble p:last-child { margin-bottom:0; }
  .msg-bubble ul { margin:6px 0 6px 16px; }
  .msg-bubble li { margin-bottom:3px; }
  .msg-bubble strong { font-weight:700; }
  .msg-bubble code { background:rgba(255,255,255,0.1); padding:1px 5px; border-radius:3px; font-family:monospace; font-size:12px; }
  .chat-input-area { padding:14px 16px; border-top:1px solid var(--border); }
  .chat-input-row { display:flex; gap:8px; align-items:flex-end; }
  .chat-input {
    flex:1; background:var(--surface-2); border:1px solid var(--border);
    border-radius:var(--radius); padding:10px 14px; color:var(--text);
    font-size:13.5px; font-family:inherit; resize:none; outline:none;
    transition:border-color var(--transition); min-height:42px; max-height:120px;
  }
  .chat-input:focus { border-color:var(--accent); }
  .chat-input::placeholder { color:var(--text-3); }
  .chat-send-btn { width:38px;height:38px;background:var(--accent);border:none;border-radius:var(--radius-sm);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:background var(--transition); }
  .chat-send-btn:hover { background:#4f46e5; }
  .chat-send-btn:disabled { opacity:0.4;cursor:not-allowed; }
  .suggested-card { background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); padding:12px 14px; cursor:pointer; transition:all var(--transition); }
  .suggested-card:hover { background:var(--surface-2); border-color:var(--border-2); }
  .suggested-label { font-size:10px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px; }
  .suggested-text { font-size:12.5px;color:var(--text-2);line-height:1.4; }
  .typing-dots span { animation:blink 1.4s infinite; display:inline-block; }
  .typing-dots span:nth-child(2) { animation-delay:0.2s; }
  .typing-dots span:nth-child(3) { animation-delay:0.4s; }
  @keyframes blink { 0%,80%,100%{opacity:0} 40%{opacity:1} }
  .data-chip { display:inline-flex;align-items:center;gap:4px;padding:3px 8px;background:var(--accent-dim);color:var(--accent-2);border-radius:4px;font-size:11px;font-weight:600;margin:2px; }
</style>

<div class="page-header">
  <div class="page-title">AI Assistant</div>
  <div class="page-subtitle">Data-driven insights powered by your campaign analytics</div>
</div>

<div class="chat-shell">
  <!-- Left: Suggested questions + context -->
  <div class="chat-sidebar">
    <div class="card" style="padding:14px;">
      <div class="card-title">Live Context</div>
      <div id="context-chips" style="display:flex;flex-wrap:wrap;gap:4px;">
        <div class="spinner" style="width:16px;height:16px;border-width:2px;"></div>
      </div>
    </div>
    <div>
      <div style="font-size:11px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;padding:0 2px;">Suggested Questions</div>
      <div style="display:flex;flex-direction:column;gap:7px;" id="suggestions">
        <div class="suggested-card"><div class="suggested-label">Performance</div><div class="suggested-text">Why is my CTR dropping?</div></div>
        <div class="suggested-card"><div class="suggested-label">Budget</div><div class="suggested-text">Is my budget being spent efficiently?</div></div>
        <div class="suggested-card"><div class="suggested-label">Audience</div><div class="suggested-text">Is frequency too high on my campaigns?</div></div>
        <div class="suggested-card"><div class="suggested-label">Strategy</div><div class="suggested-text">Which campaign should I scale?</div></div>
        <div class="suggested-card"><div class="suggested-label">Action</div><div class="suggested-text">What should I do next?</div></div>
        <div class="suggested-card"><div class="suggested-label">Health</div><div class="suggested-text">What's causing declining results?</div></div>
      </div>
    </div>
  </div>

  <!-- Right: Chat -->
  <div class="chat-main">
    <div class="chat-header">
      <div style="width:30px;height:30px;background:var(--accent);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;color:#fff;">A</div>
      <div>
        <div style="font-size:13.5px;font-weight:700;color:var(--text);">Adlytic AI</div>
        <div style="font-size:11.5px;color:var(--text-3);display:flex;align-items:center;gap:5px;"><div class="chat-header-dot"></div>Analyzing your live data</div>
      </div>
      <button class="btn btn-ghost btn-sm" id="clear-btn" style="margin-left:auto;">Clear chat</button>
    </div>

    <div class="chat-messages" id="chat-messages">
      <!-- Welcome message inserted by JS -->
    </div>

    <div class="chat-input-area">
      <div class="chat-input-row">
        <textarea class="chat-input" id="chat-input" placeholder="Ask about your campaigns, budget, audience, or performance…" rows="1"></textarea>
        <button class="chat-send-btn" id="send-btn" title="Send">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>
      <div style="font-size:11px;color:var(--text-3);margin-top:6px;text-align:center;">Responses are generated from your live campaign data.</div>
    </div>
  </div>
</div>`;

  const scripts = `<script>
(async () => {
  function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  const token = localStorage.getItem('adlytic_token');
  if (!token) { window.location.href = '/login'; return; }
  const wsId  = localStorage.getItem('adlytic_workspace_id');
  if (!wsId)  { window.location.href = '/dashboard'; return; }

  const me = await apiFetch('/api/auth/me');
  if (!me) return;
  document.getElementById('user-name').textContent  = me.name || me.email;
  document.getElementById('user-email').textContent = me.email;
  document.getElementById('user-avatar').textContent = (me.name||me.email||'?')[0].toUpperCase();
  const wsM = me.memberships?.find(m => m.workspaceId === wsId) || me.memberships?.[0];
  document.getElementById('ws-name').textContent = wsM?.workspace?.name || 'Workspace';
  const userInitial = (me.name||me.email||'?')[0].toUpperCase();

  let dashData = null;
  let sending  = false;
  const messagesEl = document.getElementById('chat-messages');
  const inputEl    = document.getElementById('chat-input');
  const sendBtn    = document.getElementById('send-btn');

  // Load context
  try {
    dashData = await apiFetch('/api/dashboard/' + wsId);
    if (dashData) renderContextChips(dashData);
  } catch(e) {
    document.getElementById('context-chips').innerHTML = '<span style="font-size:12px;color:var(--text-3);">No data loaded</span>';
  }

  function renderContextChips(d) {
    const chips = [];
    if (d.health) chips.push('Health: ' + d.health.score + ' (' + d.health.band + ')');
    if (d.workspace?.activeCampaigns) chips.push(d.workspace.activeCampaigns + ' campaigns');
    if (d.issues?.length) chips.push(d.issues.length + ' issue' + (d.issues.length>1?'s':''));
    if (d.workspace?.lastSyncedAt) chips.push('Synced ' + new Date(d.workspace.lastSyncedAt).toLocaleDateString());
    document.getElementById('context-chips').innerHTML = chips.length
      ? chips.map(c => '<span class="data-chip">' + c + '</span>').join('')
      : '<span style="font-size:12px;color:var(--text-3);">No campaign data yet</span>';
  }

  function addMsg(role, html) {
    const div = document.createElement('div');
    div.className = 'msg ' + role;
    const initial = role === 'user' ? userInitial : 'AI';
    div.innerHTML =
      '<div class="msg-avatar">' + initial + '</div>' +
      '<div class="msg-bubble">' + html + '</div>';
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return div;
  }

  function addTyping() {
    return addMsg('assistant', '<span class="typing-dots"><span>●</span><span>●</span><span>●</span></span>');
  }

  function mdToHtml(text) {
    return text
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

  // Welcome message
  const welcomeText = dashData
    ? 'Hello! I\'m your Adlytic AI assistant. I have access to your live campaign data' +
      (dashData.workspace?.name ? ' for <strong>' + esc(dashData.workspace.name) + '</strong>' : '') + '.' +
      (dashData.issues?.length
        ? ' I\'ve detected <strong>' + Number(dashData.issues.length) + ' issue' + (dashData.issues.length>1?'s':'') + '</strong> in your campaigns. Ask me about them or anything else related to your ad performance.'
        : ' Your campaigns look healthy. Ask me anything about performance, budget, or strategy.') +
      '<br><br><em>Try: "What should I do next?" or "Why is CTR dropping?"</em>'
    : 'Hello! I\'m your Adlytic AI assistant. Connect your campaigns to get data-driven insights. In the meantime, ask me anything about Meta Ads strategy.';
  addMsg('assistant', welcomeText);

  async function sendMessage(question) {
    if (sending || !question.trim()) return;
    sending = true;
    sendBtn.disabled = true;

    addMsg('user', question.replace(/</g,'&lt;').replace(/>/g,'&gt;'));
    const typingEl = addTyping();

    try {
      const res = await apiFetch('/api/workspaces/' + wsId + '/ai/chat', {
        method:'POST',
        body: JSON.stringify({ message: question }),
      });
      typingEl.remove();
      const answer = res?.reply || 'I could not generate a response. Please try again.';
      addMsg('assistant', mdToHtml(answer));
    } catch(e) {
      typingEl.remove();
      addMsg('assistant', '<span style="color:var(--error);">Error: ' + (e.message||'Request failed') + '</span>');
    } finally {
      sending = false;
      sendBtn.disabled = false;
      inputEl.focus();
    }
  }

  // Send button
  sendBtn.addEventListener('click', () => {
    const q = inputEl.value.trim();
    if (!q) return;
    inputEl.value = '';
    inputEl.style.height = 'auto';
    sendMessage(q);
  });

  // Enter key (shift+enter for newline)
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

  // Auto-resize textarea
  inputEl.addEventListener('input', () => {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
  });

  // Suggested questions
  document.getElementById('suggestions').addEventListener('click', e => {
    const card = e.target.closest('.suggested-card');
    if (!card) return;
    const q = card.querySelector('.suggested-text')?.textContent?.trim();
    if (q) sendMessage(q);
  });

  // Clear chat
  document.getElementById('clear-btn').addEventListener('click', () => {
    messagesEl.innerHTML = '';
    addMsg('assistant', 'Chat cleared. Ask me anything about your campaign performance.');
  });

  inputEl.focus();
})();
</script>`;

  return layout({ title: 'AI Assistant', active: 'ai', content, scripts });
}
