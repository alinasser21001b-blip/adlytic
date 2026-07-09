/**
 * Quick unit checks for LLM error classification + offline AI reply.
 * Run: npx tsx test_llm_errors.ts
 */
import { classifyLlmError } from './src/lib/llmErrors';
import {
  buildAiUnavailableReply,
  buildOfflineDiagnosisReply,
} from './src/services/aiOfflineReply';
import type { DashboardDTO } from './src/services/getDashboard';

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('ok:', msg);
  }
}

const creditErr = new Error(
  '400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."},"request_id":"req_011CcrwwbxswHgqPyweuWN2q"}',
);

const classified = classifyLlmError(creditErr);
assert(classified.code === 'AI_CREDITS_EXHAUSTED', 'credit → AI_CREDITS_EXHAUSTED');
assert(classified.httpStatus === 402, 'credit → 402');
assert(/نفاد رصيد|غير متاح/.test(classified.messageAr), 'Arabic merchant message');
assert(!/request_id|invalid_request_error/.test(classified.messageAr), 'no raw JSON in AR');

const rate = classifyLlmError(new Error('429 rate limit exceeded'));
assert(rate.code === 'AI_RATE_LIMITED', 'rate limit');

const dto = {
  empty: false,
  merchantTasks: [
    {
      title: 'إرهاق الإعلان',
      why: 'التردد ارتفع والتفاعل انخفض.',
      action: 'أوقف الإعلان المتعب وجرّب إبداعاً جديداً.',
      expect: 'راجع بعد 48–72 ساعة.',
      confidence: 0.82,
    },
  ],
  diagnoses: [],
} as unknown as DashboardDTO;

const offline = buildOfflineDiagnosisReply(dto, 'اشرح لي إرهاق الإعلان');
assert(!!offline && offline.includes('إرهاق الإعلان'), 'offline includes title');
assert(!!offline && offline.includes('ماذا تفعل الآن'), 'offline includes action section');
assert(!!offline && /بدون نموذج لغوي|غير متاح/.test(offline), 'offline notes cloud unavailable');

const fallback = buildAiUnavailableReply({
  err: creditErr,
  dto,
  userMessage: 'اشرح لي إرهاق الإعلان',
});
assert(fallback.usedOffline === true, 'usedOffline true when diagnosis exists');
assert(fallback.code === 'AI_CREDITS_EXHAUSTED', 'fallback keeps credit code');
assert(fallback.httpStatus === 200, 'offline reply is 200');
assert(!/credit balance|request_id/.test(fallback.reply), 'no provider JSON in reply');

const emptyFallback = buildAiUnavailableReply({
  err: creditErr,
  dto: { empty: true } as DashboardDTO,
  userMessage: 'مرحبا',
});
assert(emptyFallback.usedOffline === false, 'no offline without data');
assert(emptyFallback.code === 'AI_CREDITS_EXHAUSTED', 'still credit code');
assert(emptyFallback.httpStatus === 402, '402 when no offline content');
assert(!/request_id|invalid_request_error/.test(emptyFallback.reply), 'friendly error only');

if (failed) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log('\nAll llm error checks passed.');
