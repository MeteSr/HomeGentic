#!/usr/bin/env bash
set -euo pipefail
echo "▶ Cleaning up local icp-cli environment..."
icp-cli stop 2>/dev/null || true
rm -rf .icp-cli/local
echo "✅ Cleanup complete!"
