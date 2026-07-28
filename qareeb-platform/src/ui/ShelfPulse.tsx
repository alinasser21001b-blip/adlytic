import type {
  DemandSignalEvent,
  PrescriptionClass,
  RadarEvent,
} from "../domain/contracts";

interface ShelfPulseProps {
  demandEvents: readonly DemandSignalEvent[];
  radarEvents: readonly RadarEvent[];
  prescriptionClass?: PrescriptionClass;
  consentGranted: boolean;
}

interface PulseNode {
  id: string;
  label: string;
  active: boolean;
  notRequired?: boolean;
  isLatest: boolean;
}

export function ShelfPulse({
  demandEvents,
  radarEvents,
  prescriptionClass,
  consentGranted,
}: ShelfPulseProps) {
  const latestRadarType = radarEvents.at(-1)?.type;
  const latestDemandStage = demandEvents.at(-1)?.stage;
  const isOtc = prescriptionClass === "OTC";

  const nodes: readonly PulseNode[] = [
    {
      id: "search",
      label: "بحث",
      active: demandEvents.some((event) => event.stage === "S0"),
      isLatest: radarEvents.length === 0 && latestDemandStage === "S0",
    },
    {
      id: "consent",
      label: "موافقة",
      active: consentGranted,
      notRequired: isOtc,
      isLatest: consentGranted && radarEvents.length === 0,
    },
    {
      id: "broadcast",
      label: "طلب مجهول",
      active: radarEvents.some((event) => event.type === "BroadcastDispatched"),
      isLatest: latestRadarType === "BroadcastDispatched",
    },
    {
      id: "review",
      label: "مراجعة صيدلي",
      active: radarEvents.some((event) => event.type === "PharmacyReviewing"),
      isLatest:
        latestRadarType === "PharmacyReviewing" ||
        latestRadarType === "PharmacyDeclined" ||
        latestRadarType === "PharmacyConfirmed" ||
        latestRadarType === "PrescriptionAccessGranted" ||
        latestRadarType === "PrescriptionMatched",
    },
    {
      id: "hold",
      label: "حجز",
      active: radarEvents.some((event) => event.type === "HoldActivated"),
      isLatest:
        latestRadarType === "HoldActivated" ||
        latestRadarType === "HoldExpired" ||
        latestRadarType === "DispensingConfirmed",
    },
  ];

  return (
    <nav className="shelf-pulse" aria-label="مراحل رحلة توفر الدواء">
      <ol>
        {nodes.map((node, index) => (
          <li
            key={node.id}
            className={[
              node.active ? "is-active" : "",
              node.notRequired && !node.active ? "is-not-required" : "",
              node.isLatest && node.active ? "is-latest" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-current={node.isLatest && node.active ? "step" : undefined}
          >
            <span className="pulse-marker" aria-hidden="true" />
            <span className="pulse-label">{node.label}</span>
            {node.notRequired && !node.active ? (
              <span className="pulse-note">لا تلزم</span>
            ) : null}
            {index < nodes.length - 1 ? (
              <span className="pulse-connector" aria-hidden="true" />
            ) : null}
          </li>
        ))}
      </ol>
    </nav>
  );
}

