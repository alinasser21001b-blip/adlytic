export type MetaObjective =
  | "OUTCOME_AWARENESS"
  | "OUTCOME_TRAFFIC"
  | "OUTCOME_ENGAGEMENT"
  | "OUTCOME_LEADS"
  | "OUTCOME_APP_PROMOTION"
  | "OUTCOME_SALES";

export type IndustryCategory =
  | "ecommerce"
  | "saas"
  | "real_estate"
  | "healthcare"
  | "education"
  | "food_beverage"
  | "fashion"
  | "finance"
  | "travel"
  | "local_business"
  | "automotive"
  | "entertainment"
  | "other";

export type CampaignGoal = "sales" | "traffic" | "awareness" | "leads";

export interface MetricDefinition {
  id: string;
  apiField: string;
  labelAr: string;
  labelEn: string;
  category: string;
  unit?: string;
  formula?: string;
  descriptionAr: string;
  descriptionEn: string;
  inputType: "number" | "percent" | "currency" | "text" | "select";
  optional?: boolean;
}

export interface BenchmarkRange {
  good: { min?: number; max?: number };
  average: { min?: number; max?: number };
  poor: { min?: number; max?: number };
  unit?: string;
}

export interface CreativeBreakdownItem {
  score: number;
  labelAr: string;
  labelEn: string;
  explanationAr: string;
  explanationEn: string;
}

export interface TrendContext {
  source: "meta_ad_library" | "curated_fallback";
  summaryAr: string;
  summaryEn: string;
  hooks: string[];
  ctaPatterns: string[];
  themes: string[];
  exampleAds: { pageName: string; body: string; headline?: string }[];
  totalAdsAnalyzed: number;
}

export interface AssessmentResult {
  audienceMessage: { ar: string; en: string };
  summaryAr: string;
  summaryEn: string;
  creativeBreakdown: {
    hook: CreativeBreakdownItem;
    messageClarity: CreativeBreakdownItem;
    visualImpact: CreativeBreakdownItem;
    ctaStrength: CreativeBreakdownItem;
  };
  trendComparison: { ar: string; en: string };
  actionItems: { ar: string; en: string }[];
  industryTips: { ar: string; en: string }[];
  strengths: { ar: string; en: string }[];
  performanceInsight?: { ar: string; en: string };
  trendContext?: TrendContext;
}
