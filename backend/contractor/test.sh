#!/usr/bin/env bash
set -euo pipefail
echo "=== Contractor Canister Tests ==="

echo "▶ Register as contractor..."
dfx canister call contractor register '(record {
  name = "ACME Services";
  specialties = vec { variant { Plumbing } };
  email = "acme@contractors.com";
  phone = "+12125559001";
})'

echo "▶ Get my contractor profile..."
dfx canister call contractor getMyProfile

echo "▶ Get all contractors..."
dfx canister call contractor getAll

echo "✅ Contractor tests passed!"

# ─── §147 input validation tests ─────────────────────────────────────────────
echo ""
echo "=== Contractor — §147 Input Validation Tests ==="

echo ""
echo "── [V1] register with non-E.164 phone → expect error ───────────────────"
if ! dfx identity list 2>/dev/null | grep -q "^contractor-val-test$"; then
  dfx identity new contractor-val-test --disable-encryption 2>/dev/null || true
fi
dfx canister call contractor register '(record {
  name = "Bad Phone Co";
  specialties = vec { variant { Electrical } };
  email = "test@contractors.com";
  phone = "555-1234";
})' --identity contractor-val-test \
  || echo "  ↳ Expected InvalidInput (phone not E.164) — ✓"

echo ""
echo "── [V2] register with email containing spaces → expect error ────────────"
dfx canister call contractor register '(record {
  name = "Spacey Co";
  specialties = vec { variant { Electrical } };
  email = "bad email@test.com";
  phone = "+12125550001";
})' --identity contractor-val-test \
  || echo "  ↳ Expected InvalidInput (email must not contain spaces) — ✓"

echo ""
echo "── [V3] updateProfile with valid E.164 phone → expect ok ───────────────"
dfx canister call contractor updateProfile '(record {
  name = "ACME Services";
  specialties = vec { variant { Plumbing } };
  email = "acme@contractors.com";
  phone = "+442071234567";
})' && echo "  ↳ Valid E.164 phone accepted — ✓"

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

# ─── §R submitReview negative cases ─────────────────────────────────────────
echo ""
echo "=== Contractor — submitReview Negative Cases ==="

MY_PRINCIPAL=$(dfx identity get-principal)

echo ""
echo "── [R1] submitReview — non-existent contractor → expect NotFound ─────────"
FAKE_PRINCIPAL="aaaaa-aa"
REVIEW_NOTFOUND=$(dfx canister call contractor submitReview \
  "(principal \"$FAKE_PRINCIPAL\", 4, \"Great work\", \"JOB_X\")" 2>&1 || true)
echo "$REVIEW_NOTFOUND"
if echo "$REVIEW_NOTFOUND" | grep -qiE "NotFound|err"; then
  echo "  ✓ submitReview correctly returns NotFound for unknown contractor"
else
  echo "  ↳ ❌ Expected NotFound for non-existent contractor"
fi

echo ""
echo "── [R2] submitReview — rating = 0 → expect InvalidInput ─────────────────"
REVIEW_BADRATING=$(dfx canister call contractor submitReview \
  "(principal \"$MY_PRINCIPAL\", 0, \"No stars\", \"JOB_X\")" 2>&1 || true)
echo "$REVIEW_BADRATING"
if echo "$REVIEW_BADRATING" | grep -qiE "InvalidInput|err"; then
  echo "  ✓ rating 0 correctly rejected"
else
  echo "  ↳ ❌ Expected InvalidInput for rating = 0"
fi

echo ""
echo "── [R3] submitReview — rating = 6 → expect InvalidInput ─────────────────"
REVIEW_HIGHRATING=$(dfx canister call contractor submitReview \
  "(principal \"$MY_PRINCIPAL\", 6, \"Six stars\", \"JOB_X\")" 2>&1 || true)
echo "$REVIEW_HIGHRATING"
if echo "$REVIEW_HIGHRATING" | grep -qiE "InvalidInput|err"; then
  echo "  ✓ rating 6 correctly rejected"
else
  echo "  ↳ ❌ Expected InvalidInput for rating = 6"
fi

echo ""
echo "── [R4] submitReview — empty comment → expect InvalidInput ──────────────"
REVIEW_EMPTY=$(dfx canister call contractor submitReview \
  "(principal \"$MY_PRINCIPAL\", 4, \"\", \"JOB_X\")" 2>&1 || true)
echo "$REVIEW_EMPTY"
if echo "$REVIEW_EMPTY" | grep -qiE "InvalidInput|err"; then
  echo "  ✓ empty comment correctly rejected"
else
  echo "  ↳ ❌ Expected InvalidInput for empty comment"
fi

echo ""
echo "── [R5] submitReview — empty jobId → expect InvalidInput ────────────────"
REVIEW_NOJOB=$(dfx canister call contractor submitReview \
  "(principal \"$MY_PRINCIPAL\", 4, \"Good job\", \"\")" 2>&1 || true)
echo "$REVIEW_NOJOB"
if echo "$REVIEW_NOJOB" | grep -qiE "InvalidInput|err"; then
  echo "  ✓ empty jobId correctly rejected"
else
  echo "  ↳ ❌ Expected InvalidInput for empty jobId"
fi

echo ""
echo "✅ Contractor submitReview negative case tests complete!"
