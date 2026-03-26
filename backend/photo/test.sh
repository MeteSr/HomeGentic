#!/usr/bin/env bash
set -euo pipefail
echo "=== Photo Canister Tests ==="

echo "▶ Upload a before photo..."
dfx canister call photo upload '(record {
  jobId = 1;
  phase = "before";
  sha256Hash = "abc123def456abc123def456abc123def456abc123def456abc123def456abc1";
})'

echo "▶ Upload an after photo..."
dfx canister call photo upload '(record {
  jobId = 1;
  phase = "after";
  sha256Hash = "fed321cba654fed321cba654fed321cba654fed321cba654fed321cba654fed3";
})'

echo "▶ Get photos by job (jobId=1)..."
dfx canister call photo getByJob '(1)'

echo "▶ Get photo count for job 1..."
dfx canister call photo getCount '(1)'

echo "✅ Photo tests passed!"
