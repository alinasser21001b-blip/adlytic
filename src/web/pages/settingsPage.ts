// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/settingsPage.ts
// ════════════════════════════════════════════════════════════════════════

import { layout } from '../layout';

export function settingsPage(): string {
  const content = `
<div class="settings-shell">
  <div class="page-header settings-header">
    <div>
      <div class="page-title">الإعدادات</div>
      <div class="page-subtitle">إدارة حسابك، الأمان، والفوترة</div>
    </div>
  </div>

  <div class="settings-layout">
    <!-- Side nav (RTL: appears on the right) -->
    <nav class="settings-nav" id="settings-nav">
      <button class="settings-nav-item active" data-tab="profile">
        <span class="settings-nav-icon">👤</span>
        <span>الملف الشخصي</span>
      </button>
      <button class="settings-nav-item" data-tab="security">
        <span class="settings-nav-icon">🔒</span>
        <span>الأمان</span>
      </button>
      <button class="settings-nav-item" data-tab="notifications">
        <span class="settings-nav-icon">🔔</span>
        <span>الإشعارات</span>
      </button>
      <button class="settings-nav-item" data-tab="billing">
        <span class="settings-nav-icon">💳</span>
        <span>الفوترة</span>
      </button>
      <button class="settings-nav-item settings-nav-danger" data-tab="danger">
        <span class="settings-nav-icon">⚠️</span>
        <span>منطقة الخطر</span>
      </button>
    </nav>

    <div class="settings-main">
      <!-- Profile -->
      <div id="tab-profile" class="settings-panel">
        <div class="settings-card settings-profile-hero">
          <div id="profile-loading" class="loading-overlay" style="min-height:80px;"><div class="spinner"></div></div>
          <div id="profile-form" style="display:none;">
            <div class="settings-profile-top">
              <div class="settings-avatar-lg" id="profile-avatar"></div>
              <div>
                <div id="profile-name-display" class="settings-profile-name"></div>
                <div id="profile-email-display" class="settings-profile-email"></div>
              </div>
            </div>
            <div id="profile-success" class="alert alert-success" style="display:none;"></div>
            <div id="profile-error" class="alert alert-error" style="display:none;"></div>
            <div class="settings-form-grid">
              <div class="form-group">
                <label class="form-label">الاسم الكامل</label>
                <input type="text" id="name-input" class="form-input" placeholder="اسمك الكامل">
              </div>
              <div class="form-group">
                <label class="form-label">اللغة</label>
                <select id="locale-input" class="form-input">
                  <option value="EN">English</option>
                  <option value="AR">العربية (Arabic)</option>
                </select>
              </div>
              <div class="form-group settings-form-full">
                <label class="form-label">البريد الإلكتروني</label>
                <input type="email" id="email-input" class="form-input" disabled>
                <div class="form-hint">تغيير البريد الإلكتروني يتطلب التحقق من الحساب.</div>
              </div>
            </div>
            <div class="settings-actions">
              <button class="btn btn-primary" id="save-profile-btn">حفظ الملف الشخصي</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Security -->
      <div id="tab-security" class="settings-panel" style="display:none;">
        <div class="settings-card">
          <div class="settings-card-head"><h3>تغيير كلمة المرور</h3><p>استخدم كلمة مرور قوية لا تقل عن 8 أحرف</p></div>
          <div id="pw-success" class="alert alert-success" style="display:none;"></div>
          <div id="pw-error" class="alert alert-error" style="display:none;"></div>
          <div class="settings-form-grid">
            <div class="form-group settings-form-full">
              <label class="form-label">كلمة المرور الحالية</label>
              <input type="password" id="pw-current" class="form-input" autocomplete="current-password">
            </div>
            <div class="form-group">
              <label class="form-label">كلمة المرور الجديدة</label>
              <input type="password" id="pw-new" class="form-input" autocomplete="new-password">
            </div>
            <div class="form-group">
              <label class="form-label">تأكيد كلمة المرور</label>
              <input type="password" id="pw-confirm" class="form-input" autocomplete="new-password">
            </div>
          </div>
          <div class="settings-actions"><button class="btn btn-primary" id="save-pw-btn">تحديث كلمة المرور</button></div>
        </div>
        <div class="settings-card">
          <div class="settings-card-head"><h3>الجلسات النشطة</h3><p>الأجهزة المتصلة بحسابك</p></div>
          <div class="settings-session-row">
            <div>
              <div class="settings-session-title">الجلسة الحالية</div>
              <div class="settings-session-meta">هذا الجهاز · نشط الآن</div>
            </div>
            <span class="badge badge-green">الحالية</span>
          </div>
          <div class="settings-actions"><button class="btn btn-danger btn-sm" id="signout-all-btn">تسجيل الخروج من جميع الجلسات الأخرى</button></div>
        </div>
      </div>

      <!-- Notifications -->
      <div id="tab-notifications" class="settings-panel" style="display:none;">
        <div class="settings-card">
          <div class="settings-card-head"><h3>تفضيلات الإشعارات</h3><p>اختر ما تريد أن يصلك من تنبيهات Adlytic</p></div>
          <div class="settings-toggle-list">
            ${[
              ['notif-issues', 'تنبيهات المشكلات', 'إشعار عند اكتشاف مشكلات جديدة في حملاتك'],
              ['notif-budget', 'تحذيرات الميزانية', 'تنبيه عندما تكون وتيرة الإنفاق غير طبيعية'],
              ['notif-recs', 'توصيات جديدة', 'ملخص أسبوعي لأهم التوصيات'],
              ['notif-sync', 'إشعارات المزامنة', 'عند اكتمال أو فشل مزامنة البيانات'],
              ['notif-digest', 'ملخص الأداء الأسبوعي', 'نظرة أسبوعية على أداء حملاتك'],
            ].map(([id, label, desc]) => `
            <div class="settings-toggle-row">
              <div><div class="settings-toggle-label">${label}</div><div class="settings-toggle-desc">${desc}</div></div>
              <label class="settings-toggle"><input type="checkbox" id="${id}" checked><span class="toggle-track"></span></label>
            </div>`).join('')}
          </div>
          <div class="settings-actions"><button class="btn btn-primary" id="save-notif-btn">حفظ التفضيلات</button></div>
        </div>
      </div>

      <!-- Billing -->
      <div id="tab-billing" class="settings-panel" style="display:none;">
        <div class="settings-card">
          <div class="settings-card-head"><h3>الاشتراك</h3><p>إدارة خطتك وطرق الدفع</p></div>
          <div id="billing-banner" class="alert" style="display:none;margin-bottom:16px;"></div>
          <div id="billing-loading" class="loading-overlay" style="min-height:80px;"><div class="spinner"></div></div>
          <div id="billing-body" style="display:none;">
            <div class="settings-billing-tier">
              <span id="billing-tier-badge" class="badge">—</span>
              <div id="billing-status-line" class="settings-session-meta"></div>
              <div id="billing-expiry-line" class="settings-session-meta" style="display:none;"></div>
            </div>
            <div id="billing-owner-actions" style="display:none;margin-top:20px;">
              <button id="upgrade-premium-btn" class="btn btn-primary" style="width:100%;">Upgrade to Premium — $10 / month</button>
              <div class="form-hint" style="margin-top:8px;">Powered by Stripe. Sandbox: card 4242 4242 4242 4242.</div>
            </div>
            <div id="billing-non-owner-note" style="display:none;margin-top:16px;" class="form-hint">Only the workspace owner can manage billing.</div>
            <div class="settings-divider"></div>
            <div class="form-hint" style="margin-bottom:10px;">Zain Cash, Asia Hawala, or bank transfer?</div>
            <button id="whatsapp-pay-btn" class="btn btn-secondary" style="width:100%;">تواصل عبر واتساب للدفع اليدوي</button>
          </div>
          <div id="billing-error" class="alert alert-error" style="display:none;margin-top:12px;"></div>
        </div>
      </div>

      <!-- Danger -->
      <div id="tab-danger" class="settings-panel" style="display:none;">
        <div class="settings-card settings-card-danger">
          <div class="settings-card-head"><h3 style="color:var(--error);">منطقة الخطر</h3><p>إجراءات لا يمكن التراجع عنها</p></div>
          <div class="settings-danger-row">
            <div><div class="settings-toggle-label">تصدير بيانات الحساب</div><div class="settings-toggle-desc">تحميل أرشيف JSON لجميع بياناتك</div></div>
            <button class="btn btn-secondary btn-sm" id="export-btn">Export</button>
          </div>
          <div class="settings-divider"></div>
          <div class="settings-danger-row">
            <div><div class="settings-toggle-label" style="color:var(--error);">حذف الحساب</div><div class="settings-toggle-desc">حذف نهائي — لا يمكن استرجاع البيانات</div></div>
            <button class="btn btn-danger btn-sm" id="delete-account-btn">Delete</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .settings-shell { direction: rtl; max-width: 960px; margin: 0 auto; }
  .settings-header { margin-bottom: 24px; }
  .settings-layout {
    display: grid; grid-template-columns: 220px 1fr; gap: 24px; align-items: start;
  }
  @media (max-width: 768px) {
    .settings-layout { grid-template-columns: 1fr; }
    .settings-nav { display: flex; flex-wrap: wrap; gap: 8px; }
    .settings-nav-item { flex: 1 1 auto; justify-content: center; min-width: 120px; }
  }
  .settings-nav {
    display: flex; flex-direction: column; gap: 6px;
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius-lg); padding: 10px;
    position: sticky; top: 16px;
  }
  .settings-nav-item {
    display: flex; align-items: center; gap: 10px;
    padding: 12px 14px; border: none; border-radius: var(--radius);
    background: transparent; color: var(--text-2); font-size: 13px; font-weight: 600;
    cursor: pointer; text-align: right; width: 100%; transition: background 0.15s, color 0.15s;
  }
  .settings-nav-item:hover { background: var(--surface-hover); color: var(--text); }
  .settings-nav-item.active {
    background: var(--accent-dim); color: var(--accent-2);
    box-shadow: inset 3px 0 0 var(--accent);
  }
  .settings-nav-danger { color: var(--error); }
  .settings-nav-danger.active { background: var(--error-dim); color: var(--error); box-shadow: inset 3px 0 0 var(--error); }
  .settings-nav-icon { font-size: 16px; width: 22px; text-align: center; }
  .settings-card {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius-lg); padding: 24px 28px; margin-bottom: 16px;
  }
  .settings-card-danger { border-color: rgba(199,56,42,0.35); }
  .settings-card-head { margin-bottom: 20px; }
  .settings-card-head h3 { font-size: 16px; font-weight: 700; color: var(--text); margin: 0 0 4px; }
  .settings-card-head p { font-size: 12.5px; color: var(--text-3); margin: 0; }
  .settings-profile-hero { background: linear-gradient(145deg, rgba(217,167,89,0.06), var(--surface)); }
  .settings-profile-top { display: flex; align-items: center; gap: 18px; margin-bottom: 24px; }
  .settings-avatar-lg {
    width: 64px; height: 64px; border-radius: 50%;
    background: linear-gradient(135deg, var(--accent), var(--accent-2));
    color: #1A1613; font-size: 24px; font-weight: 800;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 4px 16px rgba(217,167,89,0.25);
  }
  .settings-profile-name { font-size: 18px; font-weight: 700; color: var(--text); }
  .settings-profile-email { font-size: 13px; color: var(--text-2); margin-top: 2px; }
  .settings-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .settings-form-full { grid-column: 1 / -1; }
  @media (max-width: 520px) { .settings-form-grid { grid-template-columns: 1fr; } }
  .form-hint { font-size: 11.5px; color: var(--text-3); margin-top: 6px; }
  .settings-actions { margin-top: 20px; display: flex; gap: 10px; flex-wrap: wrap; }
  .settings-session-row, .settings-danger-row {
    display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;
    padding: 14px 0;
  }
  .settings-session-title, .settings-toggle-label { font-size: 14px; font-weight: 600; color: var(--text); }
  .settings-session-meta, .settings-toggle-desc { font-size: 12px; color: var(--text-3); margin-top: 2px; }
  .settings-toggle-list { display: flex; flex-direction: column; }
  .settings-toggle-row {
    display: flex; align-items: center; justify-content: space-between; gap: 16px;
    padding: 16px 0; border-bottom: 1px solid var(--border);
  }
  .settings-toggle-row:last-child { border-bottom: none; }
  .settings-toggle { position: relative; display: inline-block; width: 44px; height: 24px; cursor: pointer; flex-shrink: 0; }
  .settings-toggle input { opacity: 0; width: 0; height: 0; }
  .toggle-track {
    position: absolute; inset: 0; background: var(--border-2); border-radius: 12px; transition: background 0.2s;
  }
  .toggle-track::after {
    content: ''; position: absolute; width: 18px; height: 18px; border-radius: 50%; background: #fff;
    top: 3px; left: 3px; transition: transform 0.2s;
  }
  .settings-toggle input:checked + .toggle-track { background: var(--accent); }
  .settings-toggle input:checked + .toggle-track::after { transform: translateX(20px); }
  .settings-divider { height: 1px; background: var(--border); margin: 16px 0; }
  .settings-billing-tier { display: flex; flex-direction: column; gap: 8px; }
</style>`;

  const scripts = `<script>
(async () => {
  const token = localStorage.getItem('adlytic_token');
  if (!token) { window.location.href = '/login'; return; }
  const wsId = localStorage.getItem('adlytic_workspace_id');

  const me = await apiFetch('/api/auth/me');
  if (!me) return;
  document.getElementById('user-name').textContent  = me.name || me.email;
  document.getElementById('user-email').textContent = me.email;
  document.getElementById('user-avatar').textContent = (me.name||me.email||'?')[0].toUpperCase();
  const wsM = wsId && me.memberships?.find(m => m.workspaceId === wsId);
  document.getElementById('ws-name').textContent = wsM?.workspace?.name || 'Workspace';

  document.getElementById('profile-loading').style.display = 'none';
  document.getElementById('profile-form').style.display = 'block';
  document.getElementById('profile-avatar').textContent = (me.name||me.email||'?')[0].toUpperCase();
  document.getElementById('profile-name-display').textContent = me.name || '—';
  document.getElementById('profile-email-display').textContent = me.email;
  document.getElementById('name-input').value = me.name || '';
  document.getElementById('email-input').value = me.email || '';
  document.getElementById('locale-input').value = me.locale || 'AR';

  document.querySelectorAll('.settings-nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.settings-nav-item').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.settings-panel').forEach(p => p.style.display = 'none');
      document.getElementById('tab-' + btn.dataset.tab).style.display = 'block';
    });
  });

  document.getElementById('save-profile-btn').addEventListener('click', async () => {
    const name = document.getElementById('name-input').value.trim();
    if (!name) { toast('الاسم مطلوب', 'error'); return; }
    try {
      await apiFetch('/api/auth/profile', { method: 'PATCH', body: JSON.stringify({ name }) });
      document.getElementById('profile-name-display').textContent = name;
      document.getElementById('user-name').textContent = name;
      document.getElementById('user-avatar').textContent = name[0].toUpperCase();
      document.getElementById('profile-avatar').textContent = name[0].toUpperCase();
      document.getElementById('profile-success').textContent = 'تم تحديث الملف الشخصي بنجاح.';
      document.getElementById('profile-success').style.display = 'flex';
      setTimeout(() => document.getElementById('profile-success').style.display = 'none', 3000);
    } catch (e) {
      document.getElementById('profile-error').textContent = e.message || 'فشل التحديث';
      document.getElementById('profile-error').style.display = 'flex';
    }
  });

  document.getElementById('save-pw-btn').addEventListener('click', async () => {
    const cur = document.getElementById('pw-current').value;
    const nw = document.getElementById('pw-new').value;
    const conf = document.getElementById('pw-confirm').value;
    const errEl = document.getElementById('pw-error');
    const sucEl = document.getElementById('pw-success');
    errEl.style.display = sucEl.style.display = 'none';
    if (!cur || !nw || !conf) { errEl.textContent = 'جميع الحقول مطلوبة'; errEl.style.display = 'flex'; return; }
    if (nw !== conf) { errEl.textContent = 'كلمتا المرور غير متطابقتين'; errEl.style.display = 'flex'; return; }
    if (nw.length < 8) { errEl.textContent = '8 أحرف على الأقل'; errEl.style.display = 'flex'; return; }
    try {
      await apiFetch('/api/auth/password', { method: 'POST', body: JSON.stringify({ currentPassword: cur, newPassword: nw }) });
      sucEl.textContent = 'تم تحديث كلمة المرور.';
      sucEl.style.display = 'flex';
      document.getElementById('pw-current').value = document.getElementById('pw-new').value = document.getElementById('pw-confirm').value = '';
    } catch (e) {
      errEl.textContent = e.message || 'فشل التحديث';
      errEl.style.display = 'flex';
    }
  });

  document.getElementById('signout-all-btn').addEventListener('click', async () => {
    if (!confirm('سيتم تسجيل الخروج من جميع الأجهزة الأخرى.')) return;
    try {
      await apiFetch('/api/auth/logout-all', { method: 'POST' });
      toast('تم تسجيل الخروج من الجلسات الأخرى.', 'success');
    } catch (e) { toast(e.message || 'فشل', 'error'); }
  });

  document.getElementById('save-notif-btn').addEventListener('click', () => toast('تم حفظ التفضيلات.', 'success'));

  document.getElementById('export-btn').addEventListener('click', async () => {
    try {
      const tk = localStorage.getItem('adlytic_token');
      const res = await fetch('/api/auth/export', { headers: { Authorization: 'Bearer ' + tk } });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'adlytic-export.json'; a.click();
      URL.revokeObjectURL(url);
      toast('تم التصدير.', 'success');
    } catch (e) { toast(e.message || 'فشل التصدير', 'error'); }
  });

  const _billingResult = new URLSearchParams(window.location.search).get('billing');
  if (_billingResult === 'success' || _billingResult === 'cancel') {
    const b = document.getElementById('billing-banner');
    b.className = _billingResult === 'success' ? 'alert alert-success' : 'alert alert-error';
    b.textContent = _billingResult === 'success'
      ? 'تم إرسال طلب الدفع — سيتم تفعيل Premium قريباً.'
      : 'تم إلغاء عملية الدفع.';
    b.style.display = 'flex';
    document.querySelector('[data-tab="billing"]').click();
  }

  if (wsId) {
    (async function loadBilling() {
      const loadEl = document.getElementById('billing-loading');
      const bodyEl = document.getElementById('billing-body');
      const errEl = document.getElementById('billing-error');
      try {
        const ws = await apiFetch('/api/workspaces/' + wsId);
        const badge = document.getElementById('billing-tier-badge');
        badge.className = 'badge ' + (ws.tier === 'PREMIUM' ? 'badge-green' : 'badge-gray');
        badge.textContent = ws.tier || 'FREE';
        document.getElementById('billing-status-line').textContent = 'Status: ' + (ws.subscriptionStatus || 'NONE');
        if (ws.subscriptionExpiresAt) {
          const expEl = document.getElementById('billing-expiry-line');
          expEl.textContent = 'Expires: ' + new Date(ws.subscriptionExpiresAt).toLocaleDateString();
          expEl.style.display = 'block';
        }
        if (wsM && wsM.role === 'OWNER' && ws.tier !== 'PREMIUM') {
          document.getElementById('billing-owner-actions').style.display = 'block';
        } else if (!wsM || wsM.role !== 'OWNER') {
          document.getElementById('billing-non-owner-note').style.display = 'block';
        }
        loadEl.style.display = 'none';
        bodyEl.style.display = 'block';
      } catch (e) {
        loadEl.style.display = 'none';
        errEl.textContent = e.message || 'Failed to load billing';
        errEl.style.display = 'flex';
      }
    })();
  }

  document.getElementById('upgrade-premium-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('upgrade-premium-btn');
    btn.disabled = true;
    try {
      const res = await apiFetch('/api/billing/checkout', { method: 'POST', body: JSON.stringify({ workspaceId: wsId, tier: 'PREMIUM' }) });
      if (res && res.url) window.location.href = res.url;
    } catch (e) {
      btn.disabled = false;
      toast(e.message || 'Checkout failed', 'error');
    }
  });

  document.getElementById('whatsapp-pay-btn')?.addEventListener('click', async () => {
    try {
      const res = await apiFetch('/api/billing/whatsapp-link?workspaceId=' + encodeURIComponent(wsId));
      if (res && res.url) window.open(res.url, '_blank', 'noopener');
    } catch (e) { toast(e.message || 'Failed', 'error'); }
  });

  document.getElementById('delete-account-btn').addEventListener('click', async () => {
    if (!confirm('حذف الحساب نهائياً؟')) return;
    if (!confirm('هل أنت متأكد تماماً؟')) return;
    try {
      await apiFetch('/api/auth/account', { method: 'DELETE' });
      logout();
    } catch (e) { toast(e.message || 'Failed', 'error'); }
  });
})();
</script>`;

  return layout({ title: 'الإعدادات', active: 'settings', content, scripts });
}
