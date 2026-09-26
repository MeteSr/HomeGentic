#!/usr/bin/env bash
# HomeGentic Bills Canister Tests
# Tests: recurring housing expenses (add / list / update / delete), field
# validation, property scoping, owner-only access, and an addBill regression.
# Requires the deployer to hold a paid tier (scripts/deploy.sh grants Pro).
set -euo pipefail

echo "============================================"
echo "  HomeGentic — Bills Canister Tests"
echo "============================================"

if ! dfx ping 2>/dev/null; then
  echo "❌ dfx is not running. Run: dfx start --background"
  exit 1
fi

CANISTER=$(dfx canister id bills 2>/dev/null || echo "")
if [ -z "$CANISTER" ]; then
  echo "❌ bills canister not deployed. Run: bash scripts/deploy.sh"
  exit 1
fi
echo "Bills canister: $CANISTER"

# Assertions use bash matching, not `echo | grep -q` — under pipefail an early
# grep exit can SIGPIPE the writer and fail a passing check.
expect() {
  local label=$1 haystack=$2 needle=$3
  if [[ "$haystack" == *"$needle"* ]]; then
    echo "  ↳ $label — ✓"
  else
    echo "  ↳ ❌ $label: expected to contain '$needle'; got: $haystack"
    exit 1
  fi
}

count() {
  local s=$1 needle=$2 n=0
  while [[ "$s" == *"$needle"* ]]; do s=${s#*"$needle"}; n=$((n + 1)); done
  echo "$n"
}

expect_count() {
  local label=$1 haystack=$2 needle=$3 want=$4
  local got
  got=$(count "$haystack" "$needle")
  if [ "$got" -eq "$want" ]; then
    echo "  ↳ $label — ✓"
  else
    echo "  ↳ ❌ $label: expected $want × '$needle', got $got; output: $haystack"
    exit 1
  fi
}

id_of() {
  if [[ "$1" =~ id\ =\ \"(REC_[0-9]+)\" ]]; then echo "${BASH_REMATCH[1]}"; fi
}

PROP="PROP_BILLS_$(date +%s)"

echo ""
echo "── [1] metrics ──────────────────────────────────────────────────────────"
dfx canister call bills metrics

echo ""
echo "── [2] addRecurringExpense — Mortgage, Monthly ─────────────────────────"
MORT=$(dfx canister call bills addRecurringExpense "(\"$PROP\", record {
  category = variant { Mortgage };
  provider = \"Rocket Mortgage\";
  amountCents = 245000;
  frequency = variant { Monthly };
  startDate = \"2021-06-01\";
  endDate = null;
})")
echo "$MORT"
expect "mortgage saved" "$MORT" "variant { ok"
expect "category is Mortgage" "$MORT" "category = variant { Mortgage }"
MORT_ID=$(id_of "$MORT")
[ -n "$MORT_ID" ] || { echo "  ↳ ❌ could not parse mortgage id"; exit 1; }

echo ""
echo "── [3] addRecurringExpense — PropertyTax, Annual, with endDate ─────────"
TAX=$(dfx canister call bills addRecurringExpense "(\"$PROP\", record {
  category = variant { PropertyTax };
  provider = \"Hillsborough County\";
  amountCents = 612000;
  frequency = variant { Annual };
  startDate = \"2019-11-01\";
  endDate = opt \"2030-11-01\";
})")
echo "$TAX"
expect "property tax saved" "$TAX" "variant { ok"

echo ""
echo "── [4] addRecurringExpense — HOA, Quarterly ────────────────────────────"
HOA=$(dfx canister call bills addRecurringExpense "(\"$PROP\", record {
  category = variant { HOA };
  provider = \"Westchase HOA\";
  amountCents = 45000;
  frequency = variant { Quarterly };
  startDate = \"2022-01-01\";
  endDate = null;
})")
expect "HOA saved" "$HOA" "variant { ok"

echo ""
echo "── [5] Validation — empty provider rejected ────────────────────────────"
BAD=$(dfx canister call bills addRecurringExpense "(\"$PROP\", record {
  category = variant { HomeInsurance }; provider = \"\"; amountCents = 180000;
  frequency = variant { Annual }; startDate = \"2024-03-01\"; endDate = null;
})")
expect "empty provider → InvalidInput" "$BAD" "InvalidInput"

echo ""
echo "── [6] Validation — zero amount rejected ───────────────────────────────"
BAD=$(dfx canister call bills addRecurringExpense "(\"$PROP\", record {
  category = variant { HomeInsurance }; provider = \"State Farm\"; amountCents = 0;
  frequency = variant { Annual }; startDate = \"2024-03-01\"; endDate = null;
})")
expect "zero amount → InvalidInput" "$BAD" "InvalidInput"

echo ""
echo "── [7] Validation — malformed startDate rejected ───────────────────────"
BAD=$(dfx canister call bills addRecurringExpense "(\"$PROP\", record {
  category = variant { HomeInsurance }; provider = \"State Farm\"; amountCents = 180000;
  frequency = variant { Annual }; startDate = \"2024/03/01\"; endDate = null;
})")
expect "bad date → InvalidInput" "$BAD" "InvalidInput"

echo ""
echo "── [8] Validation — endDate before startDate rejected ──────────────────"
BAD=$(dfx canister call bills addRecurringExpense "(\"$PROP\", record {
  category = variant { HomeInsurance }; provider = \"State Farm\"; amountCents = 180000;
  frequency = variant { Annual }; startDate = \"2024-03-01\"; endDate = opt \"2023-03-01\";
})")
expect "endDate < startDate → InvalidInput" "$BAD" "InvalidInput"

echo ""
echo "── [9] getRecurringExpensesForProperty — 3 entries, oldest start first ─"
LIST=$(dfx canister call bills getRecurringExpensesForProperty "(\"$PROP\")")
echo "$LIST"
expect_count "three expenses listed" "$LIST" "id = \"REC_" 3
if [[ "$LIST" =~ startDate\ =\ \"([0-9-]+)\" ]]; then
  [ "${BASH_REMATCH[1]}" = "2019-11-01" ] \
    && echo "  ↳ sorted by startDate — ✓" \
    || { echo "  ↳ ❌ expected first startDate 2019-11-01, got ${BASH_REMATCH[1]}"; exit 1; }
fi

echo ""
echo "── [10] getRecurringExpensesForProperty — other property is empty ─────"
OTHER=$(dfx canister call bills getRecurringExpensesForProperty "(\"${PROP}_OTHER\")")
expect_count "property scoping" "$OTHER" "id = \"REC_" 0

echo ""
echo "── [11] updateRecurringExpense — refinance lowers the payment ──────────"
UPD=$(dfx canister call bills updateRecurringExpense "(\"$MORT_ID\", record {
  category = variant { Mortgage };
  provider = \"Chase\";
  amountCents = 219000;
  frequency = variant { Monthly };
  startDate = \"2024-02-01\";
  endDate = null;
})")
echo "$UPD"
expect "update ok" "$UPD" "variant { ok"
expect "new provider" "$UPD" "provider = \"Chase\""
expect "new amount" "$UPD" "amountCents = 219_000"

echo ""
echo "── [12] updateRecurringExpense — unknown id → NotFound ─────────────────"
NF=$(dfx canister call bills updateRecurringExpense "(\"REC_999999\", record {
  category = variant { Mortgage }; provider = \"Chase\"; amountCents = 1;
  frequency = variant { Monthly }; startDate = \"2024-02-01\"; endDate = null;
})")
expect "unknown id → NotFound" "$NF" "NotFound"

echo ""
echo "── [13] Access control — another principal can't see or change them ───"
dfx identity new bills-test-other --disable-encryption 2>/dev/null || true
THEIRS=$(dfx canister call bills getRecurringExpensesForProperty "(\"$PROP\")" --identity bills-test-other)
expect_count "other principal sees none" "$THEIRS" "id = \"REC_" 0
DENIED=$(dfx canister call bills updateRecurringExpense "(\"$MORT_ID\", record {
  category = variant { Mortgage }; provider = \"Mallory\"; amountCents = 1;
  frequency = variant { Monthly }; startDate = \"2024-02-01\"; endDate = null;
})" --identity bills-test-other)
expect "other principal update → NotAuthorized" "$DENIED" "NotAuthorized"
DENIED=$(dfx canister call bills deleteRecurringExpense "(\"$MORT_ID\")" --identity bills-test-other)
expect "other principal delete → NotAuthorized" "$DENIED" "NotAuthorized"

echo ""
echo "── [14] deleteRecurringExpense — owner deletes the mortgage ────────────"
DEL=$(dfx canister call bills deleteRecurringExpense "(\"$MORT_ID\")")
expect "delete ok" "$DEL" "variant { ok"
LIST=$(dfx canister call bills getRecurringExpensesForProperty "(\"$PROP\")")
expect_count "two expenses remain" "$LIST" "id = \"REC_" 2
DEL=$(dfx canister call bills deleteRecurringExpense "(\"$MORT_ID\")")
expect "second delete → NotFound" "$DEL" "NotFound"

echo ""
echo "── [15] addBill regression — utility statements unchanged ──────────────"
BILL=$(dfx canister call bills addBill "(record {
  propertyId = \"$PROP\"; billType = variant { Electric }; provider = \"TECO\";
  periodStart = \"2026-08-01\"; periodEnd = \"2026-08-31\"; amountCents = 18400;
  usageAmount = opt 1210.0; usageUnit = opt \"kWh\";
})")
expect "addBill ok" "$BILL" "variant { ok"

echo ""
echo "============================================"
echo "  ✅ Bills canister tests complete!"
echo "============================================"
