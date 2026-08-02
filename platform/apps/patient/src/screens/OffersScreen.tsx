/**
 * R8 — comparing the offers.
 *
 * @blueprint R8 · D06 · D08 · D11 · D12 · §8
 * @owner patient-app
 * @why This is the most consequential screen in the product: the patient is
 *      choosing where to walk with a sick child. Three things it must do that a
 *      price list would not. It shows coverage before price, because an offer
 *      that cannot supply the medicine is not cheaper. It never ranks — the
 *      order is coverage then price, both printed on the row, and the screen
 *      says so, because D12 forbids ranking, weighting and paid placement and a
 *      silent sort is a ranking the patient cannot audit. And it states
 *      reliability as a band (D11), because a decimal invites an argument about
 *      a number instead of about the behaviour.
 */
import { PATIENT_FLOWS } from "@dawai/navigation";
import * as Offers from "../model/offers.js";
import { resolveView, type Phase } from "../model/view.js";
import { CORE_LOOP } from "./core-loop.contract.js";
import { GRAPH } from "../app/store.js";
import { Screen, Label, Digits, ActionCard, InfoCard, Row } from "../ui/kit.js";
import type { Theme } from "../ui/theme.js";

const R8 = CORE_LOOP.find((c) => c.id === "R8")!;

export type OffersProps = {
  readonly t: Theme;
  readonly offers: readonly Offers.OfferSummary[];
  readonly requestedLines: number;
  readonly history: readonly string[];
  readonly loading: boolean;
  readonly staleOfferName: string | null;
  readonly onChoose: (offerId: string) => void;
  readonly onDetails: (offerId: string) => void;
  readonly onBack: () => void;
  readonly onAction: (to: string) => void;
};

export function OffersScreen(p: OffersProps) {
  const { t } = p;
  const phase: Phase =
    p.staleOfferName ? { kind: "error", detail: p.staleOfferName }
    : p.loading ? { kind: "loading" }
    : p.offers.length === 0 ? { kind: "empty", isSuccess: false }
    : { kind: "ready" };

  const view = resolveView(R8, phase, GRAPH, p.history, PATIENT_FLOWS);
  const ordered = Offers.forReading(p.offers);

  return (
    <Screen t={t} view={view} onBack={p.onBack} onAction={p.onAction}>
      {ordered.length > 0 ? (
        <>
          {/* Said out loud, because a list a patient cannot audit is a ranking
              whatever it is called. D12 forbids one. */}
          <Label t={t} role="caption" color="inkSubtle">
            مرتّبة حسب شنو تكدر توفره، وبعدين السعر — ما في ترتيب مدفوع
          </Label>
          {ordered.map((s) => (
            <OfferRow key={s.offer.offerId} t={t} s={s} requested={p.requestedLines} onChoose={p.onChoose} />
          ))}
        </>
      ) : null}

      {/* R8 declares a "see offer details" secondary leading to R9. It is not
          rendered here because at screen level it has no subject — it would
          have to pick an offer for the patient. It belongs on the row, and it
          arrives with R9. */}
    </Screen>
  );
}

function OfferRow({ t, s, requested, onChoose }: { t: Theme; s: Offers.OfferSummary; requested: number; onChoose: (id: string) => void }) {
  const honoured = Offers.describeHonoured(s.offer.honoured);
  const body = (
    <>
      <Row t={t} align="baseline">
        <Label t={t} role="headline">{s.offer.branchName}</Label>
        <Label t={t} role="caption" color="inkSubtle">{Offers.describeDistance(s.offer.distanceM)}</Label>
      </Row>

      {/* Coverage first. The patient's question is "does it have my medicine",
          and answering with a price first answers a question they did not ask. */}
      <Row t={t} align="baseline">
        {s.complete
          ? <Label t={t} role="body" color="accent">عندها كل اللي طلبته</Label>
          : (
            <>
              <Label t={t} role="body" color="warning">عندها</Label>
              <Digits t={t} value={s.covers[0]} role="body" />
              <Label t={t} role="body" color="warning">من</Label>
              <Digits t={t} value={requested} role="body" />
            </>
          )}
      </Row>

      {s.missing.length > 0
        // Which one is missing, not merely how many — that is always the
        // patient's next question, and making them tap for it is a wasted tap.
        ? <Label t={t} role="caption" color="inkMuted">{`ناقص: ${s.missing.join("، ")}`}</Label>
        : null}

      <Row t={t} align="baseline">
        <Label t={t} role="title">{Offers.formatPrice(s.totalMinor)}</Label>
        {!s.complete ? <Label t={t} role="caption" color="inkSubtle">للأدوية المتوفرة</Label> : null}
      </Row>

      <Row t={t} gap={3} align="baseline" wrap>
        <Label t={t} role="caption" color={honoured.tone === "caution" ? "warning" : "inkMuted"}>{honoured.says}</Label>
        {s.hasSubstitution
          // §4 R10 — a substitution is never automatic and never pre-ticked.
          ? <Label t={t} role="caption" color="warning">فيها بديل — تحتاج موافقتك</Label>
          : null}
        {!s.offer.openNow ? <Label t={t} role="caption" color="inkMuted">مسدودة هسه</Label> : null}
      </Row>
    </>
  );

  return Offers.choosable(s.offer)
    ? <ActionCard t={t} label={`احجز من ${s.offer.branchName}`} onPress={() => onChoose(s.offer.offerId)}>{body}</ActionCard>
    : <InfoCard t={t} muted>{body}<Label t={t} role="caption" color="inkMuted">هذا العرض ما عاد متاح</Label></InfoCard>;
}
