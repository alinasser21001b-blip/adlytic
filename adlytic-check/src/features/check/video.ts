// Video checks never upload the video. The browser samples frames (JPEG, with
// their timestamps) and turns the audio track into a 16 kHz mono 16-bit WAV.

export const VIDEO_MAX_BYTES = 50 * 1024 * 1024;
export const VIDEO_MAX_SECONDS = 60;
const FRAME_MAX_SIDE = 768;
const MAX_FRAMES = 10;

export class VideoRejected extends Error {}

export interface ExtractedVideo {
  durationSec: number;
  width: number;
  height: number;
  frames: Array<{ timeSec: number; blob: Blob }>;
  audio: Blob | null;
  audioPresence: "present" | "no_audio" | "unavailable";
  posterUrl: string;
}

export function isVideoFile(f: File): boolean {
  return /^video\//.test(f.type) || /\.(mp4|m4v|mov|webm)$/i.test(f.name);
}

/** Dense sampling in the first 2 seconds (the opening), then evenly across the rest. */
export function frameTimes(duration: number): number[] {
  const end = Math.max(0, duration - 0.05);
  const base = [0, 0.5, 1, 2].filter((t) => t <= end);
  const rest = MAX_FRAMES - base.length;
  // Round to 0.1 s, but never past the end (a sample past the end would be dropped).
  const last = Math.floor(end * 10) / 10;
  const at = (t: number) => Math.min(Math.round(t * 10) / 10, last);
  const out = new Set(base.map(at));
  if (duration > 2.5) for (let i = 1; i <= rest; i++) out.add(at(2 + ((end - 2) * i) / rest));
  else out.add(last);
  return [...out].sort((a, b) => a - b);
}

function once(el: HTMLMediaElement, ev: string, ms = 8000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new VideoRejected("timeout")), ms);
    el.addEventListener(ev, () => (clearTimeout(timer), resolve()), { once: true });
    el.addEventListener("error", () => (clearTimeout(timer), reject(new VideoRejected("decode"))), { once: true });
  });
}

export async function extractVideo(file: File, onStep?: (msg: string) => void): Promise<ExtractedVideo> {
  if (file.size > VIDEO_MAX_BYTES) throw new VideoRejected("الفيديو أكبر من 50 ميغابايت. اقطع الإعلان أو صدّره بجودة أقل.");
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  try {
    try {
      await once(video, "loadeddata");
    } catch {
      throw new VideoRejected("لم نتمكن من قراءة هذا الفيديو في المتصفح. جرّب ملف MP4 (H.264).");
    }
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) throw new VideoRejected("لم نتمكن من قراءة مدة الفيديو.");
    if (duration > VIDEO_MAX_SECONDS + 0.5) throw new VideoRejected(`الفيديو أطول من ${VIDEO_MAX_SECONDS} ثانية. ارفع أول دقيقة فقط.`);
    const width = video.videoWidth;
    const height = video.videoHeight;
    const scale = Math.min(1, FRAME_MAX_SIDE / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext("2d")!;
    const frames: ExtractedVideo["frames"] = [];
    const times = frameTimes(duration);
    for (const [i, t] of times.entries()) {
      onStep?.(`نستخرج اللقطات من الفيديو على جهازك… ${i + 1}/${times.length}`);
      if (Math.abs(video.currentTime - t) > 0.001) {
        video.currentTime = t;
        await once(video, "seeked");
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.8));
      if (blob) frames.push({ timeSec: t, blob });
    }
    if (!frames.length) throw new VideoRejected("لم نتمكن من استخراج لقطات من الفيديو.");
    onStep?.("نجهّز الصوت على جهازك…");
    const tracks = (video as unknown as { audioTracks?: { length: number }; mozHasAudio?: boolean });
    const knownSilent = tracks.audioTracks?.length === 0 || tracks.mozHasAudio === false;
    const { audio, presence } = await extractAudio(file, duration, knownSilent);
    return { durationSec: Math.round(duration * 10) / 10, width, height, frames, audio, audioPresence: presence, posterUrl: URL.createObjectURL(frames[0]!.blob) };
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute("src");
    video.load();
  }
}

/** Decode the audio track, mix to mono and resample to 16 kHz; "unavailable" when the browser cannot. */
async function extractAudio(file: File, duration: number, knownSilent: boolean): Promise<{ audio: Blob | null; presence: ExtractedVideo["audioPresence"] }> {
  if (knownSilent) return { audio: null, presence: "no_audio" };
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx || typeof OfflineAudioContext === "undefined") return { audio: null, presence: "unavailable" };
  let decoded: AudioBuffer;
  const ac = new Ctx();
  try {
    decoded = await ac.decodeAudioData(await file.arrayBuffer());
  } catch {
    return { audio: null, presence: "unavailable" };
  } finally {
    void ac.close();
  }
  if (decoded.length === 0 || decoded.duration < 0.2) return { audio: null, presence: "no_audio" };
  const seconds = Math.min(decoded.duration, duration + 0.5, VIDEO_MAX_SECONDS + 0.5);
  const off = new OfflineAudioContext(1, Math.ceil(seconds * 16_000), 16_000);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start();
  const rendered = await off.startRendering();
  const f32 = rendered.getChannelData(0);
  const pcm = new Int16Array(f32.length);
  for (let i = 0; i < f32.length; i++) pcm[i] = Math.max(-32768, Math.min(32767, Math.round(f32[i]! * 32767)));
  return { audio: new Blob([wav(pcm)], { type: "audio/wav" }), presence: "present" };
}

function wav(pcm: Int16Array): ArrayBuffer {
  const buf = new ArrayBuffer(44 + pcm.byteLength);
  const dv = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((ch, i) => dv.setUint8(o + i, ch.charCodeAt(0)));
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
  new Int16Array(buf, 44).set(pcm);
  return buf;
}
