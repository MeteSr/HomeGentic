#!/usr/bin/env bash
ENV=${1:-local}
echo "============================================"
echo "  HomeGentic — Canister Status ($ENV)"
echo "============================================"
for canister in auth property job contractor quote payment photo monitoring frontend; do
  ID=$(icp canister status "$canister" -e "$ENV" --id-only 2>/dev/null || echo "not deployed")
  STATUS=$(icp canister status "$canister" -e "$ENV" 2>/dev/null | grep "Status:" | awk '{print $2}' || echo "unknown")
  echo "  $canister: $ID ($STATUS)"
done
