#!/usr/bin/env bash
# Deploy the Worker and publish its live URL. A deploy that does not yield a
# workers.dev URL is a failure, not a success.
#   usage: BUILD_ID=<sha7> deploy.sh [turnstile_site_key]
#
# The Workers AI binding (speech-to-text for video checks) is added only here:
# `wrangler dev` cannot start with an AI binding without Cloudflare credentials,
# which would break local and CI tests. If the account or token refuses the
# binding, the Worker is deployed without it and audio is reported "unavailable".
set -euo pipefail
args=(--var "BUILD_ID:${BUILD_ID:?BUILD_ID required}")
if [ -n "${1:-}" ]; then args+=(--var "TURNSTILE_SITE_KEY:$1"); fi

node -e '
  const fs = require("fs");
  const src = fs.readFileSync("wrangler.jsonc", "utf8");
  if (!src.includes("\"d1_databases\"")) { console.error("deploy.sh: d1_databases not found"); process.exit(2); }
  fs.writeFileSync("wrangler.deploy.jsonc", src.replace("\"d1_databases\"", "\"ai\": { \"binding\": \"AI\" },\n  \"d1_databases\""));
'
if npx wrangler deploy -c wrangler.deploy.jsonc "${args[@]}" 2>&1 | tee deploy.log; then
  echo "deployed with the Workers AI binding"
else
  echo "::warning title=Workers AI binding refused::Deploying without it — video audio will be reported as unavailable. Give the API token Workers AI access to enable speech-to-text."
  npx wrangler deploy "${args[@]}" 2>&1 | tee deploy.log
fi
rm -f wrangler.deploy.jsonc
url=$(grep -oE 'https://adlytic-check\.[a-z0-9-]+\.workers\.dev' deploy.log | head -1 || true)
if [ -z "$url" ]; then
  echo "::error title=No live URL::wrangler deploy reported no workers.dev URL. Enable the account's workers.dev subdomain (Workers & Pages → Your subdomain) and re-run."
  exit 1
fi
echo "url=$url" >> "$GITHUB_OUTPUT"
echo "host=${url#https://}" >> "$GITHUB_OUTPUT"
