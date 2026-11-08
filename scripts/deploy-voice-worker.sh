#!/usr/bin/env bash
# HomeGentic — deploy the voice/AI Worker and check its /health.
#
# scripts/deploy.sh runs this when DEPLOY_VOICE_WORKER=1 (the testnet and
# mainnet deploy workflows set it), after every canister is upgraded and wired
# and before the frontend, so each layer only ever calls code that is already
# live: canisters → voice Worker → frontend. A frontend that ships before the
# Worker can send requests the old Worker refuses (e.g. lien-waiver PDF
# uploads, PR #742).
#
# Usage:
#   CLOUDFLARE_API_TOKEN=… VOICE_AGENT_URL=https://… bash scripts/deploy-voice-worker.sh testnet|ic
#
# testnet deploys [env.testnet] in agents/voice/wrangler.toml; ic deploys the
# production Worker.
set -euo pipefail

ENV="${1:-}"
case "$ENV" in
  testnet) WRANGLER_ARGS=(--env testnet) ;;
  ic)      WRANGLER_ARGS=() ;;
  *) echo "usage: deploy-voice-worker.sh testnet|ic" >&2; exit 2 ;;
esac

# Checked before deploying: a Worker we can't health-check shouldn't go out
# ahead of the frontend unverified.
if [ -z "${VOICE_AGENT_URL:-}" ]; then
  echo "❌ VOICE_AGENT_URL is not set (the voice Worker's base URL, for the /health check)" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo ""
echo "============================================"
echo "  Deploying Voice Worker ($ENV)"
echo "============================================"
cd "$ROOT/agents/voice"
[ -d node_modules ] || npm ci --no-audit --no-fund
npx wrangler deploy "${WRANGLER_ARGS[@]}"

# /health is 503 when a secret or canister ID the Worker needs is missing.
cd "$ROOT"
ONLY=worker bash scripts/smoke-deployed.sh
