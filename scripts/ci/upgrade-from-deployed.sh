#!/usr/bin/env bash
# Tests the upgrade a deploy is about to run: from the build that is running
# on the network to this checkout.
#
# The PR checks only upgrade from the PR's base branch, one merge at a time.
# The network can be many merges behind (a deploy that waited for approval,
# several allow-stable-break windows), and the one-time data moves in
# postupgrade only run against data from before them. This builds the last
# deployed commit (the newest `<prefix>-*` tag, which the deploy workflows
# push after a successful deploy) and runs the upgrade suites from it:
#
#   all-canisters.upgrade.test.ts   every canister keeps its data
#   seeded-upgrade.upgrade.test.ts  agent and bills, seeded by hand
#   from-base.upgrade.test.ts       in-depth reads, incl. the postupgrade moves
#   candid-compat.upgrade.test.ts   no method clients call changes incompatibly
#
# Usage: scripts/ci/upgrade-from-deployed.sh <tag-prefix>   (mainnet or testnet)
#   ALLOW_STABLE_BREAK=1 / ALLOW_CANDID_BREAK=1  report breaks without failing
#   (a planned reinstall, or every client updated first)
# With no such tag yet (nothing deployed through a tagging workflow), it says
# so and exits 0.
set -euo pipefail

PREFIX="${1:?usage: $0 <tag-prefix>}"
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

git fetch --quiet --depth=1 origin "refs/tags/${PREFIX}-*:refs/tags/${PREFIX}-*" 2>/dev/null || true
TAG=$(bash scripts/ci/deployed-ref.sh "$PREFIX")
if [ -z "$TAG" ]; then
  echo "No ${PREFIX}-* tag yet: nothing deployed to compare with, skipping."
  exit 0
fi
git fetch --quiet --depth=1 origin "refs/tags/$TAG:refs/tags/$TAG" 2>/dev/null || true
echo "Upgrading from $TAG ($(git rev-parse --short "$TAG^{commit}")) to $(git rev-parse --short HEAD)"

DEPLOYED_REF="$TAG" bash scripts/ci/build-upgrade-wasms.sh

cd tests/upgrade
[ -d node_modules ] || npm ci
if UPGRADE_BASE_DIR=.dfx/deployed npx vitest run all-canisters seeded-upgrade from-base candid-compat; then
  echo "✅ Every canister upgrades from $TAG"
elif [ "${ALLOW_STABLE_BREAK:-}" = "1" ]; then
  echo "::warning::Upgrading from $TAG fails (ALLOW_STABLE_BREAK=1, so not failing): those canisters need a reinstall"
else
  echo "::error::Upgrading from $TAG (what is deployed) fails. See docs/UPGRADE_RUNBOOK.md before deploying."
  exit 1
fi
