/**
 * R6 — the last look before it goes.
 *
 * @blueprint R6 · D09 · D27 · request.broadcast
 * @owner patient-app
 * @why The only screen in the loop whose job is to be read rather than used.
 *      Two things it must state and a summary card would not: what "الآن"
 *      actually means as a duration, because D09 fixed three windows and a
 *      patient choosing between them deserves the number; and that a request
 *      sent without a connection will WAIT, said before the tap rather than
 *      discovered after it (D27).
 */
import { Marketplace, type Refusal } from "@dawai/domain";
import { type RedirectReason } from "@dawai/navigation";
import * as DraftModel from "../model/draft.js";
import { resolveView } from "../model/view.js";
import { CORE_LOOP } from "./core-loop.contract.js";
import { GRAPH } from "./graph.js";
import { Card, Chip, Digits, Grow, Label, Note, Primary, RedirectNote, Row, Screen, Section } from "../ui/kit.js";
import { word } from "../ui/refusal.js";
import type { Theme } from "../ui/theme.js";
import { PATIENT_FLOWS } from "./flows.js";

const R6 = CORE_LOOP.find((c) => c.id === "R6")!;

/** D09's three windows, worded with their duration. "خلال يومين" rather than
 *  "هذا الأسبوع" is the Blueprint's own wording and is deliberately concrete. */
const WINDOWS: readonly { readonly urgency: Marketplace.Urgency; readonly label: string; readonly says: string }[] = [
  { urgency: "now", label: "الآن", says: "نسأل الصيدليات ونستنى 20 دقيقة" },
  { urgency: "today", label: "اليوم", says: "نستنى 4 ساعات" },
  { urgency: "soon", label: "خلال يومين", says: "نستنى يومين" },
];

export type ConfirmProps = {
  readonly t: Theme;
  readonly draft: DraftModel.Draft;
  readonly history: readonly string[];
  readonly online: boolean;
  readonly refusal: Refusal | null;
  readonly redirectBecause: RedirectReason | null;
  readonly sending: boolean;
  readonly onSetUrgency: (u: Marketplace.Urgency) => void;
  readonly onSend: () => void;
  readonly onBack: () => void;
  readonly onAction: (to: string) => void;
};

export function ConfirmScreen(p: ConfirmProps) {
  const { t, draft } = p;
  const blocked = DraftModel.validate(draft);
  const view = resolveView(
    R6,
    p.refusal ? { kind: "error", detail: p.refusal.code }
      : !p.online ? { kind: "offline", ageMs: null }
      : { kind: "ready" },
    GRAPH, p.history, PATIENT_FLOWS,
  );

  return (
    <Screen
      t={t} view={view} onBack={p.onBack} onAction={p.onAction}
      footer={
        <Primary
          t={t}
          // D27 — the button says what will actually happen. Offering "أرسل
          // الطلب" with no connection promises something the app cannot do.
          label={p.online ? "أرسل الطلب" : "أرسله أول ما يرجع الاتصال"}
          disabled={blocked !== null}
          busy={p.sending}
          onPress={p.onSend}
        />
      }
    >
      <RedirectNote t={t} because={p.redirectBecause} />

      {blocked ? (
        <Note t={t} tone="caution">
          <Label t={t} role="body" color="warning">{word(blocked).says}</Label>
        </Note>
      ) : null}

      <Section t={t}>
        {draft.lines.map((l) => (
          <Card key={l.itemId} t={t}>
            <Row t={t} gap={3}>
              <Grow>
                <Label t={t} role="headline">{l.name}</Label>
                <Label t={t} role="caption" color="inkMuted">{`${l.strength} · ${l.form}`}</Label>
              </Grow>
              <Row t={t} gap={1}>
                <Digits t={t} value={l.packs} role="headline" />
                <Label t={t} role="caption" color="inkMuted">علبة</Label>
              </Row>
            </Row>
          </Card>
        ))}
      </Section>

      <Section t={t}>
        <Label t={t} role="headline">شكد مستعجل؟</Label>
        {WINDOWS.map((w) => {
          const chosen = draft.urgency === w.urgency;
          return (
            <Chip
              key={w.urgency}
              label={w.label}
              spoken={`${w.label} — ${w.says}`}
              selected={chosen}
              onPress={() => p.onSetUrgency(w.urgency)}
              t={t}
            >
              <Label t={t} role="caption" color="inkMuted">{w.says}</Label>
            </Chip>
          );
        })}
      </Section>
    </Screen>
  );
}
