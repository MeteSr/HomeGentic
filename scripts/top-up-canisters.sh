#!/usr/bin/env bash
# HomeGentic — Cycle Top-Up Watchdog (issue #55)
#
# Calls checkCycleLevels() on the monitoring canister, then tops up any
# canister whose balance is below TOP_UP_TRIGGER_T (2T cycles) to TOP_UP_TARGET_T
# (5T cycles) using the designated cycles wallet.
#
# Usage:
#   bash scripts/top-up-canisters.sh
#   bash scripts/top-up-canisters.sh --dry-run    # report only, no top-up
#
# Environment:
#   CYCLES_WALLET        — identity whose wallet holds the cycles (required in prod)
#   TOP_UP_TRIGGER_T     — top-up when balance falls below this many trillion cycles (default: 2)
#   TOP_UP_TARGET_T      — top-up amount in trillion cycles (default: 5)
#   DFX_NETWORK          — "local" or "ic" (default: local)
#   MONITORING_CANISTER  — canister name or ID (default: monitoring)

set -uo pipefail

DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
fi

DFX_NETWORK="${DFX_NETWORK:-local}"
MONITORING_CANISTER="${MONITORING_CANISTER:-monitoring}"
TOP_UP_TRIGGER_T="${TOP_UP_TRIGGER_T:-2}"
TOP_UP_TARGET_T="${TOP_UP_TARGET_T:-5}"

TRIGGER_CYCLES=$(( TOP_UP_TRIGGER_T * 1000000000000 ))
TOP_UP_AMOUNT=$(( TOP_UP_TARGET_T  * 1000000000000 ))

echo "============================================"
echo "  HomeGentic — Cycle Top-Up Watchdog"
echo "  Network   : $DFX_NETWORK"
echo "  Trigger   : ${TOP_UP_TRIGGER_T}T cycles"
echo "  Top-up by : ${TOP_UP_TARGET_T}T cycles"
if $DRY_RUN; then
  echo "  Mode      : DRY RUN (no changes)"
fi
echo "============================================"

if ! dfx ping 2>/dev/null; then
  echo "❌  dfx is not running. Run: dfx start --background"
  exit 1
fi

MONITORING_ID=$(dfx canister id "$MONITORING_CANISTER" --network "$DFX_NETWORK" 2>/dev/null || echo "")
if [ -z "$MONITORING_ID" ]; then
  echo "❌  monitoring canister not deployed"
  exit 1
fi

# ── Call checkCycleLevels() ───────────────────────────────────────────────────
echo ""
echo "── Polling cycle levels from monitoring canister ────────────────────────"
LEVELS_OUT=$(dfx canister call "$MONITORING_CANISTER" checkCycleLevels --network "$DFX_NETWORK" 2>&1)
echo "$LEVELS_OUT"

TOPPED_UP=()
WARNINGS=()
FAILED=()

# Parse output: look for lines with "critical" or "warning" status and extract canister ID.
# Output format (Candid record vec): id, name, cycles, status, fromCache fields.
# We use dfx canister status to get the live balance for the top-up decision since
# the Candid output format is verbose; fall back to check-cycle-health pattern.

echo ""
echo "── Checking each deployed canister directly ─────────────────────────────"

CANISTERS=(
  auth property job contractor quote payment photo
  report maintenance market sensor monitoring listing
  agent recurring bills ai_proxy
)

for CANISTER in "${CANISTERS[@]}"; do
  CANISTER_ID=$(dfx canister id "$CANISTER" --network "$DFX_NETWORK" 2>/dev/null || echo "")
  [ -z "$CANISTER_ID" ] && continue

  STATUS_OUT=$(dfx canister status "$CANISTER" --network "$DFX_NETWORK" 2>&1 || echo "")
  CYCLES_RAW=$(echo "$STATUS_OUT" | grep -i "^Cycles:" | head -1 | awk '{print $2}' | tr -d '_,')

  if [ -z "$CYCLES_RAW" ] || ! [[ "$CYCLES_RAW" =~ ^[0-9]+$ ]]; then
    echo "  ❓  $CANISTER — balance unknown (not a controller)"
    continue
  fi

  CYCLES="$CYCLES_RAW"

  if [ "$CYCLES" -lt "$TRIGGER_CYCLES" ]; then
    echo "  🔴  $CANISTER — $CYCLES cycles (below trigger) → topping up"
    if $DRY_RUN; then
      echo "      [DRY RUN] would run: dfx canister deposit-cycles $TOP_UP_AMOUNT $CANISTER --network $DFX_NETWORK"
      TOPPED_UP+=("$CANISTER (dry-run)")
    else
      if dfx canister deposit-cycles "$TOP_UP_AMOUNT" "$CANISTER" --network "$DFX_NETWORK" 2>&1; then
        echo "      ✅  Topped up $CANISTER with ${TOP_UP_TARGET_T}T cycles"
        TOPPED_UP+=("$CANISTER")
      else
        echo "      ❌  Top-up failed for $CANISTER"
        FAILED+=("$CANISTER")
      fi
    fi
  elif [ "$CYCLES" -lt "$TRIGGER_CYCLES" ]; then
    echo "  🟡  $CANISTER — $CYCLES cycles (low, above trigger)"
    WARNINGS+=("$CANISTER")
  else
    echo "  🟢  $CANISTER — $CYCLES cycles (OK)"
  fi
done

echo ""
echo "============================================"
echo "  Top-Up Summary"
echo "============================================"
echo "  Topped up : ${#TOPPED_UP[@]} — ${TOPPED_UP[*]:-none}"
echo "  Warnings  : ${#WARNINGS[@]}  — ${WARNINGS[*]:-none}"
echo "  Failed    : ${#FAILED[@]}    — ${FAILED[*]:-none}"

if [ ${#FAILED[@]} -gt 0 ]; then
  echo ""
  echo "❌  Some top-ups failed: ${FAILED[*]}"
  exit 1
fi

echo ""
echo "✅  Cycle watchdog complete"
exit 0
