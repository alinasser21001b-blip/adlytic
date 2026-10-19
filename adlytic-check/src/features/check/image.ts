import { LIMITS } from "../../../shared/constants";
import { t } from "../../i18n/ar";

// The provider downsizes anything above 1568px on the long edge; sending more only costs bandwidth.
const MAX_SIDE = 1568;
const ACCEPTED = new Set(["image/jpeg", "image/png", "image/webp"]);

export class ImageRejected extends Error {}

function looksHeic(file: File): boolean {
  return /hei[cf]$/i.test(file.name) || /hei[cf]/i.test(file.type);
}

/**
 * Downscale to ≤1568px on the long side and re-encode as JPEG. Re-encoding
 * drops EXIF/location metadata and keeps the upload small; quality stays high
 * so text inside the ad remains readable.
 */
export async function prepareImage(file: File): Promise<File> {
  if (looksHeic(file)) throw new ImageRejected(t.imageHeic);
  if (!ACCEPTED.has(file.type)) throw new ImageRejected(t.imageUnsupported);

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ImageRejected(t.imageUnreadable);
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ImageRejected(t.imageUnreadable);
  ctx.fillStyle = "#ffffff"; // transparent PNGs flatten onto white, not black
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  for (const quality of [0.9, 0.8, 0.7]) {
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
    if (blob && blob.size > 0 && blob.size <= LIMITS.imageBytes) {
      return new File([blob], "ad.jpg", { type: "image/jpeg" });
    }
  }
  throw new ImageRejected(t.imageTooLarge);
}
