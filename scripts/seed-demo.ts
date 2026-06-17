// ════════════════════════════════════════════════════════════════════════
//  scripts/seed-demo.ts
//
//  Seeds demo data into an EXISTING user's workspace.
//  Does NOT delete any existing users or workspaces.
//
//  Usage:
//    npm run seed-demo -- --email ali@adlytic.io
//    npm run seed-demo -- --email ali@adlytic.io --workspace-name "My Store"
//
//  What it creates (idempotently keyed on external IDs):
//    • 1 IndustryProfile (e-commerce)
//    • KnowledgeRules for EN + AR (upserted)
//    • 1 AdAccount attached to the user's first workspace
//    • 2 Campaigns, 4 AdSets, 6 Ads
//    • 30 days of DailyStat rows (account + campaign level)
//    • MetricTrend, DetectedIssues, Recommendations, HealthScores
// ════════════════════════════════════════════════════════════════════════

import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import {
  PrismaClient,
  Platform, WorkspaceRole, EntityType, EntityStatus,
  IssueCode, Severity, RecommendationPriority, Locale,
} from '@prisma/client';

// ── Arg parsing ─────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : undefined;
}
const targetEmail = getArg('--email');
const targetWsName = getArg('--workspace-name');

// ── DB setup (same pattern as serve.ts) ─────────────────────────────────
const dbUrl = process.env['DATABASE_URL'];
if (!dbUrl) { console.error('DATABASE_URL not set'); process.exit(1); }
const parsed = new URL(dbUrl);
const pool = new pg.Pool({
  host:     parsed.hostname,
  port:     Number(parsed.port) || 5432,
  user:     decodeURIComponent(parsed.username),
  password: decodeURIComponent(parsed.password),
  database: parsed.pathname.replace(/^\//, ''),
  ssl:      { rejectUnauthorized: false },
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

// ── Helpers ──────────────────────────────────────────────────────────────
const ALGORITHM_VERSION = 2; // must match HEALTH_ALGORITHM_VERSION
const today     = new Date();
const dateOnly  = (d: Date) => new Date(d.toISOString().slice(0, 10));
const daysAgo   = (n: number) => dateOnly(new Date(today.getTime() - n * 864e5));
const AS_OF     = daysAgo(0);

async function main() {
  console.log('\n──────────────────────────────────────────────────────────');
  console.log('  Adlytic — Demo Data Seeder');
  console.log('──────────────────────────────────────────────────────────\n');

  // 1. Find the target user / workspace
  let workspace: { id: string; name: string } | null = null;

  if (targetEmail) {
    const user = await prisma.user.findUnique({
      where: { email: targetEmail },
      include: { memberships: { include: { workspace: true } } },
    });
    if (!user) { console.error(`User not found: ${targetEmail}`); process.exit(1); }
    const mem = user.memberships.find(m => targetWsName
      ? m.workspace.name === targetWsName
      : true
    ) ?? user.memberships[0];
    if (!mem) { console.error('User has no workspaces'); process.exit(1); }
    workspace = mem.workspace;
    console.log(`✔  User:      ${user.email}`);
  } else {
    // No email specified — list workspaces and ask
    const allWs = await prisma.workspace.findMany({ select: { id: true, name: true } });
    if (!allWs.length) { console.error('No workspaces found. Create a user first with npm run create-user'); process.exit(1); }
    workspace = allWs[0];
    console.log(`⚠  No --email given. Using first workspace: ${workspace.name}`);
  }

  console.log(`✔  Workspace: ${workspace.name} (${workspace.id})\n`);

  // 2. Industry profile (upsert by name)
  console.log('⟳  Industry profile…');
  const industry = await (prisma.industryProfile.upsert as any)({
    where: { name: 'ecommerce' } as any,
    update: {},
    create: {
      name: 'ecommerce',
      knowledgeJson: {
        ctrBenchmark: 1.5,
        frequencyCeiling: 5.0,
        notes: 'General e-commerce; message-led with broad creative refresh cycles.',
      },
    },
  }).catch(async () => {
    // upsert by name may fail if unique constraint on name doesn't exist — fallback
    const existing = await prisma.industryProfile.findFirst({ where: { name: 'ecommerce' } });
    if (existing) return existing;
    return prisma.industryProfile.create({
      data: {
        name: 'ecommerce',
        knowledgeJson: { ctrBenchmark: 1.5, frequencyCeiling: 5.0 },
      },
    });
  });

  // 3. Knowledge rules (upsert per code + locale + industry)
  console.log('⟳  Knowledge rules…');
  const rules: Array<{
    code: IssueCode;
    en: { title: string; causes: string[]; recs: string[] };
    ar: { title: string; causes: string[]; recs: string[] };
  }> = [
    {
      code: IssueCode.AUDIENCE_FATIGUE,
      en: {
        title: 'Audience fatigue',
        causes: ['Frequency climbing — people see each ad too often', 'Audience is small relative to spend', 'Creative has run unchanged too long'],
        recs: ['Refresh creatives to reset attention', 'Broaden the audience or add a lookalike', 'Cap frequency if the reach radius allows'],
      },
      ar: {
        title: 'إرهاق الجمهور',
        causes: ['تكرار الظهور مرتفع — الجمهور يرى الإعلان كثيرًا', 'حجم الجمهور صغير مقارنة بالإنفاق', 'التصميم لم يتغير منذ وقت طويل'],
        recs: ['جدّد التصاميم لإعادة جذب الانتباه', 'وسّع الجمهور أو أضِف جمهورًا مشابهًا', 'حدّد سقفًا للتكرار إذا سمح نطاق الوصول'],
      },
    },
    {
      code: IssueCode.DECLINING_RESULTS,
      en: {
        title: 'Declining results',
        causes: ['Click-through rate falling over the period', 'Same audience served without new creative', 'Cost per result rising as engagement drops'],
        recs: ['Test three new creatives this week', 'Pause the lowest-performing ad in the set', 'Recheck in 5 days once new creative gathers data'],
      },
      ar: {
        title: 'تراجع النتائج',
        causes: ['معدل النقر ينخفض خلال الفترة', 'نفس الجمهور دون تصميم جديد', 'ارتفاع كلفة النتيجة مع انخفاض التفاعل'],
        recs: ['جرّب ثلاثة تصاميم جديدة هذا الأسبوع', 'أوقف الإعلان الأضعف في المجموعة', 'أعد التقييم بعد ٥ أيام عند تجمّع بيانات كافية'],
      },
    },
    {
      code: IssueCode.LOW_CTR,
      en: {
        title: 'Low click-through rate',
        causes: ['Creative or headline not stopping the scroll', 'Audience may not match the offer', 'First frame lacks a strong hook'],
        recs: ['Test new visuals and headlines', 'Tighten the audience to the core buyer', 'Lead with the offer in the first second'],
      },
      ar: {
        title: 'معدل نقر منخفض',
        causes: ['التصميم أو العنوان لا يوقف التمرير', 'قد لا يطابق الجمهور العرض', 'اللقطة الأولى تفتقر إلى جذب قوي'],
        recs: ['جرّب صورًا وعناوين جديدة', 'ضيّق الجمهور إلى المشتري الأساسي', 'ابدأ بالعرض في الثانية الأولى'],
      },
    },
    {
      code: IssueCode.HIGH_FREQUENCY,
      en: {
        title: 'High ad frequency',
        causes: ['Average frequency exceeds recommended ceiling', 'Small audience being overserved', 'Budget concentrated in a narrow targeting'],
        recs: ['Add an exclusion audience to reduce overlap', 'Expand targeting or create a new ad set', 'Introduce a frequency cap in ad set settings'],
      },
      ar: {
        title: 'تكرار الإعلان مرتفع',
        causes: ['متوسط التكرار يتجاوز الحد الموصى به', 'جمهور صغير يتلقى الإعلان بشكل مفرط', 'الميزانية مركّزة في استهداف ضيق'],
        recs: ['أضِف جمهور استبعاد لتقليل التداخل', 'وسّع الاستهداف أو أنشئ مجموعة إعلانية جديدة', 'ضع سقفًا للتكرار في إعدادات المجموعة الإعلانية'],
      },
    },
  ];

  for (const r of rules) {
    for (const [locale, data] of [[Locale.EN, r.en], [Locale.AR, r.ar]] as const) {
      const existing = await prisma.knowledgeRule.findFirst({
        where: { issueCode: r.code, locale, industryProfileId: industry.id },
      });
      if (!existing) {
        await prisma.knowledgeRule.create({
          data: {
            issueCode: r.code, locale, industryProfileId: industry.id,
            title: data.title, causesJson: data.causes, recommendationsJson: data.recs,
          },
        });
      }
    }
  }

  // 4. Ad account (upsert by external ID)
  console.log('⟳  Ad account…');
  // Search by the unique constraint (platform, externalAccountId) — not workspaceId —
  // so re-runs never hit P2002 regardless of which workspace the account belongs to.
  let acct = await prisma.adAccount.findFirst({
    where: { platform: Platform.META, externalAccountId: 'act_demo_0001' },
  });
  if (!acct) {
    acct = await prisma.adAccount.create({
      data: {
        workspaceId: workspace.id,
        platform:    Platform.META,
        externalAccountId: 'act_demo_0001',
        name:        'Demo Meta Account',
        currency:    'IQD',
        currencyMinorFactor: 1,
        timezone:    'Asia/Baghdad',
        status:      EntityStatus.ACTIVE,
        lastSyncedAt: new Date(today.getTime() - 2 * 3600 * 1000),
      },
    });
  }

  // 5. Campaigns
  console.log('⟳  Campaigns, ad sets, ads…');
  const getCampaign = async (extId: string, name: string, budget: bigint) => {
    const existing = await prisma.campaign.findFirst({ where: { externalCampaignId: extId } });
    if (existing) return existing;
    return prisma.campaign.create({
      data: {
        adAccountId: acct!.id, externalCampaignId: extId,
        name, objective: 'MESSAGES', status: EntityStatus.ACTIVE, dailyBudget: budget,
      },
    });
  };
  const campA = await getCampaign('c_demo_main',   'Main Products Campaign', 20000n);
  const campB = await getCampaign('c_demo_retarget', 'Retargeting Campaign',   12000n);

  // Ad sets
  const getAdSet = async (campaignId: string, extId: string, name: string, budget: bigint) => {
    const existing = await prisma.adSet.findFirst({ where: { externalAdSetId: extId } });
    if (existing) return existing;
    return prisma.adSet.create({
      data: { campaignId, externalAdSetId: extId, name, status: EntityStatus.ACTIVE, dailyBudget: budget, optimizationGoal: 'CONVERSATIONS' },
    });
  };
  const asA1 = await getAdSet(campA.id, 'as_demo_a1', 'Main — Interest', 12000n);
  const asA2 = await getAdSet(campA.id, 'as_demo_a2', 'Main — Lookalike', 8000n);
  const asB1 = await getAdSet(campB.id, 'as_demo_b1', 'Retarget — Website', 7000n);
  const asB2 = await getAdSet(campB.id, 'as_demo_b2', 'Retarget — Engagers', 5000n);

  // Ads
  const getAd = async (adSetId: string, extId: string, name: string, status = EntityStatus.ACTIVE) => {
    const existing = await prisma.ad.findFirst({ where: { externalAdId: extId } });
    if (existing) return existing;
    return prisma.ad.create({ data: { adSetId, externalAdId: extId, name, status } });
  };
  await getAd(asA1.id, 'ad_demo_a1_1', 'Product Video — Hero');
  await getAd(asA1.id, 'ad_demo_a1_2', 'Product Carousel');
  await getAd(asA2.id, 'ad_demo_a2_1', 'Lookalike Static — Offer');
  await getAd(asB1.id, 'ad_demo_b1_1', 'Retarget Video — CTA');
  await getAd(asB2.id, 'ad_demo_b2_1', 'Engager Carousel');
  await getAd(asB2.id, 'ad_demo_b2_2', 'Engager Story', EntityStatus.PAUSED);

  // 6. Daily stats — account level (30 days)
  console.log('⟳  Daily stats (30d account)…');
  // Story: decent start, mid-month CTR drops, late-month spend creeps up
  const msgs   = [8,7,9,8,10,9,11,10,9,12,10,11,9,10,8,9,7,8,9,7,8,6,7,8,6,7,6,7,5,6];
  const spends = [14,12,15,13,16,15,17,16,15,18,16,17,15,16,17,16,18,17,16,18,17,19,18,17,19,18,19,18,20,19];
  const ctrs   = [3.1,3.0,3.2,2.9,3.3,3.1,3.4,3.2,3.0,3.3,3.0,2.9,2.7,2.8,2.6,2.5,2.4,2.5,2.3,2.4,2.2,2.1,2.2,2.0,1.9,2.0,1.8,1.9,1.7,1.8];

  for (let i = 0; i < 30; i++) {
    const date = daysAgo(29 - i);
    const existing = await prisma.dailyStat.findFirst({
      where: { entityType: EntityType.ACCOUNT, entityId: acct.id, date },
    });
    if (existing) continue;
    const spend = spends[i];
    const ctr   = ctrs[i];
    const impressions = Math.round(spend * 1000 / 5.2);
    const clicks = Math.round(impressions * ctr / 100);
    const reach = Math.round(28000 + i * 150);
    await prisma.dailyStat.create({
      data: {
        entityType: EntityType.ACCOUNT, entityId: acct.id, date,
        spend:       BigInt(Math.round(spend * 1300)),
        impressions: BigInt(impressions),
        reach:       BigInt(reach),
        clicks:      BigInt(clicks),
        messages:    BigInt(msgs[i]),
        purchases: 0n, leads: 0n, conversions: BigInt(msgs[i]),
        ctr, cpc: clicks ? +(spend * 1300 / clicks).toFixed(2) : null,
        cpm: +(spend * 1300 / impressions * 1000).toFixed(2),
        frequency: +(3.2 + i * 0.07).toFixed(2),
        roas: null,
      },
    });
  }

  // 7. Campaign-level snapshots (single day each)
  console.log('⟳  Campaign snapshots…');
  const campSnap = async (campaignId: string, ctr: number, cpm: number, freq: number, msgs: number, spend: number) => {
    const existing = await prisma.dailyStat.findFirst({
      where: { entityType: EntityType.CAMPAIGN, entityId: campaignId, date: AS_OF },
    });
    if (existing) return;
    const impressions = Math.round(spend * 1000 / cpm);
    const clicks = Math.round(impressions * ctr / 100);
    await prisma.dailyStat.create({
      data: {
        entityType: EntityType.CAMPAIGN, entityId: campaignId, date: AS_OF,
        spend: BigInt(Math.round(spend * 1300)),
        impressions: BigInt(impressions), reach: BigInt(Math.round(impressions / freq)),
        clicks: BigInt(clicks), messages: BigInt(msgs),
        purchases: 0n, leads: 0n, conversions: BigInt(msgs),
        ctr, cpc: clicks ? +(spend * 1300 / clicks).toFixed(2) : null,
        cpm: +cpm.toFixed(2), frequency: freq, roas: null,
      },
    });
  };
  await campSnap(campA.id, 2.8, 4.2, 3.1, 4, 12);
  await campSnap(campB.id, 1.5, 6.8, 5.9, 2, 7);

  // 8. Metric trend
  console.log('⟳  Metric trend…');
  const existingTrend = await prisma.metricTrend.findFirst({
    where: { entityType: EntityType.ACCOUNT, entityId: acct.id },
    orderBy: { date: 'desc' },
  });
  if (!existingTrend) {
    await prisma.metricTrend.create({
      data: {
        entityType: EntityType.ACCOUNT, entityId: acct.id, date: AS_OF,
        ctrTrend: -0.24, cpmTrend: 0.11, frequencyTrend: 0.19,
        resultsTrend: -0.28, spendTrend: 0.08, windowDays: 14,
      },
    });
  }

  // 9. Detected issues
  console.log('⟳  Issues…');
  const issueExists = async (code: IssueCode) =>
    !!(await prisma.detectedIssue.findFirst({ where: { entityType: EntityType.ACCOUNT, entityId: acct!.id, issueCode: code } }));

  if (!await issueExists(IssueCode.DECLINING_RESULTS)) {
    await prisma.detectedIssue.create({
      data: {
        entityType: EntityType.ACCOUNT, entityId: acct.id, date: AS_OF,
        issueCode: IssueCode.DECLINING_RESULTS, severity: Severity.HIGH,
        evidenceJson: { ctrChange: -0.24, costPerMsgFrom: 1.10, costPerMsgTo: 1.62, windowDays: 14 },
      },
    });
  }
  if (!await issueExists(IssueCode.HIGH_FREQUENCY)) {
    await prisma.detectedIssue.create({
      data: {
        entityType: EntityType.ACCOUNT, entityId: acct.id, date: AS_OF,
        issueCode: IssueCode.HIGH_FREQUENCY, severity: Severity.MEDIUM,
        evidenceJson: { frequencyAvg: 4.6, frequencyPeak: 5.9, peakCampaign: 'Retargeting Campaign' },
      },
    });
  }

  // 10. Recommendations
  console.log('⟳  Recommendations…');
  const recExists = await prisma.recommendation.findFirst({
    where: { entityType: EntityType.ACCOUNT, entityId: acct.id },
  });
  if (!recExists) {
    await prisma.recommendation.create({
      data: {
        entityType: EntityType.ACCOUNT, entityId: acct.id, date: AS_OF,
        priority: RecommendationPriority.HIGH, actionCode: 'REFRESH_CREATIVES',
        sourceIssuesJson: [IssueCode.DECLINING_RESULTS, IssueCode.HIGH_FREQUENCY],
        detailsJson: { targetCampaign: 'Retargeting Campaign', withinDays: 3 },
      },
    });
  }

  // 11. Health scores
  console.log('⟳  Health scores…');
  const healthExists = async (entityId: string, entityType: EntityType) =>
    !!(await prisma.healthScore.findFirst({ where: { entityType, entityId, algorithmVersion: ALGORITHM_VERSION } }));

  if (!await healthExists(acct.id, EntityType.ACCOUNT)) {
    await prisma.healthScore.create({
      data: {
        entityType: EntityType.ACCOUNT, entityId: acct.id, date: AS_OF,
        score: 74, algorithmVersion: ALGORITHM_VERSION,
        breakdownJson: { ctr: 62, frequency: 58, cpm: 82, trend: 55 },
      },
    });
  }
  if (!await healthExists(campA.id, EntityType.CAMPAIGN)) {
    await prisma.healthScore.create({
      data: { entityType: EntityType.CAMPAIGN, entityId: campA.id, date: AS_OF, score: 88, algorithmVersion: ALGORITHM_VERSION, breakdownJson: {} },
    });
  }
  if (!await healthExists(campB.id, EntityType.CAMPAIGN)) {
    await prisma.healthScore.create({
      data: { entityType: EntityType.CAMPAIGN, entityId: campB.id, date: AS_OF, score: 51, algorithmVersion: ALGORITHM_VERSION, breakdownJson: {} },
    });
  }

  console.log('\n✓  Demo seed complete!');
  console.log(`   Workspace:   ${workspace!.name} (${workspace!.id})`);
  console.log(`   Ad account:  ${acct.name} (${acct.id})`);
  console.log(`   Campaigns:   ${campA.name} (health 88) + ${campB.name} (health 51)`);
  console.log(`   Health:      74 / 100 (attention band)`);
  console.log(`   Issues:      DECLINING_RESULTS (HIGH) + HIGH_FREQUENCY (MEDIUM)`);
  console.log(`   Action:      REFRESH_CREATIVES`);
  console.log('\n   → Login and visit /dashboard to see your live data.\n');

  await (pool as any).end();
}

main().catch(e => { console.error(e); process.exit(1); });
