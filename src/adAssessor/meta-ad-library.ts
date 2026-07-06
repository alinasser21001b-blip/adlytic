import {
  buildCuratedTrendSummary,
  buildSearchTerms,
  getIndustryTrends,
} from "./data/industry-trends";
import type { CampaignGoal } from "./types";

import { config } from '../config';

const AD_LIBRARY_URL = 'https://graph.facebook.com/v21.0/ads_archive';
const DEFAULT_COUNTRIES = ["SA", "AE", "EG"];

export interface AdLibraryAd {
  pageName: string;
  bodies: string[];
  linkTitles: string[];
  impressions?: string;
  spend?: string;
  platforms: string[];
}

export interface TrendInsights {
  source: "meta_ad_library" | "curated_fallback";
  summaryAr: string;
  summaryEn: string;
  hooks: string[];
  ctaPatterns: string[];
  themes: string[];
  copyLengthInsight: string;
  exampleAds: { pageName: string; body: string; headline?: string }[];
  totalAdsAnalyzed: number;
}

interface MetaAdLibraryResponse {
  data?: Array<{
    page_name?: string;
    ad_creative_bodies?: string[];
    ad_creative_link_titles?: string[];
    impressions?: { lower_bound?: string; upper_bound?: string };
    spend?: { lower_bound?: string; upper_bound?: string };
    publisher_platforms?: string[];
  }>;
  error?: { message: string; code?: number };
}

function formatRange(range?: { lower_bound?: string; upper_bound?: string }): string | undefined {
  if (!range) return undefined;
  const lower = range.lower_bound;
  const upper = range.upper_bound;
  if (lower && upper) return `${lower}-${upper}`;
  return lower ?? upper;
}

export async function searchAdLibrary(params: {
  searchTerms: string;
  countries?: string[];
  limit?: number;
}): Promise<AdLibraryAd[]> {
  const token = config.meta.accessToken;
  if (!token) return [];

  const countries = params.countries ?? DEFAULT_COUNTRIES;
  const url = new URL(AD_LIBRARY_URL);
  url.searchParams.set("access_token", token);
  url.searchParams.set("search_terms", params.searchTerms);
  url.searchParams.set("ad_reached_countries", JSON.stringify(countries));
  url.searchParams.set("ad_active_status", "ACTIVE");
  url.searchParams.set(
    "fields",
    "ad_creative_bodies,ad_creative_link_titles,page_name,impressions,spend,publisher_platforms",
  );
  url.searchParams.set("limit", String(params.limit ?? 25));

  let res: Response;
  try {
    res = await fetch(url.toString(), { cache: "no-store" });
  } catch (err) {
    console.error("Meta Ad Library fetch failed:", err);
    return [];
  }

  if (!res.ok) {
    console.error("Meta Ad Library HTTP error:", res.status);
    return [];
  }

  let json: MetaAdLibraryResponse;
  try {
    json = (await res.json()) as MetaAdLibraryResponse;
  } catch (err) {
    console.error("Meta Ad Library JSON parse failed:", err);
    return [];
  }
  if (json.error) {
    console.error("Meta Ad Library API error:", json.error.message);
    return [];
  }

  return (json.data ?? [])
    .filter((ad) => ad.ad_creative_bodies?.length || ad.ad_creative_link_titles?.length)
    .map((ad) => ({
      pageName: ad.page_name ?? "Unknown",
      bodies: ad.ad_creative_bodies ?? [],
      linkTitles: ad.ad_creative_link_titles ?? [],
      impressions: formatRange(ad.impressions),
      spend: formatRange(ad.spend),
      platforms: ad.publisher_platforms ?? [],
    }));
}

function extractOpeningHook(text: string): string {
  const cleaned = text.trim();
  const firstSentence = cleaned.split(/[.!?؟\n]/)[0]?.trim() ?? cleaned;
  return firstSentence.slice(0, 80);
}

function findCommonPatterns(texts: string[], minOccurrences = 2): string[] {
  const wordCounts = new Map<string, number>();
  const ctaWords = [
    "shop", "buy", "order", "learn", "sign", "book", "get", "download", "apply",
    "تسوق", "اطلب", "احجز", "سجّل", "حمّل", "احصل", "تواصل", "اكتشف", "عرض", "خصم",
    "now", "today", "free", "مجان", "الآن", "اليوم",
  ];

  for (const text of texts) {
    const lower = text.toLowerCase();
    for (const word of ctaWords) {
      if (lower.includes(word.toLowerCase())) {
        wordCounts.set(word, (wordCounts.get(word) ?? 0) + 1);
      }
    }
  }

  return [...wordCounts.entries()]
    .filter(([, count]) => count >= minOccurrences)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word);
}

function analyzeCopyLength(bodies: string[]): string {
  if (bodies.length === 0) return "لا توجد بيانات كافية عن طول النص";
  const lengths = bodies.map((b) => b.length);
  const avg = Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length);
  const short = lengths.filter((l) => l < 80).length;
  const medium = lengths.filter((l) => l >= 80 && l <= 200).length;
  const long = lengths.filter((l) => l > 200).length;

  if (short > medium && short > long) {
    return `معظم الإعلانات (${short}/${bodies.length}) تستخدم نصوصاً قصيرة (أقل من 80 حرف) — متوسط ${avg} حرف`;
  }
  if (medium >= short && medium >= long) {
    return `النصوص متوسطة الطول (80-200 حرف) هي الأكثر شيوعاً — متوسط ${avg} حرف`;
  }
  return `بعض الإعلانات تستخدم نصوصاً طويلة — متوسط ${avg} حرف، لكن القصيرة تتفوق في MENA`;
}

export function extractTrendInsights(ads: AdLibraryAd[]): Omit<TrendInsights, "source"> {
  const allBodies = ads.flatMap((a) => a.bodies);
  const allTitles = ads.flatMap((a) => a.linkTitles);
  const allTexts = [...allBodies, ...allTitles];

  const hooks = [...new Set(allBodies.map(extractOpeningHook))].slice(0, 5);
  const ctaPatterns = findCommonPatterns(allTexts);
  const titlePatterns = [...new Set(allTitles.filter(Boolean))].slice(0, 5);

  const themes: string[] = [];
  const hasVideo = ads.some((a) => a.platforms.includes("INSTAGRAM"));
  const hasFacebook = ads.some((a) => a.platforms.includes("FACEBOOK"));
  if (hasVideo) themes.push("انتشار قوي على Instagram");
  if (hasFacebook) themes.push("نشاط على Facebook");
  if (ctaPatterns.some((c) => ["خصم", "عرض", "free", "مجان"].includes(c))) {
    themes.push("عروض وخصومات شائعة");
  }
  if (ctaPatterns.some((c) => ["واتساب", "تواصل", "contact"].includes(c.toLowerCase()))) {
    themes.push("CTA عبر التواصل المباشر");
  }

  const copyLengthInsight = analyzeCopyLength(allBodies);

  const exampleAds = ads.slice(0, 3).map((ad) => ({
    pageName: ad.pageName,
    body: ad.bodies[0] ?? "",
    headline: ad.linkTitles[0],
  }));

  const summaryAr = [
    `تحليل ${ads.length} إعلاناً نشطاً من Meta Ad Library:`,
    hooks.length > 0 ? `• افتتاحيات شائعة: ${hooks.slice(0, 3).join(" | ")}` : "",
    titlePatterns.length > 0 ? `• عناوين CTA: ${titlePatterns.slice(0, 3).join(" | ")}` : "",
    `• ${copyLengthInsight}`,
    themes.length > 0 ? `• اتجاهات: ${themes.join("، ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const summaryEn = [
    `Analysis of ${ads.length} active ads from Meta Ad Library:`,
    hooks.length > 0 ? `• Common hooks: ${hooks.slice(0, 3).join(" | ")}` : "",
    titlePatterns.length > 0 ? `• CTA titles: ${titlePatterns.slice(0, 3).join(" | ")}` : "",
    `• Copy length: avg analyzed from ${allBodies.length} ads`,
    themes.length > 0 ? `• Trends: ${themes.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    summaryAr,
    summaryEn,
    hooks: hooks.length > 0 ? hooks : titlePatterns,
    ctaPatterns: ctaPatterns.length > 0 ? ctaPatterns : titlePatterns,
    themes,
    copyLengthInsight,
    exampleAds,
    totalAdsAnalyzed: ads.length,
  };
}

export async function getTrendContext(params: {
  industry: string;
  goal: CampaignGoal;
  countries?: string[];
}): Promise<TrendInsights> {
  const searchTerms = buildSearchTerms(params.industry, params.goal);
  const curated = getIndustryTrends(params.industry);

  try {
    const ads = await searchAdLibrary({
      searchTerms,
      countries: params.countries,
    });

    if (ads.length >= 3) {
      const insights = extractTrendInsights(ads);
      return { source: "meta_ad_library", ...insights };
    }
  } catch (err) {
    console.error("Ad Library search failed, using fallback:", err);
  }

  const fallback = buildCuratedTrendSummary(params.industry, params.goal);
  return {
    source: "curated_fallback",
    ...fallback,
    totalAdsAnalyzed: 0,
    themes: [
      ...fallback.themes,
      ...curated.whatWorksMena.map((w) => w.ar),
    ].slice(0, 6),
  };
}

export function formatTrendContextForPrompt(trends: TrendInsights): string {
  const sourceLabel =
    trends.source === "meta_ad_library"
      ? "Meta Ad Library (live data)"
      : "Curated MENA industry benchmarks (Ad Library unavailable)";

  const examples =
    trends.exampleAds.length > 0
      ? `\n## Example successful ads in category\n${trends.exampleAds
          .map(
            (ad, i) =>
              `${i + 1}. [${ad.pageName}] Body: "${ad.body}"${ad.headline ? ` | Headline: "${ad.headline}"` : ""}`,
          )
          .join("\n")}`
      : "";

  return `## Trend intelligence (${sourceLabel})
${trends.totalAdsAnalyzed > 0 ? `Analyzed ${trends.totalAdsAnalyzed} active ads.` : "Using curated industry benchmarks."}

### Summary
${trends.summaryEn}

### Common hooks
${trends.hooks.map((h) => `- ${h}`).join("\n") || "- (none extracted)"}

### CTA patterns
${trends.ctaPatterns.map((c) => `- ${c}`).join("\n") || "- (none extracted)"}

### Themes & patterns
${trends.themes.map((t) => `- ${t}`).join("\n") || "- (none extracted)"}

### Copy length insight
${trends.copyLengthInsight}
${examples}

Use this data to compare the user's ad against what's working NOW in their category. Be specific about gaps and opportunities.`;
}
