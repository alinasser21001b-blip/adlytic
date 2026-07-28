import type {
  MedicinePresentation,
  RadarEvent,
} from "../domain/contracts";

export type ScenarioId =
  | "success"
  | "otc"
  | "rx"
  | "controlled"
  | "ambiguous"
  | "gudea-unavailable"
  | "decline"
  | "timeout";

export interface DemoScenario {
  id: ScenarioId;
  label: string;
  description: string;
  query: string;
  outcome: "SUCCESS" | "CONTROLLED_HANDOFF" | "ALL_DECLINED" | "TIMEOUT";
  gudeaUnavailable?: boolean;
}

export const DEMO_SCENARIOS: readonly DemoScenario[] = [
  {
    id: "success",
    label: "حجز ناجح",
    description: "تأكيد صيدلية وحجز مؤقت موثّق",
    query: "بنادول إكسترا",
    outcome: "SUCCESS",
  },
  {
    id: "otc",
    label: "بدون وصفة",
    description: "طلب مباشر لعرض بروفين محدد",
    query: "بروفين 400",
    outcome: "SUCCESS",
  },
  {
    id: "rx",
    label: "بوصفة",
    description: "موافقة وتشفير ثم وصول صيدلي مدقّق",
    query: "أموكسيل 500",
    outcome: "SUCCESS",
  },
  {
    id: "controlled",
    label: "دواء خاضع",
    description: "منع البث العام ومسار صيدلية مرخّصة",
    query: "فاليوم 5",
    outcome: "CONTROLLED_HANDOFF",
  },
  {
    id: "ambiguous",
    label: "اسم ملتبس",
    description: "اختيار صريح للقوة والشكل والعبوة",
    query: "بنادول",
    outcome: "SUCCESS",
  },
  {
    id: "gudea-unavailable",
    label: "Gudea غير متاح",
    description: "فشل مرجع حكومي لا يوقف الرحلة",
    query: "غلوكوفاج 500",
    outcome: "SUCCESS",
    gudeaUnavailable: true,
  },
  {
    id: "decline",
    label: "اعتذار الصيدليات",
    description: "اعتذاران صادران كحدثين حقيقيين",
    query: "زيرتك 10",
    outcome: "ALL_DECLINED",
  },
  {
    id: "timeout",
    label: "انتهاء المهلة",
    description: "لا ادعاء بالتوفر عند غياب التأكيد",
    query: "فنتولين بخاخ",
    outcome: "TIMEOUT",
  },
] as const;

export const DEMO_PHARMACIES = {
  mansour: {
    id: "pharmacy-mansour-17",
    name: "صيدلية المنصور المرخّصة — نموذج",
    pharmacistId: "pharmacist-demo-17",
    phone: "+9647800000017",
    whatsapp: "9647800000017",
    address: "شارع 14 رمضان، المنصور، بغداد — عنوان تجريبي",
  },
  yarmouk: {
    id: "pharmacy-yarmouk-04",
    name: "صيدلية اليرموك المرخّصة — نموذج",
    pharmacistId: "pharmacist-demo-04",
    phone: "+9647800000004",
    whatsapp: "9647800000004",
    address: "شارع الأربع شوارع، اليرموك، بغداد — عنوان تجريبي",
  },
} as const;

export interface ScheduledRadarEvent {
  delayMs: number;
  event: RadarEvent;
}

function at(baseTime: number, offsetMs: number): string {
  return new Date(baseTime + offsetMs).toISOString();
}

export function buildScenarioTimeline(input: {
  scenario: DemoScenario;
  requestId: string;
  medicine: MedicinePresentation;
  startedAt: string;
  auditId: string;
}): readonly ScheduledRadarEvent[] {
  const baseTime = new Date(input.startedAt).getTime();
  if (!Number.isFinite(baseTime)) {
    throw new Error("INVALID_SIMULATION_START");
  }

  if (input.scenario.outcome === "CONTROLLED_HANDOFF") {
    return [];
  }

  const events: ScheduledRadarEvent[] = [
    {
      delayMs: 0,
      event: {
        type: "RequestCreated",
        at: at(baseTime, 0),
        requestId: input.requestId,
      },
    },
    {
      delayMs: 300,
      event: {
        type: "BroadcastDispatched",
        at: at(baseTime, 300),
        licensedRecipients: 2,
      },
    },
    {
      delayMs: 760,
      event: {
        type: "PharmacyReviewing",
        at: at(baseTime, 760),
        pharmacyId: DEMO_PHARMACIES.yarmouk.id,
      },
    },
  ];

  if (input.scenario.outcome === "TIMEOUT") {
    return [
      ...events,
      {
        delayMs: 2_150,
        event: {
          type: "RequestTimedOut",
          at: at(baseTime, 2_150),
          requestId: input.requestId,
        },
      },
    ];
  }

  const firstDecline: ScheduledRadarEvent = {
    delayMs: 1_180,
    event: {
      type: "PharmacyDeclined",
      at: at(baseTime, 1_180),
      pharmacyId: DEMO_PHARMACIES.yarmouk.id,
    },
  };
  const secondReview: ScheduledRadarEvent = {
    delayMs: 1_520,
    event: {
      type: "PharmacyReviewing",
      at: at(baseTime, 1_520),
      pharmacyId: DEMO_PHARMACIES.mansour.id,
    },
  };

  if (input.scenario.outcome === "ALL_DECLINED") {
    return [
      ...events,
      firstDecline,
      secondReview,
      {
        delayMs: 2_050,
        event: {
          type: "PharmacyDeclined",
          at: at(baseTime, 2_050),
          pharmacyId: DEMO_PHARMACIES.mansour.id,
        },
      },
    ];
  }

  const confirmationAt = at(baseTime, 2_060);
  const confirmation: ScheduledRadarEvent = {
    delayMs: 2_060,
    event: {
      type: "PharmacyConfirmed",
      at: confirmationAt,
      confirmation: {
        pharmacyId: DEMO_PHARMACIES.mansour.id,
        pharmacyName: DEMO_PHARMACIES.mansour.name,
        canonicalId: input.medicine.canonicalId,
        amountIqd: (input.medicine.reportedPriceIqd ?? 7_000) + 250,
        confirmedAt: confirmationAt,
      },
    },
  };

  const prescriptionAccess: ScheduledRadarEvent[] =
    input.medicine.prescriptionClass === "RX"
      ? [
          {
            delayMs: 2_360,
            event: {
              type: "PrescriptionAccessGranted",
              at: at(baseTime, 2_360),
              pharmacyId: DEMO_PHARMACIES.mansour.id,
              auditId: input.auditId,
            },
          },
        ]
      : [];

  return [
    ...events,
    firstDecline,
    secondReview,
    confirmation,
    ...prescriptionAccess,
    {
      delayMs: 2_660,
      event: {
        type: "PrescriptionMatched",
        at: at(baseTime, 2_660),
        pharmacyId: DEMO_PHARMACIES.mansour.id,
        canonicalId: input.medicine.canonicalId,
      },
    },
    {
      delayMs: 3_050,
      event: {
        type: "HoldActivated",
        at: at(baseTime, 3_050),
        reference: `QRB-${input.requestId.slice(-6).toUpperCase()}`,
        expiresAt: at(baseTime, 10 * 60 * 1_000),
      },
    },
  ];
}

export function getScenario(id: ScenarioId): DemoScenario {
  const scenario = DEMO_SCENARIOS.find((item) => item.id === id);
  if (!scenario) {
    throw new Error("UNKNOWN_SCENARIO");
  }
  return scenario;
}

