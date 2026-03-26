#!/usr/bin/env bash
set -euo pipefail
echo "=== Contractor Canister Tests ==="

echo "▶ Register as contractor..."
dfx canister call contractor register '(record {
  name = "ACME Services";
  specialty = "Plumbing";
  email = "acme@contractors.com";
  phone = "555-9001";
})'

echo "▶ Get my contractor profile..."
dfx canister call contractor getMyProfile

echo "▶ Get all contractors..."
dfx canister call contractor getAll

echo "✅ Contractor tests passed!"
