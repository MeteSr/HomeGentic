#!/usr/bin/env bash
# 13.6.1 — Benchmark harness
#
# Runs the full cycles baseline suite (13.1.1 + 13.1.2) against a local replica
# and outputs a Markdown summary table to tests/perf-baselines/benchmark-report.md
#
# Usage:
#   bash scripts/benchmark.sh               # auto-detects replica (dry-run if not running)
#   bash scripts/benchmark.sh --live        # require running replica; fail if not up
#   bash scripts/benchmark.sh --no-commit   # skip committing the report to git
#
# Output:
#   tests/perf-baselines/benchmark-report.md  (Markdown summary)
#   tests/perf-baselines/query-baseline.csv   (raw CSV — used by CI regression gate)
#   tests/perf-baselines/update-baseline.csv  (raw CSV)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BASELINES_DIR="$ROOT/tests/perf-baselines"
REPORT_FILE="$BASELINES_DIR/benchmark-report.md"
QUERY_CSV="$BASELINES_DIR/query-baseline.csv"
UPDATE_CSV="$BASELINES_DIR/update-baseline.csv"

LIVE_FLAG=""
NO_COMMIT=false

for arg in "$@"; do
  case "$arg" in
    --live)       LIVE_FLAG="--live" ;;
    --no-commit)  NO_COMMIT=true ;;
  esac
done

mkdir -p "$BASELINES_DIR"

# ── Check replica ─────────────────────────────────────────────────────────────

REPLICA_RUNNING=false
if command -v dfx &>/dev/null && dfx ping 2>/dev/null; then
  REPLICA_RUNNING=true
fi

if [ -n "$LIVE_FLAG" ] && [ "$REPLICA_RUNNING" = "false" ]; then
  echo "❌ --live flag set but dfx replica is not running. Run: dfx start --background"
  exit 1
fi

MODE="dry-run"
if [ "$REPLICA_RUNNING" = "true" ] || [ -n "$LIVE_FLAG" ]; then
  MODE="live"
fi

echo ""
echo "══════════════════════════════════════════════════════════════════════"
echo "  HomeFax Benchmark Harness (13.6.1)"
echo "  Mode: $MODE"
echo "══════════════════════════════════════════════════════════════════════"
echo ""

# ── Run query baseline (13.1.1) ───────────────────────────────────────────────

echo "▶ Running query baseline (13.1.1)…"
node "$ROOT/scripts/benchmark-queries.mjs" $LIVE_FLAG --csv > "$QUERY_CSV"
echo "  ✓ Query baseline written → $QUERY_CSV"

# ── Run update baseline (13.1.2) ─────────────────────────────────────────────

echo "▶ Running update baseline (13.1.2)…"
node "$ROOT/scripts/benchmark-updates.mjs" $LIVE_FLAG --csv > "$UPDATE_CSV"
echo "  ✓ Update baseline written → $UPDATE_CSV"

# ── Parse CSVs into Markdown ──────────────────────────────────────────────────

echo "▶ Generating Markdown report…"

TIMESTAMP="$(date -u '+%Y-%m-%d %H:%M UTC')"
GIT_SHA="$(cd "$ROOT" && git rev-parse --short HEAD 2>/dev/null || echo 'unknown')"

{
  echo "# HomeFax Benchmark Report"
  echo ""
  echo "> Generated: ${TIMESTAMP}  |  Commit: \`${GIT_SHA}\`  |  Mode: \`${MODE}\`"
  echo ""
  echo "Run \`bash scripts/benchmark.sh --live\` against a running replica for real measurements."
  echo ""

  # ── Query calls ───────────────────────────────────────────────────────────
  echo "## Query Calls"
  echo ""
  echo "| Canister | Method | p50 (ms) | p99 (ms) | Cycles est. | \$/1k calls | Flag |"
  echo "|---|---|---:|---:|---:|---:|---|"

  tail -n +2 "$QUERY_CSV" | while IFS=',' read -r canister method mode p50 p99 cycles usd flag; do
    cycles_m="$(echo "scale=1; $cycles / 1000000" | bc 2>/dev/null || echo "$cycles")"
    echo "| \`$canister\` | \`$method\` | ${p50} | ${p99} | ${cycles_m}M | \$${usd} | ${flag} |"
  done

  echo ""

  # ── Update calls ──────────────────────────────────────────────────────────
  echo "## Update Calls"
  echo ""
  echo "| Canister | Method | p50 (ms) | p99 (ms) | Cycles est. | \$/1k calls | Flag |"
  echo "|---|---|---:|---:|---:|---:|---|"

  tail -n +2 "$UPDATE_CSV" | while IFS=',' read -r canister method mode p50 p99 cycles usd flag; do
    cycles_m="$(echo "scale=1; $cycles / 1000000" | bc 2>/dev/null || echo "$cycles")"
    echo "| \`$canister\` | \`$method\` | ${p50} | ${p99} | ${cycles_m}M | \$${usd} | ${flag} |"
  done

  echo ""

  # ── Summary ───────────────────────────────────────────────────────────────
  echo "## Notes"
  echo ""
  echo "- **Query calls** are free on ICP (paid by the subnet replica). Cost estimates reflect"
  echo "  the ingress/egress overhead charged to the calling canister in cross-canister scenarios."
  echo "- **Update calls** go through consensus (~1-3s on mainnet, ~200ms local replica)."
  echo "  The cycles estimate includes: ingress fee (590K) + consensus overhead (3M) +"
  echo "  storage write cost (127K/KB) + instruction cost (200K per 1M instructions)."
  echo "- **Flag \`⚠ REVIEW\`** = estimated cycles > 1B — investigate before scaling."
  echo "- Baseline committed to \`tests/perf-baselines/\`. CI regression gate (13.6.4) compares"
  echo "  each PR against this baseline and fails on >25% cycles regression."

} > "$REPORT_FILE"

echo "  ✓ Report written → $REPORT_FILE"
echo ""

# ── Print top-3 summary ───────────────────────────────────────────────────────

echo "── Top-3 cycles-heaviest operations ────────────────────────────────────────"
cat "$QUERY_CSV" "$UPDATE_CSV" \
  | tail -n +2 \
  | sort -t',' -k6 -rn \
  | head -3 \
  | while IFS=',' read -r canister method mode p50 p99 cycles usd flag; do
      flag_icon="  "
      [ -n "$flag" ] && flag_icon="⚠ "
      printf "  %s%s.%s — %.1fM cycles  (\$%s/1k)\n" \
        "$flag_icon" "$canister" "$method" \
        "$(echo "scale=1; $cycles / 1000000" | bc 2>/dev/null || echo '?')" \
        "$usd"
    done
echo ""

# ── Optional git commit ───────────────────────────────────────────────────────

if [ "$NO_COMMIT" = "false" ] && command -v git &>/dev/null; then
  cd "$ROOT"
  if git diff --quiet "$BASELINES_DIR" 2>/dev/null; then
    echo "  (baselines unchanged — nothing to commit)"
  else
    git add "$BASELINES_DIR"
    echo "  Staged: $BASELINES_DIR"
    echo "  To commit: git commit -m 'perf: update benchmark baseline'"
  fi
fi

echo "✅ Benchmark complete."
