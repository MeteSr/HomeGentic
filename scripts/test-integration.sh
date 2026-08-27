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

_INT_COUNTS=$(node -e "
const fs = require('fs'), path = require('path');
const dir = '$FRONTEND_DIR/src/__tests__/integration';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.test.ts'));
let total = 0;
for (const f of files) {
  const txt = fs.readFileSync(path.join(dir, f), 'utf8');
  total += (txt.match(/^\s*(it|test)\(/mg) || []).length;
}
process.stdout.write(files.length + ' files · ' + total + ' tests');
" 2>/dev/null || echo "? files")

echo "============================================"
echo "  HomeGentic — Frontend Integration Tests"
echo "  ${_INT_COUNTS}"
echo "============================================"
echo ""
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

# ── 3. Grant test identities subscriptions ───────────────────────────────────
# Fixed Ed25519 principals derived from seeded keys in setup.ts:
#   HOMEOWNER  seed[0]=42  →  qxmov-...  (Premium — exercises full paid features)
#   TIER_USER  seed[0]=77  →  lodek-...  (Basic  — exercises 1-property limit)
#   QUOTA_USER seed[0]=88  →  fz27l-...  (Basic  — exercises 3-open-quote limit)
# CONTRACTOR seed[0]=99 stays at ContractorFree (no properties, unlimited quotes).

echo ""
echo "▶ Granting test identity subscriptions…"
if command -v dfx >/dev/null 2>&1 && [ -n "${CANISTER_ID_PAYMENT:-}" ]; then
  dfx canister call payment grantSubscription \
    "(principal \"qxmov-duod5-ahrw6-wydp4-lppe4-ljtvj-7zvu3-qke5i-umwsv-vcb7g-mqe\", variant { Premium })" \
    2>/dev/null \
    && echo "  ✓ Premium → HOMEOWNER (seed=42)" \
    || echo "  ⚠  Could not grant Premium to HOMEOWNER"

  dfx canister call payment grantSubscription \
    "(principal \"lodek-xkcn2-ylhrl-ianfq-xzlz4-kexxd-2hc33-rutxg-tvyxb-hpypf-zqe\", variant { Basic })" \
    2>/dev/null \
    && echo "  ✓ Basic   → TIER_USER  (seed=77)" \
    || echo "  ⚠  Could not grant Basic to TIER_USER"

  dfx canister call payment grantSubscription \
    "(principal \"fz27l-323vu-kqihx-wpazo-5xly5-vkrbv-zz4ee-2eppx-n56of-6qtd6-mqe\", variant { Basic })" \
    2>/dev/null \
    && echo "  ✓ Basic   → QUOTA_USER (seed=88)" \
    || echo "  ⚠  Could not grant Basic to QUOTA_USER"
else
  echo "  ⚠  dfx not found or payment canister not deployed — skipping grants"
fi

# NOTE: Properties are immutable (no deleteProperty). If tests fail with
# "Premium limit of 20 properties reached", the local replica has accumulated
# too many properties across runs. Fix: make clean && make deploy, then re-run.

# ── 4. Run vitest with integration config ─────────────────────────────────────

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
