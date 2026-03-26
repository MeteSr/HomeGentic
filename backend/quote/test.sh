#!/usr/bin/env bash
set -euo pipefail
echo "=== Quote Canister Tests ==="

echo "▶ Create a quote request..."
dfx canister call quote createRequest '(1, "Plumbing", variant { Medium }, "Need to fix leaky pipe under kitchen sink")'

echo "▶ Get my requests..."
dfx canister call quote getMyRequests

echo "▶ Get request by ID (id=1)..."
dfx canister call quote getRequest '(1)'

echo "✅ Quote tests passed!"
