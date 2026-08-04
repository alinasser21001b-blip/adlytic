/**
 * E5, E6, E7, E8 — one journey, four screens.
 *
 * @blueprint E5 · E6 · E7 · E8 · D26 · §3.1 · §9 Identity
 * @owner patient-app
 * @why These are kept together because they are one conversation, and reading
 *      them apart is how the joins get lost. The number typed on E5 is the
 *      number E6 shows back. The promise E4 made — that a pharmacy sees only a
 *      first name — is the promise E7 has to keep visibly. The district chosen
 *      on E8 is the one the patient's own request will search from, which is
 *      why the journey ends by returning them to that request rather than to a
 *      generic home (D26).
 *
 *      The rule running through all four: this is the only place in the product
 *      where we ask a stranger for something before we have given them
 *      anything, so every step is a place they can reasonably decide we are not
 *      worth it. Nothing here asks for more than the Blueprint names, and every
 *      failure says what to do next rather than what went wrong.
 */

import * as Onboarding from "../model/onboarding.js";
import { counted, plural } from "@dawai/design";

const SECONDS = { one: "ثانية", two: "ثانيتين", few: "ثواني", many: "ثانية" } as const;
import { type Phase } from "../model/view.js";
import {
  Screen, Label, Primary, Secondary, Row, Section, Card, Note, InputField, ActionCard, Tag, Spacer,
} from "../ui/kit.js";
import { Shake } from "../ui/motion.jsx";
import type { Theme } from "../ui/theme.js";
import { viewOf } from "./graph.js";


/* ── E5 · the number ──────────────────────────────────────────────────── */

export type PhoneEntryProps = {
  readonly t: Theme;
  readonly typed: string;
  readonly history: readonly string[];
  /** Advisory only, but a verification genuinely cannot be queued — the SMS
   *  has to leave now or not at all. */
  readonly online: boolean;
  readonly onType: (raw: string) => void;
  readonly onSubmit: () => void;
  readonly onBack: () => void;
  readonly onAction: (to: string) => void;
};

export function PhoneEntryScreen(p: PhoneEntryProps) {
  const { t } = p;
  const parsed = Onboarding.parsePhone(p.typed);
  // Nothing is wrong until they have typed enough for it to be wrong. Marking
  // a field red on the first keystroke is the app arguing with someone
  // mid-sentence.
  const showError = p.typed.length >= 7 && parsed.refusal !== null;
  const phase: Phase = !p.online ? { kind: "offline", ageMs: null }
    : showError ? { kind: "error" }
    : { kind: "ready" };
  const view = viewOf("E5", phase, p.history);

  const wrongCountry = parsed.refusal?.code === "UNSUPPORTED_COUNTRY";

  return (
    <Screen
      t={t} view={view} onBack={p.onBack} onAction={p.onAction}
      footer={
        <Primary
          t={t}
          label={view.primary?.label ?? "أرسل الرمز"}
          disabled={parsed.value === null || !p.online}
          onPress={p.onSubmit}
        />
      }
    >
      <Section t={t}>
        <Label t={t} role="title">شنو رقم موبايلك؟</Label>
        <Label t={t} role="body" color="inkMuted">
          نرسللك رمز بالرسائل حتى نتأكد إنه رقمك. مرة وحدة بس.
        </Label>
      </Section>

      <Shake active={showError}>
        <InputField
          t={t}
          label="رقم الموبايل"
        prefix={Onboarding.COUNTRY_CODE}
        placeholder="770 123 4567"
        tone="code"
        value={p.typed}
        onType={p.onType}
        invalid={showError}
        {...(showError
          ? {
              // Two different sentences, deliberately. A number we cannot serve
              // is our limit; a number typed short is a typo. Telling someone
              // their perfectly correct number is invalid is the app blaming
              // them for our coverage.
              hint: wrongCountry
                ? "لهسه ما وصلنا لهذا البلد — دواي يشتغل بالعراق بس"
                : "الرقم يبدي بـ ٧٧ أو ٧٨ أو ٧٩ أو ٧٥ ويكون ١٠ أرقام",
            }
            : {})}
        />
      </Shake>

      {!p.online ? (
        <Note t={t} tone="caution">
          <Label t={t} role="body" color="warning">
            ما نكدر نرسل الرمز بدون نت — الرسالة تنرسل هسه أو ما تنرسل.
          </Label>
          <Label t={t} role="caption" color="inkMuted">
            طلبك محفوظ. أول ما يرجع الاتصال كمّل من نفس المكان.
          </Label>
        </Note>
      ) : null}
    </Screen>
  );
}

/* ── E6 · the code ────────────────────────────────────────────────────── */

export type CodeEntryProps = {
  readonly t: Theme;
  readonly phone: string;
  readonly typed: string;
  readonly status: Onboarding.CodeStatus;
  readonly checking: boolean;
  /** The last refusal the SERVER gave. The client never decides this. */
  readonly refusalCode: string | null;
  readonly history: readonly string[];
  readonly online: boolean;
  readonly onType: (raw: string) => void;
  readonly onSubmit: () => void;
  readonly onResend: () => void;
  readonly onBack: () => void;
  readonly onAction: (to: string) => void;
};

export function CodeEntryScreen(p: CodeEntryProps) {
  const { t, status } = p;
  const dead = status.spent || status.expired;
  // Only a wrong code is the declared error, because the contract carries ONE
  // «what failed» sentence and «الرمز مو صحيح» is true of exactly one of the
  // four failures. An exhausted or expired code is not a wrong answer, and
  // labelling it as one would tell a patient they mistyped when they did not.
  const phase: Phase = !p.online ? { kind: "offline", ageMs: null }
    : p.checking ? { kind: "loading" }
    : p.refusalCode === "WRONG_CODE" && !dead ? { kind: "error" }
    : { kind: "ready" };
  const view = viewOf("E6", phase, p.history);

  return (
    <Screen
      t={t} view={view} onBack={p.onBack} onAction={p.onAction}
      footer={(
        <>
          <Primary
            t={t}
            label={view.primary?.label ?? "تأكيد"}
            disabled={!Onboarding.codeComplete(p.typed) || dead || !p.online}
            busy={p.checking}
            onPress={p.onSubmit}
          />
          <Row t={t} justify="center">
            <Secondary t={t} label="غيّر الرقم" onPress={p.onBack} />
          </Row>
        </>
      )}
    >
      <Section t={t}>
        <Label t={t} role="title">اكتب الرمز</Label>
        {/* The number, shown back. A code screen that does not repeat the
            number it was sent to leaves a patient who mistyped one digit with
            no way to discover it except by failing five times. */}
        <Label t={t} role="body" color="inkMuted">
          {`أرسلنا رمز من ٦ أرقام إلى ${p.phone}`}
        </Label>
      </Section>

      {/* §27 rule 5 — the shake is on the FIELD, so it says "that input, not
          another". A screen-level shake tells a patient something is wrong and
          leaves them to find out what. */}
      <Shake active={p.refusalCode === "WRONG_CODE"}>
        <InputField
          t={t}
          label="الرمز"
          placeholder="——————"
          tone="code"
          value={p.typed}
          onType={p.onType}
          invalid={p.refusalCode !== null}
        />
      </Shake>

      {/* Every declared failure gets its own recovery, because they are not
          variations of one error: a wrong code means try again, an exhausted
          one means start over, an expired one means ask for another. */}
      {/* WHAT failed is the frame's declared treatment, said once. What is LEFT
          is the screen's, because the contract carries a fixed sentence and an
          attempt count is not fixed — and a patient who does not know how many
          tries remain will guess, which is how the tries get spent. */}
      {p.refusalCode === "WRONG_CODE" && !dead ? (
        <Label t={t} role="caption" color="warning">
          {/* Four forms, not two. «باقيلك ٢ محاولات» is what a patient on
              their third try was told, where Arabic wants the dual. */}
          {plural(status.attemptsLeft, {
            one: "باقيتلك محاولة وحدة قبل ما نطلب رمز جديد",
            two: "باقيتلك محاولتين",
            few: `باقيلك ${status.attemptsLeft} محاولات`,
            many: `باقيلك ${status.attemptsLeft} محاولة`,
          })}
        </Label>
      ) : null}

      {status.spent ? (
        <Note t={t} tone="alert">
          <Label t={t} role="body" color="alert">خلصت المحاولات على هذا الرمز</Label>
          {/* Never a dead end, and never a lecture. */}
          <Label t={t} role="caption" color="inkMuted">ما صار شي — نرسللك رمز جديد.</Label>
        </Note>
      ) : null}

      {status.expired && !status.spent ? (
        <Note t={t} tone="caution">
          <Label t={t} role="body" color="warning">انتهت صلاحية الرمز</Label>
          <Label t={t} role="caption" color="inkMuted">الرموز تنتهي بعد ١٠ دقائق — اطلب واحد جديد.</Label>
        </Note>
      ) : null}

      {/* "SMS never arrived" is a declared failure and the only one the patient
          cannot act on by typing. The wait is stated rather than merely
          enforced: a resend that silently does nothing reads as a broken app. */}
      <Card t={t} surface="sunken" border="none" gap={2}>
        <Label t={t} role="body" color="inkMuted">ما وصلتك الرسالة؟</Label>
        {status.canResendIn > 0 && !dead ? (
          <Label t={t} role="caption" color="inkSubtle">
            {/* Counts 45 down to 0, so it passes through every category on
                the way: «٤٥ ثانية», «٥ ثواني», «ثانيتين», «ثانية». */}
            {`تكدر تطلب رمز جديد بعد ${counted(status.canResendIn, SECONDS)}`}
          </Label>
        ) : (
          <Row t={t}>
            <Secondary t={t} label="أرسل رمز جديد" onPress={p.onResend} />
          </Row>
        )}
      </Card>
    </Screen>
  );
}

/* ── E7 · the name ────────────────────────────────────────────────────── */

export type NameProps = {
  readonly t: Theme;
  readonly typed: string;
  readonly history: readonly string[];
  readonly onType: (raw: string) => void;
  readonly onSubmit: () => void;
  readonly onBack: () => void;
  readonly onAction: (to: string) => void;
};

export function NameScreen(p: NameProps) {
  const { t } = p;
  const checked = Onboarding.checkName(p.typed);
  const view = viewOf("E7", { kind: "ready" }, p.history);
  const shown = Onboarding.firstNameOnly(p.typed);

  return (
    <Screen
      t={t} view={view} onBack={p.onBack} onAction={p.onAction}
      footer={
        <Primary
          t={t}
          label={view.primary?.label ?? "كمّل"}
          disabled={checked.value === null}
          onPress={p.onSubmit}
        />
      }
    >
      <Section t={t}>
        <Label t={t} role="title">شنو نناديك؟</Label>
        {/* Why, before what. "Minimum identity for a pickup counter" is the
            Blueprint's phrase and it is also the honest reason: the name exists
            so a pharmacist can hand a bag to the right person. */}
        <Label t={t} role="body" color="inkMuted">
          الصيدلي يحتاج اسم يناديه بيه لمن توصل تستلم طلبك.
        </Label>
      </Section>

      <InputField t={t} label="الاسم" placeholder="أم علي" value={p.typed} onType={p.onType} />

      {/* E4 promised that a pharmacy sees only the first name. A promise made on
          one screen and kept by another is a promise nobody can check — so the
          patient is SHOWN what will be shared, before they submit it. */}
      {shown ? (
        <Card t={t} surface="sunken" border="none" gap={2}>
          <Label t={t} role="caption" color="inkSubtle">اللي تشوفه الصيدلية</Label>
          <Row t={t} align="baseline">
            <Label t={t} role="headline">{shown}</Label>
            <Spacer />
            <Tag t={t}><Label t={t} role="caption" color="inkMuted">الاسم الأول بس</Label></Tag>
          </Row>
        </Card>
      ) : null}
    </Screen>
  );
}

/* ── E8 · the district ────────────────────────────────────────────────── */

export type DistrictProps = {
  readonly t: Theme;
  /** E8's answer is in flight. Shown on the control, not as a screen-wide
   *  spinner — the same treatment E6 gives its one round trip. */
  readonly busy: boolean;
  readonly districts: readonly Onboarding.District[];
  readonly query: string;
  readonly chosen: string | null;
  readonly history: readonly string[];
  readonly onSearch: (raw: string) => void;
  readonly onChoose: (districtId: string) => void;
  readonly onSubmit: () => void;
  readonly onBack: () => void;
  readonly onAction: (to: string) => void;
};

export function DistrictScreen(p: DistrictProps) {
  const { t } = p;
  const view = viewOf("E8", { kind: "ready" }, p.history);
  const shown = Onboarding.filterDistricts(p.districts, p.query);
  const picked = p.districts.find((d) => d.districtId === p.chosen) ?? null;

  return (
    <Screen
      t={t} view={view} onBack={p.onBack} onAction={p.onAction}
      footer={
        <Primary
          t={t}
          label={view.primary?.label ?? "خلص"}
          disabled={picked === null || !picked.covered}
          busy={p.busy}
          onPress={p.onSubmit}
        />
      }
    >
      <Section t={t}>
        <Label t={t} role="title">من وين تدور؟</Label>
        {/* Never a wall. The list is the route, not the consolation prize for
            refusing a permission — which is also why this screen never asks
            for one. */}
        <Label t={t} role="body" color="inkMuted">
          اختر منطقتك حتى نعرض عليك أقرب الصيدليات. ما نحتاج موقعك.
        </Label>
      </Section>

      <InputField t={t} label="دوّر على منطقتك" placeholder="الكرادة" value={p.query} onType={p.onSearch} />

      {shown.map((d) => (
        <ActionCard
          key={d.districtId}
          t={t}
          affordance="none"
          muted={!d.covered}
          label={`اختر ${d.name}`}
          onPress={() => p.onChoose(d.districtId)}
        >
          <Row t={t} align="baseline">
            <Label t={t} role="headline" color={d.districtId === p.chosen ? "accent" : "ink"}>{d.name}</Label>
            <Spacer />
            <Label t={t} role="caption" color="inkSubtle">{d.city}</Label>
          </Row>
          {/* E12's sentence, said on the row rather than after the tap: we have
              not arrived there yet, which is our failing and not theirs. */}
          {!d.covered ? (
            <Label t={t} role="caption" color="warning">لهسه ما وصلنا لهذي المنطقة</Label>
          ) : null}
        </ActionCard>
      ))}

      {shown.length === 0 ? (
        <Note t={t}>
          <Label t={t} role="body" color="inkMuted">ما لقينا منطقة بهذا الاسم</Label>
        </Note>
      ) : null}
    </Screen>
  );
}
