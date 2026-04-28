#!/usr/bin/env bash
set -euo pipefail

DEPLOY_SCRIPT_VERSION="1.4.12"
ENV=${1:-local}

echo "============================================"
echo "  HomeGentic — Deployment ($ENV) v${DEPLOY_SCRIPT_VERSION}"
echo "============================================"

# ── Identity setup ────────────────────────────────────────────────────────────
if [ "$ENV" != "local" ] && [ -n "${DFX_IDENTITY_PEM:-}" ]; then
  # CI / non-local: load identity from secret
  echo "▶ Loading ICP identity from DFX_IDENTITY_PEM secret..."
  IDENTITY_FILE=$(mktemp /tmp/icp-identity-XXXXXX.pem)
  printf '%s' "$DFX_IDENTITY_PEM" > "$IDENTITY_FILE"
  icp identity import ci-deploy --from-pem "$IDENTITY_FILE" --storage plaintext 2>/dev/null || true
  icp identity default ci-deploy
  rm -f "$IDENTITY_FILE"
  echo "  ✓ Identity loaded"
else
  # Local: icp-cli has no auto-created default identity like dfx does.
  # If the current identity is anonymous (2vxsx-fae), create a persistent
  # local identity so admin/wiring calls are not rejected by inspect_message.
  _PRINCIPAL=$(icp identity principal 2>/dev/null || echo "2vxsx-fae")
  if [ "$_PRINCIPAL" = "2vxsx-fae" ]; then
    echo "▶ Creating local deploy identity (homegentic-local)..."
    # --storage plaintext is required on headless Linux (no keyring daemon).
    # Fall back to openssl PEM import if `new` is not supported by this build.
    if ! icp identity new homegentic-local --storage plaintext 2>/dev/null && \
       ! icp identity new homegentic-local 2>/dev/null; then
      _ID_PEM=$(mktemp /tmp/hg-deploy-XXXXXX.pem)
      openssl genpkey -algorithm Ed25519 -out "$_ID_PEM" 2>/dev/null
      icp identity import homegentic-local --from-pem "$_ID_PEM" --storage plaintext \
        2>/dev/null || true
      rm -f "$_ID_PEM"
    fi
    if ! icp identity default homegentic-local 2>/dev/null; then
      echo "  ERROR: failed to create or activate identity 'homegentic-local'"
      echo "  Fix: icp identity new homegentic-local --storage plaintext"
      exit 1
    fi
    echo "  ✓ Identity: $(icp identity principal)"
  fi
fi

# ── Ensure mops toolchain (moc) is initialized ───────────────────────────────
# icp-cli's motoko recipe resolves the compiler via `mops toolchain bin moc`.
# mops toolchain init is idempotent — safe to run every time.
echo "▶ Initializing mops toolchain..."
mops toolchain init 2>/dev/null || true
echo "  ✓ mops toolchain initialized"

# Pre-warm moc binary BEFORE parallel builds.
# mops toolchain bin moc downloads + extracts the tarball on first call.
# Without this, 17 parallel icp build processes race to download the same
# file simultaneously, causing ENOENT failures and old-moc fallbacks.
echo "▶ Pre-warming moc compiler..."
MOC_BIN=$(mops toolchain bin moc 2>/dev/null) || MOC_BIN=""
if [ -z "$MOC_BIN" ]; then
  echo "  First call failed — clearing tmp cache and retrying..."
  rm -rf .mops/_tmp
  mops toolchain init 2>/dev/null || true
  MOC_BIN=$(mops toolchain bin moc) || { echo "  ERROR: cannot resolve moc binary"; exit 1; }
fi
echo "  ✓ moc ready: $MOC_BIN"

# Ensure ic-wasm is available — required by @dfinity/motoko@v4.0.0 recipe step 2.
echo "▶ Checking ic-wasm..."
if ! command -v ic-wasm >/dev/null 2>&1; then
  # dfx bundles ic-wasm; check common install paths before downloading
  for _dfx_bin in "$HOME/.local/share/dfx/bin" "$HOME/.dfinity/bin"; do
    if [ -x "$_dfx_bin/ic-wasm" ]; then
      export PATH="$_dfx_bin:$PATH"
      break
    fi
  done
fi
if ! command -v ic-wasm >/dev/null 2>&1; then
  echo "  ic-wasm not found — downloading 0.9.11..."
  _IC_WASM_TMP=$(mktemp -d)
  curl -sSfL \
    "https://github.com/dfinity/ic-wasm/releases/download/0.9.11/ic-wasm-x86_64-unknown-linux-musl.tar.xz" \
    -o "$_IC_WASM_TMP/ic-wasm.tar.xz"
  tar -xJf "$_IC_WASM_TMP/ic-wasm.tar.xz" -C "$_IC_WASM_TMP"
  mkdir -p "$HOME/.local/bin"
  _IC_WASM_FILE=$(find "$_IC_WASM_TMP" -name "ic-wasm" -type f | head -1)
  cp "$_IC_WASM_FILE" "$HOME/.local/bin/ic-wasm"
  chmod +x "$HOME/.local/bin/ic-wasm"
  rm -rf "$_IC_WASM_TMP"
  export PATH="$HOME/.local/bin:$PATH"
fi
echo "  ✓ ic-wasm: $(ic-wasm --version 2>/dev/null | head -1)"

if [ "$ENV" = "local" ]; then
  echo "▶ Starting local ICP network..."
  if icp network ping local >/dev/null 2>&1; then
    echo "  ✓ Local network is already running"
  else
    # icp network start -d starts PocketIC in detached (background) mode.
    # The managed local network automatically provides system canisters
    # including Internet Identity — no separate deps pull needed.
    icp network stop 2>/dev/null || true
    icp network start -d
    echo "  ✓ Local network started"
  fi

fi

# ── Pre-flight checks (non-local networks only) ──────────────────────────────────
if [ "$ENV" != "local" ]; then
  echo ""
  echo "============================================"
  echo "  Pre-flight Checks ($ENV)"
  echo "============================================"
  PREFLIGHT_FAILED=0

  # PROD.1 — ANTHROPIC_API_KEY must be set
  if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
    echo "  ✗ ANTHROPIC_API_KEY is not set — Claude API calls will fail"
    PREFLIGHT_FAILED=1
  else
    echo "  ✓ ANTHROPIC_API_KEY is set"
  fi

  # PROD.2 — VOICE_AGENT_API_KEY must be set
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

  # PROD.4 — STRIPE_SECRET_KEY must be set
  if [ -z "${STRIPE_SECRET_KEY:-}" ]; then
    echo "  ✗ STRIPE_SECRET_KEY is not set — payment processing will fail"
    PREFLIGHT_FAILED=1
  else
    echo "  ✓ STRIPE_SECRET_KEY is set"
  fi

  # PROD.5 — VITE_STRIPE_PUBLISHABLE_KEY must be set
  if [ -z "${VITE_STRIPE_PUBLISHABLE_KEY:-}" ]; then
    echo "  ✗ VITE_STRIPE_PUBLISHABLE_KEY is not set — Stripe.js will fail to initialize"
    PREFLIGHT_FAILED=1
  else
    echo "  ✓ VITE_STRIPE_PUBLISHABLE_KEY is set"
  fi

  # PROD.6 — Reject test Stripe key on mainnet
  if [ "$ENV" = "ic" ] && [[ "${STRIPE_SECRET_KEY:-}" == sk_test_* ]]; then
    echo "  ✗ Test Stripe key (sk_test_*) used on mainnet — use a live key for ic deploys"
    PREFLIGHT_FAILED=1
  fi

  # PROD.7 — Identity must not be anonymous
  CURRENT_PRINCIPAL=$(icp identity principal 2>/dev/null || echo "2vxsx-fae")
  if [ "$CURRENT_PRINCIPAL" = "2vxsx-fae" ]; then
    echo "  ✗ ICP identity is anonymous — switch with: icp identity default <name>"
    PREFLIGHT_FAILED=1
  else
    echo "  ✓ ICP identity principal: $CURRENT_PRINCIPAL"
  fi

  # PROD.8 — Network must be reachable
  echo -n "  Checking network reachability ($ENV)... "
  if icp network ping "$ENV" >/dev/null 2>&1; then
    echo "✓"
  else
    echo "✗"
    echo "  ✗ ICP network '$ENV' is not reachable — check your connection or icp.yaml"
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
if [ "${DRY_RUN:-0}" = "1" ]; then
  echo ""
  echo "✅ DRY_RUN=1 — env and network validation passed. Exiting without deploying."
  exit 0
fi

# ── Canister deployment ───────────────────────────────────────────────────────────
# Two paths:
#   local  — icp deploy <canister> (all-in-one: create+build+install). icp canister
#             create requires a funded cycles balance even with --cycles 0; icp deploy
#             bypasses this by using a different PocketIC code path.
#   non-local — three-phase: create (sequential) → build (sequential) → install
#               (sequential). Sequential builds avoid concurrent writes to local.ids.json.

CANISTERS=(auth property job contractor quote payment photo report maintenance market sensor monitoring listing agent recurring bills ai_proxy)
LOG_DIR=$(mktemp -d /tmp/icp-deploy-XXXXXX)
trap 'rm -rf "$LOG_DIR"' EXIT
DEPLOY_PRINCIPAL=$(icp identity principal)

# ── Seed icp-cli state from canister_ids.json ────────────────────────────────
# icp canister install resolves names via .icp/data/mappings/<env>.ids.json.
# On a fresh CI runner that file doesn't exist; generate it from the committed
# canister_ids.json so installs work without re-creating canister slots.
if [ "$ENV" != "local" ] && [ -f "canister_ids.json" ] && command -v python3 >/dev/null 2>&1; then
  mkdir -p ".icp/data/mappings"
  python3 - <<'PYEOF'
import json, os, sys
env = os.environ.get("ENV", "")
src = json.load(open("canister_ids.json"))
flat = {k: v[env] for k, v in src.items() if isinstance(v, dict) and v.get(env)}
dest = f".icp/data/mappings/{env}.ids.json"
json.dump(flat, open(dest, "w"), indent=2)
print(f"  ✓ Seeded {len(flat)} canister IDs into {dest}")
PYEOF
fi

# ── Determine which canisters need new slot creation ─────────────────────────
# Read canister_ids.json to skip creation for canisters already deployed.
# Upgrade deploys (all IDs known) cost 0 cycles — only fresh canisters need 2T each.
CANISTERS_TO_CREATE=()
if [ "$ENV" != "local" ] && [ -f "canister_ids.json" ] && command -v python3 >/dev/null 2>&1; then
  for _c in "${CANISTERS[@]}"; do
    _id=$(python3 -c "import json,sys; d=json.load(open('canister_ids.json')); print(d.get('$_c',{}).get('$ENV',''))" 2>/dev/null || echo "")
    [ -z "$_id" ] && CANISTERS_TO_CREATE+=("$_c")
  done
else
  CANISTERS_TO_CREATE=("${CANISTERS[@]}")
fi

if [ ${#CANISTERS_TO_CREATE[@]} -eq 0 ]; then
  echo "▶ All canister IDs found in canister_ids.json — upgrade deploy, skipping slot creation"
elif [ ${#CANISTERS_TO_CREATE[@]} -lt ${#CANISTERS[@]} ]; then
  echo "▶ ${#CANISTERS_TO_CREATE[@]} new canister(s) need slot creation: ${CANISTERS_TO_CREATE[*]}"
fi

# ── Fund cycles ledger from dfx wallet (non-local fresh deploy only) ─────────
# Only needed when creating new canister slots (2T each). Upgrade deploys skip this.
if [ "$ENV" != "local" ] && [ ${#CANISTERS_TO_CREATE[@]} -gt 0 ] && [ -n "${DFX_WALLET_ID:-}" ] && [ -n "${DFX_IDENTITY_PEM:-}" ]; then
  echo "▶ Configuring dfx wallet for cycles-funded canister creation..."
  _DFX_PEM=$(mktemp /tmp/dfx-pem-XXXXXX.pem)
  printf '%s' "$DFX_IDENTITY_PEM" > "$_DFX_PEM"
  dfx identity import --storage-mode=plaintext ci-deploy "$_DFX_PEM" 2>/dev/null || true
  dfx identity use ci-deploy
  dfx identity set-wallet "$DFX_WALLET_ID" --network ic
  rm -f "$_DFX_PEM"
  echo "  ✓ dfx wallet: $DFX_WALLET_ID"

  # 18 canisters × 2T each = 36T minimum; use 40T to include overhead.
  # Wallet must hold ≥ 40T cycles — top up at https://nns.ic0.app if needed.
  _FUND=40000000000000
  echo "▶ Depositing ${_FUND} cycles from wallet to cycles ledger for $DEPLOY_PRINCIPAL..."
  if dfx canister call um5iw-rqaaa-aaaaq-qaaba-cai deposit \
    "(record { to = record { owner = principal \"$DEPLOY_PRINCIPAL\"; subaccount = null }; memo = null; created_at_time = null })" \
    --with-cycles "$_FUND" \
    --wallet "$DFX_WALLET_ID" \
    --network ic; then
    echo "  ✓ Cycles ledger funded"
  else
    echo "  ⚠️  Cycles ledger deposit failed."
    echo "     Ensure wallet $DFX_WALLET_ID has ≥ 40T cycles before a fresh deploy."
    echo "     Upgrade deploys (canisters already exist) do not need this step."
  fi
fi

if [ "$ENV" = "local" ]; then
  # PocketIC starts with 0 cycles — mint enough for all 18 canisters (2T each)
  # plus generous headroom for storage and inter-canister calls.
  echo "▶ Minting local cycles..."
  icp cycles mint 100000000000000 -e local >/dev/null 2>&1 || true
  echo "  ✓ Cycles minted (100T)"

  # ── Local: all-in-one icp deploy ────────────────────────────────────────────
  echo ""
  echo "▶ Deploying all canisters (local)..."
  for canister in "${CANISTERS[@]}"; do
    echo -n "  $canister... "
    if [ "$canister" = "auth" ]; then
      if icp deploy auth \
          --args "(principal \"$DEPLOY_PRINCIPAL\")" \
          -e "$ENV" \
          >"$LOG_DIR/auth.deploy.log" 2>&1; then
        echo "✓"
      else
        echo "FAILED"
        echo ""
        echo "── auth deploy log ──────────────────────────"
        cat "$LOG_DIR/auth.deploy.log"
        rm -rf "$LOG_DIR"
        exit 1
      fi
    else
      if icp deploy "$canister" -e "$ENV" >"$LOG_DIR/$canister.deploy.log" 2>&1; then
        echo "✓"
      else
        echo "FAILED"
        echo ""
        echo "── $canister deploy log ──────────────────────────"
        cat "$LOG_DIR/$canister.deploy.log"
        rm -rf "$LOG_DIR"
        exit 1
      fi
    fi
  done

else
  # ── Non-local: three-phase deploy (create → build → install) ────────────────
  # Phase 1: Create canister slots (skipped for already-deployed canisters)
  echo ""
  echo "▶ Phase 1/3 — Creating canister slots..."
  for canister in "${CANISTERS[@]}"; do
    echo -n "  $canister... "
    # Check canister_ids.json first — if the ID is recorded, no slot creation needed.
    _known_id=""
    if [ -f "canister_ids.json" ] && command -v python3 >/dev/null 2>&1; then
      _known_id=$(python3 -c "import json,sys; d=json.load(open('canister_ids.json')); print(d.get('$canister',{}).get('$ENV',''))" 2>/dev/null || echo "")
    fi
    if [ -n "$_known_id" ]; then
      echo "exists ($_known_id)"
      continue
    fi
    if icp canister create "$canister" -e "$ENV" >"$LOG_DIR/$canister.create.log" 2>&1; then
      echo "created"
    else
      EXISTING_ID=$(icp canister status "$canister" -e "$ENV" --id-only 2>/dev/null || echo "")
      if [ -n "$EXISTING_ID" ]; then
        echo "exists ($EXISTING_ID)"
      else
        echo "FAILED"
        echo ""
        echo "── $canister create log ──────────────────────────"
        cat "$LOG_DIR/$canister.create.log"
        rm -rf "$LOG_DIR"
        exit 1
      fi
    fi
  done

  # Phase 2: Build all canisters sequentially
  echo ""
  echo "▶ Phase 2/3 — Compiling all canisters..."
  BUILD_FAILED=()
  for canister in "${CANISTERS[@]}"; do
    echo -n "  $canister... "
    if icp build "$canister" >"$LOG_DIR/$canister.build.log" 2>&1; then
      echo "✓"
    else
      echo "✗"
      BUILD_FAILED+=("$canister")
    fi
  done

  if [ ${#BUILD_FAILED[@]} -gt 0 ]; then
    echo ""
    echo "❌ Build failed for: ${BUILD_FAILED[*]}"
    for canister in "${BUILD_FAILED[@]}"; do
      echo ""
      echo "── $canister build log ──────────────────────────"
      cat "$LOG_DIR/$canister.build.log"
    done
    rm -rf "$LOG_DIR"
    exit 1
  fi

  # Phase 3: Install canisters sequentially
  echo ""
  echo "▶ Phase 3/3 — Installing canisters..."
  INSTALL_FAILED=()
  for canister in "${CANISTERS[@]}"; do
    echo -n "  $canister... "
    if [ "$canister" = "auth" ]; then
      if icp canister install auth \
          --args "(principal \"$DEPLOY_PRINCIPAL\")" \
          --mode auto \
          -e "$ENV" \
          >"$LOG_DIR/auth.install.log" 2>&1; then
        echo "✓"
      else
        echo "✗"
        INSTALL_FAILED+=("$canister")
      fi
    else
      if icp canister install "$canister" \
          --mode auto \
          -e "$ENV" \
          >"$LOG_DIR/$canister.install.log" 2>&1; then
        echo "✓"
      else
        echo "✗"
        INSTALL_FAILED+=("$canister")
      fi
    fi
  done

  if [ ${#INSTALL_FAILED[@]} -gt 0 ]; then
    echo ""
    echo "❌ Install failed for: ${INSTALL_FAILED[*]}"
    for canister in "${INSTALL_FAILED[@]}"; do
      echo ""
      echo "── $canister install log ──────────────────────────"
      cat "$LOG_DIR/$canister.install.log"
    done
    rm -rf "$LOG_DIR"
    exit 1
  fi
fi

rm -rf "$LOG_DIR"

echo ""
echo "============================================"
echo "  Deployed Canister IDs"
echo "============================================"
for canister in "${CANISTERS[@]}"; do
  ID=$(icp canister status "$canister" -e "$ENV" --id-only 2>/dev/null || echo "not deployed")
  echo "  $canister: $ID"
done

echo ""
echo "============================================"
echo "  Validating Canister IDs"
echo "============================================"
CANISTER_ID_FAILED=0
for canister in "${CANISTERS[@]}"; do
  ID=$(icp canister status "$canister" -e "$ENV" --id-only 2>/dev/null || echo "")
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

# ── Write canister IDs to .env for the frontend build ────────────────────────
# icp-cli does not have dfx's output_env_file feature; write CANISTER_ID_* vars
# manually so Vite can substitute them during npm run build.
echo ""
echo "============================================"
echo "  Writing Canister IDs to .env"
echo "============================================"
for canister in "${CANISTERS[@]}"; do
  ID=$(icp canister status "$canister" -e "$ENV" --id-only 2>/dev/null || echo "")
  VAR_NAME="CANISTER_ID_$(echo "$canister" | tr '[:lower:]' '[:upper:]')"
  # Update or append the variable in .env
  if grep -q "^${VAR_NAME}=" .env 2>/dev/null; then
    sed -i "s|^${VAR_NAME}=.*|${VAR_NAME}=${ID}|" .env
  else
    echo "${VAR_NAME}=${ID}" >> .env
  fi
  echo "  ✓ ${VAR_NAME}=${ID}"
done
# Also write DFX_NETWORK for any code that still reads it
if grep -q "^DFX_NETWORK=" .env 2>/dev/null; then
  sed -i "s|^DFX_NETWORK=.*|DFX_NETWORK=${ENV}|" .env
else
  echo "DFX_NETWORK=${ENV}" >> .env
fi

echo ""
echo "============================================"
echo "  Cycles Balance Check"
echo "============================================"
# On non-local networks, verify each canister has enough cycles.
# TODO: icp-cli equivalent of dfx canister deposit-cycles is `icp cycles transfer`.
# Balance parsing may need adjustment based on `icp canister status` output format.

if [ "$ENV" != "local" ]; then
  WARNING_CYCLES=500000000000   # 500B
  TOP_UP_TO=2000000000000       # 2T

  for canister in "${CANISTERS[@]}"; do
    STATUS_OUT=$(icp canister status "$canister" -e "$ENV" 2>&1) || {
      echo "  ⚠️  Could not get status for $canister — skipping cycles check"
      continue
    }

    BALANCE_RAW=$(echo "$STATUS_OUT" | grep "Balance:" | head -1 | sed 's/.*Balance: //;s/ Cycles.*//;s/_//g') || BALANCE_RAW=""

    if [ -z "$BALANCE_RAW" ] || ! [[ "$BALANCE_RAW" =~ ^[0-9]+$ ]]; then
      echo "  ⚠️  Could not parse cycles balance for $canister"
      continue
    fi

    if [ "$BALANCE_RAW" -lt "$WARNING_CYCLES" ]; then
      NEEDED=$(( TOP_UP_TO - BALANCE_RAW ))
      echo "  ⚠️  $canister is low on cycles (${BALANCE_RAW}) — topping up ${NEEDED} cycles..."
      # TODO: verify icp cycles transfer syntax once icp-cli stabilises
      if icp cycles transfer "$NEEDED" "$canister" -e "$ENV"; then
        echo "  ✓ $canister topped up to ~${TOP_UP_TO} cycles"
      else
        echo "  ✗ Top-up failed for $canister — check wallet balance"
      fi
    else
      echo "  ✓ $canister OK (${BALANCE_RAW} cycles)"
    fi
  done
else
  echo "  (skipped — local managed network uses system cycles)"
fi

echo ""
echo "============================================"
echo "  Bootstrapping Canister Admins"
echo "============================================"
DEPLOYER=$(icp identity principal)
echo "  Deployer principal: $DEPLOYER"

ADMIN_CANISTERS=(property job contractor quote photo report maintenance market sensor listing agent recurring bills monitoring)

for canister in "${ADMIN_CANISTERS[@]}"; do
  echo "  $canister: adding deployer as admin..."
  icp canister call "$canister" addAdmin "(principal \"$DEPLOYER\")" -e "$ENV" \
    2>/dev/null &
done
wait

echo "  payment: initializing admin list..."
icp canister call payment initAdmins "(vec { principal \"$DEPLOYER\" })" -e "$ENV" \
  2>/dev/null || echo "  ⚠️  payment initAdmins failed (may already be initialized)"

echo "  payment: granting deployer Pro subscription for test compatibility..."
icp canister call payment grantSubscription "(principal \"$DEPLOYER\", variant { Pro })" -e "$ENV" \
  2>/dev/null || echo "  ⚠️  grantSubscription failed"

echo ""
echo "============================================"
echo "  Wiring Inter-Canister IDs"
echo "============================================"

JOB_ID=$(icp canister status job -e "$ENV" --id-only 2>/dev/null || echo "")
PAYMENT_ID=$(icp canister status payment -e "$ENV" --id-only 2>/dev/null || echo "")
CONTRACTOR_ID=$(icp canister status contractor -e "$ENV" --id-only 2>/dev/null || echo "")
PROPERTY_ID=$(icp canister status property -e "$ENV" --id-only 2>/dev/null || echo "")
PHOTO_ID=$(icp canister status photo -e "$ENV" --id-only 2>/dev/null || echo "")
QUOTE_ID=$(icp canister status quote -e "$ENV" --id-only 2>/dev/null || echo "")
SENSOR_ID=$(icp canister status sensor -e "$ENV" --id-only 2>/dev/null || echo "")
REPORT_ID=$(icp canister status report -e "$ENV" --id-only 2>/dev/null || echo "")
BILLS_ID=$(icp canister status bills -e "$ENV" --id-only 2>/dev/null || echo "")

if [ -n "$JOB_ID" ]      && [ -n "$PAYMENT_ID" ];    then
  echo "  Wiring payment -> job..."
  icp canister call job      setPaymentCanisterId    "(\"$PAYMENT_ID\")"          -e "$ENV" &
fi
if [ -n "$PROPERTY_ID" ] && [ -n "$PAYMENT_ID" ];    then
  echo "  Wiring payment -> property..."
  icp canister call property setPaymentCanisterId    "(principal \"$PAYMENT_ID\")" -e "$ENV" 2>/dev/null &
fi
if [ -n "$PHOTO_ID" ]    && [ -n "$PAYMENT_ID" ];    then
  echo "  Wiring payment -> photo..."
  icp canister call photo    setPaymentCanisterId    "(principal \"$PAYMENT_ID\")" -e "$ENV" 2>/dev/null &
fi
if [ -n "$QUOTE_ID" ]    && [ -n "$PAYMENT_ID" ];    then
  echo "  Wiring payment -> quote..."
  icp canister call quote    setPaymentCanisterId    "(principal \"$PAYMENT_ID\")" -e "$ENV" 2>/dev/null &
fi

if [ -n "$PAYMENT_ID" ] && [ -n "$PROPERTY_ID" ]; then
  echo "  property: adding payment as admin (for tier propagation)..."
  icp canister call property addAdmin "(principal \"$PAYMENT_ID\")" -e "$ENV" 2>/dev/null &
fi
if [ -n "$PAYMENT_ID" ] && [ -n "$QUOTE_ID" ]; then
  echo "  quote: adding payment as admin (for tier propagation)..."
  icp canister call quote addAdmin "(principal \"$PAYMENT_ID\")" -e "$ENV" 2>/dev/null &
fi
if [ -n "$PAYMENT_ID" ] && [ -n "$PHOTO_ID" ]; then
  echo "  photo: adding payment as admin (for tier propagation)..."
  icp canister call photo addAdmin "(principal \"$PAYMENT_ID\")" -e "$ENV" 2>/dev/null &
fi

if [ -n "$PAYMENT_ID" ] && [ -n "$PROPERTY_ID" ] && [ -n "$QUOTE_ID" ] && [ -n "$PHOTO_ID" ]; then
  echo "  Wiring tier propagation: payment -> property, quote, photo..."
  icp canister call payment setTierCanisterIds \
    "(principal \"$PROPERTY_ID\", principal \"$QUOTE_ID\", principal \"$PHOTO_ID\")" \
    -e "$ENV" 2>/dev/null &
fi
if [ -n "$BILLS_ID" ]    && [ -n "$PAYMENT_ID" ];    then
  echo "  Wiring payment -> bills..."
  icp canister call bills    setPaymentCanisterId    "(\"$PAYMENT_ID\")"          -e "$ENV" &
fi
if [ -n "$JOB_ID" ]      && [ -n "$CONTRACTOR_ID" ]; then
  echo "  Wiring contractor -> job..."
  icp canister call job      setContractorCanisterId "(\"$CONTRACTOR_ID\")"       -e "$ENV" &
fi
if [ -n "$JOB_ID" ]      && [ -n "$PROPERTY_ID" ];   then
  echo "  Wiring property -> job..."
  icp canister call job      setPropertyCanisterId   "(\"$PROPERTY_ID\")"         -e "$ENV" &
fi
if [ -n "$PHOTO_ID" ]    && [ -n "$PROPERTY_ID" ];   then
  echo "  Wiring property -> photo..."
  icp canister call photo    setPropertyCanisterId   "(principal \"$PROPERTY_ID\")" -e "$ENV" &
fi
if [ -n "$QUOTE_ID" ]    && [ -n "$PROPERTY_ID" ];   then
  echo "  Wiring property -> quote..."
  icp canister call quote    setPropertyCanisterId   "(principal \"$PROPERTY_ID\")" -e "$ENV" &
fi
MAINTENANCE_ID=$(icp canister status maintenance -e "$ENV" --id-only 2>/dev/null || echo "")
if [ -n "$MAINTENANCE_ID" ] && [ -n "$PROPERTY_ID" ]; then
  echo "  Wiring property -> maintenance..."
  icp canister call maintenance setPropertyCanisterId "(principal \"$PROPERTY_ID\")" -e "$ENV" &
fi

wait

echo ""
echo "============================================"
echo "  Wiring Trusted Canister Lists"
echo "============================================"

if [ -n "$JOB_ID" ]      && [ -n "$PAYMENT_ID" ]; then
  echo "  payment: trusting job ($JOB_ID)..."
  icp canister call payment addTrustedCanister "(principal \"$JOB_ID\")"      -e "$ENV" 2>/dev/null &
fi
if [ -n "$PROPERTY_ID" ] && [ -n "$PAYMENT_ID" ]; then
  echo "  payment: trusting property ($PROPERTY_ID)..."
  icp canister call payment addTrustedCanister "(principal \"$PROPERTY_ID\")" -e "$ENV" 2>/dev/null &
fi
if [ -n "$PHOTO_ID" ]    && [ -n "$PAYMENT_ID" ]; then
  echo "  payment: trusting photo ($PHOTO_ID)..."
  icp canister call payment addTrustedCanister "(principal \"$PHOTO_ID\")"    -e "$ENV" 2>/dev/null &
fi
if [ -n "$QUOTE_ID" ]    && [ -n "$PAYMENT_ID" ]; then
  echo "  payment: trusting quote ($QUOTE_ID)..."
  icp canister call payment addTrustedCanister "(principal \"$QUOTE_ID\")"    -e "$ENV" 2>/dev/null &
fi
if [ -n "$JOB_ID" ] && [ -n "$CONTRACTOR_ID" ]; then
  echo "  contractor: trusting job ($JOB_ID)..."
  icp canister call contractor addTrustedCanister "(principal \"$JOB_ID\")"   -e "$ENV" 2>/dev/null &
fi
if [ -n "$JOB_ID" ]    && [ -n "$PROPERTY_ID" ]; then
  echo "  property: trusting job ($JOB_ID)..."
  icp canister call property addTrustedCanister "(principal \"$JOB_ID\")"     -e "$ENV" 2>/dev/null &
fi
if [ -n "$PHOTO_ID" ]  && [ -n "$PROPERTY_ID" ]; then
  echo "  property: trusting photo ($PHOTO_ID)..."
  icp canister call property addTrustedCanister "(principal \"$PHOTO_ID\")"   -e "$ENV" 2>/dev/null &
fi
if [ -n "$QUOTE_ID" ]  && [ -n "$PROPERTY_ID" ]; then
  echo "  property: trusting quote ($QUOTE_ID)..."
  icp canister call property addTrustedCanister "(principal \"$QUOTE_ID\")"   -e "$ENV" 2>/dev/null &
fi
if [ -n "$REPORT_ID" ] && [ -n "$PROPERTY_ID" ]; then
  echo "  property: trusting report ($REPORT_ID)..."
  icp canister call property addTrustedCanister "(principal \"$REPORT_ID\")"  -e "$ENV" 2>/dev/null &
fi
if [ -n "$SENSOR_ID" ] && [ -n "$JOB_ID" ]; then
  echo "  job: trusting sensor ($SENSOR_ID)..."
  icp canister call job addTrustedCanister "(principal \"$SENSOR_ID\")"       -e "$ENV" 2>/dev/null &
fi

wait

# ── AI Proxy canister — wire API keys from environment ────────────────────────
AI_PROXY_ID=$(icp canister status ai_proxy -e "$ENV" --id-only 2>/dev/null || echo "")

if [ -n "$AI_PROXY_ID" ]; then
  echo ""
  echo "============================================"
  echo "  Wiring AI Proxy Canister"
  echo "============================================"

  echo "  ai_proxy: adding deployer ($DEPLOYER) as admin..."
  icp canister call ai_proxy addAdmin "(principal \"$DEPLOYER\")" -e "$ENV" \
    2>/dev/null || echo "  ⚠️  ai_proxy addAdmin failed (may already be initialized)"

  if [ -n "${RESEND_API_KEY:-}" ]; then
    echo "  ai_proxy: setting Resend API key..."
    icp canister call ai_proxy setResendApiKey "(\"$RESEND_API_KEY\")" -e "$ENV" \
      2>/dev/null || echo "  ⚠️  setResendApiKey failed"
  else
    echo "  ⚠️  RESEND_API_KEY not set — email sending will be disabled"
  fi

  if [ -n "${OPEN_PERMIT_API_KEY:-}" ]; then
    echo "  ai_proxy: setting OpenPermit API key..."
    icp canister call ai_proxy setOpenPermitApiKey "(\"$OPEN_PERMIT_API_KEY\")" -e "$ENV" \
      2>/dev/null || echo "  ⚠️  setOpenPermitApiKey failed"
  else
    echo "  ⚠️  OPEN_PERMIT_API_KEY not set — OpenPermit lookups will be disabled"
  fi

  if [ -n "${RESEND_FROM_ADDRESS:-}" ]; then
    echo "  ai_proxy: setting Resend from address..."
    icp canister call ai_proxy setResendFromAddress "(\"$RESEND_FROM_ADDRESS\")" -e "$ENV" \
      2>/dev/null || echo "  ⚠️  setResendFromAddress failed"
  fi
fi

echo ""
echo "============================================"
echo "  Controller Hardening"
echo "============================================"
# TODO: icp-cli equivalent of `dfx canister update-settings --add-controller` is
# not yet documented in the migration guide. Re-enable once confirmed.
# Tracking: MeteSr/HomeGentic#174
if [ "$ENV" != "local" ]; then
  if [ -n "${BACKUP_CONTROLLER_PRINCIPAL:-}" ]; then
    echo "  ⚠️  Controller hardening skipped — icp canister settings --add-controller"
    echo "     not yet confirmed. Set manually via dfx until icp-cli documents this."
    echo "     BACKUP_CONTROLLER_PRINCIPAL=${BACKUP_CONTROLLER_PRINCIPAL}"
  else
    echo "  ⚠️  BACKUP_CONTROLLER_PRINCIPAL is not set."
    echo "     All canisters are controlled only by the deploying identity."
  fi
else
  echo "  (skipped — local network)"
fi

# Internet Identity is managed by icp-cli via ii: true in icp.yaml.
# icp network start -d deploys it automatically. Local URL: http://id.ai.localhost:8000

echo ""
echo "============================================"
echo "  Building Frontend"
echo "============================================"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export DFX_NETWORK="$ENV"
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
echo "▶ icp deploy frontend -e $ENV..."
if icp deploy frontend -e "$ENV"; then
  FRONTEND_ID=$(icp canister status frontend -e "$ENV" --id-only 2>/dev/null || echo "unknown")
  echo "  ✓ Frontend canister deployed ($FRONTEND_ID)"
else
  echo "  ✗ Frontend canister deploy failed"
  exit 1
fi

echo ""
echo "✅ Deployment complete!"
