// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/customersWorkspacePage.ts
//
//  CUSTOMERS & WORKSPACES — /admin/customers.
//
//  ── The capability this consolidation was most likely to lose ─────────
//
//  `docs/close-code/12` recorded the near-miss explicitly: redirecting
//  /admin/classic into the newer console would have silently removed
//  settings, subscriptions and payment events, because the newer console
//  never had them. That is the exact failure this page exists to prevent —
//  so all three are here, calling the same guarded routes the classic
//  console called, before the classic console is allowed to retire.
//
//  ── Danger is visible in the UI, not only in the API ──────────────────
//
//  The registry classifies each capability (READ_ONLY, SAFE_MUTATION,
//  PRIVILEGED_MUTATION, DESTRUCTIVE) and that classification is reflected
//  here: privileged actions confirm, and the destructive one requires the
//  operator to type the customer's email. The server is still the boundary —
//  every route re-authorizes — but an operator should not discover that a
//  button was irreversible by pressing it.
//
//  The classic console stays mounted and linked from the Customers view: it
//  still owns the deep edit drawers, and until those exist here, removing it
//  would trade one gap for another.
// ════════════════════════════════════════════════════════════════════════

import { adminShell } from '../adminShell';

const CSS = `
  .inp { border: 1px solid var(--border-control); background: var(--surface); color: var(--text);
         border-radius: 7px; padding: 5px 9px; font-size: 12px; font-family: inherit; }
  .inp:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  .bar { display: flex; gap: 7px; align-items: center; flex-wrap: wrap; margin-bottom: 10px; }
  .big { font-family: var(--font-display); font-size: 22px; font-weight: 700; }
  .danger { color: var(--error); border-color: var(--error); }
  form.stack { display: grid; gap: 8px; max-width: 420px; }
  label.f { font-size: 11px; color: var(--text-3); font-weight: 600; }
`;

const BODY = `
  <section class="view on" id="v-customers">
    <div class="grid g4" id="kpis">
      <div class="card"><div class="muted">الزبائن</div><div class="big mono" id="k-users">—</div></div>
      <div class="card"><div class="muted">مساحات العمل</div><div class="big mono" id="k-ws">—</div></div>
      <div class="card"><div class="muted">اشتراكات مدفوعة</div><div class="big mono" id="k-sub">—</div></div>
      <div class="card"><div class="muted">حسابات إعلانية</div><div class="big mono" id="k-acc">—</div></div>
    </div>
    <div class="card">
      <div class="bar">
        <input class="inp" id="cq" placeholder="ابحث بالاسم أو البريد" size="26" />
        <button class="btn" id="cload">بحث</button>
        <span style="flex:1"></span>
        <a class="btn" href="/admin/classic">الكونسول الكلاسيكي</a>
      </div>
      <div class="muted" style="margin-bottom:8px;">
        أدراج التحرير التفصيلية ما زالت في الكونسول الكلاسيكي — يبقى مركّباً حتى تكتمل هنا.
      </div>
      <table class="t"><thead><tr>
        <th>الزبون</th><th>البريد</th><th>الخطة</th><th>مساحات</th><th>إجراءات</th>
      </tr></thead><tbody id="cust"><tr><td colspan="5" class="empty">اضغط «بحث»</td></tr></tbody></table>
    </div>
    <div class="card" id="detail-card" style="display:none;">
      <div class="card-h"><div class="h2">تفاصيل الزبون</div>
        <button class="btn" id="detail-close">إغلاق</button></div>
      <div id="detail"></div>
    </div>
  </section>

  <section class="view" id="v-create">
    <div class="card">
      <div class="h2">إنشاء حساب زبون</div>
      <div class="muted">ينشئ المستخدم ومساحة العمل معاً — نفس المسار المحمي الذي يستخدمه الكونسول.</div>
      <form class="stack" id="f-create">
        <label class="f">الاسم<input class="inp" name="name" required /></label>
        <label class="f">البريد<input class="inp" name="email" type="email" required /></label>
        <label class="f">اسم مساحة العمل<input class="inp" name="workspaceName" /></label>
        <label class="f">كلمة مرور مبدئية<input class="inp" name="password" type="text" /></label>
        <button class="btn btn-primary" type="submit">إنشاء</button>
      </form>
      <div id="create-out" class="muted"></div>
    </div>
  </section>

  <section class="view" id="v-subscriptions">
    <div class="card">
      <div class="card-h"><div class="h2">الاشتراكات</div>
        <button class="btn" id="sload">حدّث</button></div>
      <table class="t"><thead><tr>
        <th>مساحة العمل</th><th>الخطة</th><th>ينتهي</th><th>إجراءات</th>
      </tr></thead><tbody id="subs"><tr><td colspan="4" class="empty">اضغط «حدّث»</td></tr></tbody></table>
    </div>
  </section>

  <section class="view" id="v-payments">
    <div class="card">
      <div class="card-h"><div class="h2">سجل المدفوعات</div>
        <button class="btn" id="pload">حدّث</button></div>
      <table class="t"><thead><tr>
        <th>الوقت</th><th>الحدث</th><th>مساحة العمل</th><th>المبلغ</th>
      </tr></thead><tbody id="pays"><tr><td colspan="4" class="empty">اضغط «حدّث»</td></tr></tbody></table>
    </div>
  </section>

  <section class="view" id="v-settings">
    <div class="card">
      <div class="card-h"><div class="h2">إعدادات المنصة</div>
        <div style="display:flex;gap:7px;">
          <button class="btn" id="setload">حدّث</button>
          <button class="btn" id="setseed">ازرع الافتراضيات</button>
        </div></div>
      <div class="muted">تغيير قيمة هنا يغيّر سلوك المنصة فوراً ودون إعادة نشر.</div>
      <table class="t"><thead><tr><th>المفتاح</th><th>القيمة</th><th></th></tr></thead>
        <tbody id="sets"><tr><td colspan="3" class="empty">اضغط «حدّث»</td></tr></tbody></table>
    </div>
  </section>
`;

const SCRIPT = `
(function () {
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fail(host, e) {
    document.getElementById(host).innerHTML =
      '<tr><td colspan="6" class="empty">تعذّر: ' + esc(e.message) + '</td></tr>';
  }

  window.adminFetch('/api/admin/overview').then(function (o) {
    var g = function (k) { return o && o[k] != null ? o[k] : '—'; };
    document.getElementById('k-users').textContent = g('users');
    document.getElementById('k-ws').textContent = g('workspaces');
    document.getElementById('k-sub').textContent = g('paidSubscriptions') !== '—'
      ? g('paidSubscriptions') : g('subscriptions');
    document.getElementById('k-acc').textContent = g('adAccounts');
  }).catch(function () { /* KPI strip stays em-dashed rather than showing zeros */ });

  function loadCustomers() {
    var q = document.getElementById('cq').value.trim();
    var host = document.getElementById('cust');
    host.innerHTML = '<tr><td colspan="5" class="empty">جارٍ التحميل…</td></tr>';
    window.adminFetch('/api/admin/customers' + (q ? '?q=' + encodeURIComponent(q) : ''))
      .then(function (r) {
        var list = (r && (r.customers || r.items || r)) || [];
        if (!Array.isArray(list)) list = [];
        host.innerHTML = list.length ? list.map(function (u) {
          return '<tr><td>' + esc(u.name || '—') + '</td>'
            + '<td class="mono">' + esc(u.email || '') + '</td>'
            + '<td>' + esc(u.tier || u.plan || '—') + '</td>'
            + '<td class="mono">' + esc(u.workspaceCount != null ? u.workspaceCount : '—') + '</td>'
            + '<td><button class="btn" data-open="' + esc(u.id) + '">تفاصيل</button></td></tr>';
        }).join('') : '<tr><td colspan="5" class="empty">لا نتائج.</td></tr>';
      }).catch(function (e) { fail('cust', e); });
  }
  document.getElementById('cload').addEventListener('click', loadCustomers);
  document.getElementById('detail-close').addEventListener('click', function () {
    document.getElementById('detail-card').style.display = 'none';
  });

  document.getElementById('cust').addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-open]') : null;
    if (!b) return;
    var id = b.getAttribute('data-open');
    var card = document.getElementById('detail-card');
    var host = document.getElementById('detail');
    card.style.display = '';
    host.innerHTML = '<div class="skel"></div>';
    window.adminFetch('/api/admin/customers/' + encodeURIComponent(id)).then(function (d) {
      var u = d.user || d.customer || d;
      host.innerHTML =
        '<div class="mono" style="font-size:11.5px;">' + esc(u.email || '') + '</div>'
        + '<form class="stack" id="f-edit" style="margin-top:10px;">'
        + '<label class="f">الاسم<input class="inp" name="name" value="' + esc(u.name || '') + '" /></label>'
        + '<label class="f">البريد<input class="inp" name="email" value="' + esc(u.email || '') + '" /></label>'
        + '<button class="btn btn-primary" type="submit">احفظ التعديل</button></form>'
        + '<div class="bar" style="margin-top:12px;">'
        + '<button class="btn" id="pw">أعد تعيين كلمة المرور</button>'
        + '<button class="btn danger" id="del">احذف الزبون نهائياً</button></div>'
        + '<div class="muted" id="detail-out"></div>';

      document.getElementById('f-edit').addEventListener('submit', function (ev) {
        ev.preventDefault();
        var fd = new FormData(ev.target);
        window.adminFetch('/api/admin/customers/' + encodeURIComponent(id), {
          method: 'PATCH',
          body: JSON.stringify({ name: fd.get('name'), email: fd.get('email') })
        }).then(function () {
          document.getElementById('detail-out').textContent = 'حُفظ.';
          loadCustomers();
        }).catch(function (err) { document.getElementById('detail-out').textContent = 'تعذّر: ' + err.message; });
      });

      document.getElementById('pw').addEventListener('click', function () {
        if (!confirm('إعادة تعيين كلمة مرور هذا الزبون؟')) return;
        window.adminFetch('/api/admin/customers/' + encodeURIComponent(id) + '/reset-password', { method: 'POST' })
          .then(function (r) {
            document.getElementById('detail-out').textContent =
              r && r.password ? ('كلمة المرور المؤقتة: ' + r.password) : 'أُعيد التعيين.';
          }).catch(function (err) { document.getElementById('detail-out').textContent = 'تعذّر: ' + err.message; });
      });

      // Destructive: typing the email is the confirmation, not a yes/no box.
      document.getElementById('del').addEventListener('click', function () {
        var typed = prompt('هذا حذف نهائي. اكتب بريد الزبون للتأكيد:');
        if (!typed || typed.trim().toLowerCase() !== String(u.email || '').trim().toLowerCase()) {
          document.getElementById('detail-out').textContent = 'أُلغي — البريد غير مطابق.';
          return;
        }
        window.adminFetch('/api/admin/customers/' + encodeURIComponent(id), { method: 'DELETE' })
          .then(function () {
            document.getElementById('detail-card').style.display = 'none';
            loadCustomers();
          }).catch(function (err) { document.getElementById('detail-out').textContent = 'تعذّر: ' + err.message; });
      });
    }).catch(function (e) { host.innerHTML = '<div class="muted">تعذّر: ' + esc(e.message) + '</div>'; });
  });

  document.getElementById('f-create').addEventListener('submit', function (e) {
    e.preventDefault();
    var fd = new FormData(e.target);
    var out = document.getElementById('create-out');
    out.textContent = 'جارٍ الإنشاء…';
    window.adminFetch('/api/admin/customers', {
      method: 'POST',
      body: JSON.stringify({
        name: fd.get('name'), email: fd.get('email'),
        workspaceName: fd.get('workspaceName') || undefined,
        password: fd.get('password') || undefined
      })
    }).then(function (r) {
      out.textContent = 'أُنشئ' + (r && r.password ? (' — كلمة المرور: ' + r.password) : '.');
      e.target.reset();
    }).catch(function (err) { out.textContent = 'تعذّر: ' + err.message; });
  });

  function loadSubs() {
    var host = document.getElementById('subs');
    host.innerHTML = '<tr><td colspan="4" class="empty">جارٍ التحميل…</td></tr>';
    window.adminFetch('/api/admin/subscriptions').then(function (r) {
      var list = (r && (r.subscriptions || r.items || r)) || [];
      if (!Array.isArray(list)) list = [];
      host.innerHTML = list.length ? list.map(function (s) {
        var id = s.workspaceId || (s.workspace && s.workspace.id) || '';
        return '<tr><td>' + esc(s.workspaceName || (s.workspace && s.workspace.name) || id) + '</td>'
          + '<td>' + esc(s.tier || s.plan || '—') + '</td>'
          + '<td class="mono">' + esc(s.expiresAt || s.currentPeriodEnd || '—') + '</td>'
          + '<td><button class="btn" data-sub="activate" data-ws="' + esc(id) + '">فعّل</button> '
          + '<button class="btn" data-sub="extend" data-ws="' + esc(id) + '">مدّد</button> '
          + '<button class="btn danger" data-sub="cancel" data-ws="' + esc(id) + '">ألغِ</button></td></tr>';
      }).join('') : '<tr><td colspan="4" class="empty">لا اشتراكات.</td></tr>';
    }).catch(function (e) { fail('subs', e); });
  }
  document.getElementById('sload').addEventListener('click', loadSubs);
  document.getElementById('subs').addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-sub]') : null;
    if (!b) return;
    var act = b.getAttribute('data-sub'), ws = b.getAttribute('data-ws');
    var ASK = {
      activate: 'تفعيل Premium يدوياً لهذه المساحة؟',
      extend: 'تمديد الاشتراك الحالي؟',
      cancel: 'إلغاء الاشتراك؟ سيفقد الزبون مزايا Premium.'
    };
    if (!confirm(ASK[act])) return;
    var url = act === 'activate' ? '/api/admin/subscriptions/activate-manual'
            : act === 'extend'   ? '/api/admin/subscriptions/extend'
                                 : '/api/admin/subscriptions/cancel-manual';
    window.adminFetch(url, { method: 'POST', body: JSON.stringify({ workspaceId: ws }) })
      .then(loadSubs).catch(function (err) { alert('تعذّر: ' + err.message); });
  });

  function loadPays() {
    var host = document.getElementById('pays');
    host.innerHTML = '<tr><td colspan="4" class="empty">جارٍ التحميل…</td></tr>';
    window.adminFetch('/api/admin/payment-events').then(function (r) {
      var list = (r && (r.events || r.items || r)) || [];
      if (!Array.isArray(list)) list = [];
      host.innerHTML = list.length ? list.map(function (p) {
        return '<tr><td>' + window.adminTime(p.createdAt || p.at) + '</td>'
          + '<td>' + esc(p.type || p.event || '') + '</td>'
          + '<td>' + esc(p.workspaceId || '—') + '</td>'
          + '<td class="mono">' + esc(p.amount != null ? p.amount : '—') + '</td></tr>';
      }).join('') : '<tr><td colspan="4" class="empty">لا أحداث دفع.</td></tr>';
    }).catch(function (e) { fail('pays', e); });
  }
  document.getElementById('pload').addEventListener('click', loadPays);

  function loadSettings() {
    var host = document.getElementById('sets');
    host.innerHTML = '<tr><td colspan="3" class="empty">جارٍ التحميل…</td></tr>';
    window.adminFetch('/api/admin/settings').then(function (r) {
      var list = (r && (r.settings || r.items || r)) || [];
      if (!Array.isArray(list)) list = Object.keys(list || {}).map(function (k) {
        return { key: k, value: list[k] };
      });
      host.innerHTML = list.length ? list.map(function (s) {
        var v = s.value;
        if (v && typeof v === 'object') v = JSON.stringify(v);
        return '<tr><td class="mono">' + esc(s.key) + '</td>'
          + '<td><input class="inp" data-key="' + esc(s.key) + '" value="' + esc(v) + '" size="34" /></td>'
          + '<td><button class="btn" data-save="' + esc(s.key) + '">احفظ</button></td></tr>';
      }).join('') : '<tr><td colspan="3" class="empty">لا إعدادات مخزّنة.</td></tr>';
    }).catch(function (e) { fail('sets', e); });
  }
  document.getElementById('setload').addEventListener('click', loadSettings);
  document.getElementById('setseed').addEventListener('click', function () {
    if (!confirm('زرع الإعدادات الافتراضية؟ قد يضيف مفاتيح جديدة.')) return;
    window.adminFetch('/api/admin/settings/seed', { method: 'POST' })
      .then(loadSettings).catch(function (e) { alert('تعذّر: ' + e.message); });
  });
  document.getElementById('sets').addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-save]') : null;
    if (!b) return;
    var key = b.getAttribute('data-save');
    var inp = document.querySelector('[data-key="' + key + '"]');
    if (!confirm('تغيير ' + key + '؟ يسري فوراً.')) return;
    window.adminFetch('/api/admin/settings/' + encodeURIComponent(key), {
      method: 'PUT', body: JSON.stringify({ value: inp.value })
    }).then(loadSettings).catch(function (err) { alert('تعذّر: ' + err.message); });
  });
})();
`;

export function customersWorkspacePage(): string {
  return adminShell({
    active: 'customers',
    title: 'الزبائن ومساحات العمل',
    subtitle: 'من نخدم وكيف أُعدّت مساحاتهم',
    css: CSS,
    body: BODY,
    views: [
      { id: 'customers', label: 'الزبائن', hint: 'البحث والتفاصيل' },
      { id: 'create', label: 'إنشاء حساب', hint: 'زبون + مساحة عمل' },
      { id: 'subscriptions', label: 'الاشتراكات', hint: 'تفعيل وتمديد وإلغاء' },
      { id: 'payments', label: 'المدفوعات', hint: 'سجل الأحداث' },
      { id: 'settings', label: 'إعدادات المنصة', hint: 'قيم التشغيل' },
    ],
    script: SCRIPT,
    commands: [
      { label: 'إنشاء حساب زبون', href: '#create', hint: 'الزبائن' },
      { label: 'الاشتراكات', href: '#subscriptions', hint: 'الزبائن' },
      { label: 'إعدادات المنصة', href: '#settings', hint: 'الزبائن' },
      { label: 'الكونسول الكلاسيكي', href: '/admin/classic', hint: 'إرث' },
      { label: 'إضافة عميل (المعالج)', href: '/admin/add-client', hint: 'الزبائن' },
    ],
  });
}
