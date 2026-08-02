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
import { View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import type { StateTreatment } from "@dawai/design";
import { formatDigits, isolate, needsIsolation } from "@dawai/design";
import type { ScreenView } from "../model/view.js";
import type { Theme } from "./theme.js";

export type Press = () => void;

/* ── Text ─────────────────────────────────────────────────────────────── */

export function Label(
  { t, role = "body", color = "ink", children, numberOfLines }:
  { t: Theme; role?: "display" | "title" | "headline" | "body" | "caption"; color?: "ink" | "inkMuted" | "inkSubtle" | "accent" | "alert" | "onAccent" | "warning"; children: React.ReactNode; numberOfLines?: number },
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
 * A reservation address arrived as «شارع ٦٢» while every price and countdown
 * beside it used Western digits — two systems in one glance, which §25 calls a
 * defect rather than a style. Server-supplied strings can carry either, so
 * asking every call site to remember is exactly the discipline this replaces.
 */
function normaliseNumerals(node: React.ReactNode): React.ReactNode {
  if (typeof node === "string") return formatDigits(toWestern(node), "western");
  if (Array.isArray(node)) return node.map((n, i) => <React.Fragment key={i}>{normaliseNumerals(n)}</React.Fragment>);
  return node;
}

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

/** Every quantity, price and countdown in the patient app, in one numeral
 *  system. Mixing two inside a comparison is a defect, not a style. */
export const Digits = ({ t, value, role = "body" }: { t: Theme; value: number | string; role?: "body" | "headline" | "title" | "display" }) => (
  <Text style={{ fontFamily: t.tabularFamily, fontSize: t.type[role].size, color: t.color.ink }}>
    {formatDigits(value, "western")}
  </Text>
);

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
  { t, label, onPress, children, muted = false }:
  { t: Theme; label: string; onPress: Press; children: React.ReactNode; muted?: boolean },
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
      <View style={{
        width: t.space[7], height: t.space[7], borderRadius: t.radius.pill,
        alignItems: "center", justifyContent: "center", backgroundColor: t.color.accent,
      }}>
        <Label t={t} role="headline" color="onAccent">+</Label>
      </View>
    </Pressable>
  );
}

/** A card that is not an action — a refused item, a summary line. It reads as
 *  information rather than offering a tap that would be rejected. */
export const InfoCard = ({ t, children, muted = false }: { t: Theme; children: React.ReactNode; muted?: boolean }) => (
  <View style={{
    padding: t.space[4], gap: t.space[2], borderRadius: t.radius.lg,
    backgroundColor: muted ? t.color.surfaceSunken : t.color.surfaceRaised,
    borderWidth: 1, borderColor: t.color.line,
  }}>
    {children}
  </View>
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
  { t, label, selected, onPress }:
  { t: Theme; label: string; selected: boolean; onPress: Press },
) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
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
      return (
        <View style={{ ...pad, backgroundColor: t.color.surfaceSunken, borderRadius: t.radius.md }}>
          <Label t={t} role="body" color="inkMuted">
            {treatment.readOnly ? "ما في اتصال — هذا آخر شي وصلنا" : "ما في اتصال — راح نرسله أول ما يرجع"}
          </Label>
          {treatment.showsAge && typeof ageMs === "number"
            ? <Label t={t} role="caption" color="inkSubtle">{`آخر تحديث قبل ${Math.max(1, Math.round(ageMs / 60_000))} دقيقة`}</Label>
            : null}
        </View>
      );

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

/* ── The frame every screen sits in ───────────────────────────────────── */

/**
 * Header, back, progress and body. A screen cannot render without them,
 * because a screen renders through this.
 */
export function Screen(
  { t, view, onBack, onAction, children, footer, sticky }:
  { t: Theme; view: ScreenView; onBack: Press; onAction: (to: string) => void; children?: React.ReactNode; footer?: React.ReactNode; sticky?: React.ReactNode },
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
        paddingHorizontal: t.space[4], paddingTop: t.space[6], paddingBottom: t.space[3],
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
              {`${view.progress.label} · ${formatDigits(view.progress.step, "western")}/${formatDigits(view.progress.of, "western")}`}
            </Label>
          ) : null}
        </View>
      </View>

      {/* Pinned beneath the header: an input the screen is ABOUT belongs where
          the user looks first and must not be pushed down by a state that
          fills the rest of the screen. */}
      {sticky ? (
        <View style={{ paddingHorizontal: t.space[4], paddingTop: t.space[4], backgroundColor: t.color.surface }}>
          {sticky}
        </View>
      ) : null}

      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: t.space[4], gap: t.space[4], paddingBottom: t.space[6] }}>
        {view.treatment
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
          padding: t.space[4], paddingBottom: t.space[6],
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
    <View style={{ padding: t.space[4], borderRadius: t.radius.md, backgroundColor: t.color.surfaceSunken }}>
      <Label t={t} role="body" color="inkMuted">{because}</Label>
    </View>
  ) : null;
