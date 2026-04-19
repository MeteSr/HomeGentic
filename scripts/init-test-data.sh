#!/usr/bin/env bash
set -euo pipefail
echo "▶ Initializing test data..."

# Dev identity principal (fixed-seed Ed25519, seed[0]=42 — see frontend/src/services/actor.ts)
DEV_PRINCIPAL="qxmov-duod5-ahrw6-wydp4-lppe4-ljtvj-7zvu3-qke5i-umwsv-vcb7g-mqe"

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

echo "  Granting Basic subscription to dev identity ($DEV_PRINCIPAL)..."
dfx canister call payment grantSubscription "(principal \"$DEV_PRINCIPAL\", variant { Basic })" \
  2>/dev/null || echo "  ⚠️  grantSubscription failed (payment canister may not be initialized)"

echo "✅ Test data initialized!"
