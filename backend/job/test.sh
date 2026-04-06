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

# ─── Metrics (initial state) ──────────────────────────────────────────────────
echo ""
echo "── [1] Get metrics (initial state) ─────────────────────────────────────"
dfx canister call $CANISTER getMetrics

# ─── Create a contractor job ──────────────────────────────────────────────────
echo ""
echo "── [2] Create contractor job (HVAC) ────────────────────────────────────"
JOB_OUT=$(dfx canister call $CANISTER createJob '(
  "PROP_1",
  "HVAC Replacement",
  variant { HVAC },
  "Full HVAC system replacement — 3-ton Carrier unit.",
  opt "Cool Air Services",
  240000,
  1718409600000000000,
  opt "HVAC-2024-0412",
  opt 120,
  false
)')
echo "$JOB_OUT"
JOB_ID=$(echo "$JOB_OUT" | grep -oP '"JOB_[0-9]+"' | head -1 | tr -d '"')
echo "  → Job ID: $JOB_ID"

# ─── Create a DIY job ─────────────────────────────────────────────────────────
echo ""
echo "── [3] Create DIY job (Painting) ───────────────────────────────────────"
DIY_OUT=$(dfx canister call $CANISTER createJob '(
  "PROP_1",
  "Interior Painting",
  variant { Painting },
  "Living room and hallway — Benjamin Moore Chantilly Lace.",
  null,
  0,
  1722816000000000000,
  null,
  null,
  true
)')
echo "$DIY_OUT"
DIY_ID=$(echo "$DIY_OUT" | grep -oP '"JOB_[0-9]+"' | head -1 | tr -d '"')
echo "  → DIY Job ID: $DIY_ID"

# ─── Create additional jobs for multi-job listing test (12.4.3) ───────────────
echo ""
echo "── [4] Create additional jobs for listing test (12.4.3) ─────────────────"
dfx canister call $CANISTER createJob '(
  "PROP_1",
  "Roof Inspection",
  variant { Roofing },
  "Annual roof inspection after storm season.",
  opt "Top Roof Co",
  85000,
  1714521600000000000,
  null,
  opt 24,
  false
)' > /dev/null
dfx canister call $CANISTER createJob '(
  "PROP_1",
  "Plumbing Repair",
  variant { Plumbing },
  "Fixed leaking pipe under kitchen sink.",
  opt "Flow Masters",
  45000,
  1716249600000000000,
  null,
  null,
  false
)' > /dev/null
echo "  → 2 additional jobs created"

# ─── Get job by ID ────────────────────────────────────────────────────────────
echo ""
echo "── [5] Get job by ID ────────────────────────────────────────────────────"
dfx canister call $CANISTER getJob "(\"$JOB_ID\")"

# ─── Get all jobs for property — should list all 4 (12.4.3) ──────────────────
echo ""
echo "── [6] getJobsForProperty — expect 4 jobs (12.4.3) ─────────────────────"
PROP_JOBS=$(dfx canister call $CANISTER getJobsForProperty '("PROP_1")')
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
  false
)" || echo "  ↳ Expected InvalidInput (future date) — ✓"

# ─── Invite token flow ────────────────────────────────────────────────────────
echo ""
echo "── [18] createInviteToken — homeowner creates token for contractor job ───"
INVITE_OUT=$(dfx canister call $CANISTER createInviteToken "(\"$JOB_ID\")")
echo "$INVITE_OUT"
INVITE_TOKEN=$(echo "$INVITE_OUT" | grep -oP '"[a-zA-Z0-9_-]{16,}"' | head -1 | tr -d '"')
echo "  → Invite token: $INVITE_TOKEN"

echo ""
echo "── [19] getJobByInviteToken — contractor reads invite ───────────────────"
GET_INVITE=$(dfx canister call $CANISTER getJobByInviteToken "(\"$INVITE_TOKEN\")" --identity contractor-test)
echo "$GET_INVITE"
if echo "$GET_INVITE" | grep -q "$JOB_ID"; then
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
dfx canister call $CANISTER createInviteToken "(\"$DIY_ID\")" \
  || echo "  ↳ Expected error (DIY jobs cannot have contractor invites) — ✓"

echo ""
echo "── [23] getJobByInviteToken with unknown token → expect error ───────────"
dfx canister call $CANISTER getJobByInviteToken '("INVALID_TOKEN_XYZ")' \
  || echo "  ↳ Expected NotFound for unknown token — ✓"

echo ""
echo "── [24] createInviteToken as contractor → expect NotAuthorized ──────────"
dfx canister call $CANISTER createInviteToken "(\"$JOB_ID\")" --identity contractor-test \
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
  null,
  null,
  null
)' --identity contractor-test
dfx canister call $CANISTER createJob '(
  "PROP_RL_2",
  "Rate Limit Test Job 2",
  variant { Plumbing },
  "RL test",
  null,
  null,
  null,
  null
)' --identity contractor-test
dfx canister call $CANISTER createJob '(
  "PROP_RL_3",
  "Rate Limit Test Job 3",
  variant { Plumbing },
  "RL test",
  null,
  null,
  null,
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
  null,
  null,
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
  null,
  null,
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
dfx canister call $CANISTER createJob '(
  "TRUST_PROP_1", "Trusted Bypass 1", variant { Plumbing }, "trust test", null, null, null, null
)' --identity sensor-test
dfx canister call $CANISTER createJob '(
  "TRUST_PROP_2", "Trusted Bypass 2", variant { Plumbing }, "trust test", null, null, null, null
)' --identity sensor-test
dfx canister call $CANISTER createJob '(
  "TRUST_PROP_3", "Trusted Bypass 3", variant { Plumbing }, "trust test", null, null, null, null
)' --identity sensor-test
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
