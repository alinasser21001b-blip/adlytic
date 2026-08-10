// ════════════════════════════════════════════════════════════════════════
//  test_desktop_viewport.mjs — DESKTOP REGRESSION GATE
//
//  The mobile gate measures 320–430px and probes six breakpoints, the widest
//  of which is 1023px. Everything a customer on a laptop or a shop monitor
//  actually sees — 1280, 1440, 1920, 2560 — has never been measured by
//  anything, and `grep '@media (min-width'` over src/web returns NOTHING.
//  The product is not responsive at desktop sizes; it is the phone layout
//  with more room, and nobody had checked what that looks like.
//
//  Desktop fails differently from mobile, so this asks different questions:
//
//    · LINE LENGTH. The mobile gate cannot fail on this — 390px forces a
//      short measure. At 1920px a paragraph can run 200 characters, which is
//      roughly twice the width at which the eye reliably finds the next line.
//      For Arabic, set in Readex Pro with generous counters, long measures
//      are worse still.
//    · WASTED WIDTH. A container capped at 1400px inside a 2560px window
//      leaves 45% of the screen empty. That can be a deliberate choice; it
//      cannot be an accident nobody looked at.
//    · OVERSTRETCH. The opposite failure: a control or card with no cap that
//      grows to the full viewport and turns a form field into a 1.8m line.
//    · TAP-TARGET FLOORS LEAKING UP. The 44px touch floors are correct on a
//      phone and wrong on a mouse-driven screen, where they make every
//      toolbar look like a tablet app.
//
//  Prereq: pages rendered via `npx tsx scripts/render-pages.mts`.
//  Run: node test_desktop_viewport.mjs [--shots]
// ════════════════════════════════════════════════════════════════════════
import http from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const WS = 'ws_x';
const SHOTS = process.argv.includes('--shots');
const OUT_DIR = '.desktop-shots';

// Real desktop widths, not round numbers for their own sake:
//   1280 — the most common laptop viewport, and a 13" MacBook in Safari
//   1440 — 14"/15" laptops and the default half-screen split on a 2880 monitor
//   1600 — a maximised window on a 1080p monitor with a dock
//   1920 — the single most common desktop monitor in the world
//   2560 — a 27" QHD, which is what an office desk in Baghdad increasingly is
const WIDTHS = [1280, 1440, 1600, 1920, 2560];

// Characters per line. Typographic convention puts comfortable running text at
// 45–75; 90 is the point past which line-tracking errors climb sharply.
const MEASURE_MAX_CH = 90;
// Below this a "desktop" layout is just a stretched phone with empty sides.
const MIN_WIDTH_USE = 0.55;

const fullDto = JSON.parse(readFileSync('./tests/fixtures/mobile-dto.json', 'utf8'));

const server = http.createServer((req, res) => {
  const url = (req.url || '').split('?')[0];
  const json = (c, o) => { res.writeHead(c, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  const slug = url.replace(/^\//, '') || 'dashboard';
  if (url.startsWith('/fonts/') && url.endsWith('.woff2')) {
    try { res.writeHead(200, { 'content-type': 'font/woff2' }); return res.end(readFileSync('./public' + url)); }
    catch { res.writeHead(404); return res.end(''); }
  }
  if (url.startsWith('/assets/') && url.endsWith('.css')) {
    try { res.writeHead(200, { 'content-type': 'text/css; charset=utf-8' }); return res.end(readFileSync('./.mobile-pages' + url, 'utf8')); }
    catch { res.writeHead(500); return res.end('/* MISSING: run scripts/render-pages.mts first */'); }
  }
  // Read BEFORE writing the header: a missing file must fall through to the
  // API stubs, and headers already sent cannot be taken back.
  let html = null;
  try { html = readFileSync('./.mobile-pages/' + slug + '.html', 'utf8'); } catch { /* not a page */ }
  if (html !== null) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(html);
  }
  if (url.startsWith('/api/auth/me')) return json(200, { id: 'u1', email: 'ali@adlytic.com', name: 'Ali', locale: 'AR', isActive: true, isPlatformAdmin: true, memberships: [{ workspaceId: WS, workspace: { id: WS, name: "Ali's Workspace" } }] });
  if (url === '/api/dashboard/' + WS) return json(200, fullDto);
  if (url.startsWith('/api/dashboard/pulse/')) return json(200, { empty: true, workspaceId: WS });
  if (url.includes('/campaigns')) return json(200, fullDto.campaigns || []);
  if (url.includes('/insights')) return json(200, fullDto.insights || []);
  if (url.includes('/issue-dates')) return json(200, []);
  if (url.includes('/data-health')) return json(200, { checkedAt: new Date().toISOString(), overallStatus: 'OK', checks: [], campaignCounts: {}, divergenceStatus: 'OK', divergencePct: 0, orphanedCount: 0 });
  if (url === `/api/workspaces/${WS}`) return json(200, { id: WS, name: "Ali's Workspace", locale: 'AR', adAccounts: [{ id: 'aa_1', name: 'Adlytic Demo', status: 'ACTIVE', currency: 'IQD', currencyMinorFactor: 1, lastSyncedAt: '2026-08-08T12:00:00.000Z', createdAt: '2026-01-01T00:00:00.000Z' }] });
  if (url.startsWith('/api/recommendations')) return json(200, fullDto.recommendations || []);
  if (url.startsWith('/api/')) return json(200, {});
  res.writeHead(404); res.end('');
});

const PORT = Number(process.env.DESKTOP_AUDIT_PORT || 4602);
await new Promise((r) => server.listen(PORT, r));
const base = `http://127.0.0.1:${PORT}`;

const PROBE = `(() => {
  const de = document.documentElement, b = document.body;
  const vw = de.clientWidth;
  const out = { vw };

  // 1. Horizontal overflow, both directions (this app is dir="rtl", where
  //    overflow hangs off the LEFT as a negative x).
  out.overflow = Math.max(de.scrollWidth, b.scrollWidth) - vw;
  out.widest = null;
  if (out.overflow > 1) {
    let best = 0;
    document.querySelectorAll('*').forEach(el => {
      const r = el.getBoundingClientRect();
      const over = Math.max(r.right - vw, -r.left);
      if (over > best && r.width > 0 && getComputedStyle(el).position !== 'fixed') {
        best = over;
        out.widest = el.tagName.toLowerCase()
          + (el.id ? '#' + el.id : '')
          + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\\s+/).slice(0,2).join('.') : '')
          + ' [+' + Math.round(over) + 'px]';
      }
    });
  }

  // 2. How much of the window the content actually occupies. Measured from
  //    the visible content region, not from body, because body is always 100%.
  const main = [...document.querySelectorAll('.page-content, .main, main')]
    .filter(el => el.getBoundingClientRect().width > 0)[0];
  out.contentWidth = main ? Math.round(main.getBoundingClientRect().width) : 0;
  const sidebar = document.querySelector('.sidebar');
  const sbW = sidebar && getComputedStyle(sidebar).display !== 'none'
    ? Math.round(sidebar.getBoundingClientRect().width) : 0;
  out.sidebarWidth = sbW;
  out.widthUse = vw ? +(((out.contentWidth + sbW) / vw).toFixed(3)) : 0;

  // 3. LINE LENGTH. Only real running text: a block whose own text is long
  //    enough to wrap. Characters, not pixels — the readability limit is a
  //    character count and pixels vary with the font.
  const measure = document.createElement('canvas').getContext('2d');
  out.longLines = [];
  document.querySelectorAll('p, .card-text, .empty-text, .insight-text, .rec-text, .dash-state-text, .page-subtitle, .observer-msg, li, td').forEach(el => {
    const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join(' ');
    if (own.length < 60) return;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    const w = el.getBoundingClientRect().width;
    if (w < 100) return;
    measure.font = cs.fontSize + ' ' + cs.fontFamily;
    // Average advance of this element's own text — a truer per-font measure
    // than the "0.5em" rule of thumb, and it works for Arabic.
    const avg = measure.measureText(own).width / own.length;
    if (!avg) return;
    const ch = Math.round(w / avg);
    if (ch > ${MEASURE_MAX_CH}) {
      out.longLines.push({
        sel: el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\\s+/)[0] : ''),
        ch, px: Math.round(w), text: own.slice(0, 44)
      });
    }
  });
  // Dedupe by selector, keep the worst.
  const worst = new Map();
  out.longLines.forEach(l => { const p = worst.get(l.sel); if (!p || l.ch > p.ch) worst.set(l.sel, l); });
  out.longLines = [...worst.values()].sort((a,b) => b.ch - a.ch).slice(0, 6);

  // 4. Touch floors leaking onto a pointer-driven screen. 44px is right for a
  //    thumb and oversized for a cursor; a desktop toolbar built from 44px
  //    rows reads as a tablet app.
  out.oversizedControls = 0;
  document.querySelectorAll('.btn-sm, .tab, .chip, .qa-chip, .topbar-btn').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.height >= 44 && r.width > 0) out.oversizedControls++;
  });

  // 5. Is the mobile chrome correctly gone?
  const bn = document.querySelector('.mobile-bottom-nav');
  out.bottomNavVisible = !!(bn && getComputedStyle(bn).display !== 'none');

  out.bodyFontPx = parseFloat(getComputedStyle(b).fontSize);
  return out;
})()`;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
if (SHOTS) mkdirSync(OUT_DIR, { recursive: true });

const PAGES = ['dashboard', 'campaigns', 'recommendations', 'ad-analysis', 'settings', 'workspace', 'ai', 'support'];
const findings = [];
let overflowCount = 0;
let measureCount = 0;
let narrowCount = 0;

for (const slug of PAGES) {
  console.log(`\n── /${slug}`);
  for (const width of WIDTHS) {
    const page = await browser.newPage({
      viewport: { width, height: 900 },
      deviceScaleFactor: 1,
      hasTouch: false,
      isMobile: false,
    });
    await page.addInitScript(() => { try { localStorage.setItem('adlytic_token', 't'); } catch (e) {} });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 120)));
    await page.goto(`${base}/${slug}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);

    const m = await page.evaluate(PROBE);
    const flags = [];
    if (m.overflow > 1) { flags.push(`OVERFLOW +${Math.round(m.overflow)}px ${m.widest ?? ''}`); overflowCount++; }
    if (m.longLines.length) {
      measureCount++;
      flags.push(`MEASURE ${m.longLines.map((l) => `${l.sel}=${l.ch}ch`).join(' ')}`);
    }
    if (m.widthUse && m.widthUse < MIN_WIDTH_USE) { flags.push(`WIDTH-USE ${(m.widthUse * 100).toFixed(0)}%`); narrowCount++; }
    if (m.bottomNavVisible) flags.push('BOTTOM-NAV VISIBLE');
    if (errors.length) flags.push(`JS ERROR: ${errors[0]}`);

    console.log(
      `  ${String(width).padStart(4)}px  content ${String(m.contentWidth).padStart(4)}  `
      + `+sidebar ${String(m.sidebarWidth).padStart(3)}  use ${(m.widthUse * 100).toFixed(0).padStart(3)}%  `
      + `≥44px controls ${String(m.oversizedControls).padStart(2)}  ${flags.length ? '⚠ ' + flags.join(' | ') : '✓'}`,
    );
    findings.push({ slug, width, ...m, errors });

    if (SHOTS) await page.screenshot({ path: `${OUT_DIR}/${slug}-${width}.png` });
    await page.close();
  }
}

await browser.close();
server.close();

writeFileSync('.desktop-findings.json', JSON.stringify(findings, null, 2));

console.log(`\n════ DESKTOP AUDIT ════`);
console.log(`pages x widths      : ${PAGES.length} x ${WIDTHS.length} = ${findings.length} measurements`);
console.log(`horizontal overflow : ${overflowCount}`);
console.log(`over-long measure   : ${measureCount}  (>${MEASURE_MAX_CH} characters per line)`);
console.log(`under-used width    : ${narrowCount}  (<${MIN_WIDTH_USE * 100}% of the window)`);
console.log(`findings written to .desktop-findings.json`);

// The baseline this file was written against was 30 over-long measurements
// out of 40, worst 247 characters. The desktop layer took that to 0, so it is
// a hard failure now — a threshold nobody can reach is decoration, and one
// that has been reached is a floor worth defending.
const failed = overflowCount + measureCount + narrowCount + findings.filter((f) => f.errors.length).length;
console.log(`\n════ ${failed === 0 ? 'DESKTOP GATE PASSED' : failed + ' FAILURES'} ════\n`);
process.exit(failed ? 1 : 0);
