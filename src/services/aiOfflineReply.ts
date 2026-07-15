// ════════════════════════════════════════════════════════════════════════
//  src/services/aiOfflineReply.ts
//
//  Deterministic merchant reply when Claude/Anthropic is unavailable.
//  Uses live dashboard diagnoses / merchantTasks — no LLM required.
// ════════════════════════════════════════════════════════════════════════

import type { DashboardDTO } from './getDashboard';
import { classifyLlmError, llmErrorMessage, type LlmErrorCode } from '../lib/llmErrors';

function looksArabic(s: string): boolean {
  return /[\u0600-\u06FF]/.test(s);
}

/**
 * True when the text is predominantly Arabic. Half-translated knowledge-base
 * strings ("Pause the lowest-\u0646\u0633\u0628\u0629 \u0627\u0644\u0646\u0642\u0631 ads\u2026") fail this check, so the reply
 * builder can skip them in favor of the genuinely Arabic diagnosis narrative.
 */
function mostlyArabic(s: string | null | undefined): boolean {
  if (!s) return false;
  const letters = s.match(/[A-Za-z\u0600-\u06FF]/g) ?? [];
  if (letters.length === 0) return false;
  const arabic = s.match(/[\u0600-\u06FF]/g) ?? [];
  return arabic.length / letters.length >= 0.7;
}

/** Prisma cuids embedded in a question (dashboard deep-links used to pass
 *  raw internal ids like cmrcvu7yq0k2v01n4yvib1te0). */
const CUID_RE = /\bc[a-z0-9]{20,28}\b/g;

interface CampaignRef {
  id: string;
  name: string;
  health?: number;
  band?: string;
  messages?: number;
  ctr?: number | null;
  cpm?: number | null;
  frequency?: number | null;
}

/**
 * Resolve a campaign the question refers to \u2014 by embedded internal id or by
 * name substring \u2014 from the DTO's campaign cards. Returns null when nothing
 * matches confidently.
 */
function resolveCampaignFromMessage(
  dto: DashboardDTO | null | undefined,
  userMessage: string,
): CampaignRef | null {
  const cards = (dto as { campaigns?: CampaignRef[] } | null | undefined)?.campaigns;
  if (!Array.isArray(cards) || cards.length === 0) return null;

  const ids = userMessage.match(CUID_RE) ?? [];
  for (const id of ids) {
    const hit = cards.find((c) => c.id === id);
    if (hit) return hit;
  }

  // Name match: longest campaign name contained in the question wins
  // (avoids "\u0648\u0639\u064A" matching every "\u0648\u0639\u064A \u0661/\u0662/\u0663" sibling ambiguously).
  let best: CampaignRef | null = null;
  for (const c of cards) {
    const name = (c.name || '').trim();
    if (name.length >= 2 && userMessage.includes(name)) {
      if (!best || name.length > (best.name || '').length) best = c;
    }
  }
  return best;
}

const BAND_AR: Record<string, string> = {
  excellent: '\u0645\u0645\u062A\u0627\u0632\u0629',
  good: '\u062C\u064A\u062F\u0629',
  attention: '\u062A\u062D\u062A\u0627\u062C \u0627\u0646\u062A\u0628\u0627\u0647\u0627\u064B',
  poor: '\u0636\u0639\u064A\u0641\u0629',
};

/**
 * Campaign-specific offline answer: the question named ONE campaign, so
 * answer with THAT campaign's own numbers instead of the account-level
 * diagnosis. Pure Arabic, advisor structure.
 */
function buildCampaignSpecificReply(camp: CampaignRef): string {
  const facts: string[] = [];
  if (camp.health != null && Number.isFinite(camp.health)) {
    const band = BAND_AR[camp.band ?? ''] ?? '';
    facts.push(`- \u0646\u0642\u0627\u0637 \u0627\u0644\u0635\u062D\u0629: **${Math.round(camp.health)}/100**${band ? ` (${band})` : ''}`);
  }
  if (camp.ctr != null && Number.isFinite(camp.ctr)) {
    const verdict = camp.ctr >= 1.5 ? '\u062C\u064A\u062F' : camp.ctr >= 1.0 ? '\u0645\u062A\u0648\u0633\u0637' : '\u0645\u0646\u062E\u0641\u0636';
    facts.push(`- \u0645\u0639\u062F\u0644 \u0627\u0644\u0646\u0642\u0631 (CTR): **${camp.ctr.toFixed(2)}%** \u2014 ${verdict} (\u0627\u0644\u0645\u0639\u064A\u0627\u0631 \u0627\u0644\u062C\u064A\u062F 1.5%+)`);
  }
  if (camp.frequency != null && Number.isFinite(camp.frequency)) {
    const verdict = camp.frequency <= 3 ? '\u0636\u0645\u0646 \u0627\u0644\u0646\u0637\u0627\u0642 \u0627\u0644\u0635\u062D\u064A' : '\u0645\u0631\u062A\u0641\u0639 \u2014 \u0628\u062F\u0627\u064A\u0629 \u0625\u0631\u0647\u0627\u0642 \u0645\u062D\u062A\u0645\u0644\u0629';
    facts.push(`- \u0645\u0639\u062F\u0644 \u0627\u0644\u062A\u0643\u0631\u0627\u0631: **${camp.frequency.toFixed(1)}** \u2014 ${verdict} (\u0627\u0644\u0635\u062D\u064A 1.5\u20133)`);
  }
  if (camp.messages != null && Number.isFinite(camp.messages)) {
    facts.push(`- \u0645\u062D\u0627\u062F\u062B\u0627\u062A \u0627\u0644\u0631\u0633\u0627\u0626\u0644 (30 \u064A\u0648\u0645\u0627\u064B): **${camp.messages}**`);
  }

  const weakCtr = camp.ctr != null && camp.ctr < 1.0;
  const highFreq = camp.frequency != null && camp.frequency > 3;
  const lowHealth = camp.health != null && camp.health < 60;

  let action: string;
  if (weakCtr && highFreq) {
    action = '\u062C\u062F\u0651\u062F \u0627\u0644\u062A\u0635\u0645\u064A\u0645 \u0627\u0644\u0625\u0639\u0644\u0627\u0646\u064A (\u0635\u0648\u0631\u0629/\u0641\u064A\u062F\u064A\u0648 \u0648\u0627\u0641\u062A\u062A\u0627\u062D\u064A\u0629 \u062C\u062F\u064A\u062F\u0629) \u2014 \u0627\u0644\u062C\u0645\u0647\u0648\u0631 \u0631\u0623\u0649 \u0627\u0644\u0625\u0639\u0644\u0627\u0646 \u0643\u062B\u064A\u0631\u0627\u064B \u0648\u0642\u0644\u0651 \u0627\u0647\u062A\u0645\u0627\u0645\u0647. \u0631\u0627\u0642\u0628 \u0627\u0644\u062A\u062D\u0633\u0646 \u062E\u0644\u0627\u0644 5\u20137 \u0623\u064A\u0627\u0645.';
  } else if (weakCtr) {
    action = '\u062D\u0633\u0651\u0646 \u0627\u0644\u0639\u0646\u0648\u0627\u0646 \u0623\u0648 \u0627\u0644\u0635\u0648\u0631\u0629 \u2014 \u0643\u062B\u064A\u0631\u0648\u0646 \u064A\u0631\u0648\u0646 \u0627\u0644\u0625\u0639\u0644\u0627\u0646 \u062F\u0648\u0646 \u0623\u0646 \u064A\u0646\u0642\u0631\u0648\u0627. \u0627\u062E\u062A\u0628\u0631 2\u20133 \u0628\u062F\u0627\u0626\u0644 \u0628\u062F\u0644 \u062A\u0639\u062F\u064A\u0644 \u0648\u0627\u062D\u062F.';
  } else if (highFreq) {
    action = '\u0648\u0633\u0651\u0639 \u0627\u0644\u062C\u0645\u0647\u0648\u0631 \u0642\u0644\u064A\u0644\u0627\u064B \u0623\u0648 \u0623\u0636\u0641 \u0627\u0647\u062A\u0645\u0627\u0645\u0627\u062A \u062C\u062F\u064A\u062F\u0629 \u2014 \u0627\u0644\u062A\u0643\u0631\u0627\u0631 \u0645\u0631\u062A\u0641\u0639 \u0648\u0627\u0644\u0625\u0639\u0644\u0627\u0646 \u064A\u0633\u062A\u0647\u0644\u0643 \u0646\u0641\u0633 \u0627\u0644\u0623\u0634\u062E\u0627\u0635.';
  } else if (lowHealth) {
    action = '\u0627\u0641\u062A\u062D \u062A\u0641\u0627\u0635\u064A\u0644 \u0627\u0644\u062D\u0645\u0644\u0629 \u0648\u0631\u0627\u062C\u0639 \u062A\u0628\u0648\u064A\u0628 \u00AB\u0627\u0644\u0625\u0628\u062F\u0627\u0639\u0627\u062A\u00BB \u0648\u00AB\u0627\u0644\u062C\u0645\u0647\u0648\u0631\u00BB \u0644\u062A\u062D\u062F\u064A\u062F \u0645\u0635\u062F\u0631 \u0627\u0644\u0636\u0639\u0641 \u0642\u0628\u0644 \u0623\u064A \u062A\u0639\u062F\u064A\u0644.';
  } else {
    action = '\u0627\u0644\u0623\u0631\u0642\u0627\u0645 \u0636\u0645\u0646 \u0627\u0644\u0646\u0637\u0627\u0642 \u0627\u0644\u0637\u0628\u064A\u0639\u064A \u2014 \u0631\u0627\u0642\u0628\u0647\u0627 \u062F\u0648\u0646 \u062A\u063A\u064A\u064A\u0631\u0627\u062A \u0643\u0628\u064A\u0631\u0629\u060C \u0648\u0642\u0627\u0631\u0646\u0647\u0627 \u0623\u0633\u0628\u0648\u0639\u064A\u0627\u064B.';
  }

  const lines = [
    `## \u0627\u0644\u0648\u0636\u0639 \u2014 \u062D\u0645\u0644\u0629 \u00AB${camp.name}\u00BB`,
    facts.length ? facts.join('\n') : '\u0644\u0627 \u062A\u0648\u062C\u062F \u0623\u0631\u0642\u0627\u0645 \u0643\u0627\u0641\u064A\u0629 \u0644\u0647\u0630\u0647 \u0627\u0644\u062D\u0645\u0644\u0629 \u0641\u064A \u0622\u062E\u0631 30 \u064A\u0648\u0645\u0627\u064B (\u0642\u062F \u062A\u0643\u0648\u0646 \u0645\u062A\u0648\u0642\u0641\u0629 \u0628\u0644\u0627 \u0625\u0646\u0641\u0627\u0642 \u062D\u062F\u064A\u062B).',
    '',
    `## \u0627\u0644\u062A\u0648\u0635\u064A\u0629 \u2014 \u0645\u0627\u0630\u0627 \u062A\u0641\u0639\u0644 \u0627\u0644\u0622\u0646\u061F`,
    action,
    '',
    `_\u0645\u0644\u0627\u062D\u0638\u0629: \u0647\u0630\u0627 \u0631\u062F \u0645\u0646 \u0628\u064A\u0627\u0646\u0627\u062A \u062D\u0633\u0627\u0628\u0643 \u0645\u0628\u0627\u0634\u0631\u0629 (\u0628\u062F\u0648\u0646 \u0646\u0645\u0648\u0630\u062C \u0644\u063A\u0648\u064A) \u0644\u0623\u0646 \u0627\u0644\u0645\u0633\u0627\u0639\u062F \u0627\u0644\u0633\u062D\u0627\u0628\u064A \u063A\u064A\u0631 \u0645\u062A\u0627\u062D \u0645\u0624\u0642\u062A\u0627\u064B._`,
  ];
  return lines.join('\n');
}

function confLabel(c: number | null | undefined): string {
  if (c == null || !Number.isFinite(c)) return '';
  const n = c > 1 ? c / 100 : c;
  const pct = Math.round(Math.max(0, Math.min(1, n)) * 100);
  const level = n >= 0.75 ? 'ثقة عالية' : n >= 0.5 ? 'ثقة متوسطة' : 'ثقة منخفضة';
  return `${level} ${pct}%`;
}

/**
 * Build a plain-Arabic answer from the current diagnosis / task card.
 * Returns null when there is nothing useful to say offline.
 */
export function buildOfflineDiagnosisReply(
  dto: DashboardDTO | null | undefined,
  userMessage: string,
): string | null {
  if (!dto || dto.empty) return null;

  // The question names ONE campaign (by internal id from a dashboard
  // deep-link, or by name)? Answer with that campaign's own numbers —
  // an account-level diagnosis would dodge what was actually asked.
  const namedCampaign = resolveCampaignFromMessage(dto, userMessage);
  if (namedCampaign) return buildCampaignSpecificReply(namedCampaign);

  const task = dto.merchantTasks?.[0];
  const diagnosis = dto.diagnoses?.[0];

  // Prefer whichever source reads as genuine Arabic. merchantTasks may carry
  // half-translated knowledge-base copy ("Pause the lowest-نسبة النقر ads…")
  // while diagnoses (engines/rules/diagnose.ts) are Arabic-first — a broken
  // bilingual answer is worse than a shorter clean one.
  const taskArabic = mostlyArabic(task?.title) && mostlyArabic(task?.why ?? task?.action ?? '');
  const useTask = !!task && (taskArabic || !diagnosis);

  const title = (useTask ? task?.title : diagnosis?.name) || diagnosis?.name || null;
  const why = (useTask ? task?.why : diagnosis?.narrative) || diagnosis?.narrative || null;
  const action = (useTask ? task?.action : diagnosis?.action) || diagnosis?.action || null;
  const expect = useTask ? task?.expect ?? null : null;
  const confidence = (useTask ? task?.confidence : diagnosis?.confidence) ?? diagnosis?.confidence ?? null;

  if (!title || (!why && !action)) return null;

  const conf = confLabel(confidence);
  const lines = [
    `## الوضع`,
    title + (conf ? ` · ${conf}` : ''),
    '',
    `## الدليل / التشخيص`,
    why || 'راجع أرقام لوحة التحكم للتفاصيل.',
    '',
    `## التوصية — ماذا تفعل الآن؟`,
    action || 'افتح المهام في لوحة التحكم وطبّق الخطوة الأولى.',
  ];
  if (expect) {
    lines.push('', `## متى تراجع؟`, expect);
  }
  lines.push(
    '',
    `_ملاحظة: هذا رد من بيانات حسابك مباشرة (بدون نموذج لغوي) لأن المساعد السحابي غير متاح مؤقتاً._`,
  );

  // If the user asked in English, keep Arabic product voice but acknowledge.
  if (!looksArabic(userMessage) && userMessage.trim()) {
    lines.unshift('Here is the current diagnosis from your live account data:', '');
  }

  return lines.join('\n');
}

export function buildAiUnavailableReply(opts: {
  err: unknown;
  dto?: DashboardDTO | null;
  userMessage?: string;
  locale?: 'AR' | 'EN';
}): { reply: string; code: LlmErrorCode; usedOffline: boolean; httpStatus: number } {
  const classified = classifyLlmError(opts.err);
  const locale =
    opts.locale ?? (looksArabic(opts.userMessage || '') ? 'AR' : 'AR');
  const offline = buildOfflineDiagnosisReply(opts.dto ?? null, opts.userMessage || '');
  if (offline) {
    return {
      reply: offline,
      code: classified.code,
      usedOffline: true,
      httpStatus: 200,
    };
  }
  return {
    reply: llmErrorMessage(opts.err, locale),
    code: classified.code,
    usedOffline: false,
    httpStatus: classified.httpStatus,
  };
}
