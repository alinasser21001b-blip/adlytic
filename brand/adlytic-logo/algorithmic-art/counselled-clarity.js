/**
 * Counselled Clarity — generative algorithm reference
 * Embedded in counselled-clarity.html; this file documents the core system
 * for handoff / review without opening the full viewer.
 *
 * Conceptual DNA: Adlytic advises through an aperture; it never spends.
 */
const CounselledClarityDefaults = {
  seed: 42107,
  particleCount: 2800,
  apertureWidth: 18,
  counselDrift: 0.35,
  noiseScale: 0.004,
  settleRate: 0.06,
  signalScarcity: 0.12,
  colorPalette: ['#0E4034', '#F2F7F4', '#C8F26B'],
};

/**
 * Particle rule (summary):
 * 1. Spawn at edges with seeded randomness.
 * 2. Drift toward a vertical counsel axis with long-wavelength noise.
 * 3. Only scarce "signal" particles may remain inside the aperture slit.
 * 4. Others deflect — selection with restraint, not automation.
 * 5. System cools to equilibrium; no climax frame.
 */
module.exports = { CounselledClarityDefaults };
