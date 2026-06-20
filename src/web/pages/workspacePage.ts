// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/workspacePage.ts
// ════════════════════════════════════════════════════════════════════════

import { layout } from '../layout';

export function workspacePage(): string {
  const content = `
<div class="page-header">
  <div class="page-title">Workspace</div>
  <div class="page-subtitle">Manage workspace settings and team members</div>
</div>

<!-- Workspace info card -->
<div class="card section-gap">
  <div class="flex items-center justify-between" style="margin-bottom:20px;">
    <div class="card-title" style="margin-bottom:0">Workspace Settings</div>
    <button class="btn btn-primary btn-sm" id="save-ws-btn">Save Changes</button>
  </div>
  <div id="ws-info-loading" class="loading-overlay"><div class="spinner"></div></div>
  <div id="ws-info-form" style="display:none;">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
      <div class="form-group" style="margin-bottom:0;">
        <label class="form-label">Workspace Name</label>
        <input type="text" id="ws-name-input" class="form-input" placeholder="My Workspace">
      </div>
      <div class="form-group" style="margin-bottom:0;">
        <label class="form-label">Plan</label>
        <input type="text" id="ws-plan-input" class="form-input" disabled style="opacity:0.5;">
      </div>
      <div class="form-group" style="margin-bottom:0;">
        <label class="form-label">Industry Profile</label>
        <select id="ws-industry-select" class="form-input">
          <option value="">— No industry —</option>
        </select>
      </div>
      <div class="form-group" style="margin-bottom:0;">
        <label class="form-label">Workspace ID</label>
        <input type="text" id="ws-id-input" class="form-input" disabled style="opacity:0.5;font-family:monospace;font-size:12px;">
      </div>
    </div>
  </div>
</div>

<!-- Ad Accounts -->
<div class="card section-gap">
  <div class="flex items-center justify-between" style="margin-bottom:16px;">
    <div class="card-title" style="margin-bottom:0;">Connected Ad Accounts</div>
    <button class="btn btn-primary btn-sm" id="connect-meta-btn">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Connect Meta Ads
    </button>
  </div>
  <div id="ad-accounts-container">
    <div class="loading-overlay" style="min-height:80px;"><div class="spinner"></div></div>
  </div>
</div>

<!-- Manual token modal (shown when OAuth not configured) -->
<div id="manual-token-modal" class="modal-overlay" style="display:none;">
  <div class="modal">
    <div class="modal-title">Connect Meta Ads (Manual)</div>
    <div class="modal-subtitle">Enter your Meta access token and ad account ID. You can get these from <a href="https://developers.facebook.com/tools/explorer/" target="_blank" style="color:var(--accent)">Meta Graph API Explorer</a>.</div>
    <div id="manual-error" class="alert alert-error" style="display:none;"></div>
    <div class="form-group">
      <label class="form-label">Access Token</label>
      <input type="password" id="manual-token" class="form-input" placeholder="EAABwzLixnjYBO...">
    </div>
    <div class="form-group">
      <label class="form-label">Ad Account ID</label>
      <input type="text" id="manual-account-id" class="form-input" placeholder="act_123456789 or 123456789">
    </div>
    <div class="form-group">
      <label class="form-label">Account Name (optional)</label>
      <input type="text" id="manual-account-name" class="form-input" placeholder="My Business Account">
    </div>
    <div class="form-group">
      <label class="form-label">Currency</label>
      <select id="manual-currency" class="form-input">
        <option value="IQD">IQD — Iraqi Dinar</option>
        <option value="USD">USD — US Dollar</option>
        <option value="EUR">EUR — Euro</option>
        <option value="GBP">GBP — British Pound</option>
        <option value="AED">AED — UAE Dirham</option>
        <option value="SAR">SAR — Saudi Riyal</option>
      </select>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="manual-cancel">Cancel</button>
      <button class="btn btn-primary" id="manual-confirm">Connect Account</button>
    </div>
  </div>
</div>

<!-- Members -->
<div class="table-wrap section-gap">
  <div class="table-header">
    <span class="table-title">Team Members</span>
    <button class="btn btn-primary btn-sm" id="invite-btn">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Invite Member
    </button>
  </div>
  <div id="members-container">
    <div class="loading-overlay" style="min-height:120px;"><div class="spinner"></div></div>
  </div>
</div>

<!-- Danger zone -->
<div class="card" style="border-color:var(--error-dim);">
  <div class="card-title" style="color:var(--error);">Danger Zone</div>
  <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
    <div>
      <div style="font-size:13.5px;font-weight:600;color:var(--text);">Leave Workspace</div>
      <div style="font-size:12.5px;color:var(--text-2);margin-top:2px;">You will lose access to this workspace and all its data.</div>
    </div>
    <button class="btn btn-danger btn-sm" id="leave-btn">Leave Workspace</button>
  </div>
</div>

<!-- Invite modal -->
<div id="invite-modal" class="modal-overlay" style="display:none;">
  <div class="modal">
    <div class="modal-title">Invite Team Member</div>
    <div class="modal-subtitle">Enter the email of an existing Adlytic user to add them to this workspace.</div>
    <div id="invite-error" class="alert alert-error" style="display:none;"></div>
    <div class="form-group">
      <label class="form-label">Email Address</label>
      <input type="email" id="invite-email" class="form-input" placeholder="colleague@company.com">
    </div>
    <div class="form-group">
      <label class="form-label">Role</label>
      <select id="invite-role" class="form-input">
        <option value="VIEWER">Viewer — read-only access</option>
        <option value="MANAGER">Manager — can manage campaigns</option>
        <option value="OWNER">Owner — full access</option>
      </select>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="invite-cancel">Cancel</button>
      <button class="btn btn-primary" id="invite-confirm">Send Invite</button>
    </div>
  </div>
</div>`;

  const scripts = `<script>
(async () => {
  console.log('[WS:1] script started');
  const token = localStorage.getItem('adlytic_token');
  if (!token) { console.log('[WS:1a] no token → redirect /login'); window.location.href = '/login'; return; }
  const wsId = localStorage.getItem('adlytic_workspace_id');
  if (!wsId) { console.log('[WS:1b] no wsId → redirect /dashboard'); window.location.href = '/dashboard'; return; }
  console.log('[WS:2] token OK, wsId =', wsId);

  console.log('[WS:3] fetching /api/auth/me ...');
  const me = await apiFetch('/api/auth/me');
  console.log('[WS:4] /api/auth/me result:', me ? 'OK (user=' + (me.email||'?') + ')' : 'NULL (401 → logout)');
  if (!me) return;
  document.getElementById('user-name').textContent  = me.name || me.email;
  document.getElementById('user-email').textContent = me.email;
  document.getElementById('user-avatar').textContent = (me.name||me.email||'?')[0].toUpperCase();
  const myMembership = me.memberships?.find(m => m.workspaceId === wsId);
  document.getElementById('ws-name').textContent = myMembership?.workspace?.name || 'Workspace';
  const myRole = myMembership?.role || 'VIEWER';
  const canManage = myRole === 'OWNER' || myRole === 'MANAGER';
  console.log('[WS:5] membership found:', !!myMembership, '| role:', myRole);

  async function loadWorkspace() {
    console.log('[WS:6] loadWorkspace() — fetching /api/workspaces/' + wsId + ' ...');
    const ws = await apiFetch('/api/workspaces/' + wsId);
    console.log('[WS:7] workspace fetch result:', ws ? 'OK (adAccounts=' + (ws.adAccounts?.length ?? 0) + ')' : 'NULL');
    document.getElementById('ws-info-loading').style.display = 'none';
    if (!ws) {
      console.log('[WS:7a] ws null — clearing ad-accounts-container');
      document.getElementById('ad-accounts-container').innerHTML =
        '<div class="empty-state" style="padding:24px;"><div class="empty-title">Could not load accounts</div></div>';
      return;
    }
    document.getElementById('ws-info-form').style.display = 'block';
    document.getElementById('ws-name-input').value  = ws.name || '';
    document.getElementById('ws-plan-input').value  = ws.plan || 'free';
    document.getElementById('ws-id-input').value    = ws.id || '';
    console.log('[WS:8] ws-info-form populated');

    // Ad accounts
    const accs = ws.adAccounts || [];
    document.getElementById('ad-accounts-container').innerHTML = accs.length
      ? accs.map(a => \`
          <div style="display:flex;align-items:center;gap:12px;padding:14px 0;border-bottom:1px solid var(--border);">
            <div style="width:38px;height:38px;background:var(--accent-dim);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:18px;">📣</div>
            <div style="flex:1;min-width:0;">
              <div style="font-size:13.5px;font-weight:600;color:var(--text);">\${a.name}</div>
              <div style="font-size:11.5px;color:var(--text-3);margin-top:2px;">\${a.currency} · \${a.externalAccountId}</div>
            </div>
            <div style="font-size:11.5px;color:var(--text-3);margin-right:8px;">
              \${a.lastSyncedAt ? 'Synced ' + new Date(a.lastSyncedAt).toLocaleDateString() : 'Never synced'}
            </div>
            <span class="badge \${a.status==='ACTIVE'?'badge-green':'badge-gray'}" style="margin-right:8px;">\${a.status}</span>
            \${a.status === 'ACTIVE'
              ? \`<button class="btn btn-ghost btn-sm sync-now-btn" data-aid="\${a.id}" title="Sync now">↻ Sync</button>\`
              : \`<button class="btn btn-primary btn-sm" style="font-size:12px;" onclick="document.getElementById('connect-meta-btn').click()" title="Token expired — reconnect">⚠ Reconnect</button>\`
            }
            <button class="btn btn-danger btn-sm disconnect-btn" data-aid="\${a.id}" data-name="\${a.name}" title="Disconnect">✕</button>
          </div>\`).join('')
      : \`<div class="empty-state" style="padding:32px;">
           <div class="empty-icon">📣</div>
           <div class="empty-title">No ad accounts connected</div>
           <div class="empty-text">Connect your Meta Ads account to start syncing campaign data and get AI-powered insights.</div>
           <button class="btn btn-primary" style="margin-top:16px;" onclick="document.getElementById('connect-meta-btn').click()">Connect Meta Ads</button>
         </div>\`;

    console.log('[WS:9] ad-accounts-container rendered (accs=' + accs.length + ')');

    // Sync now buttons
    document.querySelectorAll('.sync-now-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.textContent = '⏳ Syncing…';
        btn.disabled = true;
        try {
          const res = await apiFetch('/api/workspaces/' + wsId + '/sync', { method: 'POST' });
          if (res.status === 'sync_complete') {
            toast('Sync complete — ' + (res.rowsUpserted ?? 0) + ' rows updated', 'success');
            await loadWorkspace();
          } else if (res.status === 'sync_failed') {
            toast('Sync failed: ' + (res.error || 'Unknown error'), 'error');
          } else {
            toast('Sync complete', 'success');
            await loadWorkspace();
          }
        } catch(e) { toast(e.message || 'Sync failed', 'error'); }
        finally { btn.textContent = '↻ Sync'; btn.disabled = false; }
      });
    });

    // Disconnect buttons
    document.querySelectorAll('.disconnect-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Disconnect "' + btn.dataset.name + '"? Campaign data is preserved.')) return;
        try {
          await apiFetch('/api/workspaces/' + wsId + '/ad-accounts/' + btn.dataset.aid, { method: 'DELETE' });
          toast('Account disconnected', 'success');
          await loadWorkspace();
        } catch(e) { toast(e.message || 'Failed', 'error'); }
      });
    });
  }

  async function loadMembers() {
    console.log('[WS:10] loadMembers() — fetching /api/workspaces/' + wsId + '/members ...');
    const members = await apiFetch('/api/workspaces/' + wsId + '/members');
    console.log('[WS:11] members fetch result:', members ? 'OK (count=' + members.length + ')' : 'NULL');
    if (!members) {
      console.log('[WS:11a] members null — clearing members-container');
      document.getElementById('members-container').innerHTML =
        '<div class="empty-state" style="padding:24px;"><div class="empty-title">Could not load members</div></div>';
      return;
    }
    if (!members.length) {
      console.log('[WS:11b] members empty array — showing empty state');
      document.getElementById('members-container').innerHTML =
        '<div class="empty-state" style="padding:24px;"><div class="empty-title">No members</div></div>';
      return;
    }
    console.log('[WS:12] rendering members table (' + members.length + ' rows)');
    document.getElementById('members-container').innerHTML = \`
      <table>
        <thead><tr>
          <th>Member</th><th>Email</th><th>Role</th><th>Joined</th>\${canManage?'<th>Actions</th>':''}
        </tr></thead>
        <tbody>\${members.map(m => \`
          <tr data-member-id="\${m.id}" data-user-id="\${m.userId}">
            <td><div style="display:flex;align-items:center;gap:9px;">
              <div class="avatar" style="width:28px;height:28px;font-size:11px;">\${(m.user.name||m.user.email||'?')[0].toUpperCase()}</div>
              <span style="font-weight:500;">\${m.user.name||'—'}</span>
            </div></td>
            <td style="color:var(--text-2);">\${m.user.email}</td>
            <td>\${roleBadge(m.role)}</td>
            <td style="color:var(--text-3);font-size:12px;">\${new Date(m.createdAt).toLocaleDateString()}</td>
            \${canManage ? \`<td>
              <div style="display:flex;gap:6px;">
                \${m.userId !== me.id ? \`<button class="btn btn-ghost btn-sm change-role-btn" data-mid="\${m.id}" data-role="\${m.role}">Change Role</button>
                <button class="btn btn-danger btn-sm remove-btn" data-mid="\${m.id}" data-name="\${m.user.name||m.user.email}">Remove</button>\` : '<span style="font-size:12px;color:var(--text-3);">You</span>'}
              </div>
            </td>\` : ''}
          </tr>\`).join('')}
        </tbody>
      </table>\`;

    // Change role
    document.querySelectorAll('.change-role-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const mid = btn.dataset.mid;
        const cur = btn.dataset.role;
        const roles = ['VIEWER','MANAGER','OWNER'];
        const next = roles[(roles.indexOf(cur)+1) % roles.length];
        if (!confirm('Change role to ' + next + '?')) return;
        try {
          await apiFetch('/api/workspaces/' + wsId + '/members/' + mid, {
            method:'PATCH', body: JSON.stringify({role:next})
          });
          toast('Role updated to ' + next, 'success');
          await loadMembers();
        } catch(e) { toast(e.message||'Failed','error'); }
      });
    });

    // Remove member
    document.querySelectorAll('.remove-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const mid  = btn.dataset.mid;
        const name = btn.dataset.name;
        if (!confirm('Remove ' + name + ' from this workspace?')) return;
        try {
          await apiFetch('/api/workspaces/' + wsId + '/members/' + mid, {method:'DELETE'});
          toast('Member removed', 'success');
          await loadMembers();
        } catch(e) { toast(e.message||'Failed','error'); }
      });
    });
  }

  function roleBadge(role) {
    const map = {OWNER:'badge-blue',MANAGER:'badge-green',VIEWER:'badge-gray'};
    return '<span class="badge ' + (map[role]||'badge-gray') + '">' + role + '</span>';
  }

  // Save workspace
  document.getElementById('save-ws-btn').addEventListener('click', async () => {
    const name = document.getElementById('ws-name-input').value.trim();
    if (!name) { toast('Name is required','error'); return; }
    try {
      await apiFetch('/api/workspaces/' + wsId, {method:'PATCH', body: JSON.stringify({name})});
      document.getElementById('ws-name').textContent = name;
      toast('Workspace updated','success');
    } catch(e) { toast(e.message||'Failed','error'); }
  });

  // Invite modal
  document.getElementById('invite-btn').addEventListener('click', () => {
    document.getElementById('invite-modal').style.display = 'flex';
    document.getElementById('invite-email').value = '';
    document.getElementById('invite-error').style.display = 'none';
    setTimeout(() => document.getElementById('invite-email').focus(), 50);
  });
  document.getElementById('invite-cancel').addEventListener('click', () => {
    document.getElementById('invite-modal').style.display = 'none';
  });
  document.getElementById('invite-modal').addEventListener('click', e => {
    if (e.target === document.getElementById('invite-modal'))
      document.getElementById('invite-modal').style.display = 'none';
  });
  document.getElementById('invite-confirm').addEventListener('click', async () => {
    const email = document.getElementById('invite-email').value.trim();
    const role  = document.getElementById('invite-role').value;
    if (!email) { document.getElementById('invite-error').textContent='Email required'; document.getElementById('invite-error').style.display='flex'; return; }
    try {
      // Look up user by email via auth/me pattern — use a search or direct add
      // API: POST /api/workspaces/:wsId/members expects userId
      // We need to find userId from email — use the register endpoint to look it up
      // Actually, we'll try adding by email via a dedicated endpoint
      await apiFetch('/api/workspaces/' + wsId + '/members/invite', {
        method:'POST', body: JSON.stringify({email, role})
      });
      document.getElementById('invite-modal').style.display = 'none';
      toast('Invitation sent to ' + email, 'success');
      await loadMembers();
    } catch(e) {
      document.getElementById('invite-error').textContent = e.message || 'Failed to invite';
      document.getElementById('invite-error').style.display = 'flex';
    }
  });

  // Leave workspace
  document.getElementById('leave-btn').addEventListener('click', async () => {
    if (!myMembership) return;
    if (!confirm('Leave this workspace? You will lose all access.')) return;
    try {
      await apiFetch('/api/workspaces/' + wsId + '/members/' + myMembership.id, {method:'DELETE'});
      const remaining = me.memberships?.filter(m => m.workspaceId !== wsId);
      if (remaining?.length) {
        localStorage.setItem('adlytic_workspace_id', remaining[0].workspaceId);
        window.location.href = '/dashboard';
      } else {
        logout();
      }
    } catch(e) { toast(e.message||'Failed','error'); }
  });

  // ── Connect Meta Ads button ────────────────────────────────────────────
  document.getElementById('connect-meta-btn').addEventListener('click', async () => {
    try {
      const res = await apiFetch('/api/meta/oauth/start?workspaceId=' + wsId);
      if (res?.configured === false) {
        // OAuth not configured — show manual token modal
        document.getElementById('manual-token-modal').style.display = 'flex';
        setTimeout(() => document.getElementById('manual-token').focus(), 50);
      } else if (res?.url) {
        window.location.href = res.url;
      } else {
        toast(res?.message || 'OAuth not available', 'error');
      }
    } catch(e) { toast(e.message || 'Failed to start OAuth', 'error'); }
  });

  // ── Manual token modal ─────────────────────────────────────────────────
  document.getElementById('manual-cancel').addEventListener('click', () => {
    document.getElementById('manual-token-modal').style.display = 'none';
  });
  document.getElementById('manual-token-modal').addEventListener('click', e => {
    if (e.target === document.getElementById('manual-token-modal'))
      document.getElementById('manual-token-modal').style.display = 'none';
  });
  document.getElementById('manual-confirm').addEventListener('click', async () => {
    const accessToken = document.getElementById('manual-token').value.trim();
    const externalAccountId = document.getElementById('manual-account-id').value.trim();
    const name     = document.getElementById('manual-account-name').value.trim();
    const currency = document.getElementById('manual-currency').value;
    const errEl = document.getElementById('manual-error');
    errEl.style.display = 'none';
    if (!accessToken || !externalAccountId) {
      errEl.textContent = 'Access token and account ID are required';
      errEl.style.display = 'flex';
      return;
    }
    const confirmBtn = document.getElementById('manual-confirm');
    confirmBtn.textContent = 'Verifying…';
    confirmBtn.disabled = true;
    try {
      await apiFetch('/api/workspaces/' + wsId + '/ad-accounts', {
        method: 'POST',
        body: JSON.stringify({ accessToken, externalAccountId, name, currency }),
      });
      document.getElementById('manual-token-modal').style.display = 'none';
      toast('Meta Ads account connected! Running initial sync…', 'success');
      // Trigger initial sync and show result
      try {
        const syncRes = await apiFetch('/api/workspaces/' + wsId + '/sync', { method: 'POST' });
        if (syncRes.status === 'sync_complete') {
          toast('Initial sync complete — ' + (syncRes.rowsUpserted ?? 0) + ' rows loaded', 'success');
        } else if (syncRes.status === 'sync_failed') {
          toast('Sync failed: ' + (syncRes.error || 'Unknown'), 'error');
        }
      } catch(syncErr) { toast(syncErr.message || 'Sync failed', 'error'); }
      await loadWorkspace();
    } catch(e) {
      errEl.textContent = e.message || 'Failed to connect account';
      errEl.style.display = 'flex';
    } finally {
      confirmBtn.textContent = 'Connect Account';
      confirmBtn.disabled = false;
    }
  });

  // ── Handle post-OAuth redirect params ─────────────────────────────────
  const params = new URLSearchParams(window.location.search);
  if (params.get('connected') === '1') {
    toast('Meta Ads account connected! Initial sync started.', 'success');
    window.history.replaceState({}, '', '/workspace');
  }
  if (params.get('oauth_error')) {
    toast('Meta connection failed: ' + decodeURIComponent(params.get('oauth_error')), 'error');
    window.history.replaceState({}, '', '/workspace');
  }

  console.log('[WS:13] firing Promise.all([loadWorkspace, loadMembers])');
  try {
    await Promise.all([loadWorkspace(), loadMembers()]);
    console.log('[WS:14] Promise.all resolved — both loads complete');
  } catch(e) {
    console.error('[WS:CATCH] Promise.all threw:', e.message);
    document.getElementById('ws-info-loading').style.display = 'none';
    const errHtml = '<div class="empty-state" style="padding:24px;"><div class="empty-title">Failed to load</div></div>';
    const ac = document.getElementById('ad-accounts-container');
    const mc = document.getElementById('members-container');
    if (ac && ac.querySelector('.loading-overlay')) { console.log('[WS:CATCH] clearing ad-accounts-container'); ac.innerHTML = errHtml; }
    if (mc && mc.querySelector('.loading-overlay')) { console.log('[WS:CATCH] clearing members-container'); mc.innerHTML = errHtml; }
    toast(e.message || 'Failed to load workspace', 'error');
  }
  console.log('[WS:15] IIFE complete');
})();
</script>`;

  return layout({ title: 'Workspace', active: 'workspace', content, scripts });
}
