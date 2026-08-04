import { randomUUID } from "node:crypto";
import type { Database, DbExecutor } from "../db/client";
import { createNotification } from "./notifications";

/** Configurable ranking weights — Product Blueprint § matching. No pay-to-rank. */
export const MATCH_WEIGHTS = {
  distance: Number(process.env.MATCH_WEIGHT_DISTANCE ?? 0.28),
  recentExactAvailability: Number(
    process.env.MATCH_WEIGHT_RECENT_AVAILABILITY ?? 0.22,
  ),
  responseProbability: Number(process.env.MATCH_WEIGHT_RESPONSE ?? 0.17),
  fulfillmentReliability: Number(
    process.env.MATCH_WEIGHT_FULFILLMENT ?? 0.13,
  ),
  openWindowFit: Number(process.env.MATCH_WEIGHT_OPEN_WINDOW ?? 0.1),
  serviceFit: Number(process.env.MATCH_WEIGHT_SERVICE ?? 0.06),
  workloadBalance: Number(process.env.MATCH_WEIGHT_WORKLOAD ?? 0.04),
} as const;

interface MatchRequest {
  id: string;
  medicine_name: string;
  latitude: number;
  longitude: number;
  radius_km: number;
  pickup_preferred: boolean;
  delivery_preferred: boolean;
}

interface BranchCandidate {
  id: string;
  owner_user_id: string;
  latitude: number;
  longitude: number;
  opening_hours: Record<string, [string, string][]>;
  timezone: string;
  pickup_enabled: boolean;
  delivery_enabled: boolean;
  response_rate: number | null;
  average_response_seconds: number | null;
  successful_reservations: number | null;
  completed_requests: number | null;
  confirmed_not_found: number | null;
  recent_exact_score: number | null;
  open_dispatches: number | null;
  spam_ignored: number | null;
}

export interface RankedCandidate extends BranchCandidate {
  distanceKm: number;
  score: number;
  reasons: string[];
}

function radians(value: number): number {
  return (value * Math.PI) / 180;
}

export function haversineDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const earthRadiusKm = 6371;
  const dLat = radians(lat2 - lat1);
  const dLng = radians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(lat1)) *
      Math.cos(radians(lat2)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(a));
}

export function isBranchOpen(
  openingHours: Record<string, [string, string][]>,
  timezone: string,
  now = new Date(),
): boolean {
  if (!openingHours || Object.keys(openingHours).length === 0) return true;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone || "Asia/Baghdad",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "Sun";
  const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  const dayIndex: Record<string, string> = {
    Sun: "0",
    Mon: "1",
    Tue: "2",
    Wed: "3",
    Thu: "4",
    Fri: "5",
    Sat: "6",
  };
  const current = `${hour === "24" ? "00" : hour}:${minute}`;
  return (openingHours[dayIndex[weekday]] ?? []).some(
    ([start, end]) => start <= current && current <= end,
  );
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function scoreCandidate(
  request: MatchRequest,
  candidate: BranchCandidate,
): RankedCandidate | null {
  const distanceKm = haversineDistanceKm(
    request.latitude,
    request.longitude,
    candidate.latitude,
    candidate.longitude,
  );
  if (distanceKm > request.radius_km) return null;
  if (!isBranchOpen(candidate.opening_hours, candidate.timezone)) return null;

  const distanceScore = clamp01(1 - distanceKm / request.radius_km);
  const recentExact = clamp01(candidate.recent_exact_score ?? 0);
  const responseScore = clamp01(candidate.response_rate ?? 0.55);
  const completed = candidate.completed_requests ?? 0;
  const confirmedNotFound = candidate.confirmed_not_found ?? 0;
  const fulfillmentDenom = Math.max(1, completed + confirmedNotFound);
  const fulfillmentScore = clamp01(1 - confirmedNotFound / fulfillmentDenom);
  const openWindowFit = 1;
  const serviceFit =
    request.pickup_preferred && candidate.pickup_enabled
      ? 1
      : request.delivery_preferred && candidate.delivery_enabled
        ? 0.7
        : 0.35;
  const openDispatches = candidate.open_dispatches ?? 0;
  const workloadScore = clamp01(1 - openDispatches / 8);
  const spamPenalty = Math.min(0.25, (candidate.spam_ignored ?? 0) * 0.05);
  const stalePenalty = recentExact === 0 ? 0.03 : 0;

  const score =
    MATCH_WEIGHTS.distance * distanceScore +
    MATCH_WEIGHTS.recentExactAvailability * recentExact +
    MATCH_WEIGHTS.responseProbability * responseScore +
    MATCH_WEIGHTS.fulfillmentReliability * fulfillmentScore +
    MATCH_WEIGHTS.openWindowFit * openWindowFit +
    MATCH_WEIGHTS.serviceFit * serviceFit +
    MATCH_WEIGHTS.workloadBalance * workloadScore -
    spamPenalty -
    stalePenalty;

  return {
    ...candidate,
    distanceKm,
    score,
    reasons: [
      `${distanceKm.toFixed(2)}km`,
      `recent:${recentExact.toFixed(2)}`,
      `response:${Math.round(responseScore * 100)}`,
      `fulfill:${fulfillmentScore.toFixed(2)}`,
      "organic",
    ],
  };
}

function dispatchCap(radiusKm: number): number {
  if (radiusKm <= 2) return 6;
  return 8;
}

export async function dispatchRequest(
  database: Database,
  request: MatchRequest,
): Promise<number> {
  const latitudeDelta = request.radius_km / 111;
  const longitudeDelta =
    request.radius_km /
    (111 * Math.max(0.2, Math.cos(radians(request.latitude))));
  const medicinePattern = `%${request.medicine_name.toLocaleLowerCase("en-US")}%`;

  const result = await database.query<BranchCandidate>(
    `SELECT
       b.id, p.owner_user_id, b.latitude, b.longitude, b.opening_hours,
       b.timezone, b.pickup_enabled, b.delivery_enabled,
       rm.response_rate, rm.average_response_seconds,
       rm.successful_reservations, rm.completed_requests, rm.confirmed_not_found,
       (
         SELECT CASE
           WHEN max(s.observed_at) IS NULL THEN 0
           ELSE GREATEST(
             0,
             1 - EXTRACT(EPOCH FROM (now() - max(s.observed_at))) / 3600
           )
         END
         FROM availability_signals s
         WHERE s.branch_id = b.id
           AND s.expires_at > now()
           AND s.state IN ('AVAILABLE', 'LOW')
           AND s.source = 'PHARMACIST_CONFIRMATION'
           AND lower(s.medicine_name) LIKE $5
       ) AS recent_exact_score,
       (
         SELECT count(*)::int FROM request_dispatches d
         JOIN medicine_requests r ON r.id = d.request_id
         WHERE d.branch_id = b.id
           AND d.status IN ('SENT', 'VIEWED')
           AND r.status IN ('ACTIVE', 'NO_MATCH', 'HOLD_PENDING')
       ) AS open_dispatches,
       (
         SELECT count(*)::int FROM request_dispatches d
         WHERE d.branch_id = b.id
           AND d.status = 'EXPIRED'
           AND d.sent_at > now() - interval '7 days'
       ) AS spam_ignored
     FROM pharmacy_branches b
     JOIN pharmacies p ON p.id = b.pharmacy_id
     JOIN users u ON u.id = p.owner_user_id
     LEFT JOIN reliability_metrics rm ON rm.branch_id = b.id
     WHERE p.verification_status = 'VERIFIED'
       AND b.operational_status = 'ACTIVE'
       AND b.accepting_requests = true
       AND u.status = 'ACTIVE'
       AND b.latitude BETWEEN $1 AND $2
       AND b.longitude BETWEEN $3 AND $4
       AND NOT EXISTS (
         SELECT 1 FROM request_dispatches existing
         WHERE existing.request_id = $6
           AND existing.branch_id = b.id
       )
       AND NOT EXISTS (
         SELECT 1 FROM request_dispatches declined
         WHERE declined.request_id = $6
           AND declined.branch_id = b.id
           AND declined.status = 'DECLINED'
       )`,
    [
      request.latitude - latitudeDelta,
      request.latitude + latitudeDelta,
      request.longitude - longitudeDelta,
      request.longitude + longitudeDelta,
      medicinePattern,
      request.id,
    ],
  );

  const existing = await database.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM request_dispatches WHERE request_id = $1`,
    [request.id],
  );
  const alreadyDispatched = existing.rows[0]?.count ?? 0;
  const cap = dispatchCap(request.radius_km);
  const remainingSlots = Math.max(0, cap - alreadyDispatched);
  if (remainingSlots === 0) return 0;

  // First 2km wave: notify at most 3. Later waves (lifecycle follow-up / expansion)
  // fill remaining slots up to the radius cap — true 3+3 staging, not silent dual-send.
  const batchSize =
    request.radius_km <= 2 && alreadyDispatched === 0
      ? Math.min(3, remainingSlots)
      : remainingSlots;

  const ranked = result.rows
    .map((candidate) => scoreCandidate(request, candidate))
    .filter((candidate): candidate is RankedCandidate => candidate !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, batchSize);

  let insertedCount = 0;
  await database.transaction(async (transaction) => {
    for (const candidate of ranked) {
      const inserted = await transaction.query(
        `INSERT INTO request_dispatches
          (id, request_id, branch_id, distance_km, match_score, match_reasons, notify_after)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, now())
         ON CONFLICT (request_id, branch_id) DO NOTHING
         RETURNING id`,
        [
          randomUUID(),
          request.id,
          candidate.id,
          candidate.distanceKm,
          candidate.score,
          JSON.stringify(candidate.reasons),
        ],
      );
      if (inserted.rowCount > 0) {
        insertedCount += 1;
        await createNotification(transaction, {
          userId: candidate.owner_user_id,
          eventType: "NEARBY_REQUEST",
          title: "طلب دواء قريب جديد",
          body: "يوجد طلب مطابق ضمن نطاق فرعك. افتح دوائي لمراجعته.",
          resourceType: "REQUEST",
          resourceId: request.id,
        });
      }
    }
  });

  return insertedCount;
}

/** Second 2km batch (up to +3) when first wave produced no valid offer. */
export async function dispatchFollowUpBatches(
  database: Database,
): Promise<number> {
  const waiting = await database.query<MatchRequest>(
    `SELECT id, medicine_name, latitude, longitude, radius_km,
            pickup_preferred, delivery_preferred
     FROM medicine_requests
     WHERE status = 'ACTIVE'
       AND radius_km <= 2
       AND expires_at > now()
       AND created_at <= now() - interval '45 seconds'
       AND NOT EXISTS (
         SELECT 1 FROM pharmacy_offers o
         WHERE o.request_id = medicine_requests.id
           AND o.status = 'ACTIVE'
           AND o.expires_at > now()
       )
       AND (
         SELECT count(*) FROM request_dispatches d
         WHERE d.request_id = medicine_requests.id
       ) < 6
     ORDER BY created_at ASC
     LIMIT 20`,
  );
  let total = 0;
  for (const request of waiting.rows) {
    total += await dispatchRequest(database, request);
  }
  return total;
}

export async function recordPharmacyResponseMetrics(
  database: DbExecutor,
  branchId: string,
  responseSeconds: number,
): Promise<void> {
  await database.query(
    `INSERT INTO reliability_metrics (branch_id, response_rate, average_response_seconds)
     VALUES ($1, 1, $2)
     ON CONFLICT (branch_id) DO UPDATE SET
       response_rate = LEAST(
         1,
         (reliability_metrics.response_rate * 0.85) + 0.15
       ),
       average_response_seconds = GREATEST(
         0,
         ROUND(
           (reliability_metrics.average_response_seconds * 0.8) + ($2 * 0.2)
         )::int
       ),
       updated_at = now()`,
    [branchId, Math.max(0, Math.round(responseSeconds))],
  );
}

export async function recordConfirmedNotFound(
  database: DbExecutor,
  branchId: string,
): Promise<void> {
  await database.query(
    `INSERT INTO reliability_metrics (branch_id, confirmed_not_found)
     VALUES ($1, 1)
     ON CONFLICT (branch_id) DO UPDATE SET
       confirmed_not_found = reliability_metrics.confirmed_not_found + 1,
       updated_at = now()`,
    [branchId],
  );
}
