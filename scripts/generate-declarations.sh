#!/usr/bin/env bash
# Regenerate frontend/src/declarations/ from Motoko source via dfx generate.
# Run this after adding or renaming any public function in a backend canister.
# Requires dfx to be installed: https://internetcomputer.org/docs/current/developer-docs/setup/install/
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if ! command -v dfx &>/dev/null; then
  echo "ERROR: dfx not found. Install from https://internetcomputer.org/docs/current/developer-docs/setup/install/" >&2
  exit 1
fi

cd "$ROOT"
dfx generate

echo "Done. Review changes in frontend/src/declarations/ and commit them."
