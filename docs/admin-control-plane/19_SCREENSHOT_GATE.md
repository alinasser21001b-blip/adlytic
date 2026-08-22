# 19 — The screenshot gate

The automated audit is necessary and was never sufficient. Before declaring
visual completion, render every surface and **look at it**.

## Running it

```bash
npm run admin:harness      # serves the real pages against fixture APIs
npm run admin:ui-audit     # 7 surfaces x 11 scenarios x 3 viewports
npm run admin:nav-audit    # 16 transitions, driven by clicking
npm run admin:graph-audit  # 19 operator questions against the graph
```

Screenshots land in `$OUT`. Review all seven at 1600×1000 on the
`partial_data` scenario — one healthy workspace, one blocked, one never
synced, one deliberately long Arabic name.

## What the automated audit covers

| Check | Catches |
|---|---|
| raw JSON outside a disclosure | payload dumped at an operator |
| content occupancy (data scenarios) | page whose content stops in the top third |
| card vs. child alignment | content rendering outside its own card |
| dead meters | a bar whose fill is 0px while its value is not |
| truncated primary labels | a clipped heading or stat |
| horizontal overflow | layout pushing the page sideways |
| unresolved skeletons | a spinner after its request already failed |
| absence-state treatment | UNKNOWN or NOT_TESTED borrowing a verdict colour |
| legacy shell leakage | a second product's chrome |
| active-nav count | operator cannot tell where they are |
| graph label legibility | labels under 6px |

## What only looking catches

Every one of these passed the automated audit and was found by eye:

- **Six identical empty bars.** Present, sized, not overflowing, not JSON — and
  carrying no information, because inline elements ignore width.
- **Tables 13px outside their cards.** Nothing left the viewport.
- **A console contradicting itself** — "nothing needs intervention" above a
  failed workspace.
- **Only three of seven surfaces had a page header.**

The pattern: automated checks confirm the absence of failures you already
imagined. A screenshot shows the ones you did not.

## The review questions

For each surface, at each viewport:

1. Could an operator say what this page is for, without the sidebar?
2. Is the most important thing the most prominent thing?
3. Does anything read as machine output rather than an answer?
4. Do card edges line up, and does content sit inside its card?
5. Does every chart, bar and meter actually carry a value?
6. Does the page contradict itself anywhere?
7. Would this look like the same product as the previous surface?
8. In RTL: do titles anchor right, do identifiers stay LTR, does nothing mirror
   that should not?

## The standing rule

`ADMIN_VISUAL_STATUS=COMPLETE` requires both a clean audit **and** a human
having looked at every surface. A clean audit alone certified the page that
triggered this work.
