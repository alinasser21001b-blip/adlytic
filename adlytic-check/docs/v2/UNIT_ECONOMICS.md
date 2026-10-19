# Unit economics (per check)

All prices in integer IQD. USD figures use the provider's USD prices; the IQD conversion uses the
Central Bank of Iraq official rate of **1,310 IQD/USD** (verify before relying on it).

## Cost of one analysis (measured, research benchmark)
| Engine / model | Calls per check | Tokens in/out per call | Cost per call | ≈ IQD |
|---|---|---|---|---|
| V1, `claude-haiku-4-5` (baseline, 45 s / 3 000 tokens) | 1.67 incl. repairs | 3.5k / 2.05k | $0.0137 | ~18 |
| V1, `claude-haiku-4-5` (4 096 tokens, 60 s) | 1.06 | 1.9k / 1.1k* | ~$0.0074* | ~10 |
| V2, `claude-haiku-5-5` | 1.63 (33 % schema repairs before cycle-4 fixes) | 5.9k / 2.1k | **price not verified** | — |

\*Partial run (the provider account ran out of credit mid-run, blocker B0).
Pricing for `claude-haiku-4-5` is $1 / $5 per million input/output tokens. A secondary source
reports $0.10 / $0.50 for `claude-haiku-5-5`; not verified on Anthropic's page, so not used.

Conservative planning figure: **~$0.02 (≈ 26 IQD) per check**, repairs included.

## Free tier
2 checks on activation, +1 per 24 h, cap 2 → at most ~31 free checks per account per month,
≈ $0.62 (≈ 810 IQD) if fully used. The service-wide ceiling `MAX_PROVIDER_CALLS_PER_DAY=100`
caps total provider spend at ~$2/day whatever the traffic.

## Paid checks — 500 IQD each
ZainCash's published gateway fee per payment (research S19, not our tariff):
Small Projects wallet 1 % min 500 IQD; Merchant/Company wallet 0.6 % min 150 IQD.

| Purchase | Price | Fee (Small Projects) | Fee (Merchant) | Net per check (Small Projects) | Net per check (Merchant) |
|---|---|---|---|---|---|
| 1 check | 500 | 500 (100 %) | 150 (30 %) | **0** | 350 |
| 5 checks | 2,500 | 500 (20 %) | 150 (6 %) | 400 | 470 |
| 10 checks | 5,000 | 500 (10 %) | 150 (3 %) | 450 | 485 |

Minus ~26 IQD provider cost per check. Hence the single-check purchase is **hidden by default**
(`SINGLE_UNIT_PURCHASE=false`) and the UI states why; the price per check stays 500 IQD in every
bundle. With a Merchant wallet the owner may turn single purchases on.

Not included: Cloudflare plan cost (Workers Free/Paid not visible from here), refunds/chargebacks,
taxes.
