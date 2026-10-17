#!/usr/bin/env bash
# Builds canister Wasm for the PocketIC upgrade tests (tests/upgrade/).
#
#   .dfx/local/canisters/<name>/<name>.wasm   this checkout (what the tests upgrade to)
#   .dfx/base/canisters/<name>/<name>.wasm    BASE, when given (what they upgrade from)
#
# Compiles with moc directly (same flags as icp.yaml), so no replica or dfx is
# needed. Canisters missing at BASE are skipped there.
#
# Usage: scripts/ci/build-upgrade-wasms.sh [base-ref] [canister...]
#   MOC=/path/to/moc   moc binary (default: `mops toolchain bin moc`)
#   With no canister names, builds every canister in icp.yaml.
set -euo pipefail

BASE_REF="${1:-}"
shift || true
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

MOC="${MOC:-$(mops toolchain bin moc 2>/dev/null || true)}"
[ -x "$MOC" ] || { echo "❌ moc not found (set MOC or run: mops toolchain use moc <version>)"; exit 2; }

ALL=$(awk '/^canisters:/{p=1;next} /^[a-z]/{p=0} p && /^  - name:/{n=$3} p && /main:/{print n" "$2}' icp.yaml)
if [ $# -gt 0 ]; then
  ALL=$(echo "$ALL" | awk -v want=" $* " 'index(want, " "$1" ")')
fi
[ -n "$ALL" ] || { echo "❌ no matching Motoko canisters in icp.yaml"; exit 2; }

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

if [ -n "$BASE_REF" ]; then
  BASE_SHA=$(git rev-parse --verify "$BASE_REF^{commit}") || { echo "❌ unknown base ref: $BASE_REF"; exit 2; }
  WORK=$(mktemp -d)
  trap 'git worktree remove --force "$WORK/base" >/dev/null 2>&1; rm -rf "$WORK"' EXIT
  git worktree add --detach --quiet "$WORK/base" "$BASE_SHA"
  echo "Building base $(git rev-parse --short "$BASE_SHA") → .dfx/base/canisters"
  build_tree "$WORK/base" "$REPO_ROOT/.dfx/base/canisters"
fi
