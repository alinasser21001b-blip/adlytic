import { layout } from '../layout';

export function supportPage(): string {
  const css = `
.support-shell { max-width: 960px; margin: 0 auto; padding: 0 20px; }
.support-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; }
.support-header .page-title { font-size: 20px; font-weight: 800; }
.support-header .page-subtitle { font-size: 13px; color: var(--text-2); margin-top: 2px; }

/* ── New ticket button ── */
.btn-new-ticket {
  display: inline-flex; align-items: center; gap: 8px; padding: 10px 20px;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  color: var(--bg); font-weight: 700; font-size: 13px; border-radius: 10px;
  border: none; cursor: pointer; transition: 0.2s;
}
.btn-new-ticket:hover { filter: brightness(1.1); transform: translateY(-1px); }
.btn-new-ticket svg { width: 16px; height: 16px; }

/* ── Ticket list ── */
.tickets-empty {
  text-align: center; padding: 60px 20px; color: var(--text-3);
}
.tickets-empty-icon { font-size: 40px; margin-bottom: 12px; opacity: 0.5; }
.tickets-empty-text { font-size: 15px; font-weight: 600; margin-bottom: 6px; color: var(--text-2); }
.tickets-empty-sub { font-size: 13px; }

.ticket-list { display: flex; flex-direction: column; gap: 8px; }
.ticket-card {
  background: var(--surface); border: 1px solid var(--border); border-radius: 12px;
  padding: 16px 18px; cursor: pointer; transition: 0.15s;
  display: flex; flex-direction: column; gap: 8px;
}
.ticket-card:hover { background: var(--surface-2); border-color: var(--border-2); }
.ticket-card-top { display: flex; align-items: center; gap: 10px; }
.ticket-category {
  display: inline-flex; align-items: center; padding: 3px 10px; border-radius: 6px;
  font-size: 11px; font-weight: 700; background: var(--surface-2); color: var(--text-2);
}
.ticket-category.BUG { background: rgba(226,96,79,0.15); color: #E2604F; }
.ticket-category.FEATURE_REQUEST { background: rgba(100,149,237,0.15); color: #6495ED; }
.ticket-category.QUESTION { background: rgba(52,168,113,0.15); color: #34A871; }
.ticket-category.PAYMENT { background: rgba(217,167,89,0.15); color: var(--accent-2); }
.ticket-status {
  display: inline-flex; align-items: center; padding: 3px 8px; border-radius: 6px;
  font-size: 10px; font-weight: 700; margin-inline-start: auto;
}
.ticket-status.OPEN { background: rgba(52,168,113,0.15); color: #34A871; }
.ticket-status.AWAITING_CUSTOMER { background: rgba(217,167,89,0.15); color: var(--accent-2); }
.ticket-status.RESOLVED { background: rgba(100,149,237,0.15); color: #6495ED; }
.ticket-status.CLOSED { background: var(--surface-2); color: var(--text-3); }
.ticket-subject { font-size: 14px; font-weight: 700; color: var(--text); }
.ticket-meta { font-size: 11px; color: var(--text-3); display: flex; align-items: center; gap: 12px; }

/* ── Create ticket form ── */
.create-overlay {
  display: none; position: fixed; inset: 0; z-index: 900;
  background: rgba(0,0,0,0.6); backdrop-filter: blur(4px);
  justify-content: center; align-items: center;
}
.create-overlay.open { display: flex; }
.create-dialog {
  background: var(--surface); border: 1px solid var(--border); border-radius: 16px;
  width: 560px; max-width: calc(100vw - 40px); max-height: calc(100vh - 60px);
  overflow-y: auto; padding: 28px;
}
.create-title { font-size: 18px; font-weight: 800; margin-bottom: 4px; }
.create-sub { font-size: 13px; color: var(--text-2); margin-bottom: 20px; }
.form-group { margin-bottom: 16px; }
.form-label { display: block; font-size: 12px; font-weight: 700; color: var(--text-2); margin-bottom: 6px; }
.form-input, .form-select, .form-textarea {
  width: 100%; padding: 10px 14px; background: var(--bg); border: 1px solid var(--border);
  border-radius: 8px; font-size: 13px; color: var(--text); transition: 0.15s;
}
.form-input:focus, .form-select:focus, .form-textarea:focus {
  outline: none; border-color: var(--accent); box-shadow: 0 0 0 2px rgba(217,167,89,0.15);
}
.form-textarea { min-height: 120px; resize: vertical; line-height: 1.6; }
.form-select { appearance: none; cursor: pointer; }
.category-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; }
.category-btn {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 16px 10px; background: var(--bg); border: 2px solid var(--border);
  border-radius: 12px; cursor: pointer; transition: 0.15s; text-align: center;
}
.category-btn:hover { border-color: var(--border-2); background: var(--surface-2); }
.category-btn.selected { border-color: var(--accent); background: rgba(217,167,89,0.08); }
.category-btn-icon { font-size: 22px; }
.category-btn-label { font-size: 12px; font-weight: 700; color: var(--text-2); }
.category-btn.selected .category-btn-label { color: var(--accent-2); }
.create-actions { display: flex; gap: 10px; margin-top: 20px; }
.create-actions .btn { flex: 1; padding: 10px; border-radius: 10px; font-weight: 700; font-size: 13px; }
.btn-submit { background: linear-gradient(135deg, var(--accent), var(--accent-2)); color: var(--bg); border: none; cursor: pointer; }
.btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-cancel { background: var(--surface-2); border: 1px solid var(--border); color: var(--text-2); cursor: pointer; }

/* ── Thread view ── */
.thread-shell { display: none; }
.thread-shell.open { display: block; }
.thread-back {
  display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px;
  border-radius: 8px; font-size: 13px; font-weight: 600; color: var(--text-2);
  cursor: pointer; transition: 0.15s; margin-bottom: 16px; background: none; border: none;
}
.thread-back:hover { background: var(--surface); color: var(--text); }
.thread-header {
  background: var(--surface); border: 1px solid var(--border); border-radius: 12px;
  padding: 18px 20px; margin-bottom: 16px;
}
.thread-header-top { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.thread-subject { font-size: 16px; font-weight: 800; }
.thread-info { font-size: 12px; color: var(--text-3); display: flex; gap: 12px; flex-wrap: wrap; }
.messages-list { display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; }
.msg-bubble {
  max-width: 80%; padding: 12px 16px; border-radius: 14px; font-size: 13px; line-height: 1.65;
  white-space: pre-wrap; word-break: break-word;
}
.msg-bubble.user {
  align-self: flex-end; background: rgba(217,167,89,0.12); border: 1px solid rgba(217,167,89,0.2);
  border-bottom-left: 4px;
}
.msg-bubble.admin {
  align-self: flex-start; background: var(--surface); border: 1px solid var(--border);
  border-bottom-right: 4px;
}
.msg-time { font-size: 10px; color: var(--text-3); margin-top: 4px; }
.msg-sender { font-size: 11px; font-weight: 700; color: var(--text-2); margin-bottom: 4px; }

/* ── Reply compose ── */
.compose-bar {
  background: var(--surface); border: 1px solid var(--border); border-radius: 14px;
  padding: 14px 16px; display: flex; gap: 10px; align-items: flex-end;
}
.compose-bar textarea {
  flex: 1; background: transparent; border: none; resize: none; min-height: 40px;
  max-height: 120px; color: var(--text); font-size: 13px; line-height: 1.5; padding: 0;
}
.compose-bar textarea:focus { outline: none; }
.compose-bar textarea::placeholder { color: var(--text-3); }
.btn-send {
  display: inline-flex; align-items: center; justify-content: center; width: 38px; height: 38px;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  color: var(--bg); border-radius: 10px; border: none; cursor: pointer; flex-shrink: 0;
  transition: 0.15s;
}
.btn-send:hover { filter: brightness(1.1); }
.btn-send:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-send svg { width: 16px; height: 16px; transform: scaleX(-1); }

/* ── Toast ── */
.toast-wrap { position: fixed; top: 20px; left: 50%; transform: translateX(-50%); z-index: 999; }
.toast {
  padding: 10px 20px; border-radius: 10px; font-size: 13px; font-weight: 600;
  background: var(--surface); border: 1px solid var(--border); color: var(--text);
  animation: toastIn 0.3s ease;
}
@keyframes toastIn { from { opacity: 0; transform: translateY(-10px); } }

@media (max-width: 640px) {
  .support-shell { padding: 0 12px; }
  .create-dialog { padding: 20px; }
  .category-grid { grid-template-columns: repeat(2, 1fr); }
}
`;

  const js = `
const CATEGORY_LABELS = {
  BUG: 'خلل تقني', FEATURE_REQUEST: 'اقتراح ميزة', QUESTION: 'سؤال',
  PAYMENT: 'دفع واشتراك', GENERAL: 'عام'
};
const STATUS_LABELS = {
  OPEN: 'مفتوحة', AWAITING_CUSTOMER: 'بانتظارك', RESOLVED: 'تم الحل', CLOSED: 'مغلقة'
};
const PRIORITY_LABELS = { LOW: 'منخفضة', NORMAL: 'عادية', HIGH: 'عالية', URGENT: 'عاجلة' };

let tickets = [];
let currentTicket = null;

function fmtDateSafe(v) {
  if (!v) return '—';
  var d = new Date(v);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('ar');
}
function fmtDateTimeSafe(v) {
  if (!v) return '—';
  var d = new Date(v);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString('ar');
}

async function apiFetch(path, opts = {}) {
  const r = await fetch(API + path, {
    ...opts,
    headers: { 'Authorization': 'Bearer ' + getToken(), 'Content-Type': 'application/json', ...(opts.headers||{}) },
  });
  if (r.status === 401) { logout(); return null; }
  if (r.status === 403) {
    const err = await r.json().catch(() => ({}));
    if (err.code === 'ACCOUNT_INACTIVE') { window.location.href = err.redirect || '/pending-activation'; return null; }
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) { return { error: data.error || 'حدث خطأ في الخادم (' + r.status + ')' }; }
  return data;
}

// ── Ticket list ──
async function loadTickets() {
  const el = document.getElementById('ticket-list');
  el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-3);">جاري التحميل...</div>';
  const data = await apiFetch('/api/support/tickets?workspaceId=' + getWsId());
  if (!data) return;
  tickets = data.tickets || data;
  renderTickets();
}

function renderTickets() {
  const el = document.getElementById('ticket-list');
  if (!tickets.length) {
    el.innerHTML = \`
      <div class="tickets-empty">
        <div class="tickets-empty-icon">💬</div>
        <div class="tickets-empty-text">لا توجد محادثات بعد</div>
        <div class="tickets-empty-sub">أرسل أول رسالة لفريق الدعم</div>
      </div>\`;
    return;
  }
  el.innerHTML = tickets.map(t => \`
    <div class="ticket-card" onclick="openTicket('\${escHtml(t.id)}')">
      <div class="ticket-card-top">
        <span class="ticket-category">\${escHtml(CATEGORY_LABELS[t.category] || t.category)}</span>
        <span class="ticket-status">\${escHtml(STATUS_LABELS[t.status] || t.status)}</span>
      </div>
      <div class="ticket-subject">\${escHtml(t.subject)}</div>
      <div class="ticket-meta">
        <span>\${t._count?.messages || 0} رسالة</span>
        <span>\${fmtDateSafe(t.createdAt)}</span>
        <span class="ticket-category" style="font-size:10px;">\${escHtml(PRIORITY_LABELS[t.priority]||t.priority)}</span>
      </div>
    </div>
  \`).join('');
}

// ── Create ticket ──
let selectedCategory = '';
function selectCategory(cat) {
  selectedCategory = cat;
  document.querySelectorAll('.category-btn').forEach(b => b.classList.toggle('selected', b.dataset.cat === cat));
  checkCreateForm();
}

function checkCreateForm() {
  const sub = document.getElementById('create-subject').value.trim();
  const msg = document.getElementById('create-message').value.trim();
  document.getElementById('btn-create-submit').disabled = !(selectedCategory && sub && msg);
}

function openCreateDialog() {
  selectedCategory = '';
  document.getElementById('create-subject').value = '';
  document.getElementById('create-message').value = '';
  document.getElementById('create-priority').value = 'NORMAL';
  document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('selected'));
  document.getElementById('btn-create-submit').disabled = true;
  document.getElementById('create-overlay').classList.add('open');
}

function closeCreateDialog() {
  document.getElementById('create-overlay').classList.remove('open');
}

async function submitTicket() {
  const btn = document.getElementById('btn-create-submit');
  btn.disabled = true; btn.textContent = 'جاري الإرسال...';
  const wsId = getWsId();
  if (!wsId) { showToast('لم يتم تحديد مساحة العمل — أعد تسجيل الدخول'); btn.disabled = false; btn.textContent = 'إرسال'; return; }
  const body = {
    workspaceId: wsId,
    category: selectedCategory,
    subject: document.getElementById('create-subject').value.trim(),
    message: document.getElementById('create-message').value.trim(),
    priority: document.getElementById('create-priority').value,
    userAgent: navigator.userAgent,
    language: navigator.language,
  };
  const data = await apiFetch('/api/support/tickets', { method: 'POST', body: JSON.stringify(body) });
  btn.textContent = 'إرسال';
  if (data && data.ticket) {
    closeCreateDialog();
    showToast('تم إنشاء الطلب بنجاح');
    loadTickets();
  } else {
    showToast(data?.error || 'حدث خطأ');
    btn.disabled = false;
  }
}

// ── Thread view ──
async function openTicket(id) {
  document.getElementById('list-view').style.display = 'none';
  const shell = document.getElementById('thread-view');
  shell.classList.add('open');
  shell.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-3);">جاري التحميل...</div>';

  const data = await apiFetch('/api/support/tickets/' + id);
  if (!data || !data.ticket) { backToList(); return; }
  currentTicket = data.ticket;
  renderThread();
}

function renderThread() {
  const t = currentTicket;
  const shell = document.getElementById('thread-view');
  const msgs = (t.messages || []).map(m => \`
    <div class="msg-bubble \${m.senderType === 'USER' ? 'user' : 'admin'}">
      <div class="msg-sender">\${m.senderType === 'ADMIN' ? 'فريق الدعم' : escHtml(m.sender?.name || 'أنت')}</div>
      <div>\${escHtml(m.content)}</div>
      <div class="msg-time">\${fmtDateTimeSafe(m.createdAt)}</div>
    </div>
  \`).join('');

  const isClosed = t.status === 'CLOSED' || t.status === 'RESOLVED';

  shell.innerHTML = \`
    <button class="thread-back" onclick="backToList()">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
      العودة للقائمة
    </button>
    <div class="thread-header">
      <div class="thread-header-top">
        <span class="ticket-category">\${escHtml(CATEGORY_LABELS[t.category] || t.category)}</span>
        <span class="ticket-status">\${escHtml(STATUS_LABELS[t.status] || t.status)}</span>
      </div>
      <div class="thread-subject">\${escHtml(t.subject)}</div>
      <div class="thread-info">
        <span>\${escHtml(PRIORITY_LABELS[t.priority]||t.priority)}</span>
        <span>\${fmtDateSafe(t.createdAt)}</span>
      </div>
    </div>
    <div class="messages-list">\${msgs}</div>
    \${isClosed ? '<div style="text-align:center;padding:16px;color:var(--text-3);font-size:13px;">تم إغلاق هذه المحادثة</div>' : \`
    <div class="compose-bar">
      <textarea id="reply-input" placeholder="اكتب ردك هنا..." rows="1" oninput="autoGrow(this)"></textarea>
      <button class="btn-send" id="btn-send" onclick="sendReply()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
      </button>
    </div>\`}
  \`;

  const msgList = shell.querySelector('.messages-list');
  if (msgList) msgList.scrollTop = msgList.scrollHeight;
}

function autoGrow(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

async function sendReply() {
  const input = document.getElementById('reply-input');
  const content = input.value.trim();
  if (!content) return;
  const btn = document.getElementById('btn-send');
  btn.disabled = true;
  const data = await apiFetch('/api/support/tickets/' + currentTicket.id + '/reply', {
    method: 'POST', body: JSON.stringify({ content }),
  });
  btn.disabled = false;
  if (data && data.message) {
    currentTicket.messages.push(data.message);
    renderThread();
  } else {
    showToast(data?.error || 'حدث خطأ');
  }
}

function backToList() {
  document.getElementById('thread-view').classList.remove('open');
  document.getElementById('thread-view').innerHTML = '';
  document.getElementById('list-view').style.display = '';
  currentTicket = null;
  loadTickets();
}

// ── Toast ──
function showToast(msg) {
  let w = document.querySelector('.toast-wrap');
  if (!w) { w = document.createElement('div'); w.className = 'toast-wrap'; document.body.appendChild(w); }
  w.innerHTML = '<div class="toast">' + escHtml(msg) + '</div>';
  setTimeout(() => w.innerHTML = '', 3000);
}

// ── Init ──
document.addEventListener('DOMContentLoaded', async () => {
  if (!getToken()) { location.href = '/login'; return; }

  // Verify identity and reconcile the active workspace against the token's
  // real memberships BEFORE loading any tickets. This runs independently of
  // the shared shell init (which registers its DOMContentLoaded handler after
  // this one) so we never query /api/support with a workspaceId inherited
  // from a previous account. Uses an explicit fetch to avoid depending on
  // which global apiFetch definition wins.
  try {
    const r = await fetch(API + '/api/auth/me', { headers: { 'Authorization': 'Bearer ' + getToken() } });
    if (r.status === 401) { location.href = '/login'; return; }
    if (r.ok) {
      const me = await r.json();
      if (typeof reconcileWorkspace === 'function') reconcileWorkspace(me);
    }
  } catch (e) { /* offline / transient — loadTickets will surface any error */ }

  loadTickets();

  document.getElementById('create-subject')?.addEventListener('input', checkCreateForm);
  document.getElementById('create-message')?.addEventListener('input', checkCreateForm);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeCreateDialog();
    if (e.key === 'Enter' && !e.shiftKey && document.activeElement?.id === 'reply-input') {
      e.preventDefault(); sendReply();
    }
  });
});
`;

  const content = `
<style>${css}</style>
<div class="support-shell">
  <div class="support-header">
    <div>
      <div class="page-title">الدعم والمساعدة</div>
      <div class="page-subtitle">تواصل مع فريق الدعم، أبلغ عن مشكلة، أو اقترح ميزة جديدة</div>
    </div>
    <button class="btn-new-ticket" onclick="openCreateDialog()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      محادثة جديدة
    </button>
  </div>

  <div id="list-view">
    <div id="ticket-list"></div>
  </div>

  <div id="thread-view" class="thread-shell"></div>
</div>

<!-- Create ticket dialog -->
<div class="create-overlay" id="create-overlay" onclick="if(event.target===this)closeCreateDialog()">
  <div class="create-dialog">
    <div class="create-title">محادثة جديدة</div>
    <div class="create-sub">اختر نوع الطلب واكتب رسالتك</div>

    <div class="form-group">
      <div class="form-label">نوع الطلب</div>
      <div class="category-grid">
        <button class="category-btn" data-cat="BUG" onclick="selectCategory('BUG')">
          <span class="category-btn-icon">🐛</span>
          <span class="category-btn-label">خلل تقني</span>
        </button>
        <button class="category-btn" data-cat="FEATURE_REQUEST" onclick="selectCategory('FEATURE_REQUEST')">
          <span class="category-btn-icon">💡</span>
          <span class="category-btn-label">اقتراح ميزة</span>
        </button>
        <button class="category-btn" data-cat="QUESTION" onclick="selectCategory('QUESTION')">
          <span class="category-btn-icon">❓</span>
          <span class="category-btn-label">سؤال</span>
        </button>
        <button class="category-btn" data-cat="PAYMENT" onclick="selectCategory('PAYMENT')">
          <span class="category-btn-icon">💳</span>
          <span class="category-btn-label">دفع واشتراك</span>
        </button>
        <button class="category-btn" data-cat="GENERAL" onclick="selectCategory('GENERAL')">
          <span class="category-btn-icon">💬</span>
          <span class="category-btn-label">عام</span>
        </button>
      </div>
    </div>

    <div class="form-group">
      <label class="form-label" for="create-subject">العنوان</label>
      <input class="form-input" id="create-subject" placeholder="ملخص قصير لطلبك" maxlength="200" />
    </div>

    <div class="form-group">
      <label class="form-label" for="create-message">الرسالة</label>
      <textarea class="form-textarea" id="create-message" placeholder="صف مشكلتك أو اقتراحك بالتفصيل..."></textarea>
    </div>

    <div class="form-group">
      <label class="form-label" for="create-priority">الأولوية</label>
      <select class="form-select" id="create-priority">
        <option value="LOW">منخفضة</option>
        <option value="NORMAL" selected>عادية</option>
        <option value="HIGH">عالية</option>
        <option value="URGENT">عاجلة</option>
      </select>
    </div>

    <div class="create-actions">
      <button class="btn btn-submit" id="btn-create-submit" disabled onclick="submitTicket()">إرسال</button>
      <button class="btn btn-cancel" onclick="closeCreateDialog()">إلغاء</button>
    </div>
  </div>
</div>

<div class="toast-wrap"></div>
<script>${js}</script>
`;

  return layout({ title: 'الدعم', active: 'support', content });
}
