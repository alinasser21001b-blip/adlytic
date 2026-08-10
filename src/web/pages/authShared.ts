// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/authShared.ts  —  Shared auth page styles & logo
// ════════════════════════════════════════════════════════════════════════

// The mark, in Daylight.
//
// It used to be a #100E0D square with a gold rule inside it — correct on
// the old dark shell, and a black box on the light one. The geometry is
// untouched; only the two gradients and the plate colour moved.
//
// The plate is --accent (#0E4034) and the rule on it is --signal
// (#C8F26B) at 9.1:1. This is the one place the lime is unconditionally
// right: the token's rule is "on the brand ground, at most once per
// screen", and the logo is the brand ground and appears exactly once.
//
// Colours are literal rather than var(): this SVG is inlined into pages
// that render before the stylesheet resolves, and a mark that flashes
// black is the bug being fixed.
// idPrefix must be unique per call on a page. The auth pages render the mark
// twice — once in the desktop brand panel, once in the mobile header — and
// both used to default to "logo". Duplicate gradient IDs are not merely
// untidy: url(#logo-fill) binds to the FIRST match in document order, which
// on a phone is the copy inside `.auth-brand { display: none }`, and a paint
// server in a display:none subtree resolves to nothing. The visible mark
// rendered as a bare plate with no triangle inside it. Measured, not
// assumed — a two-case probe in Chromium renders the duplicate blank and the
// unique-id copy correctly.
//
// Defaulting to `logo-${size}` makes the two existing calls distinct on their
// own; the call sites also pass explicit names so the constraint is visible
// at the point where it can be violated.
export function logoSvg(size: number, idPrefix = `logo-${size}`): string {
  const ring = `${idPrefix}-ring`;
  const fill = `${idPrefix}-fill`;
  const glow = `${idPrefix}-glow`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" class="adlytic-logo-svg" aria-hidden="true">
  <defs>
    <linearGradient id="${ring}" x1="0" y1="0" x2="120" y2="120" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#0E4034"/>
      <stop offset="50%" stop-color="#17714F"/>
      <stop offset="100%" stop-color="#0E4034"/>
    </linearGradient>
    <linearGradient id="${fill}" x1="30" y1="20" x2="90" y2="100" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#D8F58C"/>
      <stop offset="45%" stop-color="#C8F26B"/>
      <stop offset="100%" stop-color="#A9D94E"/>
    </linearGradient>
    <filter id="${glow}" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="3.5"/>
    </filter>
  </defs>
  <rect x="3" y="3" width="114" height="114" rx="28" stroke="url(#${ring})" stroke-width="2.5" fill="none" opacity="0.55"/>
  <rect x="10" y="10" width="100" height="100" rx="22" fill="#0E4034"/>
  <rect x="10" y="10" width="100" height="100" rx="22" fill="url(#${fill})" opacity="0.06"/>
  <path d="M34 88 L60 28 L86 88 Z" fill="url(#${fill})" filter="url(#${glow})" opacity="0.12"/>
  <path d="M38 82 L60 34 L82 82 Z" stroke="url(#${fill})" stroke-width="2.2" fill="none" stroke-linejoin="round"/>
  <path d="M48 68 L72 68" stroke="url(#${fill})" stroke-width="2.5" stroke-linecap="round" opacity="0.85"/>
  <circle cx="60" cy="52" r="3.5" fill="url(#${fill})" opacity="0.9"/>
</svg>`;
}

export const AUTH_STYLES = `
/* ── Auth page layout ────────────────────────────────────────────────── */
body {
  margin: 0; padding: 0;
  background: var(--bg);
  min-height: 100vh;
  overflow-x: hidden;
}

.auth-ambient {
  position: fixed; top: -40%; right: -20%;
  width: 80vw; height: 80vw;
  max-width: 700px; max-height: 700px;
  background: radial-gradient(circle, var(--accent-dim) 0%, transparent 70%);
  pointer-events: none;
  z-index: 0;
}

.auth-page {
  display: flex;
  min-height: 100vh;
  position: relative;
  z-index: 1;
}

/* ── Brand panel (left on desktop) ───────────────────────────────────── */
.auth-brand {
  flex: 0 0 44%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px;
  position: relative;
  overflow: hidden;
  background:
    linear-gradient(135deg, var(--accent-dim) 0%, transparent 60%),
    var(--bg);
  border-left: 1px solid var(--border);
}
.auth-brand::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    radial-gradient(circle at 25% 35%, var(--accent-glow) 0%, transparent 50%),
    radial-gradient(circle at 75% 75%, var(--accent-dim) 0%, transparent 40%);
  pointer-events: none;
}

.auth-brand-inner {
  position: relative;
  max-width: 360px;
}
.auth-brand-inner .auth-logo-svg,
.auth-brand-inner .adlytic-logo-svg {
  margin-bottom: 28px;
}
.auth-brand-title {
  font-family: var(--font-display);
  font-size: 38px;
  font-weight: 700;
  color: var(--text);
  letter-spacing: -1px;
  margin: 0 0 8px;
}
.auth-brand-tagline {
  font-size: 15px;
  color: var(--text-2);
  margin: 0 0 48px;
  line-height: 1.7;
}

/* Feature list */
.auth-brand-features {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.auth-feature {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}
.auth-feature-icon {
  flex-shrink: 0;
  width: 36px; height: 36px;
  border-radius: 10px;
  background: var(--accent-dim);
  display: flex;
  align-items: center;
  justify-content: center;
}
.auth-feature-icon svg {
  width: 18px; height: 18px;
  color: var(--accent);
}
.auth-feature-title {
  font-size: 13.5px;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 2px;
}
.auth-feature-desc {
  font-size: 12.5px;
  color: var(--text-3);
  line-height: 1.6;
}

/* ── Form side ───────────────────────────────────────────────────────── */
.auth-form-side {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 24px;
}
.auth-form-wrap {
  width: 100%;
  max-width: 380px;
}

/* Mobile logo — hidden on desktop */
.auth-mobile-logo {
  display: none;
  align-items: center;
  gap: 12px;
  margin-bottom: 36px;
  justify-content: center;
}
.auth-mobile-logo-text {
  font-family: var(--font-display);
  font-size: 26px;
  font-weight: 700;
  color: var(--text);
  letter-spacing: -0.5px;
}

/* ── Card ─────────────────────────────────────────────────────────────── */
.auth-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 36px 32px 32px;
  /* Was a 32px black drop shadow — invented depth on a dark ground. In
     Daylight elevation is surface tint + a 1px border, nothing else. */
  box-shadow: none;
}
.auth-card-header {
  margin-bottom: 28px;
}
.auth-title {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 700;
  color: var(--text);
  margin: 0 0 6px;
}
.auth-subtitle {
  font-size: 13.5px;
  color: var(--text-3);
  margin: 0;
}

/* ── Input with icon ──────────────────────────────────────────────────── */
.input-wrap {
  position: relative;
}
.input-icon {
  position: absolute;
  top: 50%; right: 14px;
  transform: translateY(-50%);
  width: 16px; height: 16px;
  color: var(--text-3);
  pointer-events: none;
  transition: color 0.2s;
}
.form-input.has-icon {
  padding-right: 42px;
}
.input-wrap:focus-within .input-icon {
  color: var(--accent);
}
.form-input {
  transition: border-color 0.2s, box-shadow 0.2s;
}
.form-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-glow);
}

/* ── Submit button ────────────────────────────────────────────────────── */
.auth-submit {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 13px 24px;
  margin-top: 8px;
  border: none;
  border-radius: 10px;
  /* Same primary as .btn-primary in the app shell. The gold gradient
     that used to live here was the last thing telling a returning
     merchant they had landed on a different product than the one they
     log into. */
  background: var(--grad-accent);
  color: #fff;                     /* 11.7:1 on --accent */
  font-family: var(--font-body);
  font-size: 14.5px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.15s, background 0.2s, opacity 0.2s;
  box-shadow: none;
}
.auth-submit:hover {
  transform: translateY(-2px);
  background: var(--grad-accent-hover);
}
.auth-submit:active {
  transform: translateY(0);
}
.auth-submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}
.auth-submit.loading .auth-submit-arrow { display: none; }
.auth-submit-arrow {
  width: 16px; height: 16px;
  transition: transform 0.2s;
}
.auth-submit:hover .auth-submit-arrow {
  transform: translateX(-3px);
}

/* ── Alt link & footer ────────────────────────────────────────────────── */
.auth-alt {
  text-align: center;
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid var(--border);
  font-size: 13px;
  color: var(--text-3);
}
.auth-alt a {
  color: var(--accent);
  text-decoration: none;
  font-weight: 600;
  transition: color 0.15s;
}
.auth-alt a:hover { color: var(--accent-2); }

.auth-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 24px;
  font-size: 11.5px;
  color: var(--text-3);
  opacity: 0.7;
}
.auth-footer-dot {
  width: 5px; height: 5px;
  border-radius: 50%;
  background: var(--accent);
  opacity: 0.5;
}

/* ── Mobile responsive ────────────────────────────────────────────────── */
@media (max-width: 900px) {
  .auth-brand { display: none; }
  .auth-mobile-logo { display: flex; }
  .auth-form-side { padding: 24px 16px; }
  .auth-card { padding: 28px 22px 24px; }
}

@media (max-width: 380px) {
  .auth-card { border-radius: 14px; padding: 24px 18px 20px; }
  .auth-title { font-size: 20px; }
  .auth-submit { padding: 12px 20px; font-size: 14px; }
}

/* ── Error/success ────────────────────────────────────────────────────── */
#error-msg { display: none; }
#success-msg { display: none; }
`;
