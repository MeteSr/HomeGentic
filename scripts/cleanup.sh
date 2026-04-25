#!/usr/bin/env bash
set -euo pipefail
echo "▶ Cleaning up local ICP environment..."
icp network stop 2>/dev/null || true
rm -rf .icp/cache
echo "✅ Cleanup complete!"
