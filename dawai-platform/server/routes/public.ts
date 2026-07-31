import { Hono } from "hono";
import { z } from "zod";
import type { Database } from "../db/client";
import { ApiError } from "../errors";
import { haversineDistanceKm } from "../services/matching";
import type { AppVariables } from "../types";

const locationQuery = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusKm: z.coerce.number().min(0.5).max(20).default(5),
});

export function publicRoutes(database: Database) {
  const routes = new Hono<{ Variables: AppVariables }>();

  routes.get("/medicines/search", async (context) => {
    const query = z
      .string()
      .trim()
      .min(2)
      .max(100)
      .parse(context.req.query("q"));
    const normalized = query.toLocaleLowerCase("en-US");
    const result = await database.query(
      `SELECT DISTINCT
         mp.id, mp.brand_name, mp.strength, mp.dosage_form, mp.pack_size,
         m.generic_name, m.classification
       FROM medicine_presentations mp
       JOIN medicines m ON m.id = mp.medicine_id
       LEFT JOIN medicine_aliases ma ON ma.presentation_id = mp.id
       WHERE m.active = true
         AND (
           lower(mp.brand_name) LIKE '%' || $1 || '%'
           OR lower(m.generic_name) LIKE '%' || $1 || '%'
           OR ma.normalized_alias LIKE '%' || $1 || '%'
         )
       ORDER BY mp.brand_name
       LIMIT 20`,
      [normalized],
    );
    return context.json({ data: result.rows });
  });

  routes.get("/pharmacies", async (context) => {
    const location = locationQuery.parse(context.req.query());
    const result = await database.query<{
      id: string;
      pharmacy_id: string;
      pharmacy_name: string;
      branch_name: string;
      district: string;
      address: string;
      latitude: number;
      longitude: number;
      pickup_enabled: boolean;
      delivery_enabled: boolean;
      accepting_requests: boolean;
      response_rate: number | null;
      average_response_seconds: number | null;
      successful_reservations: number | null;
    }>(
      `SELECT
         b.id, p.id AS pharmacy_id, p.name AS pharmacy_name,
         b.name AS branch_name, b.district, b.address, b.latitude, b.longitude,
         b.pickup_enabled, b.delivery_enabled, b.accepting_requests,
         rm.response_rate, rm.average_response_seconds, rm.successful_reservations
       FROM pharmacy_branches b
       JOIN pharmacies p ON p.id = b.pharmacy_id
       LEFT JOIN reliability_metrics rm ON rm.branch_id = b.id
       WHERE p.verification_status = 'VERIFIED'
         AND b.operational_status = 'ACTIVE'`,
    );
    const data = result.rows
      .map((branch) => ({
        ...branch,
        distanceKm: haversineDistanceKm(
          location.lat,
          location.lng,
          branch.latitude,
          branch.longitude,
        ),
      }))
      .filter((branch) => branch.distanceKm <= location.radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 50);
    return context.json({ data });
  });

  routes.get("/pharmacies/:branchId", async (context) => {
    const result = await database.query(
      `SELECT
         b.id, p.id AS pharmacy_id, p.name AS pharmacy_name,
         b.name AS branch_name, b.governorate, b.district, b.address, b.landmark,
         b.latitude, b.longitude, b.opening_hours, b.pickup_enabled,
         b.delivery_enabled, b.accepting_requests, p.verification_status,
         rm.response_rate, rm.average_response_seconds,
         rm.successful_reservations, rm.completed_requests,
         rm.confirmed_not_found
       FROM pharmacy_branches b
       JOIN pharmacies p ON p.id = b.pharmacy_id
       LEFT JOIN reliability_metrics rm ON rm.branch_id = b.id
       WHERE b.id = $1
         AND p.verification_status = 'VERIFIED'
         AND b.operational_status = 'ACTIVE'
       LIMIT 1`,
      [context.req.param("branchId")],
    );
    if (!result.rows[0]) {
      throw new ApiError(404, "PHARMACY_NOT_FOUND", "الصيدلية غير موجودة.");
    }
    return context.json({ data: result.rows[0] });
  });

  routes.get("/availability", async (context) => {
    const query = z
      .object({
        medicine: z.string().trim().min(2).max(120),
        lat: z.coerce.number().min(-90).max(90),
        lng: z.coerce.number().min(-180).max(180),
        radiusKm: z.coerce.number().min(0.5).max(20).default(5),
      })
      .parse(context.req.query());
    const result = await database.query<{
      signal_id: string;
      medicine_name: string;
      state: string;
      source: string;
      observed_at: string;
      expires_at: string;
      branch_id: string;
      pharmacy_name: string;
      district: string;
      latitude: number;
      longitude: number;
      pickup_enabled: boolean;
      delivery_enabled: boolean;
      latest_price_iqd: number | null;
    }>(
      `SELECT DISTINCT ON (s.branch_id)
         s.id AS signal_id, s.medicine_name, s.state, s.source,
         s.observed_at, s.expires_at, b.id AS branch_id,
         p.name AS pharmacy_name, b.district, b.latitude, b.longitude,
         b.pickup_enabled, b.delivery_enabled,
         (
           SELECT o.price_iqd FROM pharmacy_offers o
           WHERE o.branch_id = b.id
             AND lower(o.offered_brand) LIKE '%' || lower($1) || '%'
             AND o.created_at > now() - interval '24 hours'
           ORDER BY o.created_at DESC LIMIT 1
         ) AS latest_price_iqd
       FROM availability_signals s
       JOIN pharmacy_branches b ON b.id = s.branch_id
       JOIN pharmacies p ON p.id = b.pharmacy_id
       WHERE lower(s.medicine_name) LIKE '%' || lower($1) || '%'
         AND s.expires_at > now()
         AND s.state IN ('AVAILABLE', 'LOW', 'ORDERABLE')
         AND p.verification_status = 'VERIFIED'
         AND b.operational_status = 'ACTIVE'
       ORDER BY s.branch_id, s.observed_at DESC`,
      [query.medicine],
    );
    const data = result.rows
      .map((signal) => ({
        ...signal,
        distanceKm: haversineDistanceKm(
          query.lat,
          query.lng,
          signal.latitude,
          signal.longitude,
        ),
      }))
      .filter((signal) => signal.distanceKm <= query.radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm);
    return context.json({ data });
  });

  return routes;
}
