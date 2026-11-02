#!/usr/bin/env bash
# Off-chain backups of every data canister (and the Fly relays' data files).
#
# For each canister: stop it, take a snapshot, start it again (a few seconds
# of downtime each), download the snapshot, delete it on-chain (so the one
# rolling pre-deploy snapshot deploy.sh keeps is the only one there), pack and
# encrypt it to BACKUP_AGE_RECIPIENT with age, and copy it to BACKUP_DEST.
# Backups older than BACKUP_RETENTION_DAYS are deleted from BACKUP_DEST.
# Run weekly by .github/workflows/backup.yml; restore with
# scripts/ops/restore-drill.sh (docs/INCIDENT_RUNBOOK.md, "Restore from an
# off-chain backup").
#
# Environment:
#   ICP_ENV               canister_ids.json environment: ic | testnet (default ic)
#   ICP_NETWORK_ARGS      icp-cli network flags (default "-n ic"; tests pass a local URL)
#   BACKUP_AGE_RECIPIENT  age public key (age1…). The private key is kept offline.
#   BACKUP_DEST           s3://bucket/prefix (R2, with AWS_* credentials and
#                         BACKUP_S3_ENDPOINT) or a local directory
#   BACKUP_RETENTION_DAYS default 35 (the Privacy Policy says backups are kept 35 days)
#   BACKUP_CANISTERS      space-separated subset (default: every data canister)
#   CANISTER_ID_<NAME>    overrides canister_ids.json (tests)
#   FLY_API_TOKEN         when set, also copies the relays' data files off their volumes
#   BACKUP_DATE           folder name (default: today, UTC)
#
# The active icp identity must control the canisters. Exits non-zero if any
# canister could not be backed up; the others still are.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/../.."
source scripts/lib/cycles.sh   # ALL_CANISTERS, canister_id

ICP_ENV="${ICP_ENV:-ic}"
read -r -a NET <<<"${ICP_NETWORK_ARGS:--n ic}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-35}"
DATE="${BACKUP_DATE:-$(date -u +%Y-%m-%d)}"
: "${BACKUP_AGE_RECIPIENT:?set BACKUP_AGE_RECIPIENT (age public key)}"
: "${BACKUP_DEST:?set BACKUP_DEST (s3://bucket/prefix or a directory)}"
command -v age >/dev/null || { echo "❌ age is not installed"; exit 2; }

if [ -n "${BACKUP_CANISTERS:-}" ]; then
  read -r -a CANISTERS <<<"$BACKUP_CANISTERS"
else
  CANISTERS=()
  for c in "${ALL_CANISTERS[@]}"; do [ "$c" = frontend ] || CANISTERS+=("$c"); done   # the asset canister is rebuilt from git
fi

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
DEST="${BACKUP_DEST%/}/$ICP_ENV/$DATE"

is_s3() { [[ "$BACKUP_DEST" == s3://* ]]; }
s3() { aws s3 ${BACKUP_S3_ENDPOINT:+--endpoint-url "$BACKUP_S3_ENDPOINT"} "$@"; }
put() {   # $1 local file, $2 name under $DEST
  if is_s3; then s3 cp --only-show-errors "$1" "$DEST/$2"; else mkdir -p "$DEST" && cp "$1" "$DEST/$2"; fi
}
seal() {  # $1 source dir or file, $2 output name (.tar.gz.age)
  tar -C "$(dirname "$1")" -czf - "$(basename "$1")" | age -r "$BACKUP_AGE_RECIPIENT" -o "$WORK/$2"
}

id_for() {
  local var="CANISTER_ID_$(echo "$1" | tr '[:lower:]' '[:upper:]')"
  if [ -n "${!var:-}" ]; then echo "${!var}"; else canister_id "$1" "$ICP_ENV"; fi
}

FAILED=()
MANIFEST="$WORK/manifest.tsv"
printf 'name\tcanister_id\tmodule_hash\tbytes\tsha256\n' >"$MANIFEST"

for name in "${CANISTERS[@]}"; do
  id=$(id_for "$name")
  if [ -z "$id" ]; then echo "  ⬜ $name: no ID for $ICP_ENV, skipped"; continue; fi
  log="$WORK/$name.log"
  echo -n "  $name ($id)... "
  hash=$(icp canister status "$id" "${NET[@]}" 2>>"$log" | awk -F': *' 'tolower($1) ~ /module hash/ {print $2; exit}')
  snap=""
  if icp canister stop "$id" "${NET[@]}" >>"$log" 2>&1; then
    snap=$(icp canister snapshot create "$id" -q "${NET[@]}" 2>>"$log" | tail -1)
  fi
  # Start again whatever happened: a backup must never leave a canister stopped.
  icp canister start "$id" "${NET[@]}" >>"$log" 2>&1 || { echo "✗ could not restart — START IT NOW"; cat "$log"; FAILED+=("$name(stopped!)"); continue; }
  if [ -z "$snap" ]; then echo "✗ no snapshot"; tail -5 "$log"; FAILED+=("$name"); continue; fi
  ok=1
  icp canister snapshot download "$id" "$snap" -o "$WORK/$name" "${NET[@]}" >>"$log" 2>&1 || ok=0
  icp canister snapshot delete "$id" "$snap" "${NET[@]}" >>"$log" 2>&1 || echo -n "(on-chain snapshot $snap not deleted) "
  if [ "$ok" = 1 ] && [ -f "$WORK/$name/metadata.json" ]; then
    seal "$WORK/$name" "$name.tar.gz.age" && rm -rf "${WORK:?}/$name" && put "$WORK/$name.tar.gz.age" "$name.tar.gz.age" || ok=0
  else
    ok=0
  fi
  if [ "$ok" = 1 ]; then
    bytes=$(stat -c %s "$WORK/$name.tar.gz.age")
    printf '%s\t%s\t%s\t%s\t%s\n' "$name" "$id" "${hash:-unknown}" "$bytes" "$(sha256sum "$WORK/$name.tar.gz.age" | cut -d' ' -f1)" >>"$MANIFEST"
    rm -f "$WORK/$name.tar.gz.age"
    echo "✓ $bytes bytes"
  else
    echo "✗ download/upload failed"; tail -5 "$log"; FAILED+=("$name")
  fi
done

# Fly relays: JSON data files on single-machine volumes. A file that doesn't
# exist yet (a vendor never connected) is skipped; the app needs at least one.
FLY=$(command -v fly || command -v flyctl || true)
if [ -n "${FLY_API_TOKEN:-}" ] && [ -n "$FLY" ]; then
  suffix=""; [ "$ICP_ENV" = testnet ] && suffix="-testnet"
  declare -A FLY_FILES=(
    ["homegentic-notifications$suffix"]="/data/notifications.json"
    ["homegentic-iot-gateway$suffix"]="/data/ecobee-tokens.json /data/honeywell-tokens.json /data/ge-tokens.json /data/tesla-session.json"
  )
  for app in "${!FLY_FILES[@]}"; do
    echo -n "  $app... "
    mkdir -p "$WORK/$app"
    for path in ${FLY_FILES[$app]}; do
      "$FLY" ssh sftp get --app "$app" "$path" "$WORK/$app/$(basename "$path")" >>"$WORK/$app.log" 2>&1 || true
    done
    if [ -n "$(find "$WORK/$app" -type f -size +0c | head -1)" ] && seal "$WORK/$app" "$app.tar.gz.age" && put "$WORK/$app.tar.gz.age" "$app.tar.gz.age"; then
      printf '%s\t%s\t-\t%s\t%s\n' "$app" "fly" "$(stat -c %s "$WORK/$app.tar.gz.age")" "$(sha256sum "$WORK/$app.tar.gz.age" | cut -d' ' -f1)" >>"$MANIFEST"
      echo "✓"
    else
      echo "✗"; tail -3 "$WORK/$app.log" 2>/dev/null; FAILED+=("$app")
    fi
  done
else
  echo "  FLY_API_TOKEN or flyctl missing: relay data files not backed up"
fi

{ echo "# commit $(git rev-parse --short=12 HEAD 2>/dev/null || echo unknown), $(date -u +%FT%TZ)"; cat "$MANIFEST"; } >"$WORK/manifest.tsv.txt"
put "$WORK/manifest.tsv.txt" "manifest.tsv"

# Retention: drop dated folders older than the cutoff.
cutoff=$(date -u -d "-$RETENTION_DAYS days" +%Y-%m-%d)
if is_s3; then
  for d in $(s3 ls "${BACKUP_DEST%/}/$ICP_ENV/" | awk '/PRE/ {sub("/","",$2); print $2}'); do
    [[ "$d" < "$cutoff" ]] && { echo "  deleting backup $d (older than $RETENTION_DAYS days)"; s3 rm --recursive --only-show-errors "${BACKUP_DEST%/}/$ICP_ENV/$d/"; }
  done
else
  for d in "${BACKUP_DEST%/}/$ICP_ENV"/*/; do
    d=$(basename "$d"); [[ "$d" < "$cutoff" ]] && { echo "  deleting backup $d"; rm -rf "${BACKUP_DEST%/}/$ICP_ENV/$d"; }
  done
fi

echo ""
if [ ${#FAILED[@]} -gt 0 ]; then echo "❌ Not backed up: ${FAILED[*]}"; exit 1; fi
echo "✅ Backup $ICP_ENV/$DATE complete"
