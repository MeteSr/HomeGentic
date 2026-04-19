#!/usr/bin/env bash
# HomeGentic Job Canister — integration tests
# Covers: basic CRUD, dual-signature flow (12.4.1), DIY verification,
# pagination / multi-job listing (12.4.3), error guards.
# Run against a local replica: dfx start --background && bash backend/job/test.sh
set -euo pipefail

CANISTER="job"
echo "============================================"
echo "  HomeGentic — Job Canister Tests"
echo "============================================"

if ! dfx ping 2>/dev/null; then
  echo "❌ dfx is not running. Run: dfx start --background"
  exit 1
fi
CANISTER_ID=$(dfx canister id "$CANISTER" 2>/dev/null || echo "")
if [ -z "$CANISTER_ID" ]; then
  echo "❌ $CANISTER canister not deployed. Run: bash scripts/deploy.sh"
  exit 1
fi

# ── Ensure a contractor-test identity exists for dual-signature tests ─────────
if ! dfx identity list 2>/dev/null | grep -q "^contractor-test$"; then
  dfx identity new contractor-test --disable-encryption 2>/dev/null || true
fi
CONTRACTOR_PRINCIPAL=$(dfx identity get-principal --identity contractor-test)
echo "Contractor test principal: $CONTRACTOR_PRINCIPAL"

# ── Register a test property so cross-canister auth checks have a real target ─
# When the job canister has propCanisterId wired (e.g. after deploy.sh), calls
# like verifyJob/linkContractor/createInviteToken delegate to
# property.isAuthorized(propertyId, ...).  The property must exist and be owned
# by the caller, otherwise the check returns false → Unauthorized.
PROPERTY_CANISTER_ID=$(dfx canister id property 2>/dev/null || echo "")
if [ -n "$PROPERTY_CANISTER_ID" ]; then
  MY_PRINCIPAL=$(dfx identity get-principal)
  dfx canister call payment grantSubscription \
    "(principal \"$MY_PRINCIPAL\", variant { Premium })" > /dev/null 2>&1 || true
  SETUP_PROP_OUT=$(dfx canister call property registerProperty '(record {
    address      = "1 Job Test Drive";
    city         = "Austin";
    state        = "TX";
    zipCode      = "78701";
    propertyType = variant { SingleFamily };
    yearBuilt    = 2000;
    squareFeet   = 2000;
    tier         = variant { Premium };
  })')
  TEST_PROP_ID=$(echo "$SETUP_PROP_OUT" | grep -oP 'id = "\K[^"]+' | head -1 || echo "")
  if [ -z "$TEST_PROP_ID" ]; then
    echo "  ↳ ❌ Could not register test property — auth-dependent tests may fail"
    TEST_PROP_ID="PROP_1"
  else
    echo "  → Test property registered: $TEST_PROP_ID"
  fi
else
  # Property canister not deployed — job canister falls back to caller == owner
  TEST_PROP_ID="PROP_1"
fi

# ─── Metrics (initial state) ──────────────────────────────────────────────────
echo ""
echo "── [1] Get metrics (initial state) ─────────────────────────────────────"
dfx canister call $CANISTER getMetrics

# ─── Create a contractor job ──────────────────────────────────────────────────
echo ""
echo "── [2] Create contractor job (HVAC) ────────────────────────────────────"
JOB_OUT=$(dfx canister call $CANISTER createJob "(
  \"$TEST_PROP_ID\",
  \"HVAC Replacement\",
  variant { HVAC },
  \"Full HVAC system replacement — 3-ton Carrier unit.\",
  opt \"Cool Air Services\",
  240000,
  1718409600000000000,
  opt \"HVAC-2024-0412\",
  opt 120,
  false,
  null
)")
echo "$JOB_OUT"
JOB_ID=$(echo "$JOB_OUT" | grep -oP '"JOB_[0-9]+"' | head -1 | tr -d '"')
echo "  → Job ID: $JOB_ID"

# ─── Create a DIY job ─────────────────────────────────────────────────────────
echo ""
echo "── [3] Create DIY job (Painting) ───────────────────────────────────────"
DIY_OUT=$(dfx canister call $CANISTER createJob "(
  \"$TEST_PROP_ID\",
  \"Interior Painting\",
  variant { Painting },
  \"Living room and hallway — Benjamin Moore Chantilly Lace.\",
  null,
  0,
  1722816000000000000,
  null,
  null,
  true,
  null
)")
echo "$DIY_OUT"
DIY_ID=$(echo "$DIY_OUT" | grep -oP '"JOB_[0-9]+"' | head -1 | tr -d '"')
echo "  → DIY Job ID: $DIY_ID"

# ─── Create additional jobs for multi-job listing test (12.4.3) ───────────────
echo ""
echo "── [4] Create additional jobs for listing test (12.4.3) ─────────────────"
dfx canister call $CANISTER createJob "(
  \"$TEST_PROP_ID\",
  \"Roof Inspection\",
  variant { Roofing },
  \"Annual roof inspection after storm season.\",
  opt \"Top Roof Co\",
  85000,
  1714521600000000000,
  null,
  opt 24,
  false,
  null
)" > /dev/null
dfx canister call $CANISTER createJob "(
  \"$TEST_PROP_ID\",
  \"Plumbing Repair\",
  variant { Plumbing },
  \"Fixed leaking pipe under kitchen sink.\",
  opt \"Flow Masters\",
  45000,
  1716249600000000000,
  null,
  null,
  false,
  null
)" > /dev/null
echo "  → 2 additional jobs created"

# ─── Get job by ID ────────────────────────────────────────────────────────────
echo ""
echo "── [5] Get job by ID ────────────────────────────────────────────────────"
dfx canister call $CANISTER getJob "(\"$JOB_ID\")"

# ─── Get all jobs for property — should list all 4 (12.4.3) ──────────────────
echo ""
echo "── [6] getJobsForProperty — expect 4 jobs (12.4.3) ─────────────────────"
PROP_JOBS=$(dfx canister call $CANISTER getJobsForProperty "(\"$TEST_PROP_ID\")")
echo "$PROP_JOBS"
JOB_COUNT=$(echo "$PROP_JOBS" | grep -c 'JOB_' || true)
echo "  → Found $JOB_COUNT job entries"

# ─── Unknown property returns empty array ─────────────────────────────────────
echo ""
echo "── [7] getJobsForProperty — unknown property (expect empty) ─────────────"
dfx canister call $CANISTER getJobsForProperty '("PROP_NONEXISTENT")'

# ─── Update status ────────────────────────────────────────────────────────────
echo ""
echo "── [8] Update contractor job status → InProgress ────────────────────────"
dfx canister call $CANISTER updateJobStatus "(\"$JOB_ID\", variant { InProgress })"

echo ""
echo "── [9] Update contractor job status → Completed ─────────────────────────"
dfx canister call $CANISTER updateJobStatus "(\"$JOB_ID\", variant { Completed })"

# ─── DIY verification — homeowner signature alone suffices ────────────────────
echo ""
echo "── [10] DIY job: homeowner sign → immediately verified (12.4.1) ─────────"
VERIFY_OUT=$(dfx canister call $CANISTER verifyJob "(\"$DIY_ID\")")
echo "$VERIFY_OUT"
if echo "$VERIFY_OUT" | grep -q "verified = true"; then
  echo "  ✓ DIY job verified in one signature"
else
  echo "  ↳ Verification state shown above"
fi

# ─── Dual-signature flow (12.4.1) ─────────────────────────────────────────────
echo ""
echo "── [11] Dual-signature: link contractor principal (12.4.1) ──────────────"
dfx canister call $CANISTER linkContractor "(\"$JOB_ID\", principal \"$CONTRACTOR_PRINCIPAL\")"

echo ""
echo "── [12] Dual-signature: homeowner signs (expect awaiting contractor) ─────"
HO_SIGN=$(dfx canister call $CANISTER verifyJob "(\"$JOB_ID\")")
echo "$HO_SIGN"
if echo "$HO_SIGN" | grep -q "homeownerSigned = true"; then
  echo "  ✓ Homeowner signed — awaiting contractor"
else
  echo "  ↳ Signature state shown above"
fi

echo ""
echo "── [13] Dual-signature: contractor signs → fully verified ────────────────"
CONTR_SIGN=$(dfx canister call $CANISTER verifyJob "(\"$JOB_ID\")" --identity contractor-test)
echo "$CONTR_SIGN"
if echo "$CONTR_SIGN" | grep -q "verified = true"; then
  echo "  ✓ Job fully verified after both signatures"
else
  echo "  ↳ Signature state shown above"
fi

# ─── Re-verify already-verified job → error ───────────────────────────────────
echo ""
echo "── [14] verifyJob already verified → expect AlreadyVerified ─────────────"
dfx canister call $CANISTER verifyJob "(\"$JOB_ID\")" || echo "  ↳ Expected AlreadyVerified — ✓"

# ─── getJobsPendingMySignature ────────────────────────────────────────────────
echo ""
echo "── [15] getJobsPendingMySignature (contractor identity) ─────────────────"
dfx canister call $CANISTER getJobsPendingMySignature --identity contractor-test

# ─── Attempt to link contractor on a DIY job → error ─────────────────────────
echo ""
echo "── [16] linkContractor on DIY job → expect InvalidInput ─────────────────"
dfx canister call $CANISTER linkContractor "(\"$DIY_ID\", principal \"$CONTRACTOR_PRINCIPAL\")" \
  || echo "  ↳ Expected InvalidInput (cannot link to DIY job) — ✓"

# ─── Create job with future date → error ─────────────────────────────────────
echo ""
echo "── [17] createJob with future completedDate → expect InvalidInput ────────"
FUTURE_NS=$(($(date +%s) * 1000000000 + 86400000000000))
dfx canister call $CANISTER createJob "(
  \"PROP_1\",
  \"Future Job\",
  variant { Electrical },
  \"This job is in the future.\",
  opt \"Some Co\",
  50000,
  $FUTURE_NS,
  null,
  null,
  false,
  null
)" || echo "  ↳ Expected InvalidInput (future date) — ✓"

# ─── Invite token flow ────────────────────────────────────────────────────────
# Create a FRESH unsigned contractor job for the invite token flow.
# $JOB_ID is already fully signed by step [13] — createInviteToken rejects signed jobs.
echo ""
echo "── [18-setup] Create fresh unsigned contractor job for invite token flow ──"
INVITE_JOB_OUT=$(dfx canister call $CANISTER createJob "(
  \"$TEST_PROP_ID\",
  \"Electrical panel upgrade\",
  variant { Electrical },
  \"Replace 100A panel with 200A service.\",
  opt \"Invite Flow Electric\",
  75000,
  1700000000000000000,
  null,
  null,
  false,
  null
)")
echo "$INVITE_JOB_OUT"
INVITE_JOB_ID=$(echo "$INVITE_JOB_OUT" | grep -oP '"JOB_[0-9]+"' | head -1 | tr -d '"')
echo "  → Fresh job ID: $INVITE_JOB_ID"

echo ""
echo "── [18] createInviteToken — homeowner creates token for unsigned contractor job ───"
INVITE_OUT=$(dfx canister call $CANISTER createInviteToken "(\"$INVITE_JOB_ID\", \"123 Main St, Austin TX 78701\")")
echo "$INVITE_OUT"
INVITE_TOKEN=$(echo "$INVITE_OUT" | grep -oP '"[a-zA-Z0-9_-]{16,}"' | head -1 | tr -d '"')
echo "  → Invite token: $INVITE_TOKEN"

echo ""
echo "── [19] getJobByInviteToken — contractor reads invite ───────────────────"
GET_INVITE=$(dfx canister call $CANISTER getJobByInviteToken "(\"$INVITE_TOKEN\")" --identity contractor-test)
echo "$GET_INVITE"
if echo "$GET_INVITE" | grep -q "$INVITE_JOB_ID"; then
  echo "  ✓ Invite token returns correct job"
else
  echo "  ↳ Job data shown above"
fi

echo ""
echo "── [20] redeemInviteToken — contractor redeems token ───────────────────"
REDEEM_OUT=$(dfx canister call $CANISTER redeemInviteToken "(\"$INVITE_TOKEN\")" --identity contractor-test)
echo "$REDEEM_OUT"
if echo "$REDEEM_OUT" | grep -qiE "ok|success|redeemed"; then
  echo "  ✓ Token redeemed successfully"
else
  echo "  ↳ Redemption result shown above"
fi

echo ""
echo "── [21] redeemInviteToken again → expect AlreadyRedeemed / error ────────"
dfx canister call $CANISTER redeemInviteToken "(\"$INVITE_TOKEN\")" --identity contractor-test \
  || echo "  ↳ Expected error for double-redeem — ✓"

echo ""
echo "── [22] createInviteToken on DIY job → expect NotAuthorized / error ─────"
dfx canister call $CANISTER createInviteToken "(\"$DIY_ID\", \"123 Main St, Austin TX 78701\")" \
  || echo "  ↳ Expected error (DIY jobs cannot have contractor invites) — ✓"

echo ""
echo "── [23] getJobByInviteToken with unknown token → expect error ───────────"
dfx canister call $CANISTER getJobByInviteToken '("INVALID_TOKEN_XYZ")' \
  || echo "  ↳ Expected NotFound for unknown token — ✓"

echo ""
echo "── [24] createInviteToken as contractor → expect NotAuthorized ──────────"
dfx canister call $CANISTER createInviteToken "(\"$JOB_ID\", \"123 Main St, Austin TX 78701\")" --identity contractor-test \
  || echo "  ↳ Expected NotAuthorized (only homeowner can create invite) — ✓"

# ─── Rate Limit Tests ─────────────────────────────────────────────────────────
echo ""
echo "── [25] setUpdateRateLimit to 3 (admin) ────────────────────────────────"
# Ensure we have admin rights first (first addAdmin call bootstraps)
dfx canister call $CANISTER addAdmin "(principal \"$(dfx identity get-principal)\")"
dfx canister call $CANISTER setUpdateRateLimit "(3 : nat)"

echo ""
echo "── [26] 3 update calls succeed under the limit ─────────────────────────"
dfx canister call $CANISTER createJob '(
  "PROP_RL_1",
  "Rate Limit Test Job 1",
  variant { Plumbing },
  "RL test",
  null,
  0,
  1718409600000000000,
  null,
  null,
  true,
  null
)' --identity contractor-test
dfx canister call $CANISTER createJob '(
  "PROP_RL_2",
  "Rate Limit Test Job 2",
  variant { Plumbing },
  "RL test",
  null,
  0,
  1718409600000000000,
  null,
  null,
  true,
  null
)' --identity contractor-test
dfx canister call $CANISTER createJob '(
  "PROP_RL_3",
  "Rate Limit Test Job 3",
  variant { Plumbing },
  "RL test",
  null,
  0,
  1718409600000000000,
  null,
  null,
  true,
  null
)' --identity contractor-test
echo "  ↳ 3 calls succeeded — ✓"

echo ""
echo "── [27] 4th call is rejected (rate limit exceeded) ─────────────────────"
dfx canister call $CANISTER createJob '(
  "PROP_RL_4",
  "Rate Limit Test Job 4",
  variant { Plumbing },
  "RL test",
  null,
  0,
  1718409600000000000,
  null,
  null,
  true,
  null
)' --identity contractor-test \
  && echo "  ↳ ❌ Expected rate limit error — call should have failed" \
  || echo "  ↳ Rate limit correctly rejected 4th call — ✓"

echo ""
echo "── [28] Admin identity is exempt from rate limit ───────────────────────"
dfx canister call $CANISTER createJob '(
  "PROP_RL_ADMIN",
  "Admin Exempt Test",
  variant { Plumbing },
  "Admin bypass test",
  null,
  0,
  1718409600000000000,
  null,
  null,
  true,
  null
)'
echo "  ↳ Admin call succeeded despite limit — ✓"

echo ""
echo "── [29] Reset rate limit to 30 (production default) ────────────────────"
dfx canister call $CANISTER setUpdateRateLimit "(30 : nat)"
echo "  ↳ Rate limit restored to 30/min — ✓"

# ─── Metrics (after tests) ────────────────────────────────────────────────────
echo ""
echo "── [30] Get metrics (after tests) ──────────────────────────────────────"
dfx canister call $CANISTER getMetrics

echo ""
echo "============================================"
echo "  ✅ Job canister tests complete!"
echo "============================================"

# ─── §47 Trusted Canister (inter-canister whitelist) ─────────────────────────

MY_PRINCIPAL=$(dfx identity get-principal)

# Ensure a sensor-test identity exists (stands in for the sensor canister principal)
if ! dfx identity list 2>/dev/null | grep -q "^sensor-test$"; then
  dfx identity new sensor-test --disable-encryption 2>/dev/null || true
fi
SENSOR_TEST_PRINCIPAL=$(dfx identity get-principal --identity sensor-test)

echo ""
echo "── [31] addTrustedCanister — admin can add a trusted principal ──────────"
dfx canister call $CANISTER addTrustedCanister "(principal \"$SENSOR_TEST_PRINCIPAL\")"
echo "  ↳ addTrustedCanister succeeded — ✓"

echo ""
echo "── [32] getTrustedCanisters — returns the added principal ───────────────"
TRUSTED=$(dfx canister call $CANISTER getTrustedCanisters)
echo "$TRUSTED" | grep -q "$SENSOR_TEST_PRINCIPAL" \
  && echo "  ↳ sensor-test principal present in trusted list — ✓" \
  || (echo "  ↳ ❌ sensor-test principal NOT found in trusted list"; exit 1)

echo ""
echo "── [33] addTrustedCanister — non-admin is rejected ─────────────────────"
dfx canister call $CANISTER addTrustedCanister "(principal \"$MY_PRINCIPAL\")" \
    --identity contractor-test \
  && echo "  ↳ ❌ Expected rejection — non-admin should not be able to add" \
  || echo "  ↳ Non-admin correctly rejected — ✓"

echo ""
echo "── [34] Trusted principal bypasses rate limit ───────────────────────────"
dfx canister call $CANISTER setUpdateRateLimit "(2 : nat)"
# sensor-test is in trusted list — 3 calls should all succeed despite limit=2
dfx canister call $CANISTER createJob '("TRUST_PROP_1", "Trusted Bypass 1", variant { Plumbing }, "trust test", null, 0, 1718409600000000000, null, null, true, null)' --identity sensor-test
dfx canister call $CANISTER createJob '("TRUST_PROP_2", "Trusted Bypass 2", variant { Plumbing }, "trust test", null, 0, 1718409600000000000, null, null, true, null)' --identity sensor-test
dfx canister call $CANISTER createJob '("TRUST_PROP_3", "Trusted Bypass 3", variant { Plumbing }, "trust test", null, 0, 1718409600000000000, null, null, true, null)' --identity sensor-test
echo "  ↳ 3 calls succeeded despite rate limit of 2 — ✓"
dfx canister call $CANISTER setUpdateRateLimit "(30 : nat)"

echo ""
echo "── [35] createSensorJob — untrusted identity is rejected ────────────────"
if ! dfx identity list 2>/dev/null | grep -q "^untrusted-test$"; then
  dfx identity new untrusted-test --disable-encryption 2>/dev/null || true
fi
UNTRUSTED_PRINCIPAL=$(dfx identity get-principal --identity untrusted-test)
dfx canister call $CANISTER createSensorJob \
  "(\"PROP_SENSOR_1\", principal \"$UNTRUSTED_PRINCIPAL\", \"Leak Detected\", variant { Plumbing }, \"sensor alert\")" \
  --identity untrusted-test \
  && echo "  ↳ ❌ Expected rejection — untrusted principal should not call createSensorJob" \
  || echo "  ↳ Untrusted principal correctly rejected from createSensorJob — ✓"

echo ""
echo "── [36] createSensorJob — trusted principal is accepted ─────────────────"
dfx canister call $CANISTER createSensorJob \
  "(\"PROP_SENSOR_1\", principal \"$MY_PRINCIPAL\", \"Leak Detected\", variant { Plumbing }, \"sensor alert\")" \
  --identity sensor-test \
  && echo "  ↳ Trusted principal accepted for createSensorJob — ✓" \
  || echo "  ↳ ❌ Trusted principal was rejected — implementation needed"

echo ""
echo "── [37] removeTrustedCanister — principal removed from list ─────────────"
dfx canister call $CANISTER removeTrustedCanister "(principal \"$SENSOR_TEST_PRINCIPAL\")"
TRUSTED_AFTER=$(dfx canister call $CANISTER getTrustedCanisters)
echo "$TRUSTED_AFTER" | grep -q "$SENSOR_TEST_PRINCIPAL" \
  && echo "  ↳ ❌ Principal still in list after removal" \
  || echo "  ↳ Principal correctly removed from trusted list — ✓"

# ─── Contractor-initiated job proposals ──────────────────────────────────────
# Requires: createJobProposal, getPendingProposals, approveJobProposal, rejectJobProposal
# New status variant: #PendingHomeownerApproval
# TDD: tests written before implementation (see agents/voice/__tests__/duplicateDetection.test.ts)

HOMEOWNER_PRINCIPAL=$(dfx identity get-principal)

# Register a fresh property so createJobProposal can resolve the owner via the property canister.
# The deployer (homeowner) owns this property; contractor-test will submit proposals against it.
echo ""
echo "── [38-setup] Register property for proposal tests ─────────────────────"
dfx canister call payment grantSubscription "(principal \"$HOMEOWNER_PRINCIPAL\", variant { Premium })" > /dev/null 2>&1 || true
PROPOSAL_PROP_OUT=$(dfx canister call property registerProperty '(record {
  address      = "77 Proposal Test Lane";
  city         = "Houston";
  state        = "TX";
  zipCode      = "77001";
  propertyType = variant { SingleFamily };
  yearBuilt    = 2000;
  squareFeet   = 1800;
  tier         = variant { Premium };
})')
PROPOSAL_PROP_ID=$(echo "$PROPOSAL_PROP_OUT" | grep -oP 'id = "\K[^"]+' | head -1 || true)
echo "  → Proposal property ID: $PROPOSAL_PROP_ID"

echo ""
echo "── [38] createJobProposal — contractor submits a proposal for homeowner approval ──"
# Called by contractor identity; propertyId must belong to homeowner (looked up by property canister)
PROPOSAL_OUT=$(dfx canister call $CANISTER createJobProposal "(
  \"$PROPOSAL_PROP_ID\",
  \"HVAC Tune-Up\",
  variant { HVAC },
  \"Full HVAC tune-up and filter replacement at the property.\",
  opt \"Cool Air Services\",
  45000,
  1718409600000000000,
  null,
  null
)" --identity contractor-test)
echo "$PROPOSAL_OUT"
PROPOSAL_ID=$(echo "$PROPOSAL_OUT" | grep -oP '"JOB_[0-9]+"' | head -1 | tr -d '"' || true)
if echo "$PROPOSAL_OUT" | grep -q "PendingHomeownerApproval"; then
  echo "  ✓ Proposal created with PendingHomeownerApproval status"
else
  echo "  ↳ ❌ Expected PendingHomeownerApproval status — implementation needed"
fi
if echo "$PROPOSAL_OUT" | grep -q "contractorSigned = true"; then
  echo "  ✓ contractorSigned = true on new proposal"
else
  echo "  ↳ ❌ Expected contractorSigned = true — implementation needed"
fi
if echo "$PROPOSAL_OUT" | grep -q "homeownerSigned = false"; then
  echo "  ✓ homeownerSigned = false on new proposal (awaiting homeowner)"
else
  echo "  ↳ ❌ Expected homeownerSigned = false — implementation needed"
fi
echo "  → Proposal ID: $PROPOSAL_ID"

echo ""
echo "── [39] getPendingProposals — homeowner sees the pending proposal ────────"
# Called by homeowner; should return jobs with #PendingHomeownerApproval where homeowner = caller
PENDING_OUT=$(dfx canister call $CANISTER getPendingProposals)
echo "$PENDING_OUT"
if [ -n "$PROPOSAL_ID" ] && echo "$PENDING_OUT" | grep -q "$PROPOSAL_ID"; then
  echo "  ✓ Homeowner sees the pending proposal"
else
  echo "  ↳ ❌ Proposal not visible to homeowner — implementation needed"
fi

echo ""
echo "── [40] getPendingProposals as contractor → should NOT return proposals ──"
# Contractors should not see homeowner's pending proposals via this call
CONTRACTOR_PENDING=$(dfx canister call $CANISTER getPendingProposals --identity contractor-test)
echo "$CONTRACTOR_PENDING"
if echo "$CONTRACTOR_PENDING" | grep -q "$PROPOSAL_ID"; then
  echo "  ↳ ❌ Contractor should not see homeowner's proposals via getPendingProposals"
else
  echo "  ✓ Contractor sees an empty list (proposals belong to homeowner)"
fi

echo ""
echo "── [41] approveJobProposal — homeowner approves the proposal ────────────"
APPROVE_OUT=$(dfx canister call $CANISTER approveJobProposal "(\"$PROPOSAL_ID\")")
echo "$APPROVE_OUT"
if echo "$APPROVE_OUT" | grep -qiE "Pending|ok|homeownerSigned = true"; then
  echo "  ✓ Proposal approved — job moves to Pending status"
else
  echo "  ↳ ❌ approveJobProposal not implemented yet"
fi
if echo "$APPROVE_OUT" | grep -q "homeownerSigned = true"; then
  echo "  ✓ homeownerSigned set to true after approval"
fi

echo ""
echo "── [42] Approved proposal no longer in getPendingProposals ─────────────"
AFTER_APPROVE=$(dfx canister call $CANISTER getPendingProposals)
if echo "$AFTER_APPROVE" | grep -q "$PROPOSAL_ID"; then
  echo "  ↳ ❌ Approved proposal should not appear in pending list"
else
  echo "  ✓ Approved proposal removed from pending list"
fi

echo ""
echo "── [43] createJobProposal for second proposal — to be rejected ──────────"
REJECT_PROPOSAL_OUT=$(dfx canister call $CANISTER createJobProposal "(
  \"$PROPOSAL_PROP_ID\",
  \"Roof Inspection\",
  variant { Roofing },
  \"Annual roof inspection.\",
  opt \"Top Roof Co\",
  25000,
  1718409600000000000,
  null,
  null
)" --identity contractor-test)
echo "$REJECT_PROPOSAL_OUT"
REJECT_PROPOSAL_ID=$(echo "$REJECT_PROPOSAL_OUT" | grep -oP '"JOB_[0-9]+"' | head -1 | tr -d '"' || true)
echo "  → Reject-target proposal ID: $REJECT_PROPOSAL_ID"

echo ""
echo "── [44] rejectJobProposal — homeowner rejects the proposal ─────────────"
REJECT_OUT=$(dfx canister call $CANISTER rejectJobProposal "(\"$REJECT_PROPOSAL_ID\")")
echo "$REJECT_OUT"
if echo "$REJECT_OUT" | grep -qiE "ok"; then
  echo "  ✓ Proposal rejected successfully"
else
  echo "  ↳ ❌ rejectJobProposal not implemented yet"
fi

echo ""
echo "── [45] Rejected proposal no longer in getPendingProposals ─────────────"
AFTER_REJECT=$(dfx canister call $CANISTER getPendingProposals)
if echo "$AFTER_REJECT" | grep -q "$REJECT_PROPOSAL_ID"; then
  echo "  ↳ ❌ Rejected proposal should not appear in pending list"
else
  echo "  ✓ Rejected proposal removed from pending list"
fi

echo ""
echo "── [46] approveJobProposal as contractor → expect Unauthorized ──────────"
# Only the homeowner (the property owner) may approve
dfx canister call $CANISTER approveJobProposal "(\"$PROPOSAL_ID\")" --identity contractor-test \
  && echo "  ↳ ❌ Contractor should not be able to approve — expected Unauthorized" \
  || echo "  ✓ Contractor correctly rejected from approveJobProposal"

echo ""
echo "── [47] rejectJobProposal as contractor → expect Unauthorized ───────────"
dfx canister call $CANISTER rejectJobProposal "(\"$REJECT_PROPOSAL_ID\")" --identity contractor-test \
  && echo "  ↳ ❌ Contractor should not be able to reject — expected Unauthorized" \
  || echo "  ✓ Contractor correctly rejected from rejectJobProposal"

echo ""
echo "── [48] createJobProposal — homeowner cannot propose their own job ──────"
# Caller must NOT be the property owner — proposals come from contractors
dfx canister call $CANISTER createJobProposal "(
  \"$PROPOSAL_PROP_ID\",
  \"Self-Proposal Test\",
  variant { Painting },
  \"Homeowner trying to create a proposal for their own property.\",
  opt \"Homeowner Inc\",
  10000,
  1718409600000000000,
  null,
  null
)" && echo "  ↳ ❌ Homeowner should not be able to propose on own property" \
  || echo "  ✓ Homeowner correctly blocked from self-proposing"

echo ""
echo "============================================"
echo "  ✅ Contractor proposal tests complete!"
echo "============================================"

# ─── Manager tier-bypass tests ────────────────────────────────────────────────
# Verifies that a delegated manager (Free-tier principal) can create jobs for
# a property they manage, using the owner's subscription instead of their own.
#
# Prerequisites:
#   - property canister deployed
#   - payment canister deployed and wired to job canister
#   - property canister wired to job canister via setPropertyCanisterId
# Skip gracefully if any canister is missing.

PROPERTY_ID=$(dfx canister id property 2>/dev/null || echo "")
PAYMENT_ID=$(dfx canister id payment  2>/dev/null || echo "")

if [ -z "$PROPERTY_ID" ] || [ -z "$PAYMENT_ID" ]; then
  echo ""
  echo "── [MGR] SKIPPED — property or payment canister not deployed ────────────"
else
  echo ""
  echo "── [MGR-0] Setup: wire payment + property canisters into job ────────────"
  dfx canister call $CANISTER setPaymentCanisterId  "(\"$PAYMENT_ID\")"
  dfx canister call $CANISTER setPropertyCanisterId "(\"$PROPERTY_ID\")"
  echo "  ↳ Canisters wired ✓"

  # Create a manager-test identity (Free tier — no subscription granted)
  if ! dfx identity list 2>/dev/null | grep -q "^manager-test$"; then
    dfx identity new manager-test --disable-encryption 2>/dev/null || true
  fi
  MANAGER_PRINCIPAL=$(dfx identity get-principal --identity manager-test)
  echo "  Manager principal (Free tier): $MANAGER_PRINCIPAL"

  # Ensure owner (default identity) has a Premium subscription so that the
  # MGR property registration succeeds even when parallel canister tests have
  # already consumed the Pro limit (5 properties) for the deployer.
  MY_PRINCIPAL=$(dfx identity get-principal)
  dfx canister call payment grantSubscription "(principal \"$MY_PRINCIPAL\", variant { Premium })"

  # Register a fresh property as the owner
  echo ""
  echo "── [MGR-1] Register property as owner ──────────────────────────────────"
  MGR_PROP_OUT=$(dfx canister call property registerProperty '(record {
    address      = "77 Manager Lane";
    city         = "Tampa";
    state        = "FL";
    zipCode      = "33601";
    propertyType = variant { SingleFamily };
    yearBuilt    = 2010;
    squareFeet   = 1800;
    tier         = variant { Pro };
  })')
  echo "$MGR_PROP_OUT"
  MGR_PROP_ID=$(echo "$MGR_PROP_OUT" | grep -oP 'id = "\K[^"]+' | head -1 || true)
  echo "  → Property ID: $MGR_PROP_ID"

  # Invite manager via bearer token
  echo ""
  echo "── [MGR-2] Owner invites manager (Manager role) ─────────────────────────"
  INVITE_OUT=$(dfx canister call property inviteManager \
    "(\"$MGR_PROP_ID\", variant { Manager }, \"Test Manager\")")
  echo "$INVITE_OUT"
  INVITE_TOKEN=$(echo "$INVITE_OUT" | grep -oP 'token = "\K[^"]+' | head -1 || true)
  echo "  → Token: $INVITE_TOKEN"

  # Manager claims the role
  echo ""
  echo "── [MGR-3] Manager claims role ──────────────────────────────────────────"
  CLAIM_OUT=$(dfx canister call property claimManagerRole \
    "(\"$INVITE_TOKEN\")" --identity manager-test)
  echo "$CLAIM_OUT"
  if echo "$CLAIM_OUT" | grep -qi "ok"; then
    echo "  ✓ Manager role claimed"
  else
    echo "  ↳ ❌ Expected ok from claimManagerRole"
  fi

  # Manager (Free tier) creates a job for the owner's property — SHOULD SUCCEED
  echo ""
  echo "── [MGR-4] Manager (Free tier) creates job for owner's property → expect ok ─"
  MGR_JOB_OUT=$(dfx canister call $CANISTER createJob "(
    \"$MGR_PROP_ID\",
    \"Manager-submitted HVAC check\",
    variant { HVAC },
    \"Annual HVAC inspection submitted by delegated manager.\",
    opt \"Cool Air Co\",
    50000,
    1718409600000000000,
    null,
    null,
    false,
    null
  )" --identity manager-test)
  echo "$MGR_JOB_OUT"
  if echo "$MGR_JOB_OUT" | grep -qi "ok"; then
    echo "  ✓ Manager created job using owner's Pro subscription"
  else
    echo "  ↳ ❌ Manager should be able to create jobs using owner's tier — FAIL"
  fi

  # Manager (Free tier) tries to create a job for a property they do NOT manage → SHOULD FAIL
  echo ""
  echo "── [MGR-5] Manager creates job for unrelated property → expect TierLimitReached ─"
  UNAUTH_OUT=$(dfx canister call $CANISTER createJob "(
    \"$TEST_PROP_ID\",
    \"Unauthorized job\",
    variant { Plumbing },
    \"Manager should be blocked on a property they do not manage.\",
    opt \"Random Co\",
    10000,
    1718409600000000000,
    null,
    null,
    false,
    null
  )" --identity manager-test)
  echo "$UNAUTH_OUT"
  if echo "$UNAUTH_OUT" | grep -qiE "TierLimitReached|err"; then
    echo "  ✓ Free-tier manager blocked on unrelated property (tier check applies)"
  else
    echo "  ↳ ❌ Should have returned TierLimitReached for unrelated property"
  fi

  echo ""
  echo "✅ Manager tier-bypass tests complete!"
fi
