# Production image — smaller & faster push than Nixpacks (~150MB vs ~387MB)
FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache openssl libc6-compat
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS builder
COPY prisma prisma.config.ts tsconfig.json ./
COPY prisma ./prisma/
COPY src ./src/
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl libc6-compat
COPY package.json package-lock.json ./
COPY prisma prisma.config.ts ./
COPY prisma ./prisma/
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/api/serve.js"]
