#!/usr/bin/env bash
# HomeGentic — Cycle Health Check (issue #55)
#
# Reads each deployed canister's balance with `icp canister status` and exits
# non-zero when any canister is close to its freezing threshold, or when a
# balance can't be read at all (a wrong identity used to make every canister
# "unknown" and the check pass). Thresholds live in scripts/lib/cycles.sh.
#
# Usage:
#   ICP_ENV=ic bash scripts/check-cycle-health.sh
#
# Environment:
#   ICP_ENV — canister_ids.json environment to check: ic or testnet
#             (default: $DFX_NETWORK, else ic). Both live on the IC mainnet.
#   The active icp identity must be a controller of the canisters.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."
source "$SCRIPT_DIR/lib/cycles.sh"

ICP_ENV="${ICP_ENV:-${DFX_NETWORK:-ic}}"

echo "============================================"
echo "  HomeGentic — Cycle Health Check"
echo "  Environment : $ICP_ENV"
echo "  Alert when  : < ${ALERT_MARGIN_DAYS} days before the ${FREEZE_DAYS}-day freezing threshold, or < $(cycles_t "$MIN_ALERT_CYCLES")"
echo "============================================"

CRITICAL_LIST=()
UNKNOWN_LIST=()
CHECKED=0

for CANISTER in "${ALL_CANISTERS[@]}"; do
  CANISTER_ID=$(canister_id "$CANISTER" "$ICP_ENV")
  if [ -z "$CANISTER_ID" ]; then
    echo "  ⬜  $CANISTER — no ID for $ICP_ENV, skipping"
    continue
  fi
  CHECKED=$(( CHECKED + 1 ))

  STATUS_OUT=$(icp canister status "$CANISTER_ID" -n ic 2>&1 || true)
  if ! cycles_read "$STATUS_OUT"; then
    echo "  ❓  $CANISTER — could not read balance (not a controller, or unreachable)"
    printf '%s\n' "$STATUS_OUT" | tail -3 | sed 's/^/        /'
    UNKNOWN_LIST+=("$CANISTER")
    continue
  fi

  cycles_policy "$CYC_BALANCE" "$CYC_IDLE_PER_DAY"
  if [ "$CYC_BALANCE" -lt "$CYC_ALERT_AT" ]; then
    echo "  🔴  $CANISTER — $(cycles_t "$CYC_BALANCE"), ${CYC_RUNWAY_DAYS} days before freezing (alert below $(cycles_t "$CYC_ALERT_AT"))"
    CRITICAL_LIST+=("$CANISTER")
  elif [ "$CYC_BALANCE" -lt "$CYC_TOPUP_AT" ]; then
    echo "  🟡  $CANISTER — $(cycles_t "$CYC_BALANCE"), ${CYC_RUNWAY_DAYS} days before freezing (top-up due)"
  else
    echo "  🟢  $CANISTER — $(cycles_t "$CYC_BALANCE"), ${CYC_RUNWAY_DAYS} days before freezing"
  fi
done

echo ""
echo "  Checked: $CHECKED   Critical: ${#CRITICAL_LIST[@]}   Unknown: ${#UNKNOWN_LIST[@]}"

FAILED=0
if [ "$CHECKED" -eq 0 ]; then
  echo "❌  No canister IDs recorded for '$ICP_ENV' in canister_ids.json"
  FAILED=1
fi
if [ ${#UNKNOWN_LIST[@]} -gt 0 ]; then
  echo "❌  Could not read: ${UNKNOWN_LIST[*]} — check that the identity controls these canisters"
  FAILED=1
fi
if [ ${#CRITICAL_LIST[@]} -gt 0 ]; then
  echo "❌  Top up now: ${CRITICAL_LIST[*]}"
  FAILED=1
fi
[ "$FAILED" -eq 0 ] && echo "✅  Cycle health check passed"
exit "$FAILED"
