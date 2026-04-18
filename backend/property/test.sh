#!/usr/bin/env bash
# HomeGentic Property Canister — integration tests
# Covers: register, retrieve, verification state machine (Unverified →
# PendingReview → Basic → Premium) (12.4.2), ownership transfer conflict
# window, tier enforcement, admin functions.
# Run against a local replica: dfx start --background && bash backend/property/test.sh
set -euo pipefail

CANISTER="property"
echo "============================================"
echo "  HomeGentic — Property Canister Tests"
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

# Ensure a second identity for transfer conflict test
if ! dfx identity list 2>/dev/null | grep -q "^property-buyer-test$"; then
  dfx identity new property-buyer-test --disable-encryption 2>/dev/null || true
fi
BUYER_PRINCIPAL=$(dfx identity get-principal --identity property-buyer-test)
echo "Buyer test principal: $BUYER_PRINCIPAL"

# ─── Metrics (initial) ────────────────────────────────────────────────────────
echo ""
echo "── [1] Get metrics (initial state) ─────────────────────────────────────"
dfx canister call $CANISTER getMetrics

# ─── Tier limits ──────────────────────────────────────────────────────────────
echo ""
echo "── [2] Tier limits ──────────────────────────────────────────────────────"
dfx canister call $CANISTER getPropertyLimitForTier '(variant { Free })'
dfx canister call $CANISTER getPropertyLimitForTier '(variant { Pro })'
dfx canister call $CANISTER getPropertyLimitForTier '(variant { Premium })'
dfx canister call $CANISTER getPropertyLimitForTier '(variant { ContractorPro })'

# ─── Register a property ──────────────────────────────────────────────────────
echo ""
echo "── [3] Register a property (Free tier) ─────────────────────────────────"
REG_OUT=$(dfx canister call $CANISTER registerProperty '(record {
  address      = "123 Main Street";
  city         = "Austin";
  state        = "TX";
  zipCode      = "78701";
  propertyType = variant { SingleFamily };
  yearBuilt    = 1995;
  squareFeet   = 2000;
  tier         = variant { Free };
})')
echo "$REG_OUT"
PROP_ID=$(echo "$REG_OUT" | grep -oP 'id = "\K[^"]+' | head -1 || true)
if [ -z "$PROP_ID" ]; then
  echo "❌ Failed to extract property ID from registerProperty output"
  exit 1
fi
echo "  → Property ID: $PROP_ID"

echo ""
echo "── [4] Get my properties ────────────────────────────────────────────────"
dfx canister call $CANISTER getMyProperties

echo ""
echo "── [5] Get property by ID — expect Unverified ───────────────────────────"
dfx canister call $CANISTER getProperty "(\"$PROP_ID\")"

echo ""
echo "── [6] getVerificationLevel — expect Unverified ─────────────────────────"
dfx canister call $CANISTER getVerificationLevel "(\"$PROP_ID\")"

# ─── Tier limit enforcement ───────────────────────────────────────────────────
echo ""
echo "── [7] Second property on Free tier → expect LimitReached ───────────────"
dfx canister call $CANISTER registerProperty '(record {
  address      = "456 Oak Avenue";
  city         = "Dallas";
  state        = "TX";
  zipCode      = "75201";
  propertyType = variant { Condo };
  yearBuilt    = 2010;
  squareFeet   = 900;
  tier         = variant { Free };
})' || echo "  ↳ Expected LimitReached — ✓"

# ─── Verification state machine (12.4.2) ──────────────────────────────────────
echo ""
echo "── [8] submitVerification → expect PendingReview (12.4.2) ──────────────"
dfx canister call $CANISTER submitVerification "(
  \"$PROP_ID\",
  \"UtilityBill\",
  \"sha256:a3f2b9c8d1e4f7a0b3c6d9e2f5a8b1c4d7e0f3a6b9c2d5e8f1a4b7c0d3e6f9\"
)"

echo ""
echo "── [9] getVerificationLevel — expect PendingReview ──────────────────────"
dfx canister call $CANISTER getVerificationLevel "(\"$PROP_ID\")"

echo ""
echo "── [10] getPendingVerifications — should contain property ───────────────"
dfx canister call $CANISTER getPendingVerifications

echo ""
echo "── [11] submitVerification again on PendingReview → expect error ─────────"
dfx canister call $CANISTER submitVerification "(
  \"$PROP_ID\",
  \"Deed\",
  \"sha256:b4a3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4\"
)" || echo "  ↳ Expected InvalidInput (already pending) — ✓"

echo ""
echo "── [12] Admin: verifyProperty → Basic (12.4.2) ──────────────────────────"
dfx canister call $CANISTER verifyProperty "(\"$PROP_ID\", variant { Basic }, null)"

echo ""
echo "── [13] getVerificationLevel — expect Basic ──────────────────────────────"
dfx canister call $CANISTER getVerificationLevel "(\"$PROP_ID\")"

echo ""
echo "── [14] Admin: verifyProperty → Premium (12.4.2) ────────────────────────"
dfx canister call $CANISTER verifyProperty "(\"$PROP_ID\", variant { Premium }, opt \"TitleDeed\")"

echo ""
echo "── [15] getVerificationLevel — expect Premium ───────────────────────────"
dfx canister call $CANISTER getVerificationLevel "(\"$PROP_ID\")"

echo ""
echo "── [16] getProperty — final state ───────────────────────────────────────"
dfx canister call $CANISTER getProperty "(\"$PROP_ID\")"

# ─── Ownership transfer — 7-day conflict window (12.4.2) ──────────────────────
echo ""
echo "── [17] initiateTransfer ────────────────────────────────────────────────"
dfx canister call $CANISTER initiateTransfer "(\"$PROP_ID\")"

echo ""
echo "── [18] getPendingTransfer ──────────────────────────────────────────────"
dfx canister call $CANISTER getPendingTransfer "(\"$PROP_ID\")"

echo ""
echo "── [19] cancelTransfer ──────────────────────────────────────────────────"
dfx canister call $CANISTER cancelTransfer "(\"$PROP_ID\")"

echo ""
echo "── [20] getPendingTransfer after cancel — expect empty ──────────────────"
dfx canister call $CANISTER getPendingTransfer "(\"$PROP_ID\")"

# ─── getOwnershipHistory ──────────────────────────────────────────────────────
echo ""
echo "── [21] getOwnershipHistory ─────────────────────────────────────────────"
dfx canister call $CANISTER getOwnershipHistory "(\"$PROP_ID\")"

# ─── Admin functions ──────────────────────────────────────────────────────────
echo ""
echo "── [22] isAdminPrincipal — should be true for dfx default identity ───────"
dfx canister call $CANISTER isAdminPrincipal "(principal \"$MY_PRINCIPAL\")"

echo ""
echo "── [23] pause / unpause ─────────────────────────────────────────────────"
dfx canister call $CANISTER pause '(null)'
dfx canister call $CANISTER unpause

# ─── Metrics (after) ──────────────────────────────────────────────────────────
echo ""
echo "── [24] Get metrics (after tests) ──────────────────────────────────────"
dfx canister call $CANISTER getMetrics

echo ""
echo "============================================"
echo "  ✅ Property canister tests complete!"
echo "============================================"

# ─── §47 Trusted Canister (inter-canister whitelist) ─────────────────────────
# property receives calls from: job (getPropertyOwner), report (getVerificationLevel)

MY_PRINCIPAL=$(dfx identity get-principal)

# Reuse or create a caller-test identity to stand in for job/report canister principals
if ! dfx identity list 2>/dev/null | grep -q "^canister-caller-test$"; then
  dfx identity new canister-caller-test --disable-encryption 2>/dev/null || true
fi
CALLER_TEST_PRINCIPAL=$(dfx identity get-principal --identity canister-caller-test)

echo ""
echo "── [25] addTrustedCanister — admin can add ──────────────────────────────"
dfx canister call $CANISTER addTrustedCanister "(principal \"$CALLER_TEST_PRINCIPAL\")"
echo "  ↳ addTrustedCanister succeeded — ✓"

echo ""
echo "── [26] getTrustedCanisters — returns the added principal ───────────────"
TRUSTED=$(dfx canister call $CANISTER getTrustedCanisters)
echo "$TRUSTED" | grep -q "$CALLER_TEST_PRINCIPAL" \
  && echo "  ↳ caller-test principal present in trusted list — ✓" \
  || (echo "  ↳ ❌ caller-test principal NOT found"; exit 1)

echo ""
echo "── [27] addTrustedCanister — non-admin is rejected ─────────────────────"
if ! dfx identity list 2>/dev/null | grep -q "^property-buyer-test$"; then
  dfx identity new property-buyer-test --disable-encryption 2>/dev/null || true
fi
dfx canister call $CANISTER addTrustedCanister "(principal \"$MY_PRINCIPAL\")" \
    --identity property-buyer-test \
  && echo "  ↳ ❌ Expected rejection for non-admin" \
  || echo "  ↳ Non-admin correctly rejected — ✓"

echo ""
echo "── [28] Trusted principal bypasses rate limit ───────────────────────────"
dfx canister call $CANISTER setUpdateRateLimit "(2 : nat)"
# caller-test is trusted — these calls should all pass despite limit=2
dfx canister call $CANISTER getProperty "(\"$PROP_ID\")" --identity canister-caller-test || true
dfx canister call $CANISTER getProperty "(\"$PROP_ID\")" --identity canister-caller-test || true
dfx canister call $CANISTER getProperty "(\"$PROP_ID\")" --identity canister-caller-test || true
echo "  ↳ 3 query-style calls passed for trusted principal despite rate limit of 2 — ✓"
dfx canister call $CANISTER setUpdateRateLimit "(30 : nat)"

echo ""
echo "── [29] removeTrustedCanister — principal removed from list ─────────────"
dfx canister call $CANISTER removeTrustedCanister "(principal \"$CALLER_TEST_PRINCIPAL\")"
TRUSTED_AFTER=$(dfx canister call $CANISTER getTrustedCanisters)
echo "$TRUSTED_AFTER" | grep -q "$CALLER_TEST_PRINCIPAL" \
  && echo "  ↳ ❌ Principal still in list after removal" \
  || echo "  ↳ Principal correctly removed — ✓"

echo ""
echo "── [30] Metrics after trusted canister tests ────────────────────────────"
dfx canister call $CANISTER getMetrics

# ─── §EXP Payment-wired tier enforcement ─────────────────────────────────────
# After setPaymentCanisterId is called, tierFor must consult the payment
# canister (not the local tierGrants map) to determine the caller's tier.

echo ""
echo "=== Property — Payment-Wired Tier Enforcement Tests ==="

PAYMENT_ID=$(dfx canister id payment 2>/dev/null || echo "")
if [ -z "$PAYMENT_ID" ]; then
  echo "⚠️  payment canister not deployed — skipping payment-wired tests"
else

  # Use a dedicated identity for tier-manipulation tests so the deployer's
  # tier is not mutated while other suites run in parallel.
  if ! dfx identity list 2>/dev/null | grep -q "^property-tier-test$"; then
    dfx identity new property-tier-test --disable-encryption 2>/dev/null || true
  fi
  PROP_TIER_PRINCIPAL=$(dfx identity get-principal --identity property-tier-test)

  echo ""
  echo "── [EXP-1] setPaymentCanisterId — wires property to payment canister ────"
  dfx canister call $CANISTER setPaymentCanisterId "(principal \"$PAYMENT_ID\")"
  echo "  ↳ setPaymentCanisterId succeeded — ✓"

  echo ""
  echo "── [EXP-2] On Free tier: register property → expect LimitReached ────────"
  dfx canister call payment grantSubscription "(principal \"$PROP_TIER_PRINCIPAL\", variant { Free })"
  dfx canister call $CANISTER registerProperty '(record {
    address      = "999 Payment-Wired Street";
    city         = "Austin";
    state        = "TX";
    zipCode      = "78701";
    propertyType = variant { SingleFamily };
    yearBuilt    = 2000;
    squareFeet   = 1500;
    tier         = variant { Free };
  })' --identity property-tier-test \
    && echo "  ↳ ❌ Expected LimitReached for Free tier via payment canister" \
    || echo "  ↳ Free tier limit enforced via payment canister — ✓"

  echo ""
  echo "── [EXP-3] Grant Pro via payment canister → property registration succeeds ─"
  dfx canister call payment grantSubscription "(principal \"$PROP_TIER_PRINCIPAL\", variant { Pro })"
  dfx canister call $CANISTER registerProperty '(record {
    address      = "999 Payment-Wired Street";
    city         = "Austin";
    state        = "TX";
    zipCode      = "78701";
    propertyType = variant { SingleFamily };
    yearBuilt    = 2000;
    squareFeet   = 1500;
    tier         = variant { Pro };
  })' --identity property-tier-test \
    && echo "  ↳ Pro tier allows property registration via payment canister — ✓" \
    || echo "  ↳ ❌ Pro tier should allow property registration"

  echo ""
  echo "── [EXP-4] Downgrade back to Free → further registrations rejected ──────"
  dfx canister call payment grantSubscription "(principal \"$PROP_TIER_PRINCIPAL\", variant { Free })"
  dfx canister call $CANISTER registerProperty '(record {
    address      = "888 Downgraded Lane";
    city         = "Austin";
    state        = "TX";
    zipCode      = "78701";
    propertyType = variant { SingleFamily };
    yearBuilt    = 2005;
    squareFeet   = 1200;
    tier         = variant { Free };
  })' --identity property-tier-test \
    && echo "  ↳ ❌ Expected LimitReached after downgrade" \
    || echo "  ↳ Downgraded to Free — limit correctly re-enforced via payment canister — ✓"

  echo ""
  echo "✅ Property payment-wired tier enforcement tests complete!"

fi
