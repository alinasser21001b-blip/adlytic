import { LIMITS } from "../../shared/schemas";
import { HttpError } from "../lib";

export type ImageMime = "image/jpeg" | "image/png" | "image/webp";

function ascii(b: Uint8Array, start: number, len: number): string {
  return String.fromCharCode(...b.subarray(start, start + len));
}

/** Identify the real format from magic bytes — the extension and declared MIME are not trusted. */
export function sniffImage(b: Uint8Array): ImageMime | "heic" | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b[0] === 0x89 && ascii(b, 1, 3) === "PNG" && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) {
    return "image/png";
  }
  if (b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") return "image/webp";
  if (b.length >= 12 && ascii(b, 4, 4) === "ftyp") {
    const brand = ascii(b, 8, 4);
    if (["heic", "heix", "hevc", "heim", "heis", "mif1", "msf1", "avif"].includes(brand)) return "heic";
  }
  return null;
}

export function validateImage(bytes: Uint8Array): ImageMime {
  if (bytes.byteLength === 0) throw new HttpError(400, "INVALID_INPUT");
  if (bytes.byteLength > LIMITS.imageBytes) throw new HttpError(413, "FILE_TOO_LARGE");
  const kind = sniffImage(bytes);
  if (kind === "heic") throw new HttpError(415, "HEIC_UNSUPPORTED");
  if (!kind) throw new HttpError(415, "UNSUPPORTED_FILE");
  return kind;
}
