#!/usr/bin/env bash
# Fails if any canister's stable state can't be upgraded in place from BASE.
#
# Motoko (enhanced orthogonal persistence) refuses an upgrade whose stable
# variables aren't compatible with the running version — e.g. a new field on a
# record stored in a Map. The deploy then fails with "RTS error:
# Memory-incompatible program upgrade", and the only way out is a reinstall
# that wipes the canister's data. This catches that at PR time instead.
#
# For every canister in icp.yaml it compiles BASE and HEAD with
# `moc --stable-types` and runs `moc --stable-compatible base.most head.most`.
# New canisters (no main.mo at BASE) are skipped.
#
# Usage: scripts/ci/check-stable-compat.sh <base-ref>
#   MOC=/path/to/moc        moc binary (default: `mops toolchain bin moc`)
#   ALLOW_STABLE_BREAK=1    report incompatibilities without failing
set -uo pipefail

BASE_REF="${1:?usage: $0 <base-ref>}"
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

MOC="${MOC:-$(mops toolchain bin moc 2>/dev/null || true)}"
[ -x "$MOC" ] || { echo "❌ moc not found (set MOC or run: mops toolchain use moc <version>)"; exit 2; }

BASE_SHA=$(git rev-parse --verify "$BASE_REF^{commit}") || { echo "❌ unknown base ref: $BASE_REF"; exit 2; }
WORK=$(mktemp -d)
BASE_TREE="$WORK/base"
trap 'git worktree remove --force "$BASE_TREE" >/dev/null 2>&1; rm -rf "$WORK"' EXIT
git worktree add --detach --quiet "$BASE_TREE" "$BASE_SHA"

# Package flags for a tree, resolved in that tree so a mops.toml change is honoured.
package_flags() {
  (cd "$1" && { [ -d .mops ] || mops install >/dev/null 2>&1 || true; } && mops sources) | tr '\n' ' '
}
HEAD_PKGS=$(package_flags "$REPO_ROOT")
BASE_PKGS=$(package_flags "$BASE_TREE")

# Writes <out>.most; echoes moc's output on failure.
stable_types() {   # $1 tree, $2 main.mo (relative), $3 package flags, $4 out prefix
  (cd "$1" && "$MOC" --stable-types --actor-idl did/ $3 "$2" -o "$4.wasm" 2>&1 >/dev/null) \
    || return 1
  [ -f "$4.most" ]
}

CANISTERS=$(awk '/^canisters:/{p=1;next} /^[a-z]/{p=0} p && /^  - name:/{n=$3} p && /main:/{print n" "$2}' icp.yaml)
[ -n "$CANISTERS" ] || { echo "❌ no Motoko canisters found in icp.yaml"; exit 2; }

echo "Stable-memory compatibility: $(git rev-parse --short "$BASE_SHA") → $(git rev-parse --short HEAD)"
declare -a BROKEN=() ERRORED=()
SUMMARY="| Canister | Result |\n|---|---|\n"

while read -r name main; do
  if [ ! -f "$BASE_TREE/$main" ]; then
    printf '  %-12s new canister — skipped\n' "$name"
    SUMMARY+="| $name | new — skipped |\n"; continue
  fi
  if ! err=$(stable_types "$BASE_TREE" "$main" "$BASE_PKGS" "$WORK/$name.base"); then
    printf '  %-12s ⚠ base does not compile — skipped\n' "$name"
    SUMMARY+="| $name | base doesn't compile — skipped |\n"; continue
  fi
  if ! err=$(stable_types "$REPO_ROOT" "$main" "$HEAD_PKGS" "$WORK/$name.head"); then
    printf '  %-12s ❌ head does not compile\n%s\n' "$name" "$err"
    ERRORED+=("$name"); SUMMARY+="| $name | ❌ head doesn't compile |\n"; continue
  fi
  if out=$("$MOC" --stable-compatible "$WORK/$name.base.most" "$WORK/$name.head.most" 2>&1); then
    printf '  %-12s ✓\n' "$name"
    SUMMARY+="| $name | ✓ compatible |\n"
  else
    printf '  %-12s ❌ incompatible\n%s\n' "$name" "$(echo "$out" | sed 's/^/      /')"
    BROKEN+=("$name"); SUMMARY+="| $name | ❌ **incompatible** |\n"
  fi
done <<< "$CANISTERS"

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  { echo "### Stable-memory compatibility"; echo; echo -e "$SUMMARY"; } >> "$GITHUB_STEP_SUMMARY"
fi

if [ ${#ERRORED[@]} -gt 0 ]; then
  echo "❌ Could not compile: ${ERRORED[*]}"; exit 1
fi
if [ ${#BROKEN[@]} -gt 0 ]; then
  cat <<EOF

❌ Upgrading ${BROKEN[*]} would trap with "Memory-incompatible program upgrade",
   and recovering means reinstalling — deleting that canister's data.

   Keep stable state compatible instead:
   - store new data in a new stable Map/var rather than adding a field to a
     record, or a tag to a variant, that is already stored (even an optional
     field breaks records held in a Map), or
   - convert the existing data with a migration function:
     (with migration = ...) persistent actor { ... }
     https://internetcomputer.org/docs/motoko/fundamentals/actors/compatibility

   If a reinstall is genuinely intended, add the 'allow-stable-break' label to
   the PR and say in the description which data will be lost.
EOF
  if [ "${ALLOW_STABLE_BREAK:-}" = "1" ]; then
    echo "⚠ allow-stable-break is set — reporting without failing."; exit 0
  fi
  exit 1
fi
echo "✅ All canisters can be upgraded in place."
