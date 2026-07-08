// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/workspacePage.ts
//  Structural redesign: connection-first SaaS hub (Meta → sync → team).
//  Backend still uses primary ad account; UI now matches that model.
// ════════════════════════════════════════════════════════════════════════

import { layout } from '../layout';

export function workspacePage(): string {
  const content = `
<div class="ws-page">
  <div class="page-header ws-header">
    <div>
      <div class="page-title">مساحة العمل</div>
      <div class="page-subtitle">اربط حساب Meta، زامن البيانات، ثم أدر الفريق</div>
    </div>
  </div>

  <!-- 1 ▸ Connection hero (primary job of this page) -->
  <section class="ws-hero" id="ws-connection-hero">
    <div class="ws-hero-loading" id="ws-hero-loading">
      <div class="loading-overlay" style="min-height:120px;"><div class="spinner"></div></div>
    </div>
    <div id="ws-hero-body" style="display:none;"></div>
  </section>

  <!-- Manual token modal -->
  <div id="manual-token-modal" class="modal-overlay" style="display:none;">
    <div class="modal">
      <div class="modal-title">ربط Meta يدوياً</div>
      <div class="modal-subtitle">أدخل رمز الوصول ومعرّف الحساب من أدوات Meta. يُفضَّل الربط بنقرة واحدة عند توفره.</div>
      <div id="manual-reason" class="alert alert-warning" style="display:none;margin-bottom:12px;font-size:12.5px;"></div>
      <div id="manual-error" class="alert alert-error" style="display:none;"></div>
      <div class="form-group">
        <label class="form-label">رمز الوصول</label>
        <input type="password" id="manual-token" class="form-input" placeholder="EAABwzLixnjYBO...">
      </div>
      <div class="form-group">
        <label class="form-label">معرّف الحساب الإعلاني</label>
        <input type="text" id="manual-account-id" class="form-input" placeholder="act_123456789">
      </div>
      <div class="form-group">
        <label class="form-label">اسم الحساب (اختياري)</label>
        <input type="text" id="manual-account-name" class="form-input" placeholder="حساب نشاطي التجاري">
      </div>
      <p style="font-size:12.5px;color:var(--text-2);margin:0 0 12px;">تُكتشف العملة تلقائياً من حساب Meta.</p>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="manual-cancel">إلغاء</button>
        <button class="btn btn-primary" id="manual-confirm">ربط الحساب</button>
      </div>
    </div>
  </div>

  <!-- 2 ▸ Workspace identity (secondary) -->
  <section class="ws-panel section-gap">
    <div class="ws-panel-head">
      <div>
        <div class="ws-panel-title">هوية مساحة العمل</div>
        <div class="ws-panel-sub">الاسم الظاهر للفريق في الشريط العلوي</div>
      </div>
      <button class="btn btn-primary btn-sm" id="save-ws-btn">حفظ الاسم</button>
    </div>
    <div id="ws-info-loading" class="loading-overlay" style="min-height:60px;"><div class="spinner"></div></div>
    <div id="ws-info-form" style="display:none;">
      <div class="ws-identity-grid">
        <div class="form-group" style="margin-bottom:0;">
          <label class="form-label">اسم مساحة العمل</label>
          <input type="text" id="ws-name-input" class="form-input" placeholder="مساحة عملي">
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label class="form-label">الخطة</label>
          <input type="text" id="ws-plan-input" class="form-input" disabled style="opacity:0.55;">
        </div>
      </div>
      <div class="ws-id-row">
        <span class="ws-id-label">المعرّف</span>
        <code id="ws-id-input" class="ws-id-value">—</code>
      </div>
    </div>
  </section>

  <!-- 3 ▸ Team -->
  <section class="ws-panel section-gap">
    <div class="ws-panel-head">
      <div>
        <div class="ws-panel-title">الفريق</div>
        <div class="ws-panel-sub">ادعُ زملاءك بصلاحيات واضحة</div>
      </div>
      <button class="btn btn-primary btn-sm" id="invite-btn">دعوة عضو</button>
    </div>
    <div id="members-container">
      <div class="loading-overlay" style="min-height:100px;"><div class="spinner"></div></div>
    </div>
  </section>

  <!-- 4 ▸ Danger -->
  <section class="ws-panel ws-danger">
    <div class="ws-panel-title" style="color:var(--error);">مغادرة مساحة العمل</div>
    <div class="ws-danger-row">
      <div class="ws-panel-sub" style="margin:0;">ستفقد الوصول إلى هذه المساحة وبياناتها.</div>
      <button class="btn btn-danger btn-sm" id="leave-btn">مغادرة</button>
    </div>
  </section>
</div>

<!-- Invite modal -->
<div id="invite-modal" class="modal-overlay" style="display:none;">
  <div class="modal">
    <div class="modal-title">دعوة عضو</div>
    <div class="modal-subtitle">أدخل بريد مستخدم موجود في Adlytic.</div>
    <div id="invite-error" class="alert alert-error" style="display:none;"></div>
    <div class="form-group">
      <label class="form-label">البريد الإلكتروني</label>
      <input type="email" id="invite-email" class="form-input" placeholder="colleague@company.com">
    </div>
    <div class="form-group">
      <label class="form-label">الدور</label>
      <select id="invite-role" class="form-input">
        <option value="VIEWER">مشاهد — قراءة فقط</option>
        <option value="MANAGER">مدير — إدارة الحملات</option>
        <option value="OWNER">مالك — صلاحيات كاملة</option>
      </select>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="invite-cancel">إلغاء</button>
      <button class="btn btn-primary" id="invite-confirm">إرسال الدعوة</button>
    </div>
  </div>
</div>

<style>
  .ws-page { direction: rtl; max-width: 880px; margin: 0 auto; }
  .ws-header { margin-bottom: 18px; }
  .ws-hero {
    background:
      linear-gradient(160deg, rgba(217,167,89,0.1), transparent 45%),
      var(--surface);
    border: 1px solid rgba(217,167,89,0.22);
    border-radius: 18px;
    padding: 20px;
    margin-bottom: 18px;
  }
  .ws-hero-empty, .ws-hero-connected { display: grid; gap: 16px; }
  .ws-hero-kicker { font-size: 11px; font-weight: 800; color: var(--accent-2); letter-spacing: 0.04em; }
  .ws-hero-title { font-size: 20px; font-weight: 800; color: var(--text); letter-spacing: -0.02em; }
  .ws-hero-text { font-size: 13.5px; color: var(--text-2); line-height: 1.6; max-width: 46ch; }
  .ws-hero-actions { display: flex; flex-wrap: wrap; gap: 10px; }
  .ws-account-card {
    display: grid; grid-template-columns: auto 1fr auto; gap: 14px; align-items: center;
    padding: 14px 16px; border-radius: 14px;
    background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07);
  }
  @media (max-width: 640px) {
    .ws-account-card { grid-template-columns: 1fr; }
  }
  .ws-account-icon {
    width: 44px; height: 44px; border-radius: 12px;
    background: var(--accent-dim); color: var(--accent-2);
    display: grid; place-items: center; font-weight: 800; font-size: 13px;
  }
  .ws-account-name { font-size: 15px; font-weight: 800; color: var(--text); }
  .ws-account-meta { font-size: 12px; color: var(--text-3); margin-top: 3px; font-variant-numeric: tabular-nums; }
  .ws-account-note { font-size: 12px; margin-top: 6px; }
  .ws-account-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
  .ws-status-pill {
    display: inline-flex; align-items: center; gap: 6px;
    font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 999px;
  }
  .ws-status-pill.ok { background: var(--success-dim); color: var(--success); }
  .ws-status-pill.warn { background: rgba(199,122,31,0.12); color: var(--warning); }
  .ws-status-pill.bad { background: var(--error-dim); color: var(--error); }
  .ws-extra-note {
    font-size: 12px; color: var(--text-3); line-height: 1.5;
    padding: 10px 12px; border-radius: 10px; background: rgba(255,255,255,0.02);
    border: 1px solid rgba(255,255,255,0.05);
  }
  .ws-panel {
    background: var(--surface); border: 1px solid rgba(255,255,255,0.07);
    border-radius: 16px; padding: 18px 18px 16px;
  }
  .ws-panel-head {
    display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
    margin-bottom: 14px; flex-wrap: wrap;
  }
  .ws-panel-title { font-size: 14px; font-weight: 800; color: var(--text); }
  .ws-panel-sub { font-size: 12.5px; color: var(--text-3); margin-top: 3px; }
  .ws-identity-grid { display: grid; grid-template-columns: 1.4fr 0.8fr; gap: 14px; }
  @media (max-width: 640px) { .ws-identity-grid { grid-template-columns: 1fr; } }
  .ws-id-row {
    display: flex; align-items: center; gap: 10px; margin-top: 14px;
    padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.05);
  }
  .ws-id-label { font-size: 11px; font-weight: 700; color: var(--text-3); }
  .ws-id-value {
    font-size: 11.5px; color: var(--text-2); background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 4px 8px;
  }
  .ws-danger { border-color: rgba(220,80,80,0.25); }
  .ws-danger-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-top: 8px; }
  .ws-member-table { width: 100%; border-collapse: collapse; }
  .ws-member-table th {
    text-align: start; font-size: 11px; font-weight: 700; color: var(--text-3);
    padding: 8px 6px; border-bottom: 1px solid rgba(255,255,255,0.06);
  }
  .ws-member-table td {
    padding: 12px 6px; border-bottom: 1px solid rgba(255,255,255,0.04);
    font-size: 13px; color: var(--text);
  }
  .ws-role-actions { display: flex; gap: 6px; flex-wrap: wrap; }
</style>`;

  const scripts = `<script>
(async () => {
  const token = localStorage.getItem('adlytic_token');
  if (!token) { window.location.href = '/login'; return; }
  const wsId = localStorage.getItem('adlytic_workspace_id');
  if (!wsId) { window.location.href = '/dashboard'; return; }

  const me = await apiFetch('/api/auth/me');
  if (!me) return;
  document.getElementById('user-name').textContent  = me.name || me.email;
  document.getElementById('user-email').textContent = me.email;
  document.getElementById('user-avatar').textContent = (me.name||me.email||'?')[0].toUpperCase();
  const myMembership = me.memberships?.find(m => m.workspaceId === wsId);
  document.getElementById('ws-name').textContent = myMembership?.workspace?.name || 'مساحة العمل';
  const myRole = myMembership?.role || 'VIEWER';
  const canManage = myRole === 'OWNER' || myRole === 'MANAGER';

  function escAttr(s) {
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')
      .replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function roleLabel(role) {
    if (role === 'OWNER') return 'مالك';
    if (role === 'MANAGER') return 'مدير';
    return 'مشاهد';
  }
  function roleBadge(role) {
    const map = {OWNER:'badge-blue',MANAGER:'badge-green',VIEWER:'badge-gray'};
    return '<span class="badge ' + (map[role]||'badge-gray') + '">' + roleLabel(role) + '</span>';
  }

  function openManualTokenModal(opts) {
    const reasonEl = document.getElementById('manual-reason');
    if (opts && opts.reason) {
      reasonEl.textContent = friendlyConnectReason(opts.reason);
      reasonEl.style.display = 'flex';
    } else {
      reasonEl.textContent = '';
      reasonEl.style.display = 'none';
    }
    document.getElementById('manual-error').style.display = 'none';
    document.getElementById('manual-token-modal').style.display = 'flex';
    setTimeout(() => document.getElementById('manual-token').focus(), 50);
  }

  function friendlyConnectReason(reason) {
    if (!reason) return 'ربط Meta غير متاح مؤقتاً.';
    const r = String(reason).toLowerCase();
    if (r.includes('fb login for business') || r.includes('meta_login_config_id')) {
      return 'تسجيل دخول Meta للأعمال غير مكتمل الإعداد على الخادم. تواصل مع المسؤول.';
    }
    if (r.includes('meta_app_id') || r.includes('meta_app_secret')) {
      return 'ربط Meta غير مُعدّ على هذا الخادم بعد. تواصل مع المسؤول.';
    }
    if (r.includes('redirect_uri') || r.includes('api_version')) {
      return 'إعدادات ربط Meta على الخادم غير صحيحة. تواصل مع المسؤول.';
    }
    return 'ربط Meta غير متاح مؤقتاً.';
  }

  async function startMetaConnect() {
    try {
      const res = await apiFetch('/api/meta/oauth/start?workspaceId=' + wsId);
      if (res?.url) {
        window.location.href = res.url;
      } else if (res?.configured === false) {
        openManualTokenModal({ reason: res?.reason });
      } else {
        toast('ربط Meta غير متاح مؤقتاً.', 'error');
      }
    } catch(e) { toast(e.message || 'تعذّر بدء الربط', 'error'); }
  }

  function renderConnectionHero(ws) {
    const body = document.getElementById('ws-hero-body');
    const loading = document.getElementById('ws-hero-loading');
    loading.style.display = 'none';
    body.style.display = 'block';

    const accs = Array.isArray(ws.adAccounts) ? ws.adAccounts.slice() : [];
    // Product uses primary account (oldest) — surface that clearly.
    accs.sort(function(a, b) {
      return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
    });
    const primary = accs[0] || null;
    const extras = accs.slice(1);
    const now = Date.now();

    if (!primary) {
      body.innerHTML = \`
        <div class="ws-hero-empty">
          <div class="ws-hero-kicker">الخطوة الأولى</div>
          <div class="ws-hero-title">اربط حساب إعلانات Meta</div>
          <div class="ws-hero-text">بعد الربط نزامن الحملات تلقائياً ونحوّل الأرقام إلى توصيات عربية بسيطة.</div>
          <div class="ws-hero-actions">
            <button class="btn btn-primary" id="connect-meta-btn">ربط إعلانات Meta</button>
            <button type="button" class="btn btn-ghost btn-sm" id="connect-manual-btn">الربط يدوياً</button>
          </div>
        </div>\`;
      document.getElementById('connect-meta-btn').addEventListener('click', startMetaConnect);
      document.getElementById('connect-manual-btn').addEventListener('click', () => openManualTokenModal());
      return;
    }

    const expiresAt = primary.tokenExpiresAt ? new Date(primary.tokenExpiresAt).getTime() : null;
    const isExpired = expiresAt !== null && expiresAt <= now;
    const expiresSoon = expiresAt !== null && !isExpired && (expiresAt - now) < 7 * 86400000;
    const needsReconnect = primary.status !== 'ACTIVE' || isExpired;
    const statusPill = needsReconnect
      ? '<span class="ws-status-pill bad">يحتاج إعادة ربط</span>'
      : expiresSoon
        ? '<span class="ws-status-pill warn">تنتهي الصلاحية قريباً</span>'
        : '<span class="ws-status-pill ok">متصل</span>';
    const note = isExpired
      ? 'انتهت صلاحية الوصول — أعد الربط لاستعادة المزامنة'
      : expiresSoon
        ? 'تنتهي صلاحية الوصول في ' + new Date(expiresAt).toLocaleDateString('ar-u-nu-latn')
        : (primary.lastSyncedAt
          ? 'آخر مزامنة: ' + new Date(primary.lastSyncedAt).toLocaleString('ar-u-nu-latn')
          : 'لم تتم المزامنة بعد');
    const noteColor = (isExpired || expiresSoon) ? 'var(--warning)' : 'var(--text-3)';

    body.innerHTML = \`
      <div class="ws-hero-connected">
        <div class="ws-hero-kicker">حساب Meta المرتبط</div>
        <div class="ws-account-card">
          <div class="ws-account-icon">Meta</div>
          <div>
            <div class="ws-account-name">\${escHtml(primary.name || 'حساب إعلاني')}</div>
            <div class="ws-account-meta">\${escHtml(primary.currency || '—')} · \${escHtml(primary.externalAccountId || '')}</div>
            <div class="ws-account-note" style="color:\${noteColor};">\${escHtml(note)}</div>
            <div style="margin-top:8px;">\${statusPill}</div>
          </div>
          <div class="ws-account-actions">
            \${needsReconnect
              ? '<button class="btn btn-primary btn-sm" id="connect-meta-btn">إعادة ربط Meta</button>'
              : '<button class="btn btn-secondary btn-sm sync-now-btn js-sync-trigger" data-aid="' + escAttr(primary.id) + '">↻ مزامنة الآن</button>'}
            <button class="btn btn-ghost btn-sm" id="connect-manual-btn">ربط يدوي</button>
            <button class="btn btn-danger btn-sm disconnect-btn" data-aid="\${escAttr(primary.id)}" data-name="\${escAttr(primary.name || '')}">فصل</button>
          </div>
        </div>
        \${extras.length ? '<div class="ws-extra-note">يوجد ' + extras.length + ' حساب إضافي مرتبط. التحليلات حالياً تعتمد الحساب الأساسي أعلاه فقط.</div>' : ''}
        \${!needsReconnect ? '<div class="ws-hero-actions"><button class="btn btn-ghost btn-sm" id="connect-meta-btn">ربط حساب آخر عبر Meta</button></div>' : ''}
      </div>\`;

    const metaBtn = document.getElementById('connect-meta-btn');
    if (metaBtn) metaBtn.addEventListener('click', startMetaConnect);
    const manualBtn = document.getElementById('connect-manual-btn');
    if (manualBtn) manualBtn.addEventListener('click', () => openManualTokenModal());

    document.querySelectorAll('.sync-now-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          var job = await runWorkspaceSync(wsId, {
            buttonSelector: '.sync-now-btn',
            statusContainerId: 'ws-hero-body',
          });
          if (job) toast('اكتملت المزامنة — ' + (job.rowsUpserted ?? 0) + ' صف محدّث', 'success');
          await loadWorkspace();
        } catch(e) {
          const isDecrypt = e && (e.code === 'TOKEN_DECRYPT_FAILED' ||
            (e.message && e.message.indexOf('TOKEN_DECRYPT_FAILED') >= 0));
          if (isDecrypt) {
            showTokenDecryptBanner({
              error: e.message,
              reconnectUrl: e.reconnectUrl,
              reconnectLabel: e.reconnectLabel,
            });
            toast(friendlyApiError(e), 'error');
          } else if (e && e.message && e.message.indexOf('finish in the background') >= 0) {
            toast(friendlyApiError(e), 'warning');
          } else {
            toast(friendlyApiError(e), 'error');
          }
        }
      });
    });

    document.querySelectorAll('.disconnect-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('فصل الحساب "' + (btn.dataset.name || '') + '"؟ قد تُحذف بيانات الحملات المرتبطة.')) return;
        try {
          await apiFetch('/api/workspaces/' + wsId + '/ad-accounts/' + btn.dataset.aid, { method: 'DELETE' });
          toast('تم فصل الحساب', 'success');
          await loadWorkspace();
        } catch(e) { toast(e.message || 'تعذّر الفصل', 'error'); }
      });
    });
  }

  async function loadWorkspace() {
    const ws = await apiFetch('/api/workspaces/' + wsId);
    document.getElementById('ws-info-loading').style.display = 'none';
    if (!ws) {
      document.getElementById('ws-hero-loading').style.display = 'none';
      document.getElementById('ws-hero-body').style.display = 'block';
      document.getElementById('ws-hero-body').innerHTML =
        '<div class="empty-state" style="padding:24px;"><div class="empty-title">تعذّر تحميل الحسابات</div></div>';
      return;
    }
    document.getElementById('ws-info-form').style.display = 'block';
    document.getElementById('ws-name-input').value  = ws.name || '';
    document.getElementById('ws-plan-input').value  = ws.plan || 'free';
    document.getElementById('ws-id-input').textContent = ws.id || '—';
    renderConnectionHero(ws);
  }

  async function loadMembers() {
    const members = await apiFetch('/api/workspaces/' + wsId + '/members');
    if (!members) {
      document.getElementById('members-container').innerHTML =
        '<div class="empty-state" style="padding:24px;"><div class="empty-title">تعذّر تحميل الأعضاء</div></div>';
      return;
    }
    if (!members.length) {
      document.getElementById('members-container').innerHTML =
        '<div class="empty-state" style="padding:24px;"><div class="empty-title">لا يوجد أعضاء</div></div>';
      return;
    }
    document.getElementById('members-container').innerHTML = \`
      <table class="ws-member-table">
        <thead><tr>
          <th>العضو</th><th>البريد</th><th>الدور</th><th>انضم</th>\${canManage?'<th>إجراءات</th>':''}
        </tr></thead>
        <tbody>\${members.map(m => \`
          <tr data-member-id="\${m.id}" data-user-id="\${m.userId}">
            <td><div style="display:flex;align-items:center;gap:9px;">
              <div class="avatar" style="width:28px;height:28px;font-size:11px;">\${(m.user.name||m.user.email||'?')[0].toUpperCase()}</div>
              <span style="font-weight:600;">\${escHtml(m.user.name||'—')}</span>
            </div></td>
            <td style="color:var(--text-2);">\${escHtml(m.user.email)}</td>
            <td>\${roleBadge(m.role)}</td>
            <td style="color:var(--text-3);font-size:12px;">\${new Date(m.createdAt).toLocaleDateString('ar-u-nu-latn')}</td>
            \${canManage ? \`<td>
              <div class="ws-role-actions">
                \${m.userId !== me.id ? \`<button class="btn btn-ghost btn-sm change-role-btn" data-mid="\${m.id}" data-role="\${m.role}">تغيير الدور</button>
                <button class="btn btn-danger btn-sm remove-btn" data-mid="\${m.id}" data-name="\${escAttr(m.user.name||m.user.email)}">إزالة</button>\` : '<span style="font-size:12px;color:var(--text-3);">أنت</span>'}
              </div>
            </td>\` : ''}
          </tr>\`).join('')}
        </tbody>
      </table>\`;

    document.querySelectorAll('.change-role-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const mid = btn.dataset.mid;
        const cur = btn.dataset.role;
        const roles = ['VIEWER','MANAGER','OWNER'];
        const next = roles[(roles.indexOf(cur)+1) % roles.length];
        if (!confirm('تغيير الدور إلى ' + roleLabel(next) + '؟')) return;
        try {
          await apiFetch('/api/workspaces/' + wsId + '/members/' + mid, {
            method:'PATCH', body: JSON.stringify({role:next})
          });
          toast('تم تحديث الدور إلى ' + roleLabel(next), 'success');
          await loadMembers();
        } catch(e) { toast(e.message||'تعذّر التحديث','error'); }
      });
    });

    document.querySelectorAll('.remove-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const mid  = btn.dataset.mid;
        const name = btn.dataset.name;
        if (!confirm('إزالة ' + name + ' من مساحة العمل؟')) return;
        try {
          await apiFetch('/api/workspaces/' + wsId + '/members/' + mid, {method:'DELETE'});
          toast('تمت إزالة العضو', 'success');
          await loadMembers();
        } catch(e) { toast(e.message||'تعذّرت الإزالة','error'); }
      });
    });
  }

  document.getElementById('save-ws-btn').addEventListener('click', async () => {
    const name = document.getElementById('ws-name-input').value.trim();
    if (!name) { toast('الاسم مطلوب','error'); return; }
    try {
      await apiFetch('/api/workspaces/' + wsId, {method:'PATCH', body: JSON.stringify({name})});
      document.getElementById('ws-name').textContent = name;
      toast('تم حفظ اسم مساحة العمل','success');
    } catch(e) { toast(e.message||'تعذّر الحفظ','error'); }
  });

  document.getElementById('invite-btn').addEventListener('click', () => {
    if (!canManage) { toast('ليس لديك صلاحية دعوة أعضاء', 'error'); return; }
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
    if (!email) {
      document.getElementById('invite-error').textContent='البريد مطلوب';
      document.getElementById('invite-error').style.display='flex';
      return;
    }
    try {
      await apiFetch('/api/workspaces/' + wsId + '/members/invite', {
        method:'POST', body: JSON.stringify({email, role})
      });
      document.getElementById('invite-modal').style.display = 'none';
      toast('تم إرسال الدعوة إلى ' + email, 'success');
      await loadMembers();
    } catch(e) {
      document.getElementById('invite-error').textContent = e.message || 'تعذّرت الدعوة';
      document.getElementById('invite-error').style.display = 'flex';
    }
  });

  document.getElementById('leave-btn').addEventListener('click', async () => {
    if (!myMembership) return;
    if (!confirm('مغادرة مساحة العمل؟ ستفقد كل الوصول.')) return;
    try {
      await apiFetch('/api/workspaces/' + wsId + '/members/' + myMembership.id, {method:'DELETE'});
      const remaining = me.memberships?.filter(m => m.workspaceId !== wsId);
      if (remaining?.length) {
        localStorage.setItem('adlytic_workspace_id', remaining[0].workspaceId);
        window.location.href = '/dashboard';
      } else {
        logout();
      }
    } catch(e) { toast(e.message||'تعذّرت المغادرة','error'); }
  });

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
    const name = document.getElementById('manual-account-name').value.trim();
    const errEl = document.getElementById('manual-error');
    errEl.style.display = 'none';
    if (!accessToken || !externalAccountId) {
      errEl.textContent = 'رمز الوصول ومعرّف الحساب مطلوبان';
      errEl.style.display = 'flex';
      return;
    }
    const confirmBtn = document.getElementById('manual-confirm');
    confirmBtn.textContent = 'جارٍ التحقق…';
    confirmBtn.disabled = true;
    try {
      await apiFetch('/api/workspaces/' + wsId + '/ad-accounts', {
        method: 'POST',
        body: JSON.stringify({ accessToken, externalAccountId, name }),
      });
      document.getElementById('manual-token-modal').style.display = 'none';
      try { sessionStorage.removeItem('adlytic_token_decrypt_banner_dismissed'); } catch (e) {}
      if (typeof checkTokenDecryptBanner === 'function') await checkTokenDecryptBanner();
      toast('تم ربط الحساب — جارٍ المزامنة الأولى…', 'success');
      try {
        var job = await runWorkspaceSync(wsId, {
          buttonSelector: '#manual-confirm',
          statusContainerId: 'ws-hero-body',
        });
        if (job) toast('اكتملت المزامنة الأولى — ' + (job.rowsUpserted ?? 0) + ' صف', 'success');
      } catch(syncErr) {
        if (syncErr && syncErr.message && syncErr.message.indexOf('finish in the background') >= 0) {
          toast(friendlyApiError(syncErr), 'warning');
        } else {
          toast(friendlyApiError(syncErr), 'error');
        }
      }
      await loadWorkspace();
    } catch(e) {
      errEl.textContent = friendlyApiError(e);
      errEl.style.display = 'flex';
    } finally {
      confirmBtn.textContent = 'ربط الحساب';
      confirmBtn.disabled = false;
    }
  });

  const params = new URLSearchParams(window.location.search);
  if (params.get('connected') === '1') {
    toast('تم ربط حساب Meta وبدأت المزامنة.', 'success');
    window.history.replaceState({}, '', '/workspace');
  }
  if (params.get('oauth_error')) {
    const code = decodeURIComponent(params.get('oauth_error'));
    const friendly = (() => {
      if (code === 'expired_state')  return 'انتهت صلاحية محاولة الربط. حاول مرة أخرى.';
      if (code === 'missing_params') return 'Meta لم تُرجع المعلومات المتوقعة. حاول مرة أخرى.';
      if (code === 'not_configured') return 'ربط Meta غير مُعدّ على هذا الخادم بعد.';
      if (code === 'no_ad_accounts_granted' || /no ad accounts? (was|were) granted|0 ad accounts/i.test(code)) {
        return 'نجح تسجيل الدخول، لكن لم يُمنح أي حساب إعلاني. امنح حساباً واحداً على الأقل ثم أعد الربط.';
      }
      if (/permissions?|denied|access_denied/i.test(code)) return 'لم تُمنح الصلاحية. وافق على الوصول للمتابعة.';
      return 'تعذّر الربط مع Meta. حاول مرة أخرى.';
    })();
    toast(friendly, 'error');
    window.history.replaceState({}, '', '/workspace');
  }

  try {
    await resumeActiveSyncIfAny(wsId, {
      statusContainerId: 'ws-hero-body',
      buttonSelector: '.sync-now-btn',
      onComplete: function () { loadWorkspace(); },
    });
    await Promise.all([loadWorkspace(), loadMembers()]);
    if (params.get('connect') === 'manual') {
      openManualTokenModal();
      window.history.replaceState({}, '', '/workspace');
    }
  } catch(e) {
    document.getElementById('ws-info-loading').style.display = 'none';
    document.getElementById('ws-hero-loading').style.display = 'none';
    const errHtml = '<div class="empty-state" style="padding:24px;"><div class="empty-title">تعذّر التحميل</div></div>';
    const hero = document.getElementById('ws-hero-body');
    const mc = document.getElementById('members-container');
    if (hero) { hero.style.display = 'block'; hero.innerHTML = errHtml; }
    if (mc && mc.querySelector('.loading-overlay')) mc.innerHTML = errHtml;
    toast(e.message || 'تعذّر تحميل مساحة العمل', 'error');
  }
})();
</script>`;

  return layout({ title: 'مساحة العمل', active: 'workspace', content, scripts });
}
