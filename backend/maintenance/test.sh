#!/usr/bin/env bash
# HomeGentic Maintenance Canister Tests
# Tests: predictMaintenance (urgency thresholds, DIY systems, job history),
# addScheduleEntry, getScheduleEntries, markCompleted, pause/unpause
set -euo pipefail

echo "============================================"
echo "  HomeGentic — Maintenance Canister Tests"
echo "============================================"

if ! dfx ping 2>/dev/null; then
  echo "❌ dfx is not running. Run: dfx start --background"
  exit 1
fi

CANISTER=$(dfx canister id maintenance 2>/dev/null || echo "")
if [ -z "$CANISTER" ]; then
  echo "❌ maintenance canister not deployed. Run: bash scripts/deploy.sh"
  exit 1
fi

echo "Maintenance canister: $CANISTER"
CURRENT_YEAR=2026

# ─── Metrics & basic state ───────────────────────────────────────────────────
echo ""
echo "── [1] Get metrics (initial state) ─────────────────────────────────────"
dfx canister call maintenance getMetrics

# ─── predictMaintenance — Good status (new home) ─────────────────────────────
echo ""
echo "── [2] predictMaintenance — brand-new home (expect all Good/Watch) ──────"
dfx canister call maintenance predictMaintenance "(
  $CURRENT_YEAR,
  vec {}
)"

# ─── predictMaintenance — aged home, no maintenance (expect Critical) ────────
echo ""
echo "── [3] predictMaintenance — 30yr-old home, no jobs (HVAC/Water Heater Critical) ─"
dfx canister call maintenance predictMaintenance "(
  1996,
  vec {}
)"

# ─── predictMaintenance — HVAC recently serviced (should push to Good) ───────
echo ""
echo "── [4] predictMaintenance — old home but HVAC recently replaced ─────────"
dfx canister call maintenance predictMaintenance "(
  1996,
  vec {
    record {
      serviceType   = \"HVAC\";
      completedYear = $((CURRENT_YEAR - 3))
    }
  }
)"

# ─── predictMaintenance — Water Heater urgency boundary (≥100% Critical) ─────
echo ""
echo "── [5] predictMaintenance — Water Heater at exactly 12yr lifespan (Critical) ─"
dfx canister call maintenance predictMaintenance "(
  $((CURRENT_YEAR - 12)),
  vec {}
)"

# ─── predictMaintenance — Roofing Soon boundary (~75%) ───────────────────────
echo ""
echo "── [6] predictMaintenance — Roofing at ~19yr of 25yr lifespan (Soon) ────"
dfx canister call maintenance predictMaintenance "(
  $((CURRENT_YEAR - 19)),
  vec {}
)"

# ─── predictMaintenance — DIY-viable systems (Flooring, Insulation) ──────────
echo ""
echo "── [7] predictMaintenance — 26yr home, check DIY flag on Flooring/Insulation ─"
dfx canister call maintenance predictMaintenance "(
  $((CURRENT_YEAR - 26)),
  vec {}
)"

# ─── predictMaintenance — all systems recently serviced (all Good) ───────────
echo ""
echo "── [8] predictMaintenance — all systems freshly replaced (expect all Good) ─"
dfx canister call maintenance predictMaintenance "(
  1990,
  vec {
    record { serviceType = \"HVAC\";         completedYear = $((CURRENT_YEAR - 1)) };
    record { serviceType = \"Roofing\";       completedYear = $((CURRENT_YEAR - 2)) };
    record { serviceType = \"Water Heater\";  completedYear = $((CURRENT_YEAR - 1)) };
    record { serviceType = \"Windows\";       completedYear = $((CURRENT_YEAR - 3)) };
    record { serviceType = \"Electrical\";    completedYear = $((CURRENT_YEAR - 5)) };
    record { serviceType = \"Plumbing\";      completedYear = $((CURRENT_YEAR - 5)) };
    record { serviceType = \"Flooring\";      completedYear = $((CURRENT_YEAR - 2)) };
    record { serviceType = \"Insulation\";    completedYear = $((CURRENT_YEAR - 4)) }
  }
)"

# ─── createScheduleEntry ──────────────────────────────────────────────────────
echo ""
echo "── [9] createScheduleEntry — HVAC annual filter replacement ────────────"
dfx canister call maintenance createScheduleEntry '(
  "PROP_TEST_1",
  "HVAC",
  "Replace air filter",
  2026,
  opt (4 : nat),
  null
)'

echo ""
echo "── [10] createScheduleEntry — Gutter cleaning (seasonal) ───────────────"
dfx canister call maintenance createScheduleEntry '(
  "PROP_TEST_1",
  "Roofing",
  "Clean gutters",
  2026,
  opt (5 : nat),
  null
)'

echo ""
echo "── [11] createScheduleEntry — second property ───────────────────────────"
dfx canister call maintenance createScheduleEntry '(
  "PROP_TEST_2",
  "Water Heater",
  "Flush sediment",
  2026,
  opt (6 : nat),
  opt (5000 : nat)
)'

# ─── getScheduleByProperty ───────────────────────────────────────────────────
echo ""
echo "── [12] getScheduleByProperty — PROP_TEST_1 (expect 2 entries) ──────────"
dfx canister call maintenance getScheduleByProperty '("PROP_TEST_1")'

echo ""
echo "── [13] getScheduleByProperty — PROP_TEST_2 (expect 1 entry) ───────────"
dfx canister call maintenance getScheduleByProperty '("PROP_TEST_2")'

echo ""
echo "── [14] getScheduleByProperty — unknown property (expect empty list) ────"
dfx canister call maintenance getScheduleByProperty '("PROP_UNKNOWN")'

# ─── markCompleted ────────────────────────────────────────────────────────────
echo ""
echo "── [15] markCompleted — mark HVAC filter entry as done ──────────────────"
# Get the entry ID from PROP_TEST_1 first entry
ENTRIES=$(dfx canister call maintenance getScheduleByProperty '("PROP_TEST_1")')
echo "  Entries: $ENTRIES"
# Extract first entry id (assumes returned as vec { record { id = ... } })
ENTRY_ID=$(echo "$ENTRIES" | grep -oP '(?<=id = ")[^"]+' | head -1 || echo "")
if [ -n "$ENTRY_ID" ]; then
  dfx canister call maintenance markCompleted "(\"$ENTRY_ID\")"
  echo "  ↳ Marked $ENTRY_ID as completed ✓"
else
  echo "  ↳ Could not parse entry ID from output (check Candid format) — skipping"
fi

# ─── Pause / Unpause ──────────────────────────────────────────────────────────
echo ""
echo "── [16] pause canister ──────────────────────────────────────────────────"
dfx canister call maintenance pause

echo ""
echo "── [17] createScheduleEntry while paused (expect error) ────────────────"
dfx canister call maintenance createScheduleEntry '(
  "PROP_TEST_1",
  "Plumbing",
  "Inspect shut-off valves",
  2026,
  opt (7 : nat),
  null
)' || echo "  ↳ Rejected while paused — ✓"

echo ""
echo "── [18] unpause canister ────────────────────────────────────────────────"
dfx canister call maintenance unpause

echo ""
echo "── [19] createScheduleEntry after unpause (expect success) ─────────────"
dfx canister call maintenance createScheduleEntry '(
  "PROP_TEST_1",
  "Plumbing",
  "Inspect shut-off valves",
  2026,
  opt (7 : nat),
  null
)'

# ─── Final metrics ────────────────────────────────────────────────────────────
echo ""
echo "── [20] Get metrics (after tests) ──────────────────────────────────────"
dfx canister call maintenance getMetrics

echo ""
echo "============================================"
echo "  ✅ Maintenance canister tests complete!"
echo "============================================"
