// ════════════════════════════════════════════════════════════════════════
//  src/engines/rules/diagnose.ts
//
//  Turns raw detected issues + their evidence into a named diagnosis with
//  a plain-language narrative. Detectors answer "WHAT happened"; this
//  module answers "WHY it happened and WHAT to do."
//
//  A diagnosis is a pattern across one or more issues. The same issue can
//  contribute to multiple diagnoses (e.g. DECLINING_RESULTS participates
//  in both "creative fatigue" and "landing page problem"). The narratives
//  are templates — no LLM, no external calls — so they're fast, testable,
//  and deterministic.
// ════════════════════════════════════════════════════════════════════════

import type { IssueRecord } from "../../repositories/detectedIssuesRepo";
import type { Signals } from "./types";

export interface Diagnosis {
  name: string;
  confidence: number;
  narrative: string;
  action: string;
  contributingIssues: string[];
}

type IssueMap = Map<string, IssueRecord>;

export function diagnose(issues: IssueRecord[], signals: Signals): Diagnosis[] {
  const m: IssueMap = new Map();
  for (const i of issues) m.set(i.issueCode, i);

  const out: Diagnosis[] = [];

  const creative = diagnoseCreativeFatigue(m, signals);
  if (creative) out.push(creative);

  const audience = diagnoseAudienceSaturation(m, signals);
  if (audience) out.push(audience);

  const auction = diagnoseAuctionPressure(m, signals);
  if (auction) out.push(auction);

  const landing = diagnoseLandingPageProblem(m, signals);
  if (landing) out.push(landing);

  const efficiency = diagnoseEfficiencyDrop(m, signals);
  if (efficiency) out.push(efficiency);

  return out;
}

// ── Pattern 1: Creative Fatigue ───────────────────────────────────────
// frequency ↑ + CTR ↓ = audience saw the ad too many times, creative is worn out
function diagnoseCreativeFatigue(m: IssueMap, s: Signals): Diagnosis | null {
  const fatigue = m.get("AUDIENCE_FATIGUE");
  if (!fatigue) return null;

  const freq = s.currentFrequency != null ? s.currentFrequency.toFixed(1) : "?";
  const ctrDrop = s.ctrTrend != null ? `${Math.abs(s.ctrTrend * 100).toFixed(0)}%` : "?";
  const freqRise = s.frequencyTrend != null ? `${(s.frequencyTrend * 100).toFixed(0)}%` : "?";

  return {
    name: "Creative Fatigue",
    confidence: (fatigue.evidence.confidence as number) ?? 0.7,
    narrative:
      `Frequency rose ${freqRise} to ${freq} while CTR dropped ${ctrDrop}. ` +
      `Your audience has seen this creative too many times — engagement drops as ` +
      `the same people see the same ad repeatedly.`,
    action:
      `Refresh the creative: swap the image/video or change the copy angle. ` +
      `Accounts at this fatigue level typically recover CTR within 5–7 days of a refresh.`,
    contributingIssues: ["AUDIENCE_FATIGUE", ...(m.has("HIGH_FREQUENCY") ? ["HIGH_FREQUENCY"] : []), ...(m.has("LOW_CTR") ? ["LOW_CTR"] : [])],
  };
}

// ── Pattern 2: Audience Saturation ────────────────────────────────────
// HIGH_FREQUENCY + DECLINING_RESULTS but no strong CTR drop = audience is maxed out
function diagnoseAudienceSaturation(m: IssueMap, s: Signals): Diagnosis | null {
  if (!m.has("HIGH_FREQUENCY") || !m.has("DECLINING_RESULTS")) return null;
  if (m.has("AUDIENCE_FATIGUE")) return null; // creative fatigue already covers this

  const freq = s.currentFrequency != null ? s.currentFrequency.toFixed(1) : "?";
  const resultsDrop = s.resultsTrend != null ? `${Math.abs(s.resultsTrend * 100).toFixed(0)}%` : "?";

  return {
    name: "Audience Saturation",
    confidence: 0.65,
    narrative:
      `Frequency reached ${freq} and results dropped ${resultsDrop}, but CTR hasn't ` +
      `collapsed — the creative still works, but you've reached everyone in this audience. ` +
      `There's nobody new left to show the ad to.`,
    action:
      `Expand the target audience: broaden location radius, add lookalike audiences, ` +
      `or test new interest segments. The creative is fine — the audience pool is exhausted.`,
    contributingIssues: ["HIGH_FREQUENCY", "DECLINING_RESULTS"],
  };
}

// ── Pattern 3: Auction Pressure ───────────────────────────────────────
// CPM rising with CTR flat = competitors bidding you up, not a creative problem
function diagnoseAuctionPressure(m: IssueMap, s: Signals): Diagnosis | null {
  if (s.cpmTrend == null || s.cpmTrend < 0.15) return null;
  const ctrStable = s.ctrTrend == null || Math.abs(s.ctrTrend) < 0.10;
  if (!ctrStable) return null;

  const cpmRise = `${(s.cpmTrend * 100).toFixed(0)}%`;

  return {
    name: "Auction Pressure",
    confidence: 0.60,
    narrative:
      `CPM rose ${cpmRise} while your CTR stayed stable. Your ad is performing fine — ` +
      `the cost increase is coming from the auction: more competitors or higher bids ` +
      `in your target audience.`,
    action:
      `Options: (1) shift budget to off-peak hours or less competitive placements, ` +
      `(2) narrow the audience to higher-intent segments where your relevance score wins, ` +
      `or (3) accept the higher CPM if ROAS is still profitable.`,
    contributingIssues: [...(m.has("RISING_COST_PER_RESULT") ? ["RISING_COST_PER_RESULT"] : [])],
  };
}

// ── Pattern 4: Landing/Offer Problem ──────────────────────────────────
// CTR is healthy but results dropping = people click but don't convert
function diagnoseLandingPageProblem(m: IssueMap, s: Signals): Diagnosis | null {
  if (!m.has("DECLINING_RESULTS")) return null;
  const ctrHealthy = s.currentCtr != null && s.currentCtr >= 1.0;
  const ctrNotDropping = s.ctrTrend == null || s.ctrTrend > -0.10;
  if (!ctrHealthy || !ctrNotDropping) return null;

  const resultsDrop = s.resultsTrend != null ? `${Math.abs(s.resultsTrend * 100).toFixed(0)}%` : "?";
  const ctr = s.currentCtr != null ? `${s.currentCtr.toFixed(1)}%` : "?";

  return {
    name: "Post-Click Problem",
    confidence: 0.70,
    narrative:
      `Results dropped ${resultsDrop} but CTR is healthy at ${ctr} — people are clicking ` +
      `the ad, but not converting after the click. The problem is downstream: the landing ` +
      `page, the offer, or the WhatsApp/Messenger response flow.`,
    action:
      `Check: (1) landing page load speed, (2) match between ad promise and page content, ` +
      `(3) WhatsApp response time if using messaging objective. The ad itself is working.`,
    contributingIssues: ["DECLINING_RESULTS"],
  };
}

// ── Pattern 5: Efficiency Drop ────────────────────────────────────────
// RISING_COST_PER_RESULT without a clear cause from the patterns above
function diagnoseEfficiencyDrop(m: IssueMap, s: Signals): Diagnosis | null {
  const cpr = m.get("RISING_COST_PER_RESULT");
  if (!cpr) return null;
  if (m.has("AUDIENCE_FATIGUE")) return null; // already explained by fatigue

  const divergence = cpr.evidence.divergence as number | undefined;
  const divPct = divergence != null ? `${Math.abs(divergence * 100).toFixed(0)}%` : "?";

  return {
    name: "Rising Cost per Result",
    confidence: (cpr.evidence.confidence as number) ?? 0.75,
    narrative:
      `Each result is costing ${divPct} more relative to spend — you're spending ` +
      `about the same but getting fewer outcomes. This is the unit-economics ` +
      `version of declining results.`,
    action:
      `Review which campaigns have the widest cost gap and pause or restructure ` +
      `the worst performers. If this is account-wide, check audience overlap ` +
      `between campaigns (cannibalizing each other's audience).`,
    contributingIssues: ["RISING_COST_PER_RESULT", ...(m.has("DECLINING_RESULTS") ? ["DECLINING_RESULTS"] : [])],
  };
}
