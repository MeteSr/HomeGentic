#!/usr/bin/env bash
# HomeGentic Monitoring Canister Tests
# Tests: cycles metrics, cost/profitability calculations, alert generation,
# pause/unpause admin flow, generateDailyReport output
set -euo pipefail

echo "============================================"
echo "  HomeGentic — Monitoring Canister Tests"
echo "============================================"

if ! dfx ping 2>/dev/null; then
  echo "❌ dfx is not running. Run: dfx start --background"
  exit 1
fi

CANISTER=$(dfx canister id monitoring 2>/dev/null || echo "")
if [ -z "$CANISTER" ]; then
  echo "❌ monitoring canister not deployed. Run: bash scripts/deploy.sh"
  exit 1
fi

echo "Monitoring canister: $CANISTER"

# ─── Initial state ────────────────────────────────────────────────────────────
echo ""
echo "── [1] Get metrics (initial state) ─────────────────────────────────────"
dfx canister call monitoring getMetrics

echo ""
echo "── [2] getAllCanisterMetrics (should be empty) ───────────────────────────"
dfx canister call monitoring getAllCanisterMetrics

echo ""
echo "── [3] getActiveAlerts (should be empty) ────────────────────────────────"
dfx canister call monitoring getActiveAlerts

# ─── Cost metrics ─────────────────────────────────────────────────────────────
echo ""
echo "── [4] calculateCostMetrics — 100 users ─────────────────────────────────"
dfx canister call monitoring calculateCostMetrics '(100)'

echo ""
echo "── [5] calculateCostMetrics — 1000 users (larger scale) ─────────────────"
dfx canister call monitoring calculateCostMetrics '(1000)'

echo ""
echo "── [6] calculateCostMetrics — 0 users (edge case) ───────────────────────"
dfx canister call monitoring calculateCostMetrics '(0)'

# ─── Profitability ────────────────────────────────────────────────────────────
echo ""
echo "── [7] calculateProfitability — mixed tier distribution ─────────────────"
dfx canister call monitoring calculateProfitability '(
  record {
    totalUsers         = 500;
    activeUsers        = 400;
    newUsersToday      = 12;
    revenueUsd         = 4500.0;
    freeUsers          = 300;
    proUsers           = 150;
    premiumUsers       = 40;
    contractorProUsers = 10
  }
)'

echo ""
echo "── [8] calculateProfitability — all free tier (should show negative) ────"
dfx canister call monitoring calculateProfitability '(
  record {
    totalUsers         = 1000;
    activeUsers        = 200;
    newUsersToday      = 5;
    revenueUsd         = 0.0;
    freeUsers          = 1000;
    proUsers           = 0;
    premiumUsers       = 0;
    contractorProUsers = 0
  }
)'

# ─── canister metrics + alert triggers ────────────────────────────────────────
echo ""
echo "── [9] recordCanisterMetrics — healthy canister ─────────────────────────"
AUTH_ID=$(dfx canister id auth 2>/dev/null || echo "aaaaa-aa")
dfx canister call monitoring recordCanisterMetrics "(
  principal \"$AUTH_ID\",
  \"auth\",
  100_000_000_000_000,
  50000,
  0,
  1000000,
  45
)"

echo ""
echo "── [10] recordCanisterMetrics — low cycles (should trigger Warning alert) "
dfx canister call monitoring recordCanisterMetrics "(
  principal \"$AUTH_ID\",
  \"auth\",
  8_000_000_000_000,
  50000,
  0,
  1000000,
  45
)"

echo ""
echo "── [11] getActiveAlerts (expect cycles warning) ─────────────────────────"
dfx canister call monitoring getActiveAlerts

echo ""
echo "── [12] recordCanisterMetrics — critical cycles (should trigger Critical) "
dfx canister call monitoring recordCanisterMetrics "(
  principal \"$AUTH_ID\",
  \"auth\",
  2_000_000_000_000,
  50000,
  0,
  1000000,
  45
)"

echo ""
echo "── [13] getActiveAlerts (expect critical cycles alert) ──────────────────"
dfx canister call monitoring getActiveAlerts

# ─── Alert resolution ─────────────────────────────────────────────────────────
echo ""
echo "── [14] getAllCanisterMetrics ───────────────────────────────────────────"
dfx canister call monitoring getAllCanisterMetrics

echo ""
echo "── [15] generateDailyReport — build a report string ────────────────────"
dfx canister call monitoring generateDailyReport '(
  record {
    totalUsers         = 320;
    activeUsers        = 275;
    newUsersToday      = 8;
    revenueUsd         = 2800.0;
    freeUsers          = 200;
    proUsers           = 100;
    premiumUsers       = 18;
    contractorProUsers = 2
  }
)'

# ─── createInfoAlert ──────────────────────────────────────────────────────────
echo ""
echo "── [16] createInfoAlert ─────────────────────────────────────────────────"
dfx canister call monitoring createInfoAlert '(
  "Deploy completed — all 13 canisters upgraded successfully"
)'

echo ""
echo "── [17] getActiveAlerts (expect info alert) ─────────────────────────────"
dfx canister call monitoring getActiveAlerts

# ─── Pause / unpause ──────────────────────────────────────────────────────────
echo ""
echo "── [18] pause ───────────────────────────────────────────────────────────"
dfx canister call monitoring pause

echo ""
echo "── [19] getMetrics (isPaused should be true) ────────────────────────────"
dfx canister call monitoring getMetrics

echo ""
echo "── [20] unpause ─────────────────────────────────────────────────────────"
dfx canister call monitoring unpause

echo ""
echo "── [21] getMetrics (isPaused should be false) ───────────────────────────"
dfx canister call monitoring getMetrics

echo ""
echo "============================================"
echo "  ✅ Monitoring canister tests complete!"
echo "============================================"
