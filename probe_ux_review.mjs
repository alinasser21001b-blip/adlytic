// TEMPORARY UX review probe — screenshots + in-context contrast. Delete after.
import http from 'node:http';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { chromium, devices } from 'playwright';

const DIR = new URL('./.mobile-pages/', import.meta.url);
const OUT = '/tmp/claude-0/-home-user-adlytic/c693f65f-69ef-55b5-8da4-3db03f87b2d0/scratchpad/shots';
mkdirSync(OUT, { recursive: true });
const WS = 'ws_x';
const fullDto = JSON.parse(readFileSync(new URL('./tests/fixtures/mobile-dto.json', import.meta.url), 'utf8'));

let OB_STATE = process.env.OB_STATE || null;
const obRecord = () => ({
  id: 'ob_1', workspaceId: WS, provider: 'META', externalAccountId: 'act_1234567890',
  state: OB_STATE, currentStepId: null, planJson: [],
  blockedRequirement: OB_STATE === 'BLOCKED' ? 'لا يملك مستخدم النظام صلاحية إسناد هذا الحساب الإعلاني تلقائيًا.' : null,
  lastError: OB_STATE === 'FAILED' ? 'Graph API returned code 190' : null,
  waitingSince: '2026-08-08T10:00:00.000Z', nextCheckAt: '2026-08-08T10:05:00.000Z',
  createdAt: '2026-08-08T09:00:00.000Z',
  completedAt: OB_STATE === 'READY' ? '2026-08-08T10:20:00.000Z' : null,
  linkedAdAccountId: OB_STATE === 'READY' ? 'aa_1' : null,
});

const server = http.createServer((req, res) => {
  const url = (req.url || '').split('?')[0];
  const json = (c, o) => { res.writeHead(c, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  const slug = url.replace(/^\//, '') || 'dashboard';
  if (url.startsWith('/fonts/') && url.endsWith('.woff2')) {
    try { const buf = readFileSync(new URL('../public' + url, DIR)); res.writeHead(200, { 'content-type': 'font/woff2' }); return res.end(buf); }
    catch { res.writeHead(404); return res.end(''); }
  }
  if (url.startsWith('/assets/') && url.endsWith('.css')) {
    try { const css = readFileSync(new URL('.' + url, DIR), 'utf8'); res.writeHead(200, { 'content-type': 'text/css; charset=utf-8' }); return res.end(css); }
    catch { res.writeHead(500); return res.end('/* MISSING */'); }
  }
  try { const html = readFileSync(new URL(`${slug}.html`, DIR), 'utf8'); res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(html); } catch {}
  if (url.startsWith('/api/auth/me')) return json(200, { id: 'u1', email: 'ali@adlytic.com', name: 'Ali', locale: 'AR', isActive: true, isPlatformAdmin: true, memberships: [{ workspaceId: WS, workspace: { id: WS, name: "Ali's Workspace" } }] });
  if (url.startsWith('/api/admin/customers')) return json(200, { customers: [{ email: 'client@example.com', workspaces: [{ id: WS, name: 'عميل تجريبي' }] }] });
  if (url.startsWith('/api/admin/meta/discover-accounts')) return json(200, { configured: false, reason: 'stubbed' });
  if (url === '/api/admin/onboarding') return json(200, { onboardings: OB_STATE ? [obRecord()] : [] });
  if (url.startsWith('/api/admin/onboarding/')) return json(200, { onboarding: OB_STATE ? obRecord() : null, timeline: [] });
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

const PORT = 4711;
await new Promise((r) => server.listen(PORT, r));
const base = `http://127.0.0.1:${PORT}`;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });

// ── Contrast probe: measures RENDERED colour against the actual painted
//    ancestor background, and reports fonts + suspicious borders.
const CONTRAST = `(() => {
  const px = s => { const m = /rgba?\\(([^)]+)\\)/.exec(s); if(!m) return null;
    const p = m[1].split(',').map(x=>parseFloat(x)); return {r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1}; };
  const lum = c => { const f=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);};
    return 0.2126*f(c.r)+0.7152*f(c.g)+0.0722*f(c.b); };
  const ratio = (a,b) => { const L1=lum(a),L2=lum(b); const hi=Math.max(L1,L2),lo=Math.min(L1,L2); return (hi+0.05)/(lo+0.05); };
  const over = (fg,bg) => ({ r: fg.r*fg.a+bg.r*(1-fg.a), g: fg.g*fg.a+bg.g*(1-fg.a), b: fg.b*fg.a+bg.b*(1-fg.a), a:1 });
  const effBg = el => {
    let n = el, acc = null;
    while (n && n.nodeType === 1) {
      const c = px(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0) { acc = acc ? over(acc, c) : c; if (acc.a >= 0.999 || c.a >= 0.999) return {r:acc.r,g:acc.g,b:acc.b,a:1}; }
      n = n.parentElement;
    }
    return acc ? {r:acc.r,g:acc.g,b:acc.b,a:1} : {r:255,g:255,b:255,a:1};
  };
  const vis = el => { const cs = getComputedStyle(el);
    if (cs.display==='none'||cs.visibility==='hidden'||Number(cs.opacity)===0) return false;
    const r = el.getBoundingClientRect(); return r.width>1 && r.height>1; };

  const hex = c => '#'+[c.r,c.g,c.b].map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');

  const low = [];
  const fonts = {};
  document.querySelectorAll('*').forEach(el => {
    const own = [...el.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent.trim()).join(' ').trim();
    if (own.length < 2) return;
    if (!vis(el)) return;
    const cs = getComputedStyle(el);
    const fs = parseFloat(cs.fontSize);
    const fw = parseInt(cs.fontWeight)||400;
    let fg = px(cs.color); if (!fg) return;
    const bg = effBg(el);
    if (fg.a < 1) fg = over(fg, bg);
    const cr = ratio(fg, bg);
    const large = fs >= 24 || (fs >= 18.66 && fw >= 700);
    const need = large ? 3 : 4.5;
    const fam = cs.fontFamily.split(',')[0].replace(/["']/g,'');
    fonts[fam] = (fonts[fam]||0)+1;
    if (cr < need) low.push({
      sel: el.tagName.toLowerCase()+(el.id?'#'+el.id:'')+(typeof el.className==='string'&&el.className?'.'+el.className.trim().split(/\\s+/).slice(0,2).join('.'):''),
      txt: own.slice(0,46), fg: hex(fg), bg: hex(bg), cr: +cr.toFixed(2), fs, fw, need,
    });
  });

  // Near-invisible borders / separators (contrast vs their own background)
  const faintBorders = [];
  document.querySelectorAll('*').forEach(el => {
    if (!vis(el)) return;
    const cs = getComputedStyle(el);
    const w = parseFloat(cs.borderTopWidth)||parseFloat(cs.borderBottomWidth)||parseFloat(cs.borderLeftWidth)||0;
    const bc = px(cs.borderTopColor || cs.borderColor);
    if (!w || !bc) return;
    const bg = effBg(el);
    const eff = bc.a<1 ? over(bc,bg) : bc;
    const cr = ratio(eff, bg);
    if (cr < 1.25) faintBorders.push({
      sel: el.tagName.toLowerCase()+(el.id?'#'+el.id:'')+(typeof el.className==='string'&&el.className?'.'+el.className.trim().split(/\\s+/).slice(0,2).join('.'):''),
      border: hex(eff), bg: hex(bg), cr:+cr.toFixed(2), w,
    });
  });

  // Latin text leaking into the Arabic UI
  const latin = [];
  document.querySelectorAll('*').forEach(el => {
    const own = [...el.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent.trim()).join(' ').trim();
    if (own.length < 2 || !vis(el)) return;
    const letters = own.replace(/[^A-Za-z\\u0600-\\u06FF]/g,'');
    if (!letters) return;
    const lat = (own.match(/[A-Za-z]{3,}/g)||[]).join(' ');
    const ar = (own.match(/[\\u0600-\\u06FF]/g)||[]).length;
    if (lat && ar === 0) latin.push(own.slice(0,70));
  });

  const dedupe = a => [...new Map(a.map(x=>[JSON.stringify(x),x])).values()];
  return {
    low: dedupe(low).sort((a,b)=>a.cr-b.cr).slice(0,40),
    lowCount: dedupe(low).length,
    faintBorders: dedupe(faintBorders).slice(0,25),
    faintCount: dedupe(faintBorders).length,
    latin: [...new Set(latin)].slice(0,60),
    fonts,
    title: document.title,
  };
})()`;

const PAGES = (process.env.PAGES || 'dashboard,campaigns,ai,recommendations,settings,add-client,ad-analysis,workspace,support,login,welcome,register').split(',');
const report = {};
for (const slug of PAGES) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: devices['iPhone 13'].userAgent,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message.slice(0, 120)));
  if (!['login','register','welcome'].includes(slug)) {
    await page.addInitScript(() => { localStorage.setItem('adlytic_token','t'); localStorage.setItem('adlytic_workspace_id','ws_x'); });
  }
  await page.goto(`${base}/${slug}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(2600);
  const tag = OB_STATE ? `${slug}-${OB_STATE}` : slug;
  await page.screenshot({ path: `${OUT}/${tag}-viewport.png` });
  await page.screenshot({ path: `${OUT}/${tag}-full.png`, fullPage: true });
  report[tag] = await page.evaluate(CONTRAST);
  report[tag].errors = errors;
  report[tag].height = await page.evaluate(() => document.body.scrollHeight);
  await ctx.close();
  console.log('done', tag, report[tag].lowCount, 'low-contrast /', report[tag].faintCount, 'faint borders');
}
writeFileSync(`${OUT}/report${OB_STATE?'-'+OB_STATE:''}.json`, JSON.stringify(report, null, 2));
await browser.close(); server.close();
