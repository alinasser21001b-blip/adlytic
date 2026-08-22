# ════════════════════════════════════════════════════════════════════════
#  Adlytic runtime image.
#
#  THIS FILE IS A SECURITY CONTROL, NOT A PACKAGING PREFERENCE.
#
#  Under Nixpacks, Railway generates a Dockerfile that declares EVERY service
#  variable as `ARG X` and then `ENV X=$X`, so the build can see all of them.
#  The build of 094a37b emitted 16 BuildKit SecretsUsedInArgOrEnv warnings
#  across 8 credentials — ANTHROPIC_API_KEY, JWT_SECRET, META_APP_SECRET,
#  META_SYSTEM_USER_TOKEN, META_VERIFY_TOKEN, STRIPE_SECRET_KEY,
#  STRIPE_WEBHOOK_SECRET, TOKEN_ENCRYPTION_KEY. Read from Railway's own build
#  log, not inferred. `ENV` persists into the image configuration, so those
#  values stay readable from the image itself by anyone who can pull it, long
#  after the build ended. A deployment succeeding does not make that safe.
#
#  The build needs none of them. `npm run build` is `prisma generate && tsc`,
#  and it was run with all eight unset — plus DATABASE_URL, REDIS_URL,
#  OPENAI_API_KEY and META_APP_ID — and exited 0.
#
#  ── THE RULE THIS FILE MUST KEEP ──────────────────────────────────────
#
#  It declares NO `ARG`, and no `ENV` naming a credential. Docker forwards a
#  build argument only to a Dockerfile that has declared it, so with none
#  declared there is no path by which a credential can enter the build: the
#  exposure is structurally impossible here rather than merely unused. Secrets
#  arrive at RUNTIME from Railway's service variables, which is where a
#  runtime secret belongs.
#
#  Adding `ARG SOME_TOKEN` to this file would reopen the hole quietly, so it
#  is not left to discipline — test_deploy_gate.ts fails the build on any ARG
#  or credential-shaped ENV declared here.
#
#  Single stage on purpose. A builder/runtime split would have to carry the
#  generated Prisma client across stages (node_modules/@prisma/client plus
#  node_modules/.prisma), and a copy that silently misses one of them produces
#  an image that builds clean and dies at boot. `--omit=dev` already keeps the
#  install to the 20 runtime dependencies; typescript, prisma and tsx are
#  among them, so the build needs no dev tree at all.
# ════════════════════════════════════════════════════════════════════════

FROM node:22-bookworm-slim

# Prisma's query engine links against OpenSSL 3 — schema.prisma's binaryTargets
# name debian-openssl-3.0.x, which is what bookworm ships. ca-certificates is
# needed for TLS out to Postgres and to Meta.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Nixpacks set NODE_ENV=production in the image it generated. Nothing about a
# plain node base image would, and config.ts reads
# `IS_PRODUCTION = NODE_ENV !== 'development' && NODE_ENV !== 'test'` over a
# value that DEFAULTS to 'development' when unset — so an unset NODE_ENV would
# silently downgrade the prod-fatal TOKEN_ENCRYPTION_KEY check to a warning.
# Set explicitly so that gate stays closed. This is configuration, not a
# credential, and it is the only ENV this file declares.
ENV NODE_ENV=production

# Manifests first: this layer rebuilds only when dependencies change.
COPY package.json package-lock.json ./
# --ignore-scripts: package.json's postinstall is `prisma generate`, which
# needs a schema this layer does not have yet. `npm run build` runs it below,
# once the schema is in place.
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund

# prisma.config.ts and the schema are the inputs to `prisma generate`;
# tsconfig.json's include list also carries prisma/seed.ts, so tsc needs the
# schema directory present too.
COPY tsconfig.json prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src
RUN npm run build

# Static assets the server serves at runtime: /fonts, /icons, /vendor,
# /manifest.json and /sw.js, all resolved relative to the working directory.
# .dockerignore already drops public/adspulse, which the server never serves.
COPY public ./public

# THE ENTRYPOINT CMD NAMES. Not optional, and not obvious: every other COPY
# here feeds the build, so it was easy to finish the build correctly and ship
# an image whose start command pointed at a file that had never been packaged.
# The image built clean and every container died on
# `Cannot find module '/app/.deploy/start.js'`.
#
# Copied as the single file rather than `COPY .deploy ./.deploy`, to keep the
# allowlist discipline the .dockerignore header states: .deploy also holds
# railway-deploy.sh (already excluded by **/*.sh) and a `trigger` file, and
# neither has any runtime purpose. The runtime gets exactly the entrypoint it
# executes.
#
# test_deploy_gate.ts fails the build if the CMD/startCommand entrypoint is
# not COPYed here, so this cannot silently regress the way it silently broke.
COPY .deploy/start.js ./.deploy/start.js

EXPOSE 3000

# The same single command railway.json's deploy.startCommand names, so the
# image behaves identically whether the platform uses its own start command or
# falls back to this one. It is deliberately NOT `sh -c "A && B"`: the first
# Dockerfile-built deployment proved that start string gets split into an argv
# array rather than handed to a shell, so `&&` reached Prisma as an argument
# and the server never ran. .deploy/start.js carries the sequencing instead.
CMD ["node", ".deploy/start.js"]
