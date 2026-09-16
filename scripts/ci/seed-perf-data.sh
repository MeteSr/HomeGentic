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
# Must run after scripts/ci/deploy-canisters.sh. Requires jq (present on
# GitHub-hosted runners by default).
set -euo pipefail

echo "── Seeding live perf-benchmark data ─────────────────────────────────"

PROPERTY_JSON=$(dfx canister call property registerProperty \
  '(record { address = "100 Perf Test Ln"; city = "Austin"; state = "TX"; zipCode = "78701"; propertyType = "SingleFamily"; yearBuilt = 2005 : nat; squareFeet = 2200 : nat; tier = variant { Pro } })' \
  --output json)
PROPERTY_ID=$(echo "$PROPERTY_JSON" | jq -r '.ok.id')
echo "  property:         $PROPERTY_ID"

JOB_JSON=$(dfx canister call job createJob \
  "(\"$PROPERTY_ID\", \"HVAC annual service\", variant { HVAC }, \"Annual maintenance visit\", null, 25000 : nat, 1_704_067_200_000_000_000 : int, null, null, false, null)" \
  --output json)
JOB_ID=$(echo "$JOB_JSON" | jq -r '.ok.id')
echo "  job:               $JOB_ID"

SERVICE_JSON=$(dfx canister call recurring createRecurringService \
  "(\"$PROPERTY_ID\", variant { PestControl }, \"PestAway Inc\", null, null, variant { Monthly }, \"2024-01-01\", null, null)" \
  --output json)
SERVICE_ID=$(echo "$SERVICE_JSON" | jq -r '.ok.id')
echo "  recurring service: $SERVICE_ID"

QUOTE_JSON=$(dfx canister call quote createQuoteRequest \
  "(\"$PROPERTY_ID\", variant { HVAC }, \"HVAC replacement needed\", variant { Medium }, null, null, null, null, null)" \
  --output json)
QUOTE_REQUEST_ID=$(echo "$QUOTE_JSON" | jq -r '.ok.id')
echo "  quote request:     $QUOTE_REQUEST_ID"

REPORT_JSON=$(dfx canister call report generateReport \
  "(\"$PROPERTY_ID\", record { address = \"100 Perf Test Ln\"; city = \"Austin\"; state = \"TX\"; zipCode = \"78701\"; propertyType = \"SingleFamily\"; yearBuilt = 2005 : nat; squareFeet = 2200 : nat; verificationLevel = \"Basic\" }, vec {}, vec {}, null, variant { Public }, null, null, null, null, null)" \
  --output json)
REPORT_TOKEN=$(echo "$REPORT_JSON" | jq -r '.ok.token')
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
