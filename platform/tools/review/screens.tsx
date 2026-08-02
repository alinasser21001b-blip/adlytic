/**
 * The review's subject list is the app's own registry.
 *
 * Re-exported rather than duplicated: a screen state exists once, and both the
 * gallery and the product-rule audit read it from there. This file exists only
 * so the review tooling has a stable import path.
 */
export { SHOTS, type Shot } from "../../apps/patient/src/screens/gallery.js";
