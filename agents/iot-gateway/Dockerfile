# Build from the repo root (the server imports packages/shared):
#   docker build -f agents/iot-gateway/Dockerfile .
# Deployed to Fly.io by .github/workflows/deploy-relays.yml.
FROM node:22-slim AS build
WORKDIR /app
COPY agents/iot-gateway/package.json agents/iot-gateway/package-lock.json agents/iot-gateway/
RUN cd agents/iot-gateway && npm ci --no-audit --no-fund
COPY packages/shared packages/shared
COPY agents/iot-gateway agents/iot-gateway
RUN cd agents/iot-gateway && npx tsc -p . && npm prune --omit=dev

FROM node:22-slim
ENV NODE_ENV=production
# gosu: start as root only to hand the /data volume (mounted root-owned by
# Fly) to the node user, then run the server as node (L-6, 2026-10-28 audit).
RUN apt-get update && apt-get install -y --no-install-recommends gosu \
 && rm -rf /var/lib/apt/lists/* && gosu nobody true
WORKDIR /app/agents/iot-gateway
COPY --from=build /app/agents/iot-gateway/node_modules ./node_modules
COPY --from=build /app/agents/iot-gateway/dist ./dist
COPY --from=build /app/agents/iot-gateway/package.json ./
EXPOSE 8080
CMD ["sh", "-c", "mkdir -p /data && chown -R node:node /data && exec gosu node node dist/agents/iot-gateway/server.js"]
