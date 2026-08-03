/**
 * R7 — the wait, made legible.
 *
 * @blueprint R7 · D09 · D27 · §6 Request · request.answered · request.unanswered
 * @owner patient-app
 * @why "Make the wait legible" is the screen's stated purpose, and the honest
 *      version of that has two forms rather than one. A broadcast request shows
 *      how long is left, because pharmacies have been asked. A queued request
 *      shows no countdown at all and says plainly that it has not been sent —
 *      a progress bar over a request nobody has received is a lie told to the
 *      most anxious user in the product (D27).
 *
 *      The queued state goes further than staying silent about time: it states
 *      why there is no counter. "The count starts only when pharmacies actually
 *      receive your request" turns a missing element into a promise, which is
 *      the difference between a screen that looks broken and one that is
 *      trusted. That sentence is the delivery's, not mine.
 */
import { instant } from "@dawai/domain";

import { describe as describeItem, type OutboxItem } from "@dawai/offline";
import { remaining, type Sent } from "../model/send.js";
import { resolveView } from "../model/view.js";
import { CORE_LOOP } from "./core-loop.contract.js";
import { GRAPH, isBuilt } from "./graph.js";
import {
  Card, Dial, Grow, Label, Primary, Row, Screen, Secondary, Section, Spacer,
} from "../ui/kit.js";
import type { Theme } from "../ui/theme.js";
import { PATIENT_FLOWS } from "./flows.js";

const R7 = CORE_LOOP.find((c) => c.id === "R7")!;

export type WaitingProps = {
  readonly t: Theme;
  readonly sent: Sent;
  readonly history: readonly string[];
  readonly now: number;
  readonly urgency: "now" | "today" | "soon";
  readonly offerCount: number;
  readonly onBack: () => void;
  readonly onAction: (to: string) => void;
};

export function WaitingScreen(p: WaitingProps) {
  const { t, sent } = p;
  const queued = sent.state === "queued";
  const left = remaining(sent.windowEndsAt, p.urgency, instant(p.now));

  const view = resolveView(
    R7,
    // Waiting with nothing yet is a success state, not an absence: we asked,
    // and nobody has answered YET. Offering an action here would invent
    // urgency the patient cannot act on.
    queued ? { kind: "offline", ageMs: null }
      : p.offerCount === 0 ? { kind: "empty", isSuccess: true }
      : { kind: "ready" },
    GRAPH, p.history, PATIENT_FLOWS,
  );

  return (
    <Screen
      t={t} view={view} onBack={p.onBack} onAction={p.onAction}
      // The contract answers "what do I do next?" per state, so the screen does
      // not choose: queued offers «تمام — خبروني», sent offers the offers.
      // The delivery puts both actions at the bottom edge, the cancel centred
      // beneath the primary. The previous build left the cancel floating in the
      // content, where it was the only control on the screen and therefore the
      // most prominent thing on it — a destructive action winning by default.
      footer={(
        <>
          {/* Absent while nobody has replied: the contract declares no primary
              for that state, because there is genuinely nothing to press. */}
          {view.primary
            ? <Primary t={t} label={view.primary.label} onPress={() => p.onAction(view.primary!.leadsTo)} />
            : null}
          {R7.secondary.filter((s) => isBuilt(s.leadsTo)).map((s) => (
            <Row key={s.label} t={t} justify="center">
              <Secondary
                t={t}
                // The delivery names the cancel differently before and after
                // sending: one withdraws something nobody has seen, the other
                // retracts a live request.
                label={queued ? "إلغاء الطلب قبل الإرسال" : s.label}
                onPress={() => p.onAction(s.leadsTo)}
              />
            </Row>
          ))}
        </>
      )}
    >
      {queued
        ? <Queued t={t} items={sent.outbox.items} />
        : <Broadcast
            t={t} left={left} offers={p.offerCount}
            // The success-empty's declared words, rendered where the delivery
            // puts them. The screen does not write a second sentence meaning
            // the same thing.
            waiting={view.treatment?.kind === "empty" ? view.treatment.explains : null}
          />}

    </Screen>
  );
}

/**
 * D27 — nothing has been sent, and the screen says so in the delivery's own
 * words, with the outbox's own labels beneath.
 */
function Queued({ t, items }: { t: Theme; items: readonly OutboxItem[] }) {
  return (
    <>
      <Section t={t}>
        <Label t={t} role="title">بانتظار الاتصال</Label>
        <Label t={t} role="body" color="inkMuted">
          طلبك محفوظ عندك بالجهاز. ما انرسل لأي صيدلية بعد. أول ما يرجع النت نرسله بنفسنا — ما تحتاج تسوي شي.
        </Label>
      </Section>

      {/* What is actually waiting, named from the outbox, so no screen can
          summarise the queue into a friendlier count than it holds.

          `label` says what the entry IS; `describe` says what has happened to
          it. The delivery lists individual medicines with pack counts, but the
          outbox holds REQUESTS and its payload is opaque to the UI by design —
          so this lists the entries that exist rather than a breakdown that
          would have to be invented. Recorded as DEV-6. */}
      <Card t={t} gap={3}>
        <Label t={t} role="caption" color="inkSubtle">بصندوق الصادر</Label>
        {items.map((item) => (
          <Row key={item.id} t={t} align="baseline">
            <Label t={t} role="body">{item.label}</Label>
            <Spacer />
            <Label t={t} role="caption" color="inkSubtle">{describeItem(item)}</Label>
          </Row>
        ))}
      </Card>

      {/* The absent countdown, explained. Without this sentence the screen
          reads as one where the timer failed to load. */}
      <Card t={t} surface="sunken" border="none">
        <Label t={t} role="body" color="inkSubtle">
          ما في عدّاد هنا عمداً — العد يبدي بس لمن الصيدليات فعلاً تستلم طلبك.
        </Label>
      </Card>
    </>
  );
}

/** The request is live. D09's window is running, so the time is real. */
function Broadcast(
  { t, left, offers, waiting }:
  { t: Theme; left: { ms: number; fraction: number } | null; offers: number; waiting: string | null },
) {
  const minutes = left ? Math.ceil(left.ms / 60_000) : 0;
  return (
    <>
      <Section t={t}>
        <Label t={t} role="title">انرسل — ننتظر الردود</Label>
        <Label t={t} role="body" color="inkMuted">
          {waiting ?? `وصلنا ${offers} ${offers === 1 ? "رد" : "ردود"}`}
        </Label>
      </Section>

      <Card t={t} gap={4}>
        <Row t={t} gap={4}>
          {/* The window as a dial rather than a bar: a bar says how much of
              something is done, and nothing here is being done — time is
              passing while several pharmacies decide. */}
          <Dial t={t} fraction={left?.fraction ?? 0} value={`${minutes}`} label="الوقت الباقي على نافذة الردود" />
          <Grow>
            <Label t={t} role="body" color="inkMuted">
              باقي على نافذة الردود. إذا خلصت بدون رد، نكلّك الصدك ونقترح شنو تسوي.
            </Label>
          </Grow>
        </Row>
      </Card>
    </>
  );
}
