/**
 * @dawai/observability — logging, telemetry and error reporting.
 *
 * @blueprint §8 · §5
 * @owner platform-foundation
 * @why "Every important business action must emit structured telemetry, every
 *      failure must produce actionable logs, every critical flow must be
 *      traceable end to end." This package is how that happens uniformly rather
 *      than per-service.
 */
export * from "./logger.js";
export * from "./telemetry.js";
export * from "./errors.js";
