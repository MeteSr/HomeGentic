#!/usr/bin/env bash
set -euo pipefail

NETWORK=${1:-local}

DEPLOY_SCRIPT_VERSION="1.1.2"

echo "============================================"
echo "  HomeGentic — Deployment ($NETWORK) v$DEPLOY_SCRIPT_VERSION"
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
    # Avoid --clean on every start: it rotates the replica root key, which
    # invalidates the II service-worker cache and causes a 503 on the II popup.
    # Fall back to --clean only when the saved state is incompatible with the
    # current config (e.g. subnet_type changed) — dfx reports this explicitly.
    START_LOG=$(mktemp)
    dfx start --background >"$START_LOG" 2>&1 || true
    cat "$START_LOG"
    if grep -qi "Rerun with" "$START_LOG"; then
      echo "  ⚠️  Network state incompatible with current config — restarting with --clean"
      dfx start --background --clean
      echo "  ✓ dfx started (clean)"
    elif ! dfx ping 2>/dev/null; then
      echo "  ✗ Failed to start dfx — see output above"
      rm -f "$START_LOG"
      exit 1
    else
      echo "  ✓ dfx started"
    fi
    rm -f "$START_LOG"
  fi
fi

# ── Ensure the deploying identity has enough cycles (local only) ─────────────
# dfx 0.15+ removed `dfx wallet create`; on a fresh local replica the identity
# has no wallet canister and doesn't need one — dfx deploy uses the system
# subnet's implicit cycles on local networks.  We fabricate cycles directly to
# the deploying identity's default canister if a wallet already exists, but we
# no longer try to create one (that subcommand is gone).
if [ "$NETWORK" = "local" ]; then
  WALLET_ID=$(dfx identity get-wallet --network local 2>/dev/null || true)
  if [ -n "$WALLET_ID" ]; then
    echo "▶ Topping up local wallet ($WALLET_ID) with 10T cycles..."
    dfx ledger fabricate-cycles --canister "$WALLET_ID" --t 10
    echo "  ✓ Wallet ready"
  else
    echo "  (no wallet canister — dfx 0.15+ handles cycles automatically on local)"
  fi
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

  # PROD.4 — STRIPE_SECRET_KEY must be set; without it payment processing fails
  # silently and subscriptions cannot be created.
  if [ -z "${STRIPE_SECRET_KEY:-}" ]; then
    echo "  ✗ STRIPE_SECRET_KEY is not set — payment processing will fail"
    PREFLIGHT_FAILED=1
  else
    echo "  ✓ STRIPE_SECRET_KEY is set"
  fi

  # PROD.5 — VITE_STRIPE_PUBLISHABLE_KEY must be set; Stripe.js cannot initialize
  # without it and the frontend payment flow breaks entirely.
  if [ -z "${VITE_STRIPE_PUBLISHABLE_KEY:-}" ]; then
    echo "  ✗ VITE_STRIPE_PUBLISHABLE_KEY is not set — Stripe.js will fail to initialize"
    PREFLIGHT_FAILED=1
  else
    echo "  ✓ VITE_STRIPE_PUBLISHABLE_KEY is set"
  fi

  # PROD.6 — Reject test Stripe key on mainnet. A sk_test_* key on the ic network
  # means real-money subscriptions are silently processed against Stripe's test mode.
  if [ "$NETWORK" = "ic" ] && [[ "${STRIPE_SECRET_KEY:-}" == sk_test_* ]]; then
    echo "  ✗ Test Stripe key (sk_test_*) used on mainnet — use a live key for ic deploys"
    PREFLIGHT_FAILED=1
  fi

  # PROD.7 — DFX identity must not be anonymous; an anonymous deploy means no one
  # owns the canisters and they cannot be upgraded or managed after deployment.
  CURRENT_IDENTITY=$(dfx identity whoami 2>/dev/null || echo "anonymous")
  if [ "$CURRENT_IDENTITY" = "anonymous" ]; then
    echo "  ✗ DFX identity is 'anonymous' — switch with: dfx identity use <name>"
    PREFLIGHT_FAILED=1
  else
    echo "  ✓ DFX identity: $CURRENT_IDENTITY"
  fi

  # PROD.8 — ICP network must be reachable before we spend time building canisters.
  echo -n "  Checking network reachability ($NETWORK)... "
  if dfx ping --network "$NETWORK" >/dev/null 2>&1; then
    echo "✓"
  else
    echo "✗"
    echo "  ✗ ICP network '$NETWORK' is not reachable — check your connection or dfx config"
    PREFLIGHT_FAILED=1
  fi

  if [ "$PREFLIGHT_FAILED" -ne 0 ]; then
    echo ""
    echo "❌ Pre-flight failed. Set the missing secrets and retry."
    exit 1
  fi
  echo ""
fi

# ── DRY_RUN short-circuit ────────────────────────────────────────────────────
# DRY_RUN=1 bash scripts/deploy.sh <network>
# Runs all preflight checks above and exits without deploying anything.
# Useful in CI to validate secrets are wired up correctly before a real deploy.
if [ "${DRY_RUN:-0}" = "1" ]; then
  echo ""
  echo "✅ DRY_RUN=1 — env and network validation passed. Exiting without deploying."
  exit 0
fi

# ── Bootstrap management canister IDL ───────────────────────────────────────────
# caffeineai-http-outcalls/outcall.mo uses `import IC "ic:aaaaa-aa"`.  moc
# resolves that import by looking for aaaaa-aa.did in the --actor-idl directory
# (.dfx/local/canisters/idl/).  dfx start --clean does NOT pre-populate that file,
# so any canister importing the package fails to build until the file exists.
# Write a minimal management-canister DID containing just the HTTP-outcall surface
# that caffeineai-http-outcalls requires.

mkdir -p .dfx/local/canisters/idl
if [ ! -f ".dfx/local/canisters/idl/aaaaa-aa.did" ]; then
  cat > .dfx/local/canisters/idl/aaaaa-aa.did << 'MGMT_DID'
type http_header = record { name : text; value : text };
type http_request_result = record {
  status : nat;
  headers : vec http_header;
  body : blob;
};
type http_request_args = record {
  url : text;
  max_response_bytes : opt nat64;
  headers : vec http_header;
  body : opt blob;
  method : variant { get; head; post };
  transform : opt record {
    function : func (record { response : http_request_result; context : blob }) -> (http_request_result) query;
    context : blob;
  };
  is_replicated : opt bool;
};
service ic : {
  http_request : (http_request_args) -> (http_request_result);
};
MGMT_DID
  echo "  ✓ Management canister IDL written (.dfx/local/canisters/idl/aaaaa-aa.did)"
fi

# ── Internet Identity (pull canister) ───────────────────────────────────────────
# II is declared as a pull canister in dfx.json. Deploy it before the backend
# canisters so the II popup is available as soon as the app is running.
echo ""
echo "============================================"
echo "  Deploying Internet Identity"
echo "============================================"
echo "▶ dfx deps pull..."
if dfx deps pull --network "$NETWORK" 2>/dev/null; then
  echo "  ✓ Dependencies pulled"
else
  echo "  ⚠️  dfx deps pull failed — II canister may already be up to date"
fi
echo "▶ dfx deps deploy..."
if dfx deps deploy --network "$NETWORK" 2>/dev/null; then
  echo "  ✓ Internet Identity deployed"
else
  echo "  ⚠️  dfx deps deploy failed — II canister may already be installed"
fi

# ── Parallel canister deployment ────────────────────────────────────────────────
# Strategy: two phases to eliminate the canister_ids.json write race.
#   Phase 1 — dfx canister create --all (single process, writes all IDs atomically)
#   Phase 2 — parallel dfx build + dfx canister install per canister
#             (install never touches canister_ids.json; each build writes to its
#              own isolated .dfx/local/canisters/<name>/ directory)

CANISTERS=(auth property job contractor quote payment photo report maintenance market sensor monitoring listing agent recurring bills ai_proxy)
LOG_DIR=$(mktemp -d /tmp/dfx-deploy-XXXXXX)

# Phase 1: create all canister IDs in one atomic operation
echo "▶ Creating canister IDs (phase 1/2)..."
dfx canister create --all --network "$NETWORK" 2>/dev/null || true

# Phase 2: build + install every canister in parallel
# auth canister takes an init arg (deployer principal) so it is bootstrapped
# atomically — no window exists for a first-caller race after deploy.
echo "▶ Building and installing ${#CANISTERS[@]} canisters in parallel (phase 2/2)..."
DEPLOY_PRINCIPAL=$(dfx identity get-principal)
PIDS=()
for canister in "${CANISTERS[@]}"; do
  if [ "$canister" = "auth" ]; then
    (
      dfx build auth --network "$NETWORK" 2>&1 && \
      dfx canister install auth --mode reinstall \
        --argument "(principal \"$DEPLOY_PRINCIPAL\")" \
        --network "$NETWORK" --yes 2>&1
    ) >"$LOG_DIR/auth.log" 2>&1 &
  else
    (
      dfx build "$canister" --network "$NETWORK" 2>&1 && \
      dfx canister install "$canister" --mode reinstall --network "$NETWORK" --yes 2>&1
    ) >"$LOG_DIR/$canister.log" 2>&1 &
  fi
  PIDS+=($!)
done

# Collect results
FAILED=()
for i in "${!CANISTERS[@]}"; do
  canister="${CANISTERS[$i]}"
  if wait "${PIDS[$i]}"; then
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
echo "  Validating Canister IDs"
echo "============================================"
# PROD.9 — Every canister must have a non-empty ID after the deploy step.
# An empty ID means the canister failed to create or install silently, which
# can cause the frontend to fall back to mock data (see #138).
CANISTER_ID_FAILED=0
for canister in "${CANISTERS[@]}"; do
  ID=$(dfx canister id "$canister" --network "$NETWORK" 2>/dev/null || echo "")
  if [ -z "$ID" ]; then
    echo "  ✗ $canister: no canister ID — deploy may be incomplete"
    CANISTER_ID_FAILED=1
  else
    echo "  ✓ $canister: $ID"
  fi
done

if [ "$CANISTER_ID_FAILED" -ne 0 ]; then
  echo ""
  echo "❌ One or more canister IDs are missing. Re-run deploy or check logs above."
  exit 1
fi

# PROD.10 — canister_ids.json must exist on non-local deploys.
# This file is the source of truth for CI and upgrade scripts; a missing file
# means the deploy wrote IDs only to ephemeral dfx state.
if [ "$NETWORK" != "local" ]; then
  REPO_ROOT_CID="$(cd "$(dirname "$0")/.." && pwd)/canister_ids.json"
  if [ -f "$REPO_ROOT_CID" ]; then
    echo "  ✓ canister_ids.json present"
  else
    echo "  ⚠️  canister_ids.json not found at $REPO_ROOT_CID — IDs may not persist across dfx restarts"
  fi
fi

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
echo "  Bootstrapping Canister Admins"
echo "============================================"
# Admin bootstrap must run BEFORE inter-canister wiring because every
# setPaymentCanisterId / setPropertyCanisterId / addTrustedCanister call
# requires an admin to be present — failing silently here leaves canisters
# unwired and causes test failures downstream.

DEPLOYER=$(dfx identity get-principal)
echo "  Deployer principal: $DEPLOYER"

# All canisters that expose addAdmin, excluding auth (bootstrapped via init arg)
# and ai_proxy (handled separately below).
ADMIN_CANISTERS=(property job contractor quote photo report maintenance market sensor listing agent recurring bills monitoring)

# Fire all addAdmin calls in parallel — each targets a different canister so
# there is no shared state and no ordering requirement between them.
for canister in "${ADMIN_CANISTERS[@]}"; do
  echo "  $canister: adding deployer as admin..."
  dfx canister call "$canister" addAdmin "(principal \"$DEPLOYER\")" --network "$NETWORK" \
    2>/dev/null &
done
wait   # wait for all addAdmin calls before proceeding to payment (which depends on none of them)

# payment uses initAdmins (one-time bootstrap) instead of addAdmin.
# Without this, grantSubscription returns NotAuthorized and all
# job / quote / photo tests that call it via the payment canister fail.
echo "  payment: initializing admin list..."
dfx canister call payment initAdmins "(vec { principal \"$DEPLOYER\" })" --network "$NETWORK" \
  2>/dev/null || echo "  ⚠️  payment initAdmins failed (may already be initialized)"

# Grant the deployer a Pro subscription so backend tests (job, quote, photo)
# can call createJob / createQuoteRequest / uploadPhoto without hitting the
# Free-tier block. Tests that need to test tier limits downgrade explicitly.
echo "  payment: granting deployer Pro subscription for test compatibility..."
dfx canister call payment grantSubscription "(principal \"$DEPLOYER\", variant { Pro })" --network "$NETWORK" \
  2>/dev/null || echo "  ⚠️  grantSubscription failed"

echo ""
echo "============================================"
echo "  Wiring Inter-Canister IDs"
echo "============================================"

JOB_ID=$(dfx canister id job --network "$NETWORK" 2>/dev/null || echo "")
PAYMENT_ID=$(dfx canister id payment --network "$NETWORK" 2>/dev/null || echo "")
CONTRACTOR_ID=$(dfx canister id contractor --network "$NETWORK" 2>/dev/null || echo "")
PROPERTY_ID=$(dfx canister id property --network "$NETWORK" 2>/dev/null || echo "")
PHOTO_ID=$(dfx canister id photo --network "$NETWORK" 2>/dev/null || echo "")
QUOTE_ID=$(dfx canister id quote --network "$NETWORK" 2>/dev/null || echo "")
SENSOR_ID=$(dfx canister id sensor --network "$NETWORK" 2>/dev/null || echo "")
REPORT_ID=$(dfx canister id report --network "$NETWORK" 2>/dev/null || echo "")

# ── Canister ID wiring (target canister ID strings for cross-calls) ────────────
# Each call writes to a different canister's stable variable — fire in parallel.

BILLS_ID=$(dfx canister id bills --network "$NETWORK" 2>/dev/null || echo "")

if [ -n "$JOB_ID" ]      && [ -n "$PAYMENT_ID" ];    then
  echo "  Wiring payment -> job..."
  dfx canister call job      setPaymentCanisterId    "(\"$PAYMENT_ID\")"          --network "$NETWORK" &
fi
if [ -n "$PROPERTY_ID" ] && [ -n "$PAYMENT_ID" ];    then
  echo "  Wiring payment -> property..."
  dfx canister call property setPaymentCanisterId    "(principal \"$PAYMENT_ID\")" --network "$NETWORK" 2>/dev/null &
fi
if [ -n "$PHOTO_ID" ]    && [ -n "$PAYMENT_ID" ];    then
  echo "  Wiring payment -> photo..."
  dfx canister call photo    setPaymentCanisterId    "(principal \"$PAYMENT_ID\")" --network "$NETWORK" 2>/dev/null &
fi
if [ -n "$QUOTE_ID" ]    && [ -n "$PAYMENT_ID" ];    then
  echo "  Wiring payment -> quote..."
  dfx canister call quote    setPaymentCanisterId    "(principal \"$PAYMENT_ID\")" --network "$NETWORK" 2>/dev/null &
fi

# ── Tier propagation admin grants ─────────────────────────────────────────────
# payment must be an admin in property/quote/photo to call setTier() cross-canister.
# Without this, all propagateTier() calls return #NotAuthorized and tier limits
# in those canisters silently remain at #Free for everyone (#139).
if [ -n "$PAYMENT_ID" ] && [ -n "$PROPERTY_ID" ]; then
  echo "  property: adding payment as admin (for tier propagation)..."
  dfx canister call property addAdmin "(principal \"$PAYMENT_ID\")" --network "$NETWORK" 2>/dev/null &
fi
if [ -n "$PAYMENT_ID" ] && [ -n "$QUOTE_ID" ]; then
  echo "  quote: adding payment as admin (for tier propagation)..."
  dfx canister call quote addAdmin "(principal \"$PAYMENT_ID\")" --network "$NETWORK" 2>/dev/null &
fi
if [ -n "$PAYMENT_ID" ] && [ -n "$PHOTO_ID" ]; then
  echo "  photo: adding payment as admin (for tier propagation)..."
  dfx canister call photo addAdmin "(principal \"$PAYMENT_ID\")" --network "$NETWORK" 2>/dev/null &
fi

# ── Tier propagation canister ID wiring ────────────────────────────────────────
# Tells payment which canister IDs to call setTier() on when a subscription changes.
if [ -n "$PAYMENT_ID" ] && [ -n "$PROPERTY_ID" ] && [ -n "$QUOTE_ID" ] && [ -n "$PHOTO_ID" ]; then
  echo "  Wiring tier propagation: payment -> property, quote, photo..."
  dfx canister call payment setTierCanisterIds \
    "(principal \"$PROPERTY_ID\", principal \"$QUOTE_ID\", principal \"$PHOTO_ID\")" \
    --network "$NETWORK" 2>/dev/null &
fi
if [ -n "$BILLS_ID" ]    && [ -n "$PAYMENT_ID" ];    then
  echo "  Wiring payment -> bills..."
  dfx canister call bills    setPaymentCanisterId    "(\"$PAYMENT_ID\")"          --network "$NETWORK" &
fi
if [ -n "$JOB_ID" ]      && [ -n "$CONTRACTOR_ID" ]; then
  echo "  Wiring contractor -> job..."
  dfx canister call job      setContractorCanisterId "(\"$CONTRACTOR_ID\")"       --network "$NETWORK" &
fi
if [ -n "$JOB_ID" ]      && [ -n "$PROPERTY_ID" ];   then
  echo "  Wiring property -> job..."
  dfx canister call job      setPropertyCanisterId   "(\"$PROPERTY_ID\")"         --network "$NETWORK" &
fi
if [ -n "$PHOTO_ID" ]    && [ -n "$PROPERTY_ID" ];   then
  echo "  Wiring property -> photo..."
  dfx canister call photo    setPropertyCanisterId   "(principal \"$PROPERTY_ID\")" --network "$NETWORK" &
fi
if [ -n "$QUOTE_ID" ]    && [ -n "$PROPERTY_ID" ];   then
  echo "  Wiring property -> quote..."
  dfx canister call quote    setPropertyCanisterId   "(principal \"$PROPERTY_ID\")" --network "$NETWORK" &
fi
MAINTENANCE_ID=$(dfx canister id maintenance --network "$NETWORK" 2>/dev/null || echo "")
if [ -n "$MAINTENANCE_ID" ] && [ -n "$PROPERTY_ID" ]; then
  echo "  Wiring property -> maintenance..."
  dfx canister call maintenance setPropertyCanisterId "(principal \"$PROPERTY_ID\")" --network "$NETWORK" &
fi

wait   # wait for all wiring calls before reading IDs in the trusted-canister section

# ── Trusted canister wiring (derived from call topology) ──────────────────────
# These mirror the actual inter-canister call graph so each canister auto-trusts
# its known callers. Admins can add external canisters later via addTrustedCanister.

echo ""
echo "============================================"
echo "  Wiring Trusted Canister Lists"
echo "============================================"

# All addTrustedCanister calls target different canisters or append to independent
# lists — fire them in parallel then wait before moving on.

# payment trusts job/property/photo/quote (all call getTierForPrincipal)
if [ -n "$JOB_ID" ]      && [ -n "$PAYMENT_ID" ]; then
  echo "  payment: trusting job ($JOB_ID)..."
  dfx canister call payment addTrustedCanister "(principal \"$JOB_ID\")"      --network "$NETWORK" 2>/dev/null &
fi
if [ -n "$PROPERTY_ID" ] && [ -n "$PAYMENT_ID" ]; then
  echo "  payment: trusting property ($PROPERTY_ID)..."
  dfx canister call payment addTrustedCanister "(principal \"$PROPERTY_ID\")" --network "$NETWORK" 2>/dev/null &
fi
if [ -n "$PHOTO_ID" ]    && [ -n "$PAYMENT_ID" ]; then
  echo "  payment: trusting photo ($PHOTO_ID)..."
  dfx canister call payment addTrustedCanister "(principal \"$PHOTO_ID\")"    --network "$NETWORK" 2>/dev/null &
fi
if [ -n "$QUOTE_ID" ]    && [ -n "$PAYMENT_ID" ]; then
  echo "  payment: trusting quote ($QUOTE_ID)..."
  dfx canister call payment addTrustedCanister "(principal \"$QUOTE_ID\")"    --network "$NETWORK" 2>/dev/null &
fi

# contractor trusts job (job calls recordJobVerified)
if [ -n "$JOB_ID" ] && [ -n "$CONTRACTOR_ID" ]; then
  echo "  contractor: trusting job ($JOB_ID)..."
  dfx canister call contractor addTrustedCanister "(principal \"$JOB_ID\")"   --network "$NETWORK" 2>/dev/null &
fi

# property trusts job/photo/quote/report
if [ -n "$JOB_ID" ]    && [ -n "$PROPERTY_ID" ]; then
  echo "  property: trusting job ($JOB_ID)..."
  dfx canister call property addTrustedCanister "(principal \"$JOB_ID\")"     --network "$NETWORK" 2>/dev/null &
fi
if [ -n "$PHOTO_ID" ]  && [ -n "$PROPERTY_ID" ]; then
  echo "  property: trusting photo ($PHOTO_ID)..."
  dfx canister call property addTrustedCanister "(principal \"$PHOTO_ID\")"   --network "$NETWORK" 2>/dev/null &
fi
if [ -n "$QUOTE_ID" ]  && [ -n "$PROPERTY_ID" ]; then
  echo "  property: trusting quote ($QUOTE_ID)..."
  dfx canister call property addTrustedCanister "(principal \"$QUOTE_ID\")"   --network "$NETWORK" 2>/dev/null &
fi
if [ -n "$REPORT_ID" ] && [ -n "$PROPERTY_ID" ]; then
  echo "  property: trusting report ($REPORT_ID)..."
  dfx canister call property addTrustedCanister "(principal \"$REPORT_ID\")"  --network "$NETWORK" 2>/dev/null &
fi

# job trusts sensor (sensor calls createSensorJob)
if [ -n "$SENSOR_ID" ] && [ -n "$JOB_ID" ]; then
  echo "  job: trusting sensor ($SENSOR_ID)..."
  dfx canister call job addTrustedCanister "(principal \"$SENSOR_ID\")"       --network "$NETWORK" 2>/dev/null &
fi

wait   # wait for all trust wiring before moving on

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
export DFX_NETWORK="$NETWORK"
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
