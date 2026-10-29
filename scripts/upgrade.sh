#!/usr/bin/env bash
set -euo pipefail
ENV=${1:-local}
echo "▶ Upgrading all canisters on $ENV..."
for canister in auth payment property job contractor quote photo monitoring; do
  echo "  Upgrading $canister..."
  icp deploy "$canister" --yes -e "$ENV"
done
echo "✅ Upgrade complete!"
