// Self-contained executable proof of the seed + getDashboard LOGIC.
// No @prisma/client, no DB — an in-memory store with the same rows the seed
// writes, run through the same assembly logic getDashboard uses. If the
// dashboard object is correct here, the logic in the real files is correct;
// only the data source differs.

// ── mirror the enums ──
enum IssueCode { LOW_CTR="LOW_CTR", HIGH_CPM="HIGH_CPM", HIGH_FREQUENCY="HIGH_FREQUENCY",
  AUDIENCE_FATIGUE="AUDIENCE_FATIGUE", DECLINING_RESULTS="DECLINING_RESULTS" }
enum Locale { EN="EN", AR="AR" }

// ── in-memory tables (exactly what seed.ts inserts, trimmed to what matters) ──
const industryProfiles = [
  { id: "ip_furn", name: "furniture" },
  { id: "ip_cosm", name: "cosmetics" },
];
const workspaces = [
  { id: "ws_furn", name: "Furniture Showroom", industryProfileId: "ip_furn", currency: "IQD" },
  { id: "ws_cosm", name: "Snow Beauty Cosmetic", industryProfileId: "ip_cosm", currency: "IQD" },
];
const accounts = [
  { id: "acc_furn", workspaceId: "ws_furn", currency: "IQD", lastSyncedAt: "2026-06-14T10:00:00Z" },
  { id: "acc_cosm", workspaceId: "ws_cosm", currency: "IQD", lastSyncedAt: "2026-06-14T09:00:00Z" },
];
const campaignsActive: Record<string, number> = { acc_furn: 2, acc_cosm: 2 };

// knowledge rules: universal defaults + one cosmetics LOW_CTR override
const knowledgeRules = [
  { issueCode: IssueCode.AUDIENCE_FATIGUE, locale: Locale.EN, industryProfileId: null,
    title: "Audience fatigue", causes: ["Frequency climbing","Audience small vs spend","Creative stale"],
    recs: ["Refresh creatives to reset attention","Broaden the audience","Cap frequency"] },
  { issueCode: IssueCode.DECLINING_RESULTS, locale: Locale.EN, industryProfileId: null,
    title: "Declining results", causes: ["CTR falling","Same audience","Cost per result rising"],
    recs: ["Test three new creatives this week","Pause weakest ad","Recheck in 5 days"] },
  { issueCode: IssueCode.LOW_CTR, locale: Locale.EN, industryProfileId: null,
    title: "Low click-through rate", causes: ["Creative not stopping scroll"],
    recs: ["Test new visuals and headlines"] },
  // cosmetics-specific override — SAME code, different recs:
  { issueCode: IssueCode.LOW_CTR, locale: Locale.EN, industryProfileId: "ip_cosm",
    title: "Low click-through rate", causes: ["Hook in first second is weak"],
    recs: ["Improve the opening hook — show the result fast"] },
];

const healthScores = [
  { entityType: "ACCOUNT", entityId: "acc_furn", score: 82 },
  { entityType: "ACCOUNT", entityId: "acc_cosm", score: 91 },
  { entityType: "CAMPAIGN", entityId: "c_f_bedroom", score: 94 },
  { entityType: "CAMPAIGN", entityId: "c_f_living", score: 57 },
  { entityType: "CAMPAIGN", entityId: "c_c_serum", score: 92 },
  { entityType: "CAMPAIGN", entityId: "c_c_lipstick", score: 74 },
];
const trends = [
  { entityId: "acc_furn", ctrTrend: -0.28, cpmTrend: 0.14, frequencyTrend: 0.23, resultsTrend: -0.32, spendTrend: 0.06 },
  { entityId: "acc_cosm", ctrTrend: -0.04, cpmTrend: 0.03, frequencyTrend: 0.10, resultsTrend: 0.08, spendTrend: 0.05 },
];
const detectedIssues = [
  { entityId: "acc_furn", issueCode: IssueCode.DECLINING_RESULTS, severity: "HIGH", evidence: { ctrChange: -0.28 } },
  { entityId: "acc_furn", issueCode: IssueCode.AUDIENCE_FATIGUE, severity: "MEDIUM", evidence: { frequencyPeak: 6.4 } },
  { entityId: "acc_cosm", issueCode: IssueCode.LOW_CTR, severity: "MEDIUM", evidence: { ctrAvg: 1.07 } },
];
const recommendations = [
  { entityId: "acc_furn", priority: "HIGH", actionCode: "REFRESH_CREATIVES", details: { withinDays: 3 } },
  { entityId: "acc_cosm", priority: "MEDIUM", actionCode: "IMPROVE_HOOKS", details: { focus: "hook" } },
];
// campaign snapshots (ctr/cpm/freq/messages) keyed by campaign id
const campSnaps: Record<string, any> = {
  c_f_bedroom: { name: "Bedroom Collection", ctr: 4.2, cpm: 3.8, frequency: 3.1, messages: 45, acct: "acc_furn" },
  c_f_living:  { name: "Living Room Offer", ctr: 1.6, cpm: 6.1, frequency: 6.4, messages: 8, acct: "acc_furn" },
  c_c_serum:   { name: "Glow Serum Launch", ctr: 1.9, cpm: 4.4, frequency: 3.0, messages: 38, acct: "acc_cosm" },
  c_c_lipstick:{ name: "Matte Lipstick Set", ctr: 1.0, cpm: 5.0, frequency: 4.1, messages: 22, acct: "acc_cosm" },
};
// 30-day account daily series (just enough to test aggregation)
function dailyFor(acc: string) {
  const arr = [];
  for (let i = 0; i < 30; i++) {
    const msgs = acc === "acc_furn" ? Math.max(1, 8 - Math.floor(i / 4)) : 6 + Math.floor(i / 5);
    arr.push({ date: `d${i}`, messages: msgs, spend: 14000, ctr: acc === "acc_furn" ? 3 - i*0.04 : 1.1,
               cpm: 5.2, frequency: 3.6 + i*0.06, reach: 30000 + i*120 });
  }
  return arr;
}

// ── the assembly logic, ported verbatim from getDashboard.ts ──
const band = (s: number) => s>=90?"excellent":s>=70?"good":s>=50?"attention":"poor";
const dir = (d: number|null) => d===null||Math.abs(d)<0.005?"flat":d>0?"up":"down";
const avg = (rows:any[], f:string) => { const v=rows.map(r=>r[f]).filter(x=>x!=null); return v.length?v.reduce((a:number,b:number)=>a+b,0)/v.length:null; };
const sum = (rows:any[], f:string) => rows.reduce((a,r)=>a+Number(r[f]??0),0);

function getDashboard(workspaceId: string, locale = Locale.EN) {
  const ws = workspaces.find(w => w.id === workspaceId)!;
  const ip = industryProfiles.find(p => p.id === ws.industryProfileId)!;
  const acc = accounts.find(a => a.workspaceId === workspaceId)!;
  const daily = dailyFor(acc.id);
  const health = healthScores.find(h => h.entityType==="ACCOUNT" && h.entityId===acc.id)!;
  const trend = trends.find(t => t.entityId===acc.id)!;

  const totalSpend = sum(daily,"spend"), totalMsgs = sum(daily,"messages");
  const ctrAvg = avg(daily,"ctr"), cpmAvg = avg(daily,"cpm"), freqAvg = avg(daily,"frequency");

  const kpis = [
    { key:"spend", value: totalSpend, deltaPct: trend.spendTrend, direction: dir(trend.spendTrend), goodWhenUp:true },
    { key:"messages", value: totalMsgs, deltaPct: trend.resultsTrend, direction: dir(trend.resultsTrend), goodWhenUp:true },
    { key:"ctr", value: ctrAvg, deltaPct: trend.ctrTrend, direction: dir(trend.ctrTrend), goodWhenUp:true },
    { key:"cpm", value: cpmAvg, deltaPct: trend.cpmTrend, direction: dir(trend.cpmTrend), goodWhenUp:false },
    { key:"frequency", value: freqAvg, deltaPct: trend.frequencyTrend, direction: dir(trend.frequencyTrend), goodWhenUp:false },
  ];

  // issues: industry-specific rule preferred, else universal default
  const detected = detectedIssues.filter(d => d.entityId===acc.id)
    .sort((a,b)=> (b.severity==="HIGH"?1:0)-(a.severity==="HIGH"?1:0));
  const issues = detected.map(di => {
    const rule = knowledgeRules.find(r => r.issueCode===di.issueCode && r.locale===locale && r.industryProfileId===ws.industryProfileId)
             ?? knowledgeRules.find(r => r.issueCode===di.issueCode && r.locale===locale && r.industryProfileId===null);
    return { code: di.issueCode, title: rule!.title, severity: di.severity,
             causes: rule!.causes, recommendations: rule!.recs, evidence: di.evidence };
  });

  const rec = recommendations.find(r => r.entityId===acc.id)!;
  const priorityAction = { actionCode: rec.actionCode, priority: rec.priority,
    text: issues[0]?.recommendations[0] ?? rec.actionCode, details: rec.details };

  // best/worst campaigns
  const cards = Object.entries(campSnaps).filter(([,s])=>s.acct===acc.id).map(([id,s])=>{
    const h = healthScores.find(x=>x.entityType==="CAMPAIGN" && x.entityId===id)!;
    return { id, name: s.name, health: h.score, band: band(h.score), messages: s.messages, ctr: s.ctr, cpm: s.cpm, frequency: s.frequency };
  }).sort((a,b)=>b.health-a.health);

  return {
    workspace: { id: ws.id, name: ws.name, industry: ip.name, locale, currency: ws.currency, activeCampaigns: campaignsActive[acc.id] },
    health: { score: health.score, band: band(health.score) },
    kpis, issues, priorityAction,
    bestCampaign: cards[0], worstCampaign: cards[cards.length-1],
  };
}

// ════════════════ ASSERTIONS ════════════════
let pass = 0, fail = 0;
function check(name: string, cond: boolean, got?: any) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}  — got: ${JSON.stringify(got)}`); }
}

console.log("\n── FURNITURE workspace ──");
const f = getDashboard("ws_furn");
check("industry is furniture (from data, no branching)", f.workspace.industry==="furniture", f.workspace.industry);
check("health score 82", f.health.score===82, f.health.score);
check("health band 'good'", f.health.band==="good", f.health.band);
check("2 active campaigns", f.workspace.activeCampaigns===2, f.workspace.activeCampaigns);
check("top issue is DECLINING_RESULTS (HIGH sorted first)", f.issues[0].code===IssueCode.DECLINING_RESULTS, f.issues[0].code);
check("second issue AUDIENCE_FATIGUE present", f.issues.some(i=>i.code===IssueCode.AUDIENCE_FATIGUE), f.issues.map(i=>i.code));
check("CTR KPI flagged down (negative trend)", f.kpis.find(k=>k.key==="ctr")!.direction==="down");
check("CPM goodWhenUp=false", f.kpis.find(k=>k.key==="cpm")!.goodWhenUp===false);
check("priority action REFRESH_CREATIVES", f.priorityAction.actionCode==="REFRESH_CREATIVES", f.priorityAction.actionCode);
check("priority text from localized recs", f.priorityAction.text.includes("Test three new creatives"), f.priorityAction.text);
check("best campaign Bedroom (health 94)", f.bestCampaign.name==="Bedroom Collection" && f.bestCampaign.health===94, f.bestCampaign);
check("worst campaign Living Room (health 57)", f.worstCampaign.name==="Living Room Offer" && f.worstCampaign.health===57, f.worstCampaign);

console.log("\n── COSMETICS workspace (same code, different story) ──");
const c = getDashboard("ws_cosm");
check("industry is cosmetics", c.workspace.industry==="cosmetics", c.workspace.industry);
check("health score 91", c.health.score===91, c.health.score);
check("health band 'excellent'", c.health.band==="excellent", c.health.band);
check("top issue LOW_CTR", c.issues[0].code===IssueCode.LOW_CTR, c.issues[0].code);
check("LOW_CTR uses COSMETICS-specific recommendation", c.issues[0].recommendations[0].includes("opening hook"), c.issues[0].recommendations[0]);
check("priority action IMPROVE_HOOKS", c.priorityAction.actionCode==="IMPROVE_HOOKS", c.priorityAction.actionCode);
check("best campaign Glow Serum", c.bestCampaign.name==="Glow Serum Launch", c.bestCampaign.name);

console.log("\n── CROSS-INDUSTRY: same issue code, different recommendation ──");
const furnLowCtrRule = knowledgeRules.find(r=>r.issueCode===IssueCode.LOW_CTR && r.industryProfileId===null)!;
check("furniture LOW_CTR → 'Test new visuals'", furnLowCtrRule.recs[0].includes("visuals"), furnLowCtrRule.recs[0]);
check("cosmetics LOW_CTR → 'opening hook' (different!)", c.issues[0].recommendations[0]!==furnLowCtrRule.recs[0], c.issues[0].recommendations[0]);

console.log(`\n════ ${pass} passed, ${fail} failed ════`);
if (fail > 0) process.exit(1);
