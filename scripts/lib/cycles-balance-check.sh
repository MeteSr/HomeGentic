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
# read via `icp canister status` and topped up via `icp cycles transfer` if
# it's below $WARNING_CYCLES.

echo ""
echo "============================================"
echo "  Cycles Balance Check"
echo "============================================"
# TODO: icp-cli equivalent of dfx canister deposit-cycles is `icp cycles transfer`
# — syntax below is unverified until icp-cli's cycles-transfer command stabilises.

if [ "$ENV" != "local" ]; then
  WARNING_CYCLES=500000000000   # 500B
  TOP_UP_TO=2000000000000       # 2T

  for canister in "${CANISTERS[@]}"; do
    STATUS_OUT=$(icp canister status "$canister" -e "$ENV" 2>&1) || {
      echo "  ⚠️  Could not get status for $canister — skipping cycles check"
      continue
    }

    # icp canister status indents every field two spaces (e.g. "  Cycles: N") —
    # an anchor without the leading whitespace never matches.
    BALANCE_RAW=$(echo "$STATUS_OUT" | grep -iE "^[[:space:]]*Cycles:" | head -1 | awk '{print $2}' | tr -d '_,') || BALANCE_RAW=""

    if [ -z "$BALANCE_RAW" ] || ! [[ "$BALANCE_RAW" =~ ^[0-9]+$ ]]; then
      echo "  ⚠️  Could not parse cycles balance for $canister"
      continue
    fi

    if [ "$BALANCE_RAW" -lt "$WARNING_CYCLES" ]; then
      NEEDED=$(( TOP_UP_TO - BALANCE_RAW ))
      echo "  ⚠️  $canister is low on cycles (${BALANCE_RAW}) — topping up ${NEEDED} cycles..."
      # TODO: verify icp cycles transfer syntax once icp-cli stabilises
      if icp cycles transfer "$NEEDED" "$canister" -e "$ENV"; then
        echo "  ✓ $canister topped up to ~${TOP_UP_TO} cycles"
      else
        echo "  ✗ Top-up failed for $canister — check wallet balance"
      fi
    else
      echo "  ✓ $canister OK (${BALANCE_RAW} cycles)"
    fi
  done
else
  echo "  (skipped — local managed network uses system cycles)"
fi

echo ""
