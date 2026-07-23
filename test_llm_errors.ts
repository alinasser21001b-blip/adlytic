import { classifyLlmError } from './src/lib/llmErrors';
let pass=0, fail=0;
function eq(l:string, got:unknown, want:unknown){ if(got===want) pass++; else { fail++; console.error(`  ❌ ${l}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);} }

// The EXACT string thrown by agent/loop.ts when no key is set (the screenshot case)
const c1 = classifyLlmError(new Error('No AI provider configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY.'));
eq('no-provider → AUTH_FAILED (not UNKNOWN)', c1.code, 'AI_AUTH_FAILED');
eq('no-provider message names the key, not "try again"', /غير مُفعّل|غير مضبوط/.test(c1.messageAr), true);
eq('no-provider message points to dashboard', /لوحة التحكم/.test(c1.messageAr), true);

// Genuine credit exhaustion still classifies correctly
eq('credit → CREDITS', classifyLlmError(new Error('Your credit balance is too low')).code, 'AI_CREDITS_EXHAUSTED');
// Bad key still AUTH
eq('invalid key → AUTH', classifyLlmError(new Error('anthropic: invalid api key')).code, 'AI_AUTH_FAILED');
// Overload still transient
eq('overloaded → UNAVAILABLE', classifyLlmError(new Error('Overloaded')).code, 'AI_UNAVAILABLE');
// A truly unknown error still lands in UNKNOWN (regression guard)
eq('random → UNKNOWN', classifyLlmError(new Error('kaboom')).code, 'AI_UNKNOWN');

console.log(`\nllm-errors: ${pass} passed, ${fail} failed`);
process.exit(fail===0?0:1);
