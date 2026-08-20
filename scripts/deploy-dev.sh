#!/usr/bin/env bash
# Minimal local deploy: auth + property + job + payment — enough for dashboard access.
# Assumes the local ICP network is already running (make start).
# Safe to re-run: icp deploy uses --mode auto (upgrade if already installed).

set -euo pipefail

ENV=local

echo "============================================"
echo "  HomeGentic — Dev Deploy (auth + property + job + payment)"
echo "============================================"

# ── Identity ──────────────────────────────────────────────────────────────────
_PRINCIPAL=$(icp identity principal 2>/dev/null || echo "2vxsx-fae")
if [ "$_PRINCIPAL" = "2vxsx-fae" ]; then
  echo "▶ Creating local identity..."
  if ! icp identity new homegentic-local --storage plaintext 2>/dev/null && \
     ! icp identity new homegentic-local 2>/dev/null; then
    _PEM=$(mktemp /tmp/hg-dev-XXXXXX.pem)
    openssl genpkey -algorithm Ed25519 -out "$_PEM" 2>/dev/null
    icp identity import homegentic-local --from-pem "$_PEM" --storage plaintext 2>/dev/null || true
    rm -f "$_PEM"
  fi
  icp identity default homegentic-local 2>/dev/null
fi
DEPLOYER=$(icp identity principal)
echo "  ✓ Identity: $DEPLOYER"

# ── Network check ─────────────────────────────────────────────────────────────
if ! icp network ping local >/dev/null 2>&1; then
  echo ""
  echo "  ✗ Local ICP network is not running — start it first:"
  echo "      make start"
  exit 1
fi
echo "  ✓ Local network is running"

# ── moc compiler ─────────────────────────────────────────────────────────────
echo "▶ Initializing moc compiler..."
mops toolchain use moc 1.3.0 >/dev/null 2>&1 || true
MOC_BIN=$(mops toolchain bin moc 2>/dev/null) || MOC_BIN=""
if [ -z "$MOC_BIN" ]; then
  rm -rf .mops/_tmp
  mops toolchain use moc 1.3.0 >/dev/null 2>&1 || true
  MOC_BIN=$(mops toolchain bin moc) || { echo "  ERROR: cannot resolve moc"; exit 1; }
fi
echo "  ✓ moc: $MOC_BIN"

# ── ic-wasm ───────────────────────────────────────────────────────────────────
for _dfx_bin in "$HOME/.local/share/dfx/bin" "$HOME/.dfinity/bin"; do
  [ -x "$_dfx_bin/ic-wasm" ] && export PATH="$_dfx_bin:$PATH" && break
done
if ! command -v ic-wasm >/dev/null 2>&1; then
  echo "  ic-wasm not found — downloading 0.9.11..."
  _TMP=$(mktemp -d)
  curl -sSfL \
    "https://github.com/dfinity/ic-wasm/releases/download/0.9.11/ic-wasm-x86_64-unknown-linux-musl.tar.xz" \
    -o "$_TMP/ic-wasm.tar.xz"
  tar -xJf "$_TMP/ic-wasm.tar.xz" -C "$_TMP"
  mkdir -p "$HOME/.local/bin"
  cp "$(find "$_TMP" -name ic-wasm -type f | head -1)" "$HOME/.local/bin/ic-wasm"
  chmod +x "$HOME/.local/bin/ic-wasm"
  rm -rf "$_TMP"
  export PATH="$HOME/.local/bin:$PATH"
fi
echo "  ✓ ic-wasm: $(ic-wasm --version 2>/dev/null | head -1)"

# ── Cycles ────────────────────────────────────────────────────────────────────
echo "▶ Minting local cycles..."
if ! icp cycles mint --cycles 500000000000000 -e local; then
  echo "  ERROR: icp cycles mint failed — cycles balance is 0, deploy will fail."
  echo "  Try: icp identity default homegentic-local && icp cycles mint --cycles 500000000000000 -e local"
  exit 1
fi
CYCLES_BALANCE=$(icp cycles balance -e local 2>/dev/null | grep -oE '[0-9]+' | head -1 || echo "unknown")
echo "  ✓ Cycles minted — current balance: ${CYCLES_BALANCE}"

# ── Deploy ────────────────────────────────────────────────────────────────────
LOG_DIR=$(mktemp -d /tmp/hg-dev-XXXXXX)
trap 'rm -rf "$LOG_DIR"' EXIT

declare -A _DEPLOY_TIMES
_DEPLOY_TOTAL_START=$(date +%s)

deploy_canister() {
  local name=$1; shift
  local _t0
  _t0=$(date +%s)
  echo -n "  $name... "
  if icp deploy "$name" "$@" -e "$ENV" >"$LOG_DIR/$name.log" 2>&1; then
    _DEPLOY_TIMES[$name]=$(( $(date +%s) - _t0 ))
    echo "✓ (${_DEPLOY_TIMES[$name]}s)"
  else
    echo "FAILED"
    echo ""
    cat "$LOG_DIR/$name.log"
    exit 1
  fi
}

echo ""
echo "▶ Deploying canisters..."
deploy_canister auth --args "(principal \"$DEPLOYER\")"
deploy_canister property
deploy_canister job
deploy_canister payment

_DEPLOY_TOTAL=$(( $(date +%s) - _DEPLOY_TOTAL_START ))
echo "  Total: ${_DEPLOY_TOTAL}s"

# ── Read IDs ──────────────────────────────────────────────────────────────────
AUTH_ID=$(icp canister status auth -e "$ENV" --id-only 2>/dev/null)
PROPERTY_ID=$(icp canister status property -e "$ENV" --id-only 2>/dev/null)
JOB_ID=$(icp canister status job -e "$ENV" --id-only 2>/dev/null)
PAYMENT_ID=$(icp canister status payment -e "$ENV" --id-only 2>/dev/null)

echo ""
echo "▶ Canister IDs"
echo "  auth:     $AUTH_ID"
echo "  property: $PROPERTY_ID"
echo "  job:      $JOB_ID"
echo "  payment:  $PAYMENT_ID"

# ── Write .env ────────────────────────────────────────────────────────────────
echo ""
echo "▶ Writing canister IDs to .env..."

update_env() {
  local key=$1 val=$2
  [ -z "$val" ] && return  # never overwrite an existing ID with empty
  if grep -q "^${key}=" .env 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${val}|" .env
  else
    echo "${key}=${val}" >> .env
  fi
  echo "  ✓ ${key}=${val}"
}

update_env CANISTER_ID_AUTH     "$AUTH_ID"
update_env AUTH_CANISTER_ID     "$AUTH_ID"    # old-format fallback for Vite
update_env CANISTER_ID_PROPERTY "$PROPERTY_ID"
update_env CANISTER_ID_JOB      "$JOB_ID"
update_env CANISTER_ID_PAYMENT  "$PAYMENT_ID"
update_env PAYMENT_CANISTER_ID  "$PAYMENT_ID" # old-format fallback for Vite

# ── Admin bootstrap ───────────────────────────────────────────────────────────
echo ""
echo "▶ Adding deployer as admin..."
icp canister call property addAdmin "(principal \"$DEPLOYER\")" -e "$ENV" 2>/dev/null &
icp canister call job      addAdmin "(principal \"$DEPLOYER\")" -e "$ENV" 2>/dev/null &
wait
icp canister call payment initAdmins "(vec { principal \"$DEPLOYER\" })" -e "$ENV" 2>/dev/null \
  && echo "  ✓ payment admin initialised"
echo "  ✓ Done"

# ── Inter-canister wiring ─────────────────────────────────────────────────────
echo ""
echo "▶ Wiring canisters..."

icp canister call job setPropertyCanisterId "(\"$PROPERTY_ID\")" -e "$ENV" 2>/dev/null \
  && echo "  ✓ job → property"

icp canister call job      setPaymentCanisterId "(\"$PAYMENT_ID\")"          -e "$ENV" 2>/dev/null \
  && echo "  ✓ job → payment"
icp canister call property setPaymentCanisterId "(principal \"$PAYMENT_ID\")" -e "$ENV" 2>/dev/null \
  && echo "  ✓ property → payment"
icp canister call property addAdmin "(principal \"$PAYMENT_ID\")" -e "$ENV" 2>/dev/null \
  && echo "  ✓ property trusts payment"

icp canister call property addTrustedCanister "(principal \"$JOB_ID\")"      -e "$ENV" 2>/dev/null \
  && echo "  ✓ property trusts job"
icp canister call job      addTrustedCanister "(principal \"$PROPERTY_ID\")" -e "$ENV" 2>/dev/null \
  && echo "  ✓ job trusts property"

# ── Grant deployer a subscription ────────────────────────────────────────────
echo ""
echo "▶ Granting deployer Pro subscription..."
icp canister call payment grantSubscription "(principal \"$DEPLOYER\", variant { Pro })" -e "$ENV" 2>/dev/null \
  && echo "  ✓ Pro subscription granted to $DEPLOYER" \
  || echo "  ⚠  grantSubscription failed"

echo ""
echo "============================================"
echo "  ✅ Dev deploy complete"
echo ""
echo "  If the frontend dev server is already running,"
echo "  restart it so Vite picks up the new canister IDs:"
echo "    Ctrl+C  →  make frontend"
echo "  Otherwise:"
echo "    make frontend"
echo "============================================"
