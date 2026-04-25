#!/usr/bin/env bash
set -euo pipefail
ENV=${1:-local}
echo "▶ Upgrading all canisters on $ENV..."
for canister in auth property job contractor quote payment photo monitoring; do
  echo "  Upgrading $canister..."
  icp deploy "$canister" -e "$ENV"
done
echo "✅ Upgrade complete!"
