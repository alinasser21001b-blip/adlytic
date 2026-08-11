// ════════════════════════════════════════════════════════════════════════
//  test_window_label_honesty.mjs
//
//  THE DEFECT THIS EXISTS FOR
//  The campaigns table has server-aggregated columns — results, cost per
//  result, CTR, spend-in-window — and a header that names the window they
//  cover: «الإنفاق (30ي)». Pressing a date tab rewrote that header
//  immediately and THEN re-fetched. The catch swallowed failures with the
//  comment "keep showing the previous window's numbers", which is exactly
//  what it did: on a timeout or a 5xx the merchant was left reading a
//  month's figures under a «(7ي)» header. Reproduced in Chromium — the row
//  was byte-identical before and after; only the label had changed.
//
//  THE INVARIANT
//  A period label may only name the window the displayed numbers actually
//  came from. When the switch fails, the label, the active tab and the rows
//  must all agree on the window still being shown, and the user must be told
//  the switch did not happen.
//
//  Prereq: pages rendered via `npx tsx scripts/render-pages.mts`.
// ════════════════════════════════════════════════════════════════════════
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { chromium } from 'playwright';
const ROOT='.mobile-pages', PUB='public';
const MIME={'.html':'text/html; charset=utf-8','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2'};
const WS='ws_1';
const dates=[]; for(let i=29;i>=0;i--) dates.push(new Date(Date.now()-i*86400000).toISOString().slice(0,10));
const daily=dates.map((d,i)=>({date:d,spend:90000+i*2000,impressions:18000+i*400,clicks:380+i*11,ctr:2.1,cpm:5100,frequency:1.4,reach:14000,messages:9+(i%6),purchases:0,leads:0}));
const camps=[
 {id:'c1',externalId:'2301',name:'حملة الرسائل — بغداد',status:'ACTIVE',objective:'OUTCOME_ENGAGEMENT',deliveryTier:'DELIVERING_TODAY',deliveringInWindow:true,isCurrentlySpending:true,spendWindowMinor:2400000,resultsWindow:260,resultLabelAr:'محادثة',costPerResult:9230,ctrWindow:2.27,dailyBudget:25000,windowDays:30,health:78},
 {id:'c3',externalId:'2303',name:'حملة الزيارات — أربيل',status:'ACTIVE',objective:'OUTCOME_TRAFFIC',deliveryTier:'DELIVERING_WINDOW',deliveringInWindow:true,isCurrentlySpending:false,spendWindowMinor:1500000,resultsWindow:9000,resultLabelAr:'نقرة',costPerResult:166,ctrWindow:3.0,dailyBudget:20000,windowDays:30,health:65},
];
let failDaysFetch = false;
const srv=createServer((req,res)=>{
  const u=req.url, p=u.split('?')[0];
  const json=(o)=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(o));};
  if(p.endsWith('/campaigns')){
    // The date-tab switch adds ?days= — that is the request we make fail.
    if(failDaysFetch && /[?&]days=/.test(u)){ res.writeHead(503); return res.end('{}'); }
    return json(camps);
  }
  if(p==='/api/auth/me') return json({id:'u1',email:'a@b.co',name:'علي',locale:'AR',isActive:true,memberships:[{workspaceId:WS,workspace:{id:WS,name:'متجر النور'}}]});
  if(p.includes('/insights')) return json(daily);
  if(p.startsWith('/api/workspaces/'+WS)) return json({id:WS,name:'متجر النور',currency:'IQD',minorFactor:1,adAccounts:[{id:'a1',lastSyncedAt:new Date().toISOString()}]});
  if(p.startsWith('/api/')) return json({});
  let f=join(ROOT,p); if(!existsSync(f)) f=join(PUB,p);
  if(!existsSync(f)){res.writeHead(404);return res.end();}
  res.writeHead(200,{'Content-Type':MIME[extname(f)]||'application/octet-stream'}); res.end(readFileSync(f));
});
await new Promise(r=>srv.listen(4185,r));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const page=await b.newPage({viewport:{width:1440,height:1000}});
await page.addInitScript((ws)=>{try{localStorage.setItem('adlytic_token','t');localStorage.setItem('adlytic_workspace_id',ws);}catch(e){}},WS);
await page.goto('http://localhost:4185/campaigns.html',{waitUntil:'domcontentloaded'});
await page.waitForTimeout(2400);

const read = async () => await page.evaluate(() => {
  const lbl = document.getElementById('window-label');
  const cells = [...document.querySelectorAll('#campaigns-tbody tr')].map(tr => {
    const tds = [...tr.querySelectorAll('td')].map(td => td.textContent.trim());
    return tds;
  });
  const active = document.querySelector('.tab.active');
  return { label: lbl ? lbl.textContent : null, tab: active ? active.textContent.trim() : null, firstRow: cells[0] || [] };
});

let bad = 0;
const check = (name, ok, extra) => { console.log((ok ? '  \u2713 ' : '  \u2717 ') + name + (!ok && extra ? '  \u2192 ' + extra : '')); if (!ok) bad++; };

const start = await read();
console.log('\n\u2500\u2500 a date switch that succeeds \u2500\u2500');
check('starts on the 30-day window', start.label === '(30\u064a)', start.label);

failDaysFetch = false;
await page.click('[data-days="7"]');
await page.waitForTimeout(1800);
const okSwitch = await read();
check('label follows a successful switch', okSwitch.label === '(7\u064a)', okSwitch.label);
check('tab follows a successful switch', /7/.test(okSwitch.tab || ''), okSwitch.tab);

console.log('\n\u2500\u2500 a date switch that fails \u2500\u2500');
// Go back to 30 first so the failing switch has a known window to fall back to.
await page.click('[data-days="30"]');
await page.waitForTimeout(1500);
const base = await read();
failDaysFetch = true;
await page.click('[data-days="14"]');
await page.waitForTimeout(2500);
const after2 = await read();

check('the header keeps naming the window the rows came from',
  after2.label === base.label, 'label=' + after2.label + ' but rows are ' + base.label);
check('the active tab reverts with it', after2.tab === base.tab, after2.tab);
check('the rows themselves are unchanged',
  JSON.stringify(after2.firstRow) === JSON.stringify(base.firstRow));
const warned = await page.evaluate(() => [...document.querySelectorAll('#toast-container .toast')].map((t) => t.textContent).join(' | '));
check('the failure is announced, not swallowed', /\u062a\u0639\u0630\u0651\u0631|14/.test(warned), warned || '(no toast)');

await b.close(); srv.close();
console.log(bad ? '\n\u2550\u2550\u2550\u2550 ' + bad + ' FAILURES \u2550\u2550\u2550\u2550\n' : '\n\u2550\u2550\u2550\u2550 window label honesty OK \u2550\u2550\u2550\u2550\n');
process.exit(bad ? 1 : 0);
