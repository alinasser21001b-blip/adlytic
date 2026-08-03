/**
 * @dawai/design — tokens, accessibility, RTL and the screen contract.
 *
 * @blueprint §25 · §26 · §27 · §22 · §23
 * @owner platform-foundation
 * @why Stage 2. Everything a screen may use to express distance, colour, type
 *      and motion lives here, so a component never writes a raw value, and the
 *      screen contract lives here too because UX correctness is checked the
 *      same way layer boundaries are.
 */
export * from "./tokens/space.js";
export * from "./tokens/type.js";
export * from "./tokens/color.js";
export * from "./tokens/motion.js";
export * from "./a11y.js";
export * from "./rtl.js";
export * from "./arabic.js";
export * from "./ux/contract.js";
