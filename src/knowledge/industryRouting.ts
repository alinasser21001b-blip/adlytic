// src/knowledge/industryRouting.ts
//
// Resolves which benchmarks_by_industry.json industry key applies for a
// workspace / ad account. Priority: workspace industryProfile → ad account's
// workspace profile → global averages (null key).

import type { PrismaClient } from "@prisma/client";
import type { BenchmarkEvaluationOptions } from "./benchmarkIntelligence";

export type IndustryResolutionSource = "workspace" | "ad_account" | "global";

export interface IndustryProfileLike {
  name: string;
  knowledgeJson?: unknown;
}

export interface ResolvedBenchmarkIndustry {
  /** Key into benchmarks_by_industry.json `industries` — null → global-only. */
  benchmarkIndustryKey: string | null;
  source: IndustryResolutionSource;
  profileName: string | null;
}

/** Maps workspace IndustryProfile.name → benchmarks_by_industry.json keys. */
const PROFILE_NAME_TO_BENCHMARK_KEY: Record<string, string> = {
  furniture: "homewares_furniture_interiors",
  homewares: "homewares_furniture_interiors",
  homewares_furniture_interiors: "homewares_furniture_interiors",
  cosmetics: "beauty_cosmetics",
  beauty: "beauty_cosmetics",
  beauty_cosmetics: "beauty_cosmetics",
  fashion: "fashion_apparel",
  apparel: "fashion_apparel",
  fashion_apparel: "fashion_apparel",
  ecommerce: "fashion_apparel",
  saas: "b2b_saas",
  b2b_saas: "b2b_saas",
  lead_gen_home: "lead_gen_home_services",
  home_services: "lead_gen_home_services",
  finance: "lead_gen_finance_insurance",
  insurance: "lead_gen_finance_insurance",
  health: "lead_gen_health_wellness",
  wellness: "lead_gen_health_wellness",
  professional_services: "b2b_professional_services",
  recruitment: "b2b_recruitment_hrtech",
  luxury: "high_aov_tech_luxury",
  tech: "high_aov_tech_luxury",
};

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function benchmarkKeyFromKnowledgeJson(knowledgeJson: unknown): string | null {
  if (!knowledgeJson || typeof knowledgeJson !== "object") return null;
  const key = (knowledgeJson as Record<string, unknown>).benchmarkIndustryKey;
  if (typeof key === "string" && key.trim().length > 0) {
    return normalizeKey(key);
  }
  return null;
}

/** Sync resolver when an industry profile row is already loaded. */
export function resolveBenchmarkIndustryFromProfile(
  profile: IndustryProfileLike | null | undefined,
): ResolvedBenchmarkIndustry {
  if (!profile) {
    return { benchmarkIndustryKey: null, source: "global", profileName: null };
  }

  const fromJson = benchmarkKeyFromKnowledgeJson(profile.knowledgeJson);
  if (fromJson) {
    return { benchmarkIndustryKey: fromJson, source: "workspace", profileName: profile.name };
  }

  const normalized = normalizeKey(profile.name);
  const mapped = PROFILE_NAME_TO_BENCHMARK_KEY[normalized];
  if (mapped) {
    return { benchmarkIndustryKey: mapped, source: "workspace", profileName: profile.name };
  }

  // Profile name may already be a benchmarks JSON key (e.g. b2b_saas).
  return {
    benchmarkIndustryKey: normalized,
    source: "workspace",
    profileName: profile.name,
  };
}

export interface IndustryRoutingContext {
  workspace?: { industryProfile?: IndustryProfileLike | null } | null;
  adAccount?: {
    workspace?: { industryProfile?: IndustryProfileLike | null } | null;
  } | null;
}

/** Sync resolver when workspace / ad account graphs are already in memory. */
export function resolveBenchmarkIndustryFromContext(
  ctx: IndustryRoutingContext,
): ResolvedBenchmarkIndustry {
  if (ctx.workspace?.industryProfile) {
    return resolveBenchmarkIndustryFromProfile(ctx.workspace.industryProfile);
  }

  if (ctx.adAccount?.workspace?.industryProfile) {
    const resolved = resolveBenchmarkIndustryFromProfile(ctx.adAccount.workspace.industryProfile);
    return { ...resolved, source: "ad_account" };
  }

  return { benchmarkIndustryKey: null, source: "global", profileName: null };
}

/** Async DB resolver — supply workspaceId and/or adAccountId. */
export async function resolveBenchmarkIndustry(
  prisma: PrismaClient,
  ids: { workspaceId?: string; adAccountId?: string },
): Promise<ResolvedBenchmarkIndustry> {
  if (ids.workspaceId) {
    const ws = await prisma.workspace.findUnique({
      where: { id: ids.workspaceId },
      include: { industryProfile: true },
    });
    if (ws?.industryProfile) {
      return resolveBenchmarkIndustryFromProfile(ws.industryProfile);
    }
  }

  if (ids.adAccountId) {
    const acc = await prisma.adAccount.findUnique({
      where: { id: ids.adAccountId },
      include: { workspace: { include: { industryProfile: true } } },
    });
    if (acc?.workspace?.industryProfile) {
      const resolved = resolveBenchmarkIndustryFromProfile(acc.workspace.industryProfile);
      return { ...resolved, source: "ad_account" };
    }
  }

  return { benchmarkIndustryKey: null, source: "global", profileName: null };
}

export function toBenchmarkEvaluationOptions(
  resolved: ResolvedBenchmarkIndustry,
): BenchmarkEvaluationOptions {
  return { industryKey: resolved.benchmarkIndustryKey };
}
