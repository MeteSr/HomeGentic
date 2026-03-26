#!/usr/bin/env bash
set -euo pipefail
echo "=== Price Canister Tests ==="

echo "▶ Get all pricing tiers..."
dfx canister call price getAllPricing

echo "▶ Get Free tier pricing..."
dfx canister call price getPricing '(variant { Free })'

echo "▶ Get Pro tier pricing..."
dfx canister call price getPricing '(variant { Pro })'

echo "▶ Get Premium tier pricing..."
dfx canister call price getPricing '(variant { Premium })'

echo "▶ Get ContractorPro tier pricing..."
dfx canister call price getPricing '(variant { ContractorPro })'

echo "✅ Price tests passed!"
