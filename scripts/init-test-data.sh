#!/usr/bin/env bash
set -euo pipefail
echo "▶ Initializing test data..."

dfx canister call auth register '(record { role = variant { Homeowner }; email = "homeowner@test.com"; phone = "555-0001" })'
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

echo "✅ Test data initialized!"
