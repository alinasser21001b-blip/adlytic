// ════════════════════════════════════════════════════════════════════════
//  src/services/agent/loop.ts
//
//  The AI agent's tool-use loop. Per HTTP request:
//    1. Load conversation history from AiMessage.
//    2. Persist the incoming USER message.
//    3. Call Anthropic with system + history + tools[].
//    4. While stop_reason == 'tool_use':
//         - Dispatch each tool_use block through the ToolDispatcher.
//         - Persist a TOOL message per call.
//         - Feed tool_result blocks back and continue.
//    5. Persist the final ASSISTANT message.
//    6. Return { conversationId, reply, toolCalls[] }.
//
//  Bounds enforced:
//    - MAX_ITERATIONS (6)  → cost & runaway prevention.
//    - MAX_TOKENS   (2048) → per Anthropic response.
//    - Overall Promise.race → 60s hard cap.
//
//  NOTE: This is a synchronous JSON response (no SSE streaming yet). SSE
//  wiring is Phase 2.6 per the design doc §13.
// ════════════════════════════════════════════════════════════════════════

import Anthropic from '@anthropic-ai/sdk';
import { AiMessageRole, Prisma, type PrismaClient, type Locale } from '@prisma/client';
import type { ToolResult } from './envelope';
import type { ToolHandler } from './dispatcher';
import { ToolDispatcher } from './dispatcher';
import { buildAgentToolHandlers } from './tools';
import { handlersToAnthropicTools, type AnthropicToolDef } from './anthropicTools';
import { buildSystemPrompt } from './prompts';
import { postCheckReply, buildRetryNudge } from './postcheck';

/** Bounds — matches PHASE2_AI_AGENT_DESIGN.md §5 */
const MAX_ITERATIONS = 6;
const MAX_TOKENS = 2048;
const MAX_HISTORY_MESSAGES = 40;   // ~20 turn pairs
const OVERALL_TIMEOUT_MS = 60_000;
const ANALYST_MODEL = process.env['CLAUDE_MODEL'] ?? 'claude-sonnet-5';
/** Anti-hallucination rewind attempts before we degrade to fallback. §20. */
const MAX_POSTCHECK_RETRIES = 2;

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env['ANTHROPIC_API_KEY'];
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

export interface RunAgentTurnArgs {
  prisma: PrismaClient;
  workspaceId: string;
  userId: string;
  /** Existing conversation to append to; if null, a new one is created. */
  conversationId: string | null;
  /** The merchant's message. */
  userMessage: string;
  /** Session context envelope (§23) — currently only surfaces to the system prompt. */
  sessionContext?: Record<string, unknown> | undefined;
}

export interface RunAgentTurnResult {
  conversationId: string;
  reply: string;
  /** Tool calls made during the turn — surfaced to the UI for the citation modal. */
  toolCalls: Array<{
    toolName: string;
    args: unknown;
    result: ToolResult<unknown>;
    aiMessageId: string;
  }>;
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
}

/**
 * Run one turn of the AI agent. Persists all state to AiConversation +
 * AiMessage as it goes so a crash mid-loop still leaves an audit trail.
 */
export async function runAgentTurn(args: RunAgentTurnArgs): Promise<RunAgentTurnResult> {
  const { prisma, workspaceId, userId, userMessage } = args;
  const startedAt = Date.now();

  // 1. Load user preferences for the system prompt.
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      locale: true,
      aiLocale: true,
      aiDialect: true,
      aiTerseness: true,
      aiPersonality: true,
    },
  });
  // §32 — reply in the language of THIS message, not the conversation's
  // stored default. A merchant whose account locale defaults to EN (Prisma's
  // schema default, or simply never set) but who types in Arabic must get an
  // Arabic reply — the stored preference is a fallback for language-neutral
  // turns (e.g. "ok" or a pure number), not an override of what they actually
  // wrote this turn.
  const storedLocale: Locale = user.aiLocale ?? user.locale;
  const promptLocale: Locale = detectMessageLocale(userMessage) ?? storedLocale;

  // 2. Load or create conversation.
  let conversationId = args.conversationId;
  if (!conversationId) {
    const created = await prisma.aiConversation.create({
      data: {
        workspaceId,
        userId,
        locale: promptLocale,
        isProactive: false,
      },
    });
    conversationId = created.id;
  }

  // 3. Load message history.
  const historyMessages = await prisma.aiMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
    take: MAX_HISTORY_MESSAGES,
  });

  // 4. Persist the incoming USER message.
  const userMsgRow = await prisma.aiMessage.create({
    data: {
      conversationId,
      role: AiMessageRole.USER,
      content: userMessage,
    },
  });

  // 5. Read account.lastSyncedAt for the staleness hint in the system prompt.
  const account = await prisma.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
    include: { adAccounts: { orderBy: { createdAt: 'asc' }, take: 1 } },
  });
  const stalenessMinutes = account.adAccounts[0]?.lastSyncedAt
    ? Math.round((Date.now() - account.adAccounts[0].lastSyncedAt.getTime()) / 60_000)
    : null;

  // 6. Build dispatcher + Anthropic tool defs.
  const handlers = buildAgentToolHandlers();
  const dispatcher = new ToolDispatcher(
    handlers as unknown as ToolHandler<unknown, unknown>[],
    { prisma, workspaceId, userId },
  );
  const anthropicTools = handlersToAnthropicTools(handlers as unknown as ToolHandler<unknown, unknown>[]);

  // 7. Build the message array Anthropic sees.
  const systemPrompt = buildSystemPrompt({
    locale: promptLocale,
    dialect: user.aiDialect,
    terseness: user.aiTerseness,
    personality: user.aiPersonality,
    stalenessMinutes,
  });

  const anthropicMessages = mapHistoryToAnthropic([
    ...historyMessages,
    userMsgRow,
  ]);

  // 8. Run the loop.
  const client = getClient();
  const toolCallLog: RunAgentTurnResult['toolCalls'] = [];
  let totalTokensIn = 0;
  let totalTokensOut = 0;
  let finalReply = '';
  let iterations = 0;
  let postCheckRetries = 0;

  const overallDeadline = Date.now() + OVERALL_TIMEOUT_MS;

  while (iterations < MAX_ITERATIONS) {
    iterations++;
    if (Date.now() > overallDeadline) {
      finalReply = buildTimeoutReply(promptLocale);
      break;
    }

    const response = await callAnthropicWithTimeout(client, {
      model: ANALYST_MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: anthropicMessages,
      tools: anthropicTools as unknown as Anthropic.Tool[],
    }, overallDeadline - Date.now());

    totalTokensIn += response.usage?.input_tokens ?? 0;
    totalTokensOut += response.usage?.output_tokens ?? 0;

    // Collect text + tool_use blocks from the response.
    const assistantBlocks = response.content;
    const textBlocks = assistantBlocks.filter((b): b is Anthropic.TextBlock => b.type === 'text');
    const toolUseBlocks = assistantBlocks.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');

    // Persist assistant message even when it also contains tool_use blocks.
    // Content = concatenated text (may be empty when the model went straight
    // to tools); toolCallsJson = the tool_use blocks for the audit trail.
    const assistantText = textBlocks.map((b) => b.text).join('\n').trim();
    await prisma.aiMessage.create({
      data: {
        conversationId,
        role: AiMessageRole.ASSISTANT,
        content: assistantText,
        toolCallsJson: toolUseBlocks.length
          ? (toolUseBlocks.map((b) => ({ id: b.id, name: b.name, input: b.input })) as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        model: ANALYST_MODEL,
        tokensIn: response.usage?.input_tokens ?? null,
        tokensOut: response.usage?.output_tokens ?? null,
      },
    });

    // Feed the assistant response back onto the conversation array.
    anthropicMessages.push({
      role: 'assistant',
      content: assistantBlocks as unknown as Anthropic.MessageParam['content'],
    });

    // If Claude wants tools, dispatch them all in parallel (bounded by 5 per iteration).
    if (response.stop_reason === 'tool_use' && toolUseBlocks.length > 0) {
      const capped = toolUseBlocks.slice(0, 5);
      const toolResultBlocks: Anthropic.ToolResultBlockParam[] = [];

      const results = await Promise.all(
        capped.map(async (block) => {
          const result = await dispatcher.dispatch(block.name, block.input as Record<string, unknown>);
          const toolMsg = await prisma.aiMessage.create({
            data: {
              conversationId,
              role: AiMessageRole.TOOL,
              content: '',
              toolResultsJson: { toolName: block.name, toolUseId: block.id, result } as unknown as object,
            },
          });
          toolCallLog.push({
            toolName: block.name,
            args: block.input,
            result,
            aiMessageId: toolMsg.id,
          });
          return { block, result };
        }),
      );

      for (const { block, result } of results) {
        toolResultBlocks.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result),
          ...(!result.ok ? { is_error: true } : {}),
        });
      }

      anthropicMessages.push({
        role: 'user',
        content: toolResultBlocks,
      });

      // Continue the loop — Claude has more to say.
      continue;
    }

    // No tool use requested — this is the (candidate) final answer.
    // Run the anti-hallucination post-check before we ship it.
    if (assistantText) {
      const check = postCheckReply({
        reply: assistantText,
        userMessage,
        toolResults: toolCallLog.map((tc) => ({ toolName: tc.toolName, result: tc.result })),
      });
      if (!check.ok && postCheckRetries < MAX_POSTCHECK_RETRIES) {
        // Rewind: append a system-flavored user message spelling out the
        // offending tokens; loop again for a corrected reply.
        postCheckRetries++;
        console.warn(
          `[ai-agent:postcheck] iteration=${iterations} retry=${postCheckRetries} offenders=${check.offendingTokens.join(',')}`,
        );
        anthropicMessages.push({
          role: 'user',
          content: buildRetryNudge(check.offendingTokens, promptLocale === 'AR' ? 'AR' : 'EN'),
        });
        continue;
      }
      if (!check.ok) {
        // Exhausted retries — degrade to fallback rather than ship claims we can't verify.
        console.error(
          `[ai-agent:postcheck] max_retries_exhausted offenders=${check.offendingTokens.join(',')}`,
        );
        finalReply = buildHallucinationFallback(promptLocale);
        break;
      }
    }

    finalReply = assistantText || buildEmptyReplyPlaceholder(promptLocale);
    break;
  }

  if (iterations >= MAX_ITERATIONS && !finalReply) {
    finalReply = buildBudgetExhaustedReply(promptLocale);
  }

  const latencyMs = Date.now() - startedAt;

  return {
    conversationId,
    reply: finalReply,
    toolCalls: toolCallLog,
    latencyMs,
    tokensIn: totalTokensIn,
    tokensOut: totalTokensOut,
  };
}

// ── history mapping ─────────────────────────────────────────────────────

interface AiMessageRow {
  role: AiMessageRole;
  content: string;
  toolCallsJson: unknown;
  toolResultsJson: unknown;
}

/** Convert stored AiMessage rows back to Anthropic's messages[] shape. TOOL
 *  messages become user messages with a tool_result block; ASSISTANT
 *  messages preserve their original text + tool_use blocks. */
function mapHistoryToAnthropic(rows: AiMessageRow[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  for (const row of rows) {
    if (row.role === AiMessageRole.USER) {
      out.push({ role: 'user', content: row.content });
    } else if (row.role === AiMessageRole.ASSISTANT) {
      const blocks: Anthropic.ContentBlockParam[] = [];
      if (row.content) blocks.push({ type: 'text', text: row.content });
      const tc = row.toolCallsJson as Array<{ id: string; name: string; input: unknown }> | null;
      if (tc && tc.length > 0) {
        for (const t of tc) {
          blocks.push({ type: 'tool_use', id: t.id, name: t.name, input: t.input as Record<string, unknown> });
        }
      }
      if (blocks.length > 0) out.push({ role: 'assistant', content: blocks });
    } else if (row.role === AiMessageRole.TOOL) {
      const tr = row.toolResultsJson as { toolName: string; toolUseId: string; result: ToolResult<unknown> } | null;
      if (!tr) continue;
      out.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: tr.toolUseId,
            content: JSON.stringify(tr.result),
            ...(!tr.result.ok ? { is_error: true } : {}),
          },
        ],
      });
    }
    // SYSTEM rows: skip; system prompt is passed separately.
  }
  return out;
}

// ── Anthropic call with per-request timeout ─────────────────────────────

async function callAnthropicWithTimeout(
  client: Anthropic,
  params: Anthropic.MessageCreateParamsNonStreaming,
  timeoutMs: number,
): Promise<Anthropic.Message> {
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('anthropic_timeout')), Math.max(1000, timeoutMs)),
  );
  return Promise.race([
    client.messages.create(params),
    timeoutPromise,
  ]);
}

// ── graceful reply templates ────────────────────────────────────────────

function buildTimeoutReply(locale: Locale): string {
  return locale === 'AR'
    ? 'أخذت وقتاً أكثر من المتوقع في التحليل. جرب سؤالاً أضيق نطاقاً أو أعد المحاولة بعد لحظة.'
    : 'That took longer than expected. Please try a narrower question or retry in a moment.';
}

function buildBudgetExhaustedReply(locale: Locale): string {
  return locale === 'AR'
    ? 'أعطيتك أقصى تحليل ممكن الآن. سؤال أضيق سيسمح لي بالتعمق أكثر.'
    : "I've reached the analysis budget for this turn. A narrower question would let me go deeper.";
}

/**
 * Detect the language of a single message. Returns null when the message is
 * too short or too neutral to tell (e.g. "ok", "5", an emoji) — callers
 * should fall back to the stored preference in that case rather than force
 * a locale from no evidence.
 *
 * Threshold-based, not a full language-ID model: counts Arabic-block
 * characters vs Latin letters and requires a clear majority (not just one
 * stray character) before overriding the stored default.
 */
function detectMessageLocale(message: string): Locale | null {
  const arabicChars = message.match(/[؀-ۿ]/g)?.length ?? 0;
  const latinChars = message.match(/[a-zA-Z]/g)?.length ?? 0;
  const total = arabicChars + latinChars;
  if (total < 3) return null;   // too little signal — don't override
  if (arabicChars > latinChars) return 'AR' as Locale;
  if (latinChars > arabicChars) return 'EN' as Locale;
  return null;   // tie — ambiguous, defer to stored preference
}

function buildEmptyReplyPlaceholder(locale: Locale): string {
  return locale === 'AR'
    ? 'ما لديّ رد نصي هذه المرة — راجع الأدوات المستدعاة في الجانب.'
    : 'No text reply produced — see the tool calls in the side panel.';
}

/** Final fallback when the anti-hallucination check keeps failing.
 *  Better to say "I can't answer cleanly" than to ship claims we can't verify. */
function buildHallucinationFallback(locale: Locale): string {
  return locale === 'AR'
    ? 'ما قدرت أعطيك جواباً بأرقام موثوقة الآن. جرب سؤالاً أضيق أو أعد المحاولة، وسأتحقق مرة أخرى من البيانات.'
    : "I couldn't produce a numerically verifiable answer this turn. Please narrow the question or try again.";
}
