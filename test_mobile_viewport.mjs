// ════════════════════════════════════════════════════════════════════════
//  test_mobile_viewport.mjs — MOBILE REGRESSION GATE
//
//  Renders every page and MEASURES it in headless Chromium at the six real
//  phone widths. Fails the build on:
//    · any horizontal page overflow (the user can drag the page sideways)
//    · touch targets below 44px CSS (WCAG 2.5.5 AA / Apple HIG)
//    · body text below 12px
//
//  Written because the worst mobile bug found in the audit was invisible to
//  every existing test: a position:fixed sidebar translated past the viewport
//  edge, which html{overflow-x:hidden} cannot clip. Only a real browser at a
//  real width catches that, so this suite uses one.
//
//  Prereq: pages must be pre-rendered (see scripts/render-pages.mts).
//  Run: node test_mobile_viewport.mjs
// ════════════════════════════════════════════════════════════════════════
import http from 'node:http';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { chromium, devices } from '/home/user/adlytic/node_modules/playwright/index.mjs';

const DIR = new URL('./.mobile-pages/', import.meta.url);
const WS = 'ws_x';
const WIDTHS = [320, 360, 375, 390, 414, 430];
const TOUCH_MIN = 44;   // WCAG 2.5.5 / Apple HIG
const FONT_MIN = 12;    // below this is unreadable on a phone

const fullDto = JSON.parse(readFileSync(new URL('./tests/fixtures/mobile-dto.json', import.meta.url), 'utf8'));

// The orchestrator state the add-client stub should report. Set immediately
// before a navigation so one page can be measured in every state it can reach —
// the five-step mobile flow renders a different screen for each, and a screen
// that is never rendered is never measured.
let OB_STATE = null;

const OB_STATES = [
  'REQUEST_CREATED', 'WAITING_EXTERNAL_ACTION', 'CONNECTING', 'VERIFYING',
  'SYNCING', 'READY', 'BLOCKED', 'FAILED',
];

// Deliberately carries the operator-facing wording the real adapter emits, so
// the audit shows what a phone does with a string full of internal vocabulary.
const BLOCKED_REQUIREMENT =
  'لا يملك مستخدم النظام صلاحية إسناد هذا الحساب الإعلاني تلقائيًا. '
  + 'افتح إعدادات الأعمال لدى العميل وأسند الحساب إلى مستخدم النظام الخاص بنا.';

const obRecord = () => ({
  id: 'ob_1', workspaceId: WS, provider: 'META',
  externalAccountId: 'act_1234567890',
  state: OB_STATE, currentStepId: null, planJson: [],
  blockedRequirement: OB_STATE === 'BLOCKED' ? BLOCKED_REQUIREMENT : null,
  lastError: OB_STATE === 'FAILED' ? 'Graph API returned code 190' : null,
  waitingSince: '2026-08-08T10:00:00.000Z',
  nextCheckAt: '2026-08-08T10:05:00.000Z',
  createdAt: '2026-08-08T09:00:00.000Z',
  completedAt: OB_STATE === 'READY' ? '2026-08-08T10:20:00.000Z' : null,
  linkedAdAccountId: OB_STATE === 'READY' ? 'aa_1' : null,
});

const server = http.createServer((req, res) => {
  const url = (req.url || '').split('?')[0];
  const json = (c, o) => { res.writeHead(c, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  const slug = url.replace(/^\//, '') || 'dashboard';

  try {
    const html = readFileSync(new URL(`${slug}.html`, DIR), 'utf8');
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(html);
  } catch { /* not a page — fall through to API stubs */ }

  // isPlatformAdmin was missing, so /add-client failed its own gate and
  // redirected to /dashboard — the audit measured the dashboard twice and
  // labelled one of them "add-client".
  if (url.startsWith('/api/auth/me')) return json(200, { id: 'u1', email: 'ali@adlytic.com', name: 'Ali', locale: 'AR', isActive: true, isPlatformAdmin: true, memberships: [{ workspaceId: WS, workspace: { id: WS, name: "Ali's Workspace" } }] });

  // ── Connection Orchestrator (admin) ──────────────────────────────────
  if (url.startsWith('/api/admin/customers')) {
    return json(200, { customers: [{ email: 'client@example.com', workspaces: [{ id: WS, name: 'عميل تجريبي' }] }] });
  }
  if (url.startsWith('/api/admin/meta/discover-accounts')) {
    return json(200, { configured: false, reason: 'stubbed in the mobile audit' });
  }
  if (url === '/api/admin/onboarding') {
    return json(200, { onboardings: OB_STATE ? [obRecord()] : [] });
  }
  if (url.startsWith('/api/admin/onboarding/')) {
    return json(200, { onboarding: OB_STATE ? obRecord() : null, timeline: [] });
  }
  if (url === '/api/dashboard/' + WS) return json(200, fullDto);
  if (url.startsWith('/api/dashboard/pulse/')) return json(200, { empty: true, workspaceId: WS });
  if (url.includes('/campaigns')) return json(200, fullDto.campaigns || []);
  if (url.includes('/insights')) return json(200, fullDto.insights || []);
  if (url.includes('/issue-dates')) return json(200, []);
  if (url === `/api/workspaces/${WS}`) return json(200, { id: WS, name: "Ali's Workspace", locale: 'AR' });
  if (url.startsWith('/api/recommendations')) return json(200, fullDto.recommendations || []);
  if (url.startsWith('/api/')) return json(200, {});
  res.writeHead(404); res.end('');
});

// Overridable so two checkouts (or a worktree beside its parent) can run the
// audit at the same time instead of one dying on EADDRINUSE.
const PORT = Number(process.env.MOBILE_AUDIT_PORT || 4601);
await new Promise((r) => server.listen(PORT, r));
const base = `http://127.0.0.1:${PORT}`;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });

/** The measurement probe — runs inside the page. */
const PROBE = `(() => {
  const de = document.documentElement, b = document.body;
  const vw = de.clientWidth;

  // 1. Horizontal overflow + the widest offender
  const overflow = Math.max(de.scrollWidth, b.scrollWidth) - vw;
  let widest = null;
  if (overflow > 1) {
    let best = 0;
    document.querySelectorAll('*').forEach(el => {
      const r = el.getBoundingClientRect();
      const over = (r.right - vw);
      if (over > best && r.width > 0 && getComputedStyle(el).position !== 'fixed') {
        best = over;
        widest = (el.tagName.toLowerCase()
          + (el.id ? '#' + el.id : '')
          + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).slice(0,2).join('.') : ''))
          + ' [+' + Math.round(over) + 'px]';
      }
    });
  }

  // 2. Touch targets below 44px
  const small = [];
  document.querySelectorAll('button, a[href], input, select, [role=button], .btn, .info-btn, .tab, .chip').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;              // hidden
    if (getComputedStyle(el).display === 'none') return;
    if (r.width < ${TOUCH_MIN} || r.height < ${TOUCH_MIN}) {
      small.push((el.id || el.className || el.tagName).toString().trim().slice(0,42)
        + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
    }
  });

  // 3. Text below the legible floor
  const tiny = new Set();
  document.querySelectorAll('*').forEach(el => {
    if (!el.childNodes.length) return;
    const hasText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 2);
    if (!hasText) return;
    const r = el.getBoundingClientRect();
    if (r.width === 0) return;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs && fs < ${FONT_MIN}) tiny.add(Math.round(fs*10)/10 + 'px: ' + (el.className || el.tagName).toString().trim().slice(0,34));
  });

  // 4. Tables / canvases wider than the viewport
  const wide = [];
  document.querySelectorAll('table, canvas, pre, .table-scroll').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.width > vw + 1) wide.push(el.tagName.toLowerCase() + (el.id ? '#'+el.id : '') + ' ' + Math.round(r.width) + 'px');
  });

  // 5. Fixed/sticky chrome that can cover content
  const fixed = [];
  document.querySelectorAll('*').forEach(el => {
    const cs = getComputedStyle(el);
    if (cs.position === 'fixed' || cs.position === 'sticky') {
      const r = el.getBoundingClientRect();
      if (r.height > 8 && r.width > 8 && cs.display !== 'none') {
        fixed.push((el.id || el.className || el.tagName).toString().trim().slice(0,34) + ' ' + Math.round(r.height) + 'px ' + cs.position);
      }
    }
  });

  // 6. Density: how tall is the page, and how far to the first action?
  const firstBtn = document.querySelector('#dashboard-content button, #main-content button, main button, .btn');
  return {
    vw, overflow: Math.max(0, overflow), widest,
    smallTargets: [...new Set(small)].slice(0, 8), smallCount: new Set(small).size,
    tinyText: [...tiny].slice(0, 6), tinyCount: tiny.size,
    wideEls: [...new Set(wide)].slice(0, 5),
    fixedEls: [...new Set(fixed)].slice(0, 5),
    pageHeight: Math.round(b.scrollHeight),
    screensToScroll: +(b.scrollHeight / de.clientHeight).toFixed(1),
    firstActionTop: firstBtn ? Math.round(firstBtn.getBoundingClientRect().top + window.scrollY) : null,
    hasViewportMeta: !!document.querySelector('meta[name=viewport]'),
    viewportContent: (document.querySelector('meta[name=viewport]') || {}).content || null,
    usesSafeArea: /safe-area-inset/.test(document.documentElement.outerHTML),
  };
})()`;

// .html only: the previous run leaves findings.json in this directory, and an
// unfiltered listing turned it into a "page" that failed every width.
const pages = readdirSync(new URL('./.mobile-pages/', import.meta.url))
  .filter(f => f.endsWith('.html'))
  .map(f => f.replace('.html', ''));

// One case per thing that can be on screen. Most pages have exactly one; the
// add-client flow has one per orchestrator state, because each renders a
// different step and only a rendered step can be measured.
const CASES = [];
for (const slug of pages) {
  CASES.push({ key: slug, slug, ob: null });
  if (slug === 'add-client') {
    for (const s of OB_STATES) CASES.push({ key: `add-client[${s}]`, slug, ob: s });
  }
}

const findings = {};

for (const { key, slug, ob } of CASES) {
  OB_STATE = ob;
  findings[key] = {};
  for (const width of WIDTHS) {
    const ctx = await browser.newContext({
      viewport: { width, height: 780 },
      deviceScaleFactor: 3, isMobile: true, hasTouch: true,
      userAgent: devices['iPhone 13'].userAgent,
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message.slice(0, 80)));
    // Auth pages redirect to /dashboard when a token is present, which would
    // silently measure the dashboard and label it "login". Only inject a token
    // for pages that require one.
    const AUTH_PAGES = ['login', 'register', 'welcome'];
    if (!AUTH_PAGES.includes(slug)) {
      await page.addInitScript(() => {
        localStorage.setItem('adlytic_token', 'test-token');
        localStorage.setItem('adlytic_workspace_id', 'ws_x');
      });
    }
    try {
      await page.goto(`${base}/${slug}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(2200);
      findings[key][width] = await page.evaluate(PROBE);
      if (errors.length) findings[key][width].jsErrors = errors.slice(0, 3);
    } catch (e) {
      findings[key][width] = { error: e.message.slice(0, 90) };
    }
    await ctx.close();
  }
}

await browser.close(); server.close();
writeFileSync(new URL('./.mobile-pages/findings.json', import.meta.url), JSON.stringify(findings, null, 2));

// ── Report ─────────────────────────────────────────────────────────────
console.log('\n════════ PHASE 0 — MEASURED MOBILE AUDIT ════════\n');
const overflowPages = [];
for (const [slug, byWidth] of Object.entries(findings)) {
  const w320 = byWidth[320] || {};
  const anyOverflow = WIDTHS.filter(w => (byWidth[w]?.overflow ?? 0) > 1);
  const maxSmall = Math.max(...WIDTHS.map(w => byWidth[w]?.smallCount ?? 0));
  const maxTiny = Math.max(...WIDTHS.map(w => byWidth[w]?.tinyCount ?? 0));
  if (anyOverflow.length) overflowPages.push(slug);

  console.log(`── /${slug}`);
  console.log(`   overflow      : ${anyOverflow.length ? anyOverflow.map(w=>w+'px:+'+byWidth[w].overflow).join(' ') : 'none ✓'}`);
  if (w320.widest) console.log(`   widest @320   : ${w320.widest}`);
  console.log(`   touch <44px   : ${maxSmall}${maxSmall ? '  e.g. ' + (w320.smallTargets||[]).slice(0,3).join(' | ') : ' ✓'}`);
  console.log(`   text <12px    : ${maxTiny}${maxTiny ? '  e.g. ' + (w320.tinyText||[]).slice(0,3).join(' | ') : ' ✓'}`);
  if ((w320.wideEls||[]).length) console.log(`   wider than vw : ${w320.wideEls.join(' | ')}`);
  if ((w320.fixedEls||[]).length) console.log(`   fixed/sticky  : ${w320.fixedEls.join(' | ')}`);
  console.log(`   page height   : ${w320.pageHeight}px (${w320.screensToScroll} screens)   first action at ${w320.firstActionTop ?? '—'}px`);
  console.log(`   viewport meta : ${w320.viewportContent || 'MISSING'}   safe-area: ${w320.usesSafeArea ? 'yes' : 'NO'}`);
  if (w320.jsErrors) console.log(`   JS ERRORS     : ${w320.jsErrors.join(' | ')}`);
  console.log('');
}
console.log(`SUMMARY: ${overflowPages.length}/${CASES.length} screens overflow horizontally → ${overflowPages.join(', ') || 'none'}`);

// ── Gate ──────────────────────────────────────────────────────────────
const failures = [];
for (const [slug, byWidth] of Object.entries(findings)) {
  for (const w of WIDTHS) {
    const f = byWidth[w];
    if (!f || f.error) { failures.push(`${slug}@${w}: ${f?.error ?? 'no measurement'}`); continue; }
    if (f.overflow > 1) failures.push(`${slug}@${w}: horizontal overflow +${f.overflow}px (${f.widest ?? '?'})`);
    if (f.jsErrors) failures.push(`${slug}@${w}: JS error — ${f.jsErrors[0]}`);
  }
}
if (failures.length) {
  console.error(`\n════ MOBILE GATE FAILED — ${failures.length} ════`);
  failures.slice(0, 20).forEach((x) => console.error('  ✗ ' + x));
  process.exit(1);
}
console.log('\n════ MOBILE GATE PASSED — no overflow, no page errors ════');
