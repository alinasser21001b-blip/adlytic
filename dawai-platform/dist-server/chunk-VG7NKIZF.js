import {
  config
} from "./chunk-CHICJPPN.js";

// server/storage/encrypted-files.ts
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID
} from "crypto";
import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import { join } from "path";
import sharp from "sharp";

// server/errors.ts
var ApiError = class extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
  status;
  code;
  details;
};

// server/storage/encrypted-files.ts
function encryptionKey() {
  const key = Buffer.from(config.storageEncryptionKey, "base64");
  if (key.length !== 32) {
    throw new Error("STORAGE_ENCRYPTION_KEY_MUST_BE_32_BYTES_BASE64");
  }
  return key;
}
function hasAllowedMagic(buffer) {
  const png = buffer.length >= 8 && buffer.subarray(0, 8).equals(
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  );
  const jpeg = buffer.length >= 3 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
  const webp = buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  return png || jpeg || webp;
}
async function sanitizeImage(original) {
  if (original.length === 0 || original.length > 10 * 1024 * 1024) {
    throw new ApiError(413, "FILE_SIZE_INVALID", "\u062D\u062C\u0645 \u0627\u0644\u0635\u0648\u0631\u0629 \u063A\u064A\u0631 \u0645\u0633\u0645\u0648\u062D.");
  }
  if (!hasAllowedMagic(original)) {
    throw new ApiError(
      415,
      "FILE_TYPE_INVALID",
      "\u064A\u064F\u0633\u0645\u062D \u0641\u0642\u0637 \u0628\u0635\u0648\u0631 JPEG \u0623\u0648 PNG \u0623\u0648 WebP \u0627\u0644\u0635\u0627\u0644\u062D\u0629."
    );
  }
  try {
    const image = sharp(original, {
      failOn: "error",
      limitInputPixels: 4e7
    });
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height) {
      throw new Error("IMAGE_DIMENSIONS_MISSING");
    }
    const data = await image.rotate().resize({
      width: 4096,
      height: 4096,
      fit: "inside",
      withoutEnlargement: true
    }).jpeg({ quality: 88, progressive: true }).toBuffer();
    return { data, mediaType: "image/jpeg" };
  } catch {
    throw new ApiError(415, "IMAGE_DECODE_FAILED", "\u0645\u0644\u0641 \u0627\u0644\u0635\u0648\u0631\u0629 \u062A\u0627\u0644\u0641 \u0623\u0648 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D.");
  }
}
async function storeEncryptedImage(database, input) {
  const sanitized = await sanitizeImage(input.bytes);
  const id = randomUUID();
  const nonce = randomBytes(12);
  const aad = Buffer.from(
    `dawai-file:v1|${id}|${input.ownerUserId}|${input.purpose}`
  );
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), nonce);
  cipher.setAAD(aad);
  const encrypted = Buffer.concat([
    cipher.update(sanitized.data),
    cipher.final()
  ]);
  const authTag = cipher.getAuthTag();
  const storageKey = `${id}.enc`;
  await mkdir(config.storagePath, { recursive: true, mode: 448 });
  await writeFile(join(config.storagePath, storageKey), encrypted, {
    mode: 384
  });
  try {
    await database.query(
      `INSERT INTO secure_files
        (id, owner_user_id, purpose, request_id, pharmacy_id, storage_key,
         media_type, size_bytes, nonce, auth_tag, delete_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
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
        authTag.toString("base64")
      ]
    );
  } catch (error) {
    await unlink(join(config.storagePath, storageKey)).catch(() => void 0);
    throw error;
  }
  return {
    id,
    mediaType: sanitized.mediaType,
    sizeBytes: sanitized.data.length
  };
}
async function readEncryptedImage(database, fileId) {
  const result = await database.query(
    `SELECT id, owner_user_id, purpose, request_id, pharmacy_id, storage_key,
            media_type, nonce, auth_tag, status
     FROM secure_files
     WHERE id = $1 AND status = 'READY'`,
    [fileId]
  );
  const row = result.rows[0];
  if (!row) {
    throw new ApiError(404, "FILE_NOT_FOUND", "\u0627\u0644\u0645\u0644\u0641 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F.");
  }
  const encrypted = await readFile(join(config.storagePath, row.storage_key));
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(row.nonce, "base64")
  );
  decipher.setAAD(
    Buffer.from(
      `dawai-file:v1|${row.id}|${row.owner_user_id}|${row.purpose}`
    )
  );
  decipher.setAuthTag(Buffer.from(row.auth_tag, "base64"));
  try {
    return {
      row,
      data: Buffer.concat([decipher.update(encrypted), decipher.final()])
    };
  } catch {
    throw new ApiError(404, "FILE_NOT_FOUND", "\u0627\u0644\u0645\u0644\u0641 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F.");
  }
}
async function deleteEncryptedImage(database, fileId) {
  var _a;
  const result = await database.query(
    `UPDATE secure_files SET status = 'DELETED'
     WHERE id = $1 AND status = 'READY'
     RETURNING storage_key`,
    [fileId]
  );
  const key = (_a = result.rows[0]) == null ? void 0 : _a.storage_key;
  if (key) {
    await unlink(join(config.storagePath, key)).catch(() => void 0);
  }
}

// server/services/notifications.ts
import { randomUUID as randomUUID2 } from "crypto";
async function createNotification(database, input) {
  const id = randomUUID2();
  await database.query(
    `INSERT INTO notifications
      (id, user_id, event_type, title, body, resource_type, resource_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      id,
      input.userId,
      input.eventType,
      input.title,
      input.body,
      input.resourceType ?? null,
      input.resourceId ?? null
    ]
  );
  await database.query(
    `INSERT INTO notification_outbox
      (id, notification_id, safe_payload, channel)
     VALUES ($1, $2, $3::jsonb, 'IN_APP')`,
    [
      randomUUID2(),
      id,
      JSON.stringify({
        eventType: input.eventType,
        resourceId: input.resourceId ?? id
      })
    ]
  );
  return id;
}

// server/services/lifecycle.ts
async function runLifecycleSweep(database) {
  const expiredRequests = await database.query(
    `UPDATE medicine_requests
     SET status = 'EXPIRED', updated_at = now(), version = version + 1
     WHERE status IN ('ACTIVE', 'NO_MATCH')
       AND expires_at <= now()
     RETURNING id, patient_id`
  );
  for (const request of expiredRequests.rows) {
    await createNotification(database, {
      userId: request.patient_id,
      eventType: "REQUEST_EXPIRED",
      title: "\u0627\u0646\u062A\u0647\u062A \u0645\u062F\u0629 \u0627\u0644\u0637\u0644\u0628",
      body: "\u0644\u0645 \u064A\u0639\u062F \u0627\u0644\u0637\u0644\u0628 \u0646\u0634\u0637\u064B\u0627. \u064A\u0645\u0643\u0646\u0643 \u0628\u062F\u0621 \u0628\u062D\u062B \u062C\u062F\u064A\u062F \u0623\u0648 \u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629.",
      resourceType: "REQUEST",
      resourceId: request.id
    });
  }
  const expiredReservations = await database.query(
    `UPDATE reservations
     SET status = 'EXPIRED', updated_at = now()
     WHERE (
       status = 'PENDING_ACK' AND acknowledgement_deadline <= now()
     ) OR (
       status IN ('ACTIVE', 'READY') AND hold_expires_at <= now()
     )
     RETURNING id, request_id, offer_id, patient_id`
  );
  for (const reservation of expiredReservations.rows) {
    await database.transaction(async (transaction) => {
      await transaction.query(
        `UPDATE pharmacy_offers
         SET status = 'EXPIRED', updated_at = now()
         WHERE id = $1 AND status IN ('HOLD_PENDING', 'HELD')`,
        [reservation.offer_id]
      );
      await transaction.query(
        `UPDATE medicine_requests
         SET status = CASE WHEN expires_at > now() THEN 'ACTIVE' ELSE 'EXPIRED' END,
             updated_at = now(), version = version + 1
         WHERE id = $1 AND status IN ('HOLD_PENDING', 'RESERVED', 'READY')`,
        [reservation.request_id]
      );
      await createNotification(transaction, {
        userId: reservation.patient_id,
        eventType: "RESERVATION_EXPIRED",
        title: "\u0627\u0646\u062A\u0647\u062A \u0645\u062F\u0629 \u0627\u0644\u062D\u062C\u0632",
        body: "\u0627\u0646\u062A\u0647\u0649 \u0627\u0644\u062D\u062C\u0632 \u0627\u0644\u0645\u0624\u0642\u062A. \u0627\u0641\u062A\u062D \u062F\u0648\u0627\u0626\u064A \u0644\u0645\u0631\u0627\u062C\u0639\u0629 \u0627\u0644\u0637\u0644\u0628.",
        resourceType: "REQUEST",
        resourceId: reservation.request_id
      });
    });
  }
  await database.query(
    `UPDATE pharmacy_offers SET status = 'EXPIRED', updated_at = now()
     WHERE status = 'ACTIVE' AND expires_at <= now()`
  );
  await database.query(
    `UPDATE request_dispatches SET status = 'EXPIRED'
     WHERE status IN ('SENT', 'VIEWED')
       AND request_id IN (
         SELECT id FROM medicine_requests
         WHERE status IN ('EXPIRED', 'CANCELLED', 'COMPLETED', 'BLOCKED')
       )`
  );
  const expiredFiles = await database.query(
    `SELECT id FROM secure_files
     WHERE status = 'READY' AND delete_at IS NOT NULL AND delete_at <= now()
     LIMIT 100`
  );
  for (const file of expiredFiles.rows) {
    await deleteEncryptedImage(database, file.id);
  }
  await database.query(
    `UPDATE notification_outbox
     SET status = 'DELIVERED', delivered_at = now()
     WHERE status = 'PENDING' AND channel = 'IN_APP'`
  );
  await database.query(
    `DELETE FROM rate_limits WHERE expires_at < now() - interval '1 hour'`
  );
  await database.query(
    `DELETE FROM idempotency_keys WHERE expires_at <= now()`
  );
  return {
    requestsExpired: expiredRequests.rowCount,
    reservationsExpired: expiredReservations.rowCount,
    filesDeleted: expiredFiles.rowCount
  };
}

export {
  ApiError,
  createNotification,
  storeEncryptedImage,
  readEncryptedImage,
  deleteEncryptedImage,
  runLifecycleSweep
};
//# sourceMappingURL=chunk-VG7NKIZF.js.map