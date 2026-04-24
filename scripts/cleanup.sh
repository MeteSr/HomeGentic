#!/usr/bin/env bash
set -euo pipefail
ICP=$(command -v icp-cli 2>/dev/null || command -v dfx 2>/dev/null || echo dfx)
echo "▶ Cleaning up local replica environment..."
$ICP stop 2>/dev/null || true
rm -rf .dfx/local
echo "✅ Cleanup complete!"
