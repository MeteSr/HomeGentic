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

# ── Ensure wallet is initialized and topped up before parallel deploy ───────────
# Without this, 12 simultaneous `dfx deploy` processes race to create the wallet
# on a clean replica start. The losers exit 0 without deploying anything.
# We also top up the wallet unconditionally — cycles are free on local replica
# and a depleted wallet silently fails canister creation (IC0504).
if [ "$NETWORK" = "local" ]; then
  if ! dfx identity get-wallet --network local >/dev/null 2>&1; then
    echo "▶ Initializing local wallet..."
    dfx wallet --network local create
  fi
  WALLET_ID=$(dfx identity get-wallet --network local)
  echo "▶ Topping up local wallet ($WALLET_ID) with 10T cycles..."
  dfx ledger fabricate-cycles --canister "$WALLET_ID" --t 10
  echo "  ✓ Wallet ready"
fi

# ── Sequential canister deployment ──────────────────────────────────────────────
# Parallel deploys race on canister_ids.json (each process read→add→write);
# the last writer wins and all other IDs are lost. Sequential is the safe default.

CANISTERS=(auth property job contractor quote payment photo report maintenance market sensor monitoring listing agent recurring)
LOG_DIR=$(mktemp -d /tmp/dfx-deploy-XXXXXX)

echo "▶ Deploying ${#CANISTERS[@]} canisters..."
FAILED=()
for canister in "${CANISTERS[@]}"; do
  if dfx deploy "$canister" --network "$NETWORK" >"$LOG_DIR/$canister.log" 2>&1; then
    echo "  ✓ $canister"
  else
    echo "  ✗ $canister (failed)"
    FAILED+=("$canister")
  fi
done

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
SENSOR_ID=$(dfx canister id sensor --network "$NETWORK" 2>/dev/null || echo "")
REPORT_ID=$(dfx canister id report --network "$NETWORK" 2>/dev/null || echo "")

# ── Canister ID wiring (target canister ID strings for cross-calls) ────────────

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

# ── Trusted canister wiring (derived from call topology) ──────────────────────
# These mirror the actual inter-canister call graph so each canister auto-trusts
# its known callers. Admins can add external canisters later via addTrustedCanister.

echo ""
echo "============================================"
echo "  Wiring Trusted Canister Lists"
echo "============================================"

# payment trusts job (job calls getTierForPrincipal)
if [ -n "$JOB_ID" ] && [ -n "$PAYMENT_ID" ]; then
  echo "  payment: trusting job canister ($JOB_ID)..."
  dfx canister call payment addTrustedCanister "(principal \"$JOB_ID\")" --network "$NETWORK"
fi

# contractor trusts job (job calls recordJobVerified)
if [ -n "$JOB_ID" ] && [ -n "$CONTRACTOR_ID" ]; then
  echo "  contractor: trusting job canister ($JOB_ID)..."
  dfx canister call contractor addTrustedCanister "(principal \"$JOB_ID\")" --network "$NETWORK"
fi

# property trusts job (job calls getPropertyOwner) and report (report calls getVerificationLevel)
if [ -n "$JOB_ID" ] && [ -n "$PROPERTY_ID" ]; then
  echo "  property: trusting job canister ($JOB_ID)..."
  dfx canister call property addTrustedCanister "(principal \"$JOB_ID\")" --network "$NETWORK"
fi
if [ -n "$REPORT_ID" ] && [ -n "$PROPERTY_ID" ]; then
  echo "  property: trusting report canister ($REPORT_ID)..."
  dfx canister call property addTrustedCanister "(principal \"$REPORT_ID\")" --network "$NETWORK"
fi

# job trusts sensor (sensor calls createSensorJob)
if [ -n "$SENSOR_ID" ] && [ -n "$JOB_ID" ]; then
  echo "  job: trusting sensor canister ($SENSOR_ID)..."
  dfx canister call job addTrustedCanister "(principal \"$SENSOR_ID\")" --network "$NETWORK"
fi

echo ""
echo "✅ Deployment complete!"
