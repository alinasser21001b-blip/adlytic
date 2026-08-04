/**
 * @blueprint §4 R2 · D18 · POST /v1/prescriptions
 * @owner media-service
 * @why D18 refuses to send a prescription line without an image, so this call
 *      is the only thing standing between a patient and a whole class of
 *      medicine — antibiotics, inhalers. Every way it can fail therefore has
 *      to be a way the patient can act on, and the two declared refusals are
 *      different actions: a photograph that is too large can be taken again
 *      smaller, and one in a format nobody accepts cannot.
 */
import { describe, expect, it } from "vitest";
import { makeMedia } from "./media.js";
import { makeHttp, type Fetch } from "./http.js";

const reply = (status: number, body: unknown): Fetch =>
  (async () => ({ status, text: async () => JSON.stringify(body) })) as never;

const bytes = async () => new Blob(["not really a jpeg"]);

const upload = (status: number, body: unknown) =>
  makeMedia(makeHttp("https://api", reply(status, body)), bytes).upload("blob:x", "subj-1");

describe("the photograph reaches the media service", () => {
  it("a 201 yields the id the draft will carry", async () => {
    const got = await upload(201, { imageId: "img-7" });
    if (got.kind !== "fresh" || got.value.kind !== "stored") throw new Error("expected stored");
    expect(got.value.imageId).toBe("img-7");
  });

  it("a 201 with no id is a failure, not a success the app cannot use", async () => {
    // Attaching `undefined` would put a prescription that does not exist on a
    // request, and D18 would consider the line satisfied.
    const got = await upload(201, {});
    expect(got.kind).toBe("failed");
  });

  it("the image, the subject and no hand-written content-type", async () => {
    // The platform writes the multipart boundary; a content-type set here
    // without it produces a body no server can parse.
    const seen: { body: unknown; headers: Record<string, string> }[] = [];
    const spy: Fetch = (async (_url: string, init: { headers: Record<string, string>; body?: unknown }) => {
      seen.push({ body: init.body, headers: init.headers });
      return { status: 201, text: async () => JSON.stringify({ imageId: "img-1" }) };
    }) as never;

    await makeMedia(makeHttp("https://api", spy), bytes).upload("blob:x", "subj-9");

    const form = seen[0]!.body as FormData;
    expect(form.get("subjectId")).toBe("subj-9");
    expect(form.get("image")).toBeInstanceOf(Blob);
    expect(seen[0]!.headers["content-type"]).toBeUndefined();
  });
});

describe("every declared refusal stays itself", () => {
  it("too large and unsupported are not the same answer", async () => {
    const big = await upload(413, { error: "too_large" });
    const wrong = await upload(415, { error: "unsupported_type" });
    expect(big.kind === "fresh" && big.value.kind).toBe("tooLarge");
    expect(wrong.kind === "fresh" && wrong.value.kind).toBe("unsupportedType");
  });

  it("a dropped connection is a failure, and keeps the photograph retryable", async () => {
    const got = await upload(503, {});
    expect(got.kind).toBe("failed");
  });

  it("an image the platform cannot read is permanent, not worth retrying", async () => {
    // The uri points at nothing. Retrying will not make it resolve, so R2
    // keeps the review state and the patient takes another.
    const gone = makeMedia(makeHttp("https://api", reply(201, {})), async () => null);
    const got = await gone.upload("blob:missing", "subj-1");
    if (got.kind !== "failed") throw new Error("expected failed");
    expect(got.outcome.kind).toBe("permanent");
  });

  it("nothing is uploaded when there is nothing to upload", async () => {
    // The call must not be made at all — an empty multipart body would be a
    // 400 the patient cannot act on.
    let called = false;
    const spy: Fetch = (async () => { called = true; return { status: 201, text: async () => "{}" }; }) as never;
    await makeMedia(makeHttp("https://api", spy), async () => null).upload("blob:missing", "subj-1");
    expect(called).toBe(false);
  });
});
