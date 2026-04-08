#!/usr/bin/env bash
set -euo pipefail
echo "=== Photo Canister Tests ==="

echo "▶ Upload a before (PreConstruction) photo..."
UPLOAD_OUT=$(dfx canister call photo uploadPhoto '(
  "JOB_1",
  "PROP_1",
  variant { PreConstruction },
  "Before work started — front elevation",
  "abc123def456abc123def456abc123def456abc123def456abc123def456abc1",
  vec { 255 : nat8; 216 : nat8; 255 : nat8 }
)')
echo "$UPLOAD_OUT"

echo "▶ Upload an after (Finishing) photo..."
UPLOAD_OUT2=$(dfx canister call photo uploadPhoto '(
  "JOB_1",
  "PROP_1",
  variant { Finishing },
  "After — HVAC installation complete",
  "fed321cba654fed321cba654fed321cba654fed321cba654fed321cba654fed3",
  vec { 255 : nat8; 216 : nat8; 255 : nat8 }
)')
echo "$UPLOAD_OUT2"

echo "▶ Get photos by job (JOB_1)..."
dfx canister call photo getPhotosByJob '("JOB_1")'

echo "▶ Get photos by property (PROP_1)..."
dfx canister call photo getPhotosByProperty '("PROP_1")'

echo "▶ Get metrics..."
dfx canister call photo getMetrics

echo "✅ Photo tests passed!"

# ─── §EXP Payment-wired tier enforcement ─────────────────────────────────────
# After setPaymentCanisterId is called, photo upload quotas must consult the
# payment canister (not a local map) for the caller's tier.

echo ""
echo "=== Photo — Payment-Wired Tier Enforcement Tests ==="

PAYMENT_ID=$(dfx canister id payment 2>/dev/null || echo "")
if [ -z "$PAYMENT_ID" ]; then
  echo "⚠️  payment canister not deployed — skipping payment-wired tests"
else

  MY_PRINCIPAL=$(dfx identity get-principal)

  echo ""
  echo "── [EXP-1] setPaymentCanisterId — wires photo to payment canister ───────"
  dfx canister call photo setPaymentCanisterId "(principal \"$PAYMENT_ID\")"
  echo "  ↳ setPaymentCanisterId succeeded — ✓"

  echo ""
  echo "── [EXP-2] Free tier: uploading 3rd photo on same job → expect LimitReached ──"
  # Free tier = 2 photos/job. Two already uploaded above (JOB_1).
  dfx canister call payment grantSubscription "(principal \"$MY_PRINCIPAL\", variant { Free })"
  dfx canister call photo uploadPhoto '(
    "JOB_1",
    "PROP_1",
    variant { Finishing },
    "Third photo — should fail on Free tier",
    "aaa111bbb222aaa111bbb222aaa111bbb222aaa111bbb222aaa111bbb222aaa1",
    vec { 255 : nat8; 216 : nat8; 255 : nat8 }
  )' && echo "  ↳ ❌ Expected LimitReached for Free tier via payment canister" \
       || echo "  ↳ Free tier photo limit enforced via payment canister — ✓"

  echo ""
  echo "── [EXP-3] Grant Pro → 3rd photo on same job succeeds ──────────────────"
  dfx canister call payment grantSubscription "(principal \"$MY_PRINCIPAL\", variant { Pro })"
  dfx canister call photo uploadPhoto '(
    "JOB_1",
    "PROP_1",
    variant { Finishing },
    "Third photo — Pro tier allows 10 per job",
    "bbb222ccc333bbb222ccc333bbb222ccc333bbb222ccc333bbb222ccc333bbb2",
    vec { 255 : nat8; 216 : nat8; 255 : nat8 }
  )' && echo "  ↳ Pro tier allows 3rd photo via payment canister — ✓" \
       || echo "  ↳ ❌ Pro tier should allow 3rd photo"

  echo ""
  echo "✅ Photo payment-wired tier enforcement tests complete!"

fi
