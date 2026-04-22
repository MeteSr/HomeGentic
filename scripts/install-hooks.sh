#!/usr/bin/env bash
# install-hooks.sh — install local Git hooks for this repository.
#
# Run once after cloning:
#   bash scripts/install-hooks.sh
#
# The pre-commit hook calls scripts/check-secrets.sh to block commits that
# contain secrets (API keys, private key blocks, generic password assignments).

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
HOOKS_DIR="$REPO_ROOT/.git/hooks"
HOOK_FILE="$HOOKS_DIR/pre-commit"

cat > "$HOOK_FILE" <<'EOF'
#!/usr/bin/env bash
# Pre-commit: block commits that contain common secret patterns.
set -euo pipefail
REPO_ROOT="$(git rev-parse --show-toplevel)"
exec bash "$REPO_ROOT/scripts/check-secrets.sh"
EOF

chmod +x "$HOOK_FILE"
echo "Pre-commit hook installed at $HOOK_FILE"
