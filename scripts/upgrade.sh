#!/usr/bin/env bash
set -euo pipefail
NETWORK=${1:-local}
echo "▶ Upgrading all canisters on $NETWORK..."
for canister in auth property job contractor quote price payment photo monitoring; do
  echo "  Upgrading $canister..."
  dfx deploy $canister --network $NETWORK --upgrade-unchanged
done
echo "✅ Upgrade complete!"
