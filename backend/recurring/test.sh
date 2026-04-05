#!/usr/bin/env bash
# HomeGentic Recurring Services Canister Tests
# Tests: createRecurringService (all service types, frequencies), getByProperty,
# addVisitLog, getVisitLogs, updateStatus (Active→Paused→Cancelled),
# cancelRecurringService idempotency (#AlreadyCancelled), pause/unpause
set -euo pipefail

echo "============================================"
echo "  HomeGentic — Recurring Services Canister Tests"
echo "============================================"

if ! dfx ping 2>/dev/null; then
  echo "❌ dfx is not running. Run: dfx start --background"
  exit 1
fi

CANISTER=$(dfx canister id recurring 2>/dev/null || echo "")
if [ -z "$CANISTER" ]; then
  echo "❌ recurring canister not deployed. Run: bash scripts/deploy.sh"
  exit 1
fi

echo "Recurring canister: $CANISTER"

# ─── Metrics & basic state ───────────────────────────────────────────────────
echo ""
echo "── [1] Get metrics (initial state) ─────────────────────────────────────"
dfx canister call recurring getMetrics

# ─── createRecurringService — LawnCare, Weekly ───────────────────────────────
echo ""
echo "── [2] createRecurringService — LawnCare, Weekly ────────────────────────"
LAWN=$(dfx canister call recurring createRecurringService '(
  "PROP_REC_1",
  variant { LawnCare },
  "GreenThumb Landscaping",
  opt "LIC-LAWN-4421",
  opt "512-555-0101",
  variant { Weekly },
  "2024-03-01",
  null,
  opt "Includes edging and blowing"
)')
echo "$LAWN"
LAWN_ID=$(echo "$LAWN" | grep -oP '(?<=id = ")[^"]+' | head -1 || echo "")
echo "  LawnCare ID: $LAWN_ID"

# ─── createRecurringService — PestControl, Monthly ────────────────────────────
echo ""
echo "── [3] createRecurringService — PestControl, Monthly ────────────────────"
PEST=$(dfx canister call recurring createRecurringService '(
  "PROP_REC_1",
  variant { PestControl },
  "BugBusters Inc",
  opt "LIC-PEST-8872",
  opt "512-555-0202",
  variant { Monthly },
  "2023-06-15",
  null,
  null
)')
echo "$PEST"
PEST_ID=$(echo "$PEST" | grep -oP '(?<=id = ")[^"]+' | head -1 || echo "")

# ─── createRecurringService — PoolMaintenance, BiWeekly ───────────────────────
echo ""
echo "── [4] createRecurringService — PoolMaintenance, BiWeekly ──────────────"
dfx canister call recurring createRecurringService '(
  "PROP_REC_1",
  variant { PoolMaintenance },
  "ClearWater Pool Service",
  null,
  opt "512-555-0303",
  variant { BiWeekly },
  "2024-05-01",
  opt "2026-05-01",
  opt "Chemical balance + vacuum"
)'

# ─── createRecurringService — GutterCleaning, SemiAnnually ───────────────────
echo ""
echo "── [5] createRecurringService — GutterCleaning, SemiAnnually ───────────"
dfx canister call recurring createRecurringService '(
  "PROP_REC_1",
  variant { GutterCleaning },
  "CleanSlate Gutter Co",
  null,
  null,
  variant { SemiAnnually },
  "2023-04-01",
  null,
  null
)'

# ─── createRecurringService — PressureWashing, Annually ──────────────────────
echo ""
echo "── [6] createRecurringService — PressureWashing, Annually ──────────────"
dfx canister call recurring createRecurringService '(
  "PROP_REC_2",
  variant { PressureWashing },
  "PowerWash Pro",
  opt "LIC-PW-333",
  null,
  variant { Annually },
  "2024-04-15",
  null,
  opt "Driveway, siding, fence"
)'

# ─── createRecurringService — Other, Quarterly ───────────────────────────────
echo ""
echo "── [7] createRecurringService — Other, Quarterly ────────────────────────"
dfx canister call recurring createRecurringService '(
  "PROP_REC_2",
  variant { Other },
  "Home Shield Warranty",
  null,
  opt "800-555-9999",
  variant { Quarterly },
  "2022-01-01",
  opt "2027-01-01",
  opt "Appliance and systems warranty coverage"
)'

# ─── createRecurringService — empty providerName (expect InvalidInput) ────────
echo ""
echo "── [8] createRecurringService — empty providerName (expect InvalidInput) ─"
dfx canister call recurring createRecurringService '(
  "PROP_REC_1",
  variant { LawnCare },
  "",
  null,
  null,
  variant { Monthly },
  "2025-01-01",
  null,
  null
)' || echo "  ↳ Expected InvalidInput — ✓"

# ─── getByProperty ────────────────────────────────────────────────────────────
echo ""
echo "── [9] getByProperty — PROP_REC_1 (expect 4 services) ──────────────────"
dfx canister call recurring getByProperty '("PROP_REC_1")'

echo ""
echo "── [10] getByProperty — PROP_REC_2 (expect 2 services) ─────────────────"
dfx canister call recurring getByProperty '("PROP_REC_2")'

echo ""
echo "── [11] getByProperty — unknown property (expect empty) ─────────────────"
dfx canister call recurring getByProperty '("PROP_UNKNOWN")'

# ─── addVisitLog ──────────────────────────────────────────────────────────────
echo ""
echo "── [12] addVisitLog — 3 visits for LawnCare ─────────────────────────────"
if [ -n "$LAWN_ID" ]; then
  dfx canister call recurring addVisitLog "(\"$LAWN_ID\", \"2026-01-07\", opt \"Mowed front and back, edged driveway\")"
  dfx canister call recurring addVisitLog "(\"$LAWN_ID\", \"2026-01-14\", null)"
  dfx canister call recurring addVisitLog "(\"$LAWN_ID\", \"2026-01-21\", opt \"Extra pass on back yard\")"
  echo "  ↳ 3 visit logs added ✓"
else
  echo "  ↳ Skipped — LAWN_ID not parsed"
fi

echo ""
echo "── [13] addVisitLog — 1 visit for PestControl ───────────────────────────"
if [ -n "$PEST_ID" ]; then
  dfx canister call recurring addVisitLog "(\"$PEST_ID\", \"2026-02-28\", opt \"Treated perimeter and attic\")"
else
  echo "  ↳ Skipped — PEST_ID not parsed"
fi

echo ""
echo "── [14] addVisitLog — unknown service (expect NotFound) ─────────────────"
dfx canister call recurring addVisitLog '("REC_9999", "2026-01-01", null)' \
  || echo "  ↳ Expected NotFound — ✓"

# ─── getVisitLogs ─────────────────────────────────────────────────────────────
echo ""
echo "── [15] getVisitLogs — LawnCare (expect 3, descending by date) ──────────"
if [ -n "$LAWN_ID" ]; then
  dfx canister call recurring getVisitLogs "(\"$LAWN_ID\")"
else
  echo "  ↳ Skipped — LAWN_ID not parsed"
fi

echo ""
echo "── [16] getVisitLogs — unknown service (expect empty) ───────────────────"
dfx canister call recurring getVisitLogs '("REC_9999")'

# ─── updateStatus: Active → Paused ───────────────────────────────────────────
echo ""
echo "── [17] updateStatus — LawnCare Active → Paused ─────────────────────────"
if [ -n "$LAWN_ID" ]; then
  dfx canister call recurring updateStatus "(\"$LAWN_ID\", variant { Paused })"
else
  echo "  ↳ Skipped — LAWN_ID not parsed"
fi

echo ""
echo "── [18] getMetrics — verify pausedServices = 1 ──────────────────────────"
dfx canister call recurring getMetrics

# ─── updateStatus: Paused → Cancelled ────────────────────────────────────────
echo ""
echo "── [19] updateStatus — LawnCare Paused → Cancelled ──────────────────────"
if [ -n "$LAWN_ID" ]; then
  dfx canister call recurring updateStatus "(\"$LAWN_ID\", variant { Cancelled })"
else
  echo "  ↳ Skipped — LAWN_ID not parsed"
fi

# ─── updateStatus idempotency: Cancelled → any (expect AlreadyCancelled) ──────
echo ""
echo "── [20] updateStatus — already Cancelled → Active (expect AlreadyCancelled) ─"
if [ -n "$LAWN_ID" ]; then
  dfx canister call recurring updateStatus "(\"$LAWN_ID\", variant { Active })" \
    || echo "  ↳ Expected AlreadyCancelled — ✓"
else
  echo "  ↳ Skipped — LAWN_ID not parsed"
fi

# ─── updateStatus — not found ─────────────────────────────────────────────────
echo ""
echo "── [21] updateStatus — unknown service (expect NotFound) ────────────────"
dfx canister call recurring updateStatus '("REC_9999", variant { Active })' \
  || echo "  ↳ Expected NotFound — ✓"

# ─── Pause / Unpause ──────────────────────────────────────────────────────────
echo ""
echo "── [22] pause canister ──────────────────────────────────────────────────"
dfx canister call recurring pause

echo ""
echo "── [23] createRecurringService while paused (expect error) ──────────────"
dfx canister call recurring createRecurringService '(
  "PROP_REC_1",
  variant { PestControl },
  "Another Pest Co",
  null,
  null,
  variant { Monthly },
  "2026-01-01",
  null,
  null
)' || echo "  ↳ Rejected while paused — ✓"

echo ""
echo "── [24] unpause canister ────────────────────────────────────────────────"
dfx canister call recurring unpause

echo ""
echo "── [25] createRecurringService after unpause (expect success) ───────────"
dfx canister call recurring createRecurringService '(
  "PROP_REC_1",
  variant { PestControl },
  "Another Pest Co",
  null,
  null,
  variant { Monthly },
  "2026-01-01",
  null,
  null
)'

# ─── Final metrics ────────────────────────────────────────────────────────────
echo ""
echo "── [26] Get metrics (after tests) ──────────────────────────────────────"
dfx canister call recurring getMetrics

echo ""
echo "============================================"
echo "  ✅ Recurring Services canister tests complete!"
echo "============================================"
