#!/usr/bin/env bash
# Deploys and wires every backend canister on a local dfx replica.
#
# Extracted from .github/workflows/ci.yml's test-backend job so the exact
# same proven deploy+bootstrap+wiring sequence can be reused by other jobs
# (e.g. perf-regression.yml's live cycles benchmarks) without copy-pasting
# ~120 lines of YAML a second time. Assumes:
#   - dfx, mops and moc are already installed and DFX_MOC_PATH is exported
#   - `dfx start --clean --background` has already been run
#   - the working directory is the repo root
set -euo pipefail

DEPLOYER=$(dfx identity get-principal)

# moc-wrapper (installed by ic-mops) delegates to mops moc 1.3.0.
# That moc still needs aaaaa-aa.did in the --actor-idl directory for
# canisters that import ic:aaaaa-aa (e.g. caffeineai-http-outcalls).
mkdir -p .dfx/local/canisters/idl/
cp did/aaaaa-aa.did .dfx/local/canisters/idl/

# Deploy backend canisters explicitly — internet_identity and frontend are
# excluded because: (a) no backend canister imports II, (b) dfx deps pull
# fails on dfx 0.24.x with "dfx metadata not found" for the II canister.
dfx deploy auth --argument "(principal \"$DEPLOYER\")"
for canister in ai_proxy property job contractor quote payment photo \
  monitoring market report maintenance sensor listing agent fee bills recurring audit referrals; do
  dfx deploy "$canister"
done

# ── Bootstrap admin lists ────────────────────────────────────────────
# job/property/photo use a bootstrap-nonce pattern (H-20 fix):
# setBootstrapNonce must be called first; addAdmin requires the nonce on first call.
BOOTSTRAP_NONCE=$(openssl rand -hex 16)
for canister in property job photo; do
  dfx canister call "$canister" setBootstrapNonce "(\"$BOOTSTRAP_NONCE\")"
  dfx canister call "$canister" addAdmin "(principal \"$DEPLOYER\", \"$BOOTSTRAP_NONCE\")"
done
for canister in contractor quote report maintenance market sensor listing recurring bills monitoring referrals; do
  dfx canister call "$canister" addAdmin "(principal \"$DEPLOYER\")"
done
dfx canister call payment initAdmins "(vec { principal \"$DEPLOYER\" })" || true
dfx canister call agent   initAdmins "(vec { principal \"$DEPLOYER\" })" || true
dfx canister call fee     initAdmins "(vec { principal \"$DEPLOYER\" })" || true
dfx canister call payment grantSubscription "(principal \"$DEPLOYER\", variant { Pro })"

# ── Wire inter-canister IDs ──────────────────────────────────────────
AUTH_ID=$(dfx canister id auth)
PAYMENT_ID=$(dfx canister id payment)
PROPERTY_ID=$(dfx canister id property)
PHOTO_ID=$(dfx canister id photo)
QUOTE_ID=$(dfx canister id quote)
JOB_ID=$(dfx canister id job)
CONTRACTOR_ID=$(dfx canister id contractor)
SENSOR_ID=$(dfx canister id sensor)
REPORT_ID=$(dfx canister id report)
BILLS_ID=$(dfx canister id bills)
MAINTENANCE_ID=$(dfx canister id maintenance)
AUDIT_ID=$(dfx canister id audit)
REFERRALS_ID=$(dfx canister id referrals)
LISTING_ID=$(dfx canister id listing)
AGENT_ID=$(dfx canister id agent)
FEE_ID=$(dfx canister id fee)
MARKET_ID=$(dfx canister id market)

dfx canister call job         setPaymentCanisterId    "(\"$PAYMENT_ID\")"
dfx canister call property    setPaymentCanisterId    "(principal \"$PAYMENT_ID\")"
dfx canister call photo       setPaymentCanisterId    "(principal \"$PAYMENT_ID\")"
dfx canister call quote       setPaymentCanisterId    "(principal \"$PAYMENT_ID\")"
dfx canister call bills       setPaymentCanisterId    "(\"$PAYMENT_ID\")"
dfx canister call referrals   setPaymentCanisterId    "(\"$PAYMENT_ID\")"
dfx canister call payment     setReferralsCanisterId  "(\"$REFERRALS_ID\")"
dfx canister call job         setContractorCanisterId "(\"$CONTRACTOR_ID\")"
dfx canister call job         setPropertyCanisterId   "(\"$PROPERTY_ID\")"
dfx canister call photo       setPropertyCanisterId   "(principal \"$PROPERTY_ID\")"
dfx canister call quote       setPropertyCanisterId   "(principal \"$PROPERTY_ID\")"
dfx canister call maintenance setPropertyCanisterId   "(principal \"$PROPERTY_ID\")"
dfx canister call quote       setContractorCanisterId "(principal \"$CONTRACTOR_ID\")"
dfx canister call contractor  setJobCanisterId        "(\"$JOB_ID\")"
dfx canister call sensor      setJobCanisterId        "(\"$JOB_ID\")"
dfx canister call sensor      setPropertyCanisterId   "(\"$PROPERTY_ID\")"
dfx canister call report      setPropertyCanisterId   "(\"$PROPERTY_ID\")"
dfx canister call report      setSensorCanisterId     "(\"$SENSOR_ID\")"
dfx canister call report      setRiskJobCanisterId    "(\"$JOB_ID\")"
dfx canister call listing     setPropertyCanisterId   "(\"$PROPERTY_ID\")"
dfx canister call listing     setJobCanisterId        "(\"$JOB_ID\")"
dfx canister call listing     setReportCanisterId     "(\"$REPORT_ID\")"
dfx canister call listing     setMarketCanisterId     "(\"$MARKET_ID\")"
dfx canister call listing     setAgentCanisterId      "(\"$AGENT_ID\")"
dfx canister call listing     setFeeCanisterId        "(\"$FEE_ID\")"
dfx canister call agent       setListingCanisterId    "(\"$LISTING_ID\")"
dfx canister call fee         setListingCanisterId    "(\"$LISTING_ID\")"
dfx canister call market      setPropertyCanisterId   "(\"$PROPERTY_ID\")"
dfx canister call market      setJobCanisterId        "(\"$JOB_ID\")"

# ── Tier propagation wiring ──────────────────────────────────────────
# property/photo use nonce-gated addAdmin; DEPLOYER is already admin so
# adminInitialized=true — nonce param is required by Candid but ignored.
dfx canister call property addAdmin "(principal \"$PAYMENT_ID\", \"\")"
dfx canister call quote    addAdmin "(principal \"$PAYMENT_ID\")"
dfx canister call photo    addAdmin "(principal \"$PAYMENT_ID\", \"\")"
dfx canister call payment  setTierCanisterIds \
  "(principal \"$PROPERTY_ID\", principal \"$QUOTE_ID\", principal \"$PHOTO_ID\")"

# ── Trusted canister lists ───────────────────────────────────────────
dfx canister call payment    addTrustedCanister "(principal \"$JOB_ID\")"
dfx canister call payment    addTrustedCanister "(principal \"$PROPERTY_ID\")"
dfx canister call payment    addTrustedCanister "(principal \"$PHOTO_ID\")"
dfx canister call payment    addTrustedCanister "(principal \"$QUOTE_ID\")"
dfx canister call contractor addTrustedCanister "(principal \"$JOB_ID\")"
dfx canister call property   addTrustedCanister "(principal \"$JOB_ID\")"
dfx canister call property   addTrustedCanister "(principal \"$PHOTO_ID\")"
dfx canister call property   addTrustedCanister "(principal \"$QUOTE_ID\")"
dfx canister call property   addTrustedCanister "(principal \"$REPORT_ID\")"
dfx canister call job        addTrustedCanister "(principal \"$SENSOR_ID\")"

# ── Audit canister wiring ────────────────────────────────────────────
dfx canister call audit addAdmin "(principal \"$DEPLOYER\")"
dfx canister call audit addTrustedCanister "(principal \"$AUTH_ID\")"
dfx canister call audit addTrustedCanister "(principal \"$PAYMENT_ID\")"
dfx canister call audit addTrustedCanister "(principal \"$PROPERTY_ID\")"
dfx canister call audit addTrustedCanister "(principal \"$REPORT_ID\")"
dfx canister call audit addTrustedCanister "(principal \"$PHOTO_ID\")"
dfx canister call auth     setAuditCanisterId "(principal \"$AUDIT_ID\")"
dfx canister call payment  setAuditCanisterId "(principal \"$AUDIT_ID\")"
dfx canister call property setAuditCanisterId "(principal \"$AUDIT_ID\")"
dfx canister call report   setAuditCanisterId "(principal \"$AUDIT_ID\")"
dfx canister call photo    setAuditCanisterId "(principal \"$AUDIT_ID\")"
