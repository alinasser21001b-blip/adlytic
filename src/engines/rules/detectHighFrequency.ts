// ════════════════════════════════════════════════════════════════════════
//  src/engines/rules/detectHighFrequency.ts
//
//  Fires when the current-period frequency exceeds a fatigue threshold.
//  Separate from AUDIENCE_FATIGUE — high frequency is one *input* to that
//  diagnosis, not the diagnosis itself. A creative-rich account can run
//  frequency 6 with no fatigue; a creative-stale account can fatigue at 3.
// ════════════════════════════════════════════════════════════════════════

import { IssueCode } from "@prisma/client";
import type { Detector } from "./types";
import { severityFromMagnitude } from "./severity";

/**
 * Threshold: frequency > 5.0.
 *
 * because:
 *   Meta's own ads-manager guidance generally flags frequency above ~5 as a
 *   fatigue indicator for short-cycle objectives. It is a single number that
 *   ignores audience size, creative count, and cultural tolerance for
 *   repetition. Iraqi small-business accounts likely have higher natural
 *   frequency (smaller audiences) — a furniture showroom with a 10km radius
 *   in Baghdad will hit frequency 5 fast without any actual fatigue.
 *
 *   Revisit when a furniture owner says "frequency 5 is normal for me".
 *   At that point this becomes industry_profiles.knowledgeJson.frequencyCeiling
 *   per-industry. Today: universal 5.0.
 */
const HIGH_FREQUENCY_THRESHOLD = 5.0;

export const detectHighFrequency: Detector = (s) => {
  if (s.currentFrequency == null) return null;
  if (s.currentFrequency <= HIGH_FREQUENCY_THRESHOLD) return null;

  // 5.5 → 0.10 above (LOW). 6.5 → 0.30 above (MEDIUM). 8.0 → 0.60 above (CRITICAL).
  const overshoot = (s.currentFrequency - HIGH_FREQUENCY_THRESHOLD) / HIGH_FREQUENCY_THRESHOLD;
  const severity = severityFromMagnitude(overshoot);

  return {
    issueCode: IssueCode.HIGH_FREQUENCY,
    severity,
    evidence: {
      currentFrequency: s.currentFrequency,
      threshold: HIGH_FREQUENCY_THRESHOLD,
      overshoot: +overshoot.toFixed(3),
      confidence: 0.70, // single-signal — could be normal for tight audiences
    },
  };
};
