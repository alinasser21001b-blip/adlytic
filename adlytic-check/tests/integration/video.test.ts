import { describe, expect, it } from "vitest";
import { Client, login, mockState, newKey, TINY_JPEG, wav16k } from "../support/client";
import { urlOf } from "../support/instances";

// Video checks: the browser sends sampled frames + a 16 kHz mono WAV; nothing is stored.
const ACC = urlOf("accounts");

interface VideoOpts {
  durationSec?: number;
  times?: number[];
  frames?: Uint8Array[];
  audio?: Uint8Array | null;
  presence?: "present" | "no_audio" | "unavailable";
  adCopy?: string;
}

async function videoCheck(c: Client, o: VideoOpts = {}, base = ACC) {
  const times = o.times ?? [0, 0.5, 1, 2];
  const fd = new FormData();
  fd.append("industry", "furniture");
  fd.append("goal", "orders");
  fd.append("adCopy", o.adCopy ?? "كنبة مخمل");
  fd.append("idempotencyKey", newKey());
  fd.append("turnstileToken", "ok-token");
  fd.append("video_meta", JSON.stringify({ durationSec: o.durationSec ?? 8, width: 1080, height: 1920, frameTimes: times, audio: o.presence ?? (o.audio === null ? "no_audio" : "present") }));
  (o.frames ?? times.map(() => TINY_JPEG)).forEach((f, i) => fd.append(`frame${i}`, new Blob([f as Uint8Array<ArrayBuffer>], { type: "image/jpeg" }), `f${i}.jpg`));
  const audio = o.audio === undefined ? wav16k(4) : o.audio;
  if (audio) fd.append("audio", new Blob([audio as Uint8Array<ArrayBuffer>], { type: "audio/wav" }), "a.wav");
  const res = await fetch(`${base}/api/check?media=video`, { method: "POST", headers: c.headers(), body: fd });
  return { status: res.status, body: (await res.json()) as any };
}

describe("video checks", () => {
  it("analyses sampled frames with their times, transcribes speech, and reports coverage and a timeline", async () => {
    const c = new Client(ACC);
    await login(c, "sub-video-1");
    const before = await mockState();
    const r = await videoCheck(c);
    expect(r.status).toBe(200);
    expect(r.body.schemaVersion).toBe("2");
    expect(r.body.media).toMatchObject({ kind: "video", durationSec: 8, aspect: "vertical", frameTimes: [0, 0.5, 1, 2], audio: "speech_transcribed" });
    expect(r.body.coverageAr).toContain("4 لقطات");
    expect(r.body.evidence.find((e: any) => e.id === "A1")).toMatchObject({ source: "audio_transcript", timeSec: 0.2 });
    expect(r.body.timeline.map((e: any) => e.timeSec)).toEqual([...r.body.timeline.map((e: any) => e.timeSec)].sort((a: number, b: number) => a - b));
    // Vertical video → the safe-zone dimension applies.
    expect(r.body.dimensions.map((d: any) => d.dimension)).toEqual(expect.arrayContaining(["sound_off", "safe_zone", "opening"]));
    const after = await mockState();
    expect(after.asrCalls - before.asrCalls).toBe(1);
    // The provider got 4 images, each preceded by its time label; the transcript is fenced.
    const content = after.last.messages[0].content as Array<{ type: string; text?: string }>;
    expect(content.filter((b) => b.type === "image")).toHaveLength(4);
    expect(content.filter((b) => b.type === "text" && /frame at 0\.5s/.test(b.text ?? ""))).toHaveLength(1);
    const userText = content.at(-1)!.text!;
    expect(userText).toContain("A1 [0.2s]: اطلب الآن عبر واتساب");
    expect(userText.match(/<\/ad_submission>/g)?.length).toBe(1);
    // One unit, like any check.
    expect((await c.req("GET", "/api/balance")).body.freeAvailable).toBe(1);
  });

  it("does not call speech recognition for silence or a video without sound", async () => {
    const c = new Client(ACC);
    await login(c, "sub-video-2");
    const before = (await mockState()).asrCalls;
    const quiet = await videoCheck(c, { audio: wav16k(4, 0) });
    expect(quiet.body.media.audio).toBe("silence");
    const none = await videoCheck(c, { audio: null });
    expect(none.body.media.audio).toBe("no_audio");
    expect((await mockState()).asrCalls).toBe(before);
  });

  it.each([
    ["longer than 60 s", { durationSec: 61 }, 413],
    ["more than 12 frames", { times: Array.from({ length: 13 }, (_, i) => i * 0.5) }, 400],
    ["times not increasing", { times: [0, 1, 0.5] }, 400],
    ["a frame that is not an image", { frames: [TINY_JPEG, new TextEncoder().encode("not an image at all"), TINY_JPEG, TINY_JPEG] }, 415],
    ["stereo / 44.1 kHz audio", { audio: (() => { const w = wav16k(1); new DataView(w.buffer).setUint32(24, 44_100, true); return w; })() }, 415],
    ["audio longer than the video", { durationSec: 2, times: [0, 0.5, 1], audio: wav16k(5) }, 400],
  ])("rejects %s before anything is spent", async (_name, opts, status) => {
    const c = new Client(ACC);
    await login(c, `sub-video-bad-${status}-${Math.random()}`);
    const before = (await mockState()).calls;
    const r = await videoCheck(c, opts as VideoOpts);
    expect(r.status).toBe(status);
    expect((await mockState()).calls).toBe(before);
    expect((await c.req("GET", "/api/balance")).body.freeAvailable).toBe(2);
  });

  it("is refused where video is not enabled", async () => {
    const c = new Client(urlOf("main"));
    await c.session();
    const r = await videoCheck(c, {}, urlOf("main"));
    expect(r.status).toBe(503);
    expect(r.body.error.code).toBe("VIDEO_UNAVAILABLE");
  });
});
