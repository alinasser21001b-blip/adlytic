/**
 * Shared domain primitives.
 *
 * @blueprint §2 · §5 · §6
 * @owner platform-foundation
 * @why A single import surface for the primitives every bounded context uses,
 *      so a context never reaches into another context's internals.
 */
export * from "./result.js";
export * from "./refusal.js";
export * from "./instant.js";
export * from "./ids.js";
export * from "./machine.js";
