import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import type { Database } from "../db/client";
import { ApiError } from "../errors";
import { requireAuth } from "../security/auth";
import { writeAudit } from "../services/audit";
import {
  deleteEncryptedImage,
  readEncryptedImage,
  storeEncryptedImage,
  type FilePurpose,
} from "../storage/encrypted-files";
import type { AppVariables } from "../types";

const purposes: FilePurpose[] = [
  "PRESCRIPTION",
  "PHARMACY_LICENSE",
  "PHARMACIST_ID",
];

export function fileRoutes(database: Database) {
  const routes = new Hono<{ Variables: AppVariables }>();
  routes.use("*", requireAuth(database));

  routes.post("/", async (context) => {
    const body = await context.req.parseBody();
    const purpose = String(body.purpose ?? "") as FilePurpose;
    const file = body.file;
    const user = context.get("user");
    if (!purposes.includes(purpose)) {
      throw new ApiError(422, "FILE_PURPOSE_INVALID", "غرض الملف غير صالح.");
    }
    if (
      (user.role === "PATIENT" && purpose !== "PRESCRIPTION") ||
      (user.role === "PHARMACY" && purpose === "PRESCRIPTION") ||
      user.role === "ADMIN"
    ) {
      throw new ApiError(403, "FILE_PURPOSE_FORBIDDEN", "لا يمكن رفع هذا الملف.");
    }
    if (!(file instanceof File)) {
      throw new ApiError(422, "FILE_REQUIRED", "اختر صورة صالحة.");
    }

    let pharmacyId: string | undefined;
    if (user.role === "PHARMACY") {
      const pharmacy = await database.query<{ id: string }>(
        "SELECT id FROM pharmacies WHERE owner_user_id = $1 LIMIT 1",
        [user.id],
      );
      pharmacyId = pharmacy.rows[0]?.id;
      if (!pharmacyId) {
        throw new ApiError(
          403,
          "PHARMACY_ONBOARDING_REQUIRED",
          "أكمل بيانات الصيدلية قبل رفع المستندات.",
        );
      }
    }

    const stored = await storeEncryptedImage(database, {
      ownerUserId: user.id,
      purpose,
      bytes: Buffer.from(await file.arrayBuffer()),
      pharmacyId,
    });

    if (pharmacyId) {
      await database.query(
        `INSERT INTO verification_documents
          (id, pharmacy_id, secure_file_id, document_type)
         VALUES ($1, $2, $3, $4)`,
        [
          randomUUID(),
          pharmacyId,
          stored.id,
          purpose === "PHARMACY_LICENSE" ? "LICENSE" : "PHARMACIST_ID",
        ],
      );
    }
    await writeAudit(database, {
      actorUserId: user.id,
      actorRole: user.role,
      action: "SECURE_FILE_UPLOADED",
      resourceType: "SECURE_FILE",
      resourceId: stored.id,
      requestId: context.get("requestId"),
      metadata: { purpose },
    });
    return context.json({ data: stored }, 201);
  });

  routes.get("/:fileId", async (context) => {
    const user = context.get("user");
    const fileId = context.req.param("fileId");
    const metadata = await database.query<{
      owner_user_id: string;
      purpose: FilePurpose;
      request_id: string | null;
      pharmacy_id: string | null;
    }>(
      `SELECT owner_user_id, purpose, request_id, pharmacy_id
       FROM secure_files WHERE id = $1 AND status = 'READY'`,
      [fileId],
    );
    const file = metadata.rows[0];
    if (!file) {
      throw new ApiError(404, "FILE_NOT_FOUND", "الملف غير موجود.");
    }

    let allowed = file.owner_user_id === user.id || user.role === "ADMIN";
    if (!allowed && user.role === "PHARMACY" && file.purpose === "PRESCRIPTION") {
      const access = await database.query(
        `SELECT res.id
         FROM reservations res
         JOIN pharmacy_branches b ON b.id = res.branch_id
         JOIN pharmacies p ON p.id = b.pharmacy_id
         JOIN medicine_requests r ON r.id = res.request_id
         WHERE p.owner_user_id = $1
           AND r.prescription_file_id = $2
           AND res.status IN ('ACTIVE', 'READY')
           AND res.hold_expires_at > now()
         LIMIT 1`,
        [user.id, fileId],
      );
      allowed = Boolean(access.rows[0]);
    }
    if (!allowed) {
      await writeAudit(database, {
        actorUserId: user.id,
        actorRole: user.role,
        action: "SECURE_FILE_ACCESSED",
        resourceType: "SECURE_FILE",
        resourceId: fileId,
        result: "DENIED",
        requestId: context.get("requestId"),
      });
      throw new ApiError(404, "FILE_NOT_FOUND", "الملف غير موجود.");
    }

    const decrypted = await readEncryptedImage(database, fileId);
    await writeAudit(database, {
      actorUserId: user.id,
      actorRole: user.role,
      action: "SECURE_FILE_ACCESSED",
      resourceType: "SECURE_FILE",
      resourceId: fileId,
      requestId: context.get("requestId"),
      metadata: { purpose: decrypted.row.purpose },
    });
    context.header("Cache-Control", "no-store, private");
    context.header("Content-Type", decrypted.row.media_type);
    context.header("Content-Disposition", 'inline; filename="secure-image.jpg"');
    return context.body(decrypted.data);
  });

  routes.delete("/:fileId", async (context) => {
    const user = context.get("user");
    const result = await database.query(
      `SELECT id FROM secure_files
       WHERE id = $1 AND owner_user_id = $2 AND status = 'READY'`,
      [context.req.param("fileId"), user.id],
    );
    if (!result.rows[0]) {
      throw new ApiError(404, "FILE_NOT_FOUND", "الملف غير موجود.");
    }
    await deleteEncryptedImage(database, context.req.param("fileId"));
    return context.json({ data: { deleted: true } });
  });

  return routes;
}
