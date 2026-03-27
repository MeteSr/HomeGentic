#!/usr/bin/env bash
set -euo pipefail

NETWORK=${1:-local}

echo "============================================"
echo "  HomeFax — Deployment ($NETWORK)"
echo "============================================"

if [ "$NETWORK" = "local" ]; then
  echo "▶ Starting dfx local replica..."
  if dfx ping 2>/dev/null; then
    echo "  ✓ dfx is already running"
  else
    dfx start --background --clean
    echo "  ✓ dfx started"
  fi
fi

echo "▶ Deploying canisters..."
for canister in auth property job contractor quote price payment photo report maintenance market sensor monitoring; do
  echo "  Deploying $canister..."
  dfx deploy $canister --network $NETWORK
done

echo ""
echo "============================================"
echo "  Deployed Canister IDs"
echo "============================================"
for canister in auth property job contractor quote price payment photo report maintenance market sensor monitoring; do
  ID=$(dfx canister id $canister --network $NETWORK 2>/dev/null || echo "not deployed")
  echo "  $canister: $ID"
done

echo ""
echo "✅ Deployment complete!"
