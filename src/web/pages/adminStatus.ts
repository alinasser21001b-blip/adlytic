// ════════════════════════════════════════════════════════════════════════
//  src/web/pages/adminStatus.ts
//
//  ONE status vocabulary for every admin surface.
//
//  The platform draws careful distinctions and then risks throwing them away
//  at the last inch. UNKNOWN is not HEALTHY. NOT_TESTED is not FAILED.
//  NOT_VETOED is not RECOMMENDED. NOT_GOVERNED is not PERMITTED. NOT_REACHED
//  is not a neutral conclusion. Each pair is a different claim, and rendering
//  either member in the same colour destroys the distinction the engines spent
//  their effort preserving.
//
//  ── Rules encoded here, not left to each page ─────────────────────────
//
//  · Absence (UNKNOWN / NOT_TESTED / NOT_REACHED / NOT_GOVERNED /
//    INSUFFICIENT_DATA) is always DASHED and muted. It never borrows the
//    colour of a verdict, in either direction.
//  · FAILED is solid red; UNKNOWN is never red. "We could not tell" must not
//    read as "it is broken", or operators learn to ignore red.
//  · Colour is never the only signal — every state carries a distinct glyph
//    and its own literal name, so the meaning survives greyscale,
//    colour-blindness, and a screenshot pasted into a ticket.
//
//  This module renders. It decides nothing: callers pass a state the server
//  already resolved.
// ════════════════════════════════════════════════════════════════════════

/** The complete admin status vocabulary. */
export type AdminStatus =
  // ── operational health ──
  | 'HEALTHY' | 'DEGRADED' | 'FAILED'
  // ── absence of knowledge ──
  | 'UNKNOWN' | 'NOT_TESTED' | 'INSUFFICIENT_DATA'
  // ── Meta capability ──
  | 'AVAILABLE' | 'UNAVAILABLE' | 'NOT_GRANTED' | 'CRITERION_INVALIDATED'
  // ── action authority ──
  | 'RECOMMENDED' | 'NOT_VETOED' | 'FORBIDDEN' | 'NOT_GOVERNED'
  // ── reasoning trace ──
  | 'REACHED' | 'NOT_REACHED';

/** How a state is drawn. `tone` maps to CSS; `glyph` survives greyscale. */
interface StatusStyle {
  glyph: string;
  tone: 'ok' | 'warn' | 'bad' | 'absent' | 'info';
  /** Dashed borders mark ABSENCE — never a verdict. */
  absence: boolean;
  labelAr: string;
}

const STATUS: Record<AdminStatus, StatusStyle> = {
  HEALTHY:               { glyph: '●', tone: 'ok',     absence: false, labelAr: 'سليم' },
  DEGRADED:              { glyph: '▲', tone: 'warn',   absence: false, labelAr: 'متدهور' },
  FAILED:                { glyph: '■', tone: 'bad',    absence: false, labelAr: 'فاشل' },

  // Absence. Muted and dashed — never green, never red.
  UNKNOWN:               { glyph: '◌', tone: 'absent', absence: true,  labelAr: 'غير معروف' },
  NOT_TESTED:            { glyph: '○', tone: 'absent', absence: true,  labelAr: 'لم يُختبر' },
  INSUFFICIENT_DATA:     { glyph: '◔', tone: 'absent', absence: true,  labelAr: 'بيانات غير كافية' },

  AVAILABLE:             { glyph: '●', tone: 'ok',     absence: false, labelAr: 'متاح' },
  UNAVAILABLE:           { glyph: '■', tone: 'bad',    absence: false, labelAr: 'غير متاح' },
  NOT_GRANTED:           { glyph: '▲', tone: 'warn',   absence: false, labelAr: 'غير ممنوح' },
  CRITERION_INVALIDATED: { glyph: '◌', tone: 'absent', absence: true,  labelAr: 'المعيار ساقط' },

  RECOMMENDED:           { glyph: '★', tone: 'ok',     absence: false, labelAr: 'موصى به' },
  // Absence of a veto is NOT an endorsement — dashed, muted, never starred.
  NOT_VETOED:            { glyph: '○', tone: 'absent', absence: true,  labelAr: 'غير ممنوع' },
  FORBIDDEN:             { glyph: '■', tone: 'bad',    absence: false, labelAr: 'ممنوع' },
  // Absence of jurisdiction — not a clearance.
  NOT_GOVERNED:          { glyph: '◌', tone: 'absent', absence: true,  labelAr: 'خارج الصلاحية' },

  REACHED:               { glyph: '●', tone: 'info',   absence: false, labelAr: 'تم الوصول' },
  NOT_REACHED:           { glyph: '◌', tone: 'absent', absence: true,  labelAr: 'لم يُبلَغ' },
};

/** States that assert absence of knowledge rather than a verdict. */
export const ABSENCE_STATES: AdminStatus[] =
  (Object.keys(STATUS) as AdminStatus[]).filter((k) => STATUS[k].absence);

/**
 * Pairs that must never render identically. Each is a real conflation the
 * product has already made once; the test asserts the styles differ.
 */
export const MUST_DIFFER: Array<[AdminStatus, AdminStatus]> = [
  ['UNKNOWN', 'HEALTHY'],
  ['UNKNOWN', 'FAILED'],
  ['NOT_TESTED', 'FAILED'],
  ['NOT_TESTED', 'UNAVAILABLE'],
  ['NOT_VETOED', 'RECOMMENDED'],
  ['NOT_GOVERNED', 'AVAILABLE'],
  ['NOT_REACHED', 'REACHED'],
  ['INSUFFICIENT_DATA', 'HEALTHY'],
];

/** The CSS every admin surface includes once. */
export const ADMIN_STATUS_CSS = `
  .st-chip { display:inline-flex; align-items:center; gap:5px; padding:2px 8px; border-radius:6px;
             font-size:11px; font-weight:700; white-space:nowrap; letter-spacing:0.02em; }
  .st-chip .st-glyph { font-size:10px; line-height:1; }
  .st-ok     { background:var(--success-dim); color:var(--success); border:1px solid var(--success); }
  .st-warn   { background:var(--warning-dim); color:var(--warning); border:1px solid var(--warning); }
  .st-bad    { background:var(--error-dim);   color:var(--error);   border:1px solid var(--error); }
  .st-info   { background:var(--accent-dim);  color:var(--accent);  border:1px solid var(--accent); }
  /* ABSENCE: dashed and muted. Never green, never red. */
  .st-absent { background:transparent; color:var(--text-3); border:1px dashed var(--text-3); }
`;

/**
 * Render one status chip.
 *
 * @param note optional short qualifier, e.g. which check produced it.
 */
export function statusChip(status: AdminStatus, note?: string): string {
  const s = STATUS[status];
  const suffix = note ? ` <span style="font-weight:500;opacity:0.8;">${note}</span>` : '';
  return `<span class="st-chip st-${s.tone}" title="${status}">`
    + `<span class="st-glyph">${s.glyph}</span>${s.labelAr}${suffix}</span>`;
}

/** Test seam: the resolved style for a state. */
export function statusStyle(status: AdminStatus): StatusStyle {
  return STATUS[status];
}
