import { createHash, randomUUID } from "node:crypto";
import { Hono } from "hono";
import { z } from "zod";
import type { Database } from "../db/client";
import { ApiError } from "../errors";
import { requireAuth } from "../security/auth";
import { enforceRateLimit } from "../security/rate-limit";
import { createNotification } from "../services/notifications";
import type { AppVariables } from "../types";

async function authorizedConversation(
  database: Database,
  conversationId: string,
  userId: string,
) {
  const result = await database.query<{
    id: string;
    patient_id: string;
    pharmacy_owner_id: string;
    reservation_status: string;
  }>(
    `SELECT c.id, c.patient_id, p.owner_user_id AS pharmacy_owner_id,
            res.status AS reservation_status
     FROM conversations c
     JOIN reservations res ON res.id = c.reservation_id
     JOIN pharmacy_branches b ON b.id = c.branch_id
     JOIN pharmacies p ON p.id = b.pharmacy_id
     WHERE c.id = $1
       AND ($2 = c.patient_id OR $2 = p.owner_user_id)
     LIMIT 1`,
    [conversationId, userId],
  );
  const conversation = result.rows[0];
  if (!conversation) {
    throw new ApiError(404, "CONVERSATION_NOT_FOUND", "المحادثة غير موجودة.");
  }
  return conversation;
}

export function sharedRoutes(database: Database) {
  const routes = new Hono<{ Variables: AppVariables }>();
  routes.use("*", requireAuth(database));

  routes.get("/notifications", async (context) => {
    const result = await database.query(
      `SELECT * FROM notifications WHERE user_id = $1
       ORDER BY created_at DESC LIMIT 100`,
      [context.get("user").id],
    );
    return context.json({ data: result.rows });
  });

  routes.post("/notifications/:notificationId/read", async (context) => {
    const result = await database.query(
      `UPDATE notifications SET read_at = COALESCE(read_at, now())
       WHERE id = $1 AND user_id = $2 RETURNING id`,
      [context.req.param("notificationId"), context.get("user").id],
    );
    if (!result.rows[0]) {
      throw new ApiError(404, "NOTIFICATION_NOT_FOUND", "الإشعار غير موجود.");
    }
    return context.json({ data: { read: true } });
  });

  routes.get("/conversations", async (context) => {
    const user = context.get("user");
    const result = await database.query(
      `SELECT
         c.id, c.reservation_id, c.created_at, res.status AS reservation_status,
         r.medicine_name, p.name AS pharmacy_name,
         (SELECT body FROM messages m WHERE m.conversation_id = c.id
          ORDER BY m.created_at DESC LIMIT 1) AS last_message
       FROM conversations c
       JOIN reservations res ON res.id = c.reservation_id
       JOIN medicine_requests r ON r.id = res.request_id
       JOIN pharmacy_branches b ON b.id = c.branch_id
       JOIN pharmacies p ON p.id = b.pharmacy_id
       WHERE c.patient_id = $1 OR p.owner_user_id = $1
       ORDER BY c.created_at DESC`,
      [user.id],
    );
    return context.json({ data: result.rows });
  });

  routes.get("/conversations/:conversationId/messages", async (context) => {
    await authorizedConversation(
      database,
      context.req.param("conversationId"),
      context.get("user").id,
    );
    const result = await database.query(
      `SELECT m.id, m.sender_user_id, u.name AS sender_name, m.body, m.created_at
       FROM messages m
       JOIN users u ON u.id = m.sender_user_id
       WHERE m.conversation_id = $1
       ORDER BY m.created_at ASC LIMIT 200`,
      [context.req.param("conversationId")],
    );
    return context.json({ data: result.rows });
  });

  routes.post("/conversations/:conversationId/messages", async (context) => {
    const body = z
      .object({ body: z.string().trim().min(1).max(1000) })
      .strict()
      .parse(await context.req.json());
    const user = context.get("user");
    await enforceRateLimit(database, "message", user.id, 30, 60);
    const conversation = await authorizedConversation(
      database,
      context.req.param("conversationId"),
      user.id,
    );
    if (
      !["PENDING_ACK", "ACTIVE", "READY"].includes(
        conversation.reservation_status,
      )
    ) {
      throw new ApiError(
        409,
        "CONVERSATION_CLOSED",
        "المحادثة متاحة أثناء الحجز النشط فقط.",
      );
    }
    const messageId = randomUUID();
    const recipientId =
      user.id === conversation.patient_id
        ? conversation.pharmacy_owner_id
        : conversation.patient_id;
    await database.transaction(async (transaction) => {
      await transaction.query(
        `INSERT INTO messages (id, conversation_id, sender_user_id, body)
         VALUES ($1, $2, $3, $4)`,
        [messageId, conversation.id, user.id, body.body],
      );
      await createNotification(transaction, {
        userId: recipientId,
        eventType: "NEW_MESSAGE",
        title: "رسالة جديدة",
        body: "لديك رسالة جديدة مرتبطة بحجز نشط.",
        resourceType: "CONVERSATION",
        resourceId: conversation.id,
      });
    });
    return context.json(
      {
        data: {
          id: messageId,
          conversationId: conversation.id,
          senderUserId: user.id,
          body: body.body,
          createdAt: new Date().toISOString(),
        },
      },
      201,
    );
  });

  routes.post("/reports", async (context) => {
    const body = z
      .object({
        targetType: z.enum(["USER", "PHARMACY", "REQUEST", "RESERVATION"]),
        targetId: z.string().min(1).max(100),
        category: z.string().trim().min(2).max(100),
        description: z.string().trim().min(10).max(2000),
      })
      .strict()
      .parse(await context.req.json());
    const id = randomUUID();
    await database.query(
      `INSERT INTO reports
        (id, reporter_user_id, target_type, target_id, category, description)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        id,
        context.get("user").id,
        body.targetType,
        body.targetId,
        body.category,
        body.description,
      ],
    );
    return context.json({ data: { id, status: "OPEN" } }, 201);
  });

  routes.post("/device-tokens", async (context) => {
    const body = z
      .object({
        platform: z.enum(["WEB", "IOS", "ANDROID"]),
        pushToken: z.string().trim().min(10).max(4096),
        appVersion: z.string().trim().max(40).optional(),
      })
      .strict()
      .parse(await context.req.json());
    const userId = context.get("user").id;
    const tokenHash = createHash("sha256").update(body.pushToken).digest("hex");
    await database.query(
      `INSERT INTO device_tokens
        (id, user_id, platform, token_hash, push_token, app_version)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, token_hash) DO UPDATE SET
         push_token = EXCLUDED.push_token,
         app_version = EXCLUDED.app_version,
         last_seen_at = now(),
         revoked_at = NULL`,
      [
        randomUUID(),
        userId,
        body.platform,
        tokenHash,
        body.pushToken,
        body.appVersion ?? null,
      ],
    );
    return context.json({ data: { registered: true } }, 201);
  });

  routes.delete("/device-tokens", async (context) => {
    const body = z
      .object({ pushToken: z.string().trim().min(10).max(4096) })
      .strict()
      .parse(await context.req.json());
    const tokenHash = createHash("sha256").update(body.pushToken).digest("hex");
    await database.query(
      `UPDATE device_tokens SET revoked_at = now()
       WHERE user_id = $1 AND token_hash = $2 AND revoked_at IS NULL`,
      [context.get("user").id, tokenHash],
    );
    return context.json({ data: { revoked: true } });
  });

  return routes;
}
