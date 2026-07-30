import { randomUUID } from "node:crypto";
import type { Database, DbExecutor } from "../db/client";
import { createNotification } from "./notifications";

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
}

interface RankedCandidate extends BranchCandidate {
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

function isBranchOpen(
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

function scoreCandidate(
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

  const distanceScore = Math.max(0, 1 - distanceKm / request.radius_km);
  const responseScore = candidate.response_rate ?? 0.55;
  const speedScore = Math.max(
    0,
    1 - (candidate.average_response_seconds ?? 300) / 900,
  );
  const serviceFit =
    (request.delivery_preferred && candidate.delivery_enabled) ||
    (request.pickup_preferred && candidate.pickup_enabled)
      ? 1
      : 0.35;
  const score =
    0.42 * distanceScore +
    0.25 * responseScore +
    0.18 * speedScore +
    0.15 * serviceFit;
  const reasons = [
    `${distanceKm.toFixed(2)} km`,
    candidate.delivery_enabled ? "delivery" : "pickup",
    `response:${Math.round(responseScore * 100)}`,
  ];

  return { ...candidate, distanceKm, score, reasons };
}

export async function dispatchRequest(
  database: Database,
  request: MatchRequest,
): Promise<number> {
  const latitudeDelta = request.radius_km / 111;
  const longitudeDelta =
    request.radius_km /
    (111 * Math.max(0.2, Math.cos(radians(request.latitude))));

  const result = await database.query<BranchCandidate>(
    `SELECT
       b.id, p.owner_user_id, b.latitude, b.longitude, b.opening_hours,
       b.timezone, b.pickup_enabled, b.delivery_enabled,
       rm.response_rate, rm.average_response_seconds
     FROM pharmacy_branches b
     JOIN pharmacies p ON p.id = b.pharmacy_id
     JOIN users u ON u.id = p.owner_user_id
     LEFT JOIN reliability_metrics rm ON rm.branch_id = b.id
     WHERE p.verification_status = 'VERIFIED'
       AND b.operational_status = 'ACTIVE'
       AND b.accepting_requests = true
       AND u.status = 'ACTIVE'
       AND b.latitude BETWEEN $1 AND $2
       AND b.longitude BETWEEN $3 AND $4`,
    [
      request.latitude - latitudeDelta,
      request.latitude + latitudeDelta,
      request.longitude - longitudeDelta,
      request.longitude + longitudeDelta,
    ],
  );

  const ranked = result.rows
    .map((candidate) => scoreCandidate(request, candidate))
    .filter((candidate): candidate is RankedCandidate => candidate !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, request.radius_km === 2 ? 6 : 8);

  await database.transaction(async (transaction) => {
    for (const candidate of ranked) {
      const inserted = await transaction.query(
        `INSERT INTO request_dispatches
          (id, request_id, branch_id, distance_km, match_score, match_reasons)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)
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

  return ranked.length;
}

export async function markNoMatchIfEmpty(
  database: DbExecutor,
  requestId: string,
): Promise<void> {
  await database.query(
    `UPDATE medicine_requests r
     SET status = 'NO_MATCH', updated_at = now(), version = version + 1
     WHERE r.id = $1
       AND r.status = 'ACTIVE'
       AND NOT EXISTS (
         SELECT 1 FROM request_dispatches d WHERE d.request_id = r.id
       )`,
    [requestId],
  );
}
