/**
 * R9 and R10 — one offer in full, and consenting to a substitution.
 *
 * @blueprint R9 · R10 · D06 · D19 · §4 R10
 * @owner clinical-engine
 * @why This screen closes TD-5, which the review carried at critical: a
 *      substitution could be seen on R8 and accepted with the offer, while §4
 *      R10 requires an explicit acknowledgement of a different brand. A flag on
 *      a row is not consent.
 *
 *      Three things make the choice real rather than a formality. Neither
 *      answer is pre-selected, so the patient must actually answer. What they
 *      asked for sits beside what is offered, with the pharmacist's own words
 *      unparaphrased (D19). And refusing is presented as costing nothing,
 *      because it does — D06 sends a refused line to the child request exactly
 *      as an out-of-stock line goes, and a patient who believes refusing loses
 *      the order will agree to a brand they did not want.
 */
import { View } from "react-native";
import { PATIENT_FLOWS } from "@dawai/navigation";
import * as Consent from "../model/consent.js";
import * as Offers from "../model/offers.js";
import { resolveView, type Phase } from "../model/view.js";
import { CORE_LOOP } from "./core-loop.contract.js";
import { GRAPH } from "../app/store.js";
import { Screen, Label, Primary, Choice, InfoCard } from "../ui/kit.js";
import type { Theme } from "../ui/theme.js";

const R9 = CORE_LOOP.find((c) => c.id === "R9")!;

export type OfferDetailProps = {
  readonly t: Theme;
  readonly summary: Offers.OfferSummary;
  readonly consent: Consent.ConsentState;
  readonly requestedLines: number;
  readonly history: readonly string[];
  readonly withdrawn: boolean;
  readonly onDecide: (requestLineId: string, decision: "agreed" | "refused") => void;
  readonly onReserve: () => void;
  readonly onBack: () => void;
  readonly onAction: (to: string) => void;
};

export function OfferDetailScreen(p: OfferDetailProps) {
  const { t, summary, consent } = p;
  const blocked = Consent.gate(consent);
  const phase: Phase = p.withdrawn ? { kind: "error", detail: "withdrawn" } : { kind: "ready" };
  const view = resolveView(R9, phase, GRAPH, p.history, PATIENT_FLOWS);
  const outstanding = Consent.outstanding(consent);

  return (
    <Screen
      t={t} view={view} onBack={p.onBack} onAction={p.onAction}
      footer={p.withdrawn ? undefined : (
        <>
          {blocked
            // Says what is left rather than only refusing. A disabled button
            // with no count is a puzzle, not a control.
            ? <Label t={t} role="caption" color="warning">
                {outstanding === 1 ? "باقي بديل واحد تقرر بيه" : `باقي ${outstanding} بدائل تقرر بيهم`}
              </Label>
            : null}
          <Primary
            t={t}
            label={view.primary?.label ?? "احجز من هنا"}
            disabled={blocked !== null}
            onPress={p.onReserve}
          />
        </>
      )}
    >
      {/* The decision comes first. It was below the fold beneath the price
          breakdown, so the patient saw a disabled button and a note about a
          choice they could not see — on the one screen where the choice IS the
          screen. */}
      {consent.substitutions.map((s) => (
        <SubstitutionChoice
          key={s.requestLineId}
          t={t}
          comparison={Consent.comparison(consent, s.requestLineId)!}
          onDecide={(d) => p.onDecide(s.requestLineId, d)}
        />
      ))}

      <InfoCard t={t}>
        <Label t={t} role="headline">{summary.offer.branchName}</Label>
        <Label t={t} role="caption" color="inkMuted">
          {`${Offers.describeDistance(summary.offer.distanceM)} · ${Offers.describeHonoured(summary.offer.honoured).says}`}
        </Label>
      </InfoCard>

      {/* Every line, priced. R8 shows a total; this is where a patient checks
          it line by line before committing. */}
      <InfoCard t={t}>
        {summary.offer.lines.map((l) => (
          <View key={l.requestLineId} style={{ flexDirection: "row", alignItems: "baseline", gap: t.space[2] }}>
            <Label t={t} role="body">{l.itemName}</Label>
            <View style={{ flex: 1 }} />
            <Label t={t} role="body" color={l.answer.kind === "unavailable" ? "inkSubtle" : "inkMuted"}>
              {l.answer.kind === "unavailable" ? "ما متوفر" : Offers.formatPrice(l.answer.priceMinor)}
            </Label>
          </View>
        ))}
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: t.space[2] }}>
          <Label t={t} role="headline">المجموع</Label>
          <View style={{ flex: 1 }} />
          <Label t={t} role="headline">{Offers.formatPrice(summary.totalMinor)}</Label>
        </View>
      </InfoCard>
    </Screen>
  );
}

/** R10 — the acknowledgement itself. Never pre-ticked, never automatic. */
function SubstitutionChoice(
  { t, comparison, onDecide }:
  { t: Theme; comparison: Consent.Comparison; onDecide: (d: "agreed" | "refused") => void },
) {
  const chosen = comparison.decision;
  const border = chosen === "agreed" ? t.color.accent : chosen === "refused" ? t.color.line : t.color.warning;

  return (
    <View style={{
      padding: t.space[4], gap: t.space[3],
      borderRadius: t.radius.lg, backgroundColor: t.color.surfaceRaised,
      borderWidth: 2, borderColor: border,
    }}>
      <Label t={t} role="headline" color="warning">الصيدلية تعرض بديل</Label>

      {/* Asked beside offered. A patient cannot consent to a swap they have to
          reconstruct from two screens. */}
      <View style={{ gap: t.space[1] }}>
        <Label t={t} role="caption" color="inkMuted">إنت طلبت</Label>
        <Label t={t} role="body">{comparison.asked}</Label>
      </View>
      <View style={{ gap: t.space[1] }}>
        <Label t={t} role="caption" color="inkMuted">هم عندهم</Label>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: t.space[2] }}>
          <Label t={t} role="body">{comparison.offered}</Label>
          <View style={{ flex: 1 }} />
          <Label t={t} role="body" color="inkMuted">{Offers.formatPrice(comparison.priceMinor)}</Label>
        </View>
      </View>

      {/* D19 — the pharmacist's own words, verbatim. The app never paraphrases
          a clinical statement. */}
      <InfoCard t={t} muted>
        <Label t={t} role="caption" color="inkMuted">كلام الصيدلي</Label>
        <Label t={t} role="body">{comparison.note}</Label>
      </InfoCard>

      {/* Refusing is stated as costing nothing, because it does not — a patient
          who thinks "no" loses the order will say yes to a brand they did not
          want, and that is consent in name only. */}
      <Label t={t} role="caption" color="inkMuted">
        إذا ما توافق، هذا الدواء يروح لطلب جديد تلقائياً — الباقي يبقى محجوز.
      </Label>

      <View style={{ flexDirection: "row", gap: t.space[2] }}>
        <Choice t={t} label="أوافق على البديل" selected={chosen === "agreed"} onPress={() => onDecide("agreed")} />
        <Choice t={t} label="لا، أريد اللي طلبته" selected={chosen === "refused"} onPress={() => onDecide("refused")} />
      </View>
    </View>
  );
}
