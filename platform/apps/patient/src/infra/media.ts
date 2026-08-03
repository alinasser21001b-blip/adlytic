/**
 * MediaPort over the declared prescription contract.
 *
 * @blueprint §4 R2 · D18 · D37 · POST /v1/prescriptions
 * @owner media-service
 * @why R2 and R3 were built, reviewed and photographed, and no photograph
 *      could be taken or sent — so D18 closed the whole class of medicine that
 *      needs one. TD-9 called that a device problem for months; it was not. A
 *      browser can capture, and this route has been declared the entire time:
 *      multipart image + { subjectId } → 201 { imageId }, 413 too_large,
 *      415 unsupported_type.
 *
 *      Phase 0 reads nothing (D18): the pharmacist reads the paper. So this
 *      uploads bytes and asks no questions about them, and every judgement
 *      about legibility stays with the patient on R3.
 */
import type { Http } from "./http.js";
import type { Fetched, MediaPort, UploadResult } from "../ports.js";

/**
 * Turn a local uri into bytes.
 *
 * `fetch` reads both shapes this product produces — a `blob:` url from a
 * browser file input and a `file://` path from a device — which is why the
 * port takes a uri rather than the bytes themselves. The store holds values,
 * and a Blob is not one.
 *
 * Injected so a test can supply bytes without a platform, and so the day a
 * device needs a different reader there is one place to change.
 */
export type ReadImage = (localUri: string) => Promise<Blob | null>;

export const fetchImage: ReadImage = async (localUri) => {
  try {
    const res = await fetch(localUri);
    return await res.blob();
  } catch {
    // The uri points at nothing this platform can read. Not a network failure
    // and not a refusal — the image is simply gone, which is what the caller
    // is told.
    return null;
  }
};

/** The field names the contract fixes: the image, and who it is for. */
const IMAGE_FIELD = "image";
const SUBJECT_FIELD = "subjectId";

const errorOf = (body: unknown): string =>
  typeof body === "object" && body !== null && typeof (body as Record<string, unknown>)["error"] === "string"
    ? (body as Record<string, string>)["error"]!
    : "";

export function makeMedia(http: Http, read: ReadImage = fetchImage): MediaPort {
  return {
    async upload(localUri, subjectId, signal): Promise<Fetched<UploadResult>> {
      const bytes = await read(localUri);
      // A photograph that cannot be read off the device is permanent: retrying
      // will not make the uri resolve, and R2 keeps the review state so the
      // patient can take another rather than being told to wait.
      if (!bytes) return { kind: "failed", outcome: { kind: "permanent", reason: "image_unreadable" } };

      const form = new FormData();
      form.append(IMAGE_FIELD, bytes, "prescription.jpg");
      form.append(SUBJECT_FIELD, subjectId);

      const res = await http.postForm("/v1/prescriptions", form, signal === undefined ? {} : { signal });

      if (res.outcome.kind === "accepted") {
        const body = (res.body ?? {}) as Record<string, unknown>;
        const imageId = body["imageId"];
        // A 201 with no id is a success the app cannot use: the draft would
        // attach `undefined` and the request would carry a prescription that
        // does not exist. Named rather than guessed.
        if (typeof imageId !== "string" || imageId === "")
          return { kind: "failed", outcome: { kind: "permanent", reason: "201_without_imageId" } };
        return { kind: "fresh", value: { kind: "stored", imageId } };
      }

      // The two declared refusals, kept apart because they are different
      // things to fix: a photograph that is too large can be taken again
      // smaller, and one in a format nobody accepts cannot.
      const error = errorOf(res.body);
      if (res.status === 413 || error === "too_large") return { kind: "fresh", value: { kind: "tooLarge" } };
      if (res.status === 415 || error === "unsupported_type") return { kind: "fresh", value: { kind: "unsupportedType" } };

      return { kind: "failed", outcome: res.outcome };
    },
  };
}
