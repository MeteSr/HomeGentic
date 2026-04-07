#!/usr/bin/env bash
# HomeGentic Report Canister Tests
# Tests: generateReport (immutable snapshot + share token), getReport (viewCount),
# listShareLinks, revokeShareLink, revoked/unknown token errors, pause/unpause
set -euo pipefail

echo "============================================"
echo "  HomeGentic — Report Canister Tests"
echo "============================================"

if ! dfx ping 2>/dev/null; then
  echo "❌ dfx is not running. Run: dfx start --background"
  exit 1
fi

CANISTER=$(dfx canister id report 2>/dev/null || echo "")
if [ -z "$CANISTER" ]; then
  echo "❌ report canister not deployed. Run: bash scripts/deploy.sh"
  exit 1
fi

echo "Report canister: $CANISTER"

# ─── Metrics & basic state ───────────────────────────────────────────────────
echo ""
echo "── [1] Get metrics (initial state) ─────────────────────────────────────"
dfx canister call report getMetrics

# ─── generateReport — Public visibility, no expiry ───────────────────────────
echo ""
echo "── [2] generateReport — Public, no expiry, 2 verified jobs ─────────────"
RESULT=$(dfx canister call report generateReport '(
  "PROP_REPORT_1",
  record {
    address           = "123 Main St";
    city              = "Austin";
    state             = "TX";
    zipCode           = "78701";
    propertyType      = "SingleFamily";
    yearBuilt         = 1995;
    squareFeet        = 2100;
    verificationLevel = "Basic"
  },
  vec {
    record {
      serviceType    = "HVAC";
      description    = "Full system replacement";
      contractorName = opt "CoolAir Co";
      amountCents    = 850000;
      date           = "2023-07-15";
      isDiy          = false;
      permitNumber   = opt "HVAC-2023-4421";
      warrantyMonths = opt 120;
      isVerified     = true;
      status         = "Completed"
    };
    record {
      serviceType    = "Roofing";
      description    = "Full shingle replacement";
      contractorName = opt "TopRoof LLC";
      amountCents    = 1500000;
      date           = "2022-09-01";
      isDiy          = false;
      permitNumber   = opt "ROOF-2022-881";
      warrantyMonths = opt 60;
      isVerified     = true;
      status         = "Completed"
    }
  },
  vec {},
  null,
  variant { Public },
  null,
  null,
  null,
  null,
  null
)')
echo "$RESULT"
TOKEN1=$(echo "$RESULT" | grep -oP '(?<=token = ")[^"]+' | head -1 || echo "")
echo "  Token: $TOKEN1"

# ─── generateReport — BuyerOnly, 7-day expiry, with recurring service ─────────
echo ""
echo "── [3] generateReport — BuyerOnly, 7-day expiry, with recurring service ─"
RESULT2=$(dfx canister call report generateReport '(
  "PROP_REPORT_2",
  record {
    address           = "456 Oak Ave";
    city              = "Austin";
    state             = "TX";
    zipCode           = "78704";
    propertyType      = "Condo";
    yearBuilt         = 2010;
    squareFeet        = 850;
    verificationLevel = "Premium"
  },
  vec {
    record {
      serviceType    = "Plumbing";
      description    = "Water heater replacement";
      contractorName = opt "FlowRight Plumbing";
      amountCents    = 180000;
      date           = "2024-01-10";
      isDiy          = false;
      permitNumber   = null;
      warrantyMonths = opt 12;
      isVerified     = true;
      status         = "Completed"
    }
  },
  vec {
    record {
      serviceType   = "Pest Control";
      providerName  = "BugBusters Inc";
      frequency     = "Monthly";
      status        = "Active";
      startDate     = "2023-03-01";
      lastVisitDate = opt "2026-02-28";
      totalVisits   = 36
    }
  },
  opt 7,
  variant { BuyerOnly },
  null,
  null,
  null,
  null,
  null
)')
echo "$RESULT2"
TOKEN2=$(echo "$RESULT2" | grep -oP '(?<=token = ")[^"]+' | head -1 || echo "")
echo "  Token: $TOKEN2"

# ─── generateReport — DIY job, no contractor ──────────────────────────────────
echo ""
echo "── [4] generateReport — DIY job, no contractor name ────────────────────"
RESULT3=$(dfx canister call report generateReport '(
  "PROP_REPORT_1",
  record {
    address           = "123 Main St";
    city              = "Austin";
    state             = "TX";
    zipCode           = "78701";
    propertyType      = "SingleFamily";
    yearBuilt         = 1995;
    squareFeet        = 2100;
    verificationLevel = "Basic"
  },
  vec {
    record {
      serviceType    = "Painting";
      description    = "Interior repaint, all rooms";
      contractorName = null;
      amountCents    = 45000;
      date           = "2025-08-20";
      isDiy          = true;
      permitNumber   = null;
      warrantyMonths = null;
      isVerified     = false;
      status         = "Completed"
    }
  },
  vec {},
  null,
  variant { Public },
  null,
  null,
  null,
  null,
  null
)')
echo "$RESULT3"
TOKEN3=$(echo "$RESULT3" | grep -oP '(?<=token = ")[^"]+' | head -1 || echo "")

# ─── getReport — retrieve and verify viewCount increments ────────────────────
echo ""
echo "── [5] getReport — first view (expect viewCount = 1) ────────────────────"
if [ -n "$TOKEN1" ]; then
  dfx canister call report getReport "(\"$TOKEN1\")"
else
  echo "  ↳ Skipped — TOKEN1 not parsed"
fi

echo ""
echo "── [6] getReport — second view (expect viewCount = 2) ───────────────────"
if [ -n "$TOKEN1" ]; then
  dfx canister call report getReport "(\"$TOKEN1\")"
else
  echo "  ↳ Skipped — TOKEN1 not parsed"
fi

# ─── getReport — unknown token ────────────────────────────────────────────────
echo ""
echo "── [7] getReport — unknown token (expect NotFound) ──────────────────────"
dfx canister call report getReport '("RPT_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")' \
  || echo "  ↳ Expected NotFound — ✓"

# ─── listShareLinks ───────────────────────────────────────────────────────────
echo ""
echo "── [8] listShareLinks — PROP_REPORT_1 (expect 2 links from tests 2+4) ───"
dfx canister call report listShareLinks '("PROP_REPORT_1")'

echo ""
echo "── [9] listShareLinks — PROP_REPORT_2 (expect 1 link) ───────────────────"
dfx canister call report listShareLinks '("PROP_REPORT_2")'

echo ""
echo "── [10] listShareLinks — unknown property (expect empty) ────────────────"
dfx canister call report listShareLinks '("PROP_UNKNOWN")'

# ─── revokeShareLink ──────────────────────────────────────────────────────────
echo ""
echo "── [11] revokeShareLink — revoke TOKEN2 (BuyerOnly link) ────────────────"
if [ -n "$TOKEN2" ]; then
  dfx canister call report revokeShareLink "(\"$TOKEN2\")"
else
  echo "  ↳ Skipped — TOKEN2 not parsed"
fi

echo ""
echo "── [12] getReport — revoked token (expect Revoked error) ────────────────"
if [ -n "$TOKEN2" ]; then
  dfx canister call report getReport "(\"$TOKEN2\")" || echo "  ↳ Expected Revoked — ✓"
else
  echo "  ↳ Skipped — TOKEN2 not parsed"
fi

# ─── generateReport — empty propertyId (expect InvalidInput) ─────────────────
echo ""
echo "── [13] generateReport — empty propertyId (expect InvalidInput) ─────────"
dfx canister call report generateReport '(
  "",
  record {
    address           = "789 Elm St";
    city              = "Austin";
    state             = "TX";
    zipCode           = "78702";
    propertyType      = "SingleFamily";
    yearBuilt         = 2000;
    squareFeet        = 1500;
    verificationLevel = "Basic"
  },
  vec {},
  vec {},
  null,
  variant { Public },
  null,
  null,
  null,
  null,
  null
)' || echo "  ↳ Expected InvalidInput — ✓"

# ─── Pause / Unpause ──────────────────────────────────────────────────────────
echo ""
echo "── [14] pause canister ──────────────────────────────────────────────────"
dfx canister call report pause

echo ""
echo "── [15] generateReport while paused (expect error) ──────────────────────"
dfx canister call report generateReport '(
  "PROP_REPORT_3",
  record {
    address           = "1 Paused Ln";
    city              = "Austin";
    state             = "TX";
    zipCode           = "78703";
    propertyType      = "SingleFamily";
    yearBuilt         = 2005;
    squareFeet        = 1200;
    verificationLevel = "Basic"
  },
  vec {},
  vec {},
  null,
  variant { Public },
  null,
  null,
  null,
  null,
  null
)' || echo "  ↳ Rejected while paused — ✓"

echo ""
echo "── [16] unpause canister ────────────────────────────────────────────────"
dfx canister call report unpause

echo ""
echo "── [17] generateReport after unpause (expect success) ───────────────────"
dfx canister call report generateReport '(
  "PROP_REPORT_3",
  record {
    address           = "1 Paused Ln";
    city              = "Austin";
    state             = "TX";
    zipCode           = "78703";
    propertyType      = "SingleFamily";
    yearBuilt         = 2005;
    squareFeet        = 1200;
    verificationLevel = "Basic"
  },
  vec {},
  vec {},
  null,
  variant { Public },
  null,
  null,
  null,
  null,
  null
)'

# ─── Final metrics ────────────────────────────────────────────────────────────
echo ""
echo "── [18] Get metrics (after tests) ──────────────────────────────────────"
dfx canister call report getMetrics

echo ""
echo "============================================"
echo "  ✅ Report canister tests complete!"
echo "============================================"

# ─── §47 Trusted Canister (inter-canister whitelist) ─────────────────────────
# report calls property.getVerificationLevel — so report's canister principal
# must be in property's trusted list. These tests verify the report canister's
# own trusted canister management (for any future callers) and document the
# trust dependency on property.

echo ""
echo "── [19] addTrustedCanister on report — admin can add ────────────────────"
MY_PRINCIPAL=$(dfx identity get-principal)
if ! dfx identity list 2>/dev/null | grep -q "^canister-caller-test$"; then
  dfx identity new canister-caller-test --disable-encryption 2>/dev/null || true
fi
CALLER_TEST_PRINCIPAL=$(dfx identity get-principal --identity canister-caller-test)
dfx canister call report addTrustedCanister "(principal \"$CALLER_TEST_PRINCIPAL\")"
echo "  ↳ addTrustedCanister succeeded — ✓"

echo ""
echo "── [20] getTrustedCanisters on report ───────────────────────────────────"
dfx canister call report getTrustedCanisters | grep -q "$CALLER_TEST_PRINCIPAL" \
  && echo "  ↳ principal present — ✓" \
  || (echo "  ↳ ❌ principal NOT found"; exit 1)

echo ""
echo "── [21] removeTrustedCanister on report ─────────────────────────────────"
dfx canister call report removeTrustedCanister "(principal \"$CALLER_TEST_PRINCIPAL\")"
dfx canister call report getTrustedCanisters | grep -q "$CALLER_TEST_PRINCIPAL" \
  && echo "  ↳ ❌ Principal still in list after removal" \
  || echo "  ↳ Principal correctly removed — ✓"

echo ""
echo "  NOTE: report's own principal must be in property's trustedCanisters list"
echo "  for getVerificationLevel cross-calls to succeed. Wired by deploy.sh."
