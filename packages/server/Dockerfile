# ── Stage 1: Install dependencies ────────────────────────────────────
FROM node:24.22.1-bookworm-slim AS deps
RUN corepack enable
WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
# Install all workspace deps (build stage is discarded)
RUN pnpm install --frozen-lockfile --filter @starter/server...

# ── Stage 2: Build ───────────────────────────────────────────────────
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/server packages/server
RUN pnpm --filter @starter/shared run build
RUN pnpm --filter @starter/server run build
# `pnpm deploy --prod` writes the production dependency closure with real
# files (no pnpm symlinks) and @starter/shared materialised, so the runtime
# stage copies one directory. It needs `dist/` of both packages first.
RUN pnpm --filter @starter/server --prod deploy --legacy /prod

# ── Stage 3: Production runtime ─────────────────────────────────────
FROM node:24.22.1-bookworm-slim AS runtime
WORKDIR /app
ARG BUILD_COMMIT=unknown
LABEL org.opencontainers.image.revision=$BUILD_COMMIT

# Coolify's configured health probe runs curl inside the image.
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=6657
ENV HOSTNAME=0.0.0.0
# The commit this image was built from: /api/health reports it as `version`.
ENV BUILD_COMMIT=$BUILD_COMMIT

COPY --from=build /prod/dist ./dist
COPY --from=build /prod/package.json ./
COPY --from=build /prod/node_modules ./node_modules
COPY drain.cjs /usr/local/lib/drain.cjs

# The account database (accounts, sessions, subscriptions, usage, watches,
# check jobs, billing records). Production mounts the `auth-data` volume
# here; see docs/deploy.md before pointing a new app at another volume.
RUN mkdir -p /app/data && chown node:node /app/data
ENV AUTH_DB_PATH=/app/data/auth.db
ENV SHUTDOWN_DRAIN_SECONDS=20
ENV HEALTH_CHECK_PATH=/api/health

USER node
EXPOSE 6657

STOPSIGNAL SIGTERM
HEALTHCHECK --interval=2s --timeout=5s --start-period=15s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||'6657')+'/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

# Direct Node PID 1 receives Docker's SIGTERM; drain.cjs keeps the server
# serving while its loopback health probe fails during the drain interval.
CMD ["node", "--require", "/usr/local/lib/drain.cjs", "dist/index.js"]
