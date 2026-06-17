#!/bin/bash
# git_commit_and_push.command
# Double-click in Finder to commit the create-user script and push to Railway.
set -e
cd "$(dirname "$0")"

BOLD=$'\e[1m'
GREEN=$'\e[32m'
RED=$'\e[31m'
CYAN=$'\e[36m'
RESET=$'\e[0m'

echo ""
echo "${BOLD}══════════════════════════════════════════════════════${RESET}"
echo "${BOLD}  Adlytic — Commit & Push create-user script${RESET}"
echo "${BOLD}══════════════════════════════════════════════════════${RESET}"
echo ""

# Remove stale lock if present
if [ -f .git/index.lock ]; then
  echo "  Removing stale .git/index.lock …"
  rm -f .git/index.lock && echo "  ${GREEN}✔  Lock removed${RESET}" || {
    echo "  ${RED}✘  Could not remove .git/index.lock — close any editors and try again.${RESET}"
    echo ""
    echo "  Press Enter to close."
    read -r
    exit 1
  }
fi

# Stage the key files
echo "  Staging files …"
git add scripts/create-user.ts package.json package-lock.json test_create_user.command test_prompts.command
echo "  ${GREEN}✔  Files staged${RESET}"

# Show what's staged
echo ""
git status --short
echo ""

# Commit
echo "  Committing …"
git commit -m "feat: add create-user provisioning script

Adds scripts/create-user.ts — a production CLI tool for provisioning
users + workspaces without enabling public registration.

- Collects name, email, password, workspace name interactively
- Validates all inputs; rejects duplicates
- Hashes password with SHA-256 (identical to /api/auth/login)
- Creates user → workspace → WorkspaceMember (OWNER) with rollback on failure
- Verifies login by re-querying with the same hash logic
- Uses readline/promises without terminal:false (fixes ^M / hang bug)
- askPassword(): uses node:stream Writable (not plain object) so readline
  EventEmitter calls (.on/.emit) work — fixes 'output.on is not a function'
- TTY-aware: mutes echo on real TTY, plain readline on piped stdin

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"

echo ""
echo "  ${GREEN}✔  Committed${RESET}"

# Push
echo "  Pushing to origin/main …"
git push origin main
echo ""
echo "  ${GREEN}✔  Pushed — Railway will redeploy automatically${RESET}"

echo ""
echo "${GREEN}${BOLD}══════════════════════════════════════════════════════${RESET}"
echo "${GREEN}${BOLD}  Done. Now run:${RESET}"
echo ""
echo "    railway run npm run create-user"
echo ""
echo "  to provision a user interactively."
echo "${GREEN}${BOLD}══════════════════════════════════════════════════════${RESET}"
echo ""
echo "  Press Enter to close."
read -r
