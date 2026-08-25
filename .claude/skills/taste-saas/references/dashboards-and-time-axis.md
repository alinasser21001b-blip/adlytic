# Dashboards + time-axis views

> Read when: building any page where time or aggregated metrics are the primary content — dashboards, analytics, timelines, gantt, calendars, log streams.

> **KPI/chart structure, color discipline, URL contract, and time-axis variants are universal across Archetypes A/B/C/D.** The exact card tints (`bg-bg-surface/60 rounded-lg`) and density tokens below are Archetype A flavored — B/C/D substitute their surface conventions; see `references/archetype-*.md`. (Note: "archetype" inside this doc refers to *internal data-shape* archetypes — Timeline / Gantt / Calendar / Log stream — NOT the global app archetypes.)

Both archetypes share the same primitives (KpiCard, ChartCard, Sparkline) and the same `?range`/`?from`/`?to` URL contract. Read shared primitives once, then jump to the section you need.

## TOC

1. Shared primitives — KpiCard, ChartCard, Sparkline, TimeRangeChip
2. URL search-param contract
3. Dashboards — KPI grid + chart grid + range pivot
4. Time-axis variants — Timeline, Gantt, Calendar, Log stream

---

## 1. Shared primitives

Charts/series use the `--chart-1..5` palette defined in `references/wireless-tokens.md`. Don't redefine palettes per page.

### KpiCard

Fixed `h-28` (~112 px). Equal width AND equal height across the row, even if one card has no sparkline. Layout: small label top-left, big value mid, delta chip bottom-left, sparkline bottom-right.

```tsx
<div className="h-28 bg-bg-surface/60 rounded-lg p-4 flex flex-col justify-between">
  <div className="text-xs text-fg-muted">{label}</div>
  <div className="text-4xl font-display tabular-nums">{compact(value)}</div>
  <div className="flex items-end justify-between">
    <DeltaChip pct={delta} />
    <Sparkline data={trend} />
  </div>
</div>
```

- Big number: `text-4xl font-display tabular-nums`. Never `text-3xl` — reads as placeholder at `h-28`.
- Currency / unit suffix in `text-fg-muted text-base` next to the number, not a prefix block.
- Delta chip = semantic-colored pill: `+12%` → `text-success bg-success-subtle`, `−3%` → `text-danger bg-danger-subtle`, `0%` → `text-fg-muted bg-bg-surface`. Pick one redundancy at most — color OR arrow OR parentheses, not all three.

### ChartCard

Pick ONE locked height per dashboard: `h-56` (secondary) or `h-72` / `h-80` (main). All cards on the page use the same locked height. Card: `bg-bg p-4` (no border, no shadow at rest) OR `bg-bg-surface/60 p-4 rounded-lg` (tint instead of border). Pick ONE per dashboard and apply globally.

- Header is ONE row: title left (`text-sm font-medium text-fg`), optional subtitle / legend right. Not a second toolbar inside the card.
- Tooltips themed to the design system: `bg-bg-surface border-border text-fg`, project font, tabular-nums. Never ship the chart library's default tooltip — white box + drop shadow always looks plastered on.
- Empty state lives inside the chart card (not a blanket page empty). Loading = same shell with Skeleton inside, never a full-page spinner.

### Sparkline

60×24 px, fixed. No axes, no grid, no tooltip. Glyph, not chart. `stroke-width=1.5`, brand color at full opacity (NOT 0.5 — at this size, transparent strokes vanish).

### TimeRangeChip

ONE chip in the `PageHeader` actions slot. Drives every query on the page. Default `Last 7 days`; presets `[Last 24h, Last 7d, Last 30d, Last 90d, Custom]`. Don't put per-chart range pickers — sub-charts inherit.

---

## 2. URL search-param contract

Time-axis state lives in URL search params, not just component state. Copy-pasting a URL preserves the view.

| Param | Values | Used by |
|---|---|---|
| `?range` | `24h \| 7d \| 30d \| 90d \| custom` | dashboard, log stream, timeline |
| `?from`, `?to` | ISO date | when `range=custom` |
| `?zoom` | `week \| month \| quarter` | gantt, calendar |
| filter chips (`?team=`, `?status=`) | string | all variants |

A page that loads N charts runs N parallel `useApiQuery` calls — NOT one `Promise.all` inside one query. TQ dedups, retries, and individual charts can fail without taking the page down. `staleTime: 60_000` (looser than list pages — dashboards aren't transactional).

---

## 3. Dashboards — KPI grid + charts

```
┌── PageHeader portal ──────────────────────────────────┐
│                                       [Last 7 days ▾] │  ← time-range chip in actions
├───────────────────────────────────────────────────────┤
│  KPI       KPI       KPI       KPI                    │  ← 4-up, equal w + h
├───────────────────────────────────────────────────────┤
│  Main chart (2/3)              Sidebar list (1/3)     │  ← 2:1 split
├───────────────────────────────────────────────────────┤
│  Secondary (1/2)               Secondary (1/2)        │  ← 1:1 split
└───────────────────────────────────────────────────────┘
```

### Rules

- KPI row = `grid-cols-2 md:grid-cols-4 gap-3`. **4 tiles per row, no more no less.** If you have 6 metrics, demote two to a secondary card.
- Chart grid = `grid-cols-3 gap-4`. Main chart `col-span-2`, secondary `col-span-1`.
- Compact format for big KPI numbers: `1.2K`, `48.3M` — `Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })`. Full precision in tooltips.
- Percentages: 1 decimal max (`12.4%`, not `12.45%`). `tabular-nums` on every number column.

### Color discipline

- ONE brand series (`--chart-1`) for the headline metric.
- Categorical series cap = 5. >5 categories → group tail as "Other" or switch to small-multiples.
- Adjacent series differ in hue, not lightness. Two shades of blue read as "one thing", not two series.
- Sequential data (heatmap) = ONE hue, varied lightness. Not a rainbow.
- Never color-encode a metric by value inside a line chart — that's what the delta chip is for.

### NEVER on a dashboard

- Pie chart with >5 slices. Sorted bar instead.
- Donut with one center number. Just show the number.
- Dual y-axes. Normalize to index 100 or stack two charts.
- 3D charts, gauges, speedometers.
- Initial-load animation > 300 ms. Slowly-animating-in charts are the cardinal AI tell.
- A "refresh" button next to a TQ-backed chart. TQ refetches on focus + every 60s.
- `border + shadow + radius + bg-white` (the "default card" tower). Tint OR border, not both.

### Reference impl (shadcn ui/chart)

```bash
pnpm dlx shadcn@latest add chart
```

Gives `ChartContainer` + `ChartTooltip` + `ChartTooltipContent` + `ChartLegend`. Use `<ChartTooltip content={<ChartTooltipContent />} />` — the shadcn wrapper inherits the design tokens. Other libs (visx, Tremor, Chart.js, ECharts) follow the same pattern: wire series colors from `var(--chart-N)`, theme the tooltip with `bg-bg-surface border-border`.

---

## 4. Time-axis variants

Choose by data shape:

- **Timeline** — events over time, single track (activity feed, audit log, cycles list)
- **Gantt** — overlapping ranges across lanes (project milestones, deploys, roadmap)
- **Calendar** — day/week/month grid (schedules, bookings, content calendars)
- **Log stream** — virtualized list with time-grouped headers (server logs, request traces)

### 4a. Timeline (single track)

Single column of events ordered by time. Rows have `h-14` (matches density ladder). Each row: timestamp left (`text-fg-muted text-xs tabular-nums`), event content, optional avatar / actor.

Cycles variant: each row is a time window (Sprint 14, May 12 → May 26) with a 6 px progress bar (`h-1.5`) and a stacked-avatar cluster (24 px, `ring-2 ring-bg`, `-ml-2` overlap, cap 5 + `+N`). Row click → `/issues?cycle=<id>`.

```
┌─────────────────────────────────────────────────────────┐
│ May 26  10:42  alice  opened PR #1234                   │
│ May 26  09:15  bob    deployed prod v2.4.1              │
│ May 25  17:03  carol  closed issue LIN-456              │
└─────────────────────────────────────────────────────────┘
```

NEVER:
- Hide the timestamp behind a tooltip. Always visible, always tabular.
- Group rows by relative time alone ("2 hours ago"). Show absolute + relative on hover.
- Cycles without a date range. A name is not a cycle — the date window is the whole point.

### 4b. Gantt (multi-lane, positioned bars)

Lanes on Y (cycle / status / team — pick ONE, don't expose a switcher unless all three work). X = time. Bars positioned + sized by start/end dates.

```
       │ Apr 27 │ May 4 │ May 11 │ May 18 │ May 25 │ Jun 1 │
 ──────┼────────┼───────┼────────┼────────┼────────┼───────┤
 Sp14  │░░░░░░░░░██████████░░░░░░░░░░░░│                  │
 Sp15  │                  ░░░██████████░░░░░░░░░░░░░░│    │
 Sp16  │                            ░░░░░░░░██████████░░░░│
       │                │←── Today ──→│                   │
```

Recipe:

- Sticky date header (`sticky top-0 z-10 bg-bg`) + sticky lane label (`sticky left-0 z-[5] bg-bg w-32`).
- Zoom toggle: segmented `[Week | Month | Quarter]`, persisted as `?zoom=`. `pxPerDay` = 14 / 6 / 2 respectively.
- Bar position: `left: (startDate - laneStart) / dayMs * pxPerDay`. Width: `(endDate - startDate) / dayMs * pxPerDay`. No end date → width to `now` with a 4 px right-edge fade.
- Bar height `h-9` (36 px), 4-8 px gap. Color by status (same palette as `StatusPill`): 30% opacity fill + 100% opacity top 2 px stroke. Label inside the bar, truncated.
- "Today" line: 1 px vertical, `bg-brand z-[6]`, drawn LAST so it's on top. **Computed from `new Date()` on every render**, never cached. "Today" button scrolls so the line sits ~25% from left.
- Drag-to-reschedule: snap to 1-day resolution on drop, then `PATCH /v1/issues/:id` + invalidate. Clamp to lane window.
- Bar click → `/issues/:id`. Not an inline popover.

NEVER:
- "Today" line missing, cached, or off by one. Recompute every render — if you cache it and the user leaves the tab open past midnight, the whole roadmap is lying.
- Lanes with their own X axis. One date scale shared across all lanes, or it's not a roadmap.
- Drag below 1-day resolution. Hour-precision on a month view is misleading noise.
- Bars colored by lane instead of status. Status IS the bar's identity.

### 4c. Calendar (day/week/month grid)

Three zooms, persisted as `?zoom=week|month|quarter` (month default). Each cell = one day. Events render inside cells; multi-day events span across cells with a continuous bar.

```
┌─Mon──┬─Tue──┬─Wed──┬─Thu──┬─Fri──┬─Sat──┬─Sun──┐
│  1   │  2   │  3   │  4   │  5   │  6   │  7   │
│      │ ●Mtg │██Conf████│   │      │      │      │
│      │      │      │ ●1:1 │      │      │      │
├──────┼──────┼──────┼──────┼──────┼──────┼──────┤
│  8   │  9   │  10  │  11  │  12  │  13  │  14  │
```

Recipe:

- Month grid: 7-col, equal-width cells, `min-h-24`. Day number top-left `text-xs text-fg-muted`. Today cell: brand 2 px ring inside.
- Week zoom: 7-col, hour rows (`h-12` per hour, 24 rows). Multi-day spans become horizontal bars across the top strip.
- Events: max 3 visible per cell, then `+N more` chip. Click chip → day-detail popover with all events.
- Today button + arrow nav `← →` for prev/next period. Persist focused date as `?date=YYYY-MM-DD`.

NEVER:
- Calendar that doesn't honor weekend setting (Sun-first vs Mon-first). Use `Intl.Locale.weekInfo` or explicit project pref.
- All-day events as time-bound bars at midnight. Render them in a separate top strip.
- More than 3 events per cell with no overflow chip — collapses readability instantly.

### 4d. Log stream (virtualized, time-grouped)

Server logs, request traces, audit streams. Virtualized list (react-virtual / TanStack Virtual) — non-virtualized dies at 5k rows.

```
─── 2026-06-02 14:30 ─────────────────────────────────
14:30:12.847  INFO   api  POST /v1/issues  201  42ms
14:30:09.221  WARN   api  rate-limit hit for user_42
14:30:01.103  ERROR  db   connection timeout (retry 1/3)
─── 2026-06-02 14:29 ─────────────────────────────────
14:29:55.412  INFO   api  GET /v1/issues  200  18ms
```

Recipe:

- Row = `h-7` (28 px), monospace, `tabular-nums` for timestamp. Level pill colored by severity (`text-danger`, `text-warning`, `text-fg-muted`).
- Sticky minute / hour headers (`sticky top-0 bg-bg`) — render when the previous row's bucket changes.
- Follow-tail toggle: auto-scrolls to bottom as new rows stream in. Disable when user scrolls up; re-enable with a "Jump to live" button.
- Filter chips: level, source, query string. URL-driven (`?level=error&q=timeout`).
- Time range = same `TimeRangeChip` as dashboards. `Last 24h` default for log streams.

NEVER:
- Non-virtualized list. Dies at 5k rows, freezes the tab at 50k.
- Auto-scroll while the user is reading scrollback. Toggle off when scroll position leaves the bottom.
- Pretty-printed JSON inline per row. Collapse to one line; expand on row click.
- Coloring the whole row by severity. Use a level pill — full-row tinting destroys scanning.
