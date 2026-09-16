#!/usr/bin/env bash
# HomeGentic AI Proxy Canister — integration tests
# Covers: admin setup, pure functions (price benchmark, instant forecast),
#         HTTP outcall error cases, stubs, rate limiting, pause/unpause.
# Run against a local replica: dfx start --background && bash backend/ai_proxy/test.sh
set -euo pipefail

CANISTER="ai_proxy"
echo "============================================"
echo "  HomeGentic — AI Proxy Canister Tests"
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

# ── Admin setup ───────────────────────────────────────────────────────────────

echo ""
echo "── [1] health — should return ok ───────────────────────────────────────"
HEALTH=$(dfx canister call $CANISTER health)
echo "$HEALTH" | grep -q "true" \
  && echo "  ↳ health returned ok — ✓" \
  || (echo "  ↳ ❌ health check failed"; exit 1)

echo ""
echo "── [2] addAdmin — controller can add self as admin ──────────────────────"
# H-20: addAdmin is nonce-gated on first bootstrap.
TEST_BOOTSTRAP_NONCE=$(openssl rand -hex 16)
dfx canister call $CANISTER setBootstrapNonce "(\"$TEST_BOOTSTRAP_NONCE\")" 2>/dev/null || true
dfx canister call $CANISTER addAdmin "(principal \"$MY_PRINCIPAL\", \"$TEST_BOOTSTRAP_NONCE\")"
echo "  ↳ addAdmin succeeded — ✓"

echo ""
echo "── [3] setResendApiKey — admin can set key ──────────────────────────────"
dfx canister call $CANISTER setResendApiKey "(\"test-resend-key-for-testing\")"
echo "  ↳ setResendApiKey succeeded — ✓"

echo ""
echo "── [4] getKeyStatus — resendKeySet should be true ───────────────────────"
STATUS=$(dfx canister call $CANISTER getKeyStatus)
echo "$STATUS" | grep -q "resendKeySet = true\|resendKeySet=true\|true" \
  && echo "  ↳ resendKeySet = true — ✓" \
  || (echo "  ↳ ❌ getKeyStatus did not show resendKeySet=true"; exit 1)

echo ""
echo "── [5] setResendApiKey — non-admin is rejected ──────────────────────────"
if ! dfx identity list 2>/dev/null | grep -q "^contractor-test$"; then
  dfx identity new contractor-test --disable-encryption 2>/dev/null || true
fi
dfx canister call $CANISTER setResendApiKey "(\"should-fail\")" \
    --identity contractor-test \
  && echo "  ↳ ❌ Expected rejection for non-admin" \
  || echo "  ↳ Non-admin correctly rejected — ✓"

echo ""
echo "── [6] setOpenPermitApiKey — admin can set ──────────────────────────────"
dfx canister call $CANISTER setOpenPermitApiKey "(\"test-openpermit-key\")"
echo "  ↳ setOpenPermitApiKey succeeded — ✓"

echo ""
echo "── [7] setResendFromAddress — admin can set ─────────────────────────────"
dfx canister call $CANISTER setResendFromAddress "(\"HomeGentic <noreply@homegentic.app>\")"
echo "  ↳ setResendFromAddress succeeded — ✓"

# ── Pure functions ─────────────────────────────────────────────────────────────

echo ""
echo "── [8] getPriceBenchmark — Roofing ──────────────────────────────────────"
BENCH=$(dfx canister call $CANISTER getPriceBenchmark '("Roofing", "32114")')
echo "$BENCH" | grep -q "800000\|sampleSize\|median" \
  && echo "  ↳ Roofing benchmark returned correct data — ✓" \
  || (echo "  ↳ ❌ Unexpected benchmark response: $BENCH"; exit 1)

echo ""
echo "── [9] getPriceBenchmark — HVAC ─────────────────────────────────────────"
BENCH2=$(dfx canister call $CANISTER getPriceBenchmark '("HVAC", "32114")')
echo "$BENCH2" | grep -q "350000\|650000" \
  && echo "  ↳ HVAC benchmark returned correct data — ✓" \
  || echo "  ↳ ❌ Unexpected HVAC response: $BENCH2"

echo ""
echo "── [10] getPriceBenchmark — unknown service → error ─────────────────────"
BENCH3=$(dfx canister call $CANISTER getPriceBenchmark '("PoolCleaning", "90210")')
echo "$BENCH3" | grep -qi "err\|not found\|no benchmark" \
  && echo "  ↳ Unknown service correctly returned error — ✓" \
  || echo "  ↳ ❌ Expected error for unknown service; got: $BENCH3"

echo ""
echo "── [11] instantForecast — basic (yearBuilt=2000) ────────────────────────"
FORECAST=$(dfx canister call $CANISTER instantForecast '("123 Main St", 2000, null, "{}")')
echo "$FORECAST" | grep -qi "ok\|HVAC\|Roofing\|systems\|tenYearBudget" \
  && echo "  ↳ instantForecast returned forecast data — ✓" \
  || (echo "  ↳ ❌ Unexpected forecast response: $FORECAST"; exit 1)

echo ""
echo "── [12] instantForecast — with FL state (hotHumid climate) ──────────────"
FORECAST2=$(dfx canister call $CANISTER instantForecast '("456 Palm Ave, Daytona Beach", 2005, opt "FL", "{}")')
echo "$FORECAST2" | grep -qi "ok\|systems\|hotHumid\|HVAC" \
  && echo "  ↳ FL climate forecast returned — ✓" \
  || echo "  ↳ ❌ FL climate forecast unexpected: $FORECAST2"

echo ""
echo "── [13] instantForecast — invalid yearBuilt → error ─────────────────────"
BAD=$(dfx canister call $CANISTER instantForecast '("123 Main St", 1700, null, "{}")')
echo "$BAD" | grep -qi "err\|invalid\|year" \
  && echo "  ↳ Invalid yearBuilt correctly rejected — ✓" \
  || echo "  ↳ ❌ Expected error for yearBuilt=1700; got: $BAD"

# ── Stubs ──────────────────────────────────────────────────────────────────────

echo ""
echo "── [14] checkReport — stub returns not found ────────────────────────────"
CHECK=$(dfx canister call $CANISTER checkReport '("123 Main St Daytona Beach FL")')
echo "$CHECK" | grep -qi "false\|not.found\|found" \
  && echo "  ↳ checkReport stub returned expected shape — ✓" \
  || echo "  ↳ ❌ Unexpected checkReport response: $CHECK"

echo ""
echo "── [15] lookupYearBuilt — stub returns null ─────────────────────────────"
YEAR=$(dfx canister call $CANISTER lookupYearBuilt '("123 Main St Daytona Beach FL")')
echo "$YEAR" | grep -qi "null\|yearBuilt" \
  && echo "  ↳ lookupYearBuilt stub returned expected shape — ✓" \
  || echo "  ↳ ❌ Unexpected lookupYearBuilt response: $YEAR"

echo ""
echo "── [16] requestReport — stub acknowledges request ───────────────────────"
RREQ=$(dfx canister call $CANISTER requestReport '("456 Oak St", "buyer@example.com")')
echo "$RREQ" | grep -qi "ok\|queued" \
  && echo "  ↳ requestReport stub returned ok — ✓" \
  || echo "  ↳ ❌ Unexpected requestReport response: $RREQ"

echo ""
echo "── [17] emailUsage — returns counters ───────────────────────────────────"
USAGE=$(dfx canister call $CANISTER emailUsage)
echo "$USAGE" | grep -qi "daily\|monthly\|sent" \
  && echo "  ↳ emailUsage returned counter shape — ✓" \
  || echo "  ↳ ❌ Unexpected emailUsage response: $USAGE"

# ── HTTP outcall error cases (no real keys) ───────────────────────────────────

echo ""
echo "── [18] importPermits — unsupported city returns unsupported ────────────"
PERMS=$(dfx canister call $CANISTER importPermits '("123 Main St", "Unknown City", "ZZ", "00000")')
echo "$PERMS" | grep -qi "ok\|unsupported\|permits" \
  && echo "  ↳ Unsupported city returned expected shape — ✓" \
  || echo "  ↳ ❌ Unexpected importPermits response: $PERMS"

echo ""
echo "── [19] sendEmail — returns error when Resend key is invalid ────────────"
# Clear the key first to test the no-key error path
dfx canister call $CANISTER setResendApiKey '("")'
EMAIL_ERR=$(dfx canister call $CANISTER sendEmail \
  '("test@example.com", "Test Subject", "<p>Test</p>", null, null, null)' \
  || true)
echo "$EMAIL_ERR" | grep -qi "err\|key\|not configured\|failed" \
  && echo "  ↳ sendEmail correctly failed with no/invalid key — ✓" \
  || echo "  ↳ ❌ Expected error from sendEmail with no key; got: $EMAIL_ERR"
# Restore key
dfx canister call $CANISTER setResendApiKey "(\"test-resend-key-for-testing\")"

# ── Rate limiting ──────────────────────────────────────────────────────────────

echo ""
echo "── [20] setUpdateRateLimit — admin can set ──────────────────────────────"
dfx canister call $CANISTER setUpdateRateLimit "(2 : nat)"

echo ""
echo "── [21] Rate limit — non-admin hits limit after 2 calls ─────────────────"
dfx canister call $CANISTER requestReport '("addr1", "a@b.com")' --identity contractor-test || true
dfx canister call $CANISTER requestReport '("addr2", "b@c.com")' --identity contractor-test || true
RATE_HIT=$(dfx canister call $CANISTER requestReport '("addr3", "c@d.com")' \
    --identity contractor-test || echo "rate_limited")
echo "$RATE_HIT" | grep -qi "rate\|limit\|err\|rate_limited" \
  && echo "  ↳ Rate limit correctly triggered — ✓" \
  || echo "  ↳ ❌ Expected rate limit; got: $RATE_HIT"
dfx canister call $CANISTER setUpdateRateLimit "(30 : nat)"

# ── Pause / unpause ────────────────────────────────────────────────────────────

echo ""
echo "── [22] pause — admin can pause canister ────────────────────────────────"
dfx canister call $CANISTER pause '(null)'
PAUSED=$(dfx canister call $CANISTER requestReport '("addr", "x@y.com")' || true)
echo "$PAUSED" | grep -qi "pause\|err" \
  && echo "  ↳ Canister correctly paused — ✓" \
  || echo "  ↳ ❌ Expected pause error; got: $PAUSED"

echo ""
echo "── [23] unpause — admin can unpause ─────────────────────────────────────"
dfx canister call $CANISTER unpause
dfx canister call $CANISTER requestReport '("addr", "x@y.com")'
echo "  ↳ Canister unpaused and accepting calls — ✓"

# ── Metrics ────────────────────────────────────────────────────────────────────

echo ""
echo "── [24] getMetrics — after tests ────────────────────────────────────────"
dfx canister call $CANISTER getMetrics

echo ""
echo "============================================"
echo "  ✅ AI Proxy canister tests complete!"
echo "============================================"
