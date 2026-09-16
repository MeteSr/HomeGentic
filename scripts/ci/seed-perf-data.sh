#!/usr/bin/env bash
# Seeds one real property/job/recurring-service/quote-request/report so the
# live cycles benchmarks (scripts/benchmark-updates.mjs / benchmark-queries.mjs
# run with --live) have real records to read and write instead of the
# nonexistent placeholder IDs ("1", "RPT_mock_token", ...) the benchmark
# target tables used before. Property/job/report IDs are server-generated
# (random hex for property; see property/main.mo:nextPropertyId), so they
# can't be hardcoded — this script creates the records and exports the real
# IDs to $GITHUB_ENV for the benchmark steps that follow in the same job.
#
# Must run after scripts/ci/deploy-canisters.sh.
#
# Parses dfx's default Candid text output directly (same convention as
# scripts/lib/cycles-balance-check.sh) rather than relying on `--output json`,
# whose support/exact behavior across dfx versions is less certain.
set -euo pipefail
set -x  # trace every command — this step has failed opaquely twice already
        # and raw CI logs aren't reachable from this environment, so bash's
        # own execution trace is the only remaining way to see what happens.

# Runs a dfx canister call, always capturing combined stdout+stderr. Prints
# the full response to stderr (so it's visible in the CI log either way,
# without polluting the $(...) capture the caller uses to get $out back),
# and exits with a clear message on failure — so a bad call is diagnosable
# from the log instead of dying silently under `set -e` before its output
# was ever printed.
run_dfx() {
  local label="$1"; shift
  local out status
  out=$(dfx "$@" 2>&1)
  status=$?
  {
    echo "── $label (exit $status) ──"
    echo "$out"
  } >&2
  if [ $status -ne 0 ]; then
    echo "❌ $label failed (dfx exit $status)" >&2
    exit 1
  fi
  echo "$out"
}

# Extracts the first `<field> = "<value>"` occurrence from a Candid text blob
# (tolerant of the exact whitespace dfx's pretty-printer uses around `=`).
extract_field() {
  local blob="$1" field="$2"
  echo "$blob" | grep -oE "${field}[[:space:]]*=[[:space:]]*\"[^\"]*\"" | head -1 \
    | sed -E "s/${field}[[:space:]]*=[[:space:]]*\"(.*)\"/\1/"
}

# Fails loudly with the raw dfx response if a call returned `#err(...)` or
# didn't produce the expected field — better than a downstream call failing
# on an empty ID with no context.
require_field() {
  local blob="$1" field="$2" label="$3"
  local value
  value=$(extract_field "$blob" "$field")
  if [ -z "$value" ]; then
    echo "❌ Could not extract '$field' from $label response (shown above)"
    exit 1
  fi
  echo "$value"
}

echo "── Seeding live perf-benchmark data ─────────────────────────────────"

PROPERTY_OUT=$(run_dfx "property.registerProperty" canister call property registerProperty \
  '(record { address = "100 Perf Test Ln"; city = "Austin"; state = "TX"; zipCode = "78701"; propertyType = "SingleFamily"; yearBuilt = 2005 : nat; squareFeet = 2200 : nat; tier = variant { Pro } })' \
  --network local)
PROPERTY_ID=$(require_field "$PROPERTY_OUT" "id" "property.registerProperty")
echo "  property:         $PROPERTY_ID"

JOB_OUT=$(run_dfx "job.createJob" canister call job createJob \
  "(\"$PROPERTY_ID\", \"HVAC annual service\", variant { HVAC }, \"Annual maintenance visit\", null, 25000 : nat, 1_704_067_200_000_000_000 : int, null, null, false, null)" \
  --network local)
JOB_ID=$(require_field "$JOB_OUT" "id" "job.createJob")
echo "  job:               $JOB_ID"

SERVICE_OUT=$(run_dfx "recurring.createRecurringService" canister call recurring createRecurringService \
  "(\"$PROPERTY_ID\", variant { PestControl }, \"PestAway Inc\", null, null, variant { Monthly }, \"2024-01-01\", null, null)" \
  --network local)
SERVICE_ID=$(require_field "$SERVICE_OUT" "id" "recurring.createRecurringService")
echo "  recurring service: $SERVICE_ID"

QUOTE_OUT=$(run_dfx "quote.createQuoteRequest" canister call quote createQuoteRequest \
  "(\"$PROPERTY_ID\", variant { HVAC }, \"HVAC replacement needed\", variant { Medium }, null, null, null, null, null)" \
  --network local)
QUOTE_REQUEST_ID=$(require_field "$QUOTE_OUT" "id" "quote.createQuoteRequest")
echo "  quote request:     $QUOTE_REQUEST_ID"

REPORT_OUT=$(run_dfx "report.generateReport" canister call report generateReport \
  "(\"$PROPERTY_ID\", record { address = \"100 Perf Test Ln\"; city = \"Austin\"; state = \"TX\"; zipCode = \"78701\"; propertyType = \"SingleFamily\"; yearBuilt = 2005 : nat; squareFeet = 2200 : nat; verificationLevel = \"Basic\" }, vec {}, vec {}, null, variant { Public }, null, null, null, null, null)" \
  --network local)
REPORT_TOKEN=$(require_field "$REPORT_OUT" "token" "report.generateReport")
echo "  report token:      $REPORT_TOKEN"

for pair in \
  "PERF_PROPERTY_ID=$PROPERTY_ID" \
  "PERF_JOB_ID=$JOB_ID" \
  "PERF_SERVICE_ID=$SERVICE_ID" \
  "PERF_QUOTE_REQUEST_ID=$QUOTE_REQUEST_ID" \
  "PERF_REPORT_TOKEN=$REPORT_TOKEN"; do
  echo "$pair" >> "$GITHUB_ENV"
done

echo "── Seed complete ─────────────────────────────────────────────────────"
