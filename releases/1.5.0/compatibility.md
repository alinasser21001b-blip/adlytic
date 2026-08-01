<!-- GENERATED FROM release-manifest.yaml — DO NOT EDIT BY HAND -->
# Compatibility Report — Dawai Platform 1.5.0

Status: **Candidate — verification incomplete**
Manifest: `release-manifest.yaml` (schema 1)
Policy: 1.0.0
Release: `platform-1.5.0` · candidate
Verification: 2/7 gates passing

| Domain | Supported version | Current | Result |
|---|---|---|---|
| UI System | `1.5.x` | `1.5.0` | Pending |
| API Contracts | `1.3.x` | `1.3.0` | Pending |
| interaction-check | `2.1.x` | `2.1.0` | Pending |
| safety-alert | `3.0.x` | `3.0.0` | Pending |
| dispense | `1.2.x` | `1.2.0` | Pending |
| medication-timeline | `1.0.x` | `1.0.0` | Pending |
| adherence | `1.1.x` | `1.1.0` | Pending |
| inventory-observation | `1.0.x` | `1.0.0` | Pending |
| Knowledge Base | `2026.08.1` | `2026.08.1` | Pending |
| Evidence Schema | `1.0.0` | `1.0.0` | Pending |
| Runtime Flags | `flags-2026-08-02-01` | `—` | Pending |

## Governing constraint

A clinical output is valid only when code, contract, knowledge, evidence,
verification, and runtime configuration reference mutually compatible,
approved versions. Every number above is read from the manifest; none of it
is maintained by hand.
