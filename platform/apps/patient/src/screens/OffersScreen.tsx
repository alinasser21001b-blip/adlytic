/**
 * R8 — comparing the offers.
 *
 * @blueprint R8 · D06 · D08 · D11 · D12 · §8
 * @owner patient-app
 * @why This is the most consequential screen in the product: the patient is
 *      choosing where to walk with a sick child. Four things it must do that a
 *      price list would not.
 *
 *      It shows coverage before price, because an offer that cannot supply the
 *      medicine is not cheaper. It never ranks — the order is coverage then
 *      price, both printed on the row, and the screen says so, because D12
 *      forbids ranking, weighting and paid placement and a silent sort is a
 *      ranking the patient cannot audit. It states reliability as a band (D11),
 *      because a decimal invites an argument about a number instead of about
 *      the behaviour.
 *
 *      And a row OPENS the offer — it does not reserve. The first build made
 *      the row tap commit the reservation behind a «+» affordance that reads as
 *      "add to a list", so the most consequential tap in the product looked
 *      like the least. The delivery states the rule outright: «الحجز ما يصير
 *      قبل ما تأكد» — nothing is reserved before you confirm.
 */

import * as Offers from "../model/offers.js";
import { type Phase } from "../model/view.js";
import { CORE_LOOP } from "./core-loop.contract.js";
import { Screen, Label, ActionCard, InfoCard, Row, Spacer, Tag, Section } from "../ui/kit.js";
import { Enter } from "../ui/motion.jsx";
import { motion } from "@dawai/design";
import type { Theme } from "../ui/theme.js";
import { viewOf } from "./graph.js";

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
    p.staleOfferName ? { kind: "error" }
    : p.loading ? { kind: "loading" }
    : p.offers.length === 0 ? { kind: "empty", isSuccess: false }
    : { kind: "ready" };

  const view = viewOf(R8.id, phase, p.history);
  const ordered = Offers.forReading(p.offers);

  return (
    <Screen t={t} view={view} onBack={p.onBack} onAction={p.onAction}>
      {ordered.length > 0 ? (
        <>
          <Section t={t}>
            <Label t={t} role="title">{`العروض (${ordered.length})`}</Label>
            {/* Said out loud, because a list a patient cannot audit is a
                ranking whatever it is called. D12 forbids one. */}
            <Label t={t} role="caption" color="inkSubtle">
              مرتبة حسب التغطية ثم السعر — ما نرجّح صيدلية على صيدلية، وما في إعلانات
            </Label>
          </Section>

          {ordered.map((s, i) => (
            // Staggered: offers arrived one at a time from different
            // pharmacies, and a list that materialises whole hides that. The
            // delay is per row, from the delivered token.
            <Enter key={s.offer.offerId} name="offerArrival" delay={i * motion.offerArrival.duration}>
              <OfferRow t={t} s={s} requested={p.requestedLines} onOpen={p.onDetails} />
            </Enter>
          ))}

          {/* The rule the rows depend on, stated where the taps are. Without it
              a patient has to guess whether opening an offer commits them. */}
          <Label t={t} role="caption" color="inkSubtle">
            افتح أي عرض حتى تشوف تفاصيله — الحجز ما يصير قبل ما تأكد.
          </Label>
        </>
      ) : null}
    </Screen>
  );
}

function OfferRow(
  { t, s, requested, onOpen }:
  { t: Theme; s: Offers.OfferSummary; requested: number; onOpen: (id: string) => void },
) {
  const honoured = Offers.describeHonoured(s.offer.honoured);
  const body = (
    <>
      {/* Name and price as peers on one baseline. The first build set the price
          at title weight, which made the cheapest offer the loudest thing on
          the screen — a ranking by typography on a screen that forbids one. */}
      <Row t={t} align="baseline">
        <Label t={t} role="headline">{s.offer.branchName}</Label>
        <Spacer />
        <Label t={t} role="headline">{Offers.formatPrice(s.totalMinor)}</Label>
      </Row>

      {/* Coverage first. The patient's question is "does it have my medicine",
          and answering with a price first answers a question they did not ask. */}
      <Row t={t} align="baseline">
        <Label t={t} role="caption" color={s.complete ? "inkMuted" : "warning"}>
          {`يغطي ${s.covers[0]} من ${requested}`}
        </Label>
        <Spacer />
        <Label t={t} role="caption" color="inkMuted">{Offers.describeDistance(s.offer.distanceM)}</Label>
      </Row>

      {s.missing.length > 0
        // Which one is missing, not merely how many — that is always the
        // patient's next question, and making them tap for it is a wasted tap.
        ? <Label t={t} role="caption" color="warning">
            {`ناقص: ${s.missing.join("، ")} — الباقي يصير طلب جديد بنفسه`}
          </Label>
        : null}

      {/* Every caveat as its own tag. They used to run together on one line —
          «أحياناً ما تلتزم بالحجز   فيها بديل — تحتاج موافقتك» read as a single
          sentence, and two separate warnings became one unparseable one. */}
      <Row t={t} wrap>
        <Tag t={t}><Label t={t} role="caption" color="inkMuted">{honoured.says}</Label></Tag>
        {s.hasSubstitution
          // §4 R10 — a substitution is never automatic and never pre-ticked.
          ? <Tag t={t}><Label t={t} role="caption" color="warning">فيها بديل</Label></Tag>
          : null}
        {!s.offer.openNow
          ? <Tag t={t}><Label t={t} role="caption" color="inkMuted">مسدودة هسه</Label></Tag>
          : null}
      </Row>
    </>
  );

  return Offers.choosable(s.offer)
    ? <ActionCard t={t} affordance="none" label={`افتح عرض ${s.offer.branchName}`} onPress={() => onOpen(s.offer.offerId)}>{body}</ActionCard>
    : <InfoCard t={t} muted>{body}<Label t={t} role="caption" color="inkMuted">هذا العرض ما عاد متاح</Label></InfoCard>;
}
