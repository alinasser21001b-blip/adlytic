// ════════════════════════════════════════════════════════════════════════
//  src/lib/smartInsights.ts
//
//  Pure presentation-intelligence helpers for the dashboard DTO:
//    • KPI benchmarks   — position vs industry ranges (CTR, frequency ONLY:
//      the published CPM/CPC benchmarks are GBP/USD figures and comparing
//      them to IQD accounts would be dishonest, so we deliberately don't).
//    • Month-end forecast — linear projection from the recent daily pace.
//    • Bleed alert      — today's spend with zero results, vs recent norm.
//
//  All functions are deterministic and side-effect free. They return null
//  rather than guess when the data is too thin — no fake intelligence.
// ════════════════════════════════════════════════════════════════════════

export type BenchmarkPosition = 'good' | 'ok' | 'low';

export interface KpiBenchmark {
  /** Short localized line, e.g. "المعيار بقطاعك: 0.8-1.5% — أنت فوقه". */
  text: string;
  position: BenchmarkPosition;
}

// Industry CTR ranges (percent) distilled from knowledge/benchmarks_by_industry.json.
// Keyed by a substring matched against the workspace's industry name (EN, lowercased).
const INDUSTRY_CTR_RANGES: Array<{ match: RegExp; lo: number; hi: number; label: string }> = [
  { match: /fashion|apparel|ملابس|أزياء/i, lo: 1.2, hi: 2.0, label: 'Fashion & Apparel' },
  { match: /furniture|homeware|interior|أثاث|مفروشات/i, lo: 0.8, hi: 1.5, label: 'Furniture & Homewares' },
  { match: /beauty|cosmetic|تجميل|مكياج/i, lo: 1.0, hi: 2.0, label: 'Beauty & Cosmetics' },
  { match: /food|restaurant|مطعم|أغذية/i, lo: 1.0, hi: 1.8, label: 'Food & Beverage' },
];
const GLOBAL_CTR = { lo: 0.9, hi: 1.5 };
/** Meta community consensus: frequency 3-4 is the fatigue line for cold audiences. */
const FREQUENCY_FATIGUE_LO = 3.0;
const FREQUENCY_FATIGUE_HI = 4.0;

export function benchmarkCtr(
  ctr: number | null,
  industry: string | null,
  ar: boolean,
): KpiBenchmark | null {
  if (ctr === null || !Number.isFinite(ctr)) return null;
  const ind = industry ? INDUSTRY_CTR_RANGES.find((r) => r.match.test(industry)) : undefined;
  const { lo, hi } = ind ?? GLOBAL_CTR;
  const scope = ind
    ? (ar ? 'بقطاعك' : 'in your industry')
    : (ar ? 'عالمياً' : 'globally');
  const range = `${lo}-${hi}%`;
  if (ctr > hi) {
    return {
      position: 'good',
      text: ar ? `المعيار ${scope}: ${range} — أنت فوقه 👏` : `Benchmark ${scope}: ${range} — you're above it 👏`,
    };
  }
  if (ctr >= lo) {
    return {
      position: 'ok',
      text: ar ? `المعيار ${scope}: ${range} — أنت ضمنه` : `Benchmark ${scope}: ${range} — you're within it`,
    };
  }
  return {
    position: 'low',
    text: ar ? `المعيار ${scope}: ${range} — أنت دونه` : `Benchmark ${scope}: ${range} — you're below it`,
  };
}

export function benchmarkFrequency(freq: number | null, ar: boolean): KpiBenchmark | null {
  if (freq === null || !Number.isFinite(freq)) return null;
  if (freq < FREQUENCY_FATIGUE_LO) {
    return {
      position: 'good',
      text: ar ? `تحت خط الإشباع (${FREQUENCY_FATIGUE_LO}-${FREQUENCY_FATIGUE_HI}) — صحي` : `Below the fatigue line (${FREQUENCY_FATIGUE_LO}-${FREQUENCY_FATIGUE_HI}) — healthy`,
    };
  }
  if (freq <= FREQUENCY_FATIGUE_HI) {
    return {
      position: 'ok',
      text: ar ? `داخل نطاق الإشباع (${FREQUENCY_FATIGUE_LO}-${FREQUENCY_FATIGUE_HI}) — راقبه` : `Inside the fatigue band (${FREQUENCY_FATIGUE_LO}-${FREQUENCY_FATIGUE_HI}) — watch it`,
    };
  }
  return {
    position: 'low',
    text: ar ? `فوق خط الإشباع (${FREQUENCY_FATIGUE_HI}) — الجمهور مشبع` : `Above the fatigue line (${FREQUENCY_FATIGUE_HI}) — audience saturated`,
  };
}

// ── Month-end forecast ───────────────────────────────────────────────────

export interface ForecastInput {
  date: Date;      // row date (UTC-floored)
  spend: number;   // minor units
  messages: number;
}

export interface Forecast {
  projectedSpendMinor: number;
  projectedMessages: number;
  daysLeft: number;
}

/**
 * Linear month-end projection: month-to-date actuals + trailing-7-day daily
 * pace × remaining days. Needs ≥5 days of data in the window; returns null
 * otherwise (a 2-day "forecast" is noise dressed as insight).
 */
export function computeForecast(daily: ForecastInput[], now: Date): Forecast | null {
  if (daily.length < 5) return null;
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const monthStart = Date.UTC(y, m, 1);
  const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const dayOfMonth = now.getUTCDate();
  const daysLeft = Math.max(0, daysInMonth - dayOfMonth);

  const mtd = daily.filter((d) => d.date.getTime() >= monthStart);
  if (mtd.length < 3) return null;

  const last7 = daily.slice(-7);
  const paceSpend = last7.reduce((s, d) => s + d.spend, 0) / last7.length;
  const paceMsgs = last7.reduce((s, d) => s + d.messages, 0) / last7.length;
  const mtdSpend = mtd.reduce((s, d) => s + d.spend, 0);
  const mtdMsgs = mtd.reduce((s, d) => s + d.messages, 0);

  return {
    projectedSpendMinor: Math.round(mtdSpend + paceSpend * daysLeft),
    projectedMessages: Math.round(mtdMsgs + paceMsgs * daysLeft),
    daysLeft,
  };
}

// ── Bleed alert — today is spending and producing nothing ────────────────

export interface BleedAlert {
  spendTodayMinor: number;
}

/**
 * Fires only when: the latest row IS today (UTC), it has spend but zero
 * results, the recent 7-day window DID produce results, and today's spend
 * is already ≥ 25% of the recent average daily spend (so a fresh morning
 * with 2% of budget spent doesn't cry wolf).
 */
export function detectBleed(daily: ForecastInput[], now: Date): BleedAlert | null {
  if (daily.length < 8) return null;
  const last = daily[daily.length - 1]!;
  const todayFloor = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (last.date.getTime() !== todayFloor) return null;
  if (last.messages > 0 || last.spend <= 0) return null;

  const prior7 = daily.slice(-8, -1);
  const priorMsgs = prior7.reduce((s, d) => s + d.messages, 0);
  if (priorMsgs === 0) return null; // account never produces — different problem
  const avgSpend = prior7.reduce((s, d) => s + d.spend, 0) / prior7.length;
  if (avgSpend <= 0 || last.spend < avgSpend * 0.25) return null;

  return { spendTodayMinor: last.spend };
}
