#!/usr/bin/env bash
NETWORK=${1:-local}
echo "============================================"
echo "  HomeFax — Canister Status ($NETWORK)"
echo "============================================"
for canister in auth property job contractor quote price payment photo monitoring frontend; do
  ID=$(dfx canister id $canister --network $NETWORK 2>/dev/null || echo "not deployed")
  STATUS=$(dfx canister status $canister --network $NETWORK 2>/dev/null | grep "Status:" | awk '{print $2}' || echo "unknown")
  echo "  $canister: $ID ($STATUS)"
done
