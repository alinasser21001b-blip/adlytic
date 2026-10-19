import type { AnalysisInput, AnalysisMode, ErrorCode } from "../../shared/schemas";
import type { VisionProvider } from "../providers/vision";
import type { ImageMime } from "../validation/image";

export interface EngineImage {
  mime: ImageMime;
  bytes: Uint8Array;
}

export interface EngineRequest {
  input: Pick<AnalysisInput, "industry" | "goal" | "adCopy" | "audience" | "additionalContext">;
  mode: AnalysisMode;
  image?: EngineImage;
  provider: VisionProvider;
  timeoutMs: number;
  maxOutputTokens: number;
  hooks: EngineHooks;
}

/** The engine owns no storage: callers decide how calls are counted and recorded. */
export interface EngineHooks {
  /** Before every provider call. false = the daily ceiling is reached; a throw fails closed. */
  beforeCall(attempt: number): Promise<boolean>;
  afterCall?(usage: { model: string; inputTokens: number; outputTokens: number }): Promise<void>;
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
}

export type EngineOutcome<R> =
  | { ok: true; report: R; telemetry: EngineTelemetry }
  | { ok: false; code: ErrorCode; reason: string; telemetry: EngineTelemetry };
