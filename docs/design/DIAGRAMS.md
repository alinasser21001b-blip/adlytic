# Diagrams

> **Generated — do not edit.** Every diagram below is derived from the
> repository by `npm run design`. A hand-drawn diagram goes stale the first
> time a screen is added; these cannot.
>
> Rendered as Mermaid. GitHub, Figma's Mermaid plugins and most Markdown
> viewers render them directly.

---

## 1. Complete user journeys

Solid = built. Dashed = a Blueprint screen a later slice builds.

### Journey: request-medicine

_تطلب دواء وتحجزه من صيدلية قريبة_

```mermaid
flowchart LR
  R1["R1<br/>تختار الدواء"]
  R2["R2<br/>تصوّر الوصفة<br/>(optional)"]
  R6["R6<br/>تأكيد وإرسال"]
  R7["R7<br/>تنتظر الردود"]
  R8["R8<br/>تختار العرض"]
  V1["V1<br/>نحجز لك"]
  V2["V2<br/>done"]
  S1["S1<br/>abandoned"]
  R1 --> R2
  R2 --> R6
  R6 --> R7
  R7 --> R8
  R8 --> V1
  V1 --> V2
R1 -.abandon.-> S1
  classDef pending stroke-dasharray: 4 4;

```


---

## 2. Navigation graph

Every edge comes from a screen contract. Dotted edges point at screens this
build does not contain — **no control renders for them**, so a patient cannot
reach a dead end, but the design must eventually fill them.

```mermaid
flowchart TD
  S1["S1<br/>اليوم"]
  E4["E4<br/>ليش نحتاج رقمك"]
  F1["F1<br/>ابحث"]
  F2["F2<br/>نتائج البحث"]
  R1["R1<br/>طلب جديد"]
  R6["R6<br/>تأكيد الطلب"]
  R7["R7<br/>ننتظر الردود"]
  R8["R8<br/>قارن العروض"]
  R2["R2<br/>صوّر الوصفة"]
  R3["R3<br/>شوف الصورة"]
  R4["R4<br/>لمن الدواء؟"]
  R5["R5<br/>شكد مستعجل؟"]
  R9["R9<br/>تفاصيل العرض"]
  R11["R11<br/>ما رد أحد"]
  R13["R13<br/>بانتظار الإرسال"]
  V1["V1<br/>نحجز لك"]
  V2["V2<br/>محجوز لك"]
  V4["V4<br/>ما كدرت الصيدلية تحجز"]
  S1 --> R1
  S1 --> V2
  F1 --> F2
  F1 --> R2
  F2 --> R1
  R1 --> F2
  R1 --> R2
  R1 --> R4
  R1 --> R6
  R6 --> R5
  R6 --> R7
  R6 --> R13
  R7 --> R8
  R7 --> R11
  R7 --> S1
  R8 --> R9
  R8 --> V1
  R8 --> R7
  R2 --> R3
  R2 --> R1
  R3 --> R1
  R3 --> R2
  R4 --> R1
  R5 --> R1
  R9 --> V1
  R9 --> R8
  R11 --> R7
  R11 --> S1
  R13 --> S1
  V1 --> V2
  V1 --> V4
  V1 --> R8
  V2 --> S1
  V4 --> R8
  V4 --> S1
  S1 -.blocked.-> S2["S2<br/>NOT BUILT"]
  S1 -.blocked.-> V8["V8<br/>NOT BUILT"]
  E4 -.blocked.-> E5["E5<br/>NOT BUILT"]
  F1 -.blocked.-> F5["F5<br/>NOT BUILT"]
  F2 -.blocked.-> F3["F3<br/>NOT BUILT"]
  R4 -.blocked.-> S3["S3<br/>NOT BUILT"]
  R9 -.blocked.-> R10["R10<br/>NOT BUILT"]
  R11 -.blocked.-> R12["R12<br/>NOT BUILT"]
  V2 -.blocked.-> V5["V5<br/>NOT BUILT"]
  V2 -.blocked.-> V7["V7<br/>NOT BUILT"]
  classDef built stroke:#186047;
```

- Entry points (reached without a parent — a tab bar, a notification, or a guard redirect): `S1`, `F1`, `V1`, `V2`, `V4`, `E4`, `S1`
- Unreachable screens: **0**
- Navigation traps: **0**
- Blocked exits: **10**

---

## 3. Component hierarchy

```mermaid
flowchart TD
  Screen["Screen<br/>the frame every screen renders through"]
  Screen --> Header["header: back + title + flow progress"]
  Screen --> Sticky["sticky slot (F1/F2 search)"]
  Screen --> Body["scrolling body"]
  Screen --> Footer["footer: one action"]
  Body --> StateBlock["StateBlock<br/>6 treatments"]
  Body --> Content["screen content"]
  Content --> ActionCard
  Content --> InfoCard
  Content --> Choice
  Content --> Secondary
  Footer --> Primary
  ActionCard --> Label
  InfoCard --> Label
  Choice --> Label
  Primary --> Label
  Secondary --> Label
  Label --> Digits
  Label --> Bidi
```

---

## 4. Design token relationships

```mermaid
flowchart TD
  subgraph Tokens
    color["colour<br/>15 semantic roles<br/>light + dark"]
    type["type<br/>5 roles<br/>letter-spacing always 0"]
    space["space<br/>4pt scale, 11 steps"]
    radius["radius<br/>5 values"]
    tap["tap targets<br/>44 / 48 / 56pt"]
    motion["motion<br/>8 tokens<br/>ALL UNAPPLIED"]
    elevation["elevation<br/>5 levels<br/>ALL UNSPECIFIED"]
  end
  theme["themeFor(scheme)<br/>resolves one persona"]
  kit["ui/kit.tsx<br/>11 components"]
  screens["8 screen files"]
  color --> theme
  type --> theme
  space --> theme
  radius --> theme
  tap --> theme
  motion -.never read.-> kit
  elevation -.never read.-> kit
  theme --> kit
  kit --> screens
  classDef dead stroke-dasharray: 4 4;
  class motion,elevation dead;
```

Two token families are declared and **never read by any component**: motion
(8 tokens) and elevation (5 levels).
They are the two largest specification gaps.

---

## 5. Asset dependency map

```mermaid
flowchart LR
  icons["Icon set<br/>SVG · MISSING"] --> back["Back affordance<br/>currently ‹"]
  icons --> add["Add affordance<br/>currently +"]
  icons --> search["Search affordance<br/>currently ⌕"]
  icons --> stepper["Stepper<br/>currently + −"]
  icons --> tabbar["Tab bar<br/>COMPONENT MISSING"]
  fonts["Font files<br/>MISSING"] --> arabic["Arabic family<br/>4 weights"]
  fonts --> latin["Latin family<br/>drug names"]
  fonts --> tabular["Tabular figures<br/>countdown must not jitter"]
  tabular --> v2["V2 reservation code"]
  tabular --> r7["R7 countdown"]
  appicon["App icon<br/>MISSING"] --> build["Any device build"]
  notif["Notification icon<br/>MISSING"] --> promise["The product's core promise"]
  splash["Splash<br/>MISSING"] --> e1["E1 Launch"]
  photo["Photo viewer design<br/>MISSING"] --> r3["R3 — grey box today"]
  classDef missing fill:#fee,stroke:#c33;
  class icons,fonts,appicon,notif,splash,photo missing;
```

---

## 6. Screen dependency map

Which built screens are waiting on which unbuilt ones. Each dotted edge is a
control that cannot be rendered today.

```mermaid
flowchart TD
  S1 -.needs.-> S2 & V8
  E4 -.needs.-> E5
  F1 -.needs.-> F5
  F2 -.needs.-> F3
  R4 -.needs.-> S3
  R9 -.needs.-> R10
  R11 -.needs.-> R12
  V2 -.needs.-> V5 & V7
  classDef gap stroke-dasharray: 4 4,fill:#fee;
  class S2,V8,E5,F5,F3,S3,R10,R12,V5,V7 gap;
```
