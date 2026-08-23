// ════════════════════════════════════════════════════════════════════════
//  src/lib/mobileClient.ts
//
//  THE ONE PLACE THE iOS APP AND THE SERVER AGREE ON A LITERAL.
//
//  The Meta handshake starts in the app, runs through Facebook, and lands
//  back on the server. The server must then hand control back to the app —
//  and on iOS the only thing that closes an ASWebAuthenticationSession is a
//  redirect whose scheme the app declared before the session opened.
//
//  ── WHY THIS IS A SERVER CONSTANT AND NOT A REQUEST PARAMETER ─────────
//
//  The obvious shape would be `?redirect_uri=<whatever the caller wants>`.
//  That is an open redirect with extra steps: anyone who can reach
//  /api/meta/oauth/start could aim a completed OAuth handshake — carrying a
//  one-time session id for a Meta-linked account — at a destination they
//  chose. So the caller does not get to name a destination. It gets to name
//  a CHANNEL ('ios'), and the server owns the URL that channel resolves to.
//
//  There is exactly one such URL, it is compiled in, and the mobile app's
//  declared scheme is asserted equal to it by test_mobile_contract.ts. If
//  someone changes one side, the build fails rather than the handshake.
// ════════════════════════════════════════════════════════════════════════

/** The iOS app's URL scheme. Must equal `expo.scheme` in mobile/app.json. */
export const MOBILE_APP_SCHEME = 'adlytic';

/** Channels /api/meta/oauth/start will accept. Anything else is web. */
export type MobileClientChannel = 'ios';

/** Recognised channel, or null. Never throws on junk input. */
export function parseClientChannel(raw: string | null | undefined): MobileClientChannel | null {
  return raw === 'ios' ? 'ios' : null;
}

/**
 * Where the OAuth callback sends an iOS caller once Meta has answered.
 *
 * Carries the SAME one-time session id the web flow carries. The id is not a
 * credential: /api/meta/oauth/accounts/:sessionId still requires a bearer
 * token AND checks that the session's userId matches the caller. Meta's own
 * access token never leaves the server in either flow.
 */
export function mobileOAuthReturnUrl(sessionId: string): string {
  return `${MOBILE_APP_SCHEME}://meta/connected?session=${encodeURIComponent(sessionId)}`;
}

/** Where a failed handshake sends an iOS caller. Reason is a short code or message. */
export function mobileOAuthErrorUrl(reason: string): string {
  return `${MOBILE_APP_SCHEME}://meta/error?reason=${encodeURIComponent(reason)}`;
}

/**
 * The payload shape stored on `oauth_states.payload` — a column the schema
 * already declares "reserved for future per-flow data". Using it is what
 * keeps this change free of a migration.
 */
// A `type`, not an `interface`, on purpose: only a type alias gets TypeScript's
// implicit index signature, and Prisma's Json input demands one. An interface
// here typechecks everywhere except the single line that writes the column.
export type OAuthStatePayload = {
  client?: MobileClientChannel;
};

/** Read the channel back off a state row's payload. Tolerates null/garbage. */
export function channelFromStatePayload(payload: unknown): MobileClientChannel | null {
  if (!payload || typeof payload !== 'object') return null;
  return parseClientChannel((payload as Record<string, unknown>)['client'] as string | undefined);
}
