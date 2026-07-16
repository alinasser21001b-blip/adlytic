// Seeds universal (non-industry-specific) knowledge rules for all issue codes.
// Safe to re-run — uses upsert on (issueCode, locale, industryProfileId=null).
import { PrismaClient, IssueCode, Locale } from "@prisma/client";
import { pgSslFor } from '../src/lib/pgSsl';
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const dbUrl = process.env['DATABASE_URL']!;
const parsed = new URL(dbUrl);
const pool = new pg.Pool({ host: parsed.hostname, port: Number(parsed.port) || 5432, user: decodeURIComponent(parsed.username), password: decodeURIComponent(parsed.password), database: parsed.pathname.replace(/^\//, ''), ssl: pgSslFor(parsed.hostname) });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const EN_RULES: Record<IssueCode, { title: string; causes: string[]; recommendations: string[] }> = {
  HIGH_FREQUENCY: {
    title: "High ad frequency",
    causes: ["Your audience sees the same ads too often", "Frequency rising above 4+ signals creative fatigue", "Ad recall drops, CPM rises when frequency is unchecked"],
    recommendations: ["Introduce 2–3 new creative variants this week", "Expand your audience lookalike size or add a new interest", "Rotate top-performing creatives every 7–10 days"],
  },
  LOW_CTR: {
    title: "Low click-through rate",
    causes: ["Ad copy or creative doesn't match the audience's intent", "The call-to-action is unclear or missing", "Ad fatigue may be suppressing engagement"],
    recommendations: ["Test a new hook in the first 3 seconds of your video/image", "Add a clear CTA button (e.g. 'Message us now')", "Pause the lowest-CTR ads and reallocate budget"],
  },
  DECLINING_RESULTS: {
    title: "Declining results",
    causes: ["Creative fatigue reducing conversion rate", "Audience saturation — fewer new people being reached", "Seasonal or competitive pressure on your niche"],
    recommendations: ["Refresh creatives with new imagery or copy angles", "Test a new audience segment (interest or lookalike)", "Review your offer — update the landing page or incentive"],
  },
  AUDIENCE_FATIGUE: {
    title: "Audience fatigue",
    causes: ["Frequency above 5 on core audiences", "Reach plateauing while impressions keep rising", "Engagement rate declining across all active ads"],
    recommendations: ["Pause ad sets with frequency above 5 for 72 hours", "Launch a new ad set targeting a broader audience", "Create a fresh creative series with a different angle"],
  },
  RISING_COST_PER_RESULT: {
    title: "Rising cost per result",
    causes: ["Increased competition for your target audience", "Creative fatigue reducing conversion efficiency", "Budget not aligned with auction pressure"],
    recommendations: ["Test new placements (Reels, Stories) to find cheaper inventory", "Refresh creatives to restore conversion rates", "Review your bidding strategy — switch to cost cap if using lowest-cost"],
  },
};

const AR_RULES: Record<IssueCode, { title: string; causes: string[]; recommendations: string[] }> = {
  HIGH_FREQUENCY: {
    title: "تكرار الإعلان مرتفع",
    causes: ["جمهورك يرى نفس الإعلانات بشكل متكرر جداً", "ارتفاع التكرار فوق 4 يشير إلى إرهاق الإبداع", "تنخفض نسبة التذكر وترتفع تكلفة الوصول عند زيادة التكرار"],
    recommendations: ["أضف 2-3 تصاميم إعلانية جديدة هذا الأسبوع", "وسّع جمهورك أو أضف اهتماماً جديداً", "دوّر الإعلانات الأكثر أداءً كل 7-10 أيام"],
  },
  LOW_CTR: {
    title: "معدل نقر منخفض",
    causes: ["المحتوى أو التصميم لا يتوافق مع توقعات الجمهور", "الدعوة للتصرف غير واضحة أو مفقودة", "إرهاق الإعلان قد يقلل التفاعل"],
    recommendations: ["اختبر عنواناً جديداً أو صورة مختلفة", "أضف زر دعوة واضح مثل 'راسلنا الآن'", "أوقف الإعلانات الأقل أداءً وأعد توزيع الميزانية"],
  },
  DECLINING_RESULTS: {
    title: "تراجع النتائج",
    causes: ["إرهاق الإبداع يقلل معدل التحويل", "تشبع الجمهور — وصول لأشخاص جدد أقل", "ضغط موسمي أو تنافسي في مجالك"],
    recommendations: ["جدد التصاميم بصور أو زوايا نصية جديدة", "اختبر شريحة جمهور جديدة", "راجع عرضك — حدّث الصفحة الإعلانية أو الحوافز"],
  },
  AUDIENCE_FATIGUE: {
    title: "إرهاق الجمهور",
    causes: ["التكرار فوق 5 على الجماهير الأساسية", "الوصول يتوقف بينما الظهور يستمر بالارتفاع", "معدل التفاعل ينخفض في جميع الإعلانات"],
    recommendations: ["أوقف مجموعات الإعلانات ذات التكرار فوق 5 لمدة 72 ساعة", "أطلق مجموعة إعلانية جديدة لجمهور أوسع", "ابتكر سلسلة إبداعية جديدة بزاوية مختلفة"],
  },
  RISING_COST_PER_RESULT: {
    title: "ارتفاع تكلفة النتيجة",
    causes: ["زيادة المنافسة على جمهورك المستهدف", "إرهاق الإبداع يقلل كفاءة التحويل", "الميزانية غير متوافقة مع ضغط المزاد"],
    recommendations: ["اختبر مواضع جديدة مثل Reels وStories", "جدد التصاميم لاستعادة معدلات التحويل", "راجع استراتيجية المزايدة"],
  },
};

async function main() {
  let created = 0;
  let skipped = 0;
  for (const [code, rule] of Object.entries(EN_RULES)) {
    const existing = await prisma.knowledgeRule.findFirst({
      where: { issueCode: code as IssueCode, locale: Locale.EN, industryProfileId: null }
    });
    if (existing) { skipped++; continue; }
    await prisma.knowledgeRule.create({
      data: {
        issueCode: code as IssueCode,
        locale: Locale.EN,
        industryProfileId: null,
        title: rule.title,
        causesJson: rule.causes,
        recommendationsJson: rule.recommendations,
      }
    });
    created++;
    console.log(`✓ EN ${code}`);
  }
  for (const [code, rule] of Object.entries(AR_RULES)) {
    const existing = await prisma.knowledgeRule.findFirst({
      where: { issueCode: code as IssueCode, locale: Locale.AR, industryProfileId: null }
    });
    if (existing) { skipped++; continue; }
    await prisma.knowledgeRule.create({
      data: {
        issueCode: code as IssueCode,
        locale: Locale.AR,
        industryProfileId: null,
        title: rule.title,
        causesJson: rule.causes,
        recommendationsJson: rule.recommendations,
      }
    });
    created++;
    console.log(`✓ AR ${code}`);
  }
  console.log(`\nDone. Created: ${created}, Skipped (already exist): ${skipped}`);
  await prisma.$disconnect(); await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
