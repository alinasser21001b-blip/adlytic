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

import * as Consent from "../model/consent.js";
import * as Offers from "../model/offers.js";
import { type Phase } from "../model/view.js";
import { CORE_LOOP } from "./core-loop.contract.js";
import { Screen, Label, Bidi, Primary, Choice, InfoCard, Row, Spacer, Grow, Card, Section } from "../ui/kit.js";
import type { Theme } from "../ui/theme.js";
import { viewOf } from "./graph.js";

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
  const view = viewOf(R9.id, phase, p.history);
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
          branchName={summary.offer.branchName}
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
          <Row key={l.requestLineId} t={t} align="baseline">
            <Label t={t} role="body">{l.itemName}</Label>
            <Spacer />
            <Label t={t} role="body" color={l.answer.kind === "unavailable" ? "inkSubtle" : "inkMuted"}>
              {l.answer.kind === "unavailable" ? "ما متوفر" : Offers.formatPrice(l.answer.priceMinor)}
            </Label>
          </Row>
        ))}
        <Row t={t} align="baseline">
          <Label t={t} role="headline">المجموع</Label>
          <Spacer />
          <Label t={t} role="headline">{Offers.formatPrice(summary.totalMinor)}</Label>
        </Row>
      </InfoCard>
    </Screen>
  );
}

/** R10 — the acknowledgement itself. Never pre-ticked, never automatic. */
function SubstitutionChoice(
  { t, branchName, comparison, onDecide }:
  { t: Theme; branchName: string; comparison: Consent.Comparison; onDecide: (d: "agreed" | "refused") => void },
) {
  const chosen = comparison.decision;
  // A role, not a hex: the card draws the colour, the screen names the state.
  const border = chosen === "agreed" ? "accent" as const : chosen === "refused" ? "line" as const : "warning" as const;

  return (
    <Card t={t} gap={3} border={border} borderWidth={2}>
      {/* Names the situation, not the offer. «الصيدلية تعرض بديل» reads as an
          item of news; this reads as what it is — the medicine is not the one
          that was asked for. */}
      <Section t={t}>
        <Label t={t} role="title">دواء غير اللي طلبته</Label>
        {/* The anti-nudge, stated rather than implied. Without this sentence
            the app's neutrality is something the patient has to infer from a
            layout, and a patient who suspects the app prefers "yes" will
            answer yes. */}
        <Label t={t} role="body" color="inkMuted">
          {`${branchName} تعرض بديلاً. القرار إلك — الجوابين عدنا سواء.`}
        </Label>
      </Section>

      {/* Asked beside offered, literally side by side. A patient cannot consent
          to a swap they have to reconstruct from two paragraphs. */}
      <Row t={t} gap={3} align="stretch">
        <Grow>
          <Card t={t} gap={1}>
            <Label t={t} role="caption" color="inkSubtle">طلبتِ</Label>
            <Label t={t} role="headline">{comparison.asked}</Label>
            {/* The name on the box. A patient checking a swap against a
                prescription, a package or another pharmacist reads this one,
                and until the offer line carried it they had nothing to check
                against. Absent rather than transliterated when unknown — a
                guessed Latin name is worse than none on a medicine box. */}
            {comparison.askedLatin
              ? <Bidi t={t} text={comparison.askedLatin} role="caption" color="inkMuted" />
              : null}
          </Card>
        </Grow>
        <Grow>
          <Card t={t} gap={1}>
            <Label t={t} role="caption" color="inkSubtle">يعرض</Label>
            <Label t={t} role="headline">{comparison.offered}</Label>
            {comparison.offeredLatin
              ? <Bidi t={t} text={comparison.offeredLatin} role="caption" color="inkMuted" />
              : null}
            <Label t={t} role="caption" color="inkMuted">{Offers.formatPrice(comparison.priceMinor)}</Label>
          </Card>
        </Grow>
      </Row>

      {/* D19 — the pharmacist's own words, verbatim, and SAID to be verbatim.
          A quote the patient does not know is unedited is a quote they have to
          discount. */}
      <Card t={t} surface="sunken" border="none" gap={2}>
        <Label t={t} role="caption" color="inkSubtle">كلام الصيدلي — مثل ما كتبه، ما نلخّصه</Label>
        <Label t={t} role="body">{`«${comparison.note}»`}</Label>
        {/* D19 — who said it, and on what authority. A clinical claim with no
            author is one a patient cannot weigh. «صيدلي مُجاز» appears only
            when the platform's registration record says so; an unverified
            author is still named, because hiding them would be worse. */}
        <Label t={t} role="caption" color="inkSubtle">
          {comparison.proposedBy.licenceVerified
            ? `${comparison.proposedBy.name} — صيدلي مُجاز، ${comparison.proposedBy.branchName}`
            : `${comparison.proposedBy.name} — ${comparison.proposedBy.branchName}`}
        </Label>
      </Card>

      {/* Two separate promises, and the patient needs both. The first is that
          refusing costs nothing — D06 sends a refused line to a child request
          exactly as an out-of-stock line goes. The second is that this consent
          does not generalise: agreeing once must not be understood as agreeing
          to every future substitution, which is the difference between consent
          and a standing permission nobody asked for. */}
      <Label t={t} role="caption" color="inkMuted">
        إذا ما توافق، هذا الدواء يروح لطلب جديد تلقائياً — الباقي يبقى محجوز.
      </Label>
      <Label t={t} role="caption" color="inkMuted">
        موافقتك على هذا الدواء بس — مو على كل بديل جاي.
      </Label>

      {/* Identical weight, and short enough not to wrap on a 320pt phone —
          «أوافق على البديل» wrapped onto two lines there while «لا، أريد اللي
          طلبته» wrapped onto two at 360 as well, so the two answers were
          different heights and the longer one read as the heavier choice. */}
      <Row t={t}>
        <Choice t={t} label="أوافق" spoken={`أوافق على ${comparison.offered}`} selected={chosen === "agreed"} onPress={() => onDecide("agreed")} />
        <Choice t={t} label="أرفض" spoken={`أرفض البديل، أريد ${comparison.asked}`} selected={chosen === "refused"} onPress={() => onDecide("refused")} />
      </Row>
    </Card>
  );
}
