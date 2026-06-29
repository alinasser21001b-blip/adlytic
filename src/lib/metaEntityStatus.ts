import { EntityStatus } from "@prisma/client";

/**
 * Map a Meta status / effective_status string to our EntityStatus enum.
 * Unknown or transient review states collapse to ARCHIVED so sync never
 * silently surfaces non-delivering entities as ACTIVE.
 */
export function mapMetaEntityStatus(raw: unknown): EntityStatus {
  const s = String(raw ?? "").toUpperCase();
  switch (s) {
    case "ACTIVE":
      return EntityStatus.ACTIVE;
    case "PAUSED":
    case "CAMPAIGN_PAUSED":
    case "ADSET_PAUSED":
    case "PENDING_REVIEW":
    case "PENDING_BILLING_INFO":
    case "IN_PROCESS":
    case "WITH_ISSUES":
    case "DISAPPROVED":
    case "PREAPPROVED":
      return EntityStatus.PAUSED;
    case "DELETED":
      return EntityStatus.DELETED;
    case "ARCHIVED":
    case "COMPLETED":
      return EntityStatus.ARCHIVED;
    default:
      return EntityStatus.ARCHIVED;
  }
}

/** Meta campaign row shape returned by listCampaigns (subset). */
export type MetaCampaignRow = Record<string, unknown>;

/**
 * Resolve persisted campaign status from a Meta campaign object.
 * Prefers effective_status (actual delivery state) over configured status.
 * Also downgrades ACTIVE when stop_time has passed.
 */
export function resolveCampaignStatusFromMeta(
  row: MetaCampaignRow,
  opts: { now?: Date } = {},
): EntityStatus {
  const effective = row["effective_status"];
  const configured = row["status"];
  const raw =
    effective != null && String(effective).trim() !== ""
      ? effective
      : configured;

  let status = mapMetaEntityStatus(raw);

  // Configured ACTIVE but delivery-blocked effective states (e.g. ADSET_PAUSED).
  if (status === EntityStatus.ACTIVE && effective != null) {
    const eff = String(effective).toUpperCase();
    if (
      eff !== "ACTIVE" &&
      (eff.includes("PAUSED") ||
        eff === "WITH_ISSUES" ||
        eff === "DISAPPROVED" ||
        eff === "PENDING_REVIEW" ||
        eff === "IN_PROCESS" ||
        eff === "PENDING_BILLING_INFO" ||
        eff === "PREAPPROVED")
    ) {
      status = EntityStatus.PAUSED;
    }
  }

  const now = opts.now ?? new Date();
  const stopRaw = row["stop_time"];
  if (status === EntityStatus.ACTIVE && stopRaw != null && stopRaw !== "") {
    const stop = new Date(String(stopRaw));
    if (Number.isFinite(stop.getTime()) && stop.getTime() < now.getTime()) {
      status = EntityStatus.PAUSED;
    }
  }

  return status;
}
