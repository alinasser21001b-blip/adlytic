---
name: magicui-patterns
description: Port Magic UI motion patterns (number-ticker, blur-fade, border-beam, animated-list, marquee, shimmer) into dashboards and SaaS consoles. Use when polishing KPI counters, section entrances, CTA shine, or feed animations. Prefer vanilla CSS/JS ports for non-React stacks (e.g. Adlytic Hono HTML).
---

# Magic UI Patterns (portable)

Source components live in `components/` (from github.com/magicuidesign/magicui). Docs in `docs/`.

## Adlytic porting rules

Adlytic is Hono + server-rendered HTML + Chart.js — do **not** add React/Tailwind for these effects. Port the mechanics:

| Component | Core mechanic | Vanilla port |
|---|---|---|
| number-ticker | spring count-up on in-view | rAF ease-out ~800ms + IntersectionObserver |
| blur-fade | opacity/y/blur entrance | CSS keyframes + stagger delays |
| border-beam | offset-path orbit | CSS `@supports (offset-path: …)` |
| animated-list | spring scale-in per item | class toggle + sequential reveal |
| marquee | infinite translateX | already used as ticker-track |
| shimmer-button | gradient sweep | background-position keyframes |

Always gate with `prefers-reduced-motion`. See also repo `UI_KIT_NOTES.md`.

## When to use

- KPI hero values need count-up
- Dashboard sections need orchestrated entrance
- One hero card needs border-beam highlight
- AI feed / recommendations need sequential reveal

## When not to use

- Full React Magic UI install on Adlytic runtime
- Decorating every card (use sparingly — one signature motion per viewport)
