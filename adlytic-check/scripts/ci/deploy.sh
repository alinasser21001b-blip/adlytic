#!/usr/bin/env bash
# Deploy the Worker and publish its live URL. A deploy that does not yield a
# workers.dev URL is a failure, not a success.
#   usage: BUILD_ID=<sha7> deploy.sh [turnstile_site_key]
set -euo pipefail
args=(--var "BUILD_ID:${BUILD_ID:?BUILD_ID required}")
if [ -n "${1:-}" ]; then args+=(--var "TURNSTILE_SITE_KEY:$1"); fi
npx wrangler deploy "${args[@]}" 2>&1 | tee deploy.log
url=$(grep -oE 'https://adlytic-check\.[a-z0-9-]+\.workers\.dev' deploy.log | head -1 || true)
if [ -z "$url" ]; then
  echo "::error title=No live URL::wrangler deploy reported no workers.dev URL. Enable the account's workers.dev subdomain (Workers & Pages → Your subdomain) and re-run."
  exit 1
fi
echo "url=$url" >> "$GITHUB_OUTPUT"
echo "host=${url#https://}" >> "$GITHUB_OUTPUT"
