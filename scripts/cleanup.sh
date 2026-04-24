#!/usr/bin/env bash
set -euo pipefail
echo "▶ Cleaning up local dfx environment..."
dfx stop 2>/dev/null || true
rm -rf .dfx/local
echo "✅ Cleanup complete!"
