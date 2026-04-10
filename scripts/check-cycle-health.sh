#!/usr/bin/env bash
# HomeGentic — Cycle Health CI Gate (issue #55)
#
# Queries each deployed canister's cycle balance via dfx canister status and
# exits non-zero if any canister is below the CRITICAL threshold (500M cycles).
# Emits a WARNING for any canister below the WARNING threshold (1T cycles).
#
# Usage (post-deploy in CI):
#   bash scripts/check-cycle-health.sh
#
# Environment:
#   CRITICAL_CYCLES  — fail threshold in cycles (default: 500_000_000 = 500M)
#   WARNING_CYCLES   — warn threshold in cycles  (default: 1_000_000_000_000 = 1T)

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

CRITICAL_CYCLES="${CRITICAL_CYCLES:-500000000}"       # 500M
WARNING_CYCLES="${WARNING_CYCLES:-1000000000000}"     # 1T

CANISTERS=(
  auth property job contractor quote payment photo
  report maintenance market sensor monitoring listing
  agent recurring bills ai_proxy
)

if ! dfx ping 2>/dev/null; then
  echo "❌  dfx is not running — cannot check cycle health"
  exit 1
fi

echo "============================================"
echo "  HomeGentic — Cycle Health Check"
echo "  Critical threshold : $(numfmt --grouping $CRITICAL_CYCLES) cycles"
echo "  Warning  threshold : $(numfmt --grouping $WARNING_CYCLES) cycles"
echo "============================================"

CRITICAL_LIST=()
WARNING_LIST=()
UNKNOWN_LIST=()

for CANISTER in "${CANISTERS[@]}"; do
  CANISTER_ID=$(dfx canister id "$CANISTER" 2>/dev/null || echo "")
  if [ -z "$CANISTER_ID" ]; then
    echo "  ⬜  $CANISTER — not deployed, skipping"
    continue
  fi

  # Parse cycle balance from dfx canister status output.
  # The line looks like:  Cycles: 10_000_000_000_000
  STATUS_OUT=$(dfx canister status "$CANISTER" 2>&1 || echo "")
  CYCLES_RAW=$(echo "$STATUS_OUT" | grep -i "^Cycles:" | head -1 | awk '{print $2}' | tr -d '_,')

  if [ -z "$CYCLES_RAW" ] || ! [[ "$CYCLES_RAW" =~ ^[0-9]+$ ]]; then
    echo "  ❓  $CANISTER — could not read balance (not a controller?)"
    UNKNOWN_LIST+=("$CANISTER")
    continue
  fi

  CYCLES="$CYCLES_RAW"

  if [ "$CYCLES" -lt "$CRITICAL_CYCLES" ]; then
    echo "  🔴  $CANISTER — CRITICAL: $CYCLES cycles (below $CRITICAL_CYCLES)"
    CRITICAL_LIST+=("$CANISTER")
  elif [ "$CYCLES" -lt "$WARNING_CYCLES" ]; then
    echo "  🟡  $CANISTER — WARNING:  $CYCLES cycles (below $WARNING_CYCLES)"
    WARNING_LIST+=("$CANISTER")
  else
    echo "  🟢  $CANISTER — OK:       $CYCLES cycles"
  fi
done

echo ""
echo "============================================"
echo "  Summary"
echo "============================================"
echo "  Critical : ${#CRITICAL_LIST[@]}"
echo "  Warning  : ${#WARNING_LIST[@]}"
echo "  Unknown  : ${#UNKNOWN_LIST[@]}"

if [ ${#CRITICAL_LIST[@]} -gt 0 ]; then
  echo ""
  echo "❌  CRITICAL — top up immediately: ${CRITICAL_LIST[*]}"
  exit 1
fi

if [ ${#WARNING_LIST[@]} -gt 0 ]; then
  echo ""
  echo "⚠️   WARNING — cycle balance low: ${WARNING_LIST[*]}"
fi

echo ""
echo "✅  Cycle health check passed"
exit 0
