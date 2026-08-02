/**
 * The layout primitives every patient screen composes.
 *
 * @blueprint §22 · §25 · design/screen-contract
 * @owner patient-app
 * @why Building V2 to the delivery produced no new layout ideas — it produced
 *      the same five arrangements the other seven screens had already written
 *      by hand. A baseline row appeared nine times across five screens, a
 *      wrapped cluster of secondary actions five times, a sunken status note
 *      four times, a `flex: 1` spacer four times, and four screens hand-rolled
 *      a card that differed from `InfoCard` only in padding or border colour.
 *
 *      Every one of those is a distance or a direction chosen at a call site,
 *      which is exactly what the theme exists to prevent: a screen names an
 *      arrangement, it does not measure one. Extracting them means the next
 *      screen is composition, and — more importantly — means a screen CANNOT
 *      quietly introduce a sixth arrangement, a seventh gap value, or a
 *      physical `row-reverse` that double-mirrors inside an RTL container.
 *
 *      What is NOT here is as deliberate as what is. There is no `Grid`, no
 *      `Poster`, no breakpoint helper, no one-off `Centre` and no `Stack`:
 *      nothing in the product uses them, and a primitive with no consumer is a
 *      guess about a screen that has not been designed. `Stack` was written
 *      first and deleted the same day — the scroll body already supplies the
 *      gap between top-level blocks, which is why no screen ever reached for
 *      it, and the review's usage count is what said so.
 */
import * as React from "react";
import { View } from "react-native";
import type { SpaceToken } from "@dawai/design";
import type { Theme } from "./theme.js";

/* ── Arrangement ──────────────────────────────────────────────────────── */

/**
 * Things side by side.
 *
 * `flexDirection` is always `row` — never `row-reverse`. The container already
 * runs right-to-left, so reversing again points the row back at itself; that
 * bug put the back chevron on the wrong edge of every screen once, and the
 * layer check now rejects the literal. Passing through this primitive means a
 * screen never types the property at all.
 *
 * `align="baseline"` is the common case by count: a number beside its unit, a
 * name beside its distance, a price beside its qualifier. Baseline rather than
 * centre because the two runs are one sentence and their feet must line up.
 */
export function Row(
  { t, gap = 2, align = "center", justify, wrap = false, children }:
  {
    t: Theme; gap?: SpaceToken;
    align?: "baseline" | "center" | "stretch";
    justify?: "center" | "space-between";
    /** Content that can exceed one line — chips describing an offer, not a
     *  cluster of actions. `Actions` is the wrapping row for CONTROLS. */
    wrap?: boolean;
    children: React.ReactNode;
  },
) {
  return (
    <View style={{
      flexDirection: "row", alignItems: align, gap: t.space[gap],
      ...(justify ? { justifyContent: justify } : {}),
      ...(wrap ? { flexWrap: "wrap" as const } : {}),
    }}>
      {children}
    </View>
  );
}

/**
 * Pushes what follows to the far edge of a `Row`.
 *
 * Named rather than `<View style={{ flex: 1 }} />` because the intent — "these
 * two belong at opposite ends" — is invisible in the raw style, and because in
 * RTL "the far edge" is the left one, which no call site should have to think
 * about.
 */
export const Spacer = () => <Grow />;

/**
 * Takes whatever width is left in a `Row`.
 *
 * `Spacer` is this with nothing in it — the empty case is common enough to
 * deserve its own name, but they are one idea and one implementation, so a
 * change to how the product distributes leftover space happens once.
 */
export const Grow = ({ children }: { children?: React.ReactNode }) =>
  <View style={{ flex: 1 }}>{children}</View>;

/**
 * A cluster of secondary actions under the content.
 *
 * Wraps, because Arabic labels are long and a fixed row truncates them on a
 * 320pt phone. Never contains a `Primary`: the one dominant action belongs in
 * the footer, and a filled button inside a wrapped cluster is precisely the
 * competing hierarchy the kit exists to prevent.
 */
export function Actions({ t, children }: { t: Theme; children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.space[2] }}>
      {children}
    </View>
  );
}

/* ── Surfaces ─────────────────────────────────────────────────────────── */

/**
 * A rectangle of content raised off the ground.
 *
 * The one card primitive. `InfoCard`, the queued-work card, the substitution
 * card and the medicine row were four separate hand-rolled copies that differed
 * only in padding, border colour or border width — so a change to "what a card
 * is" had to be made in four places and was, twice, made in three.
 */
export function Card(
  { t, children, pad = 4, gap = 2, surface = "raised", border = "line", borderWidth = 1 }:
  {
    t: Theme; children: React.ReactNode;
    pad?: SpaceToken; gap?: SpaceToken;
    surface?: "raised" | "sunken";
    border?: "line" | "accent" | "alert" | "warning" | "none";
    borderWidth?: 1 | 2;
  },
) {
  return (
    <View style={{
      padding: t.space[pad], gap: t.space[gap],
      borderRadius: t.radius.lg,
      backgroundColor: surface === "sunken" ? t.color.surfaceSunken : t.color.surfaceRaised,
      ...(border === "none"
        ? {}
        : { borderWidth, borderColor: t.color[border] }),
    }}>
      {children}
    </View>
  );
}

/**
 * A short statement about the content beside it — "دواء واحد يحتاج وصفة", a
 * guard's reason for sending you here, work waiting for a signal.
 *
 * Sunken rather than raised: it is a remark ABOUT the screen, so it sits below
 * the plane the content is on instead of competing with it as another card.
 * `tone` carries the colour, so no call site picks `warning` or `alert` for
 * itself and the four copies of this block cannot drift to four different
 * shades of the same worry.
 */
export function Note(
  { t, tone = "neutral", gap = 3, children }:
  { t: Theme; tone?: "neutral" | "caution" | "alert"; gap?: SpaceToken; children: React.ReactNode },
) {
  return (
    <View style={{
      padding: t.space[4], gap: t.space[gap],
      borderRadius: t.radius.md,
      backgroundColor: t.color.surfaceSunken,
      // Only an alert is outlined. A caution that is also outlined reads as an
      // error, and a patient who is told everything is urgent believes nothing.
      ...(tone === "alert" ? { borderWidth: 1, borderColor: t.color.alert } : {}),
    }}>
      {children}
    </View>
  );
}

/**
 * A small, non-interactive fact about the thing it sits on — how reliably a
 * pharmacy honours a hold, whether it is open.
 *
 * Not a control and never styled like one: a tag that looks pressable on the
 * most consequential screen in the product invites a tap that does nothing,
 * and on R8 every tap the patient makes is about where to walk with a sick
 * child. One neutral treatment for every tag, so no tag can be dressed up to
 * make one pharmacy look better than another — D12 forbids exactly that.
 */
export function Tag({ t, children }: { t: Theme; children: React.ReactNode }) {
  return (
    <View style={{
      backgroundColor: t.color.line,
      paddingVertical: t.space[1], paddingHorizontal: t.space[2],
      borderRadius: t.radius.sm,
    }}>
      {children}
    </View>
  );
}

/* ── Grouping ─────────────────────────────────────────────────────────── */

/**
 * A heading and the things it governs, as one unit.
 *
 * The gap inside a section is tighter than the gap between sections — that
 * difference is the whole reason a screen reads as groups rather than as a list
 * of equal parts, and it was being retyped as a bare `gap: t.space[2]` each
 * time it was wanted.
 */
export function Section(
  { t, children }: { t: Theme; children: React.ReactNode },
) {
  return <View style={{ gap: t.space[2] }}>{children}</View>;
}

/**
 * A quiet label above the value it names — the vertical sibling of `FactRow`.
 *
 * Used where the value is prose rather than a figure ("إنت طلبت" / the medicine
 * the patient asked for), because a long Arabic name set on the same line as
 * its label wraps under the label and stops looking like an answer.
 */
export function Field(
  { t, children }: { t: Theme; children: React.ReactNode },
) {
  return <View style={{ gap: t.space[1] }}>{children}</View>;
}
