#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
//  .deploy/start.js — the production start sequence, as ONE token.
//
//  WHY THIS EXISTS. railway.json used to start the service with:
//
//      npx prisma migrate deploy && node dist/src/api/serve.js
//
//  Under the Nixpacks builder that ran through a shell and both halves
//  executed. Under the Dockerfile builder it does not. The runtime log of
//  deployment 2a063356 shows exactly what happens instead:
//
//      Starting Container
//      Prisma schema loaded from prisma/schema.prisma.
//      40 migrations found in prisma/migrations
//      No pending migrations to apply.
//      Stopping Container
//
//  The migrator ran, exited 0, and the container ended — the server never
//  produced a single byte, not even its config banner. The start string is
//  being split into an argv array rather than handed to a shell, so `npx`
//  receives `prisma migrate deploy && node dist/src/api/serve.js` as its
//  arguments; Prisma parses `migrate deploy`, ignores the rest, and returns.
//  The healthcheck then fails, and Railway correctly refuses to promote the
//  deployment — which is why production stayed up on the previous build.
//
//  The fix is to remove the shell metacharacter from the start command
//  entirely. `node .deploy/start.js` is four tokens with no `&&`, `;` or
//  quoting, so it behaves identically whether the platform runs it through a
//  shell or execs it directly. That is the property worth having: not "this
//  works on Railway today" but "this cannot depend on how the command is
//  interpreted".
//
//  Ordering is unchanged and deliberate: migrations first, and the server
//  only if they succeeded. A server that boots against an unmigrated schema
//  is worse than one that does not boot.
// ════════════════════════════════════════════════════════════════════════

'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

// stdio:'inherit' so the migrator's own output still reaches the deployment
// log — verify-live.yml reads those lines for NO_PENDING_MIGRATIONS, and a
// migration state nobody can observe is not a migration state anybody trusts.
const migrate = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
  cwd: repoRoot,
  stdio: 'inherit',
  env: process.env,
});

if (migrate.error) {
  console.error('[adlytic:start] could not run the migrator:', migrate.error.message);
  process.exit(1);
}
if (migrate.status !== 0) {
  console.error(`[adlytic:start] prisma migrate deploy exited ${migrate.status} — not starting the server`);
  process.exit(migrate.status ?? 1);
}

// Same process, not a child: the server becomes this PID, so Railway's stop
// signal reaches it directly and the drain/overlap settings in railway.json
// mean what they say. serve.js is CommonJS (tsconfig module: commonjs).
require(path.join(repoRoot, 'dist', 'src', 'api', 'serve.js'));
