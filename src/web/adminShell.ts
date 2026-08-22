// ════════════════════════════════════════════════════════════════════════
//  src/web/adminShell.ts
//
//  THE ADLYTIC CONTROL PLANE SHELL — one frame, every operator surface.
//
//  ── What this replaces ────────────────────────────────────────────────
//
//  Screenshots of the admin surface showed several generations of interface
//  living side by side: the classic console's own sidebar, the Admin OS's
//  four job groups, a Meta readiness page that looked like a different
//  product entirely, and an observability page with a third header treatment.
//  A shared navigation MAP was introduced across them, which fixed the
//  "three different menus" problem — but every page still drew its own
//  chrome around that map, so the operator still crossed a visual border
//  every time they moved.
//
//  This module owns the chrome. A surface supplies a title, its context, and
//  a body; everything around the body is identical everywhere, because it is
//  literally the same code.
//
//  ── What the shell is responsible for ─────────────────────────────────
//
//   · The global sidebar, rendered from ADMIN_IA — domains, not history.
//   · The context bar: environment, build, service role, and whichever of
//     workspace / Meta account / entity the surface has selected.
//   · One command palette (Ctrl-K) over every destination and every command
//     a surface registers, plus workspace search where the page supplies it.
//   · Operator identity and logout, in one place.
//   · The attention centre — the same ranked queue the Control Center shows,
//     reachable from every screen without leaving it.
//
//  ── What the shell must NOT do ────────────────────────────────────────
//
//  It renders. It does not decide. No status is computed here: chips are
//  drawn with the canonical vocabulary in adminStatus.ts from values the
//  server already resolved, and a state the server could not determine stays
//  visibly undetermined rather than being defaulted to something calmer.
//
//  Architectural constraints preserved from the rest of the web layer: no
//  React, no bundler, no package. Server-rendered HTML from a template
//  literal, vanilla browser JS. A lone backslash is eaten at cook time —
//  escape twice, or avoid escapes entirely, which is what this file does.
// ════════════════════════════════════════════════════════════════════════

import { TOKENS_CSS_PATH } from './layout';
import { SESSION_ROUTER_JS } from './auth/sessionRouter';
import { ADMIN_IA, adminSurfaceNav, type AdminSurface } from './pages/adminSurfaceNav';
import { ADMIN_STATUS_CSS } from './pages/adminStatus';

export interface ShellCommand {
  /** What the operator types to find it. */
  label: string;
  /** Where it goes, or the id of an in-page view (prefixed '#'). */
  href: string;
  /** Short qualifier shown greyed after the label. */
  hint?: string;
}

export interface AdminShellOptions {
  active: AdminSurface;
  /** Browser title AND the h1 of the page. One name, not two. */
  title: string;
  /** One line under the title: what this surface answers. */
  subtitle: string;
  /** The page body. Rendered inside the container, below the context bar. */
  body: string;
  /** Extra <style> the surface needs. Kept out of the shared sheet. */
  css?: string;
  /** Page script, run after the shell's own script. */
  script?: string;
  /** Commands this surface contributes to the palette. */
  commands?: ShellCommand[];
  /**
   * In-page views for the secondary tab strip, when a surface has them.
   * The shell renders and switches them; the page owns their content.
   */
  views?: Array<{ id: string; label: string; hint?: string }>;
}

/**
 * The one stylesheet. Desktop-first and RTL-first, because that is what the
 * operator actually uses and what Arabic requires; LTR falls out of using
 * logical properties rather than being a second, worse layout.
 */
const SHELL_CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root { --rail: 248px; --ctx-h: 46px; --top-h: 52px; }
  html, body { height: 100%; background: var(--bg); color: var(--text);
               font-family: var(--font-body); font-size: 13.5px; line-height: 1.55; }
  a { color: inherit; text-decoration: none; }
  /* Numbers and identifiers are LTR even inside an RTL sentence. */
  .mono, code, .id { font-family: var(--font-mono); direction: ltr; unicode-bidi: isolate;
                     font-size: 11.5px; letter-spacing: -0.01em; }

  .shell { display: grid; grid-template-columns: var(--rail) 1fr; min-height: 100%; }

  /* ── Rail ───────────────────────────────────────────────────────── */
  .rail { background: var(--surface); border-inline-start: 1px solid var(--border);
          display: flex; flex-direction: column; position: sticky; top: 0; height: 100vh; }
  .brand { display: flex; align-items: center; gap: 9px; padding: 14px 16px 12px;
           border-bottom: 1px solid var(--border); }
  .brand-mark { width: 22px; height: 22px; border-radius: 6px; background: var(--accent);
                display: grid; place-items: center; color: #fff; font-weight: 800; font-size: 12px; }
  .brand-name { font-weight: 700; font-size: 13.5px; letter-spacing: -0.01em; }
  .brand-kind { font-size: 10px; color: var(--text-3); font-weight: 600; }
  .rail-nav { flex: 1; overflow-y: auto; padding: 8px 8px 12px; }
  .nav-label { font-size: 9.5px; font-weight: 800; color: var(--text-3);
               padding: 12px 8px 4px; letter-spacing: 0.07em; text-transform: uppercase; }
  .nav-item { display: block; padding: 6px 9px; border-radius: 7px; color: var(--text-2);
              font-size: 12.5px; font-weight: 500; transition: var(--transition); }
  .nav-item:hover { background: var(--surface-2); color: var(--text); }
  .nav-item.active { background: var(--accent-dim); color: var(--accent-2); font-weight: 600; }
  .rail-foot { border-top: 1px solid var(--border); padding: 9px 12px;
               display: flex; align-items: center; gap: 8px; }
  .avatar { width: 26px; height: 26px; border-radius: 50%; background: var(--surface-2);
            display: grid; place-items: center; font-weight: 700; font-size: 11px; flex-shrink: 0; }
  .who { min-width: 0; flex: 1; }
  .who-name { font-size: 11.5px; font-weight: 600; white-space: nowrap;
              overflow: hidden; text-overflow: ellipsis; }
  .who-role { font-size: 9.5px; color: var(--text-3); }
  .icon-btn { border: 1px solid var(--border-control); background: var(--surface); color: var(--text-2);
              border-radius: 7px; padding: 4px 7px; font-size: 11px; cursor: pointer;
              font-family: inherit; transition: var(--transition); }
  .icon-btn:hover { background: var(--surface-2); color: var(--text); }
  .icon-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }

  /* ── Main column ────────────────────────────────────────────────── */
  .main { min-width: 0; display: flex; flex-direction: column; }
  .topbar { height: var(--top-h); border-bottom: 1px solid var(--border); background: var(--surface);
            display: flex; align-items: center; gap: 12px; padding: 0 18px;
            position: sticky; top: 0; z-index: 30; }
  .topbar h1 { font-family: var(--font-display); font-size: 15.5px; font-weight: 700;
               letter-spacing: -0.01em; white-space: nowrap; }
  .topbar .sub { font-size: 11.5px; color: var(--text-3); white-space: nowrap;
                 overflow: hidden; text-overflow: ellipsis; }
  .top-spacer { flex: 1; }
  .search-btn { display: flex; align-items: center; gap: 7px; border: 1px solid var(--border-control);
                background: var(--bg); color: var(--text-3); border-radius: 8px;
                padding: 5px 10px; font-size: 11.5px; cursor: pointer; font-family: inherit;
                min-width: 190px; transition: var(--transition); }
  .search-btn:hover { border-color: var(--accent); color: var(--text-2); }
  .kbd { font-family: var(--font-mono); font-size: 9.5px; border: 1px solid var(--border);
         border-radius: 4px; padding: 1px 4px; color: var(--text-3); margin-inline-start: auto; }

  /* Context bar — always says where you are and what you are looking at. */
  .ctxbar { min-height: var(--ctx-h); border-bottom: 1px solid var(--border); background: var(--bg);
            display: flex; align-items: center; gap: 8px; padding: 7px 18px; flex-wrap: wrap;
            position: sticky; top: var(--top-h); z-index: 25; }
  .ctx { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--border);
         background: var(--surface); border-radius: 999px; padding: 3px 10px; font-size: 11px; }
  .ctx-k { color: var(--text-3); font-weight: 600; font-size: 9.5px;
           text-transform: uppercase; letter-spacing: 0.05em; }
  .ctx-v { font-weight: 600; }
  .ctx.is-unset { border-style: dashed; color: var(--text-3); }

  .page { padding: 18px; flex: 1; }
  .page > * + * { margin-top: 14px; }

  /* ── Secondary view strip (in-page tabs) ────────────────────────── */
  .views { display: flex; gap: 2px; border-bottom: 1px solid var(--border); margin-bottom: 14px;
           overflow-x: auto; }
  .view-tab { padding: 7px 13px; font-size: 12.5px; font-weight: 600; color: var(--text-3);
              border-bottom: 2px solid transparent; cursor: pointer; white-space: nowrap;
              background: none; border-inline: 0; border-top: 0; font-family: inherit;
              transition: var(--transition); }
  .view-tab:hover { color: var(--text); }
  .view-tab.active { color: var(--accent-2); border-bottom-color: var(--accent); }
  .view-tab:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  .view { display: none; }
  .view.on { display: block; }

  /* ── Shared surface primitives ──────────────────────────────────── */
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
          padding: 14px; }
  .card > * + * { margin-top: 9px; }
  .card-h { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .h2 { font-size: 12.5px; font-weight: 700; letter-spacing: -0.005em; }
  .muted { color: var(--text-3); font-size: 11.5px; }
  .grid { display: grid; gap: 12px; }
  .g2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .g3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .g4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  @media (max-width: 1100px) { .g3, .g4 { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 720px)  { .g2, .g3, .g4 { grid-template-columns: 1fr; } }

  table.t { width: 100%; border-collapse: collapse; font-size: 12px; }
  table.t th { text-align: start; font-size: 10px; font-weight: 700; color: var(--text-3);
               text-transform: uppercase; letter-spacing: 0.05em; padding: 7px 9px;
               border-bottom: 1px solid var(--border); position: sticky; top: 0;
               background: var(--surface); }
  table.t td { padding: 7px 9px; border-bottom: 1px solid var(--border); vertical-align: middle; }
  table.t tbody tr:hover { background: var(--surface-2); }
  table.t .empty { text-align: center; color: var(--text-3); padding: 22px; }

  .btn { border: 1px solid var(--border-control); background: var(--surface); color: var(--text);
         border-radius: 7px; padding: 5px 11px; font-size: 11.5px; font-weight: 600;
         cursor: pointer; font-family: inherit; transition: var(--transition); }
  .btn:hover { background: var(--surface-2); }
  .btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  .btn-primary { background: var(--accent); border-color: var(--accent); color: #fff; }
  .btn-primary:hover { background: var(--accent-2); }

  /* ── Attention drawer ───────────────────────────────────────────── */
  .drawer { position: fixed; inset-block: 0; inset-inline-end: 0; width: min(430px, 94vw);
            background: var(--surface); border-inline-start: 1px solid var(--border);
            box-shadow: var(--shadow-xl); z-index: 60; display: flex; flex-direction: column;
            transform: translateX(var(--drawer-out, 100%)); transition: transform 180ms ease;
            visibility: hidden; }
  html[dir="rtl"] .drawer { --drawer-out: -100%; }
  .drawer.open { transform: translateX(0); visibility: visible; }
  .drawer-h { display: flex; align-items: center; justify-content: space-between;
              padding: 13px 16px; border-bottom: 1px solid var(--border); }
  .drawer-b { overflow-y: auto; padding: 12px 16px; flex: 1; }
  .att { border: 1px solid var(--border); border-radius: 9px; padding: 10px 12px; margin-bottom: 9px; }
  .att-t { font-weight: 700; font-size: 12.5px; }
  .att-w { font-size: 11.5px; color: var(--text-2); margin-top: 4px; }
  .att.sev-ERROR   { border-inline-start: 3px solid var(--error); }
  .att.sev-WARNING { border-inline-start: 3px solid var(--warning); }
  .att.sev-INFO    { border-inline-start: 3px solid var(--border-2); }
  .scrim { position: fixed; inset: 0; background: var(--scrim); z-index: 55;
           opacity: 0; pointer-events: none; transition: opacity 150ms ease; }
  .scrim.on { opacity: 1; pointer-events: auto; }

  /* ── Command palette ────────────────────────────────────────────── */
  .cmd { position: fixed; inset: 0; background: var(--scrim); z-index: 80;
         display: none; align-items: flex-start; justify-content: center; padding-top: 12vh; }
  .cmd.open { display: flex; }
  .cmd-box { width: min(620px, 94vw); background: var(--surface); border: 1px solid var(--border);
             border-radius: 12px; box-shadow: var(--shadow-xl); overflow: hidden; }
  .cmd-in { width: 100%; border: 0; border-bottom: 1px solid var(--border); background: none;
            color: var(--text); padding: 14px 16px; font-size: 14px; font-family: inherit; }
  .cmd-in:focus { outline: none; }
  .cmd-list { max-height: 52vh; overflow-y: auto; padding: 6px; }
  .cmd-row { display: flex; align-items: center; gap: 9px; padding: 8px 11px;
             border-radius: 8px; cursor: pointer; font-size: 12.5px; }
  .cmd-row.sel { background: var(--accent-dim); color: var(--accent-2); }
  .cmd-row .hint { color: var(--text-3); font-size: 11px; margin-inline-start: auto; }
  .cmd-empty { padding: 22px; text-align: center; color: var(--text-3); font-size: 12px; }

  /* Motion supports comprehension, and stops when the reader asks it to. */
  @media (prefers-reduced-motion: reduce) {
    * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
  }
  .skel { background: var(--surface-2); border-radius: 6px; height: 12px; animation: pulse 1.4s infinite; }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.45; } }
`;

/** Escape for HTML text nodes. Used by every surface through the shell. */
export function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Destinations, as palette commands. Built at render time from the one IA. */
function iaCommands(): ShellCommand[] {
  return ADMIN_IA.flatMap((s) =>
    s.items.map((i) => ({ label: i.label, href: i.href, hint: s.label })));
}

/**
 * The shell's own browser script.
 *
 * Written as a string because there is no bundler in this codebase. Keep it
 * dependency-free and defensive: every fetch can fail, and a Control Plane
 * that blanks out when one endpoint is slow is worse than one that says so.
 */
function shellScript(commands: ShellCommand[]): string {
  return `
(function () {
  var CMDS = ${JSON.stringify(commands)};

  function el(id) { return document.getElementById(id); }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function authHeaders() {
    var t = localStorage.getItem('adlytic_token');
    return t ? { Authorization: 'Bearer ' + t } : {};
  }
  window.adminFetch = function (url, opts) {
    var o = opts || {};
    o.headers = Object.assign({}, o.headers || {}, authHeaders());
    if (o.body && !o.headers['Content-Type']) o.headers['Content-Type'] = 'application/json';
    return fetch(url, o).then(function (r) {
      if (!r.ok) return r.json().catch(function () { return {}; }).then(function (b) {
        throw new Error(b.error || ('HTTP ' + r.status));
      });
      return r.json();
    });
  };

  // ── Operator identity ────────────────────────────────────────────
  window.adminFetch('/api/auth/me').then(function (me) {
    var u = me.user || me;
    var name = u.name || u.email || '—';
    var n = el('who-name'); if (n) n.textContent = name;
    var a = el('who-avatar'); if (a) a.textContent = (name[0] || '?').toUpperCase();
  }).catch(function () {
    var n = el('who-name'); if (n) n.textContent = 'جلسة غير محمّلة';
  });
  var lo = el('btn-logout');
  if (lo) lo.addEventListener('click', function () {
    window.adminFetch('/api/auth/logout', { method: 'POST' }).catch(function () {})
      .then(function () { localStorage.removeItem('adlytic_token'); location.href = '/admin/login'; });
  });

  // ── Context bar + attention centre, from the ops snapshot ────────
  // One request serves both. The context bar never invents a value: a field
  // the snapshot could not resolve stays dashed and says so.
  function setCtx(id, value, ok) {
    var host = el(id); if (!host) return;
    var v = host.querySelector('.ctx-v');
    if (v) v.textContent = value;
    host.classList.toggle('is-unset', !ok);
  }
  window.adminFetch('/api/admin/ops').then(function (ops) {
    window.__ops = ops;
    var b = ops.build || {};
    setCtx('ctx-build', b.commit ? String(b.commit).slice(0, 7) : 'غير محدّدة', !!b.commit);
    setCtx('ctx-env', b.environment || 'غير معروفة', !!b.environment);
    var role = null;
    (ops.subsystems || []).forEach(function (s) {
      if (s.key === 'workers' && s.detail) {
        var m = /role=([a-z]+)/.exec(s.detail);
        if (m) role = m[1];
      }
    });
    setCtx('ctx-role', role || 'غير معروف', !!role);
    var att = ops.attention || [];
    var badge = el('att-count');
    if (badge) { badge.textContent = att.length ? String(att.length) : ''; }
    var host = el('att-body');
    if (host) {
      host.innerHTML = att.length ? att.map(function (a) {
        return '<div class="att sev-' + esc(a.severity) + '">'
          + '<div class="att-t">' + esc(a.title) + '</div>'
          + '<div class="att-w">' + esc(a.because) + '</div>'
          + (a.href ? '<div style="margin-top:7px;"><a class="btn" href="' + esc(a.href) + '">'
              + esc(a.action || 'افتح') + '</a></div>' : '')
          + '</div>';
      }).join('') : '<div class="muted" style="text-align:center;padding:26px;">لا شيء يحتاج تدخّلاً الآن.</div>';
    }
    document.dispatchEvent(new CustomEvent('ops:ready', { detail: ops }));
  }).catch(function (e) {
    var host = el('att-body');
    if (host) host.innerHTML = '<div class="muted">تعذّر قراءة حالة التشغيل: ' + esc(e.message) + '</div>';
    document.dispatchEvent(new CustomEvent('ops:failed', { detail: e }));
  });

  // ── Attention drawer ─────────────────────────────────────────────
  function drawer(open) {
    var d = el('att-drawer'), s = el('scrim');
    if (!d) return;
    d.classList.toggle('open', open);
    if (s) s.classList.toggle('on', open);
  }
  var ab = el('btn-attention'); if (ab) ab.addEventListener('click', function () { drawer(true); });
  var ac = el('att-close'); if (ac) ac.addEventListener('click', function () { drawer(false); });
  var sc = el('scrim'); if (sc) sc.addEventListener('click', function () { drawer(false); });

  // ── In-page views ────────────────────────────────────────────────
  function showView(id) {
    var tabs = document.querySelectorAll('.view-tab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].classList.toggle('active', tabs[i].getAttribute('data-view') === id);
    }
    var views = document.querySelectorAll('.view');
    for (var j = 0; j < views.length; j++) {
      views[j].classList.toggle('on', views[j].id === 'v-' + id);
    }
    if (location.hash.slice(1) !== id) history.replaceState(null, '', '#' + id);
    document.dispatchEvent(new CustomEvent('view:show', { detail: id }));
  }
  window.adminShowView = showView;
  document.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('.view-tab[data-view]') : null;
    if (t) { e.preventDefault(); showView(t.getAttribute('data-view')); }
  });
  var firstTab = document.querySelector('.view-tab[data-view]');
  if (firstTab) showView(location.hash.slice(1) || firstTab.getAttribute('data-view'));

  // ── Command palette ──────────────────────────────────────────────
  var sel = 0, shown = [];
  function extra() { return (window.adminCommands || []); }
  function all() { return CMDS.concat(extra()); }
  function paint(q) {
    var list = el('cmd-list'); if (!list) return;
    var needle = q.trim().toLowerCase();
    shown = all().filter(function (c) {
      if (!needle) return true;
      return (c.label + ' ' + (c.hint || '') + ' ' + c.href).toLowerCase().indexOf(needle) >= 0;
    }).slice(0, 40);
    if (sel >= shown.length) sel = 0;
    list.innerHTML = shown.length ? shown.map(function (c, i) {
      return '<div class="cmd-row' + (i === sel ? ' sel' : '') + '" data-href="' + esc(c.href) + '">'
        + '<span>' + esc(c.label) + '</span>'
        + (c.hint ? '<span class="hint">' + esc(c.hint) + '</span>' : '') + '</div>';
    }).join('') : '<div class="cmd-empty">لا نتيجة</div>';
  }
  function openPalette() {
    var c = el('cmd'); if (!c) return;
    c.classList.add('open');
    var i = el('cmd-in'); if (i) { i.value = ''; i.focus(); }
    sel = 0; paint('');
  }
  function closePalette() { var c = el('cmd'); if (c) c.classList.remove('open'); }
  function run(href) {
    closePalette();
    if (!href) return;
    if (href.charAt(0) === '#') showView(href.slice(1)); else location.href = href;
  }
  var sb = el('btn-search'); if (sb) sb.addEventListener('click', openPalette);
  var ci = el('cmd-in');
  if (ci) ci.addEventListener('input', function () { sel = 0; paint(ci.value); });
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); openPalette(); return; }
    var open = el('cmd') && el('cmd').classList.contains('open');
    if (e.key === 'Escape') { closePalette(); drawer(false); return; }
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(sel + 1, shown.length - 1); paint(el('cmd-in').value); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); sel = Math.max(sel - 1, 0); paint(el('cmd-in').value); }
    if (e.key === 'Enter')     { e.preventDefault(); if (shown[sel]) run(shown[sel].href); }
  });
  document.addEventListener('click', function (e) {
    var row = e.target.closest ? e.target.closest('.cmd-row') : null;
    if (row) run(row.getAttribute('data-href'));
    var box = e.target.closest ? e.target.closest('.cmd-box') : null;
    if (!box && el('cmd') && el('cmd').classList.contains('open')) closePalette();
  });
})();
`;
}

/**
 * Render one Control Plane surface.
 *
 * Every admin page in the Control Plane goes through here. That is the whole
 * mechanism behind "one shell": there is no second function that produces an
 * admin document, so there is nowhere for a second product to grow.
 */
export function adminShell(o: AdminShellOptions): string {
  const commands = iaCommands().concat(o.commands ?? []);
  const viewTabs = (o.views ?? []).map((v) =>
    `<button class="view-tab" data-view="${esc(v.id)}"${v.hint ? ` title="${esc(v.hint)}"` : ''}>${esc(v.label)}</button>`,
  ).join('');

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(o.title)} · Adlytic Control Plane</title>
  <link rel="stylesheet" href="${TOKENS_CSS_PATH}" />
  <style>${SHELL_CSS}${ADMIN_STATUS_CSS}${o.css ?? ''}</style>
</head>
<body>
<div class="shell">
  <aside class="rail">
    <div class="brand">
      <div class="brand-mark">A</div>
      <div>
        <div class="brand-name">Adlytic</div>
        <div class="brand-kind">لوحة التحكّم</div>
      </div>
    </div>
    <nav class="rail-nav" aria-label="أقسام لوحة التحكّم">
${adminSurfaceNav(o.active)}
    </nav>
    <div class="rail-foot">
      <div class="avatar" id="who-avatar">·</div>
      <div class="who">
        <div class="who-name" id="who-name">…</div>
        <div class="who-role">مشغّل المنصة</div>
      </div>
      <button class="icon-btn" id="btn-logout" title="تسجيل الخروج">خروج</button>
    </div>
  </aside>

  <div class="main">
    <header class="topbar">
      <h1>${esc(o.title)}</h1>
      <div class="sub">${esc(o.subtitle)}</div>
      <div class="top-spacer"></div>
      <button class="search-btn" id="btn-search" aria-label="بحث وأوامر">
        <span>اذهب إلى…</span><span class="kbd">Ctrl K</span>
      </button>
      <button class="icon-btn" id="btn-attention" title="ما يحتاج انتباهاً">
        تنبيهات <span id="att-count" class="mono"></span>
      </button>
    </header>

    <div class="ctxbar">
      <span class="ctx is-unset" id="ctx-env"><span class="ctx-k">البيئة</span><span class="ctx-v mono">…</span></span>
      <span class="ctx is-unset" id="ctx-build"><span class="ctx-k">النسخة</span><span class="ctx-v mono">…</span></span>
      <span class="ctx is-unset" id="ctx-role"><span class="ctx-k">الدور</span><span class="ctx-v mono">…</span></span>
      <span class="ctx is-unset" id="ctx-workspace"><span class="ctx-k">مساحة العمل</span><span class="ctx-v">لم تُحدَّد</span></span>
      <span class="ctx is-unset" id="ctx-account"><span class="ctx-k">حساب Meta</span><span class="ctx-v">لم يُحدَّد</span></span>
      <span class="ctx is-unset" id="ctx-entity"><span class="ctx-k">الكيان</span><span class="ctx-v">لم يُحدَّد</span></span>
    </div>

    <main class="page">
      ${viewTabs ? `<div class="views" role="tablist">${viewTabs}</div>` : ''}
      ${o.body}
    </main>
  </div>
</div>

<div class="scrim" id="scrim"></div>
<aside class="drawer" id="att-drawer" aria-label="مركز التنبيهات">
  <div class="drawer-h">
    <strong>ما يحتاج انتباهاً</strong>
    <button class="icon-btn" id="att-close">إغلاق</button>
  </div>
  <div class="drawer-b" id="att-body"><div class="skel"></div></div>
</aside>

<div class="cmd" id="cmd" role="dialog" aria-label="لوحة الأوامر">
  <div class="cmd-box">
    <input class="cmd-in" id="cmd-in" placeholder="اذهب إلى… أو ابحث" aria-label="بحث وأوامر" />
    <div class="cmd-list" id="cmd-list"></div>
  </div>
</div>

<script>${SESSION_ROUTER_JS}</script>
<script>${shellScript(commands)}</script>
${o.script ? `<script>${o.script}</script>` : ''}
</body>
</html>`;
}
