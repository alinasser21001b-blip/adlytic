/**
 * @dawai/domain — the whole of the business.
 *
 * @blueprint §2 · §6 · §7 · §8 · §9
 * @owner platform-foundation
 * @why Rule 3 places every business rule here and nowhere else. This package
 *      imports no Node built-in, performs no I/O, reads no clock and generates
 *      no randomness — enforced by tools/layer-check.mjs — so every rule is
 *      deterministic and independently testable, which is Rule 7.
 */
export * from "./shared/index.js";

export * as Marketplace from "./marketplace/rules.js";
export * as MarketplaceMachines from "./marketplace/machines.js";
export * as Clinical from "./clinical/gates.js";
export * as Authority from "./identity/authority.js";
export * as Family from "./identity/family.js";
export * as IdentityMachines from "./identity/machines.js";
export * as Verification from "./identity/verification.js";
export * as PharmacyMachines from "./pharmacy/machines.js";
