// tsx test_ai_offline_reply.ts — pure unit test for the offline AI reply.
// No DB, no network. Verifies: campaign-id/name resolution, Arabic-source
// preference over half-translated tasks, and clean output.

import { buildOfflineDiagnosisReply } from './src/services/aiOfflineReply';
import type { DashboardDTO } from './src/services/getDashboard';

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) pass++;
  else { fail++; console.error(`  ❌ ${label}`); }
}

const baseDto = {
  empty: false,
  campaigns: [
    { id: 'cmrcvu7yq0k2v01n4yvib1te0', name: 'وعي 46', health: 41, band: 'attention', messages: 43, ctr: 0.62, cpm: 0.55, frequency: 4.2 },
    { id: 'cmrxxxxxx0k2v01n4yvibaaaa', name: 'رسائل رمضان', health: 82, band: 'excellent', messages: 300, ctr: 2.1, cpm: 0.4, frequency: 1.8 },
  ],
  merchantTasks: [
    {
      title: 'Low نسبة النقر',
      why: "Ad copy or التصميم doesn't match the audience's intent",
      action: 'Pause the lowest-نسبة النقر ads and reallocate budget',
      confidence: 0.67,
    },
  ],
  diagnoses: [
    {
      name: 'ضعف التفاعل مع الإعلان',
      code: 'WEAK_CREATIVE',
      confidence: 0.75,
      narrative: 'نسبة النقر الحالية منخفضة — كثير من الناس يرون الإعلان ويمرّون دون اهتمام كافٍ.',
      action: 'جدّد الافتتاحية أو الصورة خلال هذا الأسبوع.',
      contributingIssues: ['LOW_CTR'],
    },
  ],
} as unknown as DashboardDTO;

// ── 1. Raw internal id in the question → campaign-specific Arabic reply ────
const r1 = buildOfflineDiagnosisReply(baseDto, 'تابع عن كثب الحملة cmrcvu7yq0k2v01n4yvib1te0');
check('id-resolved reply exists', !!r1);
check('id-resolved reply names the campaign', !!r1 && r1.includes('وعي 46'));
check('id-resolved reply has no raw cuid', !!r1 && !r1.includes('cmrcvu7yq'));
check('id-resolved reply mentions CTR verdict', !!r1 && r1.includes('منخفض'));
check('id-resolved reply flags high frequency', !!r1 && r1.includes('4.2'));

// ── 2. Campaign named in Arabic → same campaign-specific path ──────────────
const r2 = buildOfflineDiagnosisReply(baseDto, 'كيف أداء حملة رسائل رمضان؟');
check('name-resolved reply exists', !!r2);
check('name-resolved picks the right campaign', !!r2 && r2.includes('رسائل رمضان') && !r2.includes('وعي 46'));
check('healthy campaign gets monitor advice', !!r2 && r2.includes('الطبيعي'));

// ── 3. Generic question → prefers Arabic diagnosis over mixed-language task ─
const r3 = buildOfflineDiagnosisReply(baseDto, 'ما الذي أنصح به الآن؟');
check('generic reply exists', !!r3);
check('generic reply skips mixed-language task title', !!r3 && !r3.includes('Pause the lowest'));
check('generic reply uses Arabic diagnosis', !!r3 && r3.includes('ضعف التفاعل مع الإعلان'));
check("generic reply has no leftover English fragments", !!r3 && !r3.includes("doesn't match"));

// ── 4. Fully-Arabic task IS used when present ───────────────────────────────
const arabicTaskDto = {
  ...baseDto,
  merchantTasks: [
    { title: 'أوقف حملة مستنزفة', why: 'تنفق دون نتائج منذ 5 أيام.', action: 'أوقفها وانقل الميزانية لحملتك الأفضل.', confidence: 0.8 },
  ],
} as unknown as DashboardDTO;
const r4 = buildOfflineDiagnosisReply(arabicTaskDto, 'ما الوضع؟');
check('arabic task is preferred when clean', !!r4 && r4.includes('أوقف حملة مستنزفة'));

// ── 5. No matching campaign, no task, no diagnosis → null (honest) ─────────
const emptyDto = { empty: false, campaigns: [] } as unknown as DashboardDTO;
check('nothing useful → null', buildOfflineDiagnosisReply(emptyDto, 'مرحبا') === null);

console.log(`\nai-offline-reply: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
