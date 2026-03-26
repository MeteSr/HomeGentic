#!/usr/bin/env bash
set -euo pipefail
echo "=== Property Canister Tests ==="

echo "▶ Get metrics (before any properties)..."
dfx canister call property getMetrics

echo "▶ Check tier limit — Free (expect 1)..."
dfx canister call property getPropertyLimitForTier '(variant { Free })'

echo "▶ Register a property..."
dfx canister call property registerProperty '(record {
  address = "123 Main Street";
  city = "Austin";
  state = "TX";
  zipCode = "78701";
  propertyType = variant { SingleFamily };
  yearBuilt = 1995;
  squareFeet = 2000;
  tier = variant { Pro };
})'

echo "▶ Get my properties..."
dfx canister call property getMyProperties

echo "▶ Get property by ID (id=1)..."
dfx canister call property getProperty '(1)'

echo "▶ Get final metrics..."
dfx canister call property getMetrics

echo "✅ Property tests passed!"
