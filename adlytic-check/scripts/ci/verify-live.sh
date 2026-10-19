#!/usr/bin/env bash
# Verify the deployed Worker from outside: health + the exact build, routing,
# headers, session cookie, and owner-only report access. Ownership is proven on
# the real Worker + real D1 with two synthetic visitors created here (random
# tokens, never stored anywhere) and removed on exit.
#   usage: verify-live.sh <url> <expected_build>
set -euo pipefail
URL="${1:?url}"; EXPECT="${2:?expected build}"
fail() { echo "::error title=Live verification failed::$1"; exit 1; }
sum() { echo "$1" >> "${GITHUB_STEP_SUMMARY:-/dev/null}"; }
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
jget() { H="$1" node -e 'const v=JSON.parse(process.env.H)'"$2"';process.stdout.write(typeof v==="object"?JSON.stringify(v):String(v))'; }

# 1. Health, and the build actually serving (new versions propagate in seconds).
health=""; build=""
for _ in $(seq 1 12); do
  if health=$(curl -fsS "$URL/api/health"); then
    build=$(jget "$health" '.build')
    [ "$build" = "$EXPECT" ] && break
  fi
  sleep 5
done
[ -n "$health" ] || fail "health endpoint unreachable at $URL"
[ "$(jget "$health" '.status')" = ok ] || fail "health status is not ok: $health"
[ "$build" = "$EXPECT" ] || fail "live build is '$build', expected '$EXPECT' — an older version is serving"

# 2. Routing and headers.
[ "$(code "$URL/")" = 200 ] || fail "home page not 200"
curl -sI "$URL/" | tr -d '\r' | grep -qi '^content-security-policy:' || fail "CSP header missing on /"
[ "$(code "$URL/r/abcdefgh1234")" = 200 ] || fail "SPA deep link not served"
nf=$(curl -s -D - -o /dev/null "$URL/api/not-found" | tr -d '\r')
echo "$nf" | head -1 | grep -q ' 404' || fail "/api/not-found is not 404"
echo "$nf" | grep -qi '^content-type: application/json' || fail "/api/not-found is not JSON"
[ "$(code "$URL/s/xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx")" = 404 ] || fail "unknown share token not 404"

# 3. Session cookie and same-origin enforcement.
[ "$(code -X POST "$URL/api/session")" = 403 ] || fail "mutation without Origin was accepted"
sess=$(curl -s -D - -o /dev/null -X POST -H "Origin: $URL" "$URL/api/session" | tr -d '\r')
cookie=$(echo "$sess" | grep -i '^set-cookie: ac_sid=' | head -1 || true)
[ -n "$cookie" ] || fail "POST /api/session set no ac_sid cookie"
attrs="HttpOnly SameSite=Lax"; case "$URL" in https://*) attrs="$attrs Secure";; esac
for attr in $attrs; do echo "$cookie" | grep -qi "$attr" || fail "session cookie lacks $attr"; done
S=$(echo "$cookie" | sed -E 's/^[Ss]et-[Cc]ookie: ac_sid=([^;]+).*/\1/')
HS=$(printf %s "$S" | sha256sum | cut -d' ' -f1)

# 4. Owner-only report access on the real Worker + D1.
tok() { node -e 'process.stdout.write(require("crypto").randomBytes(32).toString("base64url"))'; }
A=$(tok); B=$(tok)
HA=$(printf %s "$A" | sha256sum | cut -d' ' -f1)
HB=$(printf %s "$B" | sha256sum | cut -d' ' -f1)
RID="ci$(node -e 'process.stdout.write(require("crypto").randomBytes(9).toString("base64url"))')"
NOW=$(( $(date +%s) * 1000 )); EXP=$(( NOW + 3600000 ))
read -r -a D1_FLAGS <<< "${D1_FLAGS:---remote}"   # local runs: D1_FLAGS="--local --persist-to <dir>"
d1() { npx wrangler d1 execute adlytic-check-db "${D1_FLAGS[@]}" --yes --command "$1" >/dev/null; }
cleanup() { d1 "DELETE FROM analyses WHERE id = '$RID'; DELETE FROM visitors WHERE id IN ('$HA', '$HB', '$HS');" || echo "::warning::cleanup of synthetic CI rows failed (report $RID)"; }
trap cleanup EXIT
d1 "INSERT INTO visitors (id, created_at, last_seen_at) VALUES ('$HA', $NOW, $NOW), ('$HB', $NOW, $NOW);
    INSERT INTO analyses (id, visitor_id, idempotency_key, input_hash, status, mode, industry, goal, created_at, reservation_expires_at, expires_at, completed_at, report_json)
    VALUES ('$RID', '$HA', 'ci-$RID', 'ci', 'completed', 'text_only', 'other', 'messages', $NOW, $NOW, $EXP, $NOW, '{\"schemaVersion\":\"1\",\"id\":\"$RID\",\"ciProbe\":true}');"
own=$(curl -s -D - -o /dev/null -H "Cookie: ac_sid=$A" "$URL/api/reports/$RID" | tr -d '\r')
echo "$own" | head -1 | grep -q ' 200' || fail "owner cannot read their own report"
echo "$own" | grep -qi '^cache-control: no-store' || fail "private report is cacheable"
[ "$(code -H "Cookie: ac_sid=$B" "$URL/api/reports/$RID")" = 404 ] || fail "another visitor can read the report"
[ "$(code "$URL/api/reports/$RID")" = 401 ] || fail "anonymous read was not refused"
[ "$(code -X POST -H "Origin: $URL" -H "Cookie: ac_sid=$B" "$URL/api/reports/$RID/share")" = 404 ] || fail "another visitor can share the report"
[ "$(code -X DELETE -H "Origin: $URL" -H "Cookie: ac_sid=$B" "$URL/api/reports/$RID")" = 404 ] || fail "another visitor can delete the report"
[ "$(code -X DELETE -H "Origin: https://evil.example" -H "Cookie: ac_sid=$A" "$URL/api/reports/$RID")" = 403 ] || fail "foreign Origin was accepted"
[ "$(code -H "Cookie: ac_sid=$A" "$URL/api/reports/$RID")" = 200 ] || fail "report changed after refused mutations"

# 5. V2 capabilities that can be proven without spending: health reports them,
#    link import refuses internal targets before connecting and never scrapes
#    Meta, login/payments are honest about being off, the price is the server's.
caps=$(jget "$health" '.capabilities')
[ -n "$caps" ] && [ "$caps" != undefined ] || fail "/api/health has no capabilities"
link() { curl -s -X POST -H "Origin: $URL" -H "Cookie: ac_sid=$S" -H 'content-type: application/json' -d "{\"url\":\"$1\"}" "$URL/api/import-link"; }
for target in "https://169.254.169.254/latest/meta-data/" "https://127.0.0.1/" "https://[::ffff:10.0.0.1]/" "https://localhost/"; do
  r=$(link "$target")
  [ "$(jget "$r" '.state')" = UNSUPPORTED ] && jget "$r" '.reason' | grep -q '^blocked:' || fail "link import did not refuse internal target $target: $r"
done
r=$(link "$URL/api/health"); jget "$r" '.reason' | grep -q '^blocked:' || fail "link import fetched the Worker itself: $r"
r=$(link "https://www.instagram.com/p/abc123/"); [ "$(jget "$r" '.state')" = AUTH_REQUIRED ] || fail "Instagram link not AUTH_REQUIRED: $r"
cat=$(curl -fsS "$URL/api/payments/catalog")
[ "$(jget "$cat" '.unitPriceIQD')" = 500 ] && [ "$(jget "$cat" '.priceVersion')" = "iqd-500@1" ] || fail "catalog price is not 500 IQD @ iqd-500@1: $cat"
[ "$(jget "$cat" '.paymentsEnabled')" = "$(jget "$health" '.capabilities.payments.ready')" ] || fail "catalog and health disagree on payments"
loc=$(curl -s -D - -o /dev/null "$URL/api/auth/google/start" | tr -d '\r' | grep -i '^location:' || true)
if [ "$(jget "$health" '.capabilities.accounts.enabled')" = true ] && [ "$(jget "$health" '.capabilities.accounts.loginConfigured')" = true ]; then
  echo "$loc" | grep -q 'accounts.google.com' || fail "login is configured but start does not go to Google: $loc"
else
  echo "$loc" | grep -q 'auth=unavailable' || fail "login is off but start does not say so: $loc"
fi
[ "$(code "$URL/fonts/readex-pro-arabic-600-normal.woff2")" = 200 ] || fail "display font not served"

sum "### Live verification — passed"
sum ""
sum "- URL: $URL"
sum "- Build serving: \`$build\`"
sum "- Routing, CSP, JSON 404, share 404, HttpOnly+Secure+SameSite session cookie, Origin enforcement"
sum "- Owner-only report access on live Worker + D1 (owner 200 no-store · other visitor 404 · anonymous 401 · foreign share/delete refused)"
sum "- Link import refuses metadata/loopback/mapped-private/localhost/self targets before connecting; Instagram → AUTH_REQUIRED"
sum "- Catalog 500 IQD @ iqd-500@1; login and payments honest about their state"
sum "- Capabilities: \`$caps\`"
sum "- Analysis readiness (reported by the next job): \`$(jget "$health" '.readiness')\`"
echo "live verification passed for $URL (build $build)"
