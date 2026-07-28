# Qareeb Patient Journey — Design Direction

## Subject, audience, and single job

The subject is medicine availability—not pharmacy e-commerce. The primary user is an
Arabic-first patient in Baghdad on a mid-range phone who needs to identify an exact
medicine presentation and obtain a trustworthy, time-bounded pharmacy confirmation.
The journey's single job is to turn uncertainty into one safe next action.

## Visual tokens

- `petrol-900 #103F3C` — primary trust and navigation
- `petrol-700 #17615B` — active controls
- `paper-100 #F8F5ED` — warm, low-glare background
- `ink-900 #172321` — primary text
- `amber-600 #B86C16` — changing time and pending availability
- `coral-700 #A83C3C` — safety and controlled-medicine warnings only

Typography uses the local system Arabic stack. Headings use a restrained Kufi-like
system fallback treatment; body copy uses a highly legible Naskh/Sans system stack;
timestamps and prices use tabular Western numerals.

## Layout concept

The mobile layout behaves like a sequence of pharmacy counter slips: one focused
decision per view, a persistent location context, and a grounded action dock. Desktop
keeps the patient journey in a narrow primary column and adds a quiet “trust ledger”
beside it rather than stretching the phone screen.

```text
Mobile
┌─────────────────────────────┐
│ wordmark      location chip │
│ progress trail              │
│                             │
│ one decision surface        │
│ evidence / trust details    │
│                             │
│ sticky primary action       │
└─────────────────────────────┘

Desktop
┌───────────────────────────────────────────────────────┐
│ wordmark                            location / demo    │
├───────────────────────────────┬───────────────────────┤
│ patient decision surface      │ live trust ledger     │
│ 600–680px                     │ events / privacy      │
└───────────────────────────────┴───────────────────────┘
```

## Signature: the Shelf Pulse

One continuous line represents the request's real lifecycle:

```text
بحث ━━ موافقة ━━ طلب مجهول ━━ مراجعة صيدلي ━━ حجز
```

Nodes activate only when a domain event is recorded. The line never fills by elapsed
time and never shows a percentage. On the radar screen it becomes a live event ledger:
each pulse corresponds to a real event emitted by the simulator or production source.

## Motion

One functional motion is used: a short pulse travels to a newly activated lifecycle
node when an event arrives. It does not loop. Reduced-motion mode replaces it with an
instant state change.

## Self-critique and revision

The first direction used rounded cards, health green, and a radar ring. That could
belong to any health startup and implied continuous tracking. It was removed. The
revised design uses counter-slip edges, timestamped evidence, and the event-driven
Shelf Pulse—forms specific to verified medicine availability. Decorative medical
icons, gradients, glass effects, fake maps, and generic dashboard statistics are
excluded.
