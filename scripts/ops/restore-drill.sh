#!/usr/bin/env bash
# Restores one canister from an off-chain backup made by backup-canisters.sh.
#
#   scripts/ops/restore-drill.sh <canister-name> <target-canister-id> [YYYY-MM-DD]
#
# The drill (run it once a quarter, and after changing the backup setup):
# restore into a scratch canister, never the live one, e.g. on a local network
#   icp network start -d && icp canister create --detached -n local   # prints an ID
#   ICP_NETWORK_ARGS="-n local" scripts/ops/restore-drill.sh job <that ID>
# and write down how long it took: that is the real recovery time.
#
# A real restore (docs/INCIDENT_RUNBOOK.md) targets the live canister and needs
# --production after the arguments. That replaces the canister's code and
# data with the backup's; everything written since the backup is lost.
#
# Environment:
#   BACKUP_DEST              same as for the backup (s3://… or a directory)
#   BACKUP_S3_ENDPOINT       R2 endpoint, with AWS_* credentials, for s3://
#   BACKUP_AGE_IDENTITY_FILE age private key file (kept offline; never in CI)
#   ICP_ENV                  which environment's backups to read (default ic)
#   ICP_NETWORK_ARGS         where the target canister is (default "-n ic")
#   VERIFY_QUERY             a no-argument query to call afterwards (default: the canister's metrics query)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/../.."
source scripts/lib/cycles.sh   # canister_id

NAME="${1:?usage: restore-drill.sh <canister-name> <target-canister-id> [date] [--production]}"
TARGET="${2:?target canister id}"
DATE="${3:-}"
[ "$DATE" = "--production" ] && DATE=""
PRODUCTION=0
for a in "$@"; do [ "$a" = "--production" ] && PRODUCTION=1; done
ICP_ENV="${ICP_ENV:-ic}"
read -r -a NET <<<"${ICP_NETWORK_ARGS:--n ic}"
: "${BACKUP_DEST:?set BACKUP_DEST}"
: "${BACKUP_AGE_IDENTITY_FILE:?set BACKUP_AGE_IDENTITY_FILE (the age private key)}"

for env in ic testnet; do
  if [ "$TARGET" = "$(canister_id "$NAME" "$env")" ] && [ "$PRODUCTION" != 1 ]; then
    echo "❌ $TARGET is the live $env $NAME canister. A drill restores into a scratch canister;"
    echo "   for a real restore add --production (see docs/INCIDENT_RUNBOOK.md)."
    exit 2
  fi
done

s3() { aws s3 ${BACKUP_S3_ENDPOINT:+--endpoint-url "$BACKUP_S3_ENDPOINT"} "$@"; }
ROOT="${BACKUP_DEST%/}/$ICP_ENV"
if [ -z "$DATE" ]; then
  if [[ "$BACKUP_DEST" == s3://* ]]; then
    DATE=$(s3 ls "$ROOT/" | awk '/PRE/ {sub("/","",$2); print $2}' | sort | tail -1)
  else
    DATE=$(ls "$ROOT" | sort | tail -1)
  fi
fi
[ -n "$DATE" ] || { echo "❌ no backups under $ROOT"; exit 1; }

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
START=$(date +%s)
echo "▶ $NAME from $ROOT/$DATE into $TARGET"
if [[ "$BACKUP_DEST" == s3://* ]]; then
  s3 cp --only-show-errors "$ROOT/$DATE/$NAME.tar.gz.age" "$WORK/"
  s3 cp --only-show-errors "$ROOT/$DATE/manifest.tsv" "$WORK/"
else
  cp "$ROOT/$DATE/$NAME.tar.gz.age" "$ROOT/$DATE/manifest.tsv" "$WORK/"
fi

want=$(awk -F'\t' -v n="$NAME" '$1 == n {print $5}' "$WORK/manifest.tsv")
got=$(sha256sum "$WORK/$NAME.tar.gz.age" | cut -d' ' -f1)
[ -n "$want" ] && [ "$want" = "$got" ] || { echo "❌ checksum mismatch (manifest ${want:-missing}, file $got)"; exit 1; }
echo "  ✓ checksum matches the manifest"

age -d -i "$BACKUP_AGE_IDENTITY_FILE" "$WORK/$NAME.tar.gz.age" | tar -C "$WORK" -xzf -
[ -f "$WORK/$NAME/metadata.json" ] || { echo "❌ the archive holds no snapshot"; exit 1; }
echo "  ✓ decrypted"

SNAP=$(icp canister snapshot upload "$TARGET" -i "$WORK/$NAME" -q "${NET[@]}" | tail -1)
echo "  ✓ uploaded as snapshot $SNAP"
icp canister stop "$TARGET" "${NET[@]}" >/dev/null
icp canister snapshot restore "$TARGET" "$SNAP" "${NET[@]}" >/dev/null
icp canister start "$TARGET" "${NET[@]}" >/dev/null
echo "  ✓ restored and started"
icp canister snapshot delete "$TARGET" "$SNAP" "${NET[@]}" >/dev/null || echo "  (uploaded snapshot $SNAP left on the canister)"

case "$NAME" in
  agent|audit|bills|fee|listing|referrals) DEFAULT_VERIFY=metrics ;;
  *) DEFAULT_VERIFY=getMetrics ;;
esac
VERIFY="${VERIFY_QUERY:-$DEFAULT_VERIFY}"
if icp canister call "$TARGET" "$VERIFY" '()' --query "${NET[@]}" >"$WORK/verify.txt" 2>&1; then
  echo "  ✓ $VERIFY answers:"; head -20 "$WORK/verify.txt" | sed 's/^/      /'
else
  echo "❌ $VERIFY failed after the restore:"; tail -5 "$WORK/verify.txt"; exit 1
fi
echo "✅ Restored $NAME ($DATE) in $(( $(date +%s) - START ))s"
