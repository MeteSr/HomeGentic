#!/usr/bin/env bash
# HomeGentic — Backend Test Coordinator (12.6.3)
#
# Runs each canister's test.sh in parallel, collects output to per-canister log
# files, prints them sequentially once all suites finish, and exits non-zero if
# any canister failed.
#
# Suites run in parallel against one set of deployed canisters, so they share
# state: a suite that lowers its canister's update rate limit to test it makes
# other suites' calls to that canister fail meanwhile. Suites in RUN_ALONE are
# run on their own before the parallel batch for that reason (property: job and
# bills register properties, and property/test.sh drops its limit to 2).
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
  bills
)

# Run one at a time, before the parallel batch (see header).
RUN_ALONE=(property)

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

_TOTAL_TESTS=$(node -e "
const fs = require('fs');
const canisters = $(printf '"%s",' "${CANISTERS[@]}" | sed 's/,$//; s/^/[/; s/$/]/');
let t = 0;
for (const c of canisters) {
  const f = '$REPO_ROOT/backend/' + c + '/test.sh';
  if (!fs.existsSync(f)) continue;
  const txt = fs.readFileSync(f, 'utf8');
  t += (txt.match(/── \[/g) || []).length + (txt.match(/^echo .▶ /mg) || []).length;
}
process.stdout.write(String(t));
" 2>/dev/null || echo "?")

echo "============================================"
echo "  HomeGentic — Backend Test Suite"
echo "  ${#CANISTERS[@]} canister suite(s)  ·  ${_TOTAL_TESTS} tests"
echo "============================================"
echo "  Launching ${#CANISTERS[@]} canister suite(s): ${RUN_ALONE[*]} alone, the rest in parallel"
echo ""

is_alone() { local c; for c in "${RUN_ALONE[@]}"; do [ "$c" = "$1" ] && return 0; done; return 1; }

# Alone suites first, then the rest; each list keeps the given order.
ORDERED=()
for CANISTER in "${CANISTERS[@]}"; do is_alone "$CANISTER" && ORDERED+=("$CANISTER"); done
for CANISTER in "${CANISTERS[@]}"; do is_alone "$CANISTER" || ORDERED+=("$CANISTER"); done

# ── Launch suites (RUN_ALONE ones finish before the next starts) ─────────────
for CANISTER in "${ORDERED[@]}"; do
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
  if is_alone "$CANISTER"; then
    echo "  ▶ $CANISTER running alone (pid $!)"
    wait $!; echo $? > "$LOG_DIR/$CANISTER.rc"; date +%s > "$LOG_DIR/$CANISTER.end"
  else
    echo "  ▶ $CANISTER launched (pid $!)"
  fi
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
  if [ -f "$LOG_DIR/$CANISTER.rc" ]; then RC=$(cat "$LOG_DIR/$CANISTER.rc"); else wait "$PID"; RC=$?; fi
  END_S=$(cat "$LOG_DIR/$CANISTER.end" 2>/dev/null || date +%s)
  if [ "$RC" -eq 0 ]; then
    ELAPSED=$(( END_S - START_S ))
    # Passing tests: suppress full log — just show the summary line.
    # Full log is still on disk until rm -rf below if you need to debug locally.
    echo "   ✅  $CANISTER passed (${ELAPSED}s)"
    PASSED+=("$CANISTER")
  else
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
