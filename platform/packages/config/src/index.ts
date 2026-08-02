/**
 * @dawai/config — environment, secrets and feature flags.
 *
 * @blueprint §3 · D40
 * @owner platform-foundation
 * @why Blueprint v3 §3 lists five prerequisites that must exist before the
 *      first request — one of them is that the launch district is named in
 *      configuration BEFORE the first pharmacy is verified (D40). A
 *      configuration layer that lets the process start without it would turn
 *      an architectural constraint into a hope.
 */
export * from "./env.js";
export * from "./secrets.js";
export * from "./flags.js";
