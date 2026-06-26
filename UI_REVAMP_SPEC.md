# UI Revamp — Localization, Shortcut Removal & RTL Polish

> Strictly presentational / DOM / localization pass. **No** change to CMO Feed V2
> data bindings (`cmoFeedV2`/`cmoFeedMeta`), dedupe/window logic, `escHtml()`
> hardening, backend sync, or Meta integration. As before: this is the spec;
> Corsair executes; I review diffs against §5 invariants.
>
> All line numbers are current as of inspection of
> `src/web/pages/dashboardPage.ts` and `src/web/layout.ts`.

---

## 1. Terminology Purge (Localization)

### 1.1 Confirmed awkward strings (exact locations)

| # | File:line | Current Arabic | Problem | Proposed |
|---|---|---|---|---|
| T1 | `dashboardPage.ts:371` | `صندوق نصائح العقل الـ AI` | literal "AI Mind Box"; "العقل الـ AI" is unnatural | `التوصيات الذكية` |
| T2 | `dashboardPage.ts:706` | `… — رصد تلقائي للطبقة السابعة` | "the Seventh Layer" — meaningless to users; internal layer jargon leaked to UI | drop the layer phrase → `… — رصد تلقائي` (or `مراقبة آلية`) |
| T3 | `dashboardPage.ts:701` | `صعود` / `هبوط` | understandable but colloquial for metrics | `ارتفاع` / `انخفاض` |
| T4 | `dashboardPage.ts:711` | `الذكاء الاصطناعي يراقب حسابك · لم تُرصد تنبيهات نشطة` | acceptable; minor polish only | keep, optional: `يراقب الذكاء الاصطناعي حسابك · لا توجد تنبيهات نشطة` |
| T5 | `dashboardPage.ts:765` | `⚡ الأولوية القصوى` | acceptable | keep |

### 1.2 Ticker "layer" labels (cryptic, English — decide)

`buildTickerItems` emits `layer` codes rendered via `escHtml(it.layer)` (`:723`):
- `'BRAIN'` (`:681`), `'L' + (3+idx)` (`:692`), `'L7'` (`:704`), `'AI'` (`:711`).

These show as raw badges (`L3`, `L7`, `BRAIN`) in the marquee — internal layer
taxonomy leaking to users. **Spec:** map them to human labels at render time,
e.g. `BRAIN → الذكاء`, `L3..Ln → تنبيه`, `AI → النظام`. **Boundary:** this is a
**display relabel only** — `buildTickerItems` may change the literal `layer`
*string value*, but must NOT change which `dashData` fields it reads or the
`escHtml(it.layer)` call at `:723`. The relabel must remain escaped.

### 1.3 Constraints for the purge

- **CMO Feed V2 Arabic is DATA, not copy.** `it.title`/`it.body`/`creativeDirective`
  come from `cmoFeedV2` (LLM narration). Do NOT "improve" those strings in the
  frontend — they are backend data behind the frozen bindings. Only static UI
  chrome strings (the table above) are in scope.
- The expand labels `عرض المزيد` / `عرض أقل` (`:1081, :1110, :1114`) are correct
  standard Arabic — **leave as-is** (they're also tied to the V2 expand feature).
- Every changed string stays inside its existing escaping context; no new
  interpolation of DTO data.

---

## 2. Shortcut Removal

The keyboard-shortcut feature (added in the prior polish pass) is fully
self-contained — safe to strip without touching data flow. Remove **all** of:

| Part | File:line | What |
|---|---|---|
| CSS | `dashboardPage.ts:267–284` | `.dash-shortcuts-help`, `.dash-shortcuts-panel*`, `.dash-shortcuts-hint` blocks |
| Overlay markup | `dashboardPage.ts:299–309` | `<div id="dash-shortcuts-help" …>` dialog |
| Helpers | `dashboardPage.ts:1334–1345` | `isTypingTarget`, `toggleShortcutsHelp` |
| Keydown listener | `dashboardPage.ts:1346–1359` | `r` / `/` / `?` / `Escape` handler |
| Overlay click-to-close | `dashboardPage.ts:1360–1362` | `dash-shortcuts-help` click listener |

**Removal-safety checks (must hold):**
1. `r` currently calls `init()` — there is no OTHER trigger removed; the normal
   load path (`DOMContentLoaded → init`, `:1364`) is untouched. The dashboard
   still loads and can be refreshed via browser reload.
2. `/` focuses `search-input` — confirm nothing else depends on that focus path
   (it's optional/guarded today). No data impact.
3. After removal, grep `dashboardPage.ts` for `dash-shortcuts`, `toggleShortcutsHelp`,
   `isTypingTarget`, `keydown` → must be **zero** hits (no dangling reference).
4. `getElementById('dash-shortcuts-help')` at `:1360` must be removed in the same
   pass, or it throws `null.addEventListener` on load. Verify no orphan.

This is pure deletion — it cannot affect V2 bindings, sync, or Meta.

---

## 3. RTL & Typography Polish

### 3.1 KEY FINDING — the document is `lang="en"`, no `dir`

- `layout.ts:721` → `<html lang="en">` (shared layout for dashboard et al.).
- `registerPage.ts:9` → `<html lang="en">` (standalone).
- No `dir="rtl"` / `dir="auto"` anywhere.

The app is **bilingual**: English chrome (labels like "Dashboard", "Active Ads ·
Now Spending") + Arabic content (CMO feed, ticker, KPI narration). Forcing the
whole document to `dir="rtl"` would mis-align the English chrome and the
charts. **Recommended approach: scoped `dir="auto"` on Arabic-content containers,
not a global flip.**

### 3.2 Scoped RTL spec (presentational attributes + CSS only)

| Target | Change | Why safe |
|---|---|---|
| CMO Feed host `#brain-cmo-feed` (`:393`) | add `dir="auto"` on the container element | attribute only; does not touch `renderBrainSection` logic, V2 bindings, or `escHtml` — the browser infers direction per item |
| Ticker items | add `dir="auto"` on the text span wrapper (not the layer badge) | Arabic narration aligns RTL, English layer code stays LTR |
| Brain Box cards `#strategy-list` | `dir="auto"` on card body container | mixed AR/EN content auto-aligns |
| Active Ads section (`:357–360`) | verify Arabic campaign names align; add `dir="auto"` on name cell only | campaign names are user data (Arabic) |

**Hard rule:** `dir="auto"` is added as a **static attribute in markup** or on a
container the renderer already creates — it must NOT be injected by reshaping the
escaped innerHTML strings in `renderBrainSection`/`buildTickerItems` in a way that
alters the escaping. Prefer adding the attribute to the **static host elements**
(`#brain-cmo-feed`, etc.) so the render functions stay byte-identical.

### 3.3 Typography & spacing (CSS only, dark-mode premium)

Confine to the `extraHead` `<style>` block. Allowed:
- Arabic-friendly font stack: ensure a font with strong Arabic glyphs precedes
  the Latin stack (e.g. add a system Arabic face before `ui-sans-serif`); confirm
  line-height ≥ 1.6 for Arabic legibility on feed/ticker text.
- Card padding/gap rhythm, hero-value weight hierarchy, subtle hover elevation,
  consistent `--radius`/`--shadow` usage.
- `letter-spacing: 0` on Arabic text blocks (Arabic must never be letter-spaced —
  audit `.ticker-layer` `:96` uses `letter-spacing:0.08em`; that's on the English
  badge, fine, but ensure no letter-spacing leaks onto Arabic spans).

**Forbidden in §3:**
- Renaming/removing any element `id` the JS queries (`hero-30-val`,
  `brain-cmo-feed`, `loading-state`, `dash-subtitle`, etc.).
- Any JS logic change in render functions.
- A global `dir="rtl"` on `<html>` (breaks English chrome + charts) unless you
  explicitly decide to go fully-Arabic — see §6 open question.

---

## 4. Files in scope

| File | Part(s) | Nature |
|---|---|---|
| `src/web/pages/dashboardPage.ts` | 1, 2, 3 | string edits, deletions, `dir`/CSS |
| `src/web/layout.ts` | 3 (only if global lang/dir decision) | `<html>` attrs — gated on §6 |
| `src/web/pages/registerPage.ts` | 3 (optional) | standalone `<html>` |

No backend, mapper, worker, repo, or `getDashboard.ts` file is touched.

---

## 5. Invariants (review checklist)

| ID | Invariant |
|---|---|
| R-1 | No edit reads or reshapes DTO data; CMO Feed V2 bindings byte-identical. |
| R-2 | Every `escHtml()` call remains; no new raw interpolation of data. |
| R-3 | No element `id` queried by JS is renamed/removed. |
| R-4 | Shortcut removal leaves zero dangling references (grep-clean). |
| R-5 | `dir`/RTL applied via static container attributes + CSS only — never by altering escaped render strings. |
| R-6 | Only static UI chrome strings localized; LLM narration (feed) untouched. |
| R-7 | No backend/sync/Meta file modified. |

---

## 6. Open questions before kickoff

1. **Global vs scoped RTL:** keep the bilingual scoped-`dir="auto"` approach
   (recommended — preserves English chrome + charts), OR commit to a fully-Arabic
   RTL interface (`<html dir="rtl" lang="ar">`, larger blast radius, re-aligns
   every page)? **Recommend scoped.**
2. **Ticker layer labels (§1.2):** relabel `L3/L7/BRAIN/AI` to Arabic, or drop the
   badges entirely for a cleaner marquee?
3. **`صعود/هبوط` → `ارتفاع/انخفاض` (T3):** confirm the more formal terms, or keep
   the punchier short forms?

Answer these and the revamp is execution-ready. I'll review Corsair's diff
against R-1..R-7 before any commit.
