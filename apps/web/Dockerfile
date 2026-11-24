# syntax=docker/dockerfile:1.7
# Next.js standalone output: the runtime image contains only the traced server files.

ARG NODE_IMAGE=node:22.18-bookworm-slim

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

FROM ${NODE_IMAGE} AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# NEXT_PUBLIC_* values are inlined at build time.
ARG NEXT_PUBLIC_CURRENCY=USD
ENV NEXT_PUBLIC_CURRENCY=${NEXT_PUBLIC_CURRENCY}
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=build --chown=root:root /app/.next/standalone ./
COPY --from=build --chown=root:root /app/.next/static ./.next/static
# Writable only where Next needs it (mounted as tmpfs by docker-compose; root FS is read-only).
RUN mkdir -p .next/cache && chown node:node .next/cache
USER node
EXPOSE 3000
CMD ["node", "server.js"]
