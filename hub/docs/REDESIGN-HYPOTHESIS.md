# Qareeb — redesign hypothesis

Written before the code. The audit is in §1; everything after it follows from it.

## 1 · The structural problem

The record is **a table of contents for a database.** Twelve rows, each a noun
that maps one-to-one onto a storage table: Conditions, Medications, Labs,
Visits, Documents, Procedures, Immunizations, Measurements, Shares, Access,
Carry, Timeline. Every row is the same shape, the same weight, and the same
distance from the patient.

What is missing is the thing a patient and a clinician both actually hold in
their head: **"I have diabetes and hypertension, my HbA1c is rising, and nobody
has looked at it."** That is not a table. It is a *thread* — a problem, and
everything that has happened to it over time.

The domain already models this and has since day one:

| already in `emr.js` | rendered anywhere |
|---|---|
| `EP_STATE`, `EP_MACHINE`, `canCloseEpisode` (with the cancer-loss guard) | no |
| `timelineByEpisode` → `{episodes, unassigned}` | no |
| `episodeId` + `conditionId` on every timeline event | no |
| `significance` 1–4 per event (encounter 1 · meds 2 · diagnosis/result/imaging 3 · major surgery 4) | no |
| `minSignificance` filter in `buildTimeline` | no |

So the product's single strongest differentiator is computed on every render and
thrown away, and the interface that remains can only be a list of tables. That
is the whole complaint, and it is not a styling problem.

### Specific findings

- **Duplicated information.** `#/record/labs` is linked twice from the record
  index under two names («نتائج معلّقة» and «التحاليل»). Visits are a strict
  subset of Timeline (`EVT.ENCOUNTER`). Blood sugar has two homes — a lab result
  and a "measurement" — depending on who typed it.
- **Weak hierarchy.** Twelve rows at one weight; the access log looks exactly
  like an abnormal result. Group headings were quieter than the rows they label.
- **Excessive navigation.** Doctors and Pharmacies are two tabs answering one
  question ("who is open near me"), differing only by entity type — which is a
  filter, not a destination. `#/needs` is a third doorway to the same job.
- **Competing primary actions.** The record's «من يرى ملفي» group offers four
  rows, three of which issue a code: Share / Active shares / Carry summary. A
  user cannot tell them apart.
- **Screens that feel empty.** `#/record/carry` is one button. `#/record/shares`
  is one line and one button. Both are halves of one flow.
- **Screens that feel overloaded.** `#/record/share`: 11 checkboxes and 5
  duration chips on one scroll. `#/needs`: twelve rows each reading «لا أحد
  متاح الآن».
- **Grouped but shouldn't be.** Storage category ≠ user intent. "Documents"
  holds a discharge summary from the gallbladder episode and an unrelated lab
  printout; they have nothing to do with each other.
- **Not grouped but should be.** Everything belonging to one problem.

## 2 · New information architecture

**Care threads replace storage categories as the organising unit.**

A thread is a problem plus everything attached to it, derived — never invented —
from keys that already exist: an explicit `episode`, or an active `condition`
threading its own events via `conditionId`, plus labs whose codes recur in that
problem's series. Storage categories survive as an **archive**, reachable but no
longer the spine.

```
RECORD
├── who + current state          ← answers "where are we now?"
├── CARE THREADS                 ← the spine. one per active problem
│     └── thread detail: story, trend, meds, next step
├── TIMELINE (weighted)          ← "show me everything", by significance
└── ARCHIVE (by kind)            ← the old twelve, demoted to a drawer
```

## 3 · New navigation model — 4 tabs, not 5

The 5-tab bar is **not** correct, and the failure is specific: `الأطباء` and
`الصيدليات` are the same destination twice. Both answer "who near me is open
right now", both are lists of facilities sorted by distance and hours, and the
only difference is which entity type is filtered — the definition of a filter.
Meanwhile the medicine-availability network, which is the product's other
differentiator, had **no tab at all** and eleven screens passing a nav key the
bar could not light.

```
BEFORE  Home · Record · Doctors · Pharmacies · Account
AFTER   Home · Record · Care    · Account
                        └─ segmented: doctors / pharmacies / medicine
```

`Care` is one destination with a segmented control. This removes a duplicate
destination rather than adding one, gives the medicine network a real home, and
keeps the Apple track's Account tab exactly where that developer put it.
Every existing route stays reachable — the tab merge changes the doorway, not
the rooms.

## 4 · Home — signal before detail

Home answers four questions in a fixed order and never a fifth:

1. **ATTENTION** — what is abnormal, unacknowledged, or overdue. Suppressed
   entirely when empty; never a reassuring placeholder.
2. **TODAY** — live custody: who currently holds a share, is a code outstanding,
   did anyone open the record.
3. **CONTINUITY** — the care threads, as the story so far.
4. **ACTION** — exactly one next step.

Discovery (pharmacies open, doctors nearby) moves *below* all four. It is a
service the app offers, not the reason a patient opened it.

## 5 · Patient record — story before archive

`PATIENT → CURRENT STATE → THREADS → TIMELINE → ARCHIVE`. The first screen
answers "where are we now?"; "show me everything that ever happened" is one tap
further. The twelve category rows collapse into a single archive section whose
rows appear only when they hold something.

## 6 · Care episode model

A thread renders as a **connected story with a rail**, not as sibling cards:

```
DIABETES · active since 2025-02-09
│
├─ 2025-02-09  diagnosed
├─ 2025-02-09  metformin started
├─ 2025-08-03  HbA1c 7.1
├─ 2026-07-01  HbA1c 8.4   ↑ rising, out of range
└─ next: nobody has acknowledged the 8.4
```

The rail is what makes the relationship visible: one continuous line means one
problem. The same component serves an acute episode (gallbladder → imaging →
surgery → pathology → follow-up) and a chronic one, because both are the same
shape — a problem with a trajectory and an open end.

## 7 · Visual principles

1. **Weight carries importance, not colour.** `significance` drives type size and
   rail-dot size. Alarm colour is reserved for what changes the next minute.
2. **Rails, not cards.** A connected line means "these belong together"; a card
   means "this is separate". The product is about connection.
3. **One anchor per screen.** The largest thing is the reason the screen exists.
4. **Density is information.** Threads breathe; the archive is dense.
5. **Absence is a word, never a zero.**
6. **Arabic-first rhythm.** Leading from Arabic ink, no tracked caps, logical
   properties only, numbers isolated, units outside LTR runs.
7. **Progressive disclosure.** SIGNAL → CONTEXT → DETAIL → ACTION, in that order,
   on every screen.

## 8 · How this will be judged

Not by tests. By: strip the colour and the decoration — is the hierarchy still
legible? Open a record cold — is the patient's current story clear in five
seconds? Does every screen look like it belongs to the same product?
