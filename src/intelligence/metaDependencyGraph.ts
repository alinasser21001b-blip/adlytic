// ════════════════════════════════════════════════════════════════════════
//  src/intelligence/metaDependencyGraph.ts
//
//  THE DEPENDENCY REGISTRY — "what breaks if Meta changes this?"
//
//  This is the foundation the whole intelligence layer rests on, and it is
//  buildable TODAY without a single Meta call: it is knowledge about OUR
//  code, not about Meta's behaviour. Every edge here was read out of the
//  repository, not assumed.
//
//  WHY THIS FIRST
//  A change radar that cannot answer "does this affect us?" produces news,
//  not intelligence. The registry converts a platform change into a
//  bounded, checkable blast radius: these features, these rules, these
//  screens. Without it, every Meta announcement is equally alarming, which
//  is the same as none of them being alarming.
//
//  DISCIPLINE THIS FILE INHERITS
//  Field names live behind the cordon (metaClient.ts / insightMapper.ts).
//  This registry NAMES them for dependency resolution only — it never reads
//  a payload, never maps a metric, and must never become a second place
//  where Meta field semantics are decided.
// ════════════════════════════════════════════════════════════════════════

/** A resource we consume from Meta. Granularity matters: a version change
 *  and a field deprecation have different blast radii. */
export type MetaResourceKind = 'FIELD' | 'BREAKDOWN' | 'ENDPOINT' | 'PERMISSION' | 'API_VERSION' | 'OBJECT_LEVEL';

export interface MetaResource {
  id: string;
  kind: MetaResourceKind;
  /** Exactly as Meta names it. Never a prettified alias. */
  name: string;
  /** Where in our code the dependency is declared — a real path, checkable. */
  declaredIn: string;
}

/** Something in our product that would visibly change if a resource moved. */
export interface ProductFeature {
  id: string;
  name: string;
  /** What the user loses if this breaks — impact in user terms, not code terms. */
  userImpact: string;
  /** Resource ids this feature consumes. */
  dependsOn: string[];
  /** Where it lives, so an engineer can go straight there. */
  implementedIn: string[];
  /**
   * Does a break here corrupt a NUMBER the customer acts on, or only hide a
   * view? Silent corruption outranks visible absence — an empty panel is
   * honest, a wrong CPA is not.
   */
  failureMode: 'SILENT_CORRUPTION' | 'VISIBLE_ABSENCE' | 'DEGRADED_DETAIL';
}

// ── Resources, read out of the cordon ──────────────────────────────────
const F = (name: string, declaredIn = 'src/services/metaClient.ts:DEFAULT_INSIGHT_FIELDS'): MetaResource =>
  ({ id: 'field:' + name, kind: 'FIELD', name, declaredIn });

export const META_RESOURCES: MetaResource[] = [
  F('spend'), F('impressions'), F('reach'), F('clicks'),
  F('inline_link_clicks'), F('unique_clicks'),
  F('ctr'), F('unique_ctr'), F('cpc'), F('cpm'), F('frequency'),
  F('actions'), F('action_values'),
  F('cost_per_action_type'), F('cost_per_unique_action_type'),
  F('purchase_roas'), F('date_start'), F('date_stop'),
  F('quality_ranking', 'src/services/metaClient.ts:AD_RELEVANCE_FIELDS'),
  F('engagement_rate_ranking', 'src/services/metaClient.ts:AD_RELEVANCE_FIELDS'),
  // Caught by test_dependency_drift.ts on its very first run: requested in
  // production, absent from this registry. Exactly the silence the gate
  // exists to break — the radar would have answered "we do not depend on
  // that" about a live dependency, and answered it confidently.
  F('conversion_rate_ranking', 'src/services/metaClient.ts:AD_RELEVANCE_FIELDS'),
  { id: 'endpoint:insights', kind: 'ENDPOINT', name: '/{object}/insights', declaredIn: 'src/services/metaClient.ts' },
  { id: 'perm:ads_read', kind: 'PERMISSION', name: 'ads_read', declaredIn: 'src/services/metaOAuth.ts' },
  { id: 'version:graph', kind: 'API_VERSION', name: 'META_API_VERSION', declaredIn: 'src/config.ts' },
  { id: 'breakdown:age_gender', kind: 'BREAKDOWN', name: 'age,gender', declaredIn: 'src/services/metaClient.ts' },
  { id: 'breakdown:placement', kind: 'BREAKDOWN', name: 'publisher_platform,platform_position', declaredIn: 'src/services/metaClient.ts' },
  // NOT currently requested — registered so a change radar can tell
  // "we do not use this" apart from "we never checked".
  { id: 'field:attribution_setting', kind: 'FIELD', name: 'attribution_setting', declaredIn: '(not requested — see METRIC_LINEAGE.md)' },
];

// ── Features, read out of the app ──────────────────────────────────────
export const PRODUCT_FEATURES: ProductFeature[] = [
  {
    id: 'feat:kpi-spend', name: 'مؤشرات الإنفاق',
    userImpact: 'الإنفاق والتكلفة لكل نتيجة على لوحة التحكم',
    dependsOn: ['field:spend', 'endpoint:insights', 'perm:ads_read', 'version:graph'],
    implementedIn: ['src/services/getDashboard.ts', 'src/mappers/insightMapper.ts'],
    failureMode: 'SILENT_CORRUPTION',
  },
  {
    id: 'feat:ctr', name: 'نسبة النقر',
    userImpact: 'CTR في البطاقات والاتجاهات وقواعد التشخيص',
    dependsOn: ['field:clicks', 'field:impressions', 'field:ctr', 'endpoint:insights'],
    implementedIn: ['src/services/getDashboard.ts', 'src/engines/analytics/calculateCtrTrend.ts'],
    failureMode: 'SILENT_CORRUPTION',
  },
  {
    id: 'feat:frequency', name: 'تكرار الظهور',
    userImpact: 'مؤشر التكرار، وبوابة HIGH_FREQUENCY التي يقوم عليها تشخيص التشبّع',
    dependsOn: ['field:frequency', 'field:reach', 'field:impressions'],
    implementedIn: ['src/engines/rules/detectHighFrequency.ts', 'src/engines/analytics/calculateFrequencyTrend.ts'],
    failureMode: 'SILENT_CORRUPTION',
  },
  {
    id: 'feat:results', name: 'النتائج حسب الهدف',
    userImpact: 'عدد الرسائل/المشتريات/العملاء المحتملين — الرقم الذي يقيس عليه التاجر نجاحه',
    dependsOn: ['field:actions', 'field:action_values', 'field:cost_per_action_type'],
    implementedIn: ['src/analytics/resultSemantics.ts', 'src/mappers/insightMapper.ts'],
    failureMode: 'SILENT_CORRUPTION',
  },
  {
    id: 'feat:roas', name: 'العائد على الإنفاق',
    userImpact: 'ROAS في لوحة المبيعات',
    dependsOn: ['field:purchase_roas', 'field:action_values', 'field:spend'],
    implementedIn: ['src/services/getDashboard.ts'],
    failureMode: 'SILENT_CORRUPTION',
  },
  {
    id: 'feat:funnel', name: 'قمع التحويل',
    userImpact: 'انهيار المسار: ظهور ← نقر ← وصول ← نتيجة، وكشف أول كسر',
    dependsOn: ['field:impressions', 'field:inline_link_clicks', 'field:actions'],
    implementedIn: ['src/analytics/funnel/compute.ts', 'src/analytics/funnel/diagnose.ts'],
    failureMode: 'DEGRADED_DETAIL',
  },
  {
    id: 'feat:ad-relevance', name: 'تشخيصات جودة الإعلان',
    userImpact: 'تصنيف Meta لجودة الإعلان مقابل المنافسين',
    dependsOn: ['field:quality_ranking', 'field:engagement_rate_ranking', 'field:conversion_rate_ranking'],
    implementedIn: ['src/knowledge/adRelevanceIntelligence.ts'],
    failureMode: 'VISIBLE_ABSENCE',
  },
  {
    id: 'feat:breakdowns', name: 'التفصيل حسب الجمهور والمواضع',
    userImpact: 'الأداء حسب العمر/الجنس والمنصّة/الموضع',
    dependsOn: ['breakdown:age_gender', 'breakdown:placement', 'endpoint:insights'],
    implementedIn: ['src/services/metaClient.ts'],
    failureMode: 'VISIBLE_ABSENCE',
  },
  {
    id: 'feat:cpa-comparability', name: 'مقارنة التكلفة بين المساحات',
    userImpact: 'مقارنة CPA بين عملاء مختلفين',
    dependsOn: ['field:attribution_setting'],
    implementedIn: ['(blocked — attribution context is not requested today)'],
    failureMode: 'SILENT_CORRUPTION',
  },
];

// ── Resolution ─────────────────────────────────────────────────────────

export interface BlastRadius {
  resourceIds: string[];
  /** Resource ids named by the change that we do NOT consume anywhere. */
  unusedResourceIds: string[];
  /** Resource ids we could not find in the registry at all. */
  unknownResourceIds: string[];
  features: ProductFeature[];
  /** Highest failure mode among the affected features. */
  worstFailureMode: ProductFeature['failureMode'] | 'NONE';
  implementationSites: string[];
}

const FAILURE_RANK: Record<ProductFeature['failureMode'], number> = {
  VISIBLE_ABSENCE: 1, DEGRADED_DETAIL: 2, SILENT_CORRUPTION: 3,
};

/**
 * Given Meta resource names from a platform change, return exactly what in
 * our product depends on them.
 *
 * The three-way split is the point. "We do not use this field" and "we have
 * never heard of this field" are different answers: the first is a decision
 * we made, the second is a gap in this registry — and conflating them would
 * let an unmapped dependency read as a deliberate non-dependency.
 */
export function resolveBlastRadius(resourceNames: string[]): BlastRadius {
  const byName = new Map(META_RESOURCES.map((r) => [r.name.toLowerCase(), r]));
  const matched: MetaResource[] = [];
  const unknown: string[] = [];
  for (const raw of resourceNames) {
    const hit = byName.get(raw.trim().toLowerCase());
    if (hit) matched.push(hit); else unknown.push(raw);
  }

  const matchedIds = new Set(matched.map((r) => r.id));
  const features = PRODUCT_FEATURES.filter((f) => f.dependsOn.some((d) => matchedIds.has(d)));
  const consumed = new Set(PRODUCT_FEATURES.flatMap((f) => f.dependsOn));
  const unused = matched.filter((r) => !consumed.has(r.id)).map((r) => r.id);

  let worst: BlastRadius['worstFailureMode'] = 'NONE';
  for (const f of features) {
    if (worst === 'NONE' || FAILURE_RANK[f.failureMode] > FAILURE_RANK[worst as ProductFeature['failureMode']]) {
      worst = f.failureMode;
    }
  }

  return {
    resourceIds: matched.map((r) => r.id),
    unusedResourceIds: unused,
    unknownResourceIds: unknown,
    features,
    worstFailureMode: worst,
    implementationSites: [...new Set(features.flatMap((f) => f.implementedIn))],
  };
}
