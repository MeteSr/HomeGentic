#!/usr/bin/env bash
# Fails when any canister compiles with a Motoko warning that isn't listed in
# scripts/ci/motoko-warnings-allowed.txt. New code should be warning-free;
# the allow-list holds the few that can't be fixed without a stable break.
#
#   MOC=/path/to/moc            moc binary (default: `mops toolchain bin moc`)
#   MOC_PACKAGES="--package …"  package flags (default: `mops sources`)
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
MOC="${MOC:-$(mops toolchain bin moc 2>/dev/null || true)}"
[ -x "$MOC" ] || { echo "❌ moc not found (set MOC or run: mops toolchain use moc <version>)"; exit 2; }
PKGS="${MOC_PACKAGES:-$(mops sources | tr '\n' ' ')}"
ALLOW=scripts/ci/motoko-warnings-allowed.txt

allowed() {  # canister code identifier
  awk -v c="$1" -v w="$2" -v id="$3" '
    /^[[:space:]]*(#|$)/ { next }
    ($1 == c || $1 == "*") && $2 == w && ($3 == id || $3 == "*") { found = 1 }
    END { exit found ? 0 : 1 }' "$ALLOW"
}

fail=0
for main in backend/*/main.mo; do
  c=$(basename "$(dirname "$main")")
  # shellcheck disable=SC2086  # PKGS is a list of flags
  out=$("$MOC" --check $PKGS --actor-idl did/ "$main" 2>&1 || true)
  while IFS= read -r line; do
    code=$(grep -oE '\[M[0-9]+\]' <<<"$line" | tr -d '[]')
    # The identifier: M0244 names it in plain text, the others in backquotes.
    id=$(sed -nE 's/.*variable ([A-Za-z_0-9]+) is never reassigned.*/\1/p' <<<"$line")
    [ -n "$id" ] || id=$(grep -oE '`[^`]+`' <<<"$line" | head -1 | tr -d '`' || true)
    if ! allowed "$c" "$code" "${id:-?}"; then
      echo "$line"
      fail=1
    fi
  done < <(grep -E 'warning \[M[0-9]+\]' <<<"$out" || true)
done

if [ "$fail" -ne 0 ]; then
  echo
  echo "❌ Motoko warnings above. Fix them, or (only if the fix is a stable break) add them to $ALLOW."
  exit 1
fi
echo "✅ No Motoko warnings outside the allow-list"
