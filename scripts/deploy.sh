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

# ── Pre-flight checks (non-local networks only) ──────────────────────────────────
# Catch missing secrets before spending time deploying canisters only to have the
# voice agent or Claude API fail silently in production.

if [ "$NETWORK" != "local" ]; then
  echo ""
  echo "============================================"
  echo "  Pre-flight Checks ($NETWORK)"
  echo "============================================"
  PREFLIGHT_FAILED=0

  # PROD.1 — ANTHROPIC_API_KEY must be set; the voice agent fails-secure at startup
  # but an empty key means every Claude API call will fail after deploy.
  if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
    echo "  ✗ ANTHROPIC_API_KEY is not set — Claude API calls will fail"
    PREFLIGHT_FAILED=1
  else
    echo "  ✓ ANTHROPIC_API_KEY is set"
  fi

  # PROD.2 — VOICE_AGENT_API_KEY must be set; without it all voice endpoints are
  # unprotected (the server skips auth when the key is empty in dev mode, but on
  # a real deploy this means any client can call the Anthropic API via the proxy).
  if [ -z "${VOICE_AGENT_API_KEY:-}" ]; then
    echo "  ✗ VOICE_AGENT_API_KEY is not set — voice agent endpoints will be unprotected"
    PREFLIGHT_FAILED=1
  else
    echo "  ✓ VOICE_AGENT_API_KEY is set"
  fi

  if [ -z "${VITE_VOICE_AGENT_API_KEY:-}" ]; then
    echo "  ✗ VITE_VOICE_AGENT_API_KEY is not set — frontend will send no auth header to voice agent"
    PREFLIGHT_FAILED=1
  else
    echo "  ✓ VITE_VOICE_AGENT_API_KEY is set"
  fi

  if [ "$PREFLIGHT_FAILED" -ne 0 ]; then
    echo ""
    echo "❌ Pre-flight failed. Set the missing secrets and retry."
    exit 1
  fi
  echo ""
fi

# ── Sequential canister deployment ──────────────────────────────────────────────
# Parallel deploys race on canister_ids.json (each process read→add→write);
# the last writer wins and all other IDs are lost. Sequential is the safe default.

CANISTERS=(auth property job contractor quote payment photo report maintenance market sensor monitoring listing agent recurring ai_proxy)
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
echo "  Cycles Balance Check"
echo "============================================"

# PROD.3 — On non-local networks, verify each canister has enough cycles to run.
# Canisters below the warning threshold are topped up from the deploying wallet.
# On local the replica uses fabricated cycles so this step is skipped.
#
# Thresholds (in cycles):
#   WARNING_CYCLES  = 500B  — top up if balance falls below this
#   TOP_UP_TO       = 2T    — target balance after top-up
#
# Requires: the deploying identity's wallet must have enough ICP-backed cycles.
# Check wallet balance with: dfx wallet --network ic balance
#
# NOTE: dfx canister status output format:
#   Balance: 1_000_000_000_000 Cycles
# We strip underscores and the " Cycles" suffix to get a raw integer.

if [ "$NETWORK" != "local" ]; then
  WARNING_CYCLES=500000000000   # 500B
  TOP_UP_TO=2000000000000       # 2T

  for canister in "${CANISTERS[@]}"; do
    STATUS_OUT=$(dfx canister status "$canister" --network "$NETWORK" 2>&1) || {
      echo "  ⚠️  Could not get status for $canister — skipping cycles check"
      continue
    }

    BALANCE_RAW=$(echo "$STATUS_OUT" | grep "Balance:" | head -1 | sed 's/.*Balance: //;s/ Cycles.*//;s/_//g')

    if [ -z "$BALANCE_RAW" ]; then
      echo "  ⚠️  Could not parse cycles balance for $canister"
      continue
    fi

    if [ "$BALANCE_RAW" -lt "$WARNING_CYCLES" ]; then
      NEEDED=$(( TOP_UP_TO - BALANCE_RAW ))
      echo "  ⚠️  $canister is low on cycles (${BALANCE_RAW}) — topping up ${NEEDED} cycles..."
      if dfx canister deposit-cycles "$NEEDED" "$canister" --network "$NETWORK"; then
        echo "  ✓ $canister topped up to ~${TOP_UP_TO} cycles"
      else
        echo "  ✗ Top-up failed for $canister — check wallet balance"
      fi
    else
      echo "  ✓ $canister OK (${BALANCE_RAW} cycles)"
    fi
  done
else
  echo "  (skipped — local network uses fabricated cycles)"
fi

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

# ── PROD.7: Bootstrap admin on every canister that has addAdmin ───────────────
# All canisters (except payment, which has no admin list by design) have an
# adminInitialized / adminListEntries.size() == 0 guard: the very first caller
# of addAdmin becomes the sole admin.  Without this step there is a race window
# between canister creation and the first legitimate admin call where any
# principal could claim admin rights.
#
# payment is intentionally excluded: its comment reads "No admin list in payment
# — protect at the deployment layer (controller only)."

echo ""
echo "============================================"
echo "  Bootstrapping Canister Admins"
echo "============================================"

DEPLOYER=$(dfx identity get-principal)
echo "  Deployer principal: $DEPLOYER"

# All canisters that expose addAdmin, excluding payment (no admin) and
# ai_proxy (handled below alongside its API-key wiring).
ADMIN_CANISTERS=(auth property job contractor quote photo report maintenance market sensor listing agent recurring monitoring)

for canister in "${ADMIN_CANISTERS[@]}"; do
  echo "  $canister: adding deployer as admin..."
  dfx canister call "$canister" addAdmin "(principal \"$DEPLOYER\")" --network "$NETWORK" \
    2>/dev/null || echo "  ⚠️  addAdmin failed for $canister (may already have an admin)"
done

# ── AI Proxy canister — wire API keys from environment ────────────────────────

AI_PROXY_ID=$(dfx canister id ai_proxy --network "$NETWORK" 2>/dev/null || echo "")

if [ -n "$AI_PROXY_ID" ]; then
  echo ""
  echo "============================================"
  echo "  Wiring AI Proxy Canister"
  echo "============================================"

  echo "  ai_proxy: adding deployer ($DEPLOYER) as admin..."
  dfx canister call ai_proxy addAdmin "(principal \"$DEPLOYER\")" --network "$NETWORK"

  if [ -n "${RESEND_API_KEY:-}" ]; then
    echo "  ai_proxy: setting Resend API key..."
    dfx canister call ai_proxy setResendApiKey "(\"$RESEND_API_KEY\")" --network "$NETWORK"
  else
    echo "  ⚠️  RESEND_API_KEY not set — email sending will be disabled"
  fi

  if [ -n "${OPEN_PERMIT_API_KEY:-}" ]; then
    echo "  ai_proxy: setting OpenPermit API key..."
    dfx canister call ai_proxy setOpenPermitApiKey "(\"$OPEN_PERMIT_API_KEY\")" --network "$NETWORK"
  else
    echo "  ⚠️  OPEN_PERMIT_API_KEY not set — OpenPermit lookups will be disabled (Volusia ArcGIS still works)"
  fi

  if [ -n "${RESEND_FROM_ADDRESS:-}" ]; then
    echo "  ai_proxy: setting Resend from address..."
    dfx canister call ai_proxy setResendFromAddress "(\"$RESEND_FROM_ADDRESS\")" --network "$NETWORK"
  fi
fi

echo ""
echo "============================================"
echo "  Controller Hardening"
echo "============================================"
# PROD.9 — If BACKUP_CONTROLLER_PRINCIPAL is set, add it as a second controller
# on every canister so that a single compromised identity cannot destroy the app.
#
# Recommended values:
#   - A hardware-wallet principal (e.g. Ledger via Internet Identity)
#   - A separate CI identity with read-only deploy access
#   - An SNS/governance canister principal (if moving to community ownership)
#
# Set this in CI:  BACKUP_CONTROLLER_PRINCIPAL secret in GitHub environment
# Set this locally: export BACKUP_CONTROLLER_PRINCIPAL=<your-principal>

if [ "$NETWORK" != "local" ]; then
  if [ -n "${BACKUP_CONTROLLER_PRINCIPAL:-}" ]; then
    echo "▶ Adding backup controller ($BACKUP_CONTROLLER_PRINCIPAL) to all canisters..."
    ALL_CANISTERS=("${CANISTERS[@]}" frontend)
    for canister in "${ALL_CANISTERS[@]}"; do
      if dfx canister update-settings "$canister" \
           --add-controller "$BACKUP_CONTROLLER_PRINCIPAL" \
           --network "$NETWORK" 2>/dev/null; then
        echo "  ✓ $canister"
      else
        echo "  ⚠️  Could not add backup controller to $canister"
      fi
    done
  else
    echo "  ⚠️  BACKUP_CONTROLLER_PRINCIPAL is not set."
    echo "     All canisters are controlled only by the deploying identity."
    echo "     If that identity is compromised, all canisters can be deleted."
    echo "     Set BACKUP_CONTROLLER_PRINCIPAL to a hardware-wallet or secondary principal."
  fi
else
  echo "  (skipped — local network)"
fi

echo ""
echo "============================================"
echo "  Building Frontend"
echo "============================================"
# PROD.5 — the frontend build must run AFTER dfx deploy so that .env already
# contains all CANISTER_ID_* values written by dfx.  The build also runs
# gen-ic-assets.mjs which substitutes VITE_VOICE_AGENT_URL into the CSP header
# written to dist/.ic-assets.json5 — that file must exist before the next step.
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
echo "▶ npm run build (frontend)..."
if (cd "$REPO_ROOT/frontend" && npm run build); then
  echo "  ✓ Frontend built (dist/ + .ic-assets.json5 ready)"
else
  echo "  ✗ Frontend build failed — aborting"
  exit 1
fi

echo ""
echo "============================================"
echo "  Deploying Frontend Canister"
echo "============================================"
echo "▶ dfx deploy frontend --network $NETWORK..."
if dfx deploy frontend --network "$NETWORK"; then
  FRONTEND_ID=$(dfx canister id frontend --network "$NETWORK" 2>/dev/null || echo "unknown")
  echo "  ✓ Frontend canister deployed ($FRONTEND_ID)"
else
  echo "  ✗ Frontend canister deploy failed"
  exit 1
fi

echo ""
echo "✅ Deployment complete!"
