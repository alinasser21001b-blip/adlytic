// ════════════════════════════════════════════════════════════════════════
//  src/observability/log.ts — enough client observability to answer the
//  Alpha questions ("did login succeed? which API failed? which build?"),
//  and NEVER a place a secret can reach.
//
//  There is no crash-reporting SDK wired up in Alpha (none is configured
//  server-side either — no Sentry DSN in .env.example) — adding one would be
//  a new third-party data flow this mission was not asked to open. This
//  logs to the console, which Xcode/TestFlight organizer crash logs and
//  `expo start` both surface, and posts the same shape to the backend's
//  existing unauthenticated POST /api/client-errors, which already exists
//  for the web client and already rate-limits by IP.
//
//  RULE: a log line may name a PATH, a KIND, a STATUS, a SCREEN. It may
//  never carry a header, a token, a request/response body, or an email.
// ════════════════════════════════════════════════════════════════════════
import Constants from 'expo-constants';
import { Platform } from 'react-native';

const BUILD =
  `${Constants.expoConfig?.version ?? '0.0.0'}+${Constants.expoConfig?.ios?.buildNumber ?? '0'}`;

type Event =
  | { kind: 'app_launch' }
  | { kind: 'login_success' }
  | { kind: 'login_failure'; reason: string }
  | { kind: 'meta_reconnect_start' }
  | { kind: 'meta_reconnect_result'; ok: boolean }
  | { kind: 'screen_crash'; screen: string }
  | { kind: 'api_failure'; path: string; apiKind: string; status: number | null };

function redactPath(path: string): string {
  // Strip query strings (a session id can ride in ?session=) and collapse
  // path segments that look like ids/tokens so a log line never becomes a
  // secret carrier by accident.
  const noQuery = path.split('?')[0];
  return noQuery.replace(/[0-9a-fA-F-]{16,}/g, ':id');
}

export function logEvent(event: Event): void {
  // eslint-disable-next-line no-console
  console.log(`[adlytic:${Platform.OS}:${BUILD}]`, JSON.stringify(event));
}

export function logApiFailure(e: { path: string; kind: string; status: number | null }): void {
  logEvent({ kind: 'api_failure', path: redactPath(e.path), apiKind: e.kind, status: e.status });
  // Best-effort, fire-and-forget — an observability call must never itself
  // become a reason the app hangs or throws.
  void fetch(`${(Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ?? ''}/api/client-errors`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: `ios-app:${redactPath(e.path)}`,
      errors: [{ msg: `${e.kind} status=${e.status ?? 'n/a'}`, src: BUILD, line: 0 }],
    }),
  }).catch(() => {});
}
