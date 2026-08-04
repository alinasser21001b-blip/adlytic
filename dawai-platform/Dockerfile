FROM node:24.15.0-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24.15.0-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN groupadd --system dawai && useradd --system --gid dawai --home /app dawai
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
COPY --from=build /app/migrations ./migrations
RUN mkdir -p /var/lib/dawai/storage && chown -R dawai:dawai /app /var/lib/dawai
USER dawai
EXPOSE 8787
CMD ["node", "dist-server/index.js"]
