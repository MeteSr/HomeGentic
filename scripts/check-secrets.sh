#!/usr/bin/env bash
# check-secrets.sh — 14.4.2 Secrets audit
#
# Scans staged files (pre-commit) or the full working tree (--all) for common
# secret patterns.  Exit code 1 means a potential secret was found.
#
# Usage:
#   bash scripts/check-secrets.sh          # check staged files only (pre-commit)
#   bash scripts/check-secrets.sh --all    # check full working tree

set -euo pipefail

ALL=false
if [[ "${1:-}" == "--all" ]]; then
  ALL=true
fi

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

# ── Patterns that must never appear in committed files ───────────────────────
# Each entry: "DESCRIPTION|REGEX"
PATTERNS=(
  "Anthropic API key|sk-ant-[A-Za-z0-9_-]{20,}"
  "OpenAI API key|sk-[A-Za-z0-9]{20,}"
  "AWS access key|AKIA[0-9A-Z]{16}"
  "Private key block|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY"
  "Generic secret assignment|(?i)(secret|password|passwd|api_?key)\s*=\s*['\"][^'\"]{8,}"
)

# ── File list ────────────────────────────────────────────────────────────────
if $ALL; then
  # Full tree, excluding known-safe paths
  FILES=$(git ls-files --cached --others --exclude-standard \
    | grep -vE '(node_modules|\.git|\.env\.example|package-lock\.json|yarn\.lock)' \
    || true)
else
  # Only staged files
  FILES=$(git diff --cached --name-only --diff-filter=ACM || true)
fi

if [[ -z "$FILES" ]]; then
  echo -e "${GREEN}check-secrets: no files to scan${NC}"
  exit 0
fi

FOUND=0
for pattern_entry in "${PATTERNS[@]}"; do
  DESCRIPTION="${pattern_entry%%|*}"
  REGEX="${pattern_entry##*|}"

  matches=$(echo "$FILES" \
    | xargs -I{} grep -PlI "$REGEX" {} 2>/dev/null || true)

  if [[ -n "$matches" ]]; then
    echo -e "${RED}SECRETS CHECK FAILED: $DESCRIPTION${NC}"
    echo "$matches"
    FOUND=1
  fi
done

if [[ $FOUND -eq 1 ]]; then
  echo -e "${RED}Potential secrets detected. Commit blocked.${NC}"
  exit 1
fi

echo -e "${GREEN}check-secrets: clean${NC}"
exit 0
