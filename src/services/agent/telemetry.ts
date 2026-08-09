// ════════════════════════════════════════════════════════════════════════
//  src/services/agent/telemetry.ts — where tool-call events actually go.
//
//  THE BUG THIS CLOSES
//  DispatcherOptions.onCall was fully implemented, and emit() fires on every
//  dispatch path — success, cached, and each of the four failure codes. But
//  emit() opens with `if (!this.onCall) return;` and all THREE construction
//  sites passed only two arguments, so `options` defaulted to `{}`, `onCall`
//  was never assigned, and every event was discarded.
//
//  The result in production: zero agent tool telemetry. No record of which
//  tools Claude reaches for, how often they time out, how often the cache
//  saves a call, or which workspace is hitting the rate limiter. The code to
//  collect all of it was already written and simply never connected.
//
//  Found in an external architecture review of src/services/agent/, and
//  verified here before fixing: onCall at dispatcher.ts:59, the early return
//  at :217, and the three sites at loop.ts:137, investigate.ts:77 and
//  server.ts:3993 each passing two args.
//
//  WHY A SHARED SINK rather than three inline callbacks: three copies drift.
//  One of them ends up logging a different shape, and the field you need
//  during an incident is the one that site omitted.
//
//  WHY console AND NOT A TABLE: there is no telemetry table in the schema,
//  and inventing one is a migration plus a retention policy plus a growth
//  problem — a decision that belongs to whoever owns observability, not to
//  a bug fix. Railway captures stdout, so structured lines are queryable
//  today, and swapping this body for a repository write later touches one
//  function.
// ════════════════════════════════════════════════════════════════════════

import type { DispatcherEvent } from './dispatcher';

/**
 * One tool call, one structured line.
 *
 * `argsHash` travels, the arguments themselves never do — a tool call can
 * carry a campaign name or an account id, and telemetry is not a place to
 * put customer data. The hash is enough to spot the same call repeating.
 */
export function logToolCall(event: DispatcherEvent): void {
  // Deliberately not JSON.stringify(event): an added field on DispatcherEvent
  // would start appearing in logs without anyone deciding it should.
  const parts = [
    `tool=${event.toolName}`,
    `status=${event.status}`,
    `ms=${event.executionMs}`,
    `ws=${event.workspaceId}`,
    `args=${event.argsHash || '-'}`,
  ];
  if (event.errorCode) parts.push(`error=${event.errorCode}`);

  // Failures are the ones worth finding in a log search; the rest is volume.
  const line = `[agent-tool] ${parts.join(' ')}`;
  if (event.status === 'failure') console.warn(line);
  else console.log(line);
}
