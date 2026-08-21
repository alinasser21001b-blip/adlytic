// ════════════════════════════════════════════════════════════════════════
//  src/lib/buildIdentity.ts
//
//  WHICH COMMIT IS ACTUALLY RUNNING?
//
//  This module exists because that question was unanswerable. The only
//  identity the service published was `version: '0.1.0'` in /api/health — a
//  string literal that has been byte-identical across every deploy since the
//  repository was created. It cannot distinguish two builds, so it cannot
//  answer the one question it looks like it answers.
//
//  The cost of that silence was concrete: a probe run produced evidence, the
//  runner was then changed, the probe was run again, and there was no way to
//  tell whether the second run exercised the new code or the old. Git history
//  says what was PUSHED. It says nothing about what is EXECUTING. A deploy
//  can be skipped, queued, failed, rolled back, or pinned, and in every one of
//  those cases the two diverge silently.
//
//  DESIGN RULE: absence is reported as absence.
//  If the platform did not inject a commit, this returns `UNKNOWN` and says
//  why. It never falls back to a package version, a build timestamp, or
//  anything else that would LOOK like an answer — a plausible-looking wrong
//  SHA is worse than no SHA, because it ends the investigation.
//
//  This is the only place in the codebase that reads the platform's
//  deployment-metadata env vars. They are not application configuration
//  (config.ts owns that); they are facts about the running artifact.
// ════════════════════════════════════════════════════════════════════════

export interface BuildIdentity {
  /** Full commit SHA, or null when the platform injected nothing. */
  commit: string | null;
  /** First 7 characters — what a human compares against `git log`. */
  shortCommit: string | null;
  branch: string | null;
  /** Commit subject line, when the platform provides it. */
  message: string | null;
  /** The platform's own id for this deployment, when available. */
  deploymentId: string | null;
  /** Which env var the commit came from — provenance, not decoration. */
  source: string | null;
  /** Process start time. NOT a build time; it moves on every restart. */
  bootedAt: string;
  /**
   * True only when a real commit was resolved. When false, every consumer
   * must say "unknown", never "current".
   */
  resolved: boolean;
}

/**
 * Env vars that carry a commit, most authoritative first.
 *
 * Railway injects RAILWAY_GIT_COMMIT_SHA on any deploy originating from a
 * connected repository. The rest are here so the same surface keeps working
 * under a different host or a local `docker build --build-arg` without anyone
 * having to remember to change this file — the failure mode of a
 * host-specific lookup is that the health endpoint quietly reverts to
 * "unknown" after a migration, which is exactly the silence being fixed.
 */
const COMMIT_KEYS = [
  'ADLYTIC_BUILD_COMMIT',      // explicit override, wins over everything
  'RAILWAY_GIT_COMMIT_SHA',    // Railway
  'SOURCE_VERSION',            // Heroku / Render
  'VERCEL_GIT_COMMIT_SHA',
  'GITHUB_SHA',                // CI-built images
  'GIT_COMMIT',
] as const;

const BRANCH_KEYS = [
  'ADLYTIC_BUILD_BRANCH',
  'RAILWAY_GIT_BRANCH',
  'VERCEL_GIT_COMMIT_REF',
  'GITHUB_REF_NAME',
  'GIT_BRANCH',
] as const;

const MESSAGE_KEYS = [
  'RAILWAY_GIT_COMMIT_MESSAGE',
  'VERCEL_GIT_COMMIT_MESSAGE',
] as const;

const DEPLOYMENT_KEYS = [
  'RAILWAY_DEPLOYMENT_ID',
  'RAILWAY_SERVICE_ID',
  'VERCEL_DEPLOYMENT_ID',
] as const;

function readFirst(keys: readonly string[]): { value: string; key: string } | null {
  for (const key of keys) {
    const raw = process.env[key];
    if (typeof raw !== 'string') continue;
    const v = raw.trim();
    if (v) return { value: v, key };
  }
  return null;
}

/** A commit-shaped string: 7–40 hex characters and nothing else. */
export function isCommitShaped(v: string): boolean {
  return /^[0-9a-f]{7,40}$/i.test(v);
}

const BOOTED_AT = new Date().toISOString();

let cached: BuildIdentity | null = null;

/**
 * Resolve the running build's identity.
 *
 * Cached: the environment cannot change inside a process, and a health
 * endpoint that re-reads it on every request invites the belief that it
 * could.
 */
export function getBuildIdentity(): BuildIdentity {
  if (cached) return cached;

  const commitHit = readFirst(COMMIT_KEYS);
  // A value that is not commit-shaped is discarded rather than displayed.
  // Something like "main" or "$RAILWAY_GIT_COMMIT_SHA" in that slot is a
  // misconfiguration, and echoing it would let a human "verify" a deploy
  // against a string that is not a commit at all.
  const commit = commitHit && isCommitShaped(commitHit.value) ? commitHit.value.toLowerCase() : null;

  cached = {
    commit,
    shortCommit: commit ? commit.slice(0, 7) : null,
    branch: readFirst(BRANCH_KEYS)?.value ?? null,
    message: readFirst(MESSAGE_KEYS)?.value.split('\n')[0]?.slice(0, 200) ?? null,
    deploymentId: readFirst(DEPLOYMENT_KEYS)?.value ?? null,
    source: commit ? (commitHit?.key ?? null) : null,
    bootedAt: BOOTED_AT,
    resolved: commit !== null,
  };
  return cached;
}

/** Test seam. Never called by production code. */
export function resetBuildIdentityCache(): void {
  cached = null;
}

/**
 * One line, safe to paste into an incident thread.
 *
 * The unresolved branch names the fix rather than shrugging: an operator who
 * reads "unknown" and does not know how to make it known will simply keep
 * assuming, which returns us to the original problem.
 */
export function buildIdentityLine(b: BuildIdentity = getBuildIdentity()): string {
  if (!b.resolved) {
    return 'build=UNKNOWN (no commit injected — set ADLYTIC_BUILD_COMMIT '
      + 'or enable the platform git integration; do not infer it from git history)';
  }
  return `build=${b.shortCommit}${b.branch ? ` branch=${b.branch}` : ''}`
    + `${b.deploymentId ? ` deployment=${b.deploymentId}` : ''} booted=${b.bootedAt}`;
}
