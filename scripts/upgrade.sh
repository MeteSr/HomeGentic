#!/usr/bin/env bash
set -euo pipefail
ENV=${1:-local}
echo "▶ Upgrading all canisters on $ENV..."
for canister in auth payment property job quote contractor photo monitoring; do  # deploy.sh order
  echo "  Upgrading $canister..."
  icp deploy "$canister" --yes -e "$ENV"
done
echo "✅ Upgrade complete!"
