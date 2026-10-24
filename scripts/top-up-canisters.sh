#!/usr/bin/env bash
# HomeGentic — Cycle Top-Up (issue #55 / #421)
#
# Tops up every canister whose balance is within TOPUP_MARGIN_DAYS of its
# freezing threshold (or under the 2T floor) back up to the target in
# scripts/lib/cycles.sh. Cycles come from the active icp identity's cycles
# ledger balance (`icp canister top-up`). When that balance is short and
# DFX_WALLET_ID is set, the shortfall is first moved from the dfx cycles
# wallet into the ledger — the same deposit deploy.sh makes.
#
# Usage:
#   ICP_ENV=ic bash scripts/top-up-canisters.sh
#   ICP_ENV=ic bash scripts/top-up-canisters.sh --dry-run   # report only
#
# Environment:
#   ICP_ENV        — ic or testnet (default: $DFX_NETWORK, else ic)
#   DFX_WALLET_ID  — optional cycles wallet to refill the ledger balance from
#                    (needs the same identity imported into dfx)

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."
source "$SCRIPT_DIR/lib/cycles.sh"

DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

ICP_ENV="${ICP_ENV:-${DFX_NETWORK:-ic}}"
CYCLES_LEDGER="um5iw-rqaaa-aaaaq-qaaba-cai"

echo "============================================"
echo "  HomeGentic — Cycle Top-Up"
echo "  Environment : $ICP_ENV"
echo "  Top up when : < ${TOPUP_MARGIN_DAYS} days before the ${FREEZE_DAYS}-day freezing threshold, or < $(cycles_t "$MIN_TOPUP_CYCLES")"
$DRY_RUN && echo "  Mode        : DRY RUN (no changes)"
echo "============================================"

# ── Work out what each canister needs ─────────────────────────────────────────
NEED_NAMES=(); NEED_IDS=(); NEED_AMOUNTS=()
UNKNOWN=()
for CANISTER in "${ALL_CANISTERS[@]}"; do
  CANISTER_ID=$(canister_id "$CANISTER" "$ICP_ENV")
  [ -z "$CANISTER_ID" ] && continue
  STATUS_OUT=$(icp canister status "$CANISTER_ID" -n ic 2>&1 || true)
  if ! cycles_read "$STATUS_OUT"; then
    echo "  ❓  $CANISTER — balance unknown (not a controller, or unreachable)"
    UNKNOWN+=("$CANISTER")
    continue
  fi
  cycles_policy "$CYC_BALANCE" "$CYC_IDLE_PER_DAY"
  if [ "$CYC_BALANCE" -lt "$CYC_TOPUP_AT" ]; then
    AMOUNT=$(( CYC_TARGET - CYC_BALANCE ))
    echo "  🔴  $CANISTER — $(cycles_t "$CYC_BALANCE") → needs $(cycles_t "$AMOUNT")"
    NEED_NAMES+=("$CANISTER"); NEED_IDS+=("$CANISTER_ID"); NEED_AMOUNTS+=("$AMOUNT")
  else
    echo "  🟢  $CANISTER — $(cycles_t "$CYC_BALANCE") (${CYC_RUNWAY_DAYS} days before freezing)"
  fi
done

TOTAL=0
for A in "${NEED_AMOUNTS[@]+"${NEED_AMOUNTS[@]}"}"; do TOTAL=$(( TOTAL + A )); done

FAILED=()
if [ ${#NEED_NAMES[@]} -gt 0 ] && ! $DRY_RUN; then
  # ── Fund the identity's cycles ledger account from the wallet ───────────────
  # Whatever isn't spent below stays in the ledger account for the next run.
  echo ""
  echo "  Needed: $(cycles_t "$TOTAL")"
  if [ -n "${DFX_WALLET_ID:-}" ]; then
    PRINCIPAL=$(icp identity principal)
    echo "  ▶ Moving $(cycles_t "$TOTAL") from wallet $DFX_WALLET_ID into the cycles ledger..."
    if ! dfx canister call "$CYCLES_LEDGER" deposit \
        "(record { to = record { owner = principal \"$PRINCIPAL\"; subaccount = null }; memo = null; created_at_time = null })" \
        --with-cycles "$TOTAL" --wallet "$DFX_WALLET_ID" --network ic; then
      echo "  ✗ Wallet deposit failed — the top-ups below use the existing ledger balance"
    fi
  fi

  for i in "${!NEED_NAMES[@]}"; do
    if icp canister top-up "${NEED_IDS[$i]}" --amount "${NEED_AMOUNTS[$i]}" -n ic; then
      echo "  ✅  Topped up ${NEED_NAMES[$i]} with $(cycles_t "${NEED_AMOUNTS[$i]}")"
    else
      echo "  ❌  Top-up failed for ${NEED_NAMES[$i]}"
      FAILED+=("${NEED_NAMES[$i]}")
    fi
  done
fi

echo ""
echo "  Needing top-up: ${#NEED_NAMES[@]}   Failed: ${#FAILED[@]}   Unknown: ${#UNKNOWN[@]}"
if [ ${#FAILED[@]} -gt 0 ] || [ ${#UNKNOWN[@]} -gt 0 ]; then
  [ ${#FAILED[@]} -gt 0 ] && echo "❌  Top-up failed: ${FAILED[*]} — fund the identity's cycles ledger or wallet"
  [ ${#UNKNOWN[@]} -gt 0 ] && echo "❌  Could not read: ${UNKNOWN[*]}"
  exit 1
fi
echo "✅  Cycle top-up complete"
exit 0
