import { chromium } from 'playwright';
const B=process.env.QAREEB_BASE||'http://127.0.0.1:8901';
const ROUTES=["#/","#/needs","#/doctors","#/doctor/d1","#/pharmacies","#/pharmacy/p1",
"#/hospitals","#/hospital/h1","#/care","#/care/mother","#/product/pr1","#/start","#/explorer",
"#/rx","#/rx/v1","#/need/new","#/need/n1","#/radar/n1","#/wait/n1","#/med/m1",
"#/partner/p1","#/partner/doctor/d1","#/search","#/me","#/trust","#/admin","#/settings",
"#/settings/privacy","#/privacy","#/about","#/record","#/record/conditions","#/record/medications",
"#/record/allergies","#/record/labs","#/record/documents","#/record/immunizations","#/record/visits",
"#/record/procedures","#/record/followups","#/record/timeline","#/record/shares","#/record/share",
"#/record/access","#/record/carry","#/record/profile","#/record/vitals","#/record/inbox",
"#/record/sync","#/record/signin","#/record/add/allergy","#/record/add/medication",
"#/record/add/condition","#/record/add/document","#/record/add/vital","#/record/thread/cond:C1",
"#/clinical/PAT-J","#/clinical/inbox","#/redeem/ABC123","#/lab","#/lab/l1","#/imaging",
"#/imaging/study/s1","#/pharmacy-rx","#/nonexistent-route-xyz"];
const SEED=()=>{localStorage.setItem("qrb.qareeb.record.v1",JSON.stringify({
 patient:{id:"PAT-J",nameParts:{given:"زينب",father:"كاظم",grandfather:"عبدالله"},birthDate:"1986-11-02",sex:"female"},
 allergies:[{id:"A1",substance:"البنسلين",criticality:"high"}],
 conditions:[{id:"C1",display:"داء السكري النوع ٢",clinicalStatus:"active",chronic:true,onsetDate:"2025-02-09"}],
 medications:[{id:"M1",display:"ميتفورمين",dose:"500 ملغم",frequency:"BID",indicationId:"C1",startDate:"2025-02-09"}],
 results:[{id:"R2",code:"HbA1c",display:"الخضاب السكري",value:8.4,unit:"%",refLow:4,refHigh:5.6,effectiveAt:"2026-07-01",performerId:"L1",conditionId:"C1"}],
 documents:[],immunizations:[],encounters:[],procedures:[],vitals:[],prescriptions:[],
 episodes:[],tasks:[],appointments:[],shares:[],accessLog:[],requests:[]}));
 localStorage.setItem("qrb.qareeb.clinician.v1",JSON.stringify({id:"DR-9",name:"د. سهى",role:"doctor",licenseStatus:"SELF_ASSERTED"}));};
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const ctx=await b.newContext({viewport:{width:390,height:844}});
const seedPage=await ctx.newPage(); await seedPage.goto(B+'/index.html'); await seedPage.waitForTimeout(300);
await seedPage.evaluate(SEED); await seedPage.close();
let blank=0,dead=0,errs=0;
for(const r of ROUTES){
  const p=await ctx.newPage(); const e=[]; p.on('pageerror',x=>e.push(String(x).slice(0,120)));
  await p.goto(B+'/index.html'+r,{waitUntil:'domcontentloaded'}); await p.waitForTimeout(480);
  const v=await p.evaluate(()=>({len:(document.body.innerText||'').trim().length,
    out:document.querySelectorAll('a[href],button,[onclick]').length,
    nav:!!document.querySelector('.nav'),back:!!document.querySelector('.hdr-back')}));
  const isBlank=v.len<60, noWay=!(v.nav||v.back)&&v.out===0;
  if(isBlank){blank++;console.log(`  BLANK  ${r} len=${v.len}`);}
  if(noWay){dead++;console.log(`  DEAD   ${r}`);}
  if(e.length){errs++;console.log(`  ERROR  ${r} — ${e[0]}`);}
  await p.close();
}
console.log(`\n${ROUTES.length} routes · ${blank} blank · ${dead} dead ends · ${errs} with console errors`);
await b.close(); if(blank||dead||errs) process.exit(1);
