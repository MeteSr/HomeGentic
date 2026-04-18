#!/usr/bin/env bash
# HomeGentic — Developer Seed Script
#
# Populates a freshly deployed set of canisters with realistic records so
# developers can explore the app without having to create everything by hand.
#
# Usage:
#   bash scripts/seed.sh                   # target local replica (default)
#   bash scripts/seed.sh --network testnet # target deployed testnet
#   bash scripts/seed.sh --network ic      # target mainnet (requires confirmation)
#
# Prerequisites:
#   • dfx is running:  dfx start --background
#   • Canisters deployed: bash scripts/deploy.sh
set -euo pipefail

# ─── Network ──────────────────────────────────────────────────────────────────

NETWORK="local"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --network) NETWORK="${2:-local}"; shift 2 ;;
    *) shift ;;
  esac
done

if [ "$NETWORK" = "ic" ]; then
  echo ""
  echo "⚠️  You are about to seed MAINNET (network: ic)."
  read -rp "Type 'yes' to confirm: " CONFIRM
  [ "$CONFIRM" = "yes" ] || { echo "Aborted."; exit 0; }
fi

NET_FLAG="--network $NETWORK"
[ "$NETWORK" = "local" ] && NET_FLAG=""

echo "============================================"
echo "  HomeGentic — Seed Script ($NETWORK)"
echo "============================================"

if ! dfx ping $NET_FLAG 2>/dev/null; then
  echo "❌ dfx is not reachable (network: $NETWORK)."
  echo "   Run: dfx start --background  (for local)"
  exit 1
fi

# ─── Identity helpers ─────────────────────────────────────────────────────────

DEPLOYER_PRINCIPAL=$(dfx identity get-principal $NET_FLAG)
echo "Deployer principal: $DEPLOYER_PRINCIPAL"

# Create seed identities if they don't exist (local only — on ic/testnet use deployer)
if [ "$NETWORK" = "local" ]; then
  for ID in seed-homeowner-2 seed-contractor-1 seed-contractor-2 seed-realtor-1; do
    dfx identity list 2>/dev/null | grep -q "^${ID}$" \
      || dfx identity new "$ID" --disable-encryption 2>/dev/null || true
  done
fi

get_principal() {
  if [ "$NETWORK" = "local" ]; then
    dfx identity get-principal --identity "$1"
  else
    dfx identity get-principal
  fi
}

HO2_PRINCIPAL=$(get_principal seed-homeowner-2)
C1_PRINCIPAL=$(get_principal seed-contractor-1)
C2_PRINCIPAL=$(get_principal seed-contractor-2)
RE_PRINCIPAL=$(get_principal seed-realtor-1)

call() { dfx canister call $NET_FLAG "$@"; }
if [ "$NETWORK" = "local" ]; then
  call_as() { local id="$1"; shift; dfx canister call $NET_FLAG --identity "$id" "$@"; }
else
  # Non-local: ignore the identity argument, use active identity
  call_as() { shift; dfx canister call $NET_FLAG "$@"; }
fi

# ─── §1  Auth — register profiles ─────────────────────────────────────────────

echo ""
echo "── [1] Auth — register profiles ────────────────────────────────────────"

call auth register '(record { role = variant { Homeowner }; email = "alice@homegentic.dev"; phone = "512-555-0101" })' \
  2>/dev/null || echo "  ↳ Deployer already registered (ok)"

if [ "$NETWORK" = "local" ]; then
  call_as seed-homeowner-2 auth register \
    '(record { role = variant { Homeowner }; email = "bob@homegentic.dev"; phone = "512-555-0202" })' \
    2>/dev/null || echo "  ↳ seed-homeowner-2 already registered (ok)"

  call_as seed-contractor-1 auth register \
    '(record { role = variant { Contractor }; email = "carlos@homegentic.dev"; phone = "512-555-0303" })' \
    2>/dev/null || echo "  ↳ seed-contractor-1 already registered (ok)"

  call_as seed-contractor-2 auth register \
    '(record { role = variant { Contractor }; email = "diana@homegentic.dev"; phone = "512-555-0404" })' \
    2>/dev/null || echo "  ↳ seed-contractor-2 already registered (ok)"

  call_as seed-realtor-1 auth register \
    '(record { role = variant { Realtor }; email = "ethan@homegentic.dev"; phone = "512-555-0505" })' \
    2>/dev/null || echo "  ↳ seed-realtor-1 already registered (ok)"
fi
echo "  ↳ Auth profiles registered ✓"

# ─── §2  Payment — grant Pro to deployer ──────────────────────────────────────

echo ""
echo "── [2] Payment — grant Pro to deployer ─────────────────────────────────"
call payment grantSubscription "(principal \"$DEPLOYER_PRINCIPAL\", variant { Pro })"
echo "  ↳ Deployer granted Pro ✓"

# ─── §3  Property — register 3 properties ─────────────────────────────────────

echo ""
echo "── [3] Property — register properties ─────────────────────────────────"
PROP1_OUT=$(call property registerProperty '(record {
  address      = "123 Maple Street";
  city         = "Austin";
  state        = "TX";
  zipCode      = "78701";
  propertyType = variant { SingleFamily };
  yearBuilt    = 2001;
  squareFeet   = 2400;
  tier         = variant { Pro };
})')
echo "$PROP1_OUT"
PROP1_ID=$(echo "$PROP1_OUT" | grep -oP 'id = "\K[^"]+' | head -1 || true)
echo "  → Property 1 (SingleFamily Austin): $PROP1_ID"

PROP2_OUT=$(call property registerProperty '(record {
  address      = "456 Oak Avenue";
  city         = "Dallas";
  state        = "TX";
  zipCode      = "75201";
  propertyType = variant { Condo };
  yearBuilt    = 2015;
  squareFeet   = 1100;
  tier         = variant { Basic };
})')
echo "$PROP2_OUT"
PROP2_ID=$(echo "$PROP2_OUT" | grep -oP 'id = "\K[^"]+' | head -1 || true)
echo "  → Property 2 (Condo Dallas): $PROP2_ID"

PROP3_OUT=$(call property registerProperty '(record {
  address      = "789 Cedar Lane";
  city         = "Houston";
  state        = "TX";
  zipCode      = "77001";
  propertyType = variant { Townhouse };
  yearBuilt    = 1998;
  squareFeet   = 1800;
  tier         = variant { Free };
})')
echo "$PROP3_OUT"
PROP3_ID=$(echo "$PROP3_OUT" | grep -oP 'id = "\K[^"]+' | head -1 || true)
echo "  → Property 3 (Townhouse Houston): $PROP3_ID"

# ─── §4  Contractor — register profiles ───────────────────────────────────────

echo ""
echo "── [4] Contractor — register profiles ──────────────────────────────────"

if [ "$NETWORK" = "local" ]; then
  call_as seed-contractor-1 contractor register '(record {
    name        = "Carlos Ramirez HVAC";
    specialties = vec { variant { HVAC }; variant { Plumbing } };
    email       = "carlos@homegentic.dev";
    phone       = "512-555-0303";
  })' 2>/dev/null || echo "  ↳ contractor-1 already registered (ok)"

  call_as seed-contractor-2 contractor register '(record {
    name        = "Diana Park Roofing";
    specialties = vec { variant { Roofing }; variant { Gutters }; variant { Windows } };
    email       = "diana@homegentic.dev";
    phone       = "512-555-0404";
  })' 2>/dev/null || echo "  ↳ contractor-2 already registered (ok)"
  echo "  ↳ Contractor profiles registered ✓"
else
  echo "  ↳ Skipping separate contractor identities on non-local network"
fi

# ─── §5  Jobs — create sample job history ─────────────────────────────────────
# completedDate uses Unix timestamp in nanoseconds.  These are past dates.

echo ""
echo "── [5] Jobs — create sample history ───────────────────────────────────"

# Skip if no property was registered (e.g. Pro limit already hit on re-run)
if [ -n "$PROP1_ID" ]; then
  # 2024-03-15  HVAC replacement  — verified DIY-false
  PAST_90=$(python3 -c "import time; print(int((time.time()-90*86400)*1e9))" 2>/dev/null \
    || node -e "process.stdout.write(String(BigInt(Math.floor((Date.now()-90*86400000))*1000000)))" 2>/dev/null \
    || echo "1710460800000000000")

  # 2024-06-20  Roof repair
  PAST_60=$(python3 -c "import time; print(int((time.time()-60*86400)*1e9))" 2>/dev/null \
    || node -e "process.stdout.write(String(BigInt(Math.floor((Date.now()-60*86400000))*1000000)))" 2>/dev/null \
    || echo "1718841600000000000")

  # 2024-08-10  Plumbing — DIY
  PAST_30=$(python3 -c "import time; print(int((time.time()-30*86400)*1e9))" 2>/dev/null \
    || node -e "process.stdout.write(String(BigInt(Math.floor((Date.now()-30*86400000))*1000000)))" 2>/dev/null \
    || echo "1722816000000000000")

  # 2024-09-01  Painting — recent
  PAST_7=$(python3 -c "import time; print(int((time.time()-7*86400)*1e9))" 2>/dev/null \
    || node -e "process.stdout.write(String(BigInt(Math.floor((Date.now()-7*86400000))*1000000)))" 2>/dev/null \
    || echo "1725148800000000000")

  call job createJob "(
    \"$PROP1_ID\",
    \"HVAC System Replacement\",
    variant { HVAC },
    \"Full HVAC system replacement — old unit failed after 18 years. New Carrier 5-ton unit installed.\",
    opt \"Carlos Ramirez HVAC\",
    240000,
    $PAST_90,
    null,
    opt 24,
    false,
    null
  )" 2>/dev/null || echo "  ↳ Job 1 skipped (ok)"

  call job createJob "(
    \"$PROP1_ID\",
    \"Roof Repair — Storm Damage\",
    variant { Roofing },
    \"Replaced 12 damaged shingles and repaired flashing around chimney after hail storm.\",
    opt \"Diana Park Roofing\",
    85000,
    $PAST_60,
    null,
    opt 12,
    false,
    null
  )" 2>/dev/null || echo "  ↳ Job 2 skipped (ok)"

  call job createJob "(
    \"$PROP1_ID\",
    \"Kitchen Sink Plumbing Fix\",
    variant { Plumbing },
    \"Replaced P-trap and supply lines under kitchen sink. Resolved slow drain.\",
    null,
    0,
    $PAST_30,
    null,
    null,
    true,
    null
  )" 2>/dev/null || echo "  ↳ Job 3 (DIY) skipped (ok)"

  call job createJob "(
    \"$PROP1_ID\",
    \"Interior Painting — Living Room\",
    variant { Painting },
    \"Repainted living room and hallway. Two coats Sherwin-Williams Alabaster.\",
    null,
    0,
    $PAST_7,
    null,
    null,
    true,
    null
  )" 2>/dev/null || echo "  ↳ Job 4 (DIY) skipped (ok)"

  echo "  ↳ Jobs created ✓"
else
  echo "  ↳ No PROP1_ID — skipping job creation"
fi

# ─── §6  Quote — open requests + a sample bid ─────────────────────────────────

echo ""
echo "── [6] Quote — open requests + bid ────────────────────────────────────"

if [ -n "$PROP1_ID" ]; then
  REQ_OUT=$(call quote createQuoteRequest "(
    \"$PROP1_ID\",
    variant { Electrical },
    \"Breaker keeps tripping on kitchen circuit. GFCIs installed but issue persists. 200A panel, house built 1998.\",
    variant { Medium }
  )" 2>/dev/null || echo "")
  echo "$REQ_OUT"
  REQ1_ID=$(echo "$REQ_OUT" | grep -oP '"REQ_[^"]+"' | head -1 | tr -d '"' || true)
  echo "  → Quote request 1: $REQ1_ID"

  if [ -n "$PROP2_ID" ]; then
    call quote createQuoteRequest "(
      \"$PROP2_ID\",
      variant { Plumbing },
      \"Slow drain in master bathroom. Snaking has not resolved it — may need hydro-jetting.\",
      variant { Low }
    )" 2>/dev/null || echo "  ↳ Quote request 2 skipped (ok)"
  fi

  # Contractor submits a bid (local only — needs separate identity)
  if [ "$NETWORK" = "local" ] && [ -n "$REQ1_ID" ]; then
    VALID_UNTIL=$(python3 -c "import time; print(int((time.time()+30*86400)*1e9))" 2>/dev/null \
      || node -e "process.stdout.write(String(BigInt(Math.floor((Date.now()+30*86400000))*1000000)))" 2>/dev/null \
      || echo "1893456000000000000")
    call_as seed-contractor-1 quote submitQuote "(
      \"$REQ1_ID\",
      38000,
      2,
      $VALID_UNTIL
    )" 2>/dev/null && echo "  ↳ Contractor bid submitted ✓" || echo "  ↳ Bid submission skipped (ok)"
  fi
  echo "  ↳ Quote requests created ✓"
else
  echo "  ↳ No PROP1_ID — skipping quote creation"
fi

# ─── §7  Listing — FSBO listing ───────────────────────────────────────────────

echo ""
echo "── [7] Listing — FSBO bid request ─────────────────────────────────────"

LISTING_CANISTER=$(dfx canister id listing $NET_FLAG 2>/dev/null || echo "")
if [ -z "$LISTING_CANISTER" ]; then
  echo "  ↳ listing canister not deployed — skipping"
elif [ -n "$PROP3_ID" ]; then
  DEADLINE=$(python3 -c "import time; print(int((time.time()+14*86400)*1e9))" 2>/dev/null \
    || node -e "process.stdout.write(String(BigInt(Math.floor((Date.now()+14*86400000))*1000000)))" 2>/dev/null \
    || echo "1727308800000000000")
  TARGET_LIST=$(python3 -c "import time; print(int((time.time()+60*86400)*1e9))" 2>/dev/null \
    || node -e "process.stdout.write(String(BigInt(Math.floor((Date.now()+60*86400000))*1000000)))" 2>/dev/null \
    || echo "1735862400000000000")

  call listing createBidRequest "(
    \"$PROP3_ID\",
    $TARGET_LIST,
    opt (32500000 : nat),
    \"3BR/2BA townhouse in Midtown Houston. Updated kitchen, new roof 2022. Looking for experienced agents.\",
    $DEADLINE
  )" 2>/dev/null && echo "  ↳ FSBO bid request created ✓" || echo "  ↳ Listing creation skipped (ok)"
else
  echo "  ↳ No PROP3_ID — skipping listing creation"
fi

# ─── §8  Recurring — sample service contracts ─────────────────────────────────

echo ""
echo "── [8] Recurring — service contracts ──────────────────────────────────"

RECURRING_CANISTER=$(dfx canister id recurring $NET_FLAG 2>/dev/null || echo "")
if [ -z "$RECURRING_CANISTER" ]; then
  echo "  ↳ recurring canister not deployed — skipping"
elif [ -n "$PROP1_ID" ]; then
  call recurring createRecurringService "(
    \"$PROP1_ID\",
    variant { LawnCare },
    \"Green Thumb Lawns\",
    null,
    \"512-555-0600\",
    variant { Monthly },
    \"2025-01-01\",
    opt \"2025-12-31\",
    opt \"Monthly mow + edge trim\"
  )" 2>/dev/null && echo "  ↳ Recurring LawnCare created ✓" || echo "  ↳ Recurring creation skipped (ok)"
else
  echo "  ↳ No PROP1_ID — skipping recurring creation"
fi

# ─── Done ─────────────────────────────────────────────────────────────────────

echo ""
echo "============================================"
echo "  ✅ Seed complete!"
echo "============================================"
echo ""
echo "Records created:"
echo "  • Auth:       1–5 user profiles"
echo "  • Payment:    Pro subscription for deployer"
echo "  • Property:   3 properties ($PROP1_ID, $PROP2_ID, $PROP3_ID)"
echo "  • Jobs:       4 jobs (2 contractor, 2 DIY)"
echo "  • Contractor: 2 profiles"
echo "  • Quote:      2 open requests + 1 bid"
echo "  • Listing:    1 FSBO bid request"
echo "  • Recurring:  1 service contract"
echo ""
echo "To reset and re-seed: make clean && make deploy && bash scripts/seed.sh"
