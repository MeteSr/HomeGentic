#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# test-integration.sh — run frontend integration tests against the local replica
#
# Usage:
#   npm run test:integration           # uses canister IDs from .env
#   npm run test:integration -- bills  # filter to specific test file
#
# Prerequisites:
#   dfx start --background   (replica must be running)
#   make deploy              (all canisters must be deployed)
#
# What it does:
#   1. Checks the local replica is reachable
#   2. Reads canister IDs written by dfx to canister_ids.json / .env
#   3. Exports them as CANISTER_ID_* env vars
#   4. Runs vitest with the integration config
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"

# ── 1. Replica health check ───────────────────────────────────────────────────

echo "▶ Checking local replica…"
if ! curl -sf http://localhost:4943/api/v2/status >/dev/null 2>&1; then
  echo ""
  echo "  ✗ Local replica is not running."
  echo "    Start it with:  dfx start --background"
  echo "    Then deploy:    make deploy"
  echo ""
  exit 1
fi
echo "  ✓ Replica is up"

# ── 2. Read canister IDs from dfx ────────────────────────────────────────────

CANISTER_IDS_FILE="$ROOT_DIR/.dfx/local/canister_ids.json"

if [ ! -f "$CANISTER_IDS_FILE" ]; then
  echo ""
  echo "  ✗ No canister IDs found at $CANISTER_IDS_FILE"
  echo "    Deploy first with: make deploy"
  echo ""
  exit 1
fi

echo "▶ Reading canister IDs from $CANISTER_IDS_FILE…"

# Export CANISTER_ID_<NAME> for each deployed canister
# Also set the service-level names the frontend services expect (e.g. BILLS_CANISTER_ID)
while IFS='=' read -r key value; do
  export "$key=$value"
done < <(
  node -e "
    const ids = require('$CANISTER_IDS_FILE');
    for (const [name, nets] of Object.entries(ids)) {
      const id = nets.local || nets.ic || '';
      if (id) {
        const upper = name.toUpperCase().replace(/-/g,'_');
        console.log('CANISTER_ID_' + upper + '=' + id);
        // Also set the flat name that service files read (e.g. BILLS_CANISTER_ID)
        console.log(upper + '_CANISTER_ID=' + id);
      }
    }
  " 2>/dev/null || true
)

# Print which canisters are available
echo "  Deployed canisters:"
env | grep "CANISTER_ID_" | sort | while IFS='=' read -r k v; do
  echo "    $k = $v"
done

# ── 3. Run vitest with integration config ─────────────────────────────────────

echo ""
echo "▶ Running integration tests…"
echo ""

cd "$FRONTEND_DIR"

# Pass any extra args (e.g. test file filter) through to vitest
npx vitest run \
  --config vitest.integration.ts \
  --reporter=verbose \
  "$@"

echo ""
echo "✓ Integration tests complete"
