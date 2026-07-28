import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { MEDICINES } from "./data/medicines";
import type {
  AvailabilityBroadcast,
  ConsentRecord,
  DemandSignalEvent,
  EncryptedPrescriptionEnvelope,
  MedicinePresentation,
  PrescriptionAccessAuditEvent,
  RadarEvent,
} from "./domain/contracts";
import {
  createAvailabilityBroadcast,
  createDemandState,
  recordDemandSignal,
  type DemandState,
} from "./domain/demand";
import {
  DemoGudeaAdapter,
  GUDEA_UNAVAILABLE_MESSAGE,
  safeGudeaLookup,
} from "./domain/gudea";
import {
  CONSENT_TERMS,
  createConsentRecord,
  encryptPrescriptionAsset,
  markPrescriptionForDeletion,
  MAX_PRESCRIPTION_BYTES,
  PrescriptionAccessAuditLedger,
  withdrawConsent,
} from "./domain/prescription";
import {
  applyRadarEvent,
  createRadarState,
  type RadarState,
  type RadarStatus,
} from "./domain/radar";
import {
  searchMedicines,
  selectPresentation,
} from "./domain/search";
import {
  buildScenarioTimeline,
  DEMO_PHARMACIES,
  DEMO_SCENARIOS,
  getScenario,
  type DemoScenario,
  type ScenarioId,
} from "./simulation/scenarios";
import { formatCountdown, formatIqd, formatTimestamp } from "./ui/format";
import { ShelfPulse } from "./ui/ShelfPulse";
import {
  TrustLedger,
  type GudeaViewState,
} from "./ui/TrustLedger";

type View =
  | "discovery"
  | "disambiguation"
  | "identity"
  | "consent"
  | "prescription"
  | "controlled"
  | "radar"
  | "success";

type SearchMode = "name" | "package" | "barcode";

interface SimulationRun {
  scenario: DemoScenario;
  requestId: string;
  startedAt: string;
  auditId: string;
  medicine: MedicinePresentation;
  prescriptionId: string | null;
}

const DISTRICT = "المنصور، بغداد";
const COARSE_DISTRICT = "المنصور";
const ANONYMOUS_COHORT = "baghdad-mansour-demo";

const GUDEA_ADAPTER = new DemoGudeaAdapter({
  prices: {
    "IQ-MED-PAN-500-TAB-24": 3_250,
    "IQ-MED-PAN-120-SYR-100": 4_750,
    "IQ-MED-BRU-400-TAB-30": 6_000,
    "IQ-MED-AMX-500-CAP-20": 7_750,
    "IQ-MED-CET-10-TAB-20": 5_750,
    "IQ-MED-SAL-100-INH-200": 11_500,
    "IQ-MED-PXE-500-65-TAB-24": 5_250,
  },
  unavailableIds: new Set(["IQ-MED-MET-500-TAB-30"]),
});

const CLASS_LABELS = {
  OTC: "يُصرف بدون وصفة",
  RX: "يتطلب وصفة",
  CONTROLLED: "دواء خاضع للرقابة",
  UNKNOWN: "تصنيف غير محسوم — يُعامل بأعلى احتياط",
} as const;

const STATUS_COPY: Record<RadarStatus, string> = {
  AWAITING_REQUEST: "يُنشأ الطلب في مصدر الأحداث المحلي.",
  BROADCAST: "أُرسل الطلب المجهول؛ ننتظر حدث مراجعة أو اعتذار أو تأكيد.",
  REVIEWING: "صيدلية مرخّصة تراجع العرض الدوائي الدقيق الآن.",
  ALL_DECLINED: "اعتذرت كل الصيدليات التي استلمت هذا الطلب في المحاكاة.",
  PHARMACY_CONFIRMED:
    "وصل تأكيد الصيدلية والسعر، لكن الحجز لم يبدأ بعد.",
  PRESENTATION_MATCHED:
    "طابق الصيدلي العرض الدوائي؛ ننتظر مرجع الحجز.",
  HOLD_ACTIVE: "فُعّل حجز مؤقت بمرجع فريد.",
  HOLD_EXPIRED: "انتهى الحجز، ولا توجد مطالبة حالية بتوفر محجوز.",
  TIMED_OUT: "انتهت مهلة الطلب بلا تأكيد توفر.",
  DISPENSED: "سُجل استلام تجريبي واكتملت إشارة الطلب.",
};

function makeId(prefix: string): string {
  const value =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${value}`;
}

function errorMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : "UNKNOWN";
  const messages: Record<string, string> = {
    UNSUPPORTED_PRESCRIPTION_TYPE:
      "نوع الملف غير مدعوم. استخدم PNG أو JPEG أو WebP.",
    EMPTY_PRESCRIPTION_FILE: "الملف فارغ.",
    PRESCRIPTION_FILE_TOO_LARGE: "حجم الملف أكبر من 5 MB.",
    ENCRYPTION_UNAVAILABLE:
      "التشفير غير متاح في هذا المتصفح. لا يمكن تهيئة الوصفة.",
    ENCRYPTION_FAILED: "فشلت عملية التشفير؛ لم تُهيّأ الوصفة.",
    ACTIVE_CONSENT_REQUIRED: "يلزم منح موافقة نشطة أولاً.",
    VERIFIED_PRESCRIPTION_REQUIRED:
      "يلزم غلاف وصفة مشفّر مرتبط بالموافقة.",
  };
  return messages[code] ?? "تعذر إكمال الإجراء بأمان. أعد المحاولة.";
}

function createSearchDemand(at: string): DemandState {
  return recordDemandSignal(createDemandState(), "S0", {
    id: makeId("demand-s0"),
    anonymousCohort: ANONYMOUS_COHORT,
    requestId: null,
    district: COARSE_DISTRICT,
    canonicalId: null,
    occurredAt: at,
  });
}

function recordKnownPresentation(
  demand: DemandState,
  medicine: MedicinePresentation,
  at: string,
): DemandState {
  return recordDemandSignal(demand, "S1", {
    id: makeId("demand-s1"),
    anonymousCohort: ANONYMOUS_COHORT,
    requestId: null,
    district: COARSE_DISTRICT,
    canonicalId: medicine.canonicalId,
    occurredAt: at,
  });
}

function MedicineFacts({ medicine }: { medicine: MedicinePresentation }) {
  return (
    <dl className="medicine-facts">
      <div>
        <dt>الاسم التجاري</dt>
        <dd>{medicine.brandName}</dd>
      </div>
      <div>
        <dt>الاسم العلمي (INN)</dt>
        <dd dir="ltr">{medicine.scientificName}</dd>
      </div>
      <div>
        <dt>القوة</dt>
        <dd className="numeric" dir="ltr">
          {medicine.strength}
        </dd>
      </div>
      <div>
        <dt>الشكل الصيدلاني</dt>
        <dd>{medicine.dosageForm}</dd>
      </div>
      <div>
        <dt>طريق الاستعمال</dt>
        <dd>{medicine.route}</dd>
      </div>
      <div>
        <dt>آلية التحرر</dt>
        <dd>{medicine.releaseMechanism}</dd>
      </div>
      <div>
        <dt>حجم العبوة</dt>
        <dd className="numeric">{medicine.packSize}</dd>
      </div>
      <div>
        <dt>فئة الصرف</dt>
        <dd>{CLASS_LABELS[medicine.prescriptionClass]}</dd>
      </div>
    </dl>
  );
}

function ActionDock({
  children,
  secondary,
}: {
  children: React.ReactNode;
  secondary?: React.ReactNode;
}) {
  return (
    <div className="action-dock">
      {secondary}
      {children}
    </div>
  );
}

export default function App() {
  const [view, setView] = useState<View>("discovery");
  const [searchMode, setSearchMode] = useState<SearchMode>("name");
  const [query, setQuery] = useState("");
  const [barcode, setBarcode] = useState("");
  const [packageFileName, setPackageFileName] = useState<string | null>(null);
  const [scenarioId, setScenarioId] = useState<ScenarioId>("success");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<readonly MedicinePresentation[]>([]);
  const [candidateId, setCandidateId] = useState("");
  const [medicine, setMedicine] = useState<MedicinePresentation | null>(null);
  const [demand, setDemand] = useState<DemandState>(createDemandState);
  const [consent, setConsent] = useState<ConsentRecord | null>(null);
  const [consentChecked, setConsentChecked] = useState(false);
  const [envelope, setEnvelope] =
    useState<EncryptedPrescriptionEnvelope | null>(null);
  const [prescriptionFileName, setPrescriptionFileName] = useState<string | null>(
    null,
  );
  const [medicalNote, setMedicalNote] = useState("");
  const [prescriptionError, setPrescriptionError] = useState<string | null>(null);
  const [encrypting, setEncrypting] = useState(false);
  const [broadcast, setBroadcast] = useState<AvailabilityBroadcast | null>(null);
  const [radar, setRadar] = useState<RadarState | null>(null);
  const [simulationRun, setSimulationRun] = useState<SimulationRun | null>(null);
  const [connection, setConnection] = useState<"online" | "offline">("online");
  const connectionRef = useRef(connection);
  const [simulationError, setSimulationError] = useState<string | null>(null);
  const [auditEntries, setAuditEntries] = useState<
    readonly PrescriptionAccessAuditEvent[]
  >([]);
  const auditLedgerRef = useRef(new PrescriptionAccessAuditLedger());
  const [gudea, setGudea] = useState<GudeaViewState>({ status: "idle" });
  const [now, setNow] = useState(Date.now());
  const expiryDispatchedRef = useRef(false);
  const [recoveryNotice, setRecoveryNotice] = useState(false);
  const [retentionNotice, setRetentionNotice] = useState<string | null>(null);
  const anonymousSessionId = useMemo(() => makeId("anonymous"), []);

  const scenario = getScenario(scenarioId);
  const radarEvents = radar?.events ?? [];
  const demandEvents: readonly DemandSignalEvent[] =
    radar?.demand.events ?? demand.events;

  useEffect(() => {
    connectionRef.current = connection;
  }, [connection]);

  useEffect(() => {
    try {
      if (sessionStorage.getItem("qareeb-demo-active") === "1") {
        setRecoveryNotice(true);
        sessionStorage.removeItem("qareeb-demo-active");
      }
    } catch {
      // Storage is optional. The simulation remains fully usable without it.
    }
  }, []);

  useEffect(() => {
    if (!medicine) {
      setGudea({ status: "idle" });
      return;
    }

    let cancelled = false;
    setGudea({ status: "loading" });
    void safeGudeaLookup(GUDEA_ADAPTER, medicine.canonicalId).then((result) => {
      if (!cancelled) {
        setGudea({ status: "ready", result });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [medicine]);

  useEffect(() => {
    if (!simulationRun) return;

    const timeline = buildScenarioTimeline({
      scenario: simulationRun.scenario,
      requestId: simulationRun.requestId,
      medicine: simulationRun.medicine,
      startedAt: simulationRun.startedAt,
      auditId: simulationRun.auditId,
    });
    const startedOnClock = Date.now();
    let cancelled = false;
    let timer: number | undefined;
    let cursor = 0;

    const dispatchEvent = async (event: RadarEvent) => {
      if (event.type === "PrescriptionAccessGranted") {
        if (!simulationRun.prescriptionId) {
          throw new Error("PRESCRIPTION_ID_REQUIRED");
        }
        const entry = await auditLedgerRef.current.grantAccess({
          id: event.auditId,
          prescriptionId: simulationRun.prescriptionId,
          acceptedPharmacyId: DEMO_PHARMACIES.mansour.id,
          principal: {
            pharmacistId: DEMO_PHARMACIES.mansour.pharmacistId,
            pharmacyId: DEMO_PHARMACIES.mansour.id,
            role: "VERIFIED_PHARMACIST",
            licenseStatus: "VERIFIED",
          },
          reason: "مطابقة الوصفة مع العرض المقبول",
          accessedAt: event.at,
        });
        setAuditEntries(auditLedgerRef.current.list());
        if (entry.id !== event.auditId) {
          throw new Error("AUDIT_EVENT_MISMATCH");
        }
      }

      setRadar((current) => {
        if (!current) return current;
        try {
          return applyRadarEvent(current, event);
        } catch (error) {
          queueMicrotask(() => setSimulationError(errorMessage(error)));
          return current;
        }
      });
    };

    const scheduleNext = () => {
      if (cancelled || cursor >= timeline.length) return;
      if (connectionRef.current === "offline") {
        timer = window.setTimeout(scheduleNext, 150);
        return;
      }

      const scheduled = timeline[cursor];
      const remaining = Math.max(
        0,
        scheduled.delayMs - (Date.now() - startedOnClock),
      );
      timer = window.setTimeout(() => {
        if (connectionRef.current === "offline") {
          scheduleNext();
          return;
        }
        void dispatchEvent(scheduled.event)
          .then(() => {
            cursor += 1;
            scheduleNext();
          })
          .catch((error) => {
            setSimulationError(errorMessage(error));
          });
      }, remaining);
    };

    scheduleNext();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [simulationRun]);

  useEffect(() => {
    if (radar?.status === "HOLD_ACTIVE") {
      setView("success");
    }
  }, [radar?.status]);

  useEffect(() => {
    if (
      radar?.status === "HOLD_ACTIVE" &&
      radar.hold &&
      envelope?.retention.status === "PENDING_HOLD_OUTCOME"
    ) {
      setEnvelope(
        markPrescriptionForDeletion(
          envelope,
          radar.hold.expiresAt,
          "HOLD_EXPIRED",
        ),
      );
    }
  }, [envelope, radar]);

  useEffect(() => {
    if (radar?.hold?.status !== "ACTIVE") return;
    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [radar?.hold?.status]);

  useEffect(() => {
    const hold = radar?.hold;
    if (
      !radar ||
      !hold ||
      hold.status !== "ACTIVE" ||
      expiryDispatchedRef.current ||
      now < new Date(hold.expiresAt).getTime()
    ) {
      return;
    }

    expiryDispatchedRef.current = true;
    setRadar(
      applyRadarEvent(radar, {
        type: "HoldExpired",
        at: new Date(now).toISOString(),
        reference: hold.reference,
      }),
    );
    try {
      sessionStorage.removeItem("qareeb-demo-active");
    } catch {
      // Optional recovery marker only.
    }
  }, [now, radar]);

  function chooseScenario(nextScenario: DemoScenario) {
    setScenarioId(nextScenario.id);
    setSearchMode("name");
    setQuery(nextScenario.query);
    setBarcode("");
    setPackageFileName(null);
    setSearchError(null);
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const at = new Date().toISOString();
    const nextDemand = createSearchDemand(at);
    setSearchError(null);
    setCandidateId("");
    setCandidates([]);
    setMedicine(null);
    setConsent(null);
    setEnvelope(null);
    setBroadcast(null);
    setRadar(null);
    setSimulationRun(null);
    setAuditEntries([]);
    auditLedgerRef.current = new PrescriptionAccessAuditLedger();

    let value = query;
    if (searchMode === "barcode") value = barcode;
    if (searchMode === "package") {
      if (!packageFileName) {
        setSearchError("اختر صورة عبوة أولاً.");
        return;
      }
      // No OCR is fabricated: the package scenario deliberately returns
      // multiple Panadol presentations for explicit patient selection.
      value = "بنادول";
    }

    const result = searchMedicines(value, MEDICINES);
    setDemand(nextDemand);

    if (result.kind === "invalid") {
      setSearchError("اكتب اسماً أو باركوداً صالحاً للبحث.");
      return;
    }
    if (result.kind === "none") {
      setSearchError(
        "لم نتعرّف على عرض دقيق. لا نستخدم مطابقة تقريبية قد تخلط بين دواءين.",
      );
      return;
    }
    if (result.kind === "ambiguous") {
      setCandidates(result.candidates);
      setView("disambiguation");
      return;
    }

    setMedicine(result.medicine);
    setDemand(recordKnownPresentation(nextDemand, result.medicine, at));
    setView("identity");
  }

  function confirmPresentation() {
    if (!candidateId) return;
    const selected = selectPresentation(candidates, candidateId);
    setMedicine(selected);
    setDemand(
      recordKnownPresentation(demand, selected, new Date().toISOString()),
    );
    setView("identity");
  }

  function grantConsent() {
    if (!consentChecked) return;
    const record = createConsentRecord({
      anonymousSessionId,
      grantedAt: new Date().toISOString(),
    });
    setConsent(record);
    setView("prescription");
  }

  async function stagePrescription(
    fileName: string,
    mimeType: string,
    bytes: Uint8Array,
  ) {
    if (!consent) {
      setPrescriptionError("يلزم منح الموافقة قبل تهيئة الوصفة.");
      return;
    }

    setEncrypting(true);
    setPrescriptionError(null);
    try {
      const encrypted = await encryptPrescriptionAsset({
        asset: { name: fileName, mimeType, bytes },
        consent,
        stagedAt: new Date().toISOString(),
      });
      setEnvelope(encrypted);
      setPrescriptionFileName(fileName);
    } catch (error) {
      setEnvelope(null);
      setPrescriptionFileName(null);
      setPrescriptionError(errorMessage(error));
    } finally {
      setEncrypting(false);
    }
  }

  async function handlePrescriptionFile(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    if (!file) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    await stagePrescription(file.name, file.type, bytes);
  }

  function useDemoPrescription() {
    const demoPngBytes = new Uint8Array([
      137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82,
    ]);
    void stagePrescription(
      "وصفة-محاكاة.png",
      "image/png",
      demoPngBytes,
    );
  }

  function revokeConsent() {
    if (!consent) return;
    const withdrawnAt = new Date().toISOString();
    setConsent(withdrawConsent(consent, withdrawnAt));
    if (envelope) {
      const marked = markPrescriptionForDeletion(
        envelope,
        withdrawnAt,
        "CANCELLED",
      );
      if (marked.retention.status === "MARKED_FOR_DELETION") {
        setRetentionNotice(
          `سُحبت الموافقة. المادة المشفّرة معلّمة للحذف في ${formatTimestamp(
            marked.retention.deleteAt,
          )}.`,
        );
      }
    }
    setEnvelope(null);
    setPrescriptionFileName(null);
    setMedicalNote("");
    setConsentChecked(false);
    setView("identity");
  }

  function startAvailability() {
    if (!medicine) return;
    const startedAt = new Date().toISOString();
    const requestId = makeId("request");
    const result = createAvailabilityBroadcast({
      requestId,
      medicine,
      coarseDistrict: COARSE_DISTRICT,
      createdAt: startedAt,
      consent: consent ?? undefined,
      prescriptionEnvelope: envelope ?? undefined,
      medicalNote,
    });

    if (result.kind === "blocked") {
      setBroadcast(null);
      setView("controlled");
      return;
    }

    const selectedScenario =
      scenario.outcome === "CONTROLLED_HANDOFF"
        ? getScenario("success")
        : scenario;
    const nextRadar = createRadarState({
      requestId,
      canonicalId: medicine.canonicalId,
      anonymousCohort: ANONYMOUS_COHORT,
      district: COARSE_DISTRICT,
      requiresPrescriptionAccess: medicine.prescriptionClass === "RX",
      verifiedPharmacyIds: [
        DEMO_PHARMACIES.mansour.id,
        DEMO_PHARMACIES.yarmouk.id,
      ],
      demand,
    });
    const auditId = makeId("audit");

    setBroadcast(result.broadcast);
    setRadar(nextRadar);
    setConnection("online");
    setSimulationError(null);
    expiryDispatchedRef.current = false;
    setSimulationRun({
      scenario: selectedScenario,
      requestId,
      startedAt,
      auditId,
      medicine,
      prescriptionId: envelope?.prescriptionId ?? null,
    });
    setView("radar");
    try {
      sessionStorage.setItem("qareeb-demo-active", "1");
    } catch {
      // The marker contains no medicine or patient data and is non-essential.
    }
  }

  function identityAction() {
    if (!medicine) return;
    if (
      medicine.prescriptionClass === "CONTROLLED" ||
      medicine.prescriptionClass === "UNKNOWN"
    ) {
      setView("controlled");
    } else if (medicine.prescriptionClass === "RX") {
      setView(consent?.withdrawnAt === null ? "prescription" : "consent");
    } else {
      startAvailability();
    }
  }

  function resetJourney() {
    setView("discovery");
    setSearchMode("name");
    setQuery("");
    setBarcode("");
    setPackageFileName(null);
    setSearchError(null);
    setCandidates([]);
    setCandidateId("");
    setMedicine(null);
    setDemand(createDemandState());
    setConsent(null);
    setConsentChecked(false);
    setEnvelope(null);
    setPrescriptionFileName(null);
    setMedicalNote("");
    setPrescriptionError(null);
    setBroadcast(null);
    setRadar(null);
    setSimulationRun(null);
    setConnection("online");
    setSimulationError(null);
    setAuditEntries([]);
    setGudea({ status: "idle" });
    setRetentionNotice(null);
    auditLedgerRef.current = new PrescriptionAccessAuditLedger();
    expiryDispatchedRef.current = false;
    try {
      sessionStorage.removeItem("qareeb-demo-active");
    } catch {
      // Optional recovery marker only.
    }
  }

  function confirmDemoDispensing() {
    if (!radar?.hold || radar.hold.status !== "ACTIVE") return;
    const at = new Date().toISOString();
    if (new Date(at).getTime() >= new Date(radar.hold.expiresAt).getTime()) {
      setNow(Date.now());
      return;
    }
    setRadar(
      applyRadarEvent(radar, {
        type: "DispensingConfirmed",
        at,
        reference: radar.hold.reference,
      }),
    );
    try {
      sessionStorage.removeItem("qareeb-demo-active");
    } catch {
      // Optional recovery marker only.
    }
  }

  function handlePackageImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setSearchError("اختر ملف صورة للعبوة.");
      setPackageFileName(null);
      return;
    }
    setSearchError(null);
    setPackageFileName(file.name);
  }

  const holdRemaining =
    radar?.hold?.status === "ACTIVE"
      ? new Date(radar.hold.expiresAt).getTime() - now
      : 0;

  let screen: React.ReactNode;

  if (view === "discovery") {
    screen = (
      <section className="decision-surface discovery-surface" aria-labelledby="discovery-title">
        <div className="surface-intro">
          <p className="eyebrow">محطة 01 · تثبيت هوية الدواء</p>
          <h1 id="discovery-title">ما الدواء الذي تبحث عنه؟</h1>
          <p>
            نطابق العرض الدقيق أولاً؛ الاسم وحده قد يشير إلى قوة أو شكل أو عبوة
            مختلفة.
          </p>
        </div>

        {recoveryNotice ? (
          <div className="notice amber" role="status">
            أُعيد تحميل المحاكاة أثناء طلب سابق. لم نستعد وصفة أو ادعاء توفر؛ ابدأ
            طلباً جديداً.
            <button type="button" className="text-button" onClick={() => setRecoveryNotice(false)}>
              فهمت
            </button>
          </div>
        ) : null}

        {retentionNotice ? (
          <div className="notice petrol" role="status">
            {retentionNotice}
          </div>
        ) : null}

        <form onSubmit={submitSearch} noValidate>
          <div className="search-modes" role="tablist" aria-label="طريقة البحث">
            {(
              [
                ["name", "اسم الدواء"],
                ["package", "صورة العبوة"],
                ["barcode", "الباركود"],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                role="tab"
                aria-selected={searchMode === mode}
                className={searchMode === mode ? "selected" : ""}
                onClick={() => {
                  setSearchMode(mode);
                  setSearchError(null);
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {searchMode === "name" ? (
            <label className="field">
              <span>الاسم بالعربية أو الكردية أو الإنجليزية</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="مثال: بروفين 400"
                autoComplete="off"
                autoFocus
              />
            </label>
          ) : null}

          {searchMode === "barcode" ? (
            <label className="field">
              <span>أرقام الباركود</span>
              <input
                value={barcode}
                onChange={(event) => setBarcode(event.target.value)}
                placeholder="6291100040002"
                inputMode="numeric"
                autoComplete="off"
                dir="ltr"
              />
            </label>
          ) : null}

          {searchMode === "package" ? (
            <div className="upload-field">
              <p className="field-label">التقاط أو رفع صورة العبوة</p>
              <label className="file-picker">
                <span>{packageFileName ?? "اختر صورة العبوة"}</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePackageImage}
                />
              </label>
              <p className="field-help">
                المحاكاة لا تدّعي تشغيل OCR؛ تعيد الصورة عيّنة ملتبسة لتختار العرض
                يدوياً.
              </p>
            </div>
          ) : null}

          {searchError ? (
            <p className="form-error" role="alert">
              {searchError}
            </p>
          ) : null}

          <button className="primary-button full-width" type="submit">
            تثبيت هوية الدواء
          </button>
        </form>

        <div className="scenario-picker">
          <div className="section-heading">
            <div>
              <p className="eyebrow">مختبر الرحلة</p>
              <h2>حالات محاكاة جاهزة</h2>
            </div>
            <span>8 حالات</span>
          </div>
          <div className="scenario-grid">
            {DEMO_SCENARIOS.map((item) => (
              <button
                type="button"
                key={item.id}
                className={scenarioId === item.id && query === item.query ? "selected" : ""}
                aria-pressed={scenarioId === item.id && query === item.query}
                onClick={() => chooseScenario(item)}
              >
                <strong>{item.label}</strong>
                <span>{item.description}</span>
              </button>
            ))}
          </div>
          <p className="scenario-help">
            اختيار الحالة يملأ البحث فقط؛ اضغط «تثبيت هوية الدواء» لبدء الرحلة.
          </p>
        </div>
      </section>
    );
  } else if (view === "disambiguation") {
    screen = (
      <section className="decision-surface" aria-labelledby="disambiguation-title">
        <div className="surface-intro">
          <p className="eyebrow">محطة 02 · لا اختيار تلقائي</p>
          <h1 id="disambiguation-title">أي عرض تقصد تحديداً؟</h1>
          <p>
            الاسم يطابق أكثر من عرض. اختر القوة والشكل والطريق والعبوة قبل
            المتابعة.
          </p>
        </div>

        <fieldset className="presentation-options">
          <legend className="sr-only">اختر عرضاً دوائياً واحداً</legend>
          {candidates.map((candidate) => (
            <label
              key={candidate.canonicalId}
              className={candidateId === candidate.canonicalId ? "selected" : ""}
            >
              <input
                type="radio"
                name="presentation"
                value={candidate.canonicalId}
                checked={candidateId === candidate.canonicalId}
                onChange={() => setCandidateId(candidate.canonicalId)}
              />
              <span className="option-marker" aria-hidden="true" />
              <span className="option-content">
                <strong>{candidate.brandName}</strong>
                <span dir="ltr">
                  {candidate.strength} · {candidate.scientificName}
                </span>
                <span>
                  {candidate.dosageForm} · {candidate.route} ·{" "}
                  {candidate.releaseMechanism}
                </span>
                <span className="pack-line">{candidate.packSize}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <ActionDock
          secondary={
            <button type="button" className="secondary-button" onClick={() => setView("discovery")}>
              رجوع
            </button>
          }
        >
          <button
            type="button"
            className="primary-button"
            disabled={!candidateId}
            onClick={confirmPresentation}
          >
            اعتماد هذا العرض
          </button>
        </ActionDock>
      </section>
    );
  } else if (view === "identity" && medicine) {
    const controlled =
      medicine.prescriptionClass === "CONTROLLED" ||
      medicine.prescriptionClass === "UNKNOWN";
    screen = (
      <section className="decision-surface" aria-labelledby="identity-title">
        <div className="surface-intro identity-heading">
          <p className="eyebrow">محطة 03 · بطاقة الدواء</p>
          <h1 id="identity-title">{medicine.brandName}</h1>
          <span
            className={`class-tag ${
              controlled ? "controlled" : medicine.prescriptionClass.toLowerCase()
            }`}
          >
            {CLASS_LABELS[medicine.prescriptionClass]}
          </span>
        </div>

        <MedicineFacts medicine={medicine} />

        <div className="price-separation">
          <section>
            <p className="eyebrow">بلاغ صيدلية سابق · محاكاة</p>
            <h2>
              {medicine.reportedPriceIqd
                ? formatIqd(medicine.reportedPriceIqd)
                : "لا يوجد بلاغ"}
            </h2>
            <p>
              {medicine.reportedPriceAt
                ? `وقت البلاغ: ${formatTimestamp(medicine.reportedPriceAt)}`
                : "ليس سعراً حالياً ولا تأكيد توفر."}
            </p>
          </section>
          <section className="official-price">
            <p className="eyebrow">مرجع حكومي عبر محوّل Gudea</p>
            {gudea.status === "loading" ? (
              <>
                <h2>جارٍ التحقق…</h2>
                <p>هذا التحقق لا يمنع متابعة الطلب.</p>
              </>
            ) : gudea.status === "ready" &&
              gudea.result.status === "verified" ? (
              <>
                <h2>{formatIqd(gudea.result.officialPriceIqd)}</h2>
                <p>سعر مرجعي منفصل، وليس عرض الصيدلية.</p>
              </>
            ) : (
              <>
                <h2 className="unavailable-copy">{GUDEA_UNAVAILABLE_MESSAGE}</h2>
                <p>يمكنك متابعة طلب التوفر دون هذا المرجع.</p>
              </>
            )}
          </section>
        </div>

        <div className="notice petrol">
          لا نقدّم بديلاً علاجياً أو جرعة. الطلب التالي يخص هذا العرض الدقيق فقط.
        </div>

        <ActionDock
          secondary={
            <button type="button" className="secondary-button" onClick={() => setView("discovery")}>
              بحث جديد
            </button>
          }
        >
          <button
            type="button"
            className={controlled ? "danger-button" : "primary-button"}
            onClick={identityAction}
          >
            {controlled
              ? "عرض المسار الآمن"
              : medicine.prescriptionClass === "RX"
                ? "متابعة بموافقة آمنة"
                : "طلب تأكيد التوفر"}
          </button>
        </ActionDock>
      </section>
    );
  } else if (view === "consent" && medicine) {
    screen = (
      <section className="decision-surface" aria-labelledby="consent-title">
        <div className="surface-intro">
          <p className="eyebrow">محطة 04 · قبل الوصفة</p>
          <h1 id="consent-title">موافقة محددة وقابلة للسحب</h1>
          <p>
            لن تظهر أدوات الصورة أو الملاحظة قبل أن تمنح هذه الموافقة صراحةً.
          </p>
        </div>

        <dl className="consent-terms">
          <div>
            <dt>الغرض</dt>
            <dd>{CONSENT_TERMS.purpose}</dd>
          </div>
          <div>
            <dt>من يصل إليها</dt>
            <dd>{CONSENT_TERMS.recipients}</dd>
          </div>
          <div>
            <dt>الاحتفاظ</dt>
            <dd>{CONSENT_TERMS.retention}</dd>
          </div>
          <div>
            <dt>السحب</dt>
            <dd>{CONSENT_TERMS.withdrawal}</dd>
          </div>
          <div>
            <dt>التدقيق</dt>
            <dd>كل فتح مسموح ينشئ حدثاً متسلسلاً ببصمة لا تُعدّل عبر واجهة النطاق.</dd>
          </div>
        </dl>

        <label className="consent-check">
          <input
            type="checkbox"
            checked={consentChecked}
            onChange={(event) => setConsentChecked(event.target.checked)}
          />
          <span className="check-marker" aria-hidden="true" />
          <span>
            أوافق على استخدام الوصفة لهذا الطلب فقط وفق الغرض والمستلمين ومدة
            الاحتفاظ الموضحة.
          </span>
        </label>

        <ActionDock
          secondary={
            <button type="button" className="secondary-button" onClick={() => setView("identity")}>
              رجوع
            </button>
          }
        >
          <button
            type="button"
            className="primary-button"
            disabled={!consentChecked}
            onClick={grantConsent}
          >
            منح الموافقة وفتح أدوات الوصفة
          </button>
        </ActionDock>
      </section>
    );
  } else if (view === "prescription" && medicine && consent) {
    screen = (
      <section className="decision-surface" aria-labelledby="prescription-title">
        <div className="surface-intro">
          <p className="eyebrow">محطة 05 · غلاف خاص</p>
          <h1 id="prescription-title">تهيئة الوصفة قبل الطلب</h1>
          <p>
            تُشفّر البايتات محلياً بـ AES-256-GCM قبل التهيئة التجريبية. لا تُرسل
            الصورة أو الملاحظة ضمن البث.
          </p>
        </div>

        <div className="rx-upload-panel">
          <label className="file-picker prescription-picker">
            <span>
              {prescriptionFileName ??
                "اختر صورة وصفة PNG أو JPEG أو WebP"}
            </span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => void handlePrescriptionFile(event)}
            />
          </label>
          <div className="upload-meta">
            <span>الحد الأقصى {MAX_PRESCRIPTION_BYTES / 1024 / 1024} MB</span>
            <button
              type="button"
              className="text-button"
              onClick={useDemoPrescription}
              disabled={encrypting}
            >
              استخدام وصفة محاكاة
            </button>
          </div>
          {encrypting ? (
            <p className="encryption-state" role="status">
              جارٍ التشفير المحلي؛ لم تُسجّل الوصفة بعد.
            </p>
          ) : envelope ? (
            <p className="encryption-state success" role="status">
              تم التشفير قبل التهيئة · <span dir="ltr">{envelope.algorithm}</span>
            </p>
          ) : null}
          {prescriptionError ? (
            <p className="form-error" role="alert">
              {prescriptionError}
            </p>
          ) : null}
        </div>

        <label className="field note-field">
          <span>ملاحظة للصيدلي المقبول فقط (اختيارية)</span>
          <textarea
            value={medicalNote}
            onChange={(event) => setMedicalNote(event.target.value)}
            maxLength={500}
            placeholder="مثال: الرجاء مطابقة اسم المريض والقوة مع الوصفة."
          />
          <small>{medicalNote.length}/500 · لا تدخل هذه الملاحظة في البث العام.</small>
        </label>

        <div className="notice petrol">
          الوصول المؤقت لا يُمنح إلا لصيدلي موثّق في الصيدلية التي تقبل الطلب،
          ويُسجل ببصمة تدقيق.
        </div>

        <button type="button" className="withdraw-button" onClick={revokeConsent}>
          سحب الموافقة وإلغاء المادة المهيّأة
        </button>

        <ActionDock
          secondary={
            <button type="button" className="secondary-button" onClick={() => setView("identity")}>
              رجوع
            </button>
          }
        >
          <button
            type="button"
            className="primary-button"
            disabled={!envelope || encrypting}
            onClick={startAvailability}
          >
            إرسال طلب توفر مجهول
          </button>
        </ActionDock>
      </section>
    );
  } else if (view === "controlled" && medicine) {
    screen = (
      <section className="decision-surface controlled-surface" aria-labelledby="controlled-title">
        <div className="safety-stripe">مسار أمان · لا بث عام</div>
        <div className="surface-intro">
          <p className="eyebrow">توقف آمن</p>
          <h1 id="controlled-title">هذا العرض لا يدخل شبكة التوفر العامة</h1>
          <p>
            لأن تصنيفه {CLASS_LABELS[medicine.prescriptionClass]}، لم يُنشأ أي بث
            ولم يظهر مخزون على خريطة عامة.
          </p>
        </div>

        <div className="controlled-identity">
          <strong>{medicine.brandName}</strong>
          <span dir="ltr">
            {medicine.scientificName} · {medicine.strength}
          </span>
          <span>
            {medicine.dosageForm} · {medicine.packSize}
          </span>
        </div>

        <ol className="safe-handoff">
          <li>
            راجع صيدلية مرخّصة ومعك الوصفة الأصلية والهوية المطلوبة وفق النظام.
          </li>
          <li>يتحقق الصيدلي من الصلاحية والتطابق قبل أي صرف.</li>
          <li>لا تعرض المحاكاة توفر هذا الدواء أو تسمح بحجز عام له.</li>
        </ol>

        <div className="handoff-contact">
          <p className="eyebrow">نقطة مرخّصة · بيانات تجريبية</p>
          <h2>{DEMO_PHARMACIES.mansour.name}</h2>
          <p>{DEMO_PHARMACIES.mansour.address}</p>
          <a
            className="secondary-button link-button"
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
              DEMO_PHARMACIES.mansour.address,
            )}`}
            target="_blank"
            rel="noreferrer"
          >
            فتح الاتجاهات
          </a>
        </div>

        <ActionDock>
          <button type="button" className="primary-button" onClick={resetJourney}>
            العودة إلى بحث آمن
          </button>
        </ActionDock>
      </section>
    );
  } else if (view === "radar" && radar && medicine) {
    const latestEvent = radar.events.at(-1);
    screen = (
      <section className="decision-surface radar-surface" aria-labelledby="radar-title">
        <div className="surface-intro">
          <p className="eyebrow">محطة 06 · مصدر أحداث</p>
          <h1 id="radar-title">نبض الرف</h1>
          <p>
            تتحرك هذه الشاشة عند وصول حدث مؤرخ فقط. مرور الوقت وحده لا يعني أن
            صيدلية راجعت أو أكدت.
          </p>
        </div>

        <div className={`stream-status ${connection}`} role="status">
          <span className="stream-dot" aria-hidden="true" />
          <div>
            <strong>
              {connection === "online"
                ? "بث المحاكاة المحلية متصل"
                : "انقطع بث الأحداث"}
            </strong>
            <span>
              {connection === "online"
                ? "لا توجد نسبة تقدم؛ كل نبضة أدناه حدث."
                : "لا نضيف نشاطاً أو تقدماً أثناء الانقطاع."}
            </span>
          </div>
          <button
            type="button"
            className="small-button"
            onClick={() =>
              setConnection((current) =>
                current === "online" ? "offline" : "online",
              )
            }
          >
            {connection === "online" ? "محاكاة انقطاع" : "إعادة الاتصال"}
          </button>
        </div>

        <div className="radar-reading" aria-live="polite">
          <span className="reading-kicker">الحالة المشتقة من الأحداث</span>
          <h2>{STATUS_COPY[radar.status]}</h2>
          {latestEvent ? (
            <time dateTime={latestEvent.at}>
              آخر حدث: {formatTimestamp(latestEvent.at)}
            </time>
          ) : (
            <p>لم يصل حدث بعد.</p>
          )}
        </div>

        {radar.status === "REVIEWING" ? (
          <div className="notice amber">
            المراجعة ليست حجزاً. لا يبدأ أي عدّاد قبل التطابق والمرجع الفريد.
          </div>
        ) : null}

        {radar.status === "ALL_DECLINED" ? (
          <div className="outcome-panel">
            <p className="eyebrow">نهاية صريحة</p>
            <h2>لا يوجد تأكيد في هذه الجولة</h2>
            <p>
              صدر {radar.declinedPharmacyIds.length} حدث اعتذار من أصل{" "}
              {radar.licensedRecipients} مستلمين في المحاكاة. لا ندّعي عدم التوفر
              خارج هذه الجولة.
            </p>
            <button type="button" className="primary-button" onClick={resetJourney}>
              بدء بحث جديد
            </button>
          </div>
        ) : null}

        {radar.status === "TIMED_OUT" ? (
          <div className="outcome-panel">
            <p className="eyebrow">انتهت المهلة</p>
            <h2>لم يصل تأكيد صيدلية</h2>
            <p>
              بقيت الحالة بلا حجز وبلا ادعاء توفر. يمكنك بدء طلب جديد لاحقاً.
            </p>
            <button type="button" className="primary-button" onClick={resetJourney}>
              العودة إلى الاكتشاف
            </button>
          </div>
        ) : null}

        {simulationError ? (
          <div className="notice danger" role="alert">
            توقفت المحاكاة عند حارس نطاق: {simulationError}
          </div>
        ) : null}

        {radar.status !== "ALL_DECLINED" && radar.status !== "TIMED_OUT" ? (
          <ActionDock>
            <button type="button" className="secondary-button" onClick={resetJourney}>
              إلغاء المحاكاة
            </button>
          </ActionDock>
        ) : null}
      </section>
    );
  } else if (view === "success" && radar?.hold && radar.confirmation && medicine) {
    const holdActive = radar.hold.status === "ACTIVE";
    const dispensed = radar.hold.status === "DISPENSED";
    screen = (
      <section
        className={`decision-surface hold-surface ${holdActive ? "active" : "terminal"}`}
        aria-labelledby="hold-title"
      >
        <div className="hold-stamp">
          {holdActive
            ? "حجز مؤقت نشط · محاكاة"
            : dispensed
              ? "استلام مسجّل · محاكاة"
              : "الحجز منتهي · محاكاة"}
        </div>
        <div className="surface-intro">
          <p className="eyebrow">مرجع مؤرخ ومنسوب</p>
          <h1 id="hold-title">
            {holdActive
              ? "أكدت الصيدلية العرض وبدأ الحجز"
              : dispensed
                ? "اكتملت الرحلة التجريبية"
                : "انتهت مدة الحجز"}
          </h1>
          <p>
            {holdActive
              ? "التأكيد خاص بالعرض أدناه وينتهي في الوقت المحدد."
              : dispensed
                ? "هذا التسجيل يخص المحاكاة ولا يثبت صرفاً حقيقياً."
                : "لم يعد هذا العرض محجوزاً ولا ندّعي استمرار توفره."}
          </p>
        </div>

        <div className="hold-reference">
          <span>مرجع الحجز</span>
          <strong dir="ltr">{radar.hold.reference}</strong>
        </div>

        <dl className="confirmation-details">
          <div>
            <dt>العرض الدقيق</dt>
            <dd>
              {medicine.brandName} · <span dir="ltr">{medicine.strength}</span> ·{" "}
              {medicine.dosageForm} · {medicine.packSize}
            </dd>
          </div>
          <div>
            <dt>الصيدلية</dt>
            <dd>{radar.confirmation.pharmacyName}</dd>
          </div>
          <div>
            <dt>السعر المؤكد من الصيدلية</dt>
            <dd className="numeric">{formatIqd(radar.confirmation.amountIqd)}</dd>
          </div>
          <div>
            <dt>وقت تأكيد السعر</dt>
            <dd className="numeric">
              {formatTimestamp(radar.confirmation.confirmedAt)}
            </dd>
          </div>
          <div>
            <dt>انتهاء الحجز</dt>
            <dd className="numeric">{formatTimestamp(radar.hold.expiresAt)}</dd>
          </div>
        </dl>

        {holdActive ? (
          <div className="hold-countdown" role="timer" aria-live="off">
            <span>الوقت المتبقي للحجز</span>
            <strong dir="ltr">{formatCountdown(holdRemaining)}</strong>
            <small>بدأ العدّاد بعد حدث HoldActivated فقط.</small>
          </div>
        ) : null}

        <div className="pharmacy-contact">
          <p className="eyebrow">بيانات الصيدلية · محاكاة</p>
          <p>{DEMO_PHARMACIES.mansour.address}</p>
          <div className="contact-actions">
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                DEMO_PHARMACIES.mansour.address,
              )}`}
              target="_blank"
              rel="noreferrer"
            >
              الاتجاهات
            </a>
            <a href={`tel:${DEMO_PHARMACIES.mansour.phone}`}>اتصال</a>
            <a
              href={`https://wa.me/${DEMO_PHARMACIES.mansour.whatsapp}`}
              target="_blank"
              rel="noreferrer"
            >
              WhatsApp
            </a>
          </div>
          <small>الأرقام والعنوان تجريبية وليست جهة صحية فعلية.</small>
        </div>

        <ActionDock
          secondary={
            <button type="button" className="secondary-button" onClick={resetJourney}>
              إنهاء المحاكاة
            </button>
          }
        >
          {holdActive ? (
            <button type="button" className="primary-button" onClick={confirmDemoDispensing}>
              محاكاة استلام الدواء
            </button>
          ) : (
            <button type="button" className="primary-button" onClick={resetJourney}>
              بدء بحث جديد
            </button>
          )}
        </ActionDock>
      </section>
    );
  } else {
    screen = (
      <section className="decision-surface">
        <h1>تعذر استعادة هذه الخطوة</h1>
        <button type="button" className="primary-button" onClick={resetJourney}>
          العودة إلى البداية
        </button>
      </section>
    );
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        انتقل إلى المحتوى
      </a>
      <header className="topbar">
        <div className="wordmark" aria-label="قريب، شبكة الدواء">
          <span className="wordmark-name">قريب</span>
          <span>شبكة الدواء</span>
        </div>
        <div className="header-context">
          <span className="simulation-badge">محاكاة تفاعلية</span>
          <div
            className="location-chip"
            role="status"
            aria-label={`الموقع النشط: ${DISTRICT}، نطاق تقريبي`}
            title="الموقع تقريبي في هذه المحاكاة"
          >
            <span aria-hidden="true">●</span>
            {DISTRICT}
            <small>نطاق تقريبي</small>
          </div>
        </div>
      </header>

      <div className="simulation-banner" role="note">
        <strong>بيئة عرض فقط.</strong> لا مخزون حقيقياً، لا صيدليات متصلة، ولا
        وصفة تُرفع إلى خدمة إنتاجية.
      </div>

      <ShelfPulse
        demandEvents={demandEvents}
        radarEvents={radarEvents}
        prescriptionClass={medicine?.prescriptionClass}
        consentGranted={Boolean(consent && !consent.withdrawnAt)}
      />

      <div className="journey-grid">
        <main id="main-content">{screen}</main>
        <TrustLedger
          demandEvents={demandEvents}
          radarEvents={radarEvents}
          broadcast={broadcast}
          envelope={envelope}
          auditEntries={auditEntries}
          gudea={gudea}
          connection={connection}
        />
      </div>

      <footer>
        <strong>قريب · محاكاة عقدية</strong>
        <span>
          لا استشارة طبية · لا صرف · لا بديل علاجي · يلزم تكامل إنتاجي مرخّص
        </span>
      </footer>
    </div>
  );
}

