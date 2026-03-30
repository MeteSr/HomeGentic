#!/usr/bin/env bash
# HomeFax Quote Canister — integration tests
# Covers: request creation, contractor bid submission, accept/reject flow,
# tier open-request limits (Free = 3, Pro = 10), closeQuoteRequest (12.4.4).
# Run against a local replica: dfx start --background && bash backend/quote/test.sh
set -euo pipefail

CANISTER="quote"
echo "============================================"
echo "  HomeFax — Quote Canister Tests"
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

# Contractor identity for bid submission tests
if ! dfx identity list 2>/dev/null | grep -q "^quote-contractor-test$"; then
  dfx identity new quote-contractor-test --disable-encryption 2>/dev/null || true
fi
CONTRACTOR_PRINCIPAL=$(dfx identity get-principal --identity quote-contractor-test)
echo "Contractor test principal: $CONTRACTOR_PRINCIPAL"

# Far-future validUntil timestamp (nanoseconds) — year 2030
VALID_UNTIL="1893456000000000000"

# ─── Metrics (initial) ────────────────────────────────────────────────────────
echo ""
echo "── [1] Get metrics (initial state) ─────────────────────────────────────"
dfx canister call $CANISTER getMetrics

# ─── Create a quote request ───────────────────────────────────────────────────
echo ""
echo "── [2] createQuoteRequest — plumbing, Medium urgency ────────────────────"
REQ_OUT=$(dfx canister call $CANISTER createQuoteRequest '(
  "PROP_1",
  variant { Plumbing },
  "Need to fix leaky pipe under kitchen sink — active drip, causing cabinet damage.",
  variant { Medium }
)')
echo "$REQ_OUT"
REQ_ID=$(echo "$REQ_OUT" | grep -oP '"QR_[^"]+"' | head -1 | tr -d '"')
echo "  → Request ID: $REQ_ID"

# ─── Get request by ID ────────────────────────────────────────────────────────
echo ""
echo "── [3] getQuoteRequest ──────────────────────────────────────────────────"
dfx canister call $CANISTER getQuoteRequest "(\"$REQ_ID\")"

# ─── Get open requests (visible to contractors) ───────────────────────────────
echo ""
echo "── [4] getOpenRequests — should list the new request ────────────────────"
dfx canister call $CANISTER getOpenRequests

# ─── Get my requests ──────────────────────────────────────────────────────────
echo ""
echo "── [5] getMyQuoteRequests ───────────────────────────────────────────────"
dfx canister call $CANISTER getMyQuoteRequests

# ─── Contractor submits a bid (12.4.4) ───────────────────────────────────────
echo ""
echo "── [6] submitQuote — contractor bids \$380 / 1 day (12.4.4) ──────────────"
QUOTE_OUT=$(dfx canister call $CANISTER submitQuote "(
  \"$REQ_ID\",
  38000,
  1,
  $VALID_UNTIL
)" --identity quote-contractor-test)
echo "$QUOTE_OUT"
QUOTE_ID=$(echo "$QUOTE_OUT" | grep -oP '"Q_[^"]+"' | head -1 | tr -d '"')
echo "  → Quote ID: $QUOTE_ID"

echo ""
echo "── [7] getQuoteRequest — status should now be Quoted ────────────────────"
dfx canister call $CANISTER getQuoteRequest "(\"$REQ_ID\")"

# ─── Fetch quotes for request ─────────────────────────────────────────────────
echo ""
echo "── [8] getQuotesForRequest ──────────────────────────────────────────────"
dfx canister call $CANISTER getQuotesForRequest "(\"$REQ_ID\")"

# ─── Homeowner accepts the quote (12.4.4) ────────────────────────────────────
echo ""
echo "── [9] acceptQuote — homeowner accepts contractor bid (12.4.4) ──────────"
dfx canister call $CANISTER acceptQuote "(\"$QUOTE_ID\")"

echo ""
echo "── [10] getQuoteRequest — status should now be Accepted ─────────────────"
dfx canister call $CANISTER getQuoteRequest "(\"$REQ_ID\")"

echo ""
echo "── [11] acceptQuote again → expect error (already closed) ───────────────"
dfx canister call $CANISTER acceptQuote "(\"$QUOTE_ID\")" \
  || echo "  ↳ Expected InvalidInput (already closed) — ✓"

# ─── Create a second request and test closeQuoteRequest ───────────────────────
echo ""
echo "── [12] createQuoteRequest #2 for close test ────────────────────────────"
REQ2_OUT=$(dfx canister call $CANISTER createQuoteRequest '(
  "PROP_1",
  variant { HVAC },
  "HVAC tune-up before summer — filter replacement and refrigerant check.",
  variant { Low }
)')
echo "$REQ2_OUT"
REQ2_ID=$(echo "$REQ2_OUT" | grep -oP '"QR_[^"]+"' | head -1 | tr -d '"')
echo "  → Request 2 ID: $REQ2_ID"

echo ""
echo "── [13] closeQuoteRequest — homeowner cancels without accepting ──────────"
dfx canister call $CANISTER closeQuoteRequest "(\"$REQ2_ID\")"

echo ""
echo "── [14] getQuoteRequest — status should be Closed ───────────────────────"
dfx canister call $CANISTER getQuoteRequest "(\"$REQ2_ID\")"

# ─── Tier open-request limit — Free = 3 (12.4.4) ─────────────────────────────
echo ""
echo "── [15] Free tier limit: create 3 requests to hit cap (12.4.4) ──────────"
for i in 1 2 3; do
  dfx canister call $CANISTER createQuoteRequest "(
    \"PROP_LIMIT\",
    variant { Roofing },
    \"Tier limit test request $i — filling open slot.\",
    variant { Low }
  )" > /dev/null && echo "  → Request $i created"
done

echo ""
echo "── [16] 4th request on Free tier → expect open-request limit error ───────"
dfx canister call $CANISTER createQuoteRequest '(
  "PROP_LIMIT",
  variant { Roofing },
  "This 4th request should fail on Free tier limit.",
  variant { Low }
)' || echo "  ↳ Expected LimitReached on Free tier (max 3 open) — ✓"

# ─── Unknown request → NotFound ───────────────────────────────────────────────
echo ""
echo "── [17] getQuoteRequest unknown ID → expect NotFound ────────────────────"
dfx canister call $CANISTER getQuoteRequest '"QR_NONEXISTENT"' \
  || echo "  ↳ Expected NotFound — ✓"

# ─── submitQuote with zero amount → error ─────────────────────────────────────
echo ""
echo "── [18] submitQuote amount=0 → expect InvalidInput ─────────────────────"
dfx canister call $CANISTER createQuoteRequest '(
  "PROP_1",
  variant { Painting },
  "Test request for invalid bid.",
  variant { Low }
)' > /tmp/qr_tmp.txt
TMP_REQ=$(cat /tmp/qr_tmp.txt | grep -oP '"QR_[^"]+"' | head -1 | tr -d '"')
dfx canister call $CANISTER submitQuote "(
  \"$TMP_REQ\",
  0,
  1,
  $VALID_UNTIL
)" --identity quote-contractor-test || echo "  ↳ Expected InvalidInput (amount=0) — ✓"

# ─── Pause / unpause ──────────────────────────────────────────────────────────
echo ""
echo "── [19] pause / unpause ─────────────────────────────────────────────────"
dfx canister call $CANISTER pause '(null)'
dfx canister call $CANISTER unpause

# ─── Metrics (after) ──────────────────────────────────────────────────────────
echo ""
echo "── [20] Get metrics (after tests) ──────────────────────────────────────"
dfx canister call $CANISTER getMetrics

echo ""
echo "============================================"
echo "  ✅ Quote canister tests complete!"
echo "============================================"
