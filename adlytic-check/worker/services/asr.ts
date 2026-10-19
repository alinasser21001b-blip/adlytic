import { Buffer } from "node:buffer";
import { config, type Bindings } from "../lib";
import { levelDbfs, wavBytes } from "../validation/video";

// Speech-to-text for video checks: Workers AI Whisper (research S12), reached
// through the `AI` binding. Outside production a test double may stand in.
// Statuses are reported to the owner as-is; nothing is guessed.

export type AudioStatus = "no_audio" | "silence" | "speech_transcribed" | "unavailable";

export interface Transcript {
  status: AudioStatus;
  segments: Array<{ start: number; end: number; text: string }>;
}

const SILENCE_DBFS = -50;
const MODEL = "@cf/openai/whisper-large-v3-turbo";

interface AiBinding {
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
}

export async function transcribe(env: Bindings, audio: { pcm: Int16Array } | null, presence: "present" | "no_audio" | "unavailable"): Promise<Transcript> {
  if (presence === "no_audio") return { status: "no_audio", segments: [] };
  if (!audio) return { status: "unavailable", segments: [] };
  if (levelDbfs(audio.pcm) < SILENCE_DBFS) return { status: "silence", segments: [] };
  const base64 = Buffer.from(wavBytes(audio.pcm)).toString("base64");
  const input = { audio: base64, task: "transcribe", vad_filter: true, condition_on_previous_text: false };
  let raw: unknown;
  try {
    const e = env as unknown as Record<string, unknown>;
    const testUrl = !config(env).production ? (e.ASR_BASE_URL as string | undefined) : undefined;
    if (testUrl) {
      const res = await fetch(testUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input), signal: AbortSignal.timeout(20_000) });
      if (!res.ok) return { status: "unavailable", segments: [] };
      raw = await res.json();
    } else if (e.AI && typeof (e.AI as AiBinding).run === "function") {
      raw = await (e.AI as AiBinding).run(MODEL, input);
    } else {
      return { status: "unavailable", segments: [] };
    }
  } catch (err) {
    console.warn(`[asr] failed: ${err instanceof Error ? err.name : "error"}`);
    return { status: "unavailable", segments: [] };
  }
  const r = raw as { segments?: Array<{ start?: number; end?: number; text?: string }>; text?: string };
  const segments = (r.segments ?? [])
    .map((s) => ({ start: Math.max(0, Number(s.start) || 0), end: Math.max(0, Number(s.end) || 0), text: String(s.text ?? "").trim() }))
    .filter((s) => s.text.length > 0)
    .slice(0, 24)
    .map((s) => ({ ...s, start: Math.round(s.start * 10) / 10, end: Math.round(s.end * 10) / 10, text: s.text.slice(0, 220) }));
  if (!segments.length) return { status: "silence", segments: [] };
  return { status: "speech_transcribed", segments };
}
