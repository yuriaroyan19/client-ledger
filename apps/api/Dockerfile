# syntax=docker/dockerfile:1.7
# Multi-stage build:
#   build   → full toolchain; also used by the one-shot `migrate` compose service (prisma CLI + seed)
#   runtime → production deps + compiled JS only, non-root, no package manager scripts

ARG NODE_IMAGE=node:22.18-bookworm-slim

FROM ${NODE_IMAGE} AS build
WORKDIR /app
# The Prisma schema engine (used by `migrate deploy`) needs OpenSSL.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY prisma ./prisma
COPY prisma.config.ts tsconfig.json tsconfig.build.json ./
RUN npx prisma generate
COPY src ./src
RUN npm run build
USER node

FROM ${NODE_IMAGE} AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
# --ignore-scripts: skips `postinstall: prisma generate` (the client is already compiled into dist/).
# Then drop "devOptional" packages: optional peers of @prisma/client (the Prisma CLI, Studio, TypeScript)
# that npm installs anyway but the runtime never loads. Native argon2 binaries are plain "optional" and stay.
RUN npm ci --omit=dev --ignore-scripts   && node -e "const p=require('./package-lock.json').packages;for(const k in p)if(p[k].devOptional)require('fs').rmSync(k,{recursive:true,force:true})"   && npm cache clean --force

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps --chown=root:root /app/node_modules ./node_modules
COPY --from=build --chown=root:root /app/dist ./dist
COPY --chown=root:root package.json ./
# Files are owned by root and the process runs as `node`: the app cannot modify its own code.
USER node
EXPOSE 4000
CMD ["node", "--enable-source-maps", "dist/server.js"]
