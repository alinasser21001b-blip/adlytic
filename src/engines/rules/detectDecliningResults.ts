// ════════════════════════════════════════════════════════════════════════
//  src/engines/rules/detectDecliningResults.ts
//
//  Fires when results (messages/purchases/leads — the campaign's objective)
//  are trending materially down. This is the bottom-line bad-news rule:
//  regardless of cause, the user is getting fewer outcomes this week than
//  last.
//
//  Differs from AUDIENCE_FATIGUE in that it doesn't require corroborating
//  signals. Results dropping for any reason is something the user should
//  know about.
// ════════════════════════════════════════════════════════════════════════

import { IssueCode } from "@prisma/client";
import type { Detector } from "./types";
import { severityFromMagnitude } from "./severity";

/**
 * Threshold: resultsTrend ≤ -20%.
 *
 * because:
 *   Below 20% drop is typical week-to-week variance for small Iraqi
 *   accounts that often have <50 results per week (small absolute numbers
 *   amplify percentage swings). 20% is the line where it becomes hard to
 *   explain as noise.
 *
 *   Analytics already returns null when prior < 3, so we don't need to
 *   guard against "1 → 0 = -100%" panics here — Analytics filtered those.
 */
const RESULTS_DROP_THRESHOLD = 0.20;

export const detectDecliningResults: Detector = (s) => {
  if (s.resultsTrend == null) return null;
  if (s.resultsTrend > -RESULTS_DROP_THRESHOLD) return null;

  const magnitude = Math.abs(s.resultsTrend);
  const severity = severityFromMagnitude(magnitude);

  return {
    issueCode: IssueCode.DECLINING_RESULTS,
    severity,
    evidence: {
      resultsTrend: s.resultsTrend,
      threshold: -RESULTS_DROP_THRESHOLD,
      currentResults: s.currentResults,
      confidence: 0.85, // results is the bottom line; trust the number
    },
  };
};
