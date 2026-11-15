# App: Hono API (Bun) + SPA statis hasil build Vite, satu proses.
FROM oven/bun:1.3 AS build
WORKDIR /src
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN bun install --frozen-lockfile
COPY apps apps
RUN bun run --cwd apps/web build

FROM oven/bun:1.3-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN bun install --frozen-lockfile --production --filter @ctwa/api && rm -rf /root/.bun/install/cache
COPY apps/api apps/api
COPY --from=build /src/apps/web/dist apps/web/dist
WORKDIR /app/apps/api
ENV WEB_DIST=../web/dist PORT=3000
EXPOSE 3000
USER bun
# migrasi dulu (idempoten), lalu jalankan server dengan mode hemat memori
CMD ["sh", "-c", "bun src/db/migrate.ts && exec bun --smol src/index.ts"]
