# Research — what the sources allow Adlytic Check to say

Registry: [`research/sources.json`](../../research/sources.json) (22 entries, `registryVersion 2026-10-19.1`).
Rules: [`research/rules.json`](../../research/rules.json) (18 rules, `kb-2026-10-19.1`, `rubric-1`).

## How sources were read
The session that wrote this cannot reach most publishers, so a read-only CI job
(`.github/workflows/adlytic-check-research.yml`) fetched each URL and printed a bounded excerpt
with HTTP status, final URL and a sha256 of the body. Nothing was copied into the repository.

| Access | Meaning | Sources |
|---|---|---|
| `full_text` | the relevant section was fetched and read | S01, S02, S07, S10–S17, S21 |
| `search_excerpt` | publisher blocks automated fetching (Meta: HTTP 400; ZainCash: Cloudflare challenge 403) or paywalled; only search-engine excerpts read | S03–S06, S08, S09, S18–S20 |

`verification: unverified_secondary` marks claims about Meta guidance that we could only read
through practitioner sites. Those rules are `evidenceStrength: weak` and phrased as checks, never
as Meta rules. `publishedAt` is null wherever the date was not seen on the source itself.

## Findings that shape the product

1. **No performance prediction (S02, S01).** Fifteen large Facebook RCTs showed observational
   methods often fail to recover true ad effects. A content review has even less information, so
   the report never predicts orders, CTR or cost, and never claims knowledge of Meta's retrieval
   or ranking (Andromeda is an internal retrieval stage; the engineering post gives no creative
   rules). When the owner wants to know which version works, the report suggests Meta's A/B test
   (S06) — that is why V2 produces alternate openings.
2. **What a content check *can* judge (S07, S08, S10).** Is the product visible and named, does
   the opening give a reason to continue, can key text be read on a phone (size, contrast), is the
   ordering method explicit for the chosen goal. These are observable in the submission and map to
   rubric dimensions with evidence links.
3. **Video (S03, S07, S09).** Feed video is often watched muted → the core message must survive
   sound-off (captions/on-screen text). Show the product early; brief repeated brand appearances
   beat one long logo slate (TV evidence, so `inference`).
4. **Vertical safe zones (S04).** Secondary guides consistently report ~14 % top / ~35 % bottom
   margins for 9:16 Reels, but disagree on the bottom value (20–40 %). V2 only says text near the
   edges *may* be covered and points to the Ads Manager preview.
5. **Image text amount (S05).** The 20 % rule is no longer enforced; heavy text is flagged only as
   a readability issue.

## Findings that shape the architecture

| Topic | Finding | Consequence |
|---|---|---|
| Worker limits (S11) | 128 MB memory; Free plan 10 ms CPU/request | no video decoding in the Worker |
| Containers (S13) | Workers Paid only | not used in V2 (account plan unknown) |
| Queues (S13) | 128 KB messages | media cannot travel through a queue |
| Browser APIs (S21) | `decodeAudioData`, canvas frame capture | frames + audio extracted on the device |
| Workers AI Whisper (S12) | $0.000513/audio-minute, segment timestamps, 10k free Neurons/day | ASR for video audio |
| OIDC (S15, S16) | state + nonce + PKCE, exact redirect URI, `sub` as identity | Google login design |
| SSRF (S17) | validate after DNS resolution, re-check every redirect, block private v4/v6 | direct-file link import |
| ZainCash v2 (S18) | OAuth2 client credentials; init → redirect JWT → inquiry; webhook production-only | redirect is never trusted alone; inquiry verifies |
| ZainCash fees (S19) | Small Projects wallet 1 % min 500 IQD; Merchant wallet 0.6 % min 150 IQD | a single 500 IQD payment can cost 500 IQD in fees → bundles |
| Instagram (S20) | oEmbed needs App Review and no longer returns thumbnails; Business Discovery needs a user token + permissions | Instagram links: AUTH_REQUIRED/UNSUPPORTED, no scraping |

## Gaps (honest)
- ZainCash webhook signature scheme and minimum transaction amount: not confirmed.
- Meta's own Reels safe-zone numbers and current image-text wording: not read first-hand.
- Arabic (Iraqi dialect) ASR accuracy of Whisper: unknown until measured on fixtures.
