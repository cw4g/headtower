# syntax=docker/dockerfile:1

# node:sqlite (used for settings/sessions/audit) needs Node 22.5+; 24 is the
# stable target.
FROM node:24-slim AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# --ignore-scripts: pnpm 10 hard-errors on unapproved build scripts (sharp,
# unrs-resolver) in a fresh frozen install. Those packages ship prebuilt native
# binaries via optional deps, so skipping lifecycle scripts is safe.
RUN pnpm install --frozen-lockfile --ignore-scripts

FROM node:24-slim AS build
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# Persisted local store (settings + sessions + audit log).
ENV HEADTOWER_DB_PATH=/app/data/headtower.db
RUN mkdir -p /app/data
# Next.js "standalone" output: a minimal self-contained server.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 3000
VOLUME ["/app/data"]
CMD ["node", "server.js"]
