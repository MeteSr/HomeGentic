# HomeGentic — Post-deploy cycles balance check + auto top-up.
#
# Sourced (not executed standalone) from deploy.sh after all canisters are
# built and installed. Expects $ENV and the $CANISTERS array to already be
# set by the caller. Split into its own file so it can be exercised directly
# in tests (see frontend/src/__tests__/security/deployPreflight1452.test.ts,
# PROD.3) with a stubbed `icp` on PATH, instead of relying on static
# text-proximity checks against deploy.sh.
#
# On local, this is a no-op — the managed local network doesn't meter cycles.
# On any other network, every canister in $CANISTERS gets its live balance
# read via `icp canister status` and topped up via `icp canister top-up` when
# it's inside the top-up margin from scripts/lib/cycles.sh. A failed top-up
# sets CYCLES_TOPUP_FAILED, which deploy.sh turns into a failed deploy at the
# end (after the rest of the deploy has run).

source "$(dirname "${BASH_SOURCE[0]}")/cycles.sh"

echo ""
echo "============================================"
echo "  Cycles Balance Check"
echo "============================================"
CYCLES_TOPUP_FAILED=""

if [ "$ENV" != "local" ]; then
  for canister in "${CANISTERS[@]}"; do
    STATUS_OUT=$(icp canister status "$canister" -e "$ENV" 2>&1) || {
      echo "  ⚠️  Could not get status for $canister — skipping cycles check"
      continue
    }
    if ! cycles_read "$STATUS_OUT"; then
      echo "  ⚠️  Could not parse cycles balance for $canister"
      continue
    fi

    cycles_policy "$CYC_BALANCE" "$CYC_IDLE_PER_DAY"
    if [ "$CYC_BALANCE" -lt "$CYC_TOPUP_AT" ]; then
      NEEDED=$(( CYC_TARGET - CYC_BALANCE ))
      echo "  ⚠️  $canister is low on cycles ($(cycles_t "$CYC_BALANCE")) — topping up $(cycles_t "$NEEDED")..."
      if icp canister top-up "$canister" --amount "$NEEDED" -e "$ENV"; then
        echo "  ✓ $canister topped up to ~$(cycles_t "$CYC_TARGET")"
      else
        echo "  ✗ Top-up failed for $canister — fund the deploy identity's cycles ledger"
        CYCLES_TOPUP_FAILED="$CYCLES_TOPUP_FAILED $canister"
      fi
    else
      echo "  ✓ $canister OK ($(cycles_t "$CYC_BALANCE"))"
    fi
  done
else
  echo "  (skipped — local managed network uses system cycles)"
fi

echo ""
