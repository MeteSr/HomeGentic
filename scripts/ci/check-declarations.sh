#!/usr/bin/env bash
# Fails if packages/shared/src/declarations/ drifts from the canisters: builds
# each canister's Candid interface with moc and checks every declared method
# against it (scripts/ci/check-declarations.mjs).
#
#   MOC=/path/to/moc   moc binary (default: `mops toolchain bin moc`)
#
# Needs Node 22.6+ (type stripping) and @icp-sdk/core installed at the repo
# root or in frontend/ (set CANDID_FROM to another folder that has it).
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
for f in packages/shared/src/declarations/*.ts; do
  c=$(basename "$f" .ts)
  [ -f "backend/$c/main.mo" ] || continue
  "$MOC" --idl --hide-warnings --actor-idl did/ $PKGS "backend/$c/main.mo" -o "$DID/$c.did"
done

node --experimental-strip-types --no-warnings scripts/ci/check-declarations.mjs "$DID"
