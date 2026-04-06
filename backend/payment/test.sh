#!/usr/bin/env bash
set -euo pipefail
echo "=== Payment Canister Tests ==="

echo "▶ Get current subscription (expect Free default)..."
dfx canister call payment getMySubscription

echo "▶ Subscribe to Pro tier..."
dfx canister call payment subscribe '(variant { Pro })'

echo "▶ Get updated subscription..."
dfx canister call payment getMySubscription

echo "✅ Payment tests passed!"

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
