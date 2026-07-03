// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/metaConnectPage.ts
//
//  Account picker shown after the Meta OAuth callback.
//  Reads the sessionId from the URL, fetches the list of ad accounts the
//  user authorised, and lets them pick which one to connect.
// ════════════════════════════════════════════════════════════════════════

import { layout } from '../layout';

export function metaConnectPage(sessionId: string): string {
  const content = `
<div class="page-header">
  <div class="page-title" id="page-title">اختر حساب الإعلانات</div>
  <div class="page-subtitle" id="page-subtitle">حدد حساب Meta الإعلاني الذي تريد تحليله</div>
</div>

<div id="connect-container" style="max-width:600px;">
  <div class="loading-overlay" style="min-height:200px;">
    <div class="spinner"></div>
    <div class="loading-text">Loading your ad accounts…</div>
  </div>
</div>

<style>
  .account-card {
    display:flex; align-items:center; gap:16px;
    padding:16px; border:1px solid var(--border); border-radius:var(--radius);
    background:var(--surface); cursor:pointer; transition:all var(--transition);
    margin-bottom:10px;
  }
  .account-card:hover { border-color:var(--accent); background:var(--surface-2); }
  .account-card.selected { border-color:var(--accent); background:var(--accent-dim); }
  .account-icon {
    width:44px; height:44px; background:var(--accent-dim); border-radius:10px;
    display:flex; align-items:center; justify-content:center; flex-shrink:0;
    font-size:20px;
  }
  .account-name { font-size:14px; font-weight:600; color:var(--text); }
  .account-meta { font-size:12px; color:var(--text-3); margin-top:3px; }
  .account-status-badge {
    margin-left:auto; flex-shrink:0;
  }
</style>`;

  const scripts = `<script>
(async () => {
  function lbl(en, ar) {
    return (window.__locale || 'EN') === 'AR' ? ar : en;
  }

  const token  = localStorage.getItem('adlytic_token');
  const wsId   = localStorage.getItem('adlytic_workspace_id');
  const sessionId = ${JSON.stringify(sessionId)};
  const container = document.getElementById('connect-container');

  if (!token || !wsId) {
    container.innerHTML = '<div class="alert alert-error">' + lbl('Your sign-in has expired. Please <a href="/login">log in</a> again.', 'انتهت جلستك. يرجى <a href="/login">تسجيل الدخول</a> مرة أخرى.') + '</div>';
    return;
  }

  if (!(await ensureAccountActive())) return;

  // Populate topbar user info + locale
  const me = await apiFetch('/api/auth/me');
  if (me) {
    window.__locale = (me.locale || 'EN').toUpperCase();
    if (window.__locale === 'AR') {
      document.getElementById('page-title').textContent = 'اختر حساب الإعلانات';
      document.getElementById('page-subtitle').textContent = 'حدد حساب Meta الإعلاني الذي تريد تحليله';
    }
    document.getElementById('user-name').textContent  = me.name || me.email;
    document.getElementById('user-email').textContent = me.email;
    document.getElementById('user-avatar').textContent = (me.name || me.email || '?')[0].toUpperCase();
    const wsM = me.memberships?.find(m => m.workspaceId === wsId) || me.memberships?.[0];
    document.getElementById('ws-name').textContent = wsM?.workspace?.name || 'Workspace';
  }

  if (!sessionId) {
    container.innerHTML = '<div class="alert alert-error">' + lbl('This connection link is no longer valid. <a href="/welcome">Go back and try again.</a>', 'رابط الربط لم يعد صالحاً. <a href="/welcome">ارجع وحاول مرة أخرى.</a>') + '</div>';
    return;
  }

  // Fetch accounts from server session
  let accounts = [];
  try {
    const res = await apiFetch('/api/meta/oauth/accounts/' + sessionId);
    accounts = res?.accounts ?? [];
  } catch(e) {
    container.innerHTML = '<div class="alert alert-error">' + lbl('Could not load your ad accounts. <a href="/welcome">Go back and try again.</a>', 'تعذر تحميل حسابات الإعلانات. <a href="/welcome">ارجع وحاول مرة أخرى.</a>') + '</div>';
    return;
  }

  if (!accounts.length) {
    container.innerHTML = \`
      <div class="card">
        <div class="empty-state">
          <div class="empty-icon">📣</div>
          <div class="empty-title">\${lbl('No ad accounts found', 'لم يتم العثور على حسابات إعلانات')}</div>
          <div class="empty-text">\${lbl('Your Meta user doesn\\'t have access to any ad accounts. Make sure you have a Business Manager account with at least one ad account.', 'لا يملك مستخدم Meta لديك وصولاً إلى أي حسابات إعلانات. تأكد من وجود Business Manager بحساب إعلانات واحد على الأقل.')}</div>
          <a href="/welcome" class="btn btn-secondary" style="margin-top:16px;">\${lbl('Back', 'رجوع')}</a>
        </div>
      </div>\`;
    return;
  }

  function redirectAfterConnect(res) {
    var url = '/dashboard?connected=1';
    if (res && res.syncJobId) url += '&syncJob=' + encodeURIComponent(res.syncJobId);
    window.location.href = url;
  }

  // Shared connect routine — used by both the auto-connect path and the picker.
  async function performConnect(accountId, onError) {
    try {
      const res = await apiFetch('/api/meta/oauth/connect', {
        method: 'POST',
        body: JSON.stringify({ sessionId, externalAccountId: accountId, workspaceId: wsId }),
      });
      if (res?.success) {
        redirectAfterConnect(res);
        return;
      }
      throw new Error(res?.error || 'Connection failed');
    } catch (e) {
      onError(e);
    }
  }

  // Task 3: if the user has exactly one ad account, skip the picker entirely.
  if (accounts.length === 1) {
    const only = accounts[0];
    container.innerHTML = \`
      <div class="card">
        <div style="display:flex;align-items:center;gap:14px;padding:8px 4px 16px;">
          <div class="account-icon">📣</div>
          <div style="flex:1;min-width:0;">
            <div class="account-name">\${only.name}</div>
            <div class="account-meta">\${only.currency} · \${only.timezone_name || 'UTC'}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;color:var(--text-2);font-size:13px;">
          <span class="spinner" style="width:14px;height:14px;border-width:2px;"></span>
          \${lbl('Connecting your ad account…', 'جارٍ ربط حساب الإعلانات…')}
        </div>
      </div>\`;
    await performConnect(only.id, (e) => {
      container.innerHTML = '<div class="alert alert-error">' + lbl('Could not connect this ad account. <a href="/welcome">Go back and try again.</a>', 'تعذر ربط حساب الإعلانات. <a href="/welcome">ارجع وحاول مرة أخرى.</a>') + '</div>';
      toast(e.message || lbl('Could not connect this ad account.', 'تعذر ربط حساب الإعلانات.'), 'error');
    });
    return;
  }

  let selectedId = null;
  let connecting = false;

  function render() {
    container.innerHTML = \`
      <div class="card">
        <div class="card-title" style="margin-bottom:16px;">\${lbl('Your Ad Accounts', 'حسابات الإعلانات')} (\${accounts.length})</div>
        \${accounts.map(a => \`
          <div class="account-card \${selectedId === a.id ? 'selected' : ''}" data-id="\${a.id}">
            <div class="account-icon">📣</div>
            <div style="flex:1;min-width:0;">
              <div class="account-name">\${a.name}</div>
              <div class="account-meta">\${a.currency} &nbsp;·&nbsp; \${a.timezone_name || 'UTC'}</div>
            </div>
            <div class="account-status-badge">
              <span class="badge \${a.account_status === 1 ? 'badge-green' : 'badge-gray'}">\${a.account_status === 1 ? lbl('Active', 'نشطة') : lbl('Inactive', 'معطّلة')}</span>
            </div>
          </div>
        \`).join('')}
        <div style="margin-top:20px;display:flex;gap:12px;align-items:center;">
          <button class="btn btn-primary" id="connect-btn" \${!selectedId ? 'disabled' : ''}>
            \${connecting ? '<span class="spinner" style="width:14px;height:14px;border-width:2px;"></span> ' + lbl('Connecting…', 'جارٍ الربط…') : lbl('Connect Selected Account', 'ربط الحساب المحدد')}
          </button>
          <a href="/welcome" class="btn btn-ghost">\${lbl('Cancel', 'إلغاء')}</a>
          \${!selectedId ? '<span style="font-size:12px;color:var(--text-3);">' + lbl('Select an account above', 'اختر حساباً أعلاه') + '</span>' : ''}
        </div>
      </div>
    \`;

    // Account card click
    container.querySelectorAll('.account-card').forEach(card => {
      card.addEventListener('click', () => {
        selectedId = card.dataset.id;
        render();
      });
    });

    // Connect button
    const connectBtn = document.getElementById('connect-btn');
    if (connectBtn && selectedId) {
      connectBtn.addEventListener('click', async () => {
        if (connecting || !selectedId) return;
        connecting = true;
        render();
        await performConnect(selectedId, (e) => {
          connecting = false;
          render();
          toast(e.message || lbl('Could not connect this ad account.', 'تعذر ربط حساب الإعلانات.'), 'error');
        });
      });
    }
  }

  render();
})();
</script>`;

  return layout({ title: 'Connect Meta Ads', active: 'dashboard', content, scripts });
}
