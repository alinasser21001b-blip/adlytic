// ════════════════════════════════════════════════════════════════════════
//  src/services/reports/csvExport.ts
//
//  Client-facing CSV export for campaigns and daily insights. Pure functions
//  (no DB, no Prisma) so they unit-test in isolation and the API route stays a
//  thin fetch-then-format wrapper.
//
//  Excel + Arabic: every file is prefixed with a UTF-8 BOM (﻿) and uses
//  CRLF line endings so Excel on both Windows and macOS opens it in the right
//  encoding — without the BOM, Excel mis-decodes Arabic headers as mojibake.
//
//  Money: amounts are BigInt MINOR units in the DB (cents for USD/EGP/SAR,
//  whole-unit for IQD). We divide by the account's currencyMinorFactor and
//  emit a plain number (no currency symbol) so the value stays sortable and
//  spreadsheet-friendly; the currency code is a separate column.
// ════════════════════════════════════════════════════════════════════════

/** Minimal shape of the fields we read — kept structural so callers can pass
 *  Prisma rows directly without a mapping step. */
export interface CsvAccount {
  currency: string;
  currencyMinorFactor: number;
}
export interface CsvCampaign {
  name: string | null;
  status: string | null;
  objective: string | null;
  dailyBudget: bigint | number | null;
  lifetimeBudget: bigint | number | null;
  createdAt: Date | string | null;
}
export interface CsvInsight {
  date: Date | string;
  spend: bigint | number | null;
  impressions: bigint | number | null;
  reach: bigint | number | null;
  clicks: bigint | number | null;
  ctr: number | null;
  cpm: number | null;
  messages: bigint | number | null;
  purchases: bigint | number | null;
}

const STATUS_AR: Record<string, string> = {
  ACTIVE: 'نشطة',
  PAUSED: 'متوقفة',
  ARCHIVED: 'مؤرشفة',
  DELETED: 'محذوفة',
};
const OBJECTIVE_AR: Record<string, string> = {
  OUTCOME_SALES: 'مبيعات',
  OUTCOME_ENGAGEMENT: 'تفاعل',
  OUTCOME_LEADS: 'عملاء محتملون',
  OUTCOME_AWARENESS: 'وعي بالعلامة',
  OUTCOME_TRAFFIC: 'زيارات',
  OUTCOME_APP_PROMOTION: 'ترويج تطبيق',
  MESSAGES: 'رسائل',
  CONVERSIONS: 'تحويلات',
  LINK_CLICKS: 'نقرات الرابط',
  REACH: 'وصول',
  VIDEO_VIEWS: 'مشاهدات فيديو',
  LEAD_GENERATION: 'توليد عملاء',
};

function statusAr(s: string | null): string {
  return s ? (STATUS_AR[s] ?? s) : '—';
}
function objectiveAr(o: string | null): string {
  if (!o) return '—';
  return OBJECTIVE_AR[o] ?? o.replace(/^OUTCOME_/, '').replace(/_/g, ' ');
}

/** Minor units → major, as a fixed-decimal string. Empty for null. */
export function fmtMoneyMinor(
  minor: bigint | number | null | undefined,
  factor: number,
): string {
  if (minor == null) return '';
  const f = factor && factor > 0 ? factor : 100;
  const major = Number(minor) / f;
  return major.toFixed(f === 1 ? 0 : 2);
}

function isoDate(d: Date | string | null): string {
  if (!d) return '';
  const dt = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(dt.getTime())) return '';
  return dt.toISOString().slice(0, 10);
}

/** RFC-4180 cell quoting: wrap in quotes and double any embedded quote when
 *  the value contains a comma, quote, or newline. */
function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  const BOM = '﻿';
  const out = [headers.map(csvCell).join(',')];
  for (const row of rows) out.push(row.map(csvCell).join(','));
  return BOM + out.join('\r\n') + '\r\n';
}

export function campaignsToCsv(campaigns: CsvCampaign[], account: CsvAccount): string {
  const factor = account.currencyMinorFactor;
  const headers = [
    'اسم الحملة',
    'الحالة',
    'الهدف',
    `الميزانية اليومية (${account.currency})`,
    `الميزانية الإجمالية (${account.currency})`,
    'العملة',
    'تاريخ الإنشاء',
  ];
  const rows = campaigns.map((c) => [
    c.name ?? '—',
    statusAr(c.status),
    objectiveAr(c.objective),
    fmtMoneyMinor(c.dailyBudget, factor),
    fmtMoneyMinor(c.lifetimeBudget, factor),
    account.currency,
    isoDate(c.createdAt),
  ]);
  return toCsv(headers, rows);
}

export function insightsToCsv(insights: CsvInsight[], account: CsvAccount): string {
  const factor = account.currencyMinorFactor;
  const headers = [
    'التاريخ',
    `الإنفاق (${account.currency})`,
    'مرات الظهور',
    'الوصول',
    'النقرات',
    'نسبة النقر %',
    'تكلفة الألف ظهور',
    'الرسائل',
    'المشتريات',
  ];
  // Oldest → newest reads naturally in a spreadsheet; callers pass DESC rows.
  const ordered = [...insights].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );
  const num = (v: bigint | number | null | undefined): string =>
    v == null ? '' : String(Number(v));
  const rows = ordered.map((d) => [
    isoDate(d.date),
    fmtMoneyMinor(d.spend, factor),
    num(d.impressions),
    num(d.reach),
    num(d.clicks),
    d.ctr == null ? '' : d.ctr.toFixed(2),
    d.cpm == null ? '' : d.cpm.toFixed(2),
    num(d.messages),
    num(d.purchases),
  ]);
  return toCsv(headers, rows);
}
