#!/usr/bin/env bash
# Runs Motoko unit tests (backend/**/test/*.test.mo) in the moc interpreter.
# A test file is a plain Motoko program; a failed `assert` fails the run.
#
#   MOC=/path/to/moc   moc binary (default: `mops toolchain bin moc`)
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
MOC="${MOC:-$(mops toolchain bin moc 2>/dev/null || true)}"
[ -x "$MOC" ] || { echo "❌ moc not found (set MOC or run: mops toolchain use moc <version>)"; exit 2; }
PKGS=$(mops sources | tr '\n' ' ')

status=0
while read -r t; do
  if "$MOC" -r $PKGS "$t"; then echo "✓ $t"; else echo "❌ $t"; status=1; fi
done < <(find backend -path '*/test/*.test.mo' | sort)
exit $status
