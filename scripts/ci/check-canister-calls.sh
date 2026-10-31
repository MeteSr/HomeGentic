#!/usr/bin/env bash
# Fails if a canister calls another through an actor type that doesn't match
# the callee's real interface (scripts/ci/check-canister-calls.mjs): a renamed
# method, a changed field, a variant tag the caller can't decode, or a
# composite query called from an update.
#
#   MOC=/path/to/moc   moc binary (default: `mops toolchain bin moc`)
#
# Needs @icp-sdk/core installed at the repo root or in frontend/ (set
# CANDID_FROM to another folder that has it).
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
MOC="${MOC:-$(mops toolchain bin moc 2>/dev/null || true)}"
[ -x "$MOC" ] || { echo "❌ moc not found (set MOC or run: mops toolchain use moc <version>)"; exit 2; }
PKGS="${MOC_PACKAGES:-$(mops sources | tr '\n' ' ')}"

if [ -z "${CANDID_FROM:-}" ]; then
  for d in . frontend; do
    if [ -d "$d/node_modules/@icp-sdk/core" ]; then CANDID_FROM="$PWD/$d"; break; fi
  done
fi
[ -n "${CANDID_FROM:-}" ] || { echo "❌ @icp-sdk/core not installed (npm ci at the root or in frontend/)"; exit 2; }
export CANDID_FROM

DID=$(mktemp -d)
trap 'rm -rf "$DID"' EXIT
for main in backend/*/main.mo; do
  c=$(basename "$(dirname "$main")")
  "$MOC" --idl --hide-warnings --actor-idl did/ $PKGS "$main" -o "$DID/$c.did"
done

# shellcheck disable=SC2086
node scripts/ci/check-canister-calls.mjs "$DID" "$MOC" $PKGS
