#!/usr/bin/env bash
set -euo pipefail

NETWORK=${1:-local}

echo "============================================"
echo "  HomeGentic — Deployment ($NETWORK)"
echo "============================================"

# ── Load DFX identity from CI secret (non-local deploys only) ──────────────────
if [ "$NETWORK" != "local" ] && [ -n "${DFX_IDENTITY_PEM:-}" ]; then
  echo "▶ Loading DFX identity from DFX_IDENTITY_PEM secret..."
  IDENTITY_FILE=$(mktemp /tmp/dfx-identity-XXXXXX.pem)
  printf '%s' "$DFX_IDENTITY_PEM" > "$IDENTITY_FILE"
  dfx identity import --storage-mode plaintext ci-deploy "$IDENTITY_FILE" 2>/dev/null || true
  dfx identity use ci-deploy
  rm -f "$IDENTITY_FILE"
  echo "  ✓ Identity loaded"
fi

if [ "$NETWORK" = "local" ]; then
  echo "▶ Starting dfx local replica..."
  if dfx ping 2>/dev/null; then
    echo "  ✓ dfx is already running"
  else
    dfx start --background --clean
    echo "  ✓ dfx started"
  fi
fi

# ── Parallel canister deployment ────────────────────────────────────────────────
# All 11 canisters are independent at deploy time — inter-canister wiring
# happens below via setPaymentCanisterId etc. after all deploys complete.

CANISTERS=(auth property job contractor quote payment photo report maintenance market sensor monitoring)
LOG_DIR=$(mktemp -d /tmp/dfx-deploy-XXXXXX)
PIDS=()

echo "▶ Deploying ${#CANISTERS[@]} canisters in parallel..."
for canister in "${CANISTERS[@]}"; do
  dfx deploy "$canister" --network "$NETWORK" >"$LOG_DIR/$canister.log" 2>&1 &
  PIDS+=($!)
done

# Wait for all and collect failures
FAILED=()
for i in "${!CANISTERS[@]}"; do
  canister="${CANISTERS[$i]}"
  pid="${PIDS[$i]}"
  if wait "$pid"; then
    echo "  ✓ $canister"
  else
    echo "  ✗ $canister (failed)"
    FAILED+=("$canister")
  fi
done

# Print logs for any failed canisters
if [ ${#FAILED[@]} -gt 0 ]; then
  echo ""
  echo "❌ Deploy failed for: ${FAILED[*]}"
  for canister in "${FAILED[@]}"; do
    echo ""
    echo "── $canister log ──────────────────────────"
    cat "$LOG_DIR/$canister.log"
  done
  rm -rf "$LOG_DIR"
  exit 1
fi

rm -rf "$LOG_DIR"

echo ""
echo "============================================"
echo "  Deployed Canister IDs"
echo "============================================"
for canister in "${CANISTERS[@]}"; do
  ID=$(dfx canister id "$canister" --network "$NETWORK" 2>/dev/null || echo "not deployed")
  echo "  $canister: $ID"
done

echo ""
echo "============================================"
echo "  Wiring Inter-Canister IDs"
echo "============================================"

JOB_ID=$(dfx canister id job --network "$NETWORK" 2>/dev/null || echo "")
PAYMENT_ID=$(dfx canister id payment --network "$NETWORK" 2>/dev/null || echo "")
CONTRACTOR_ID=$(dfx canister id contractor --network "$NETWORK" 2>/dev/null || echo "")
PROPERTY_ID=$(dfx canister id property --network "$NETWORK" 2>/dev/null || echo "")

if [ -n "$JOB_ID" ] && [ -n "$PAYMENT_ID" ]; then
  echo "  Wiring payment -> job (tier cap enforcement)..."
  dfx canister call job setPaymentCanisterId "(\"$PAYMENT_ID\")" --network "$NETWORK"
fi

if [ -n "$JOB_ID" ] && [ -n "$CONTRACTOR_ID" ]; then
  echo "  Wiring contractor -> job..."
  dfx canister call job setContractorCanisterId "(\"$CONTRACTOR_ID\")" --network "$NETWORK"
fi

if [ -n "$JOB_ID" ] && [ -n "$PROPERTY_ID" ]; then
  echo "  Wiring property -> job..."
  dfx canister call job setPropertyCanisterId "(\"$PROPERTY_ID\")" --network "$NETWORK"
fi

echo ""
echo "✅ Deployment complete!"
