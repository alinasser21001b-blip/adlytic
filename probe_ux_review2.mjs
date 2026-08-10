// TEMPORARY UX review probe 2 — overlap, real backgrounds, text, fonts. Delete after.
import http from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { chromium, devices } from 'playwright';
const DIR = new URL('./.mobile-pages/', import.meta.url);
const OUT = '/tmp/claude-0/-home-user-adlytic/c693f65f-69ef-55b5-8da4-3db03f87b2d0/scratchpad/shots';
mkdirSync(OUT, { recursive: true });
const WS = 'ws_x';
const fullDto = JSON.parse(readFileSync(new URL('./tests/fixtures/mobile-dto.json', import.meta.url), 'utf8'));
const server = http.createServer((req, res) => {
  const url = (req.url || '').split('?')[0];
  const json = (c, o) => { res.writeHead(c, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  const slug = url.replace(/^\//, '') || 'dashboard';
  if (url.startsWith('/fonts/') && url.endsWith('.woff2')) { try { const b = readFileSync(new URL('../public' + url, DIR)); res.writeHead(200, { 'content-type': 'font/woff2' }); return res.end(b); } catch { res.writeHead(404); return res.end(''); } }
  if (url.startsWith('/assets/') && url.endsWith('.css')) { try { const c = readFileSync(new URL('.' + url, DIR), 'utf8'); res.writeHead(200, { 'content-type': 'text/css; charset=utf-8' }); return res.end(c); } catch { res.writeHead(500); return res.end(''); } }
  try { const h = readFileSync(new URL(`${slug}.html`, DIR), 'utf8'); res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(h); } catch {}
  if (url.startsWith('/api/auth/me')) return json(200, { id: 'u1', email: 'ali@adlytic.com', name: 'Ali', locale: 'AR', isActive: true, isPlatformAdmin: true, memberships: [{ workspaceId: WS, workspace: { id: WS, name: "Ali's Workspace" } }] });
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
await new Promise(r => server.listen(4712, r));
const base = 'http://127.0.0.1:4712';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });

const P2 = `(() => {
  const vis = el => { const cs=getComputedStyle(el); if(cs.display==='none'||cs.visibility==='hidden'||Number(cs.opacity)===0) return false;
    const r=el.getBoundingClientRect(); return r.width>1&&r.height>1; };
  const name = el => el.tagName.toLowerCase()+(el.id?'#'+el.id:'')+(typeof el.className==='string'&&el.className?'.'+el.className.trim().split(/\\s+/).slice(0,3).join('.'):'');

  // Real paint: background-color AND background-image
  const paint = [];
  document.querySelectorAll('*').forEach(el=>{
    if(!vis(el)) return; const cs=getComputedStyle(el);
    if(cs.backgroundImage!=='none') paint.push({el:name(el), bgi:cs.backgroundImage.slice(0,110), bgc:cs.backgroundColor});
  });

  // Text overlapping other text (leaf nodes only)
  const leaves=[...document.querySelectorAll('*')].filter(el=>vis(el) &&
    [...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim().length>1));
  const overlaps=[];
  for(let i=0;i<leaves.length;i++) for(let j=i+1;j<leaves.length;j++){
    const a=leaves[i],b=leaves[j];
    if(a.contains(b)||b.contains(a)) continue;
    const ra=a.getBoundingClientRect(), rb=b.getBoundingClientRect();
    const ox=Math.min(ra.right,rb.right)-Math.max(ra.left,rb.left);
    const oy=Math.min(ra.bottom,rb.bottom)-Math.max(ra.top,rb.top);
    if(ox>6&&oy>6){
      const ca=getComputedStyle(a), cb=getComputedStyle(b);
      if(ca.position==='fixed'||cb.position==='fixed'||ca.position==='sticky'||cb.position==='sticky') continue;
      overlaps.push({a:name(a),at:a.textContent.trim().slice(0,28),b:name(b),bt:b.textContent.trim().slice(0,28),ox:Math.round(ox),oy:Math.round(oy)});
    }
  }

  // Fonts actually used, and whether Arabic text renders in the intended face
  const fontUse={};
  document.querySelectorAll('*').forEach(el=>{
    const own=[...el.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent.trim()).join('');
    if(own.length<2||!vis(el)) return;
    const cs=getComputedStyle(el);
    const k=cs.fontFamily.split(',')[0].replace(/["']/g,'')+' | '+cs.fontSize+' | w'+cs.fontWeight;
    (fontUse[k]=fontUse[k]||[]).push(own.slice(0,24));
  });

  // Ellipsis / truncation actually happening
  const truncated=[];
  document.querySelectorAll('*').forEach(el=>{
    if(!vis(el)) return; const cs=getComputedStyle(el);
    if(cs.textOverflow!=='ellipsis'&&cs.overflow!=='hidden') return;
    if(el.scrollWidth>el.clientWidth+2 && el.textContent.trim().length>2)
      truncated.push({el:name(el), full:el.textContent.trim().slice(0,60), shown:Math.round(el.clientWidth)+'/'+el.scrollWidth});
  });

  // All visible text, in DOM order, for language/jargon reading
  const all=[];
  document.querySelectorAll('*').forEach(el=>{
    const own=[...el.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent.trim()).filter(Boolean).join(' ');
    if(own.length>1&&vis(el)) all.push(own);
  });

  // Content hidden behind the fixed bottom nav?
  const nav=document.querySelector('.mobile-bottom-nav,[class*=bottom-nav]');
  const navTop=nav?nav.getBoundingClientRect().top:null;
  const bodyPadBottom=getComputedStyle(document.body).paddingBottom;

  const dedupe=a=>[...new Map(a.map(x=>[JSON.stringify(x),x])).values()];
  return { paint:dedupe(paint).slice(0,40), overlaps:dedupe(overlaps).slice(0,20),
    fontUse:Object.fromEntries(Object.entries(fontUse).map(([k,v])=>[k,v.length+'x e.g. '+v.slice(0,2).join(' / ')])),
    truncated:dedupe(truncated).slice(0,20), all:[...new Set(all)], navTop, bodyPadBottom,
    docHeight:document.body.scrollHeight };
})()`;

const PAGES=(process.env.PAGES||'dashboard,campaigns,ai,recommendations,settings,support,ad-analysis,workspace').split(',');
const out={};
for(const slug of PAGES){
  const ctx=await browser.newContext({viewport:{width:390,height:780},deviceScaleFactor:2,isMobile:true,hasTouch:true,userAgent:devices['iPhone 13'].userAgent});
  const page=await ctx.newPage();
  await page.addInitScript(()=>{localStorage.setItem('adlytic_token','t');localStorage.setItem('adlytic_workspace_id','ws_x');});
  await page.goto(`${base}/${slug}`,{waitUntil:'domcontentloaded',timeout:20000});
  await page.waitForTimeout(2600);
  out[slug]=await page.evaluate(P2);
  await ctx.close();
  console.log(slug,'overlaps',out[slug].overlaps.length,'trunc',out[slug].truncated.length);
}
writeFileSync(`${OUT}/report2.json`,JSON.stringify(out,null,2));
await browser.close(); server.close();
