#!/usr/bin/env bash
# HomeGentic — post-deploy smoke test against a live environment.
#
# Run by the deploy workflows right after scripts/deploy.sh, so a deploy that
# "succeeded" but left something down fails the run instead of being found by
# a user:
#   1. every canister for the environment is Running;
#   2. the deployed code answers: payment's pricing table (a read every
#      signed-out page makes) comes back non-empty;
#   3. the frontend canister serves the app's index page, plus the ICP MCP
#      manifest (matching canister_ids.json), a getApiDoc() answer from each
#      listed canister, and the II derivation origin;
#   4. with VOICE_AGENT_URL set, the voice Worker's /health is 200 (it checks
#      its own canister IDs and secrets).
#
# Usage:
#   ICP_ENV=testnet bash scripts/smoke-deployed.sh
#   VOICE_AGENT_URL=https://... ONLY=worker bash scripts/smoke-deployed.sh
#
# Environment:
#   ICP_ENV          canister_ids.json environment: ic or testnet (default ic)
#   VOICE_AGENT_URL  the voice Worker's base URL (optional)
#   ONLY=worker      check only the Worker (for the job that deploys it)
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."
source "$SCRIPT_DIR/lib/cycles.sh"   # ALL_CANISTERS, canister_id

ICP_ENV="${ICP_ENV:-ic}"
FAILED=()
fail() { echo "  ✗ $1"; FAILED+=("$1"); }

echo "============================================"
echo "  HomeGentic — Post-deploy smoke ($ICP_ENV)"
echo "============================================"

if [ "${ONLY:-}" != "worker" ]; then
  echo "▶ Canisters are running"
  for c in "${ALL_CANISTERS[@]}"; do
    if [ -z "$(canister_id "$c" "$ICP_ENV")" ]; then fail "$c has no ID for $ICP_ENV in canister_ids.json"; continue; fi
    state=$(icp canister status "$c" -e "$ICP_ENV" 2>&1 | grep -i "Status:" | head -1 | awk '{print $2}')
    if [ "$state" = "Running" ]; then echo "  ✓ $c"; else fail "$c is ${state:-unreachable}"; fi
  done

  echo "▶ Deployed code answers"
  pricing=$(icp canister call payment getAllPricing '()' -e "$ICP_ENV" 2>&1 || true)
  if [[ "$pricing" == *"tier"* ]]; then echo "  ✓ payment.getAllPricing"; else fail "payment.getAllPricing: $(printf '%s' "$pricing" | tail -1)"; fi

  echo "▶ Frontend serves the app"
  fe=$(canister_id frontend "$ICP_ENV")
  if [ -n "$fe" ]; then
    page=$(curl -fsS --max-time 30 "https://$fe.icp0.io/" 2>&1 || true)
    if [[ "$page" == *'id="root"'* ]]; then echo "  ✓ https://$fe.icp0.io/"; else fail "frontend https://$fe.icp0.io/ did not serve the app"; fi

    # ICP MCP (frontend/scripts/icArchitecture.mjs): the manifest is real JSON
    # (not the SPA shell) naming this environment's canisters, and each listed
    # canister answers getApiDoc().
    echo "▶ ICP MCP discoverability"
    if [ "${ICP_MCP_DISABLED:-}" = "1" ]; then
      echo "  - skipped: ICP_MCP_DISABLED=1, so the manifest isn't published"
    else
      manifest=$(curl -fsS --max-time 30 "https://$fe.icp0.io/.well-known/ic-architecture" 2>/dev/null || true)
      listed=$(python3 -c 'import json,sys; [print(c["name"], c["id"]) for c in json.loads(sys.argv[1])["canisters"]]' "$manifest" 2>/dev/null || true)
      if [ -z "$listed" ]; then
        fail "/.well-known/ic-architecture is missing or not JSON"
      else
        while read -r name id; do
          want=$(canister_id "$name" "$ICP_ENV")
          if [ "$id" != "$want" ]; then fail "ic-architecture lists $name as $id, canister_ids.json has ${want:-nothing}"; continue; fi
          doc=$(icp canister call "$name" getApiDoc '()' -e "$ICP_ENV" 2>&1 || true)
          if [[ "$doc" == *"HomeGentic"* ]]; then echo "  ✓ $name listed, getApiDoc answers"; else fail "$name.getApiDoc: $(printf '%s' "$doc" | tail -1)"; fi
        done <<<"$listed"
      fi
      origin=$(curl -fsS --max-time 30 "https://$fe.icp0.io/.well-known/ii-derivation-origin" 2>/dev/null | head -1 || true)
      if [ "$origin" = "https://$fe.icp0.io" ]; then echo "  ✓ ii-derivation-origin"; else fail "ii-derivation-origin is '${origin}', want https://$fe.icp0.io"; fi
    fi
  fi
fi

if [ -n "${VOICE_AGENT_URL:-}" ]; then
  echo "▶ Voice Worker is configured"
  # A fresh deploy can take a few seconds to reach every edge.
  for attempt in 1 2 3 4 5; do
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "${VOICE_AGENT_URL%/}/health" || true)
    [ "$code" = "200" ] && break
    sleep $(( attempt * 3 ))
  done
  if [ "$code" = "200" ]; then echo "  ✓ ${VOICE_AGENT_URL%/}/health"; else fail "voice Worker /health returned ${code:-nothing} (a missing secret or canister ID)"; fi
elif [ "${ONLY:-}" = "worker" ]; then
  fail "VOICE_AGENT_URL is not set"
fi

echo ""
if [ ${#FAILED[@]} -gt 0 ]; then
  echo "❌ Smoke test failed: ${#FAILED[@]} check(s)"
  exit 1
fi
echo "✅ Smoke test passed"
