import { chromium } from 'playwright';
import fs from 'fs';
const B=process.env.QAREEB_BASE||'http://127.0.0.1:8901';
/* the six surfaces §10 names, on the same seed shape the baseline used */
const SURFACES=[["home","#/"],["record","#/record"],["episode","#/record/thread/cond:C1"],
 ["results","#/record/labs"],["timeline","#/record/timeline"],["navigation","#/care"]];
const SEED=()=>{localStorage.setItem("qrb.qareeb.record.v1",JSON.stringify({
 patient:{id:"PAT-X",nameParts:{given:"زينب",father:"كاظم",grandfather:"عبدالله"},birthDate:"1986-11-02",sex:"female",identifiers:[]},
 allergies:[{id:"A1",substance:"البنسلين",reaction:"طفح جلدي",criticality:"high"}],
 conditions:[{id:"C1",display:"داء السكري النوع ٢",clinicalStatus:"active",chronic:true,onsetDate:"2024-03-01",lastReviewed:"2024-03-01"},
  {id:"C2",display:"ارتفاع ضغط الدم",clinicalStatus:"active",chronic:true,onsetDate:"2023-01-05",lastReviewed:"2026-05-11"}],
 medications:[{id:"M1",display:"ميتفورمين",dose:"500 ملغم",frequency:"BID",indication:"السكري",indicationId:"C1",startDate:"2024-03-01",prescriberId:"DR-2"},
  {id:"M2",display:"أملوديبين",dose:"5 ملغم",frequency:"OD",indication:"ارتفاع ضغط",indicationId:"C2",startDate:"2023-01-05",prescriberId:"DR-2"}],
 results:[{id:"R1",code:"HbA1c",display:"الخضاب السكري",value:7.1,unit:"%",refLow:4,refHigh:5.6,effectiveAt:"2025-08-03",performerId:"L1",acknowledgedBy:"DR1",conditionId:"C1"},
  {id:"R2",code:"HbA1c",display:"الخضاب السكري",value:8.4,unit:"%",refLow:4,refHigh:5.6,effectiveAt:"2026-07-01",performerId:"L1",conditionId:"C1"},
  {id:"R3",code:"Hb",display:"الهيموغلوبين",value:10.2,unit:"g/dL",refLow:12,refHigh:16,effectiveAt:"2026-07-02",performerId:"L1"}],
 documents:[],immunizations:[],procedures:[],vitals:[],prescriptions:[],
 encounters:[{id:"E1",startedAt:"2026-05-11",clinicianId:"DR-2",chiefComplaint:"متابعة",assessment:"مضبوط جزئياً",state:"signed",conditionId:"C1"}],
 episodes:[],tasks:[{id:"T1",kind:"result-acknowledgement",status:"open",about:"الخضاب السكري",dueAt:"2026-07-01"}],
 appointments:[],shares:[],accessLog:[],requests:[]}));};
const MEASURE=()=>{
 const vp=844;
 const heavy=[];
 for(const el of document.querySelectorAll("*")){
  if(el.children.length) continue;
  const t=(el.textContent||"").trim(); if(!t) continue;
  const cs=getComputedStyle(el); if(cs.visibility==="hidden"||cs.display==="none") continue;
  const r=el.getBoundingClientRect(); if(!r.width||!r.height||r.top>vp) continue;
  heavy.push({t:t.slice(0,40),s:parseFloat(cs.fontSize)*(parseInt(cs.fontWeight)||400)});}
 heavy.sort((a,b)=>b.s-a.s);
 const seen=new Set(),top3=[];
 for(const h of heavy){if(seen.has(h.t))continue;seen.add(h.t);top3.push(h.t);if(top3.length===3)break;}
 let firstVpNodes=0;
 for(const el of document.querySelectorAll("body *")){const r=el.getBoundingClientRect();
  if(r.height&&r.top<vp&&r.bottom>0)firstVpNodes++;}
 const q=(s)=>document.querySelectorAll(s).length;
 return {len:(document.body.innerText||"").trim().length,scrollH:document.documentElement.scrollHeight,
  tabs:q(".nav a"),segs:q(".seg,.segs a,.segs button"),rails:q(".th-rail"),rows:q(".rw"),
  notes:q(".note"),chips:q(".chip"),cards:q(".card"),
  regRows:q(".reg-row"),sheets:q(".sheet-row"),bands:q(".dband"),stmts:q(".stmt"),
  deltas:q(".delta"),owns:q(".own"),holes:q(".hole"),
  firstVpNodes,top3, overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth};};
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const out=[];
for(const w of [320,390,430]){
 const ctx=await b.newContext({viewport:{width:w,height:844},deviceScaleFactor:2});
 const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e).slice(0,120)));
 await p.goto(B+'/index.html'); await p.waitForTimeout(300); await p.evaluate(SEED);
 for(const [name,hash] of SURFACES){
  await p.goto(B+'/index.html'+hash,{waitUntil:'domcontentloaded'}); await p.waitForTimeout(560);
  const m=await p.evaluate(MEASURE);
  await p.screenshot({path:`/tmp/claude-0/-home-user-adlytic/30c5cf51-55fb-5b53-a1de-65634dd53fa8/scratchpad/shots/fp-${name}-${w}.png`,fullPage:true});
  out.push({w,name,...m,errs:errs.length});}
 await ctx.close();}
await b.close();
fs.writeFileSync('/tmp/claude-0/-home-user-adlytic/30c5cf51-55fb-5b53-a1de-65634dd53fa8/scratchpad/after-fingerprint.json',JSON.stringify(out,null,1));
const base=JSON.parse(fs.readFileSync('docs/baseline-fingerprint.json','utf8'));
const g=(a,n,w)=>a.find(x=>x.name===n&&x.w===w);
console.log("surface     320 before→after   390 before→after   430 before→after   390=430?");
for(const n of ["home","record","episode","results","timeline","navigation"]){
 const r=[320,390,430].map(w=>{const b0=g(base,n,w),a0=g(out,n,w);return {b:b0&&b0.scrollH,a:a0&&a0.scrollH};});
 const bIdent=g(base,n,390).scrollH===g(base,n,430).scrollH;
 const aIdent=g(out,n,390).scrollH===g(out,n,430).scrollH;
 console.log(`${n.padEnd(11)} ${r.map(x=>`${String(x.b).padStart(4)}→${String(x.a).padStart(4)}`).join("   ")}   before:${bIdent?"IDENTICAL":"differs "} after:${aIdent?"IDENTICAL":"differs"}`);}
console.log("\ntop3 in first viewport at 390 (heaviest rendered text):");
for(const n of ["home","record","episode","results","timeline","navigation"])
 console.log(` ${n.padEnd(11)} before: ${g(base,n,390).top3.join(" · ")}\n ${" ".repeat(11)} after:  ${g(out,n,390).top3.join(" · ")}`);
