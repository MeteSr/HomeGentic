#!/usr/bin/env bash
set -euo pipefail
echo "=== Auth Canister Tests ==="

echo "▶ Register as homeowner..."
dfx canister call auth register '(record { role = variant { Homeowner }; email = "test@homefax.app"; phone = "555-0001" })'

echo "▶ Get profile..."
dfx canister call auth getProfile

echo "▶ Check role..."
dfx canister call auth hasRole '(variant { Homeowner })'

echo "▶ Get metrics..."
dfx canister call auth getMetrics

echo "✅ Auth tests passed!"
