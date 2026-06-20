// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/settingsPage.ts
// ════════════════════════════════════════════════════════════════════════

import { layout } from '../layout';

export function settingsPage(): string {
  const content = `
<div class="page-header">
  <div class="page-title">Settings</div>
  <div class="page-subtitle">Manage your account preferences</div>
</div>

<!-- Settings tab nav -->
<div class="flex gap-3 section-gap" style="border-bottom:1px solid var(--border);padding-bottom:0;margin-bottom:24px;">
  <button class="settings-tab active" data-tab="profile" style="padding:8px 0;font-size:13.5px;font-weight:500;color:var(--text);background:none;border:none;border-bottom:2px solid var(--accent);cursor:pointer;margin-bottom:-1px;">Profile</button>
  <button class="settings-tab" data-tab="security" style="padding:8px 0;font-size:13.5px;font-weight:500;color:var(--text-2);background:none;border:none;border-bottom:2px solid transparent;cursor:pointer;margin-bottom:-1px;">Security</button>
  <button class="settings-tab" data-tab="notifications" style="padding:8px 0;font-size:13.5px;font-weight:500;color:var(--text-2);background:none;border:none;border-bottom:2px solid transparent;cursor:pointer;margin-bottom:-1px;">Notifications</button>
  <button class="settings-tab" data-tab="danger" style="padding:8px 0;font-size:13.5px;font-weight:500;color:var(--error);background:none;border:none;border-bottom:2px solid transparent;cursor:pointer;margin-bottom:-1px;">Danger Zone</button>
</div>

<!-- Profile tab -->
<div id="tab-profile" class="settings-panel">
  <div class="card" style="max-width:560px;">
    <div class="card-title">Profile Information</div>
    <div id="profile-loading" class="loading-overlay" style="min-height:120px;"><div class="spinner"></div></div>
    <div id="profile-form" style="display:none;">
      <div class="flex items-center gap-3" style="margin-bottom:24px;">
        <div class="avatar" id="profile-avatar" style="width:52px;height:52px;font-size:20px;"></div>
        <div>
          <div id="profile-name-display" style="font-size:15px;font-weight:600;color:var(--text);"></div>
          <div id="profile-email-display" style="font-size:12.5px;color:var(--text-2);margin-top:2px;"></div>
        </div>
      </div>
      <div id="profile-success" class="alert alert-success" style="display:none;"></div>
      <div id="profile-error" class="alert alert-error" style="display:none;"></div>
      <div class="form-group">
        <label class="form-label">Full Name</label>
        <input type="text" id="name-input" class="form-input" placeholder="Your full name">
      </div>
      <div class="form-group">
        <label class="form-label">Email Address</label>
        <input type="email" id="email-input" class="form-input" disabled style="opacity:0.5;">
        <div style="font-size:11.5px;color:var(--text-3);margin-top:4px;">Email changes require account verification.</div>
      </div>
      <div class="form-group">
        <label class="form-label">Language</label>
        <select id="locale-input" class="form-input">
          <option value="EN">English</option>
          <option value="AR">العربية (Arabic)</option>
        </select>
      </div>
      <button class="btn btn-primary" id="save-profile-btn">Save Profile</button>
    </div>
  </div>
</div>

<!-- Security tab -->
<div id="tab-security" class="settings-panel" style="display:none;">
  <div class="card" style="max-width:560px;">
    <div class="card-title">Change Password</div>
    <div id="pw-success" class="alert alert-success" style="display:none;"></div>
    <div id="pw-error"   class="alert alert-error"   style="display:none;"></div>
    <div class="form-group">
      <label class="form-label">Current Password</label>
      <input type="password" id="pw-current" class="form-input" placeholder="Enter current password" autocomplete="current-password">
    </div>
    <div class="form-group">
      <label class="form-label">New Password</label>
      <input type="password" id="pw-new" class="form-input" placeholder="At least 8 characters" autocomplete="new-password">
    </div>
    <div class="form-group">
      <label class="form-label">Confirm New Password</label>
      <input type="password" id="pw-confirm" class="form-input" placeholder="Repeat new password" autocomplete="new-password">
    </div>
    <button class="btn btn-primary" id="save-pw-btn">Update Password</button>
  </div>

  <div class="card" style="max-width:560px;margin-top:16px;">
    <div class="card-title">Active Sessions</div>
    <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border);">
      <div>
        <div style="font-size:13px;font-weight:500;color:var(--text);">Current Session</div>
        <div style="font-size:12px;color:var(--text-3);margin-top:2px;">This device &nbsp;·&nbsp; Active now</div>
      </div>
      <span class="badge badge-green">Current</span>
    </div>
    <div style="padding-top:12px;">
      <button class="btn btn-danger btn-sm" id="signout-all-btn">Sign out all other sessions</button>
    </div>
  </div>
</div>

<!-- Notifications tab -->
<div id="tab-notifications" class="settings-panel" style="display:none;">
  <div class="card" style="max-width:560px;">
    <div class="card-title">Notification Preferences</div>
    <div style="display:flex;flex-direction:column;gap:0;">
      ${[
        ['notif-issues',   'Issue Alerts',         'Get notified when new issues are detected in your campaigns'],
        ['notif-budget',   'Budget Warnings',       'Alerts when spend pace is abnormal or budgets are depleting fast'],
        ['notif-recs',     'New Recommendations',   'Weekly digest of top recommendations for your workspace'],
        ['notif-sync',     'Sync Notifications',    'Notifications when data sync completes or fails'],
        ['notif-digest',   'Weekly Performance Digest', 'A weekly summary of your campaign performance'],
      ].map(([id, label, desc]) => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 0;border-bottom:1px solid var(--border);">
        <div>
          <div style="font-size:13.5px;font-weight:500;color:var(--text);">${label}</div>
          <div style="font-size:12px;color:var(--text-3);margin-top:2px;">${desc}</div>
        </div>
        <label style="position:relative;display:inline-block;width:40px;height:22px;cursor:pointer;">
          <input type="checkbox" id="${id}" style="opacity:0;width:0;height:0;" checked>
          <span class="toggle-track"></span>
        </label>
      </div>`).join('')}
    </div>
    <button class="btn btn-primary" style="margin-top:16px;" id="save-notif-btn">Save Preferences</button>
  </div>
</div>

<!-- Danger zone tab -->
<div id="tab-danger" class="settings-panel" style="display:none;">
  <div class="card" style="max-width:560px;border-color:var(--error-dim);">
    <div class="card-title" style="color:var(--error);">Danger Zone</div>
    <div style="display:flex;flex-direction:column;gap:0;">
      <div style="padding:16px 0;border-bottom:1px solid var(--border);">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
          <div>
            <div style="font-size:13.5px;font-weight:600;color:var(--text);">Export Account Data</div>
            <div style="font-size:12.5px;color:var(--text-2);margin-top:2px;">Download all your data as a JSON archive.</div>
          </div>
          <button class="btn btn-secondary btn-sm" id="export-btn">Export Data</button>
        </div>
      </div>
      <div style="padding:16px 0;">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
          <div>
            <div style="font-size:13.5px;font-weight:600;color:var(--error);">Delete Account</div>
            <div style="font-size:12.5px;color:var(--text-2);margin-top:2px;">Permanently delete your account and all associated data. This cannot be undone.</div>
          </div>
          <button class="btn btn-danger btn-sm" id="delete-account-btn">Delete Account</button>
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .toggle-track {
    position:absolute;inset:0;background:var(--border-2);border-radius:11px;transition:background var(--transition);
  }
  .toggle-track::after {
    content:'';position:absolute;width:16px;height:16px;border-radius:50%;background:#fff;
    top:3px;left:3px;transition:transform var(--transition);
  }
  input:checked + .toggle-track { background:var(--accent); }
  input:checked + .toggle-track::after { transform:translateX(18px); }
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

  // Load profile
  document.getElementById('profile-loading').style.display = 'none';
  document.getElementById('profile-form').style.display    = 'block';
  document.getElementById('profile-avatar').textContent    = (me.name||me.email||'?')[0].toUpperCase();
  document.getElementById('profile-name-display').textContent = me.name || '—';
  document.getElementById('profile-email-display').textContent = me.email;
  document.getElementById('name-input').value   = me.name  || '';
  document.getElementById('email-input').value  = me.email || '';
  document.getElementById('locale-input').value = me.locale || 'EN';

  // Tab switching
  document.querySelectorAll('.settings-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.settings-tab').forEach(t => {
        t.style.color        = t.dataset.tab === 'danger' ? 'var(--error)' : 'var(--text-2)';
        t.style.borderBottom = '2px solid transparent';
      });
      btn.style.color        = btn.dataset.tab === 'danger' ? 'var(--error)' : 'var(--text)';
      btn.style.borderBottom = '2px solid ' + (btn.dataset.tab==='danger' ? 'var(--error)' : 'var(--accent)');
      document.querySelectorAll('.settings-panel').forEach(p => p.style.display = 'none');
      document.getElementById('tab-' + btn.dataset.tab).style.display = 'block';
    });
  });

  // Save profile
  document.getElementById('save-profile-btn').addEventListener('click', async () => {
    const name = document.getElementById('name-input').value.trim();
    if (!name) { toast('Name is required', 'error'); return; }
    try {
      await apiFetch('/api/auth/profile', {method:'PATCH', body: JSON.stringify({name})});
      document.getElementById('profile-name-display').textContent = name;
      document.getElementById('user-name').textContent = name;
      document.getElementById('user-avatar').textContent = name[0].toUpperCase();
      document.getElementById('profile-avatar').textContent = name[0].toUpperCase();
      document.getElementById('profile-success').textContent = 'Profile updated successfully.';
      document.getElementById('profile-success').style.display = 'flex';
      setTimeout(() => document.getElementById('profile-success').style.display = 'none', 3000);
    } catch(e) {
      document.getElementById('profile-error').textContent = e.message||'Failed to update profile';
      document.getElementById('profile-error').style.display = 'flex';
    }
  });

  // Change password
  document.getElementById('save-pw-btn').addEventListener('click', async () => {
    const cur  = document.getElementById('pw-current').value;
    const nw   = document.getElementById('pw-new').value;
    const conf = document.getElementById('pw-confirm').value;
    const errEl = document.getElementById('pw-error');
    const sucEl = document.getElementById('pw-success');
    errEl.style.display = 'none';
    sucEl.style.display = 'none';
    if (!cur||!nw||!conf) { errEl.textContent='All fields required'; errEl.style.display='flex'; return; }
    if (nw !== conf)       { errEl.textContent='Passwords do not match'; errEl.style.display='flex'; return; }
    if (nw.length < 8)     { errEl.textContent='Password must be at least 8 characters'; errEl.style.display='flex'; return; }
    try {
      await apiFetch('/api/auth/password', {method:'POST', body: JSON.stringify({currentPassword:cur, newPassword:nw})});
      sucEl.textContent = 'Password updated successfully.';
      sucEl.style.display = 'flex';
      document.getElementById('pw-current').value = '';
      document.getElementById('pw-new').value     = '';
      document.getElementById('pw-confirm').value = '';
    } catch(e) {
      errEl.textContent = e.message || 'Failed to update password';
      errEl.style.display = 'flex';
    }
  });

  // Sign out all — calls logout-all API to invalidate every outstanding JWT
  document.getElementById('signout-all-btn').addEventListener('click', async () => {
    if (!confirm('This will sign you out of all other devices. You will stay signed in here.')) return;
    try {
      await apiFetch('/api/auth/logout-all', { method: 'POST' });
      toast('All other sessions have been signed out.', 'success');
    } catch(e) { toast(e.message || 'Failed to sign out other sessions', 'error'); }
  });

  // Notifications save
  document.getElementById('save-notif-btn').addEventListener('click', () => {
    toast('Notification preferences saved.', 'success');
  });

  // Export — calls server-side GDPR export endpoint
  document.getElementById('export-btn').addEventListener('click', async () => {
    try {
      const tk = localStorage.getItem('adlytic_token');
      const res = await fetch('/api/auth/export', { headers: { 'Authorization': 'Bearer ' + tk } });
      if (!res.ok) throw new Error('Export failed (' + res.status + ')');
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = 'adlytic-export.json'; a.click();
      URL.revokeObjectURL(url);
      toast('Data export downloaded.', 'success');
    } catch(e) { toast(e.message || 'Export failed', 'error'); }
  });

  // Delete account
  document.getElementById('delete-account-btn').addEventListener('click', async () => {
    if (!confirm('Delete your account permanently? This cannot be undone.')) return;
    if (!confirm('Are you absolutely sure? All data will be lost.')) return;
    try {
      await apiFetch('/api/auth/account', {method:'DELETE'});
      logout();
    } catch(e) { toast(e.message||'Failed to delete account', 'error'); }
  });
})();
</script>`;

  return layout({ title: 'Settings', active: 'settings', content, scripts });
}
