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
WORKDIR /app/agents/iot-gateway
COPY --from=build /app/agents/iot-gateway/node_modules ./node_modules
COPY --from=build /app/agents/iot-gateway/dist ./dist
COPY --from=build /app/agents/iot-gateway/package.json ./
# Runs as root: Fly mounts the /data volume root-owned.
EXPOSE 8080
CMD ["node", "dist/agents/iot-gateway/server.js"]
