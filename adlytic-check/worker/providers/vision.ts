import Anthropic from "@anthropic-ai/sdk";
import { Buffer } from "node:buffer";
import type { ImageMime } from "../validation/image";

export interface VisionRequest {
  system: string;
  userText: string;
  image?: { mime: ImageMime; bytes: Uint8Array };
  /** Several images (video frames); each is preceded by its label as a text block. */
  images?: Array<{ mime: ImageMime; bytes: Uint8Array; label: string }>;
  toolName: string;
  toolDescription: string;
  toolSchema: Record<string, unknown>;
  /** Every tool offered, in a fixed order (identical on every call so the prefix can be cached); `toolName` is the one forced. */
  tools?: Array<{ name: string; description: string; schema: Record<string, unknown> }>;
  /** A second, stable system block (the rule base). With `cache`, tools + system are marked for prompt caching. */
  systemCached?: string;
  cache?: boolean;
  maxTokens: number;
  /** Absolute deadline (epoch ms) for this single call. */
  deadline: number;
}

export type VisionFailure = "timeout" | "unavailable" | "refused" | "no_tool_output" | "rejected_request";

export type VisionResult =
  | {
      ok: true;
      toolInput: unknown;
      model: string;
      inputTokens: number | null;
      outputTokens: number | null;
      /** Prompt-cache usage: tokens written (~1.25× input price) and read (~0.1×). */
      cacheWriteTokens: number | null;
      cacheReadTokens: number | null;
      stopReason: string | null;
    }
  | { ok: false; failure: VisionFailure; status?: number; detail?: string };

/** Classify a provider error without logging request content: type + a coarse reason. */
export function classifyProviderError(err: unknown): string {
  const body = (err as { error?: { error?: { type?: string; message?: string } } })?.error?.error;
  const type = body?.type ?? "unknown_type";
  const msg = body?.message ?? "";
  const reason = /credit balance/i.test(msg)
    ? "credit_balance_too_low"
    : /usage limit|spend limit|reached your/i.test(msg)
      ? "usage_limit_reached"
      : /model/i.test(msg)
        ? "model_not_available"
        : /image/i.test(msg)
          ? "image_rejected"
          : /tool|schema|input_schema/i.test(msg)
            ? "tool_schema_rejected"
            : /max_tokens|token/i.test(msg)
              ? "token_limit"
              : "other";
  return `${type}:${reason}`;
}

/** One small seam so the provider can be swapped later without touching the analysis flow. */
export interface VisionProvider {
  readonly model: string;
  review(req: VisionRequest): Promise<VisionResult>;
}

export function anthropicProvider(opts: { apiKey: string; model: string; baseURL: string }): VisionProvider {
  // Retries are owned by the caller so every real call is counted against the daily ceiling.
  const client = new Anthropic({ apiKey: opts.apiKey, baseURL: opts.baseURL, maxRetries: 0 });
  return {
    model: opts.model,
    async review(req) {
      const remaining = req.deadline - Date.now();
      if (remaining < 2000) return { ok: false, failure: "timeout" };

      const content: Anthropic.ContentBlockParam[] = [];
      for (const img of req.images ?? []) {
        content.push({ type: "text", text: img.label });
        content.push({ type: "image", source: { type: "base64", media_type: img.mime, data: Buffer.from(img.bytes).toString("base64") } });
      }
      if (req.image) {
        content.push({
          type: "image",
          source: { type: "base64", media_type: req.image.mime, data: Buffer.from(req.image.bytes).toString("base64") },
        });
      }
      content.push({ type: "text", text: req.userText });

      try {
        const msg = await client.messages.create(
          {
            model: opts.model,
            max_tokens: req.maxTokens,
            system: req.systemCached
              ? [
                  { type: "text", text: req.system },
                  { type: "text", text: req.systemCached, ...(req.cache ? { cache_control: { type: "ephemeral" as const } } : {}) },
                ]
              : req.system,
            tools: (req.tools ?? [{ name: req.toolName, description: req.toolDescription, schema: req.toolSchema }]).map((t) => ({
              name: t.name,
              description: t.description,
              input_schema: t.schema as Anthropic.Tool.InputSchema,
            })),
            tool_choice: { type: "tool", name: req.toolName },
            messages: [{ role: "user", content }],
          },
          { timeout: remaining },
        );
        if (msg.stop_reason === "refusal") return { ok: false, failure: "refused" };
        const tool = msg.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === req.toolName);
        if (!tool) return { ok: false, failure: "no_tool_output" };
        return {
          ok: true,
          toolInput: tool.input,
          model: msg.model,
          inputTokens: msg.usage?.input_tokens ?? null,
          outputTokens: msg.usage?.output_tokens ?? null,
          cacheWriteTokens: msg.usage?.cache_creation_input_tokens ?? null,
          cacheReadTokens: msg.usage?.cache_read_input_tokens ?? null,
          stopReason: msg.stop_reason ?? null,
        };
      } catch (err) {
        if (err instanceof Anthropic.APIConnectionTimeoutError || err instanceof Anthropic.APIUserAbortError) {
          return { ok: false, failure: "timeout" };
        }
        if (err instanceof Anthropic.APIError) {
          const status = err.status ?? 0;
          // 400/401/403/404: our request or configuration is wrong — retrying will not help.
          const detail = classifyProviderError(err);
          if (status >= 400 && status < 500 && status !== 408 && status !== 409 && status !== 429) {
            console.error(`[vision] provider rejected request status=${status} detail=${detail}`);
            return { ok: false, failure: "rejected_request", status, detail };
          }
          console.error(`[vision] provider unavailable status=${status} detail=${detail}`);
          return { ok: false, failure: "unavailable", status, detail };
        }
        console.error("[vision] unexpected provider error:", err instanceof Error ? err.name : typeof err);
        return { ok: false, failure: "unavailable" };
      }
    },
  };
}
