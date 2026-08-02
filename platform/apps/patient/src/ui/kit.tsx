/**
 * The components every patient screen is built from.
 *
 * @blueprint §22 · §23 · §25 · §26 · design/screen-contract
 * @owner patient-app
 * @why A screen assembles these and nothing else, which is how the UX rules
 *      become structural rather than remembered: `Screen` renders the header,
 *      the back affordance and the progress from the resolved view, so a screen
 *      cannot ship without answering "where am I"; `Primary` is the only
 *      dominant control and a screen has at most one by contract; and
 *      `StateBlock` renders the treatment the contract declared, so an empty
 *      state cannot quietly become "no data" and an error cannot become
 *      "something went wrong".
 */
import * as React from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator } from "react-native";
import type { StateTreatment } from "@dawai/design";
import { formatDigits, isolate, needsIsolation } from "@dawai/design";
import type { ScreenView } from "../model/view.js";
import type { Theme } from "./theme.js";
import { Card, Note, Row, Spacer } from "./layout.js";

// Re-exported so a screen has one import for the whole system rather than
// having to know which file a primitive happens to live in.
export { Row, Spacer, Grow, Actions, Card, Note, Section, Field, Tag } from "./layout.js";

export type Press = () => void;

/* ── Text ─────────────────────────────────────────────────────────────── */

export function Label(
  { t, role = "body", color = "ink", children, numberOfLines }:
  { t: Theme; role?: "code" | "display" | "poster" | "title" | "headline" | "body" | "caption"; color?: "ink" | "inkMuted" | "inkSubtle" | "accent" | "alert" | "onAccent" | "warning"; children: React.ReactNode; numberOfLines?: number },
) {
  const s = t.type[role];
  return (
    <Text
      numberOfLines={numberOfLines}
      style={{
        fontFamily: t.fontFamily, fontSize: s.size, lineHeight: Math.round(s.size * s.lineHeight),
        letterSpacing: s.letterSpacing, fontWeight: String(s.weight) as "400" | "500" | "600" | "700",
        color: t.color[color], writingDirection: t.direction, textAlign: "right",
      }}
    >
      {normaliseNumerals(children)}
    </Text>
  );
}

/**
 * One numeral system per surface, applied where text is rendered rather than
 * where it is produced.
 *
 * The system is **Arabic-Indic**, per the Night Mint delivery: «٤٧ ٢٩»,
 * «٨٬٥٠٠ د.ع», «يغطي ٢ من ٢». The rule §25 states is "one system per surface",
 * not which one — the code enforced Western before a designer had chosen, and
 * the delivery chose. Normalising at render means no call site has to remember,
 * and a server-supplied string carrying the other system is corrected rather
 * than shown beside its opposite.
 *
 * `Bidi` deliberately does NOT pass through here: a Latin run — "Augmentin 625",
 * "+964" — keeps Latin digits, because converting them would break the isolated
 * run the drug name is printed in.
 */
function normaliseNumerals(node: React.ReactNode): React.ReactNode {
  // The thousands mark travels with the digits: «٣٬٠٠٠», not «٣,٠٠٠».
  if (typeof node === "string") return formatDigits(toWestern(node), "arabic-indic").replace(/,/g, "٬");
  if (Array.isArray(node)) return node.map((n, i) => <React.Fragment key={i}>{normaliseNumerals(n)}</React.Fragment>);
  return node;
}

/** Fold either system to Western first, so the conversion below is total
 *  regardless of which system a server string arrived in. */
const toWestern = (s: string): string =>
  s.replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
   .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0));

/**
 * A Latin run inside Arabic text — a drug name, a price, a code. Unisolated,
 * it reorders and the patient reads the wrong number.
 */
export function Bidi({ t, text, role = "body", color = "ink" }: { t: Theme; text: string; role?: "body" | "headline" | "caption" | "title"; color?: "ink" | "inkMuted" | "inkSubtle" }) {
  if (!needsIsolation(text)) return <Label t={t} role={role} color={color}>{text}</Label>;
  const run = isolate(text);
  return <Text style={{ writingDirection: run.dir }}><Label t={t} role={role} color={color}>{run.text}</Label></Text>;
}

/**
 * Every quantity, price and countdown in the patient app, in one numeral
 * system. Mixing two inside a comparison is a defect, not a style.
 *
 * A token containing Latin LETTERS is left entirely alone. Converting only its
 * digits produced «٤K D٢ P٩» — a reservation code in two scripts, which is
 * worse than either. A code is read aloud to a pharmacist and typed into their
 * system; it must be one alphabet whichever alphabet that turns out to be.
 */
export const Digits = ({ t, value, role = "body" }: { t: Theme; value: number | string; role?: "body" | "headline" | "title" | "display" | "code" }) => {
  const raw = String(value);
  const alphanumeric = /[A-Za-z]/.test(raw);
  return (
    <Text style={{
      fontFamily: t.tabularFamily, fontSize: t.type[role].size, color: t.color.ink,
      ...(alphanumeric ? { writingDirection: "ltr" as const } : {}),
    }}>
      {alphanumeric ? raw : formatDigits(toWestern(raw), "arabic-indic").replace(/,/g, "٬")}
    </Text>
  );
};

/* ── Controls ─────────────────────────────────────────────────────────── */

/**
 * The one dominant action. 48pt tall because §25 raises the patient primary
 * above the 44pt floor — this is the control a frightened person presses.
 */
export function Primary({ t, label, onPress, disabled = false, busy = false }: { t: Theme; label: string; onPress: Press; disabled?: boolean; busy?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={{
        minHeight: t.tap.patientPrimary,
        borderRadius: t.radius.lg,
        backgroundColor: disabled ? t.color.surfaceSunken : t.color.accent,
        alignItems: "center", justifyContent: "center",
        paddingHorizontal: t.space[5],
      }}
    >
      {busy
        ? <ActivityIndicator color={t.color.onAccent} />
        : <Label t={t} role="headline" color={disabled ? "inkSubtle" : "onAccent"}>{label}</Label>}
    </Pressable>
  );
}

/**
 * A whole card that is itself the action.
 *
 * The first render of the results list put a filled primary button on every
 * row, so three dominant controls competed on one screen and the eye had
 * nowhere to land. Making the card the target fixes both problems at once: one
 * visual weight for the list, and a tap target the size of the row rather than
 * the size of a button — which is what one-handed use on a small Android phone
 * actually needs.
 */
export function ActionCard(
  { t, label, onPress, children, muted = false, affordance = "add" }:
  {
    t: Theme; label: string; onPress: Press; children: React.ReactNode; muted?: boolean;
    /**
     * What the tap DOES, drawn. "add" puts a medicine in a draft — reversible,
     * and the glyph says so. "none" is for a row that opens something: on R8
     * the «+» claimed the tap would add an item when it actually committed a
     * reservation, which is the worst possible mismatch on the product's most
     * consequential screen. The delivery draws no glyph there and states the
     * rule in words beneath the list instead.
     */
    affordance?: "add" | "none";
  },
) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        minHeight: t.tap.patientPrimary,
        padding: t.space[4], gap: t.space[2],
        borderRadius: t.radius.lg,
        backgroundColor: muted ? t.color.surfaceSunken : t.color.surfaceRaised,
        borderWidth: 1, borderColor: t.color.line,
        flexDirection: "row", alignItems: "center",
      }}
    >
      <View style={{ flex: 1, gap: t.space[1] }}>{children}</View>
      {/* The affordance, not the action: it says the row is pressable without
          claiming the visual weight a primary button would. */}
      {affordance === "add" ? (
        <View style={{
          width: t.space[7], height: t.space[7], borderRadius: t.radius.pill,
          alignItems: "center", justifyContent: "center", backgroundColor: t.color.accent,
        }}>
          <Label t={t} role="headline" color="onAccent">+</Label>
        </View>
      ) : null}
    </Pressable>
  );
}

/** A card that is not an action — a refused item, a summary line. It reads as
 *  information rather than offering a tap that would be rejected.
 *
 *  The default `Card`: it exists as its own name because "this is information,
 *  not a control" is the distinction a screen is making when it reaches for it,
 *  and that intent would be lost if every call site spelled out the surface. */
export const InfoCard = ({ t, children, muted = false }: { t: Theme; children: React.ReactNode; muted?: boolean }) => (
  <Card t={t} surface={muted ? "sunken" : "raised"}>{children}</Card>
);

/**
 * Never competes with the primary: no fill, no accent background.
 *
 * `spoken` exists because a repeated row action needs a label a screen reader
 * can tell apart while the visible text stays short. Putting the medicine name
 * in the visible label wrapped it onto two lines and crowded the stepper —
 * visible text and spoken label are allowed to differ, and this is why.
 */
export function Secondary({ t, label, spoken, onPress }: { t: Theme; label: string; spoken?: string; onPress: Press }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={spoken ?? label}
      onPress={onPress}
      style={{ minHeight: t.tap.min, justifyContent: "center", paddingHorizontal: t.space[3] }}
    >
      <Label t={t} role="body" color="accent">{label}</Label>
    </Pressable>
  );
}

/**
 * One answer among two or more, where the choice itself is the point.
 *
 * Outlined rather than filled, and both options carry identical visual weight:
 * a filled "agree" beside an outlined "refuse" is a nudge, and a nudged
 * consent is not consent (§4 R10). The radio role is what makes the selection
 * audible to a screen reader — without it a patient using TalkBack cannot tell
 * which answer they gave.
 */
export function Choice(
  { t, label, spoken, selected, onPress }:
  { t: Theme; label: string; spoken?: string; selected: boolean; onPress: Press },
) {
  return (
    <Pressable
      accessibilityRole="radio"
      // A consent answer must be unambiguous when heard as well as when read.
      // «أوافق» alone is short enough not to wrap on a 320pt phone, but spoken
      // without its subject it is a patient agreeing to something a screen
      // reader never named.
      accessibilityLabel={spoken ?? label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        flex: 1, minHeight: t.tap.patientPrimary,
        alignItems: "center", justifyContent: "center",
        paddingHorizontal: t.space[3],
        borderRadius: t.radius.lg,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? t.color.accent : t.color.line,
        backgroundColor: selected ? t.color.surfaceSunken : t.color.surface,
      }}
    >
      <Label t={t} role="body" color={selected ? "accent" : "ink"}>{label}</Label>
    </Pressable>
  );
}

/**
 * A full-bleed strip beneath the header — the delivery's cached/offline banner.
 *
 * Full-bleed rather than a card because it is a statement about the WHOLE
 * screen, not about one piece of content on it: everything below is from the
 * device, not from a pharmacy.
 */
export function Banner(
  { t, says, aside }: { t: Theme; says: string; aside?: string },
) {
  return (
    <View style={{
      backgroundColor: t.color.surfaceSunken,
      paddingVertical: t.space[2], paddingHorizontal: t.frame.gutter,
    }}>
      <Row t={t} gap={3} justify="space-between">
        <Label t={t} role="caption" color="inkMuted">{says}</Label>
        {aside ? <Label t={t} role="caption" color="inkMuted">{aside}</Label> : null}
      </Row>
    </View>
  );
}

/**
 * The reservation code, on a light panel.
 *
 * The one surface in the patient app that inverts. It reads as something
 * printed and handed over rather than as another dark card, which is the whole
 * point: at a counter the patient is showing a ticket, not operating an app.
 */
export function CodePanel(
  { t, code, caption, hint }: { t: Theme; code: string; caption: string; hint?: string },
) {
  return (
    <View
      accessibilityLabel={`${caption}: ${code}`}
      style={{
        backgroundColor: t.codePanel.surface,
        borderRadius: t.radius.xl,
        paddingVertical: t.space[7], paddingHorizontal: t.space[5],
        alignItems: "center", gap: t.space[3],
      }}
    >
      <Text style={{
        fontFamily: t.fontFamily, fontSize: t.type.caption.size,
        lineHeight: Math.round(t.type.caption.size * t.type.caption.lineHeight),
        color: t.codePanel.inkMuted, textAlign: "center", writingDirection: t.direction,
      }}>{caption}</Text>

      <Text style={{
        fontFamily: t.tabularFamily,
        fontSize: t.type.code.size,
        lineHeight: Math.round(t.type.code.size * t.type.code.lineHeight),
        fontWeight: String(t.type.code.weight) as "600",
        color: t.codePanel.ink,
        letterSpacing: 0,
        // The code is read left-to-right whichever script it is in, because it
        // is a token rather than prose.
        writingDirection: "ltr",
      }}>{code}</Text>

      {hint ? (
        <Text style={{
          fontFamily: t.fontFamily, fontSize: t.type.caption.size,
          lineHeight: Math.round(t.type.caption.size * t.type.caption.lineHeight),
          color: t.codePanel.inkMuted, textAlign: "center", writingDirection: t.direction,
        }}>{hint}</Text>
      ) : null}
    </View>
  );
}

/**
 * A labelled fact — muted label on one edge, the value on the other, with a
 * divider between rows. The delivery uses it for everything V2 states about the
 * hold, so the eye scans one column of labels rather than parsing sentences.
 */
export function FactRow(
  { t, label, value, first = false }: { t: Theme; label: string; value: React.ReactNode; first?: boolean },
) {
  return (
    <>
      {first ? null : <View style={{ height: 1, backgroundColor: t.color.line, marginVertical: t.space[3] }} />}
      <Row t={t} gap={3} align="baseline">
        <Label t={t} role="body" color="inkSubtle">{label}</Label>
        <Spacer />
        {typeof value === "string" ? <Label t={t} role="body">{value}</Label> : value}
      </Row>
    </>
  );
}

/**
 * One option in a set where the options are worded, not numbered — D09's three
 * urgency windows.
 *
 * A wider `Choice`: same radio semantics and the same refusal to make one
 * option heavier than another, but full-width and headline-sized because these
 * options are sentences rather than two-word answers.
 */
export function Chip(
  { t, label, spoken, selected, onPress, children }:
  { t: Theme; label: string; spoken: string; selected: boolean; onPress: Press; children?: React.ReactNode },
) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={spoken}
      onPress={onPress}
      style={{
        minHeight: t.tap.patientPrimary, justifyContent: "center",
        paddingHorizontal: t.space[4], borderRadius: t.radius.lg,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? t.color.accent : t.color.line,
        backgroundColor: selected ? t.color.surfaceRaised : t.color.surface,
      }}
    >
      <Label t={t} role="headline" color={selected ? "accent" : "ink"}>{label}</Label>
      {children}
    </Pressable>
  );
}

/**
 * One step of a quantity, up or down.
 *
 * 44pt square — the floor, not a decoration: this is pressed repeatedly, often
 * with a thumb, often by someone in a hurry. The spoken label names the
 * medicine, because "زيادة" alone is meaningless when three rows offer it.
 */
export function StepButton(
  { t, direction, spoken, onPress }:
  { t: Theme; direction: "up" | "down"; spoken: string; onPress: Press },
) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={spoken}
      onPress={onPress}
      style={{
        width: t.tap.min, height: t.tap.min, alignItems: "center", justifyContent: "center",
        borderRadius: t.radius.md, backgroundColor: t.color.surface,
        borderWidth: 1, borderColor: t.color.line,
      }}
    >
      <Label t={t} role="title" color="accent">{direction === "up" ? "+" : "\u2212"}</Label>
    </Pressable>
  );
}

/**
 * A window of time, drawn as a ring with the remaining figure inside it.
 *
 * The delivery draws this with a conic gradient, which React Native has no
 * expression for. Two half-discs, each clipped to its own half and rotated
 * about the ring's centre line, produce the same arc from primitives the
 * platform actually has — no new dependency, and it renders identically in the
 * review and on a device.
 *
 * A ring rather than a bar because nothing here is being COMPLETED. A bar reads
 * as work progressing; this is time passing while several pharmacies decide,
 * and the patient is not waiting for a task to finish.
 *
 * The fraction is on the accessible value as a percentage, so the arc is never
 * the only thing carrying it.
 */
export function Dial(
  { t, fraction, value, label }: { t: Theme; fraction: number; value: string; label: string },
) {
  const f = Math.min(1, Math.max(0, fraction));
  const SIZE = 64, RING = 7;
  const half = SIZE / 2;
  // Each half sweeps its own 180°. The leading half is fully swept once the
  // fraction passes the halfway mark, and the trailing half starts from zero.
  const sweep = (from: number) => Math.min(180, Math.max(0, (f - from) * 360));

  const Wedge = ({ deg, side }: { deg: number; side: "leading" | "trailing" }) => (
    <View style={{ width: half, height: SIZE, overflow: "hidden" }}>
      <View style={{
        width: half, height: SIZE, backgroundColor: t.color.accent,
        transform: [
          // Rotate about the ring's centre rather than the wedge's own, by
          // stepping to the centre line, turning, and stepping back.
          { translateX: side === "leading" ? half / 2 : -half / 2 },
          { rotate: `${side === "leading" ? deg : deg}deg` },
          { translateX: side === "leading" ? -half / 2 : half / 2 },
        ],
      }} />
    </View>
  );

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ now: Math.round(f * 100), min: 0, max: 100 }}
      style={{
        width: SIZE, height: SIZE, borderRadius: t.radius.pill,
        backgroundColor: t.color.line, overflow: "hidden",
        flexDirection: "row", alignItems: "center", justifyContent: "center",
      }}
    >
      <Wedge deg={sweep(0.5)} side="leading" />
      <Wedge deg={sweep(0)} side="trailing" />
      {/* The well, which turns the disc into a ring and holds the figure. */}
      <View style={{
        position: "absolute",
        width: SIZE - RING * 2, height: SIZE - RING * 2, borderRadius: t.radius.pill,
        backgroundColor: t.color.surfaceRaised,
        alignItems: "center", justifyContent: "center",
      }}>
        <Text style={{
          fontFamily: t.tabularFamily, fontSize: t.type.headline.size,
          fontWeight: "700", color: t.color.ink,
        }}>{formatDigits(value, "arabic-indic")}</Text>
      </View>
    </View>
  );
}

/**
 * How far along something is, as a bar rather than a spinner.
 *
 * A spinner says "working" and tells a patient nothing about how much longer.
 * The accessible value travels with the bar, so the shape is never the only
 * thing carrying the information — a screen reader reads a percentage.
 */
export function ProgressBar({ t, fraction, label }: { t: Theme; fraction: number; label: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ now: pct, min: 0, max: 100 }}
      style={{ height: t.space[2], borderRadius: t.radius.pill, backgroundColor: t.color.surfaceSunken, overflow: "hidden" }}
    >
      <View style={{ width: `${pct}%`, height: "100%", backgroundColor: t.color.accent }} />
    </View>
  );
}

/**
 * Where a captured photograph goes.
 *
 * Renders a labelled frame rather than a stand-in image, because the review
 * gallery must never show a picture the app has not actually taken. When the
 * camera lands (TD-9) the image replaces the frame and nothing else moves.
 */
export function PhotoFrame({ t, label }: { t: Theme; label: string }) {
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={label}
      style={{
        height: t.space[10] * 3, borderRadius: t.radius.lg,
        backgroundColor: t.color.surfaceSunken,
        borderWidth: 1, borderColor: t.color.line,
        alignItems: "center", justifyContent: "center",
      }}
    >
      <Label t={t} role="caption" color="inkSubtle">{label}</Label>
    </View>
  );
}

/**
 * The one text input in the patient app.
 *
 * A control, not a layout — which is why it lives here and not inside the
 * screen that happens to use it first. The 48pt minimum is the patient primary
 * height: this is the control a frightened person types a drug name into.
 */
export function SearchField(
  { t, label, placeholder, value, onType }:
  { t: Theme; label: string; placeholder: string; value: string; onType: (s: string) => void },
) {
  return (
    <Row t={t} gap={3}>
      <View style={{
        flexDirection: "row", alignItems: "center", gap: t.space[3],
        paddingHorizontal: t.frame.gutter, flex: 1,
        borderRadius: t.radius.lg, borderWidth: 1, borderColor: t.color.line,
        backgroundColor: t.color.surfaceRaised,
      }}>
        <Label t={t} role="body" color="inkSubtle">⌕</Label>
        <TextInput
          accessibilityLabel={label}
          placeholder={placeholder}
          placeholderTextColor={t.color.inkSubtle}
          defaultValue={value}
          onChangeText={onType}
          style={{
            flex: 1, minHeight: t.tap.patientPrimary,
            fontFamily: t.fontFamily, fontSize: t.type.body.size, color: t.color.ink,
            textAlign: "right", writingDirection: t.direction,
          }}
        />
      </View>
    </Row>
  );
}

/* ── States ───────────────────────────────────────────────────────────── */

/**
 * The declared treatment, rendered. Every branch here corresponds to a state
 * the Blueprint declares for the screen; ux-check fails the build if a screen
 * declares a state with no treatment, so this switch cannot fall through to a
 * generic message.
 */
export function StateBlock(
  { t, treatment, onAction, ageMs, actionInFooter = false }:
  { t: Theme; treatment: StateTreatment; onAction: (to: string) => void; ageMs?: number | null; actionInFooter?: boolean },
) {
  // An empty or loading state that sits at the top of a tall blank screen
  // reads as broken. These states ARE the screen while they last, so they fill
  // it and centre — which is also what makes the message legible at arm's
  // length in bright sunlight.
  const fill = { flex: 1, justifyContent: "center" as const, alignItems: "stretch" as const };
  const pad = { padding: t.space[6], gap: t.space[4] };
  switch (treatment.kind) {
    case "loading":
      // A spinner that matches the shape of what is coming, so the page does
      // not jump when it arrives.
      return (
        <View accessibilityRole="progressbar" style={{ ...pad, ...fill, gap: t.space[3] }}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={{ height: t.space[9], borderRadius: t.radius.md, backgroundColor: t.color.surfaceSunken }} />
          ))}
        </View>
      );

    case "empty":
      // A SUCCESS empty is not an interruption of the content — it IS the
      // content: "we asked and nobody has answered yet" is what the screen is
      // about, not a failure to load it. Rendering it here as well as in place
      // printed it twice on R7, once filling the screen and once inside the
      // card below. The screen owns it, in the position the delivery gives it,
      // and the render-tree test requires the declared words to appear.
      if (treatment.isSuccess) return null;
      return (
        <View style={{ ...pad, ...fill }}>
          <Label t={t} role="title" color={treatment.isSuccess ? "inkMuted" : "ink"}>{treatment.explains}</Label>
          {/* The action lives in the footer when there is one: the bottom of
              the screen is where a thumb rests, and the top is where it does
              not reach on a phone held one-handed. */}
          {treatment.action && !actionInFooter
            ? <Primary t={t} label={treatment.action.label} onPress={() => onAction(treatment.action!.leadsTo)} />
            : null}
        </View>
      );

    case "error":
      return (
        <View style={pad}>
          {/* §23 — what failed, whether the work survived, one thing to press. */}
          <Label t={t} role="headline" color="alert">{treatment.whatFailed}</Label>
          {treatment.workPreserved ? <Label t={t} role="caption" color="inkMuted">ما ضاع اللي كتبته</Label> : null}
          {actionInFooter ? null : <Primary t={t} label={treatment.action.label} onPress={() => onAction(treatment.action.leadsTo)} />}
        </View>
      );

    case "offline":
      // Rendered by `Screen` as a full-bleed banner, never inline. See
      // `OfflineBanner` — this branch exists so the switch stays total.
      return <OfflineBanner t={t} treatment={treatment} ageMs={ageMs} />;

    case "permissionRefused":
      // Never a wall: the refusal names the other way through.
      return (
        <View style={{ ...pad, ...fill }}>
          <Label t={t} role="headline">{treatment.alternative}</Label>
        </View>
      );

    case "success":
      return (
        <View style={pad}>
          {treatment.nextStep ? <Primary t={t} label={treatment.nextStep.label} onPress={() => onAction(treatment.nextStep!.leadsTo)} /> : null}
        </View>
      );
  }
}

/**
 * "ما في اتصال" is a statement about the whole screen, so it is said once, at
 * the top edge, and never as a card inside the content.
 *
 * The first V2 render said it twice — a flush banner under the header and an
 * inline card repeating the same sentence and the same age two lines below.
 * Moving the treatment into the frame means no screen can reintroduce the
 * duplicate by supplying its own banner beside the declared one.
 */
function OfflineBanner(
  { t, treatment, ageMs }: { t: Theme; treatment: Extract<StateTreatment, { kind: "offline" }>; ageMs: number | null | undefined },
) {
  return (
    <Banner
      t={t}
      // Read-only cached content and queued work are different promises, and
      // §26 forbids wording the second as if it had been sent.
      says={treatment.readOnly ? "من الذاكرة — ما في اتصال" : "ما في اتصال — راح نرسله أول ما يرجع"}
      {...(treatment.showsAge && typeof ageMs === "number"
        ? { aside: `آخر تحديث قبل ${Math.max(1, Math.round(ageMs / 60_000))} دقائق` }
        : {})}
    />
  );
}

/* ── The frame every screen sits in ───────────────────────────────────── */

/**
 * Header, back, progress and body. A screen cannot render without them,
 * because a screen renders through this.
 */
export function Screen(
  { t, view, onBack, onAction, children, footer, sticky, flush }:
  { t: Theme; view: ScreenView; onBack: Press; onAction: (to: string) => void; children?: React.ReactNode; footer?: React.ReactNode; sticky?: React.ReactNode; flush?: React.ReactNode },
) {
  const canGoBack = view.back.kind === "pop" || view.back.kind === "replace";

  // A state's one action belongs where the thumb is. When the screen supplies
  // its own footer that footer wins — the screen's primary action is more
  // important than a state's recovery action, and two stacked primaries would
  // be exactly the competing hierarchy this kit exists to prevent.
  const stateAction =
    view.treatment && (view.treatment.kind === "empty" || view.treatment.kind === "error")
      ? view.treatment.action
      : null;
  // A screen that supplies `undefined` is saying "I have no footer"; one that
  // supplies a node is claiming the slot. `null` used to read as a claim and
  // silently suppressed the state's own action, stranding it mid-screen.
  const footerContent = footer !== undefined && footer !== null
    ? footer
    : stateAction
      ? <Primary t={t} label={stateAction.label} onPress={() => onAction(stateAction.leadsTo)} />
      : null;
  return (
    <View style={{ flex: 1, backgroundColor: t.color.surface, direction: t.direction }}>
      <View style={{
        paddingHorizontal: t.frame.gutter, paddingTop: t.frame.safeTop, paddingBottom: t.space[3],
        borderBottomWidth: 1, borderBottomColor: t.color.line,
        flexDirection: "row", alignItems: "center", gap: t.space[3],
      }}>
        {canGoBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="رجوع"
            onPress={onBack}
            style={{ width: t.tap.min, height: t.tap.min, alignItems: "center", justifyContent: "center" }}
          >
            {/* A chevron, not an arrow: the platform's own back affordance.
                It is not mirrored here because `direction` already runs the
                header right-to-left — mirroring it again would point it back
                into the content, which is how the first render got it wrong. */}
            <Label t={t} role="title" color="accent">‹</Label>
          </Pressable>
        ) : null}
        <View style={{ flex: 1 }}>
          <Label t={t} role="title" numberOfLines={1}>{view.title}</Label>
          {view.progress ? (
            <Label t={t} role="caption" color="inkMuted">
              {/* «الخطوة ٤ من ٦», not «٤/٦». A middle dot beside Arabic-Indic
                  digits is read as one of them — «تنتظر الردود · ٤/٦» rendered
                  as «٤/٦٠», a step count that does not exist. Words carry the
                  relation instead of punctuation. */}
              {`${view.progress.label} — الخطوة ${formatDigits(view.progress.step, "arabic-indic")} من ${formatDigits(view.progress.of, "arabic-indic")}`}
            </Label>
          ) : null}
        </View>
      </View>

      {/* Pinned beneath the header: an input the screen is ABOUT belongs where
          the user looks first and must not be pushed down by a state that
          fills the rest of the screen. */}
      {/* `flush` sits hard against the header with no gutter. The offline
          treatment claims this slot itself, so a screen never draws it. */}
      {view.treatment?.kind === "offline"
        ? <OfflineBanner t={t} treatment={view.treatment} ageMs={view.phase.kind === "offline" ? view.phase.ageMs : null} />
        : flush ?? null}

      {sticky ? (
        <View style={{ paddingHorizontal: t.frame.gutter, paddingTop: t.space[4], backgroundColor: t.color.surface }}>
          {sticky}
        </View>
      ) : null}

      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: t.frame.gutter, gap: t.space[4], paddingBottom: t.frame.safeBottom }}>
        {view.treatment && view.treatment.kind !== "offline"
          ? <StateBlock
              t={t} treatment={view.treatment} onAction={onAction}
              ageMs={view.phase.kind === "offline" ? view.phase.ageMs : null}
              actionInFooter={stateAction !== null && footer === undefined}
            />
          : null}
        {children}
      </ScrollView>

      {footerContent ? (
        <View style={{
          padding: t.frame.gutter, paddingBottom: t.frame.safeBottom,
          borderTopWidth: 1, borderTopColor: t.color.line,
          gap: t.space[2], backgroundColor: t.color.surfaceRaised,
        }}>
          {footerContent}
        </View>
      ) : null}
    </View>
  );
}

/** A guard sent the user here. It says why, so the screen does not appear for
 *  no reason — the version of this without the sentence is the one that makes
 *  people think the app is broken. */
export const RedirectNote = ({ t, because }: { t: Theme; because: string | null }) =>
  because ? (
    <Note t={t}><Label t={t} role="body" color="inkMuted">{because}</Label></Note>
  ) : null;
