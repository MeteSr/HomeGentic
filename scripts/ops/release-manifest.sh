#!/usr/bin/env bash
# Prints what is running in an environment: one line per canister with its ID
# and module hash (TSV). The mainnet deploy attaches it to the GitHub release
# for the deploy's tag, so a module hash seen in `icp canister status` can be
# traced to the commit that built it.
#
#   ICP_ENV=ic bash scripts/ops/release-manifest.sh > release-manifest.tsv
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/../.."
source scripts/lib/cycles.sh   # ALL_CANISTERS, canister_id
ICP_ENV="${ICP_ENV:-ic}"
read -r -a NET <<<"${ICP_NETWORK_ARGS:--n ic}"

printf 'canister\tcanister_id\tmodule_hash\n'
for name in "${ALL_CANISTERS[@]}"; do
  id=$(canister_id "$name" "$ICP_ENV")
  [ -n "$id" ] || continue
  hash=$(icp canister status "$id" "${NET[@]}" 2>/dev/null | awk -F': *' 'tolower($1) ~ /module hash/ {print $2; exit}')
  printf '%s\t%s\t%s\n' "$name" "$id" "${hash:-unknown}"
done
