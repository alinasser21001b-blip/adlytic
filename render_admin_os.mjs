import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
const html = execSync(`npx tsx -e "import { adminOsPage } from './src/web/pages/adminOsPage'; process.stdout.write(adminOsPage());"`, { cwd: '/home/user/adlytic', maxBuffer: 64e6 }).toString();
const O='http://a.test', now=()=>new Date().toISOString();
const ws=(o={})=>({workspaceId:'w',workspaceName:'مساحة',ownerEmail:'o@x.iq',adAccountId:'a',adAccountName:'ح',externalAccountId:'act_1',currency:'IQD',hasToken:true,tokenSource:'USER_OAUTH',tokenExpiresAt:null,metaAccountStatus:1,lastSyncedAt:now(),lastSyncStatus:'COMPLETED',lastSyncError:null,freshestDataDate:'2026-08-12',dataAgeDays:0,connection:'HEALTHY',data:'HEALTHY',overall:'HEALTHY',headline:'سليم',...o});
const S={'/api/auth/me':{isPlatformAdmin:true,email:'i6900612@gmail.com'},
'/api/admin/ops':{computedAt:now(),overall:'ERROR',known:['database','redis','meta'],unknown:['queue','workers','intelligence'],
 subsystems:[{key:'database',status:'HEALTHY',summary:'يستجيب'},{key:'redis',status:'ERROR',summary:'غير متصل — العدّادات تقرأ صفراً',detail:'ENOTFOUND redis.railway.internal:6379'},{key:'queue',status:'NOT_TESTED',summary:'الطابور معطّل بالإعداد — المزامنة داخل العملية'},{key:'workers',status:'UNKNOWN',summary:'لا مزامنة خلال 48 ساعة — لا نستطيع تأكيد عمل العمّال',detail:'role=combined'},{key:'meta',status:'HEALTHY',summary:'3 حسابات متصلة'},{key:'intelligence',status:'NOT_TESTED',summary:'لا يوجد فحص حيّ بعد'}],
 attention:[{id:'r',severity:'ERROR',title:'Redis غير متصل',because:'عدّادات استخدام Meta تقرأ صفراً، والأقفال تعمل ببدائل داخل العملية فقط.',action:'افحص REDIS_URL وسجلّ الإقلاع',href:'/admin/meta-readiness'},
  {id:'c',severity:'ERROR',title:'متجر الرافدين: انتهت صلاحية رمز Meta',because:'لا يمكن سحب أي بيانات لهذه المساحة حتى يُحلّ السبب.',action:'أعد ربط الحساب من مساحة العميل'},
  {id:'s',severity:'WARNING',title:'أزياء بغداد: بيانات عمرها 6 أيام',because:'الاتصال سليم لكن لا بيانات جديدة تصل — قد يكون العمّال أو الجدولة.'}],
 workspaces:[ws({workspaceId:'w1',workspaceName:'متجر النور للأدوات المنزلية',ownerEmail:'noor@example.iq'}),
  ws({workspaceId:'w2',workspaceName:'متجر الرافدين',ownerEmail:'rafidain@example.iq',connection:'BLOCKED',overall:'BLOCKED',headline:'انتهت صلاحية رمز Meta',tokenExpiresAt:'2026-07-01T00:00:00Z',externalAccountId:'act_9988776655'}),
  ws({workspaceId:'w3',workspaceName:'أزياء بغداد',ownerEmail:'baghdad@example.iq',data:'WARNING',overall:'WARNING',headline:'بيانات قديمة — 6 أيام بلا تحديث',dataAgeDays:6,freshestDataDate:'2026-08-06'}),
  ws({workspaceId:'w4',workspaceName:'مساحة بلا ربط',ownerEmail:'new@example.iq',adAccountId:null,externalAccountId:null,hasToken:false,connection:'NOT_TESTED',data:'NOT_TESTED',overall:'NOT_TESTED',headline:'بلا حساب إعلاني — لم يُربط بعد',lastSyncedAt:null,dataAgeDays:null})],
 activity:[{at:now(),workspaceName:'متجر النور للأدوات المنزلية',kind:'SYNC',status:'COMPLETED'},
  {at:new Date(Date.now()-3600e3).toISOString(),workspaceName:'أزياء بغداد',kind:'SYNC',status:'FAILED',detail:'HTTP 500 from graph.facebook.com/v20.0/act_.../insights'},
  {at:new Date(Date.now()-7200e3).toISOString(),workspaceName:'متجر النور للأدوات المنزلية',kind:'SYNC',status:'COMPLETED'}],
 boundary:[{state:'NOT_TESTED',subject:'قدرات Meta الفعلية',why:'مرقاب القدرات لم يُشغَّل على حساب حقيقي بعد — كل حكم قدرة غير مُختبَر.',resolvedBy:'شغّل المرقاب على مساحة لها حساب إعلاني',href:'/admin#experiments'},
  {state:'UNKNOWN',subject:'حياة العمّال الخلفيين',why:'هذه العملية لا تستطيع رصد خدمة عمّال منفصلة — نستدل فقط من وجود مزامنة حديثة.',resolvedBy:'نبضة صحّة يكتبها العامل نفسه، أو مزامنة ناجحة واحدة'},
  {state:'NOT_TESTED',subject:'صحة نظام الذكاء',why:'لا يوجد فحص حيّ. التغطية السردية مؤشر جانبي، لا قياس لصحة المحرك.',resolvedBy:'فحص صحّة فعلي لمسار الذكاء — غير مبنيّ بعد'}]},
'/api/admin/customers':{customers:[{id:'u1',email:'noor@example.iq',name:'متجر النور',isActive:true,hasPremium:true,workspaces:[{id:'w1',name:'متجر النور للأدوات المنزلية',adAccountCount:1}]},{id:'u2',email:'rafidain@example.iq',name:'الرافدين',isActive:true,hasPremium:false,workspaces:[{id:'w2',name:'متجر الرافدين',adAccountCount:1}]}]},
'/api/admin/platform-stats':{computedAt:Date.now(),fromCache:false,reach:{totalWorkspaces:4,totalAdAccounts:3,activeAdAccounts:2,activeCampaigns:11},money:{byCurrency:[{currency:'IQD',activeCampaigns:8,totalDailyBudgetMajor:420000,impliedMonthlyMajor:12600000},{currency:'USD',activeCampaigns:3,totalDailyBudgetMajor:28,impliedMonthlyMajor:840}]},brain:{snapshotsLastNDays:32,narrationsLastNDays:12,narrationCoveragePct:37.5,lookbackDays:7}}};
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const shots=[['now',1440,'01-now-1440'],['attention',1440,'02-attention-1440'],['workspaces',1440,'03-workspaces-1440'],['intelligence',1440,'04-intelligence-1440'],['boundary',1440,'05-boundary-1440'],['operations',1440,'06-operations-1440'],['experiments',1440,'07-experiments-1440'],['now',390,'08-now-390'],['workspaces',390,'09-workspaces-390']];
const dir='/tmp/claude-0/-home-user-adlytic/c693f65f-69ef-55b5-8da4-3db03f87b2d0/scratchpad/shots';
execSync(`mkdir -p ${dir}`);
const errs=[];
for(const [view,w,name] of shots){
  const p=await b.newPage({viewport:{width:w,height:w<600?900:1000},deviceScaleFactor:2});
  p.on('pageerror',e=>errs.push(name+': '+e.message));
  await p.addInitScript(()=>localStorage.setItem('adlytic_token','t'));
  await p.route(O+'/**',r=>{const u=new URL(r.request().url()).pathname;
    if(u.startsWith('/api/')){const k=Object.keys(S).find(x=>u===x||u.startsWith(x+'/'));return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(k?S[k]:{})});}
    if(u.endsWith('.css'))return r.fulfill({status:200,contentType:'text/css',body:':root{--bg:#f4f7f4;--surface:#fff;--surface-2:#f0f4f1;--surface-hover:#f7faf8;--border:#dde5e0;--border-control:#c8d5cc;--text:#12241b;--text-2:#41564a;--text-3:#7b8f84;--accent:#1d4b39;--accent-2:#16613f;--accent-dim:#e6f0ea;--success:#1a7f4b;--success-dim:#e6f4ec;--warning:#9a6a12;--warning-dim:#fdf3e2;--error:#b3261e;--error-dim:#fdecea;--scrim:rgba(0,0,0,.4);--font-body:system-ui,-apple-system,"Segoe UI",sans-serif}'});
    return r.fulfill({status:200,contentType:'text/html; charset=utf-8',body:html});});
  await p.goto(O+'/admin#'+view,{waitUntil:'domcontentloaded'});
  await p.waitForTimeout(700);
  if(view==='experiments'){await p.selectOption('#pr-ws',{index:1}).catch(()=>{});await p.waitForTimeout(300);}
  await p.screenshot({path:`${dir}/${name}.png`,fullPage:true});
  await p.close();
}
await b.close();
console.log(errs.length?'JS ERRORS: '+errs.join(' | '):'zero JS errors across all rendered views');
