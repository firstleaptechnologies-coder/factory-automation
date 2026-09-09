# The API, as a container. One image, both roles.
#
#   docker build -t decor-api .
#   docker run -p 3001:3001 --env-file api.env decor-api
#
# Needs, at minimum: DATABASE_URL, DIRECT_URL, ENCRYPTION_KEYS (the only one
# that refuses to start without it in production), JWT_SECRET, APP_ENV and
# CORS_ORIGINS. EXPO_OTA_PRIVATE_KEY too, wherever updates are published —
# an API without it signs nothing, and every app built against the certificate
# will refuse the release. S3_* are optional; without them files go into
# Postgres rows. See apps/api/.env.example for the full list.
#
# Nothing is baked in: a .env copied into a layer is readable by anyone who can
# pull the image, which is why .dockerignore excludes them.
#
# The worker is this same image with ROLE=worker — see apps/api/src/common/
# jobs/role.ts. Nothing about the two deployments differs except that variable,
# which is the point: a worker that drifts from the API it is meant to share
# code with is a worker that runs last week's reconcile.
#
# Node 22 to match CI. Debian rather than Alpine because Prisma's query engine
# and sharp both want glibc, and the musl builds are the kind of difference you
# discover in production rather than here.

# ---------------------------------------------------------------------------
# Build — compiles TypeScript and generates the Prisma client.
# ---------------------------------------------------------------------------
FROM node:22-slim AS build
WORKDIR /app

# Prisma's engines link against OpenSSL, which the slim image does not carry.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Manifests before source, so editing a service does not reinstall the world.
# Every workspace's manifest has to be here — including the web app's, which
# this image never runs: `npm ci` validates the lockfile against all of them
# and fails on a missing one.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm ci

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api

# Generate before compiling: 61 files in the API import types that do not
# exist until the client has been generated.
RUN npm run db:generate \
 && npm run build:shared \
 && npm run build -w @fas/api

# ---------------------------------------------------------------------------
# Runtime — production dependencies and compiled output, nothing else.
# ---------------------------------------------------------------------------
FROM node:22-slim AS runtime
WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=3001

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/

# Only the API and what it imports. The workspace filters keep Next, React and
# every test framework out of the image: 60 packages rather than the full tree.
#
# `@fas/shared` is not a declared dependency of the API — it resolves through
# the workspace symlink npm creates in node_modules — so it has to be named
# here or 61 imports fail at runtime with a module that cannot be found.
RUN npm ci --omit=dev -w @fas/api -w @fas/shared --include-workspace-root \
 && npm cache clean --force

COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/api/dist apps/api/dist
# The schema and migrations travel with the image so the release that needs a
# migration is the one that carries it.
COPY --from=build /app/apps/api/prisma apps/api/prisma
# The generated client. `npm ci --omit=dev` installed @prisma/client but the
# Prisma CLI that generates into .prisma is a dev dependency and is not here.
COPY --from=build /app/node_modules/.prisma node_modules/.prisma

USER node
EXPOSE 3001

# The platform's own check is what takes an instance out of the pool; this is
# for anyone running the image directly.
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/api/dist/main.js"]
