# Build from the repo root (the server imports packages/shared):
#   docker build -f agents/notifications/Dockerfile .
# Deployed to Fly.io by .github/workflows/deploy-relays.yml.
FROM node:22-slim AS build
WORKDIR /app
COPY agents/notifications/package.json agents/notifications/package-lock.json agents/notifications/
RUN cd agents/notifications && npm ci --no-audit --no-fund
COPY packages/shared packages/shared
COPY agents/notifications agents/notifications
RUN cd agents/notifications && npx tsc -p . && npm prune --omit=dev

FROM node:22-slim
ENV NODE_ENV=production
# gosu: start as root only to hand the /data volume (mounted root-owned by
# Fly) to the node user, then run the server as node (L-6, 2026-10-28 audit).
RUN apt-get update && apt-get install -y --no-install-recommends gosu \
 && rm -rf /var/lib/apt/lists/* && gosu nobody true
WORKDIR /app/agents/notifications
COPY --from=build /app/agents/notifications/node_modules ./node_modules
COPY --from=build /app/agents/notifications/dist ./dist
COPY --from=build /app/agents/notifications/package.json ./
EXPOSE 8080
CMD ["sh", "-c", "mkdir -p /data && chown -R node:node /data && exec gosu node node dist/agents/notifications/server.js"]
