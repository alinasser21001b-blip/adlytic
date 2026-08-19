#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════
#  .deploy/railway-deploy.sh — trigger the adlytic production deploy.
#
#  THE INVARIANT THIS FILE EXISTS TO HOLD
#
#      A GREEN DEPLOYMENT JOB MUST MEAN THE RAILWAY DEPLOYMENT TRIGGER WAS
#      ACTUALLY ATTEMPTED AND ACCEPTED.
#
#  Not "we tried". Not "nothing threw". Attempted, and accepted.
#
#  WHY IT IS WRITTEN DOWN
#  The previous version of this logic ended its missing-secret branch with
#  `exit 0`. GitHub therefore reported SUCCESS for a job that had made no
#  network call at all — the deploy step completed in zero seconds. Five
#  consecutive commits showed a green check and shipped nothing, and the
#  divergence was only found by measuring API call counts from a completely
#  different subsystem. That is the worst shape a defect can take: it does not
#  merely fail, it reports the opposite of what happened, so every downstream
#  investigation starts from a false premise.
#
#      DEPLOY_NOT_ATTEMPTED  is not  DEPLOY_SUCCEEDED
#      DEPLOY_ATTEMPTED      is not  DEPLOY_ACCEPTED
#
#  Both distinctions are enforced below, and both are exercised by
#  test_deploy_gate.ts, which RUNS this script against a stubbed curl rather
#  than grepping it for the string "exit 1". A test that reads the source
#  proves what the file says; only executing it proves what the file does.
#
#  This script lives outside the workflow YAML for exactly that reason.
#
#  IT NEVER PRINTS THE TOKEN. The Authorization header is passed via a
#  @-file so it cannot appear in a process listing either.
# ════════════════════════════════════════════════════════════════════════
set -euo pipefail

# ── Deployment target. DO NOT CHANGE. ──────────────────────────────────
# Pinned byte-for-byte by test_deploy_gate.ts: a deploy script that can be
# edited to point somewhere else without a test objecting is not a safety
# mechanism. Changing any of these four values is a deliberate act that must
# update the test in the same commit.
RAILWAY_API="https://backboard.railway.app/graphql/v2"
SERVICE_ID="cc7cbf67-d757-4018-bf6d-9cec643222c3"
ENVIRONMENT_ID="89cdf3cb-15b7-4b92-b1ae-07e812333c37"
LATEST_COMMIT="true"

# ── 1. The secret must exist. A missing secret is a FAILURE. ───────────
# Whitespace counts as missing. A secret set to a blank or space-only value
# would otherwise pass a bare -z check and go on to send "Bearer    " —
# failing later, as a 401, under the wrong headline. "The secret is not set"
# and "Railway rejected our credentials" send an operator to different places.
#
# Leading/trailing only. Stripping ALL whitespace would silently mutate a
# secret that legitimately contained some, turning a working token into a 401
# — swapping one misleading failure for another.
RAILWAY_TOKEN="${RAILWAY_TOKEN:-}"
RAILWAY_TOKEN="${RAILWAY_TOKEN#"${RAILWAY_TOKEN%%[![:space:]]*}"}"
RAILWAY_TOKEN="${RAILWAY_TOKEN%"${RAILWAY_TOKEN##*[![:space:]]}"}"
if [ -z "$RAILWAY_TOKEN" ]; then
  echo "::error title=Deploy not attempted::RAILWAY_TOKEN is not set — no deployment was triggered."
  echo ""
  echo "This job fails deliberately. It previously exited 0 here, which reported"
  echo "SUCCESS for a deploy that never happened."
  echo ""
  echo "Fix it one of two ways:"
  echo "  1. Set the GitHub secret RAILWAY_TOKEN (Railway account token, No Team)."
  echo "  2. Deploy by hand: Railway UI -> adlytic -> Deploy Latest Commit."
  echo "     Then confirm GET /api/health reports the commit you expect."
  exit 1
fi

PAYLOAD=$(cat <<JSON
{"query":"mutation serviceInstanceDeploy(\$serviceId: String!, \$environmentId: String!, \$latestCommit: Boolean) { serviceInstanceDeploy(serviceId: \$serviceId, environmentId: \$environmentId, latestCommit: \$latestCommit) }","variables":{"serviceId":"${SERVICE_ID}","environmentId":"${ENVIRONMENT_ID}","latestCommit":${LATEST_COMMIT}}}
JSON
)

BODY_FILE="$(mktemp)"
HEADER_FILE="$(mktemp)"
# The token reaches curl through a file, never through argv — argv is visible
# to every process on the runner.
printf 'Authorization: Bearer %s\n' "$RAILWAY_TOKEN" > "$HEADER_FILE"
cleanup() { rm -f "$BODY_FILE" "$HEADER_FILE"; }
trap cleanup EXIT

echo "Triggering deploy: service=${SERVICE_ID} environment=${ENVIRONMENT_ID} latestCommit=${LATEST_COMMIT}"

# ── 2. The request must complete. ──────────────────────────────────────
# `-sS` does not fail on an HTTP error status, so the status is captured
# explicitly instead. Relying on curl's exit code alone would let a 401 page
# through as a successful deploy — the previous failure mode in a new costume.
HTTP_STATUS=""
if ! HTTP_STATUS=$(curl -sS --max-time 60 \
      -o "$BODY_FILE" -w '%{http_code}' \
      -X POST "$RAILWAY_API" \
      -H @"$HEADER_FILE" \
      -H "Content-Type: application/json" \
      -d "$PAYLOAD"); then
  echo "::error title=Deploy not attempted::the request to Railway never completed (network, DNS or TLS)."
  exit 1
fi

# Redact anything token-shaped before the body is printed into a public log.
RESP=$(sed -e 's/Bearer [A-Za-z0-9._-]\{8,\}/Bearer [redacted]/g' "$BODY_FILE")
echo "HTTP ${HTTP_STATUS}"
echo "${RESP}"

# ── 3. The response must say the trigger was ACCEPTED. ─────────────────
if [ "${HTTP_STATUS:0:1}" != "2" ]; then
  echo "::error title=Deploy rejected::Railway answered HTTP ${HTTP_STATUS}. No deployment was queued."
  exit 1
fi

if [ -z "${RESP//[[:space:]]/}" ]; then
  echo "::error title=Deploy unproven::Railway returned an empty body. Whether a deploy was queued is unknown, and unknown is not success."
  exit 1
fi

# GraphQL answers 200 for application-level failures, so the status alone
# proves only that something replied.
if printf '%s' "$RESP" | grep -q '"errors"'; then
  echo "::error title=Deploy rejected::Railway returned GraphQL errors (see body above)."
  exit 1
fi

# The mutation must actually appear, and must not have come back null or
# false. An absent field is the case that matters most: a schema change or a
# silently ignored mutation would otherwise sail through every check above.
if ! printf '%s' "$RESP" | grep -q 'serviceInstanceDeploy'; then
  echo "::error title=Deploy unproven::the response contains no serviceInstanceDeploy result. Not treating this as a deploy."
  exit 1
fi
if printf '%s' "$RESP" | grep -Eq '"serviceInstanceDeploy"[[:space:]]*:[[:space:]]*(null|false)'; then
  echo "::error title=Deploy rejected::Railway returned serviceInstanceDeploy null/false — the trigger was refused."
  exit 1
fi

echo "Deploy trigger accepted by Railway."
echo "NOT YET PROVEN: that the new build is serving. Confirm with GET /api/health and compare build.shortCommit."
