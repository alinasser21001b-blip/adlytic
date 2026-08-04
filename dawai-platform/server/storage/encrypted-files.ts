import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
} from "node:crypto";
import sharp from "sharp";
import { config } from "../config";
import type { DbExecutor } from "../db/client";
import { ApiError } from "../errors";
import { getObjectStore, scanBytesForMalware } from "./object-store";

export type FilePurpose =
  | "PRESCRIPTION"
  | "PHARMACY_LICENSE"
  | "PHARMACIST_ID";

interface SecureFileRow {
  id: string;
  owner_user_id: string;
  purpose: FilePurpose;
  request_id: string | null;
  pharmacy_id: string | null;
  storage_key: string;
  media_type: string;
  nonce: string;
  auth_tag: string;
  status: "READY" | "DELETED";
}

function encryptionKey(): Buffer {
  const key = Buffer.from(config.storageEncryptionKey, "base64");
  if (key.length !== 32) {
    throw new Error("STORAGE_ENCRYPTION_KEY_MUST_BE_32_BYTES_BASE64");
  }
  return key;
}

function hasAllowedMagic(buffer: Buffer): boolean {
  const png =
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    );
  const jpeg =
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff;
  const webp =
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP";
  return png || jpeg || webp;
}

async function sanitizeImage(
  original: Buffer,
): Promise<{ data: Buffer; mediaType: string }> {
  if (original.length === 0 || original.length > 10 * 1024 * 1024) {
    throw new ApiError(413, "FILE_SIZE_INVALID", "حجم الصورة غير مسموح.");
  }
  if (!hasAllowedMagic(original)) {
    throw new ApiError(
      415,
      "FILE_TYPE_INVALID",
      "يُسمح فقط بصور JPEG أو PNG أو WebP الصالحة.",
    );
  }

  try {
    const image = sharp(original, {
      failOn: "error",
      limitInputPixels: 40_000_000,
    });
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height) {
      throw new Error("IMAGE_DIMENSIONS_MISSING");
    }
    const data = await image
      .rotate()
      .resize({
        width: 4096,
        height: 4096,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 88, progressive: true })
      .toBuffer();
    return { data, mediaType: "image/jpeg" };
  } catch {
    throw new ApiError(415, "IMAGE_DECODE_FAILED", "ملف الصورة تالف أو غير صالح.");
  }
}

export async function storeEncryptedImage(
  database: DbExecutor,
  input: {
    ownerUserId: string;
    purpose: FilePurpose;
    attachmentKind?: "PRESCRIPTION" | "BOX_IMAGE";
    bytes: Buffer;
    requestId?: string;
    pharmacyId?: string;
  },
): Promise<{ id: string; mediaType: string; sizeBytes: number }> {
  if (config.malwareScanUrl) {
    try {
      await scanBytesForMalware(input.bytes, `${input.purpose}.bin`);
    } catch (error) {
      if (error instanceof Error && error.message === "MALWARE_DETECTED") {
        throw new ApiError(
          422,
          "MALWARE_DETECTED",
          "رُفض الملف بعد فحص الأمان.",
        );
      }
      throw new ApiError(
        503,
        "MALWARE_SCAN_UNAVAILABLE",
        "تعذر فحص الملف. أعد المحاولة لاحقًا.",
      );
    }
  }
  const sanitized = await sanitizeImage(input.bytes);
  const id = randomUUID();
  const nonce = randomBytes(12);
  const aad = Buffer.from(
    `dawai-file:v1|${id}|${input.ownerUserId}|${input.purpose}`,
  );
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), nonce);
  cipher.setAAD(aad);
  const encrypted = Buffer.concat([
    cipher.update(sanitized.data),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  const storageKey = `${id}.enc`;
  const store = getObjectStore();
  const attachmentKind =
    input.attachmentKind === "BOX_IMAGE" ? "BOX_IMAGE" : "PRESCRIPTION";

  await store.put(storageKey, encrypted);

  try {
    await database.query(
      `INSERT INTO secure_files
        (id, owner_user_id, purpose, request_id, pharmacy_id, storage_key,
         media_type, size_bytes, nonce, auth_tag, attachment_kind, delete_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
         CASE WHEN $3 = 'PRESCRIPTION'
           THEN now() + interval '7 days'
           ELSE NULL
         END)`,
      [
        id,
        input.ownerUserId,
        input.purpose,
        input.requestId ?? null,
        input.pharmacyId ?? null,
        storageKey,
        sanitized.mediaType,
        sanitized.data.length,
        nonce.toString("base64"),
        authTag.toString("base64"),
        attachmentKind,
      ],
    );
  } catch (error) {
    await store.delete(storageKey);
    throw error;
  }

  return {
    id,
    mediaType: sanitized.mediaType,
    sizeBytes: sanitized.data.length,
  };
}

export async function readEncryptedImage(
  database: DbExecutor,
  fileId: string,
): Promise<{ row: SecureFileRow; data: Buffer }> {
  const result = await database.query<SecureFileRow>(
    `SELECT id, owner_user_id, purpose, request_id, pharmacy_id, storage_key,
            media_type, nonce, auth_tag, status
     FROM secure_files
     WHERE id = $1 AND status = 'READY'`,
    [fileId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new ApiError(404, "FILE_NOT_FOUND", "الملف غير موجود.");
  }

  const encrypted = await getObjectStore().get(row.storage_key);
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(row.nonce, "base64"),
  );
  decipher.setAAD(
    Buffer.from(
      `dawai-file:v1|${row.id}|${row.owner_user_id}|${row.purpose}`,
    ),
  );
  decipher.setAuthTag(Buffer.from(row.auth_tag, "base64"));

  try {
    return {
      row,
      data: Buffer.concat([decipher.update(encrypted), decipher.final()]),
    };
  } catch {
    throw new ApiError(404, "FILE_NOT_FOUND", "الملف غير موجود.");
  }
}

export async function deleteEncryptedImage(
  database: DbExecutor,
  fileId: string,
): Promise<void> {
  const result = await database.query<{ storage_key: string }>(
    `UPDATE secure_files SET status = 'DELETED'
     WHERE id = $1 AND status = 'READY'
     RETURNING storage_key`,
    [fileId],
  );
  const key = result.rows[0]?.storage_key;
  if (key) {
    await getObjectStore().delete(key);
  }
}
