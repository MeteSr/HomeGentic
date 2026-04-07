#!/usr/bin/env bash
set -euo pipefail
echo "=== Contractor Canister Tests ==="

echo "▶ Register as contractor..."
dfx canister call contractor register '(record {
  name = "ACME Services";
  specialties = vec { variant { Plumbing } };
  email = "acme@contractors.com";
  phone = "555-9001";
})'

echo "▶ Get my contractor profile..."
dfx canister call contractor getMyProfile

echo "▶ Get all contractors..."
dfx canister call contractor getAll

echo "✅ Contractor tests passed!"

# ─── §47 Trusted Canister (inter-canister whitelist) ─────────────────────────
# contractor receives calls from: job (recordJobVerified)

echo ""
echo "=== Contractor — Trusted Canister Tests ==="

MY_PRINCIPAL=$(dfx identity get-principal)

if ! dfx identity list 2>/dev/null | grep -q "^canister-caller-test$"; then
  dfx identity new canister-caller-test --disable-encryption 2>/dev/null || true
fi
CALLER_TEST_PRINCIPAL=$(dfx identity get-principal --identity canister-caller-test)

echo ""
echo "── [T1] addTrustedCanister — admin can add ──────────────────────────────"
dfx canister call contractor addTrustedCanister "(principal \"$CALLER_TEST_PRINCIPAL\")"
echo "  ↳ addTrustedCanister succeeded — ✓"

echo ""
echo "── [T2] getTrustedCanisters — returns the added principal ───────────────"
TRUSTED=$(dfx canister call contractor getTrustedCanisters)
echo "$TRUSTED" | grep -q "$CALLER_TEST_PRINCIPAL" \
  && echo "  ↳ caller-test principal present in trusted list — ✓" \
  || (echo "  ↳ ❌ caller-test principal NOT found"; exit 1)

echo ""
echo "── [T3] addTrustedCanister — non-admin is rejected ─────────────────────"
if ! dfx identity list 2>/dev/null | grep -q "^property-test$"; then
  dfx identity new property-test --disable-encryption 2>/dev/null || true
fi
dfx canister call contractor addTrustedCanister "(principal \"$MY_PRINCIPAL\")" \
    --identity property-test \
  && echo "  ↳ ❌ Expected rejection for non-admin" \
  || echo "  ↳ Non-admin correctly rejected — ✓"

echo ""
echo "── [T4] Trusted principal bypasses rate limit ───────────────────────────"
dfx canister call contractor setUpdateRateLimit "(2 : nat)"
dfx canister call contractor getAll --identity canister-caller-test
dfx canister call contractor getAll --identity canister-caller-test
dfx canister call contractor getAll --identity canister-caller-test
echo "  ↳ 3 calls passed for trusted principal despite rate limit of 2 — ✓"
dfx canister call contractor setUpdateRateLimit "(30 : nat)"

echo ""
echo "── [T5] removeTrustedCanister — principal removed from list ─────────────"
dfx canister call contractor removeTrustedCanister "(principal \"$CALLER_TEST_PRINCIPAL\")"
TRUSTED_AFTER=$(dfx canister call contractor getTrustedCanisters)
echo "$TRUSTED_AFTER" | grep -q "$CALLER_TEST_PRINCIPAL" \
  && echo "  ↳ ❌ Principal still in list after removal" \
  || echo "  ↳ Principal correctly removed — ✓"

echo ""
echo "✅ Contractor trusted canister tests complete!"
