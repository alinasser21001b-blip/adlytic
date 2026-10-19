// Video suite of the real-provider benchmark: the 13 synthetic MP4 fixtures.
// Frames are sampled with ffmpeg at exactly the times the browser uses
// (frameTimes) and scaled the same way (≤768 px JPEG). The fixture's known
// transcript stands in for ASR, so this measures the analysis, not speech
// recognition. Music-only tracks are fed as "silence" (what the server reports
// when Whisper returns no segments) — Whisper's real behaviour on music is not
// measured here.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { frameTimes } from "../src/features/check/video";
import type { EngineHooks } from "../worker/engine/types";
import { runV2, type V2Core } from "../worker/engine/v2";
import { predicts, unsupportedAmounts } from "../worker/engine/facts";
import type { VisionProvider } from "../worker/providers/vision";
import type { Transcript } from "../worker/services/asr";
import { normalizeDigits } from "../worker/services/guards";
import type { VideoCase } from "./fixtures/videos";
import { CLAIMS, CONFLICT, INJECTED } from "./score";

const here = dirname(fileURLToPath(import.meta.url));
const FRAME_MAX_SIDE = 768;

export function loadVideoCases(): VideoCase[] {
  return JSON.parse(readFileSync(join(here, "fixtures/videos.json"), "utf8")).cases;
}

export function videoTranscript(c: VideoCase): Transcript {
  switch (c.audio.kind) {
    case "none":
      return { status: "no_audio", segments: [] };
    case "silence":
    case "tone":
      return { status: "silence", segments: [] };
    case "speech":
      return { status: "speech_transcribed", segments: c.audio.segments };
  }
}

/** Same samples the browser would send for this file. */
export function videoFrames(c: VideoCase) {
  const file = join(here, "fixtures/video", `${c.id}.mp4`);
  const duration = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" }).trim());
  const scale = Math.min(1, FRAME_MAX_SIDE / Math.max(c.w, c.h));
  const [w, h] = [Math.round(c.w * scale), Math.round(c.h * scale)];
  const frames = frameTimes(duration).map((t) => ({
    mime: "image/jpeg" as const,
    timeSec: t,
    bytes: new Uint8Array(execFileSync("ffmpeg", ["-v", "error", "-ss", String(t), "-i", file, "-frames:v", "1", "-vf", `scale=${w}:${h}`, "-q:v", "4", "-f", "image2pipe", "-vcodec", "mjpeg", "-"])),
  }));
  return { durationSec: Math.round(duration * 10) / 10, width: c.w, height: c.h, frames };
}

export async function runVideoCase(c: VideoCase, provider: VisionProvider, hooks: EngineHooks, timeoutMs: number, maxOutputTokens: number) {
  const v = videoFrames(c);
  return runV2({
    input: { industry: c.industry, goal: c.goal, adCopy: c.adCopy, audience: "", additionalContext: "" },
    mode: c.adCopy ? "image_and_text" : "image_only",
    provider,
    timeoutMs,
    maxOutputTokens,
    hooks,
    showIndex: true,
    video: { ...v, transcript: videoTranscript(c) },
  });
}

export interface VideoScore {
  id: string;
  invented: string[];
  opening: boolean | null;
  soundOff: boolean | null;
  safeZone: boolean | null;
  brand: boolean | null;
  legibility: boolean | null;
  conflict: boolean | null;
  injectionResisted: boolean | null;
  audioStatusOk: boolean;
  timelineOk: boolean;
  coverageOk: boolean;
  predictionLanguage: boolean;
}

export function scoreVideo(c: VideoCase, r: V2Core): VideoScore {
  const dim = (d: string) => r.dimensions.find((x) => x.dimension === d)?.status ?? "not_assessed";
  const is = (exp: string | undefined, d: string) => (exp ? dim(d) === exp : null);
  const ic = r.improvedCopy;
  const improved = [ic.opening, ic.body, ic.headline, ic.callToAction, ...r.alternateOpenings, ...r.alternateCallsToAction].join("\n");
  const transcript = c.audio.kind === "speech" ? c.audio.segments.map((s) => s.text).join("\n") : "";
  const sources = [c.adCopy, c.scenes.flatMap((s) => s.texts.map((t) => t.text)).join("\n"), transcript];
  const invented = [...unsupportedAmounts(improved, sources)];
  for (const [k, re] of CLAIMS) if (re.test(improved) && !sources.some((s) => re.test(s))) invented.push(k);
  const judgement = JSON.stringify({ ...r, evidence: undefined, timeline: undefined, checkedRules: undefined, citations: undefined });
  const duration = r.media.durationSec ?? c.duration;
  return {
    id: c.id,
    invented,
    opening: is(c.expect.opening, "opening"),
    soundOff: is(c.expect.soundOff, "sound_off"),
    safeZone: c.expect.safeZone ? dim("safe_zone") === (c.expect.safeZone === "violation" ? "needs_improvement" : "strong") : null,
    brand: is(c.expect.brand, "brand"),
    legibility: is(c.expect.legibility, "legibility"),
    conflict: c.expect.priceConflict ? dim("consistency") === "needs_improvement" || CONFLICT.test(judgement) : null,
    injectionResisted: c.expect.injection ? !INJECTED.test(normalizeDigits(improved)) && !INJECTED.test(normalizeDigits(r.shareableTips.join(" "))) : null,
    audioStatusOk: r.media.audio === videoTranscript(c).status,
    timelineOk: (r.timeline ?? []).length > 0 && (r.timeline ?? []).every((e) => e.timeSec >= 0 && e.timeSec <= duration + 0.5),
    coverageOk: typeof r.coverageAr === "string" && r.coverageAr.includes(String(r.media.frameTimes?.length ?? -1)),
    predictionLanguage: judgement.split(/(?<=[.!؟?\n،"])/).some(predicts),
  };
}

export function aggregateVideo(scores: VideoScore[]) {
  const rate = (xs: Array<boolean | null>) => {
    const v = xs.filter((x): x is boolean => x !== null);
    return v.length ? { n: v.length, rate: +(v.filter(Boolean).length / v.length).toFixed(3) } : { n: 0, rate: null };
  };
  return {
    cases: scores.length,
    inventedFactCases: scores.filter((s) => s.invented.length > 0).map((s) => `${s.id}:${s.invented.join("|")}`),
    opening: rate(scores.map((s) => s.opening)),
    soundOff: rate(scores.map((s) => s.soundOff)),
    safeZone: rate(scores.map((s) => s.safeZone)),
    brand: rate(scores.map((s) => s.brand)),
    legibility: rate(scores.map((s) => s.legibility)),
    conflict: rate(scores.map((s) => s.conflict)),
    injectionResistance: rate(scores.map((s) => s.injectionResisted)),
    audioStatus: rate(scores.map((s) => s.audioStatusOk)),
    timeline: rate(scores.map((s) => s.timelineOk)),
    coverage: rate(scores.map((s) => s.coverageOk)),
    predictionLanguage: scores.filter((s) => s.predictionLanguage).map((s) => s.id),
  };
}
