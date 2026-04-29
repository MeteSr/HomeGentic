#!/usr/bin/env bash
# HomeGentic Sensor Canister Tests
# Tests: device registration, reading ingestion, health classification
# (Critical/Warning/Info), pending alert queries, and auto-job creation
# on Critical events (requires job canister to be wired up).
set -euo pipefail

echo "============================================"
echo "  HomeGentic — Sensor Canister Tests"
echo "============================================"

if ! dfx ping 2>/dev/null; then
  echo "❌ dfx is not running. Run: dfx start --background"
  exit 1
fi

CANISTER=$(dfx canister id sensor 2>/dev/null || echo "")
JOB_ID=$(dfx canister id job 2>/dev/null || echo "")
if [ -z "$CANISTER" ]; then
  echo "❌ sensor canister not deployed. Run: bash scripts/deploy.sh"
  exit 1
fi

echo "Sensor canister: $CANISTER"
echo "Job canister:    $JOB_ID"

# Wire up job canister so Critical events auto-create jobs
if [ -n "$JOB_ID" ]; then
  echo ""
  echo "── [0] Wire job canister into sensor ────────────────────────────────────"
  dfx canister call sensor setJobCanisterId "(\"$JOB_ID\")" || echo "  ↳ Already set or admin required"
fi

# ─── Initial state ────────────────────────────────────────────────────────────
echo ""
echo "── [1] Get metrics (initial state) ─────────────────────────────────────"
dfx canister call sensor getMetrics

# ─── Device registration ──────────────────────────────────────────────────────
echo ""
echo "── [2] Register a Nest thermostat ───────────────────────────────────────"
dfx canister call sensor registerDevice '(
  "PROP_1",
  "nest-abc123",
  variant { Nest },
  "Living Room Thermostat"
)'

echo ""
echo "── [3] Register a Moen Flo water sensor ─────────────────────────────────"
dfx canister call sensor registerDevice '(
  "PROP_1",
  "moen-flo-xyz789",
  variant { MoenFlo },
  "Main Water Line Shutoff"
)'

echo ""
echo "── [4] getDevicesForProperty — should return 2 devices ─────────────────"
dfx canister call sensor getDevicesForProperty '("PROP_1")'

# ─── Event ingestion — Info severity ──────────────────────────────────────────
echo ""
echo "── [5] recordEvent — HVAC filter reminder (Info severity) ───────────────"
dfx canister call sensor recordEvent '(
  "nest-abc123",
  variant { HvacFilterDue },
  0.0,
  "",
  "{\"filterAge\":90}"
)'

echo ""
echo "── [6] recordEvent — high humidity (Warning severity) ───────────────────"
dfx canister call sensor recordEvent '(
  "nest-abc123",
  variant { HighHumidity },
  72.5,
  "%RH",
  "{\"humidity\":72.5}"
)'

# ─── Critical events — auto job creation ──────────────────────────────────────
echo ""
echo "── [7] recordEvent — water leak CRITICAL (should auto-create pending job) "
LEAK_EVENT=$(dfx canister call sensor recordEvent '(
  "moen-flo-xyz789",
  variant { WaterLeak },
  8.3,
  "L/min",
  "{\"flowRate\":8.3,\"shutoff\":true}"
)')
echo "$LEAK_EVENT"
if [ -n "$JOB_ID" ]; then
  echo "$LEAK_EVENT" | grep -q "jobId = opt" \
    && echo "  ↳ jobId auto-created for WaterLeak — ✓" \
    || (echo "  ↳ ❌ Expected jobId to be set for WaterLeak; got: $LEAK_EVENT"; exit 1)
else
  echo "  ↳ SKIP jobId assertion — job canister not deployed"
fi

echo ""
echo "── [8] recordEvent — low temperature CRITICAL (pipe freeze risk) ────────"
dfx canister call sensor recordEvent '(
  "nest-abc123",
  variant { LowTemperature },
  2.1,
  "°C",
  "{\"temp\":2.1}"
)'

# ─── Query events ──────────────────────────────────────────────────────────────
echo ""
echo "── [9] getEventsForProperty — limit 10 ─────────────────────────────────"
dfx canister call sensor getEventsForProperty '("PROP_1", 10)'

echo ""
echo "── [10] getPendingAlerts — should include Critical events ───────────────"
dfx canister call sensor getPendingAlerts '("PROP_1")'

# ─── Boundary values ──────────────────────────────────────────────────────────
echo ""
echo "── [11] recordEvent — HVAC alert (Critical) ─────────────────────────────"
HVAC_EVENT=$(dfx canister call sensor recordEvent '(
  "nest-abc123",
  variant { HvacAlert },
  0.0,
  "",
  "{\"code\":\"E4\",\"description\":\"Compressor fault\"}"
)')
echo "$HVAC_EVENT"
if [ -n "$JOB_ID" ]; then
  echo "$HVAC_EVENT" | grep -q "jobId = opt" \
    && echo "  ↳ jobId auto-created for HvacAlert — ✓" \
    || (echo "  ↳ ❌ Expected jobId to be set for HvacAlert; got: $HVAC_EVENT"; exit 1)
else
  echo "  ↳ SKIP jobId assertion — job canister not deployed"
fi

echo ""
echo "── [12] getEventsForProperty — limit 5 (pagination) ────────────────────"
dfx canister call sensor getEventsForProperty '("PROP_1", 5)'

# ─── Device deactivation ──────────────────────────────────────────────────────
echo ""
echo "── [13] deactivateDevice ────────────────────────────────────────────────"
dfx canister call sensor deactivateDevice '("DEV_2")'

echo ""
echo "── [14] getDevicesForProperty — deactivated device should still appear ──"
dfx canister call sensor getDevicesForProperty '("PROP_1")'

# ─── Final metrics ────────────────────────────────────────────────────────────
echo ""
echo "── [15] Get metrics (after tests) ──────────────────────────────────────"
METRICS=$(dfx canister call sensor getMetrics)
echo "$METRICS"
if [ -n "$JOB_ID" ]; then
  echo "$METRICS" | grep -qE "jobsCreated = [1-9]" \
    && echo "  ↳ jobsCreated > 0 — ✓" \
    || (echo "  ↳ ❌ Expected jobsCreated > 0 after Critical events"; exit 1)
else
  echo "  ↳ SKIP jobsCreated assertion — job canister not deployed"
fi

echo ""
echo "============================================"
echo "  ✅ Sensor canister tests complete!"
echo "============================================"
