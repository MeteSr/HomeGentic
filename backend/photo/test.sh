#!/usr/bin/env bash
set -euo pipefail
echo "=== Photo Canister Tests ==="

echo "▶ Upload a before (PreConstruction) photo..."
UPLOAD_OUT=$(dfx canister call photo uploadPhoto '(
  "JOB_1",
  "PROP_1",
  variant { PreConstruction },
  "Before work started — front elevation",
  "abc123def456abc123def456abc123def456abc123def456abc123def456abc1",
  vec { 255 : nat8; 216 : nat8; 255 : nat8 }
)')
echo "$UPLOAD_OUT"

echo "▶ Upload an after (Finishing) photo..."
UPLOAD_OUT2=$(dfx canister call photo uploadPhoto '(
  "JOB_1",
  "PROP_1",
  variant { Finishing },
  "After — HVAC installation complete",
  "fed321cba654fed321cba654fed321cba654fed321cba654fed321cba654fed3",
  vec { 255 : nat8; 216 : nat8; 255 : nat8 }
)')
echo "$UPLOAD_OUT2"

echo "▶ Get photos by job (JOB_1)..."
dfx canister call photo getPhotosByJob '("JOB_1")'

echo "▶ Get photos by property (PROP_1)..."
dfx canister call photo getPhotosByProperty '("PROP_1")'

echo "▶ Get metrics..."
dfx canister call photo getMetrics

echo "✅ Photo tests passed!"
