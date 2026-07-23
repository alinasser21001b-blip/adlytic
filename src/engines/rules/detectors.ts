// ════════════════════════════════════════════════════════════════════════
//  src/engines/rules/detectors.ts
//
//  Single detector registry shared by RulesEngine (account path) and
//  ruleGrounding (campaign brain path). Keep this file Prisma-free so
//  the brain can import it without pulling the DB client.
// ════════════════════════════════════════════════════════════════════════

import type { Detector } from './types';
import { detectAudienceFatigue } from './detectAudienceFatigue';
import { detectDecliningResults } from './detectDecliningResults';
import { detectRisingCostPerResult } from './detectRisingCostPerResult';
import { detectHighFrequency } from './detectHighFrequency';
import { detectLowCtr } from './detectLowCtr';

/** Canonical detector order. Adding a rule = adding here once. */
export const ALL_DETECTORS: Detector[] = [
  detectAudienceFatigue, // composite — most authoritative when it fires
  detectDecliningResults,
  detectRisingCostPerResult,
  detectHighFrequency,
  detectLowCtr,
];
