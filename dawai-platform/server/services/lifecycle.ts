import type { Database } from "../db/client";
import { deleteEncryptedImage } from "../storage/encrypted-files";
import { createNotification } from "./notifications";

export async function runLifecycleSweep(database: Database): Promise<{
  requestsExpired: number;
  reservationsExpired: number;
  filesDeleted: number;
}> {
  const expiredRequests = await database.query<{
    id: string;
    patient_id: string;
  }>(
    `UPDATE medicine_requests
     SET status = 'EXPIRED', updated_at = now(), version = version + 1
     WHERE status IN ('ACTIVE', 'NO_MATCH')
       AND expires_at <= now()
     RETURNING id, patient_id`,
  );
  for (const request of expiredRequests.rows) {
    await createNotification(database, {
      userId: request.patient_id,
      eventType: "REQUEST_EXPIRED",
      title: "انتهت مدة الطلب",
      body: "لم يعد الطلب نشطًا. يمكنك بدء بحث جديد أو إعادة المحاولة.",
      resourceType: "REQUEST",
      resourceId: request.id,
    });
  }

  const expiredReservations = await database.query<{
    id: string;
    request_id: string;
    offer_id: string;
    patient_id: string;
  }>(
    `UPDATE reservations
     SET status = 'EXPIRED', updated_at = now()
     WHERE (
       status = 'PENDING_ACK' AND acknowledgement_deadline <= now()
     ) OR (
       status IN ('ACTIVE', 'READY') AND hold_expires_at <= now()
     )
     RETURNING id, request_id, offer_id, patient_id`,
  );
  for (const reservation of expiredReservations.rows) {
    await database.transaction(async (transaction) => {
      await transaction.query(
        `UPDATE pharmacy_offers
         SET status = 'EXPIRED', updated_at = now()
         WHERE id = $1 AND status IN ('HOLD_PENDING', 'HELD')`,
        [reservation.offer_id],
      );
      await transaction.query(
        `UPDATE medicine_requests
         SET status = CASE WHEN expires_at > now() THEN 'ACTIVE' ELSE 'EXPIRED' END,
             updated_at = now(), version = version + 1
         WHERE id = $1 AND status IN ('HOLD_PENDING', 'RESERVED', 'READY')`,
        [reservation.request_id],
      );
      await createNotification(transaction, {
        userId: reservation.patient_id,
        eventType: "RESERVATION_EXPIRED",
        title: "انتهت مدة الحجز",
        body: "انتهى الحجز المؤقت. افتح دوائي لمراجعة الطلب.",
        resourceType: "REQUEST",
        resourceId: reservation.request_id,
      });
    });
  }

  await database.query(
    `UPDATE pharmacy_offers SET status = 'EXPIRED', updated_at = now()
     WHERE status = 'ACTIVE' AND expires_at <= now()`,
  );
  await database.query(
    `UPDATE request_dispatches SET status = 'EXPIRED'
     WHERE status IN ('SENT', 'VIEWED')
       AND request_id IN (
         SELECT id FROM medicine_requests
         WHERE status IN ('EXPIRED', 'CANCELLED', 'COMPLETED', 'BLOCKED')
       )`,
  );

  const expiredFiles = await database.query<{ id: string }>(
    `SELECT id FROM secure_files
     WHERE status = 'READY' AND delete_at IS NOT NULL AND delete_at <= now()
     LIMIT 100`,
  );
  for (const file of expiredFiles.rows) {
    await deleteEncryptedImage(database, file.id);
  }

  const { dispatchFollowUpBatches } = await import("./matching");
  await dispatchFollowUpBatches(database);

  const { processNotificationOutbox } = await import("./notifications");
  await processNotificationOutbox(database);
  await database.query(
    `DELETE FROM rate_limits WHERE expires_at < now() - interval '1 hour'`,
  );
  await database.query(
    `DELETE FROM idempotency_keys WHERE expires_at <= now()`,
  );
  await database.query(
    `UPDATE password_reset_tokens SET used_at = now()
     WHERE used_at IS NULL AND expires_at <= now()`,
  );

  return {
    requestsExpired: expiredRequests.rowCount,
    reservationsExpired: expiredReservations.rowCount,
    filesDeleted: expiredFiles.rowCount,
  };
}
