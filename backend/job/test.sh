#!/usr/bin/env bash
# HomeFax Job Canister — integration tests
# Run against a local replica: dfx start --background && bash backend/job/test.sh
set -euo pipefail

CANISTER="job"
echo "=== Job Canister Tests ==="

# ── Create a contractor job ───────────────────────────────────────────────────
echo "▶ Create a contractor job..."
JOB=$(dfx canister call $CANISTER createJob '(
  "PROP_1",
  "HVAC Replacement",
  variant { HVAC },
  "Full HVAC system replacement — 3 ton Carrier unit",
  opt "Cool Air Services",
  240000,
  1718409600000000000,
  opt "HVAC-2024-0412",
  opt 120,
  false
)')
echo "$JOB"
JOB_ID=$(echo "$JOB" | grep -o '"JOB_[0-9]*"' | head -1 | tr -d '"')
echo "  → Job ID: $JOB_ID"

# ── Create a DIY job (no contractor, no permit) ───────────────────────────────
echo "▶ Create a DIY job..."
DIY_JOB=$(dfx canister call $CANISTER createJob '(
  "PROP_1",
  "Interior Painting",
  variant { Painting },
  "Living room and hallway — Benjamin Moore Chantilly Lace",
  null,
  28000,
  1722816000000000000,
  null,
  null,
  true
)')
echo "$DIY_JOB"
DIY_ID=$(echo "$DIY_JOB" | grep -o '"JOB_[0-9]*"' | head -1 | tr -d '"')
echo "  → DIY Job ID: $DIY_ID"

# ── Get job by ID ─────────────────────────────────────────────────────────────
echo "▶ Get job by ID..."
dfx canister call $CANISTER getJob "(\"$JOB_ID\")"

# ── Get all jobs for a property ───────────────────────────────────────────────
echo "▶ Get jobs for PROP_1..."
dfx canister call $CANISTER getJobsForProperty '("PROP_1")'

# ── Update status ─────────────────────────────────────────────────────────────
echo "▶ Update job status to InProgress..."
dfx canister call $CANISTER updateJobStatus "(\"$JOB_ID\", variant { InProgress })"

echo "▶ Update job status to Completed..."
dfx canister call $CANISTER updateJobStatus "(\"$JOB_ID\", variant { Completed })"

# ── Homeowner signs DIY job → should immediately verify (no contractor needed) ─
echo "▶ Sign DIY job (homeowner signature alone should fully verify)..."
dfx canister call $CANISTER verifyJob "(\"$DIY_ID\")"

# ── Homeowner signs contractor job → awaiting contractor co-sign ──────────────
echo "▶ Homeowner signs contractor job..."
dfx canister call $CANISTER verifyJob "(\"$JOB_ID\")"

# ── Metrics ───────────────────────────────────────────────────────────────────
echo "▶ Get metrics..."
dfx canister call $CANISTER getMetrics

echo ""
echo "✅ Job canister tests passed!"
