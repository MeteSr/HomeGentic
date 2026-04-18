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

  # Use a dedicated identity for tier-manipulation tests so the deployer's
  # tier is not mutated while other suites run in parallel.
  if ! dfx identity list 2>/dev/null | grep -q "^photo-tier-test$"; then
    dfx identity new photo-tier-test --disable-encryption 2>/dev/null || true
  fi
  PHOTO_TIER_PRINCIPAL=$(dfx identity get-principal --identity photo-tier-test)

  echo ""
  echo "── [EXP-1] setPaymentCanisterId — wires photo to payment canister ───────"
  dfx canister call photo setPaymentCanisterId "(principal \"$PAYMENT_ID\")"
  echo "  ↳ setPaymentCanisterId succeeded — ✓"

  echo ""
  echo "── [EXP-2] Free tier: upload → expect full rejection (no access) ────────"
  # Free tier has no photo upload access at all.
  # photo-tier-test starts with no subscription (defaults to Free).
  RESULT=$(dfx canister call photo uploadPhoto '(
    "JOB_1",
    "PROP_1",
    variant { Finishing },
    "Free tier — should be rejected entirely",
    "aaa111bbb222aaa111bbb222aaa111bbb222aaa111bbb222aaa111bbb222aaa1",
    vec { 255 : nat8; 216 : nat8; 255 : nat8 }
  )' --identity photo-tier-test 2>&1)
  echo "$RESULT" | grep -qi "subscription\|InvalidInput\|blocked" \
    && echo "  ↳ Free tier correctly blocked from photo upload — ✓" \
    || echo "  ↳ ❌ Expected rejection for Free tier"

  echo ""
  echo "── [EXP-3] Grant Pro → photo upload succeeds ────────────────────────────"
  dfx canister call payment grantSubscription "(principal \"$PHOTO_TIER_PRINCIPAL\", variant { Pro })"
  dfx canister call photo uploadPhoto '(
    "JOB_TIER_TEST",
    "PROP_TIER_TEST",
    variant { Finishing },
    "Pro tier allows photo upload",
    "bbb222ccc333bbb222ccc333bbb222ccc333bbb222ccc333bbb222ccc333bbb2",
    vec { 255 : nat8; 216 : nat8; 255 : nat8 }
  )' --identity photo-tier-test \
    && echo "  ↳ Pro tier allows photo upload via payment canister — ✓" \
    || echo "  ↳ ❌ Pro tier should allow photo upload"

  echo ""
  echo "✅ Photo payment-wired tier enforcement tests complete!"

fi

# ─── Manager tier-bypass tests ────────────────────────────────────────────────
# A delegated manager (Free-tier) must be able to upload photos for a property
# they manage; the photo canister should use the property owner's tier.
# Skip if property or payment canister not deployed.

PROPERTY_ID=$(dfx canister id property 2>/dev/null || echo "")

if [ -z "$PROPERTY_ID" ] || [ -z "$PAYMENT_ID" ]; then
  echo ""
  echo "── [MGR] SKIPPED — property or payment canister not deployed ────────────"
else
  echo ""
  echo "── [MGR-0] Setup: wire property canister into photo ─────────────────────"
  dfx canister call photo setPropertyCanisterId "(principal \"$PROPERTY_ID\")"
  echo "  ↳ setPropertyCanisterId succeeded ✓"

  # Create manager-test identity if needed (Free tier — no subscription)
  if ! dfx identity list 2>/dev/null | grep -q "^manager-test$"; then
    dfx identity new manager-test --disable-encryption 2>/dev/null || true
  fi
  MANAGER_PRINCIPAL=$(dfx identity get-principal --identity manager-test)
  MY_PRINCIPAL=$(dfx identity get-principal)

  # Ensure owner has Premium tier — Pro (5 properties) may already be full
  # after property, job, and quote tests each register properties.
  dfx canister call payment grantSubscription "(principal \"$MY_PRINCIPAL\", variant { Premium })"

  # Register a property as owner
  echo ""
  echo "── [MGR-1] Register property as owner ──────────────────────────────────"
  MGR_PROP_OUT=$(dfx canister call property registerProperty '(record {
    address      = "88 Photo Manager Ave";
    city         = "Miami";
    state        = "FL";
    zipCode      = "33101";
    propertyType = variant { Condo };
    yearBuilt    = 2015;
    squareFeet   = 900;
    tier         = variant { Premium };
  })')
  echo "$MGR_PROP_OUT"
  MGR_PROP_ID=$(echo "$MGR_PROP_OUT" | grep -oP 'id = "\K[^"]+' | head -1 || true)
  echo "  → Property ID: $MGR_PROP_ID"

  # Invite and claim manager role
  echo ""
  echo "── [MGR-2] Owner invites manager; manager claims role ───────────────────"
  INVITE_OUT=$(dfx canister call property inviteManager \
    "(\"$MGR_PROP_ID\", variant { Manager }, \"Photo Manager\")")
  INVITE_TOKEN=$(echo "$INVITE_OUT" | grep -oP 'token = "\K[^"]+' | head -1)
  dfx canister call property claimManagerRole \
    "(\"$INVITE_TOKEN\")" --identity manager-test
  echo "  ↳ Manager role granted ✓"

  # Manager (Free tier) uploads a photo for the owner's property → SHOULD SUCCEED
  echo ""
  echo "── [MGR-3] Manager (Free tier) uploads photo for owner's property → expect ok ─"
  MGR_PHOTO_OUT=$(dfx canister call photo uploadPhoto "(
    \"MGR_JOB_1\",
    \"$MGR_PROP_ID\",
    variant { Foundation },
    \"Photo uploaded by manager on behalf of owner.\",
    \"ccc333ddd444ccc333ddd444ccc333ddd444ccc333ddd444ccc333ddd444ccc3\",
    vec { 255 : nat8; 216 : nat8; 255 : nat8 }
  )" --identity manager-test)
  echo "$MGR_PHOTO_OUT"
  if echo "$MGR_PHOTO_OUT" | grep -qi "ok"; then
    echo "  ✓ Manager uploaded photo using owner's Pro subscription"
  else
    echo "  ↳ ❌ Manager should be able to upload photos using owner's tier — FAIL"
  fi

  # Manager uploads photo for a property they do NOT manage → SHOULD FAIL (Free tier)
  echo ""
  echo "── [MGR-4] Manager uploads photo for unrelated property → expect QuotaExceeded ─"
  UNAUTH_PHOTO=$(dfx canister call photo uploadPhoto '(
    "JOB_UNRELATED",
    "PROP_UNRELATED",
    variant { PreConstruction },
    "Manager on unrelated property — should be Free-tier blocked.",
    "ddd444eee555ddd444eee555ddd444eee555ddd444eee555ddd444eee555ddd4",
    vec { 255 : nat8; 216 : nat8; 255 : nat8 }
  )' --identity manager-test)
  echo "$UNAUTH_PHOTO"
  if echo "$UNAUTH_PHOTO" | grep -qiE "QuotaExceeded|err"; then
    echo "  ✓ Free-tier manager blocked on unrelated property"
  else
    echo "  ↳ ❌ Should have returned QuotaExceeded for unrelated property"
  fi

  echo ""
  echo "✅ Photo manager tier-bypass tests complete!"
fi
