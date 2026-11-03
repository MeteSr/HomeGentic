#!/usr/bin/env bash
# Prints the newest local tag named <prefix>-YYYYMMDD-HHMMSS (the deploy
# workflows push one after each successful deploy), or nothing.
#
# Usage: scripts/ci/deployed-ref.sh <prefix>     e.g. mainnet, testnet
set -euo pipefail
PREFIX="${1:?usage: $0 <prefix>}"
git tag -l "${PREFIX}-*" | grep -E "^${PREFIX}-[0-9]{8}-[0-9]{6}$" | sort -r | head -1 || true
