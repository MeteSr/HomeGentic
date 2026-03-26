#!/usr/bin/env bash
set -euo pipefail
echo "=== Payment Canister Tests ==="

echo "▶ Get current subscription (expect Free default)..."
dfx canister call payment getMySubscription

echo "▶ Subscribe to Pro tier..."
dfx canister call payment subscribe '(variant { Pro })'

echo "▶ Get updated subscription..."
dfx canister call payment getMySubscription

echo "✅ Payment tests passed!"
