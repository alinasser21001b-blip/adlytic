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
      {children}
    </Text>
  );
}

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

/** Never competes with the primary: no fill, no accent background. */
export function Secondary({ t, label, onPress }: { t: Theme; label: string; onPress: Press }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{ minHeight: t.tap.min, justifyContent: "center", paddingHorizontal: t.space[3] }}
    >
      <Label t={t} role="body" color="accent">{label}</Label>
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
export function StateBlock({ t, treatment, onAction, ageMs }: { t: Theme; treatment: StateTreatment; onAction: (to: string) => void; ageMs?: number | null }) {
  const pad = { padding: t.space[6], gap: t.space[4] };
  switch (treatment.kind) {
    case "loading":
      // A spinner that matches the shape of what is coming, so the page does
      // not jump when it arrives.
      return (
        <View accessibilityRole="progressbar" style={{ ...pad, gap: t.space[3] }}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={{ height: t.space[9], borderRadius: t.radius.md, backgroundColor: t.color.surfaceSunken }} />
          ))}
        </View>
      );

    case "empty":
      return (
        <View style={pad}>
          <Label t={t} role="headline" color={treatment.isSuccess ? "inkMuted" : "ink"}>{treatment.explains}</Label>
          {treatment.action ? <Primary t={t} label={treatment.action.label} onPress={() => onAction(treatment.action!.leadsTo)} /> : null}
        </View>
      );

    case "error":
      return (
        <View style={pad}>
          {/* §23 — what failed, whether the work survived, one thing to press. */}
          <Label t={t} role="headline" color="alert">{treatment.whatFailed}</Label>
          {treatment.workPreserved ? <Label t={t} role="caption" color="inkMuted">ما ضاع اللي كتبته</Label> : null}
          <Primary t={t} label={treatment.action.label} onPress={() => onAction(treatment.action.leadsTo)} />
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
        <View style={pad}>
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
  { t, view, onBack, onAction, children, footer }:
  { t: Theme; view: ScreenView; onBack: Press; onAction: (to: string) => void; children?: React.ReactNode; footer?: React.ReactNode },
) {
  const canGoBack = view.back.kind === "pop" || view.back.kind === "replace";
  return (
    <View style={{ flex: 1, backgroundColor: t.color.surface, direction: t.direction }}>
      <View style={{
        paddingHorizontal: t.space[4], paddingTop: t.space[6], paddingBottom: t.space[3],
        borderBottomWidth: 1, borderBottomColor: t.color.line,
        flexDirection: "row-reverse", alignItems: "center", gap: t.space[3],
      }}>
        {canGoBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="رجوع"
            onPress={onBack}
            style={{ width: t.tap.min, height: t.tap.min, alignItems: "center", justifyContent: "center" }}
          >
            {/* Points the way the user reads — RTL, so the arrow faces right. */}
            <Label t={t} role="title" color="accent">→</Label>
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

      <ScrollView contentContainerStyle={{ padding: t.space[4], gap: t.space[4], paddingBottom: t.space[10] }}>
        {view.treatment ? <StateBlock t={t} treatment={view.treatment} onAction={onAction} ageMs={view.phase.kind === "offline" ? view.phase.ageMs : null} /> : null}
        {children}
      </ScrollView>

      {footer ? (
        <View style={{ padding: t.space[4], borderTopWidth: 1, borderTopColor: t.color.line, gap: t.space[2], backgroundColor: t.color.surfaceRaised }}>
          {footer}
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
