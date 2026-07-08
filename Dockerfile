# Single npm ci (avoids OOM on Railway). Node 22 required by @prisma/streams-local.
FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl libc6-compat
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY prisma prisma.config.ts tsconfig.json ./
COPY prisma ./prisma/
COPY src ./src/
RUN npm run build \
  && npm prune --omit=dev \
  && npm cache clean --force

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl libc6-compat
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma/
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/api/serve.js"]
