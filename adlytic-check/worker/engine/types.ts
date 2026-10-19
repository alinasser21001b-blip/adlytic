import type { AnalysisInput, AnalysisMode, ErrorCode } from "../../shared/schemas";
import type { VisionProvider } from "../providers/vision";
import type { ImageMime } from "../validation/image";
import type { Transcript } from "../services/asr";

export interface EngineImage {
  mime: ImageMime;
  bytes: Uint8Array;
}

export interface EngineRequest {
  input: Pick<AnalysisInput, "industry" | "goal" | "adCopy" | "audience" | "additionalContext">;
  mode: AnalysisMode;
  image?: EngineImage;
  /** Video checks: sampled frames (no video file) and the server's transcript of the audio. */
  video?: { durationSec: number; width: number; height: number; frames: Array<EngineImage & { timeSec: number }>; transcript: Transcript };
  provider: VisionProvider;
  timeoutMs: number;
  maxOutputTokens: number;
  hooks: EngineHooks;
  /** Rule base in a cached system block (tools + system identical on every call). */
  promptCache?: boolean;
  /** When the index is shown: a short levels-only second rating, averaged into the index. */
  secondOpinion?: boolean;
}

/** The engine owns no storage: callers decide how calls are counted and recorded. */
export interface EngineHooks {
  /** Before every provider call. false = the daily ceiling is reached; a throw fails closed. */
  beforeCall(attempt: number): Promise<boolean>;
  afterCall?(usage: { model: string; inputTokens: number; outputTokens: number; cacheWriteTokens?: number; cacheReadTokens?: number }): Promise<void>;
}

/** Why an attempt was rejected — a category only, never content. */
export type RepairReason = "schema" | "scaffolding_leak" | "unsupported_facts" | "evidence_link" | "unknown_rule" | "modality";

export interface EngineTelemetry {
  calls: number;
  repairs: RepairReason[];
  inputTokens: number;
  outputTokens: number;
  model: string | null;
  stripped: boolean;
  /** For schema repairs: the first failing field paths (labels/ids only, no ad content). */
  schemaPaths?: string[];
  /** Cosmetic slips fixed before validation (echoed/renumbered ids, unknown labels). */
  tidied?: number;
  /** Prompt-cache tokens across all calls of this check. */
  cacheWriteTokens?: number;
  cacheReadTokens?: number;
  /** The levels-only second rating for the index. */
  secondOpinion?: "ok" | "skipped" | "failed";
}

export type EngineOutcome<R> =
  | { ok: true; report: R; telemetry: EngineTelemetry }
  | { ok: false; code: ErrorCode; reason: string; telemetry: EngineTelemetry };
