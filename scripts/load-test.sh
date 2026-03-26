#!/usr/bin/env bash
set -euo pipefail
ITERATIONS=${1:-10}
echo "▶ Running load test ($ITERATIONS iterations)..."
for i in $(seq 1 $ITERATIONS); do
  dfx canister call auth getMetrics > /dev/null
  dfx canister call property getMetrics > /dev/null
done
echo "✅ Load test complete ($ITERATIONS iterations)"
