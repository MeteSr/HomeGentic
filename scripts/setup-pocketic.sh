#!/usr/bin/env bash
# ── setup-pocketic.sh ──────────────────────────────────────────────────────────
# Downloads the PocketIC server binary into ~/.local/bin and prints the export
# command to add to your shell profile.
#
# Run this once in WSL:
#   bash scripts/setup-pocketic.sh
#
# Then install upgrade test deps:
#   cd tests/upgrade && npm install
#
# Then run the upgrade tests:
#   cd tests/upgrade && POCKET_IC_BIN=~/.local/bin/pocket-ic npm test
# ──────────────────────────────────────────────────────────────────────────────

set -euo pipefail

INSTALL_DIR="$HOME/.local/bin"
BINARY="$INSTALL_DIR/pocket-ic"
RELEASE_URL="https://github.com/dfinity/pocketic/releases/latest/download/pocket-ic-x86_64-linux.gz"

echo "▶ Creating $INSTALL_DIR if needed..."
mkdir -p "$INSTALL_DIR"

echo "▶ Downloading PocketIC server binary..."
curl -fsSL "$RELEASE_URL" | gunzip > "$BINARY"
chmod +x "$BINARY"

echo "▶ Verifying binary..."
"$BINARY" --version

echo ""
echo "✓ PocketIC installed at $BINARY"
echo ""
echo "Add to ~/.bashrc or ~/.zshrc:"
echo "  export POCKET_IC_BIN=$BINARY"
echo ""
echo "Or set it inline when running tests:"
echo "  POCKET_IC_BIN=$BINARY npm test"
