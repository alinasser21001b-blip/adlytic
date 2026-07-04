// ════════════════════════════════════════════════════════════════════════
//  src/services/agent/postcheck.ts
//
//  Deterministic anti-hallucination check. Every ASSISTANT reply passes
//  through here BEFORE we send it to the merchant. If any number the model
//  cited is not backed by a tool result in the same turn, we reject the
//  reply and have the model try again with the specific constraint spelled
//  out.
//
//  Why deterministic and not another LLM call:
//    - LLM-as-judge would double our cost per turn.
//    - Precision + recall on "does '3.2' appear in the JSON" is trivially
//      100% with a text search; the LLM is not the right tool.
//    - This is a safety layer, not a quality one — the model still owns
//      writing well; we just refuse to ship claims not backed by tools.
//
//  Spec: PHASE2_AI_AGENT_DESIGN.md §20 (Anti-hallucination hard guardrails)
// ════════════════════════════════════════════════════════════════════════

import type { ToolResult } from './envelope';

export interface PostCheckInput {
  /** The final assistant reply text. */
  reply: string;
  /** Every tool result from THIS turn. Names + numbers must be sourced from these. */
  toolResults: Array<{ toolName: string; result: ToolResult<unknown> }>;
  /** Merchant's message — numbers inside their quoted words are exempt. */
  userMessage: string;
}

export interface PostCheckResult {
  ok: boolean;
  /** Verbatim tokens that failed the check (for the retry system message). */
  offendingTokens: string[];
  /** Compact reason strings for logging. */
  reasons: string[];
}

/** Numbers that are always allowed even without a tool source. */
const WHITELISTED_NUMBERS = new Set<string>([
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10',
  '12', '24', '30', '60', '100', '365', '1000',
]);

/** Rounding tolerance for matching a cited number to a tool value.
 *  0.5% covers rounded percentages, integer roundings, and minor CPM/CTR
 *  formatting differences. */
const NUMERIC_TOLERANCE_PCT = 0.005;

/**
 * Run the anti-hallucination check. Returns `ok: false` with the offending
 * tokens when a claim isn't sourced. The caller sends a system nudge to
 * Claude and re-runs the analyst turn.
 */
export function postCheckReply(input: PostCheckInput): PostCheckResult {
  const offendingTokens: string[] = [];
  const reasons: string[] = [];

  // 1. Collect the search corpus — every stringified tool result.
  const corpus = collectCorpus(input.toolResults);
  if (corpus.numbers.length === 0 && corpus.names.size === 0) {
    // No tools were called (yet) — any concrete number in the reply is suspect
    // UNLESS the reply is purely conversational. Detect purely-conversational
    // via absence of digit-shaped tokens; if none, we pass.
    if (!/\d/.test(input.reply)) {
      return { ok: true, offendingTokens: [], reasons: [] };
    }
    // Reply has digits but no tool corpus: check whitelist only.
  }

  // 2. Strip the user's quoted words from the reply so we don't fault numbers
  //    the merchant themselves wrote ("قال '5 دولار'").
  const strippedReply = stripUserQuotes(input.reply, input.userMessage);

  // 3. Number tokens.
  const numberTokens = extractNumberTokens(strippedReply);
  for (const raw of numberTokens) {
    if (WHITELISTED_NUMBERS.has(raw)) continue;
    const asNum = parseNumberToken(raw);
    if (asNum == null) continue;
    if (!numberBackedByCorpus(asNum, corpus.numbers)) {
      offendingTokens.push(raw);
      reasons.push(`unsourced_number:${raw}`);
    }
  }

  // 4. Campaign name checks. We look for quoted names ("...") or names
  //    preceded by "الحملة" / "إعلان" / "campaign". Only enforce when the
  //    corpus HAS names — else we can't validate.
  if (corpus.names.size > 0) {
    const namedMentions = extractNamedMentions(strippedReply);
    for (const name of namedMentions) {
      // Loose match: any name in the corpus that contains this token counts.
      const matched = Array.from(corpus.names).some((n) => n.includes(name) || name.includes(n));
      if (!matched) {
        offendingTokens.push(name);
        reasons.push(`unsourced_name:${name}`);
      }
    }
  }

  return {
    ok: offendingTokens.length === 0,
    offendingTokens,
    reasons,
  };
}

/**
 * Build the retry system message. Sent to Claude ONLY on a post-check
 * failure. Very specific — spells out the fabricated tokens — because
 * generic "don't hallucinate" prompts don't work.
 */
export function buildRetryNudge(offendingTokens: string[], locale: 'AR' | 'EN' = 'AR'): string {
  const list = offendingTokens.slice(0, 6).map((t) => `"${t}"`).join(', ');
  if (locale === 'AR') {
    return [
      'مراجعة تلقائية اكتشفت أن ردك السابق يستشهد بقيم غير موجودة في نتائج الأدوات:',
      list,
      '',
      'أعد صياغة الرد مستخدماً فقط الأرقام والأسماء التي وردت حرفياً في نتائج الأدوات المستدعاة هذا الدور. لا تخترع.',
      'إذا لم تجد رقماً ملائماً في النتائج، احذف الجملة أو استبدلها بقول عام مثل "لا تتوفر أرقام دقيقة الآن".',
    ].join('\n');
  }
  return [
    'Automatic check detected values in your previous reply not found in any tool result:',
    list,
    '',
    'Rewrite the reply using only numbers and names that appear verbatim in this turn\'s tool results. Do NOT invent.',
    'If a required number is missing, either drop the sentence or replace it with a general statement.',
  ].join('\n');
}

// ── helpers ─────────────────────────────────────────────────────────────

interface Corpus {
  numbers: number[];
  names: Set<string>;
}

/**
 * Flatten every tool result's JSON into a corpus of number values and
 * string values (for name matching). This is the ground-truth set.
 */
function collectCorpus(toolResults: PostCheckInput['toolResults']): Corpus {
  const numbers: number[] = [];
  const names = new Set<string>();
  for (const { result } of toolResults) {
    if (!result.ok) continue;
    walk(result.data, numbers, names);
  }
  return { numbers, names };
}

function walk(value: unknown, numbers: number[], names: Set<string>): void {
  if (value == null) return;
  if (typeof value === 'number' && Number.isFinite(value)) {
    numbers.push(value);
    return;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length >= 3) names.add(trimmed);
    // Also parse embedded numbers in display strings like "3.20 USD".
    for (const raw of extractNumberTokens(value)) {
      const n = parseNumberToken(raw);
      if (n != null) numbers.push(n);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) walk(v, numbers, names);
    return;
  }
  if (typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) walk(v, numbers, names);
  }
}

/** Extract every numeric-looking token from a string. Preserves the sign
 *  and decimal but drops thousands separators. Matches ints, decimals,
 *  and percentages. */
function extractNumberTokens(text: string): string[] {
  // Match sequences of digits with optional . or , separators and optional
  // trailing % or x. Simple heuristic — good enough for post-check.
  const matches = text.match(/-?\d[\d,]*(?:\.\d+)?%?x?/g);
  return matches ?? [];
}

/** Convert a token like "3,200" or "1.5%" or "2.1x" to a plain number.
 *  Strips % and x suffixes; treats "%" as percent (does NOT divide by 100
 *  since the corpus stores both raw and displayed forms). */
function parseNumberToken(token: string): number | null {
  const cleaned = token.replace(/,/g, '').replace(/[%x]$/, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** True when there's a corpus number within NUMERIC_TOLERANCE_PCT of the
 *  cited value. For values < 1 we use absolute tolerance of 0.01. */
function numberBackedByCorpus(value: number, corpus: number[]): boolean {
  const absTol = Math.max(0.01, Math.abs(value) * NUMERIC_TOLERANCE_PCT);
  for (const c of corpus) {
    if (Math.abs(c - value) <= absTol) return true;
  }
  return false;
}

/** Find campaign name mentions in the reply. Two shapes:
 *    1. quoted strings — "..." or ' ... '
 *    2. words following "الحملة" or "إعلان" or "campaign"
 */
function extractNamedMentions(text: string): string[] {
  const out: string[] = [];
  // Quoted strings — Arabic quotes «…» too.
  const quoted = text.match(/["'«]([^"'»]{2,80})["'»]/g);
  if (quoted) {
    for (const q of quoted) {
      const inner = q.replace(/^["'«]|["'»]$/g, '').trim();
      if (inner) out.push(inner);
    }
  }
  // "الحملة X" / "إعلان X" / "campaign X" — take next 1-4 words.
  const followers = text.match(/(?:الحملة|إعلان|campaign)\s+([^\s,،.!؟\n]{2,}(?:\s+[^\s,،.!؟\n]{2,}){0,3})/gi);
  if (followers) {
    for (const f of followers) {
      const cleaned = f.replace(/^(الحملة|إعلان|campaign)\s+/i, '').trim();
      if (cleaned) out.push(cleaned);
    }
  }
  return out;
}

/** Remove any substring of `reply` that also appears verbatim inside a
 *  user-quoted region of `userMessage`. Cheap approximation of "don't
 *  fault the model for repeating what the user said". */
function stripUserQuotes(reply: string, userMessage: string): string {
  // Extract quoted regions from userMessage.
  const userQuoted = userMessage.match(/["'«]([^"'»]{1,120})["'»]/g);
  if (!userQuoted) return reply;
  let out = reply;
  for (const q of userQuoted) {
    const inner = q.replace(/^["'«]|["'»]$/g, '').trim();
    if (inner) out = out.split(inner).join('');
  }
  return out;
}
