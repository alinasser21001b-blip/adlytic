import { HttpError } from "../lib";
import { sniffImage, type ImageMime } from "./image";

// A video check never uploads the video. The browser samples frames (JPEG) with
// their timestamps and, when the file has sound, a 16 kHz mono 16-bit WAV of
// the audio track. The Worker validates both strictly and keeps nothing.

export const VIDEO_LIMITS = {
  maxDurationSec: 60.5,
  maxFrames: 12,
  frameBytes: 400 * 1024,
  audioBytes: Math.ceil(61 * 16_000 * 2 + 1024),
  requestBytes: 6 * 1024 * 1024,
} as const;

export type AudioPresence = "present" | "no_audio" | "unavailable";

export interface VideoFrame {
  timeSec: number;
  mime: ImageMime;
  bytes: Uint8Array;
}

export interface VideoInput {
  durationSec: number;
  width: number;
  height: number;
  frames: VideoFrame[];
  audio: { pcm: Int16Array; seconds: number } | null;
  audioPresence: AudioPresence;
}

interface Meta {
  durationSec?: unknown;
  width?: unknown;
  height?: unknown;
  frameTimes?: unknown;
  audio?: unknown;
}

const bad = () => new HttpError(400, "INVALID_INPUT");

export async function parseVideo(form: FormData): Promise<VideoInput> {
  let meta: Meta;
  try {
    meta = JSON.parse(String(form.get("video_meta") ?? ""));
  } catch {
    throw bad();
  }
  const durationSec = Number(meta.durationSec);
  const width = Number(meta.width);
  const height = Number(meta.height);
  const times = Array.isArray(meta.frameTimes) ? meta.frameTimes.map(Number) : [];
  const presence = meta.audio === "present" || meta.audio === "no_audio" ? meta.audio : "unavailable";
  if (!(durationSec > 0) || durationSec > VIDEO_LIMITS.maxDurationSec) throw new HttpError(413, "FILE_TOO_LARGE");
  if (!(width > 0 && width <= 8192 && height > 0 && height <= 8192)) throw bad();
  if (times.length < 1 || times.length > VIDEO_LIMITS.maxFrames) throw bad();
  for (let i = 0; i < times.length; i++) {
    const t = times[i]!;
    if (!Number.isFinite(t) || t < 0 || t > durationSec + 0.5 || (i > 0 && t <= times[i - 1]!)) throw bad();
  }
  const frames: VideoFrame[] = [];
  for (let i = 0; i < times.length; i++) {
    const f = form.get(`frame${i}`);
    if (!f || typeof f === "string" || f.size === 0) throw bad();
    if (f.size > VIDEO_LIMITS.frameBytes) throw new HttpError(413, "FILE_TOO_LARGE");
    const bytes = new Uint8Array(await f.arrayBuffer());
    const kind = sniffImage(bytes);
    if (kind !== "image/jpeg" && kind !== "image/png" && kind !== "image/webp") throw new HttpError(415, "UNSUPPORTED_FILE");
    frames.push({ timeSec: Math.round(times[i]! * 10) / 10, mime: kind, bytes });
  }
  let audio: VideoInput["audio"] = null;
  const a = form.get("audio");
  if (presence === "present") {
    if (!a || typeof a === "string") throw bad();
    if (a.size > VIDEO_LIMITS.audioBytes) throw new HttpError(413, "FILE_TOO_LARGE");
    audio = parseWav16kMono(new Uint8Array(await a.arrayBuffer()));
    if (audio.seconds > durationSec + 1) throw bad();
  }
  return { durationSec: Math.round(durationSec * 10) / 10, width, height, frames, audio, audioPresence: presence };
}

/** Accepts only PCM, 1 channel, 16 000 Hz, 16-bit — exactly what the client produces. */
export function parseWav16kMono(b: Uint8Array): { pcm: Int16Array; seconds: number } {
  const ascii = (o: number, n: number) => String.fromCharCode(...b.subarray(o, o + n));
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (b.length < 44 || ascii(0, 4) !== "RIFF" || ascii(8, 4) !== "WAVE") throw new HttpError(415, "UNSUPPORTED_FILE");
  let off = 12;
  let fmtOk = false;
  while (off + 8 <= b.length) {
    const id = ascii(off, 4);
    const size = dv.getUint32(off + 4, true);
    const body = off + 8;
    if (id === "fmt ") {
      const format = dv.getUint16(body, true);
      const channels = dv.getUint16(body + 2, true);
      const rate = dv.getUint32(body + 4, true);
      const bits = dv.getUint16(body + 14, true);
      fmtOk = format === 1 && channels === 1 && rate === 16_000 && bits === 16;
      if (!fmtOk) throw new HttpError(415, "UNSUPPORTED_FILE");
    } else if (id === "data") {
      if (!fmtOk || body + size > b.length || size % 2) throw new HttpError(415, "UNSUPPORTED_FILE");
      const pcm = new Int16Array(b.buffer.slice(b.byteOffset + body, b.byteOffset + body + size));
      return { pcm, seconds: pcm.length / 16_000 };
    }
    off = body + size + (size % 2);
  }
  throw new HttpError(415, "UNSUPPORTED_FILE");
}

/** Root-mean-square level in dBFS, measured by the server (the client's claim is not trusted). */
export function levelDbfs(pcm: Int16Array): number {
  if (!pcm.length) return -120;
  let sum = 0;
  // Every 4th sample is plenty for a level estimate and keeps CPU low.
  let n = 0;
  for (let i = 0; i < pcm.length; i += 4) {
    const v = pcm[i]! / 32768;
    sum += v * v;
    n++;
  }
  const rms = Math.sqrt(sum / n);
  return rms > 0 ? 20 * Math.log10(rms) : -120;
}

export function wavBytes(pcm: Int16Array): Uint8Array {
  const out = new Uint8Array(44 + pcm.byteLength);
  const dv = new DataView(out.buffer);
  const w = (o: number, s: string) => [...s].forEach((ch, i) => (out[o + i] = ch.charCodeAt(0)));
  w(0, "RIFF");
  dv.setUint32(4, 36 + pcm.byteLength, true);
  w(8, "WAVE");
  w(12, "fmt ");
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, 1, true);
  dv.setUint32(24, 16_000, true);
  dv.setUint32(28, 32_000, true);
  dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true);
  w(36, "data");
  dv.setUint32(40, pcm.byteLength, true);
  out.set(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength), 44);
  return out;
}
