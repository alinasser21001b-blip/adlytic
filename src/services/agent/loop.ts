// ════════════════════════════════════════════════════════════════════════
//  src/services/agent/loop.ts
//
//  The AI agent's tool-use loop. Per HTTP request:
//    1. Load conversation history from AiMessage.
//    2. Persist the incoming USER message.
//    3. Call AI with system + history + tools[].
//    4. While finishReason == 'tool_calls':
//         - Dispatch each tool call through the ToolDispatcher.
//         - Persist a TOOL message per call.
//         - Feed tool results back and continue.
//    5. Persist the final ASSISTANT message.
//    6. Return { conversationId, reply, toolCalls[] }.
//
//  Provider-agnostic — routes through AIService → ProviderManager.
//  Switching between OpenAI and Anthropic requires only env var changes.
//
//  Bounds enforced:
//    - MAX_ITERATIONS (5)  → cost & runaway prevention.
//    - MAX_TOKENS   (2048) → per AI response.
//    - Overall deadline    → 45s hard cap.
// ════════════════════════════════════════════════════════════════════════

import { AiMessageRole, Prisma, type PrismaClient, type Locale } from '@prisma/client';
import type { ToolResult } from './envelope';
import type { ToolHandler } from './dispatcher';
import { ToolDispatcher } from './dispatcher';
import { buildAgentToolHandlers } from './tools';
import { handlersToAIToolDefs } from './agentTools';
import { buildSystemPrompt } from './prompts';
import { postCheckReply, buildRetryNudge } from './postcheck';
import {
  generateText,
  generateWithTools,
  isAIAvailable,
  type AIMessage,
  type AIToolDef,
  type AIToolCall,
} from '../ai/aiService';
import { getActiveProviderName } from '../ai/providerManager';

const MAX_ITERATIONS = 4;
const MAX_TOKENS = 2048;
// Resent on every turn — keep the window tight to hold input tokens (and cost)
// down. 16 messages ≈ 8 exchanges, ample context for a support chat.
const MAX_HISTORY_MESSAGES = 16;
const OVERALL_TIMEOUT_MS = 45_000;
const MAX_POSTCHECK_RETRIES = 2;

const SYNTHESIS_NUDGE_AR =
  'لديك الآن نتائج الأدوات. اكتب الرد النهائي للتاجر الآن فقط — بدون استدعاء أدوات جديدة. استخدم الهيكل: الوضع | الدليل | التشخيص | التوصية | الثقة. كل رقم يجب أن يظهر في نتائج الأدوات.';
const SYNTHESIS_NUDGE_EN =
  'You now have tool results. Write the final merchant-facing answer NOW — no more tool calls. Use: Situation | Evidence | Diagnosis | Recommendation | Confidence. Every number must appear in the tool results.';

export interface RunAgentTurnArgs {
  prisma: PrismaClient;
  workspaceId: string;
  userId: string;
  conversationId: string | null;
  userMessage: string;
  sessionContext?: Record<string, unknown> | undefined;
}

export interface RunAgentTurnResult {
  conversationId: string;
  reply: string;
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

export async function runAgentTurn(args: RunAgentTurnArgs): Promise<RunAgentTurnResult> {
  const { prisma, workspaceId, userId, userMessage } = args;
  const startedAt = Date.now();

  if (!isAIAvailable()) {
    throw new Error('No AI provider configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY.');
  }

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

  const storedLocale: Locale = user.aiLocale ?? user.locale;
  const promptLocale: Locale = detectMessageLocale(userMessage) ?? storedLocale;

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

  const historyDesc = await prisma.aiMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'desc' },
    take: MAX_HISTORY_MESSAGES,
  });
  const historyMessages = historyDesc.reverse();

  const userMsgRow = await prisma.aiMessage.create({
    data: {
      conversationId,
      role: AiMessageRole.USER,
      content: userMessage,
    },
  });

  const account = await prisma.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
    include: { adAccounts: { orderBy: { createdAt: 'asc' }, take: 1 } },
  });
  const stalenessMinutes = account.adAccounts[0]?.lastSyncedAt
    ? Math.round((Date.now() - account.adAccounts[0].lastSyncedAt.getTime()) / 60_000)
    : null;

  const handlers = buildAgentToolHandlers();
  const dispatcher = new ToolDispatcher(
    handlers as unknown as ToolHandler<unknown, unknown>[],
    { prisma, workspaceId, userId },
  );
  const toolDefs = handlersToAIToolDefs(handlers as unknown as ToolHandler<unknown, unknown>[]);

  const systemPrompt = buildSystemPrompt({
    locale: promptLocale,
    dialect: user.aiDialect,
    terseness: user.aiTerseness,
    personality: user.aiPersonality,
    stalenessMinutes,
  });

  const messages: AIMessage[] = mapHistoryToMessages([
    ...historyMessages,
    userMsgRow,
  ]);

  const modelName = getActiveProviderName('chat-agent');
  const toolCallLog: RunAgentTurnResult['toolCalls'] = [];
  let totalTokensIn = 0;
  let totalTokensOut = 0;
  let finalReply = '';
  let iterations = 0;
  let postCheckRetries = 0;
  let synthesisForced = false;
  let toolRounds = 0;

  const overallDeadline = Date.now() + OVERALL_TIMEOUT_MS;

  while (iterations < MAX_ITERATIONS) {
    iterations++;
    if (Date.now() > overallDeadline) {
      finalReply = buildTimeoutReply(promptLocale);
      break;
    }

    const forceTextOnly = synthesisForced || toolRounds >= 2;
    const remainingMs = overallDeadline - Date.now();

    let responseText: string;
    let responseToolCalls: AIToolCall[] = [];
    let responseTokensIn = 0;
    let responseTokensOut = 0;
    let finishReason: string;

    if (forceTextOnly) {
      const response = await generateText({
        task: 'chat-agent',
        system: systemPrompt,
        messages,
        maxTokens: MAX_TOKENS,
        timeoutMs: remainingMs,
      });
      responseText = response.text;
      responseTokensIn = response.tokensIn;
      responseTokensOut = response.tokensOut;
      finishReason = response.finishReason;
    } else {
      const response = await generateWithTools({
        task: 'chat-agent',
        system: systemPrompt,
        messages,
        tools: toolDefs,
        maxTokens: MAX_TOKENS,
        timeoutMs: remainingMs,
      });
      responseText = response.text;
      responseToolCalls = response.toolCalls;
      responseTokensIn = response.tokensIn;
      responseTokensOut = response.tokensOut;
      finishReason = response.finishReason;
    }

    totalTokensIn += responseTokensIn;
    totalTokensOut += responseTokensOut;

    const assistantText = responseText.trim();

    await prisma.aiMessage.create({
      data: {
        conversationId,
        role: AiMessageRole.ASSISTANT,
        content: assistantText,
        toolCallsJson: responseToolCalls.length
          ? (responseToolCalls.map((tc) => ({ id: tc.id, name: tc.name, input: tc.arguments })) as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        model: modelName,
        tokensIn: responseTokensIn,
        tokensOut: responseTokensOut,
      },
    });

    messages.push({ role: 'assistant', content: assistantText });

    if (finishReason === 'tool_calls' && responseToolCalls.length > 0) {
      toolRounds++;
      const capped = responseToolCalls.slice(0, 4);

      const results = await Promise.all(
        capped.map(async (tc) => {
          const result = await dispatcher.dispatch(tc.name, tc.arguments);
          const toolMsg = await prisma.aiMessage.create({
            data: {
              conversationId,
              role: AiMessageRole.TOOL,
              content: '',
              toolResultsJson: { toolName: tc.name, toolUseId: tc.id, result } as unknown as object,
            },
          });
          toolCallLog.push({
            toolName: tc.name,
            args: tc.arguments,
            result,
            aiMessageId: toolMsg.id,
          });
          return { tc, result };
        }),
      );

      for (const { tc, result } of results) {
        messages.push({
          role: 'tool',
          content: JSON.stringify(result),
          toolCallId: tc.id,
        });
      }

      if (toolCallLog.some((t) => t.result.ok) && !synthesisForced) {
        synthesisForced = true;
        messages.push({
          role: 'user',
          content: promptLocale === 'AR' ? SYNTHESIS_NUDGE_AR : SYNTHESIS_NUDGE_EN,
        });
      }

      continue;
    }

    if (!assistantText && toolCallLog.length > 0 && !synthesisForced) {
      synthesisForced = true;
      messages.push({
        role: 'user',
        content: promptLocale === 'AR' ? SYNTHESIS_NUDGE_AR : SYNTHESIS_NUDGE_EN,
      });
      continue;
    }

    if (assistantText) {
      const check = postCheckReply({
        reply: assistantText,
        userMessage,
        toolResults: toolCallLog.map((tc) => ({ toolName: tc.toolName, result: tc.result })),
      });
      if (!check.ok && postCheckRetries < MAX_POSTCHECK_RETRIES) {
        postCheckRetries++;
        console.warn(
          `[ai-agent:postcheck] iteration=${iterations} retry=${postCheckRetries} offenders=${check.offendingTokens.join(',')}`,
        );
        messages.push({
          role: 'user',
          content: buildRetryNudge(check.offendingTokens, promptLocale === 'AR' ? 'AR' : 'EN'),
        });
        continue;
      }
      if (!check.ok) {
        console.error(
          `[ai-agent:postcheck] max_retries_exhausted offenders=${check.offendingTokens.join(',')}`,
        );
        finalReply = synthesizeReplyFromTools(toolCallLog, promptLocale, userMessage)
          || buildHallucinationFallback(promptLocale);
        break;
      }
    }

    finalReply = assistantText
      || synthesizeReplyFromTools(toolCallLog, promptLocale, userMessage)
      || buildEmptyReplyPlaceholder(promptLocale);
    break;
  }

  if (iterations >= MAX_ITERATIONS && !finalReply) {
    finalReply = synthesizeReplyFromTools(toolCallLog, promptLocale, userMessage)
      || buildBudgetExhaustedReply(promptLocale);
  }
  if (!finalReply.trim()) {
    finalReply = synthesizeReplyFromTools(toolCallLog, promptLocale, userMessage)
      || buildEmptyReplyPlaceholder(promptLocale);
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

function mapHistoryToMessages(rows: AiMessageRow[]): AIMessage[] {
  const out: AIMessage[] = [];
  for (const row of rows) {
    if (row.role === AiMessageRole.USER) {
      out.push({ role: 'user', content: row.content });
    } else if (row.role === AiMessageRole.ASSISTANT) {
      out.push({ role: 'assistant', content: row.content });
    } else if (row.role === AiMessageRole.TOOL) {
      const tr = row.toolResultsJson as { toolName: string; toolUseId: string; result: ToolResult<unknown> } | null;
      if (!tr) continue;
      out.push({
        role: 'tool',
        content: JSON.stringify(tr.result),
        toolCallId: tr.toolUseId,
      });
    }
  }
  return out;
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

function detectMessageLocale(message: string): Locale | null {
  const arabicChars = message.match(/[؀-ۿ]/g)?.length ?? 0;
  const latinChars = message.match(/[a-zA-Z]/g)?.length ?? 0;
  const total = arabicChars + latinChars;
  if (total < 3) return null;
  if (arabicChars > latinChars) return 'AR' as Locale;
  if (latinChars > arabicChars) return 'EN' as Locale;
  return null;
}

function buildEmptyReplyPlaceholder(locale: Locale): string {
  return locale === 'AR'
    ? 'راجعت البيانات لكن لم أستطع صياغة ملخص موثوق الآن. أعد السؤال بشكل أضيق (حملة واحدة أو مؤشر واحد) وسأجيب مباشرة.'
    : "I reviewed the data but couldn't form a reliable summary this turn. Ask a narrower question (one campaign or one metric) and I'll answer directly.";
}

function buildHallucinationFallback(locale: Locale): string {
  return locale === 'AR'
    ? 'ما قدرت أعطيك جواباً بأرقام موثوقة الآن. جرب سؤالاً أضيق أو أعد المحاولة، وسأتحقق مرة أخرى من البيانات.'
    : "I couldn't produce a numerically verifiable answer this turn. Please narrow the question or try again.";
}

function synthesizeReplyFromTools(
  toolCalls: RunAgentTurnResult['toolCalls'],
  locale: Locale,
  userMessage: string,
): string {
  const okCalls = toolCalls.filter((tc) => tc.result.ok);
  if (okCalls.length === 0) return '';

  const ar = locale === 'AR';
  const lines: string[] = [];
  lines.push(ar ? '**الوضع**' : '**Situation**');
  lines.push(ar
    ? `سألت عن: «${trimForReply(userMessage, 120)}». راجعت ${okCalls.length} مصدر بيانات من حسابك.`
    : `You asked: "${trimForReply(userMessage, 120)}". I reviewed ${okCalls.length} data sources from your account.`);

  const evidence: string[] = [];
  for (const tc of okCalls) {
    const snippet = summarizeToolData(tc.toolName, tc.result, ar);
    if (snippet) evidence.push(snippet);
  }
  if (evidence.length) {
    lines.push('');
    lines.push(ar ? '**الدليل**' : '**Evidence**');
    for (const e of evidence.slice(0, 5)) lines.push(`• ${e}`);
  }

  lines.push('');
  lines.push(ar ? '**التشخيص**' : '**Diagnosis**');
  const anomaly = okCalls.find((tc) => tc.toolName === 'detect_anomaly');
  if (anomaly && anomaly.result.ok) {
    const data = anomaly.result.data as Record<string, unknown>;
    const flags = Array.isArray(data['flags']) ? data['flags'] : Array.isArray(data['anomalies']) ? data['anomalies'] : [];
    if (flags.length > 0) {
      lines.push(ar
        ? 'ظهرت إشارات غير طبيعية في الأداء — راجع الحملات التي تنفق دون نتائج كافية أو التي انخفض تفاعلها.'
        : 'Anomaly signals appeared — review campaigns with spend and weak results, or declining engagement.');
    } else {
      lines.push(ar
        ? 'لم يظهر شذوذ حاد في الفحص السريع؛ قد يكون التراجع ضمن تقلب طبيعي أو مرتبط بإبداع/جمهور محدد.'
        : 'No sharp anomaly in the quick scan; the drop may be normal variance or tied to a specific creative/audience.');
    }
  } else {
    lines.push(ar
      ? 'البيانات متوفرة لكن تحتاج تفسيراً أعمق لحملة محددة للحصول على سبب أدق.'
      : 'Data is available, but a specific campaign question would yield a sharper root cause.');
  }

  lines.push('');
  lines.push(ar ? '**التوصية**' : '**Recommendation**');
  lines.push(ar
    ? 'حدّد حملة واحدة تعمل الآن واسأل: «لماذا انخفض تفاعل [اسم الحملة]؟» — سأقارن الفترة الحالية بالسابقة وأعطيك خطوة واحدة واضحة.'
    : 'Pick one currently delivering campaign and ask: "Why did engagement drop on [campaign name]?" — I will compare periods and give one clear next step.');

  lines.push('');
  lines.push(ar ? '**الثقة**' : '**Confidence**');
  lines.push(ar
    ? 'متوسطة — ملخص مبني على نتائج الأدوات دون صياغة نموذج كاملة.'
    : 'Medium — summary grounded in tool results without a full model narrative.');

  return lines.join('\n');
}

function trimForReply(s: string, max: number): string {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : t.slice(0, max - 1) + '…';
}

function summarizeToolData(toolName: string, result: ToolResult<unknown>, ar: boolean): string | null {
  if (!result.ok) return null;
  const data = result.data as Record<string, unknown> | unknown[] | null;
  if (data == null) return null;

  if (toolName === 'list_campaigns' && Array.isArray(data)) {
    return ar
      ? `قائمة الحملات: ${data.length} حملة في النطاق`
      : `Campaign list: ${data.length} campaigns in scope`;
  }
  if (toolName === 'list_campaigns' && data && typeof data === 'object' && !Array.isArray(data)) {
    const campaigns = (data as { campaigns?: unknown[] }).campaigns;
    if (Array.isArray(campaigns)) {
      return ar
        ? `قائمة الحملات: ${campaigns.length} حملة في النطاق`
        : `Campaign list: ${campaigns.length} campaigns in scope`;
    }
  }
  if (toolName === 'get_campaign_details' && data && typeof data === 'object' && !Array.isArray(data)) {
    const name = String((data as { name?: string }).name || (data as { campaignName?: string }).campaignName || '').trim();
    const ctr = (data as { ctr?: number; metrics?: { ctr?: number } }).ctr
      ?? (data as { metrics?: { ctr?: number } }).metrics?.ctr;
    const parts: string[] = [];
    if (name) parts.push(ar ? `الحملة «${name}»` : `Campaign "${name}"`);
    if (typeof ctr === 'number' && Number.isFinite(ctr)) {
      parts.push(ar ? `تفاعل الإعلان (CTR) ${ctr}` : `CTR ${ctr}`);
    }
    return parts.length ? parts.join(' — ') : (ar ? 'تم جلب تفاصيل حملة' : 'Campaign details loaded');
  }
  if (toolName === 'detect_anomaly') {
    return ar ? 'تم فحص الشذوذ على الأداء' : 'Anomaly scan completed';
  }
  if (toolName === 'compare_periods') {
    return ar ? 'تمت مقارنة الفترة الحالية بالسابقة' : 'Current vs prior period compared';
  }
  if (toolName === 'rank_campaigns') {
    return ar ? 'تم ترتيب الحملات حسب الأداء' : 'Campaigns ranked by performance';
  }
  if (toolName === 'get_creative_performance') {
    return ar ? 'تم تحليل أداء الإبداعات' : 'Creative performance analyzed';
  }
  if (toolName === 'get_audience_breakdown') {
    return ar ? 'تم تحليل توزيع الجمهور/المواضع' : 'Audience/placement breakdown analyzed';
  }
  if (toolName === 'lookup_knowledge') {
    return ar ? 'تمت مراجعة مرجع المعايير الصناعية' : 'Industry knowledge reference consulted';
  }
  return ar ? `أداة ${toolName} اكتملت` : `Tool ${toolName} completed`;
}
