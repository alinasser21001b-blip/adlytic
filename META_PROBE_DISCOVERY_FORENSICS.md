# CAPABILITY PROBE — DISCOVERY FORENSICS

Why two consecutive probe runs produced identical evidence, and what was
actually established about the account.

---

## 0. The four answers

```text
LOCAL_HEAD  = 63731b92d89e7e9adc821547206c48f842ff8896
REMOTE_HEAD = 63731b92d89e7e9adc821547206c48f842ff8896   (both refs)
DEPLOYED_SHA = UNPROVEN — and it was UNPROVABLE, by anyone, until this commit
DISCOVERY_FALLBACK_PRESENT_IN_DEPLOYMENT = NO
```

`REMOTE_HEAD` matches on both `claude/adlytic-31edjv` and `main`, and the
working tree is clean. So the code was pushed. That is the whole of what git
can tell us, and it is not the question.

**`DEPLOYED_SHA` is UNPROVEN, not "probably 63731b9".** No route exists from
this environment to `adlytic.net` (the outbound proxy answers 403 for every
host, Meta included). More importantly, *no route existed from anywhere*: the
service published `version: "0.1.0"` on `/api/health` — a string literal that
has been byte-identical on every deploy since the repository was created. It
cannot distinguish two builds, so it never answered the question it appears to
answer. That is fixed below.

**`DISCOVERY_FALLBACK_PRESENT_IN_DEPLOYMENT = NO` is proven**, by arithmetic
against our own source rather than by inference from a dashboard. §1.

---

## 1. "16 calls" is a signature, and it names the strict chain

Both runs reported **total calls = 16**. That number is not incidental — it is
fully determined by which discovery implementation ran, because the candidate
set's cost is fixed once you know which entity ids resolved.

Measured in `test_probe_discovery.ts` (no network, no token — Experiment −1):

| build | discovery calls | candidate calls | **total** |
|---|---|---|---|
| `63731b9^` strict chain: `campaigns` → `{campaign}/adsets` | 2 | 14 | **16** |
| `63731b9` + account fallback (`/act_X/adsets`, `/act_X/ads`) | 4 | 14 | **18** |
| this commit — three account edges, always | 5 | 14 | **19** |

The candidate set spends 14 calls when only a campaign resolves: two baselines
without a baseline-request of their own (account, campaign), six candidates
needing an ad set or an ad that are skipped as `NOT_TESTED` at zero cost, and
six campaign-level candidates at two calls each.

So **16 is the strict chain's signature.** The fallback build cannot reach it
on a full run, because its extra two discovery calls are unconditional once
the ad-set chain comes back empty.

### The alternate explanation, tested rather than waved away

A run can spend *fewer* calls than its build's full cost if a rate limit
truncates it, so 16 is only decisive if no truncated fallback run also lands on
16. One does — the test enumerates all 40 truncation points and finds it. But
every such run leaves `config.unified_attribution` non-`AVAILABLE`, because
truncation stops at that candidate. Both Round 1 and Round 2 reported it
`AVAILABLE` with the field present.

The alternate explanation is therefore excluded by the reported verdicts, and
the conclusion stands: **the deployed process was running the strict chain.**
`63731b9` was pushed and not deployed. The skipped-deploy notice seen earlier
in this work is consistent with that, but the call arithmetic is the evidence,
not the notice.

> **STOP condition, per the standing instruction: honoured.** No further Meta
> probe is proposed until a deployed SHA is read from the running process.

---

## 2. What the discovery code actually did

The entire discovery mechanism in the deployed build:

```ts
const listOne = async (path: string) => {
  if (remaining.left <= 0) return undefined;
  remaining.left -= 1;
  const res = await fetch(url, init);
  if (!res.ok) return undefined;          // ← status, code, subcode: gone
  const j = await res.json();
  return j.data?.[0]?.id;                 // ← empty vs refused: same value
};
```

Requested per call: `fields=id`, `limit=1`. Nothing else.

Everything section 2 of the brief asks to be recorded — endpoint class, HTTP
status, Meta code, returned count — was discarded at the moment it arrived.
That is why neither run could say anything about why no ad set was found: the
information was destroyed inside our own process, not withheld by Meta.

Recording it required no Meta call to design, and it is now recorded. `§4`.

---

## 3. Which structural dependency caused it

The brief lists eight candidate causes. Four are settled by reading the
deployed code; four required the instrumentation that did not exist.

| # | hypothesis | verdict against the deployed code |
|---|---|---|
| 1 | discovery inherited the one-day insights range | **EXCLUDED.** `listOne` sent `fields` and `limit` only. No `time_range` ever reached a discovery call. |
| 2 | filtering inherited from the insights requests | **EXCLUDED.** Same reason — discovery and insights shared no parameters. |
| 3 | delivery on the probed date was required | **EXCLUDED.** Follows from 1: existence was never conditioned on a window. |
| 4 | **first-campaign-only** | **CONFIRMED, and still live in production.** The chain asked `/{campaign}/adsets` for the single campaign returned by `limit=1`. A first campaign with no ad sets truncates discovery and takes six candidates with it — regardless of what the other campaigns hold. |
| 5 | ACTIVE-only / status filtering | **NOT EXCLUDED.** No explicit `effective_status` was sent, but the Graph API's *default* edge listing omits `ARCHIVED` and `DELETED`. An account whose ad sets are all archived returns an empty edge, truthfully for the default filter and misleadingly as an answer to "does an ad set exist?". Never tested. |
| 6 | **pagination assumption** | **NOT EXCLUDED, and `limit=1` maximises it.** A page can be cut before any visible row, returning `data: []` alongside a `paging.next` cursor. The deployed code read neither `paging` nor `summary`, so this is indistinguishable from an empty account. |
| 7 | a legitimately empty nested edge | **POSSIBLE.** Also indistinguishable from 5, 6 and 8 in the deployed code. |
| 8 | a refusal misread as absence | **NOT EXCLUDED.** `if (!res.ok) return undefined` maps a 400 or 403 to the same value as an empty edge. "Meta refused us" and "the account has none" are opposite findings with opposite fixes, and the deployed code could not tell them apart. |

Hypothesis 4 is confirmed. Hypotheses 5, 6, 7 and 8 remain open **as facts
about the account**, and the next run distinguishes all four.

---

## 4. What changed

Discovery moved into `src/services/metaEntityDiscovery.ts`, its own module —
because *finding a subject* and *measuring one* are different problems, and
keeping them in one function is how the first one inherited nothing but the
second one's assumptions.

**Three account-level edges, unconditionally, in a fixed order.**
`/act_X/campaigns`, `/act_X/adsets`, `/act_X/ads`. The account edge spans every
campaign, so the first campaign stops being load-bearing (hypothesis 4). The
nested edge is now asked only when the account edge is *refused* — a different
hypothesis (edge-scoped permission) rather than a redundant retry.

**`summary=total_count` on every edge.** This answers `ACCOUNT_CAMPAIGN_COUNT`,
`ACCOUNT_ADSET_COUNT` and `ACCOUNT_AD_COUNT` directly instead of inferring them
from whether a page happened to be non-empty.

**`limit=25`, not `limit=1`.** Page size 1 is where a filtered-after-paging
empty is both most likely and least visible (hypothesis 6).

**One all-statuses retry when an edge returns nothing** (hypothesis 5), using
only the status values every object level accepts, so the rung cannot fail for
its own reasons and teach nothing.

**Every step recorded**: endpoint class, path, HTTP status, Meta code and
subcode, rows returned, `total_count`, whether a next page existed, which id
was picked and why. Four anomalies are named rather than collapsed:

```text
REFUSED                   Meta said no. Says nothing about whether objects exist.
EMPTY_WITH_NEXT_PAGE      no rows, but a next cursor — OUR request failed
EMPTY_WITH_NONZERO_TOTAL  no rows, but the edge counts some — OUR request failed
NO_SUMMARY                we asked for a count and got none — UNPROVEN, not 0
NOT_ASKED_BUDGET          never asked. Not a finding about Meta.
```

**A count of `null` is UNPROVEN and may never be read as zero.** "The account
has no ad sets" and "we failed to count them" lead to opposite conclusions
about whether the rest of the run is trustworthy.

**A dormant subject is disclosed.** When only archived objects exist, one is
used — testing against an archived object beats testing against nothing — and
the report says so, because a capability verdict obtained from an archived
object may be about its lifecycle rather than about the capability.

### Cost

3 calls when all three edges answer; at most 5 when they do not. The base cost
is *fixed*, which is what lets the total call count keep working as a build
signature on future runs.

---

## 5. The deployed build is now readable

`src/lib/buildIdentity.ts` resolves the running commit from the platform's
injected git metadata, and it appears in three places:

- `GET /api/health` → `build: { commit, shortCommit, branch, message, source, bootedAt, resolved }` — unauthenticated, one `curl`
- the deploy log's second line, at boot
- the admin console's **العمليات** view, and every probe report header

Design rules it follows, because a plausible wrong answer here is worse than
no answer:

- absence resolves to `UNKNOWN` and names the fix — never a package version or
  a build timestamp standing in for a commit
- a value that is not commit-shaped (a branch name, an unexpanded `$VAR`) is
  rejected rather than displayed
- an unresolved build is carried onto the console's **knowledge boundary** — a
  blind spot on the map rather than a blank row, which every operator reads as
  fine
- a *resolved* build gets no status chip. Knowing which commit runs is not a
  judgement that the commit is good.

Every probe report is now stamped with the build that produced it. Two runs
with the same evidence and different builds are two experiments; with the same
build, they are a reproduction. Until now the reader could not tell which they
were holding — which is exactly how this investigation started.

---

## 6. What is still not known

```text
✗ the deployed SHA — until someone reads it from the running process
✗ ACCOUNT_CAMPAIGN_COUNT / ACCOUNT_ADSET_COUNT / ACCOUNT_AD_COUNT
      instrumented, not yet observed: no egress from this environment
      to graph.facebook.com, and no DATABASE_URL to resolve a token
✗ whether the account has ad sets at all
✗ which of hypotheses 5–8 is the live one
✗ everything the ladder already said was unknown after Round 1
      AVAILABLE ✓ → POPULATED ? → VARIABLE ? → DISCRIMINATIVE ? → DECISION-USEFUL ?
```

Round 2 has **not** been run. Nothing in this commit changes any capability
verdict, and `META_CAPABILITY_ROUND1.md` remains the only observed evidence.

## 7. The order the next steps must happen in

1. Deploy. Then read `GET /api/health` and confirm `build.shortCommit` matches
   the commit you expect. **If it does not, stop there** — every probe run
   before that point is evidence about an unknown build.
2. Run the probe once. Read **§0 of the report** first: it now states the
   three account counts and the full discovery trace.
3. Only then read the capability verdicts. Every `NOT_TESTED` traces back to
   §0, and §0 will now say which of hypotheses 5–8 was true.
