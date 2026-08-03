/**
 * R2 and R3 — photographing the paper, and confirming it can be read.
 *
 * @blueprint R2 · R3 · D18 · D37
 * @owner patient-app
 * @why R3 exists because Phase 0 reads nothing (D18). The patient is the only
 *      judge of whether the photo is legible, so the screen tells them what a
 *      pharmacist will need to see rather than asking "is it clear?" and
 *      leaving them to guess. The camera refusal is never a wall: the
 *      alternative is offered in the same breath, because a patient holding a
 *      prescription for a sick child should not have to go hunting in Settings.
 */

import * as Prescription from "../model/prescription.js";
import { resolveView, type Phase } from "../model/view.js";
import { CORE_LOOP } from "./core-loop.contract.js";
import { GRAPH } from "./graph.js";
import { Actions, InfoCard, Label, PhotoFrame, Primary, Screen, Secondary } from "../ui/kit.js";
import type { Theme } from "../ui/theme.js";
import { PATIENT_FLOWS } from "./flows.js";

const contract = (id: string) => CORE_LOOP.find((c) => c.id === id)!;

export type PrescriptionProps = {
  readonly t: Theme;
  readonly capture: Prescription.Capture;
  readonly history: readonly string[];
  readonly onCapture: () => void;
  readonly onConfirm: () => void;
  readonly onRetake: () => void;
  readonly onTypeInstead: () => void;
  readonly onBack: () => void;
  readonly onAction: (to: string) => void;
};

export function PrescriptionScreen(p: PrescriptionProps) {
  // R3 is a different screen, not a different state of R2: the Blueprint gives
  // them separate ids and separate purposes, and collapsing them would lose
  // the back step between taking a photo and accepting it.
  return p.capture.kind === "review" || p.capture.kind === "failed"
    ? <ReviewShot {...p} />
    : <Camera {...p} />;
}

/** R2 — take the photo. */
function Camera(p: PrescriptionProps) {
  const { t } = p;
  const refused = p.capture.kind === "refused";
  const phase: Phase = refused ? { kind: "permissionRefused" } : { kind: "ready" };
  const view = resolveView(contract("R2"), phase, GRAPH, p.history, PATIENT_FLOWS);

  return (
    <Screen
      t={t} view={view} onBack={p.onBack} onAction={p.onAction}
      footer={refused
        // The alternative IS the primary action here. Offering a disabled
        // camera button would be offering a door that is bolted.
        ? <Primary t={t} label="اكتب اسم الدواء بدال الصورة" onPress={p.onTypeInstead} />
        : <Primary t={t} label="صوّر" busy={p.capture.kind === "capturing"} onPress={p.onCapture} />}
    >
      {refused ? null : (
        <InfoCard t={t}>
          <Label t={t} role="headline">صوّر الوصفة كاملة</Label>
          {/* Phase 0 reads nothing (D18). Saying what the PHARMACIST needs is
              honest and useful; saying "we will check it" would not be. */}
          <Label t={t} role="body" color="inkMuted">
            الصيدلي راح يقرأها بنفسه — خلي الورقة كاملة بالصورة وبضوء كافي.
          </Label>
        </InfoCard>
      )}

      {refused ? null : (
        <Actions t={t}>
          <Secondary t={t} label="اكتب الاسم بدال الصورة" onPress={p.onTypeInstead} />
        </Actions>
      )}
    </Screen>
  );
}

/** R3 — the patient judges legibility, because nothing else does. */
function ReviewShot(p: PrescriptionProps) {
  const { t } = p;
  const failed = p.capture.kind === "failed";
  const view = resolveView(
    contract("R3"),
    failed ? { kind: "error", detail: "upload" } : { kind: "ready" },
    GRAPH, p.history, PATIENT_FLOWS,
  );

  return (
    <Screen
      t={t} view={view} onBack={p.onBack} onAction={p.onAction}
      footer={<Primary t={t} label="واضحة — كمّل" onPress={p.onConfirm} />}
    >
      {/* The photograph itself. A placeholder frame is rendered here rather
          than a fake image: the review must never show an image the app has
          not actually captured. */}
      <PhotoFrame t={t} label="صورة الوصفة" />

      {failed && p.capture.kind === "failed" ? (
        <InfoCard t={t}>
          <Label t={t} role="body" color="alert">{Prescription.whatToFix("upload").says}</Label>
          <Label t={t} role="caption" color="inkMuted">الصورة محفوظة — بس الإرسال ما نجح</Label>
        </InfoCard>
      ) : null}

      <InfoCard t={t}>
        <Label t={t} role="headline">تأكد من هذي الأمور</Label>
        {/* Telling the patient what "clear" means, instead of asking them to
            judge a word nobody defined. */}
        {Prescription.LEGIBILITY_CHECKS.map((check) => (
          <Label key={check} t={t} role="body" color="inkMuted">{`· ${check}`}</Label>
        ))}
      </InfoCard>

      <Actions t={t}>
        <Secondary t={t} label="صوّر مرة ثانية" onPress={p.onRetake} />
      </Actions>
    </Screen>
  );
}
