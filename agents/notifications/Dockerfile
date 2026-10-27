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
WORKDIR /app/agents/notifications
COPY --from=build /app/agents/notifications/node_modules ./node_modules
COPY --from=build /app/agents/notifications/dist ./dist
COPY --from=build /app/agents/notifications/package.json ./
# Runs as root: Fly mounts the /data volume root-owned.
EXPOSE 8080
CMD ["node", "dist/agents/notifications/server.js"]
