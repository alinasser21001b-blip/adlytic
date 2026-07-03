// ════════════════════════════════════════════════════════════════════════
//  src/engines/analytics/attributeChange.ts
//
//  Decomposes a change in results into its component drivers:
//
//    results ≈ impressions × CTR × CVR
//
//  When results drop 33%, this tells you: "impressions were flat, CTR
//  fell 30%, CVR fell 5% — this is a click-through problem."
//
//  Uses multiplicative decomposition: each factor's contribution is its
//  log-share of the total change. This is the standard method in marketing
//  mix modeling and avoids the "residual" problem of additive splits.
// ════════════════════════════════════════════════════════════════════════

export interface PeriodTotals {
  impressions: number;
  clicks: number;
  results: number;
}

export interface Attribution {
  totalChange: number;
  drivers: {
    impressions: { prior: number; current: number; change: number; contribution: number };
    ctr:         { prior: number; current: number; change: number; contribution: number };
    cvr:         { prior: number; current: number; change: number; contribution: number };
  };
  primaryDriver: "impressions" | "ctr" | "cvr";
  narrative: string;
}

export function attributeChange(
  current: PeriodTotals,
  prior: PeriodTotals,
): Attribution | null {
  if (prior.impressions === 0 || prior.clicks === 0 || prior.results === 0) return null;
  if (current.impressions === 0 && current.clicks === 0 && current.results === 0) return null;

  const priorCtr = prior.clicks / prior.impressions;
  const currentCtr = current.clicks / Math.max(current.impressions, 1);
  const priorCvr = prior.results / prior.clicks;
  const currentCvr = current.results / Math.max(current.clicks, 1);

  const totalChange = (current.results - prior.results) / prior.results;

  const impChange = prior.impressions > 0
    ? (current.impressions - prior.impressions) / prior.impressions : 0;
  const ctrChange = priorCtr > 0 ? (currentCtr - priorCtr) / priorCtr : 0;
  const cvrChange = priorCvr > 0 ? (currentCvr - priorCvr) / priorCvr : 0;

  // Multiplicative contribution via log decomposition.
  // ln(current/prior) = ln(imp_ratio) + ln(ctr_ratio) + ln(cvr_ratio)
  // Each term's share of the total = its ln-ratio / total ln-ratio.
  const impRatio = current.impressions / Math.max(prior.impressions, 1);
  const ctrRatio = currentCtr / Math.max(priorCtr, 1e-9);
  const cvrRatio = currentCvr / Math.max(priorCvr, 1e-9);

  const lnTotal = Math.log(impRatio) + Math.log(ctrRatio) + Math.log(cvrRatio);

  let impContrib = 0, ctrContrib = 0, cvrContrib = 0;
  if (Math.abs(lnTotal) > 1e-9) {
    impContrib = +(Math.log(impRatio) / lnTotal * totalChange).toFixed(4);
    ctrContrib = +(Math.log(ctrRatio) / lnTotal * totalChange).toFixed(4);
    cvrContrib = +(Math.log(cvrRatio) / lnTotal * totalChange).toFixed(4);
  }

  const absContribs = [
    { key: "impressions" as const, v: Math.abs(impContrib) },
    { key: "ctr" as const, v: Math.abs(ctrContrib) },
    { key: "cvr" as const, v: Math.abs(cvrContrib) },
  ];
  absContribs.sort((a, b) => b.v - a.v);
  const primaryDriver = absContribs[0].key;

  const driverLabels = { impressions: "impressions (reach/delivery)", ctr: "CTR (click-through rate)", cvr: "conversion rate (post-click)" };
  const direction = totalChange < 0 ? "dropped" : "rose";
  const pct = (n: number) => `${Math.abs(n * 100).toFixed(0)}%`;

  const narrative =
    `Results ${direction} ${pct(totalChange)}. ` +
    `Breakdown: impressions ${impChange >= 0 ? "+" : ""}${pct(impChange)}, ` +
    `CTR ${ctrChange >= 0 ? "+" : ""}${pct(ctrChange)}, ` +
    `CVR ${cvrChange >= 0 ? "+" : ""}${pct(cvrChange)}. ` +
    `Primary driver: ${driverLabels[primaryDriver]}.`;

  return {
    totalChange: +totalChange.toFixed(4),
    drivers: {
      impressions: { prior: prior.impressions, current: current.impressions, change: +impChange.toFixed(4), contribution: impContrib },
      ctr:         { prior: +priorCtr.toFixed(4), current: +currentCtr.toFixed(4), change: +ctrChange.toFixed(4), contribution: ctrContrib },
      cvr:         { prior: +priorCvr.toFixed(4), current: +currentCvr.toFixed(4), change: +cvrChange.toFixed(4), contribution: cvrContrib },
    },
    primaryDriver,
    narrative,
  };
}
