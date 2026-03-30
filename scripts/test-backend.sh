#!/usr/bin/env bash
# HomeFax — Backend Test Coordinator (12.6.3)
#
# Runs each canister's test.sh in sequence, tracks pass/fail per canister,
# prints a coverage summary table, and exits non-zero if any canister failed.
#
# Usage:
#   bash scripts/test-backend.sh            # Run all canisters
#   bash scripts/test-backend.sh auth job   # Run only specified canisters

set -uo pipefail   # Note: no -e so we can capture individual failures

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ── Verify replica is running ─────────────────────────────────────────────────
if ! dfx ping 2>/dev/null; then
  echo "❌  dfx is not running. Run: dfx start --background"
  exit 1
fi

# ── Canister list ─────────────────────────────────────────────────────────────
ALL_CANISTERS=(
  auth
  property
  job
  contractor
  quote
  price
  payment
  photo
  report
  market
  maintenance
  sensor
  monitoring
  recurring
)

# Use command-line args as filter, or run all
if [ $# -gt 0 ]; then
  CANISTERS=("$@")
else
  CANISTERS=("${ALL_CANISTERS[@]}")
fi

# ── Result tracking ───────────────────────────────────────────────────────────
declare -a PASSED=()
declare -a FAILED=()
declare -a SKIPPED=()

echo "============================================"
echo "  HomeFax — Backend Test Suite"
echo "============================================"
echo "  Running ${#CANISTERS[@]} canister(s)"
echo ""

# ── Run each canister test ────────────────────────────────────────────────────
for CANISTER in "${CANISTERS[@]}"; do
  TEST_SCRIPT="$REPO_ROOT/backend/$CANISTER/test.sh"

  if [ ! -f "$TEST_SCRIPT" ]; then
    echo "── [$CANISTER] SKIPPED — no test.sh found ───────────────────────────────"
    SKIPPED+=("$CANISTER")
    continue
  fi

  # Check canister is deployed
  CANISTER_ID=$(dfx canister id "$CANISTER" 2>/dev/null || echo "")
  if [ -z "$CANISTER_ID" ]; then
    echo "── [$CANISTER] SKIPPED — canister not deployed ──────────────────────────"
    SKIPPED+=("$CANISTER")
    continue
  fi

  echo "── [$CANISTER] Running tests ────────────────────────────────────────────"
  START_S=$SECONDS

  # Run in subshell to isolate set -e failures; capture exit code
  if bash "$TEST_SCRIPT" 2>&1; then
    ELAPSED=$(( SECONDS - START_S ))
    echo "   ✅  $CANISTER passed (${ELAPSED}s)"
    PASSED+=("$CANISTER")
  else
    ELAPSED=$(( SECONDS - START_S ))
    echo "   ❌  $CANISTER FAILED (${ELAPSED}s)"
    FAILED+=("$CANISTER")
  fi
  echo ""
done

# ── Summary table ─────────────────────────────────────────────────────────────
TOTAL=$(( ${#PASSED[@]} + ${#FAILED[@]} + ${#SKIPPED[@]} ))

echo "============================================"
echo "  Test Coverage Summary"
echo "============================================"
printf "  %-18s  %s\n" "Canister" "Result"
printf "  %-18s  %s\n" "------------------" "--------"

for C in "${PASSED[@]}";  do printf "  %-18s  ✅ Pass\n" "$C"; done
for C in "${FAILED[@]}";  do printf "  %-18s  ❌ FAIL\n" "$C"; done
for C in "${SKIPPED[@]}"; do printf "  %-18s  ⬜ Skip\n" "$C"; done

echo ""
printf "  Total:   %d  |  " "$TOTAL"
printf "Pass: %d  |  " "${#PASSED[@]}"
printf "Fail: %d  |  " "${#FAILED[@]}"
printf "Skip: %d\n"  "${#SKIPPED[@]}"
echo "============================================"

# ── Exit code ─────────────────────────────────────────────────────────────────
if [ ${#FAILED[@]} -gt 0 ]; then
  echo ""
  echo "❌  ${#FAILED[@]} canister test(s) failed: ${FAILED[*]}"
  exit 1
fi

echo ""
echo "✅  All ${#PASSED[@]} canister test(s) passed!"
exit 0
