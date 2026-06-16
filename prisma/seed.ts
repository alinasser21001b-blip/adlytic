// ════════════════════════════════════════════════════════════════════════
//  prisma/seed.ts
//
//  This seed exists to TEST THE ARCHITECTURE, not to populate data.
//  It proves, without touching Meta / Windsor / Claude:
//    • multi-tenancy        — two workspaces under no shared user assumption
//    • industry-as-data     — furniture & cosmetics differ only by rows
//    • localization         — every knowledge rule in EN and AR
//    • the intelligence chain — detected_issues → recommendations → health
//
//  There is NO `if (industry === "furniture")` anywhere. The two stories
//  diverge purely through IndustryProfile + KnowledgeRule rows.
//
//  Run:  npx prisma db seed   (after: npx prisma migrate dev)
// ════════════════════════════════════════════════════════════════════════

import { PrismaClient, Platform, WorkspaceRole, EntityType, EntityStatus,
         IssueCode, Severity, RecommendationPriority, Locale } from "@prisma/client";

const prisma = new PrismaClient();

// ── helpers ─────────────────────────────────────────────────────────────
const today = new Date();
const dateOnly = (d: Date) => new Date(d.toISOString().slice(0, 10));
const daysAgo = (n: number) => dateOnly(new Date(today.getTime() - n * 864e5));
const AS_OF = daysAgo(0);

/** Deterministic daily series so the seed is reproducible and tells a story. */
function series(values: number[]): number[] {
  return values;
}

async function main() {
  console.log("⟳ Resetting seed tables…");
  // Order matters: children first. Wrapped so re-seeding is idempotent.
  await prisma.recommendation.deleteMany();
  await prisma.detectedIssue.deleteMany();
  await prisma.metricTrend.deleteMany();
  await prisma.healthScore.deleteMany();
  await prisma.dailyStat.deleteMany();
  await prisma.rawInsight.deleteMany();
  await prisma.knowledgeRule.deleteMany();
  await prisma.ad.deleteMany();
  await prisma.adSet.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.adAccount.deleteMany();
  await prisma.workspaceMember.deleteMany();
  await prisma.workspace.deleteMany();
  await prisma.industryProfile.deleteMany();
  await prisma.user.deleteMany();

  // ── INDUSTRY PROFILES — industry intelligence lives here, never in code ──
  console.log("⟳ Industry profiles…");
  const furnitureProfile = await prisma.industryProfile.create({
    data: {
      name: "furniture",
      knowledgeJson: {
        // hints the engines read; thresholds tuned per industry as DATA
        ctrBenchmark: 2.0,
        frequencyCeiling: 5.0,
        notes: "Considered purchase, message-led; refresh creative before broadening.",
      },
    },
  });
  const cosmeticsProfile = await prisma.industryProfile.create({
    data: {
      name: "cosmetics",
      knowledgeJson: {
        ctrBenchmark: 1.4, // beauty audiences scroll fast; hook is everything
        frequencyCeiling: 6.0,
        notes: "Impulse-led; the hook in the first second decides CTR.",
      },
    },
  });

  // ── KNOWLEDGE RULES — EN + AR, optionally industry-specialized ──────────
  // Universal default rows (industryProfileId = null) + industry overrides.
  console.log("⟳ Knowledge rules (EN + AR)…");

  type RuleSeed = {
    code: IssueCode;
    industryProfileId?: string | null;
    en: { title: string; causes: string[]; recs: string[] };
    ar: { title: string; causes: string[]; recs: string[] };
  };

  const rules: RuleSeed[] = [
    // ── AUDIENCE_FATIGUE — universal default ──
    {
      code: IssueCode.AUDIENCE_FATIGUE,
      industryProfileId: null,
      en: {
        title: "Audience fatigue",
        causes: ["Frequency climbing — people see each ad many times",
                 "Audience is small relative to spend",
                 "Creative has run unchanged for weeks"],
        recs: ["Refresh creatives to reset attention",
               "Broaden the audience or add a lookalike",
               "Cap frequency if the reach radius allows it"],
      },
      ar: {
        title: "إرهاق الجمهور",
        causes: ["تكرار الظهور مرتفع — يرى الناس الإعلان مرات كثيرة",
                 "حجم الجمهور صغير مقارنة بالإنفاق",
                 "التصميم يعمل دون تغيير منذ أسابيع"],
        recs: ["جدّد التصاميم لإعادة جذب الانتباه",
               "وسّع الجمهور أو أضِف جمهورًا مشابهًا",
               "حدّد سقفًا للتكرار إذا سمح نطاق الوصول"],
      },
    },
    // ── DECLINING_RESULTS — universal default ──
    {
      code: IssueCode.DECLINING_RESULTS,
      industryProfileId: null,
      en: {
        title: "Declining results",
        causes: ["Click-through rate falling over the period",
                 "Same audience served without new creative",
                 "Cost per result rising as engagement drops"],
        recs: ["Test three new creatives this week",
               "Pause the lowest-performing ad in the set",
               "Recheck in 5 days once new creative gathers data"],
      },
      ar: {
        title: "تراجع النتائج",
        causes: ["معدل النقر ينخفض خلال الفترة",
                 "نفس الجمهور دون تصميم جديد",
                 "ارتفاع كلفة النتيجة مع انخفاض التفاعل"],
        recs: ["جرّب ثلاثة تصاميم جديدة هذا الأسبوع",
               "أوقف الإعلان الأضعف في المجموعة",
               "أعد التقييم بعد ٥ أيام عند تجمّع بيانات كافية"],
      },
    },
    // ── LOW_CTR — universal default ──
    {
      code: IssueCode.LOW_CTR,
      industryProfileId: null,
      en: {
        title: "Low click-through rate",
        causes: ["Creative or headline not stopping the scroll",
                 "Audience may not match the offer",
                 "First frame lacks a strong hook"],
        recs: ["Test new visuals and headlines",
               "Tighten the audience to the core buyer",
               "Lead with the offer in the first second"],
      },
      ar: {
        title: "معدل نقر منخفض",
        causes: ["التصميم أو العنوان لا يوقف التمرير",
                 "قد لا يطابق الجمهور العرض",
                 "اللقطة الأولى تفتقر إلى جذب قوي"],
        recs: ["جرّب صورًا وعناوين جديدة",
               "ضيّق الجمهور إلى المشتري الأساسي",
               "ابدأ بالعرض في الثانية الأولى"],
      },
    },
    // ── LOW_CTR — COSMETICS OVERRIDE ──
    // Same issue code, different recommendation by industry. This row is the
    // proof of point #4: the engine reads it; no branching in code.
    {
      code: IssueCode.LOW_CTR,
      industryProfileId: cosmeticsProfile.id,
      en: {
        title: "Low click-through rate",
        causes: ["Hook in the first second is weak",
                 "Thumbnail blends into the feed",
                 "Too much text before the payoff"],
        recs: ["Improve the opening hook — show the result fast",
               "Use a bold before/after or swatch in frame one",
               "Cut intro; lead with transformation"],
      },
      ar: {
        title: "معدل نقر منخفض",
        causes: ["الجذب في الثانية الأولى ضعيف",
                 "الصورة المصغّرة تذوب داخل آراء المتابعين",
                 "نص كثير قبل الوصول إلى الفائدة"],
        recs: ["حسّن الجذب الافتتاحي — أظهر النتيجة بسرعة",
               "استخدم مقارنة قبل/بعد جريئة في اللقطة الأولى",
               "احذف المقدمة وابدأ بالتحوّل"],
      },
    },
  ];

  for (const r of rules) {
    await prisma.knowledgeRule.create({
      data: {
        issueCode: r.code,
        locale: Locale.EN,
        industryProfileId: r.industryProfileId ?? null,
        title: r.en.title,
        causesJson: r.en.causes,
        recommendationsJson: r.en.recs,
      },
    });
    await prisma.knowledgeRule.create({
      data: {
        issueCode: r.code,
        locale: Locale.AR,
        industryProfileId: r.industryProfileId ?? null,
        title: r.ar.title,
        causesJson: r.ar.causes,
        recommendationsJson: r.ar.recs,
      },
    });
  }

  // ── USERS + WORKSPACES — multi-tenant, rooted at workspace ──────────────
  console.log("⟳ Users, workspaces, members…");
  const owner = await prisma.user.create({
    data: { email: "ali@adlytic.app", passwordHash: "$seed$", name: "Ali", locale: Locale.EN },
  });

  const furnitureWs = await prisma.workspace.create({
    data: {
      name: "Furniture Showroom",
      plan: "free",
      industryProfileId: furnitureProfile.id,
      members: { create: { userId: owner.id, role: WorkspaceRole.OWNER } },
    },
  });
  const cosmeticsWs = await prisma.workspace.create({
    data: {
      name: "Snow Beauty Cosmetic",
      plan: "free",
      industryProfileId: cosmeticsProfile.id,
      members: { create: { userId: owner.id, role: WorkspaceRole.OWNER } },
    },
  });

  // ── AD ACCOUNTS — platform-neutral, IQD with no minor unit ──────────────
  console.log("⟳ Ad accounts, campaigns…");
  const furnitureAcct = await prisma.adAccount.create({
    data: {
      workspaceId: furnitureWs.id,
      platform: Platform.META,
      externalAccountId: "act_furniture_0001",
      name: "Furniture — Meta",
      currency: "IQD",
      currencyMinorFactor: 1, // IQD has no practical minor unit
      timezone: "Asia/Baghdad",
      status: EntityStatus.ACTIVE,
      lastSyncedAt: new Date(today.getTime() - 2 * 3600 * 1000),
    },
  });
  const cosmeticsAcct = await prisma.adAccount.create({
    data: {
      workspaceId: cosmeticsWs.id,
      platform: Platform.META,
      externalAccountId: "act_cosmetics_0001",
      name: "Snow Beauty — Meta",
      currency: "IQD",
      currencyMinorFactor: 1,
      timezone: "Asia/Baghdad",
      status: EntityStatus.ACTIVE,
      lastSyncedAt: new Date(today.getTime() - 3 * 3600 * 1000),
    },
  });

  // ── CAMPAIGNS ───────────────────────────────────────────────────────────
  // Furniture: a strong one (Bedroom) and a fatigued one (Living Room).
  const fBedroom = await prisma.campaign.create({
    data: { adAccountId: furnitureAcct.id, externalCampaignId: "c_f_bedroom",
            name: "Bedroom Collection", objective: "MESSAGES", status: EntityStatus.ACTIVE,
            dailyBudget: 20000n },
  });
  const fLiving = await prisma.campaign.create({
    data: { adAccountId: furnitureAcct.id, externalCampaignId: "c_f_living",
            name: "Living Room Offer", objective: "MESSAGES", status: EntityStatus.ACTIVE,
            dailyBudget: 18000n },
  });
  // Cosmetics: a strong one (Serum) and a weak-CTR one (Lipstick).
  const cSerum = await prisma.campaign.create({
    data: { adAccountId: cosmeticsAcct.id, externalCampaignId: "c_c_serum",
            name: "Glow Serum Launch", objective: "MESSAGES", status: EntityStatus.ACTIVE,
            dailyBudget: 15000n },
  });
  const cLip = await prisma.campaign.create({
    data: { adAccountId: cosmeticsAcct.id, externalCampaignId: "c_c_lipstick",
            name: "Matte Lipstick Set", objective: "MESSAGES", status: EntityStatus.ACTIVE,
            dailyBudget: 12000n },
  });

  // ── DAILY STATS — 30 days, account-level, telling each story ────────────
  console.log("⟳ Daily stats (30d)…");

  // Furniture account: messages decline late month → fatigue story. Health 82.
  const fMessages = series([4,3,5,4,6,5,7,6,5,8,6,7,5,6,4,5,3,4,5,3,4,2,3,4,2,3,2,3,1,2]);
  const fSpend    = series([11,9,12,10,13,12,14,13,12,15,13,14,12,13,14,13,15,14,13,15,14,16,15,14,16,15,16,15,17,16]);
  const fCtr      = series([3.1,3.0,3.2,2.9,3.3,3.1,3.4,3.2,3.0,3.3,3.0,2.9,2.7,2.8,2.6,2.5,2.4,2.5,2.3,2.4,2.2,2.1,2.2,2.0,1.9,2.0,1.8,1.9,1.7,1.8]);

  // Cosmetics account: steady volume, persistently low CTR. Health 91 overall
  // (volume & cost are healthy; CTR is the one soft spot → LOW_CTR issue).
  const cMessages = series([6,7,6,8,7,9,8,7,9,8,10,9,8,10,9,11,10,9,11,10,9,11,10,12,11,10,12,11,10,12]);
  const cSpend    = series([9,10,9,11,10,12,11,10,12,11,13,12,11,13,12,14,13,12,14,13,12,14,13,15,14,13,15,14,13,15]);
  const cCtr      = series([1.3,1.2,1.3,1.1,1.2,1.0,1.1,1.2,1.0,1.1,1.0,1.1,1.2,1.0,1.1,1.0,1.1,1.0,1.1,1.2,1.0,1.1,1.0,1.1,1.2,1.0,1.1,1.0,1.1,1.0]);

  async function writeDaily(entityId: string, msgs: number[], spends: number[], ctrs: number[],
                            freqBase: number, reachBase: number) {
    for (let i = 0; i < 30; i++) {
      const date = daysAgo(29 - i);
      const impressions = Math.round(spends[i] * 1000 / 5.2); // implied by ~$5.2 CPM
      const clicks = Math.round(impressions * ctrs[i] / 100);
      const reach = Math.round(reachBase + i * 120);
      const frequency = +(freqBase + i * 0.06).toFixed(2);
      await prisma.dailyStat.create({
        data: {
          entityType: EntityType.ACCOUNT, entityId, date,
          spend: BigInt(Math.round(spends[i] * 1300)), // USD-ish → IQD minor units (factor 1)
          impressions: BigInt(impressions),
          reach: BigInt(reach),
          clicks: BigInt(clicks),
          messages: BigInt(msgs[i]),
          purchases: 0n, leads: 0n, conversions: BigInt(msgs[i]),
          ctr: ctrs[i],
          cpc: clicks ? +(spends[i] * 1300 / clicks).toFixed(2) : null,
          cpm: +(spends[i] * 1300 / impressions * 1000).toFixed(2),
          frequency,
          roas: null,
        },
      });
    }
  }

  await writeDaily(furnitureAcct.id, fMessages, fSpend, fCtr, 3.6, 30000);
  await writeDaily(cosmeticsAcct.id, cMessages, cSpend, cCtr, 2.8, 26000);

  // Campaign-level stats for best/worst cards (single snapshot row each, AS_OF).
  console.log("⟳ Campaign snapshots, trends, issues, recs, health…");
  async function campaignSnapshot(id: string, ctr: number, cpm: number, freq: number,
                                  messages: number, spend: number) {
    const impressions = Math.round(spend * 1000 / cpm);
    const clicks = Math.round(impressions * ctr / 100);
    await prisma.dailyStat.create({
      data: {
        entityType: EntityType.CAMPAIGN, entityId: id, date: AS_OF,
        spend: BigInt(Math.round(spend * 1300)),
        impressions: BigInt(impressions), reach: BigInt(Math.round(impressions / freq)),
        clicks: BigInt(clicks), messages: BigInt(messages),
        purchases: 0n, leads: 0n, conversions: BigInt(messages),
        ctr, cpc: clicks ? +(spend * 1300 / clicks).toFixed(2) : null,
        cpm: +(cpm).toFixed(2), frequency: freq, roas: null,
      },
    });
  }
  await campaignSnapshot(fBedroom.id, 4.2, 3.8, 3.1, 45, 150);
  await campaignSnapshot(fLiving.id, 1.6, 6.1, 6.4, 8, 120);
  await campaignSnapshot(cSerum.id, 1.9, 4.4, 3.0, 38, 130);
  await campaignSnapshot(cLip.id, 1.0, 5.0, 4.1, 22, 110);

  // ── METRIC TRENDS (Analytics Engine output, here pre-seeded) ────────────
  await prisma.metricTrend.create({
    data: { entityType: EntityType.ACCOUNT, entityId: furnitureAcct.id, date: AS_OF,
            ctrTrend: -0.28, cpmTrend: 0.14, frequencyTrend: 0.23, resultsTrend: -0.32,
            spendTrend: 0.06, windowDays: 14 },
  });
  await prisma.metricTrend.create({
    data: { entityType: EntityType.ACCOUNT, entityId: cosmeticsAcct.id, date: AS_OF,
            ctrTrend: -0.04, cpmTrend: 0.03, frequencyTrend: 0.10, resultsTrend: 0.08,
            spendTrend: 0.05, windowDays: 14 },
  });

  // ── DETECTED ISSUES (Rules Engine output) ───────────────────────────────
  // Furniture → AUDIENCE_FATIGUE (med) + DECLINING_RESULTS (high)
  await prisma.detectedIssue.create({
    data: { entityType: EntityType.ACCOUNT, entityId: furnitureAcct.id, date: AS_OF,
            issueCode: IssueCode.DECLINING_RESULTS, severity: Severity.HIGH,
            evidenceJson: { ctrChange: -0.28, costPerMsgFrom: 1.12, costPerMsgTo: 1.68, windowDays: 14 } },
  });
  await prisma.detectedIssue.create({
    data: { entityType: EntityType.ACCOUNT, entityId: furnitureAcct.id, date: AS_OF,
            issueCode: IssueCode.AUDIENCE_FATIGUE, severity: Severity.MEDIUM,
            evidenceJson: { frequencyAvg: 4.8, frequencyPeak: 6.4, peakCampaign: "Living Room Offer" } },
  });
  // Cosmetics → LOW_CTR (med)
  await prisma.detectedIssue.create({
    data: { entityType: EntityType.ACCOUNT, entityId: cosmeticsAcct.id, date: AS_OF,
            issueCode: IssueCode.LOW_CTR, severity: Severity.MEDIUM,
            evidenceJson: { ctrAvg: 1.07, benchmark: 1.4 } },
  });

  // ── RECOMMENDATIONS (Recommendation Engine output) ──────────────────────
  // Issues COMBINED into prioritized actions. actionCode is the stable hook.
  await prisma.recommendation.create({
    data: { entityType: EntityType.ACCOUNT, entityId: furnitureAcct.id, date: AS_OF,
            priority: RecommendationPriority.HIGH, actionCode: "REFRESH_CREATIVES",
            sourceIssuesJson: [IssueCode.DECLINING_RESULTS, IssueCode.AUDIENCE_FATIGUE],
            detailsJson: { targetCampaign: "Living Room Offer", withinDays: 3 } },
  });
  await prisma.recommendation.create({
    data: { entityType: EntityType.ACCOUNT, entityId: cosmeticsAcct.id, date: AS_OF,
            priority: RecommendationPriority.MEDIUM, actionCode: "IMPROVE_HOOKS",
            sourceIssuesJson: [IssueCode.LOW_CTR],
            detailsJson: { focus: "first-second hook" } },
  });

  // ── HEALTH SCORES (stored, NOT computed by the dashboard) ───────────────
  await prisma.healthScore.create({
    data: { entityType: EntityType.ACCOUNT, entityId: furnitureAcct.id, date: AS_OF,
            score: 82, algorithmVersion: 1,
            breakdownJson: { ctr: 70, frequency: 70, cpm: 80, trend: 60 } },
  });
  await prisma.healthScore.create({
    data: { entityType: EntityType.ACCOUNT, entityId: cosmeticsAcct.id, date: AS_OF,
            score: 91, algorithmVersion: 1,
            breakdownJson: { ctr: 65, frequency: 95, cpm: 95, trend: 90 } },
  });
  // Campaign-level health for best/worst cards
  for (const [id, score] of [[fBedroom.id, 94], [fLiving.id, 57],
                             [cSerum.id, 92], [cLip.id, 74]] as [string, number][]) {
    await prisma.healthScore.create({
      data: { entityType: EntityType.CAMPAIGN, entityId: id, date: AS_OF,
              score, algorithmVersion: 1, breakdownJson: {} },
    });
  }

  console.log("✓ Seed complete.");
  console.log("  Furniture: health 82 · AUDIENCE_FATIGUE + DECLINING_RESULTS → REFRESH_CREATIVES");
  console.log("  Cosmetics: health 91 · LOW_CTR → IMPROVE_HOOKS (cosmetics-specific knowledge)");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
