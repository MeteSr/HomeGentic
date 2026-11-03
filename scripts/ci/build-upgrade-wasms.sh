#!/usr/bin/env bash
# Builds canister Wasm for the PocketIC upgrade tests (tests/upgrade/).
#
#   .dfx/local/canisters/<name>/<name>.wasm   this checkout (what the tests upgrade to)
#   .dfx/base/canisters/<name>/<name>.wasm    BASE, when given (what they upgrade from)
#   .dfx/deployed/canisters/<name>/<name>.wasm DEPLOYED_REF, when set (the build
#                                              running on the network; see
#                                              upgrade-from-deployed.sh)
#
# Compiles with moc directly (same flags as mops.toml), so no replica or dfx is
# needed. Canisters missing at BASE are skipped there.
#
# Usage: scripts/ci/build-upgrade-wasms.sh [base-ref] [canister...]
#   MOC=/path/to/moc   moc binary (default: `mops toolchain bin moc`)
#   DEPLOYED_REF=<ref> also build that ref into .dfx/deployed/
#   With no canister names, builds every canister in mops.toml.
set -euo pipefail

BASE_REF="${1:-}"
shift || true
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

MOC="${MOC:-$(mops toolchain bin moc 2>/dev/null || true)}"
[ -x "$MOC" ] || { echo "❌ moc not found (set MOC or run: mops toolchain use moc <version>)"; exit 2; }

ALL=$(awk -F'"' '/^\[canisters\./{n=$0; sub(/^\[canisters\./,"",n); sub(/\].*/,"",n)} n!="" && /^main *=/{print n" "$2; n=""}' mops.toml)
if [ $# -gt 0 ]; then
  ALL=$(echo "$ALL" | awk -v want=" $* " 'index(want, " "$1" ")')
fi
[ -n "$ALL" ] || { echo "❌ no matching Motoko canisters in mops.toml"; exit 2; }

package_flags() {   # $1 tree — resolved in that tree so a mops.toml change is honoured
  (cd "$1" && { [ -d .mops ] || mops install >/dev/null 2>&1 || true; } && mops sources) | tr '\n' ' '
}

build_tree() {      # $1 tree, $2 output root
  local tree="$1" out="$2" pkgs
  pkgs=$(package_flags "$tree")
  while read -r name main; do
    if [ ! -f "$tree/$main" ]; then
      printf '  %-12s not in this tree — skipped\n' "$name"; continue
    fi
    mkdir -p "$out/$name"
    if ! log=$(cd "$tree" && "$MOC" --actor-idl did/ $pkgs "$main" -o "$out/$name/$name.wasm" 2>&1); then
      echo "❌ $name failed to compile in $tree"; echo "$log" | grep -v -e 'warning \[' -e '^help:'; exit 1
    fi
    printf '  %-12s ✓\n' "$name"
  done <<< "$ALL"
}

echo "Building $(git rev-parse --short HEAD) → .dfx/local/canisters"
build_tree "$REPO_ROOT" "$REPO_ROOT/.dfx/local/canisters"

# Test doubles for canisters HomeGentic calls but doesn't own (the ICP ledger,
# the exchange rate canister): tests/upgrade/mocks/<name>.mo →
# .dfx/local/canisters/mock_<name>/mock_<name>.wasm. Only this checkout's.
if [ $# -eq 0 ]; then
  MOCK_PKGS=$(package_flags "$REPO_ROOT")
  for src in "$REPO_ROOT"/tests/upgrade/mocks/*.mo; do
    [ -f "$src" ] || continue
    name="mock_$(basename "$src" .mo)"
    mkdir -p "$REPO_ROOT/.dfx/local/canisters/$name"
    # shellcheck disable=SC2086
    if ! log=$("$MOC" $MOCK_PKGS "$src" -o "$REPO_ROOT/.dfx/local/canisters/$name/$name.wasm" 2>&1); then
      echo "❌ $name failed to compile"; echo "$log"; exit 1
    fi
    printf '  %-12s ✓\n' "$name"
  done
fi

WORK=$(mktemp -d)
trap 'for t in "$WORK"/*/; do git worktree remove --force "$t" >/dev/null 2>&1; done; rm -rf "$WORK"' EXIT

build_ref() {       # $1 ref, $2 label, $3 output dir (under .dfx)
  local sha
  sha=$(git rev-parse --verify "$1^{commit}") || { echo "❌ unknown $2 ref: $1"; exit 2; }
  git worktree add --detach --quiet "$WORK/$2" "$sha"
  echo "Building $2 $(git rev-parse --short "$sha") → .dfx/$3/canisters"
  build_tree "$WORK/$2" "$REPO_ROOT/.dfx/$3/canisters"
}

if [ -n "$BASE_REF" ]; then build_ref "$BASE_REF" base base; fi
if [ -n "${DEPLOYED_REF:-}" ]; then build_ref "$DEPLOYED_REF" deployed deployed; fi
