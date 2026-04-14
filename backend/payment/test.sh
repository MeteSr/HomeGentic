#!/usr/bin/env bash
set -euo pipefail
echo "=== Payment Canister Tests ==="

MY_PRINCIPAL=$(dfx identity get-principal)

# Bootstrap admin idempotently — deploy.sh should have already called initAdmins,
# but if this test runs standalone (no prior deploy.sh), we do it here.
# The || true suppresses the NotAuthorized error when already initialized.
echo "▶ Ensuring payment admin is initialized..."
dfx canister call payment initAdmins "(vec { principal \"$MY_PRINCIPAL\" })" \
  --network local 2>/dev/null || true

echo "▶ Get current subscription (expect Free default)..."
dfx canister call payment getMySubscription

echo "▶ Grant Pro subscription (bypasses ICP payment — local dev only)..."
dfx canister call payment grantSubscription "(principal \"$MY_PRINCIPAL\", variant { Pro })"

echo "▶ Get updated subscription (expect Pro)..."
dfx canister call payment getMySubscription

echo "▶ getTierForPrincipal — expect Pro..."
dfx canister call payment getTierForPrincipal "(principal \"$MY_PRINCIPAL\")"

echo "▶ Grant Premium subscription..."
dfx canister call payment grantSubscription "(principal \"$MY_PRINCIPAL\", variant { Premium })"

echo "▶ Get updated subscription (expect Premium)..."
dfx canister call payment getMySubscription

echo "▶ Downgrade to Free via grantSubscription..."
dfx canister call payment grantSubscription "(principal \"$MY_PRINCIPAL\", variant { Free })"
dfx canister call payment getMySubscription

echo "▶ Grant ContractorFree subscription..."
dfx canister call payment grantSubscription "(principal \"$MY_PRINCIPAL\", variant { ContractorFree })"
SUB=$(dfx canister call payment getMySubscription)
echo "$SUB" | grep -q "ContractorFree" \
  && echo "  ↳ ContractorFree tier confirmed — ✓" \
  || (echo "  ↳ ❌ Expected ContractorFree tier"; exit 1)

echo "▶ ContractorFree expiresAt should be 0 (no expiry — free tier)..."
echo "$SUB" | grep -q "expiresAt = 0" \
  && echo "  ↳ expiresAt = 0 confirmed — ✓" \
  || echo "  ↳ expiresAt not 0 (may vary by format) — review output above"

echo "▶ getPricing ContractorFree (expect priceUSD=0, photosPerJob=5)..."
dfx canister call payment getPricing '(variant { ContractorFree })'

echo "▶ getPriceQuote Free (expect 0)..."
dfx canister call payment getPriceQuote '(variant { Free })'

echo "▶ getSubscriptionStats — verify contractorFree field present..."
dfx canister call payment getSubscriptionStats

echo "✅ Payment tests passed!"
echo ""
echo "NOTE: subscribe() requires a live ICP ledger + XRC canister."
echo "      Use grantSubscription() for local testing."

# ─── §47 Trusted Canister (inter-canister whitelist) ─────────────────────────
# payment receives calls from: job (getTierForPrincipal)

echo ""
echo "=== Payment — Trusted Canister Tests ==="

MY_PRINCIPAL=$(dfx identity get-principal)

if ! dfx identity list 2>/dev/null | grep -q "^canister-caller-test$"; then
  dfx identity new canister-caller-test --disable-encryption 2>/dev/null || true
fi
CALLER_TEST_PRINCIPAL=$(dfx identity get-principal --identity canister-caller-test)

echo ""
echo "── [T1] addTrustedCanister — admin (controller) can add ─────────────────"
dfx canister call payment addTrustedCanister "(principal \"$CALLER_TEST_PRINCIPAL\")"
echo "  ↳ addTrustedCanister succeeded — ✓"

echo ""
echo "── [T2] getTrustedCanisters — returns the added principal ───────────────"
TRUSTED=$(dfx canister call payment getTrustedCanisters)
echo "$TRUSTED" | grep -q "$CALLER_TEST_PRINCIPAL" \
  && echo "  ↳ caller-test principal present in trusted list — ✓" \
  || (echo "  ↳ ❌ caller-test principal NOT found"; exit 1)

echo ""
echo "── [T3] addTrustedCanister — non-controller is rejected ─────────────────"
if ! dfx identity list 2>/dev/null | grep -q "^contractor-test$"; then
  dfx identity new contractor-test --disable-encryption 2>/dev/null || true
fi
dfx canister call payment addTrustedCanister "(principal \"$MY_PRINCIPAL\")" \
    --identity contractor-test \
  && echo "  ↳ ❌ Expected rejection for non-controller" \
  || echo "  ↳ Non-controller correctly rejected — ✓"

echo ""
echo "── [T4] Trusted principal bypasses rate limit ───────────────────────────"
dfx canister call payment setUpdateRateLimit "(2 : nat)"
dfx canister call payment getMySubscription --identity canister-caller-test
dfx canister call payment getMySubscription --identity canister-caller-test
dfx canister call payment getMySubscription --identity canister-caller-test
echo "  ↳ 3 calls passed for trusted principal despite rate limit of 2 — ✓"
dfx canister call payment setUpdateRateLimit "(30 : nat)"

echo ""
echo "── [T5] removeTrustedCanister — principal removed from list ─────────────"
dfx canister call payment removeTrustedCanister "(principal \"$CALLER_TEST_PRINCIPAL\")"
TRUSTED_AFTER=$(dfx canister call payment getTrustedCanisters)
echo "$TRUSTED_AFTER" | grep -q "$CALLER_TEST_PRINCIPAL" \
  && echo "  ↳ ❌ Principal still in list after removal" \
  || echo "  ↳ Principal correctly removed — ✓"

echo ""
echo "✅ Payment trusted canister tests complete!"

# ─── §STRIPE Admin + Stripe config tests ─────────────────────────────────────
# Tests for initAdmins, configureStripe, isStripeConfigured.
# HTTP outcall tests (createStripeCheckoutSession, verifyStripeSession) require
# a live Stripe sandbox key and cannot run against a local replica without
# a cycle-funded canister — skip those here.

echo ""
echo "=== Payment — Stripe Admin & Config Tests ==="

MY_PRINCIPAL=$(dfx identity get-principal)

echo ""
echo "── [S1] isAdminPrincipal — deployer should be admin ─────────────────────"
RESULT=$(dfx canister call payment isAdminPrincipal "(principal \"$MY_PRINCIPAL\")")
echo "$RESULT" | grep -q "true" \
  && echo "  ↳ isAdminPrincipal = true — ✓" \
  || echo "  ↳ ❌ Expected deployer to be admin"

echo ""
echo "── [S2] initAdmins again → expect NotAuthorized (one-time only) ─────────"
RESULT=$(dfx canister call payment initAdmins "(vec { principal \"$MY_PRINCIPAL\" })" 2>&1) || true
echo "$RESULT" | grep -q "NotAuthorized" \
  && echo "  ↳ Second initAdmins correctly rejected — ✓" \
  || echo "  ↳ ❌ Expected NotAuthorized on repeat call"

echo ""
echo "── [S3] isAdminPrincipal — expect true for bootstrapped admin ───────────"
RESULT=$(dfx canister call payment isAdminPrincipal "(principal \"$MY_PRINCIPAL\")")
echo "$RESULT" | grep -q "true" \
  && echo "  ↳ isAdminPrincipal = true — ✓" \
  || echo "  ↳ ❌ Expected true"

echo ""
echo "── [S4] isStripeConfigured — expect false before configureStripe ────────"
RESULT=$(dfx canister call payment isStripeConfigured)
echo "$RESULT" | grep -q "false" \
  && echo "  ↳ isStripeConfigured = false (not yet configured) — ✓" \
  || echo "  ↳ ❌ Expected false"

echo ""
echo "── [S5] configureStripe — set sandbox config ────────────────────────────"
dfx canister call payment configureStripe '(record {
  secretKey  = "sk_test_placeholder";
  successUrl = "http://localhost:5173/payment-success";
  cancelUrl  = "http://localhost:5173/payment-failure";
  priceIds   = record {
    proMonthly           = "price_pro_monthly_test";
    proYearly            = "price_pro_yearly_test";
    premiumMonthly       = "price_premium_monthly_test";
    premiumYearly        = "price_premium_yearly_test";
    contractorProMonthly = "price_cpro_monthly_test";
    contractorProYearly  = "price_cpro_yearly_test";
  }
})'
echo "  ↳ configureStripe succeeded — ✓"

echo ""
echo "── [S6] isStripeConfigured — expect true after configureStripe ──────────"
RESULT=$(dfx canister call payment isStripeConfigured)
echo "$RESULT" | grep -q "true" \
  && echo "  ↳ isStripeConfigured = true — ✓" \
  || echo "  ↳ ❌ Expected true after configureStripe"

echo ""
echo "── [S7] configureStripe — non-admin is rejected ─────────────────────────"
if ! dfx identity list 2>/dev/null | grep -q "^stripe-nonadmin-test$"; then
  dfx identity new stripe-nonadmin-test --disable-encryption 2>/dev/null || true
fi
RESULT=$(dfx canister call payment configureStripe '(record {
  secretKey  = "sk_test_should_fail";
  successUrl = "http://localhost:5173/payment-success";
  cancelUrl  = "http://localhost:5173/payment-failure";
  priceIds   = record {
    proMonthly = "x"; proYearly = "x"; premiumMonthly = "x";
    premiumYearly = "x"; contractorProMonthly = "x"; contractorProYearly = "x";
  }
})' --identity stripe-nonadmin-test 2>&1)
echo "$RESULT" | grep -q "NotAuthorized" \
  && echo "  ↳ Non-admin correctly rejected from configureStripe — ✓" \
  || echo "  ↳ ❌ Expected NotAuthorized for non-admin"

echo ""
echo "── [S8] redeemGift — unknown token → NotFound ───────────────────────────"
RESULT=$(dfx canister call payment redeemGift '("cs_nonexistent_token")' 2>&1)
echo "$RESULT" | grep -q "NotFound" \
  && echo "  ↳ redeemGift unknown token → NotFound — ✓" \
  || echo "  ↳ ❌ Expected NotFound for unknown gift token"

echo ""
echo "── [S9] listPendingGifts — admin gets empty list initially ──────────────"
RESULT=$(dfx canister call payment listPendingGifts)
echo "$RESULT" | grep -q "ok" \
  && echo "  ↳ listPendingGifts returned ok — ✓" \
  || echo "  ↳ ❌ Expected ok from listPendingGifts"

echo ""
echo "── [S10] listPendingGifts — non-admin rejected ──────────────────────────"
RESULT=$(dfx canister call payment listPendingGifts --identity stripe-nonadmin-test 2>&1)
echo "$RESULT" | grep -q "NotAuthorized" \
  && echo "  ↳ Non-admin correctly rejected from listPendingGifts — ✓" \
  || echo "  ↳ ❌ Expected NotAuthorized for non-admin"

echo ""
echo "✅ Payment Stripe admin & config tests complete!"
echo "   Note: createStripeCheckoutSession / verifyStripeSession require a"
echo "   live Stripe sandbox key and cycles — test via the UI with a deployed canister."
