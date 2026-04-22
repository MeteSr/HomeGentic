#!/usr/bin/env bash
# HomeGentic — Backend Test Coordinator (12.6.3)
#
# Runs each canister's test.sh in parallel, collects output to per-canister log
# files, prints them sequentially once all suites finish, and exits non-zero if
# any canister failed.
#
# Parallelism is safe because every canister test script operates on its own
# canister and registers its own test identities — there is no shared mutable
# state between suites.
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
declare -a ACTIVE=()   # canisters actually launched
declare -a PIDS=()     # matching background PIDs

LOG_DIR=$(mktemp -d /tmp/test-backend-XXXXXX)

echo "============================================"
echo "  HomeGentic — Backend Test Suite"
echo "============================================"
echo "  Launching ${#CANISTERS[@]} canister suite(s) in parallel"
echo ""

# ── Launch all suites in parallel ────────────────────────────────────────────
for CANISTER in "${CANISTERS[@]}"; do
  TEST_SCRIPT="$REPO_ROOT/backend/$CANISTER/test.sh"

  if [ ! -f "$TEST_SCRIPT" ]; then
    echo "  ⬜ $CANISTER — no test.sh, skipping"
    SKIPPED+=("$CANISTER")
    continue
  fi

  CANISTER_ID=$(dfx canister id "$CANISTER" 2>/dev/null || echo "")
  if [ -z "$CANISTER_ID" ]; then
    echo "  ⬜ $CANISTER — not deployed, skipping"
    SKIPPED+=("$CANISTER")
    continue
  fi

  # Record wall-clock start time and launch
  date +%s > "$LOG_DIR/$CANISTER.start"
  bash "$TEST_SCRIPT" > "$LOG_DIR/$CANISTER.log" 2>&1 &
  PIDS+=($!)
  ACTIVE+=("$CANISTER")
  echo "  ▶ $CANISTER launched (pid $!)"
done

echo ""
echo "  Waiting for ${#ACTIVE[@]} suite(s)..."
echo ""

# ── Collect results in launch order ──────────────────────────────────────────
for i in "${!ACTIVE[@]}"; do
  CANISTER="${ACTIVE[$i]}"
  PID="${PIDS[$i]}"
  START_S=$(cat "$LOG_DIR/$CANISTER.start")

  # wait returns the exit code of the background process
  if wait "$PID"; then
    END_S=$(date +%s)
    ELAPSED=$(( END_S - START_S ))
    # Passing tests: suppress full log — just show the summary line.
    # Full log is still on disk until rm -rf below if you need to debug locally.
    echo "   ✅  $CANISTER passed (${ELAPSED}s)"
    PASSED+=("$CANISTER")
  else
    END_S=$(date +%s)
    ELAPSED=$(( END_S - START_S ))
    echo ""
    echo "── [$CANISTER FAILED — full output] ──────────────────────────────────"
    cat "$LOG_DIR/$CANISTER.log"
    echo ""
    # Print a compact failure digest: lines with explicit ↳ ❌ markers + last
    # 20 lines (which usually contain the point where the script exited).
    ASSERTIONS=$(grep -n " ↳ ❌ " "$LOG_DIR/$CANISTER.log" || true)
    if [ -n "$ASSERTIONS" ]; then
      echo "   ── Assertion failures ─────────────────────────────────────────"
      echo "$ASSERTIONS"
      echo ""
    fi
    echo "   ── Last 20 lines (exit context) ───────────────────────────────"
    tail -20 "$LOG_DIR/$CANISTER.log"
    echo ""
    echo "   ❌  $CANISTER FAILED (${ELAPSED}s)"
    FAILED+=("$CANISTER")
  fi
done

rm -rf "$LOG_DIR"

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
