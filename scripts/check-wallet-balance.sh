#!/usr/bin/env bash
# HomeGentic — Wallet Cycles Pre-flight Check (issue #102)
#
# Verifies the deploy identity's cycles wallet holds enough cycles before
# deploy.sh runs. Required cycles are computed dynamically rather than a
# flat guess: a baseline operating floor, plus 2.5T for every canister that
# doesn't have an ID yet in canister_ids.json (deploy.sh deposits exactly
# 2.5T per new canister slot — 2T for the slot + 0.5T install/call overhead
# — see the "Fund cycles ledger" step there). An upgrade deploy where every
# canister already exists only needs the baseline floor.
#
# Also logs the live cycle balance of every already-deployed canister, so a
# canister quietly running low shows up here rather than surfacing later as
# a failed upgrade call or a frozen canister.
#
# Fails fast rather than crashing mid-deploy and leaving the app partially
# deployed.
#
# Usage (pre-deploy in CI):
#   bash scripts/check-wallet-balance.sh
#
# Environment:
#   DFX_IDENTITY_PEM        — PEM content for the deploy identity (required in CI)
#   DFX_NETWORK             — dfx network flag for wallet ops (default: ic)
#   ICP_ENV                 — canister_ids.json environment key / icp-cli -e flag (default: testnet)
#   MIN_WALLET_CYCLES       — baseline operating floor (default: 2T)
#   PER_NEW_CANISTER_CYCLES — cycles required per canister still needing creation (default: 2.5T)

set -uo pipefail

DFX_NETWORK="${DFX_NETWORK:-ic}"
ICP_ENV="${ICP_ENV:-testnet}"
MIN_WALLET_CYCLES="${MIN_WALLET_CYCLES:-2000000000000}"              # 2T
PER_NEW_CANISTER_CYCLES="${PER_NEW_CANISTER_CYCLES:-2500000000000}"  # 2.5T

# Keep in sync with the CANISTERS array in deploy.sh — the full set of
# backend canister slots. frontend is tracked separately below since it's
# deployed via a different path but still needs a slot.
CANISTERS=(auth property job contractor quote payment photo report maintenance market sensor monitoring listing agent fee recurring bills ai_proxy audit referrals)

# Load deploy identity from PEM env var when running in CI.
if [ -n "${DFX_IDENTITY_PEM:-}" ]; then
  PEM_FILE=$(mktemp /tmp/ci-identity-XXXXXX.pem)
  trap 'rm -f "$PEM_FILE"' EXIT
  printf '%s' "$DFX_IDENTITY_PEM" > "$PEM_FILE"
  dfx identity import --storage-mode=plaintext ci-deploy "$PEM_FILE" 2>/dev/null || true
  dfx identity use ci-deploy
  if [ -n "${DFX_WALLET_ID:-}" ]; then
    dfx identity set-wallet "$DFX_WALLET_ID" --network "$DFX_NETWORK"
  fi
fi

# ── Which canisters still need creating? ──────────────────────────────────────
# Same detection deploy.sh uses: a canister with no ID recorded for $ICP_ENV
# in canister_ids.json hasn't been created yet.
CANISTERS_TO_CREATE=()
if [ -f "canister_ids.json" ] && command -v python3 >/dev/null 2>&1; then
  for _c in "${CANISTERS[@]}" frontend; do
    _id=$(python3 -c "import json,sys; d=json.load(open('canister_ids.json')); print(d.get('$_c',{}).get('$ICP_ENV',''))" 2>/dev/null || echo "")
    [ -z "$_id" ] && CANISTERS_TO_CREATE+=("$_c")
  done
else
  CANISTERS_TO_CREATE=("${CANISTERS[@]}" frontend)
fi

REQUIRED_CYCLES=$(( MIN_WALLET_CYCLES + ${#CANISTERS_TO_CREATE[@]} * PER_NEW_CANISTER_CYCLES ))

echo "============================================"
echo "  HomeGentic — Wallet Pre-flight Check"
echo "  Network        : $DFX_NETWORK (env: $ICP_ENV)"
echo "  Baseline floor : $MIN_WALLET_CYCLES cycles ($(( MIN_WALLET_CYCLES / 1000000000000 ))T)"
echo "  New canisters  : ${#CANISTERS_TO_CREATE[@]} × $PER_NEW_CANISTER_CYCLES cycles each"
if [ ${#CANISTERS_TO_CREATE[@]} -gt 0 ]; then
  echo "                   (${CANISTERS_TO_CREATE[*]})"
fi
echo "  Required       : $REQUIRED_CYCLES cycles ($(echo "scale=2; $REQUIRED_CYCLES / 1000000000000" | bc)T)"
echo "============================================"

BALANCE_OUT=$(dfx wallet balance --network "$DFX_NETWORK" 2>&1)
if [ $? -ne 0 ]; then
  echo "❌  Could not query wallet balance: $BALANCE_OUT"
  echo "    Ensure DFX_IDENTITY_PEM is set and the wallet exists."
  exit 1
fi

# Parse output like "8.338 TC (trillion cycles)." or "8338000000000 cycles."
# Handle both TC (trillion) and raw cycle formats.
if echo "$BALANCE_OUT" | grep -qi "TC\|trillion"; then
  TC=$(echo "$BALANCE_OUT" | grep -oE '[0-9]+\.[0-9]+|[0-9]+' | head -1)
  BALANCE=$(echo "$TC * 1000000000000" | bc | cut -d. -f1)
else
  BALANCE=$(echo "$BALANCE_OUT" | grep -oE '[0-9]+' | head -1)
fi

if [ -z "$BALANCE" ] || ! [[ "$BALANCE" =~ ^[0-9]+$ ]]; then
  echo "❌  Could not parse wallet balance from: $BALANCE_OUT"
  exit 1
fi

echo "  Wallet balance: $BALANCE cycles ($(echo "scale=3; $BALANCE / 1000000000000" | bc)T)"

# ── Per-canister cycle balances ───────────────────────────────────────────────
# Best-effort and non-fatal: a canister status lookup failing here (e.g. the
# deploy identity isn't yet a controller) shouldn't block the pre-flight gate,
# which is really about the wallet's own balance.
echo ""
echo "── Deployed canister balances ────────────────────────────────────────────"
for _c in "${CANISTERS[@]}" frontend; do
  if printf '%s\n' "${CANISTERS_TO_CREATE[@]:-}" | grep -qx "$_c"; then
    echo "  ⬜  $_c — not yet created (needs $PER_NEW_CANISTER_CYCLES cycles to create)"
    continue
  fi

  STATUS_OUT=$(icp canister status "$_c" -e "$ICP_ENV" 2>&1) || {
    echo "  ❓  $_c — could not read status"
    continue
  }
  # icp canister status indents every field two spaces (e.g. "  Cycles: N") —
  # an anchor without the leading whitespace never matches.
  CYCLES_RAW=$(echo "$STATUS_OUT" | grep -iE "^[[:space:]]*Cycles:" | head -1 | awk '{print $2}' | tr -d '_,')
  if [ -z "$CYCLES_RAW" ] || ! [[ "$CYCLES_RAW" =~ ^[0-9]+$ ]]; then
    echo "  ❓  $_c — could not parse cycle balance"
  else
    echo "  🟢  $_c — $CYCLES_RAW cycles"
  fi
done
echo ""

if [ "$BALANCE" -lt "$REQUIRED_CYCLES" ]; then
  echo "❌  INSUFFICIENT CYCLES — need at least $REQUIRED_CYCLES cycles to deploy"
  echo "    ($MIN_WALLET_CYCLES baseline + ${#CANISTERS_TO_CREATE[@]} new canister(s) × $PER_NEW_CANISTER_CYCLES)."
  echo "    Top up via: dfx wallet --network $DFX_NETWORK send <amount>"
  echo "    Or via the NNS dapp: https://nns.ic0.app"
  exit 1
fi

echo "✅  Wallet pre-flight passed — sufficient cycles to deploy."
exit 0
