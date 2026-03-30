#!/usr/bin/env bash
# HomeFax Auth Canister — integration tests
# Covers: register, profile, role check, duplicate registration guard,
# updateProfile validation, recordLogin, addAdmin, pause/unpause (12.4.5).
# Run against a local replica: dfx start --background && bash backend/auth/test.sh
set -euo pipefail

CANISTER="auth"
echo "============================================"
echo "  HomeFax — Auth Canister Tests"
echo "============================================"

if ! dfx ping 2>/dev/null; then
  echo "❌ dfx is not running. Run: dfx start --background"
  exit 1
fi
CANISTER_ID=$(dfx canister id "$CANISTER" 2>/dev/null || echo "")
if [ -z "$CANISTER_ID" ]; then
  echo "❌ $CANISTER canister not deployed. Run: bash scripts/deploy.sh"
  exit 1
fi

MY_PRINCIPAL=$(dfx identity get-principal)

# Second identity for addAdmin test
if ! dfx identity list 2>/dev/null | grep -q "^auth-admin-test$"; then
  dfx identity new auth-admin-test --disable-encryption 2>/dev/null || true
fi
ADMIN2_PRINCIPAL=$(dfx identity get-principal --identity auth-admin-test)
echo "Secondary admin principal: $ADMIN2_PRINCIPAL"

# ─── Metrics (initial) ────────────────────────────────────────────────────────
echo ""
echo "── [1] Get metrics (before any users) ───────────────────────────────────"
dfx canister call $CANISTER getMetrics

# ─── Register as Homeowner ────────────────────────────────────────────────────
echo ""
echo "── [2] Register as Homeowner ────────────────────────────────────────────"
dfx canister call $CANISTER register '(record {
  role  = variant { Homeowner };
  email = "homeowner@homefax.app";
  phone = "512-555-0001"
})'

echo ""
echo "── [3] Get profile ──────────────────────────────────────────────────────"
dfx canister call $CANISTER getProfile

echo ""
echo "── [4] hasRole Homeowner — expect true ──────────────────────────────────"
dfx canister call $CANISTER hasRole '(variant { Homeowner })'

echo ""
echo "── [5] hasRole Contractor — expect false ────────────────────────────────"
dfx canister call $CANISTER hasRole '(variant { Contractor })'

echo ""
echo "── [6] hasRole Realtor — expect false ───────────────────────────────────"
dfx canister call $CANISTER hasRole '(variant { Realtor })'

# ─── Duplicate registration guard (12.4.5) ───────────────────────────────────
echo ""
echo "── [7] Register again → expect AlreadyExists (12.4.5) ──────────────────"
dfx canister call $CANISTER register '(record {
  role  = variant { Realtor };
  email = "duplicate@homefax.app";
  phone = "512-555-9999"
})' || echo "  ↳ Expected AlreadyExists — ✓"

# ─── updateProfile ────────────────────────────────────────────────────────────
echo ""
echo "── [8] updateProfile — change email and phone (12.4.5) ─────────────────"
dfx canister call $CANISTER updateProfile '(record {
  email = "updated@homefax.app";
  phone = "512-555-0099"
})'

echo ""
echo "── [9] getProfile — verify updated email/phone ──────────────────────────"
dfx canister call $CANISTER getProfile

echo ""
echo "── [10] updateProfile with invalid email (no @) → expect error ──────────"
dfx canister call $CANISTER updateProfile '(record {
  email = "notanemail";
  phone = ""
})' || echo "  ↳ Expected InvalidInput (email must contain @) — ✓"

echo ""
echo "── [11] updateProfile with email > 256 chars → expect error ─────────────"
LONG_EMAIL=$(python3 -c "print('a'*250 + '@x.com')" 2>/dev/null || printf '%0.sa' {1..250}"@x.com")
dfx canister call $CANISTER updateProfile "(record {
  email = \"$LONG_EMAIL\";
  phone = \"\"
})" || echo "  ↳ Expected InvalidInput (email too long) — ✓"

# ─── recordLogin (12.4.5) ────────────────────────────────────────────────────
echo ""
echo "── [12] recordLogin ─────────────────────────────────────────────────────"
dfx canister call $CANISTER recordLogin

echo ""
echo "── [13] getProfile — lastLoggedIn should now be set ─────────────────────"
dfx canister call $CANISTER getProfile

# ─── Register a Contractor via second identity ────────────────────────────────
echo ""
echo "── [14] Register secondary identity as Contractor (12.4.5) ──────────────"
dfx canister call $CANISTER register '(record {
  role  = variant { Contractor };
  email = "contractor@homefax.app";
  phone = "512-555-0002"
})' --identity auth-admin-test

echo ""
echo "── [15] hasRole Contractor on secondary identity — expect true ───────────"
dfx canister call $CANISTER hasRole '(variant { Contractor })' --identity auth-admin-test

# ─── Register a Realtor via a third identity ──────────────────────────────────
echo ""
echo "── [16] Register third identity as Realtor (12.4.5) ─────────────────────"
if ! dfx identity list 2>/dev/null | grep -q "^auth-realtor-test$"; then
  dfx identity new auth-realtor-test --disable-encryption 2>/dev/null || true
fi
dfx canister call $CANISTER register '(record {
  role  = variant { Realtor };
  email = "realtor@homefax.app";
  phone = ""
})' --identity auth-realtor-test

echo ""
echo "── [17] hasRole Realtor on realtor identity — expect true ───────────────"
dfx canister call $CANISTER hasRole '(variant { Realtor })' --identity auth-realtor-test

# ─── addAdmin (12.4.5) ───────────────────────────────────────────────────────
echo ""
echo "── [18] addAdmin — grant admin to secondary principal (12.4.5) ──────────"
dfx canister call $CANISTER addAdmin "(principal \"$ADMIN2_PRINCIPAL\")"

# ─── Metrics after all registrations ─────────────────────────────────────────
echo ""
echo "── [19] Get metrics (expect 3 users) ────────────────────────────────────"
dfx canister call $CANISTER getMetrics

# ─── Pause / unpause ──────────────────────────────────────────────────────────
echo ""
echo "── [20] pause ───────────────────────────────────────────────────────────"
dfx canister call $CANISTER pause '(null)'

echo ""
echo "── [21] Register while paused → expect Paused error ─────────────────────"
if ! dfx identity list 2>/dev/null | grep -q "^auth-paused-test$"; then
  dfx identity new auth-paused-test --disable-encryption 2>/dev/null || true
fi
dfx canister call $CANISTER register '(record {
  role  = variant { Homeowner };
  email = "";
  phone = ""
})' --identity auth-paused-test || echo "  ↳ Expected Paused error — ✓"

echo ""
echo "── [22] unpause ─────────────────────────────────────────────────────────"
dfx canister call $CANISTER unpause

echo ""
echo "── [23] Get final metrics ───────────────────────────────────────────────"
dfx canister call $CANISTER getMetrics

echo ""
echo "============================================"
echo "  ✅ Auth canister tests complete!"
echo "============================================"
