#!/usr/bin/env bash
# Stand-in for icp-cli in backup.test.mjs: keeps each canister's state, status
# and snapshots as files under $FAKE_ICP_STATE, so the backup and restore
# scripts' control flow can be tested without a replica. (PocketIC 0.21's
# management canister answers canister_status in a shape icp-cli 1.7 can't
# decode, so the real CLI can't be driven against it.)
set -euo pipefail
S="$FAKE_ICP_STATE"
args=()
while [ $# -gt 0 ]; do case "$1" in -n|-e|-k|--identity) shift 2 ;; *) args+=("$1"); shift ;; esac; done
set -- "${args[@]}"
echo "$*" >>"$S/calls.log"
[ "$1" = canister ] || exit 1
cmd="$2"; id="$3"; mkdir -p "$S/$id/snaps"
case "$cmd" in
  status) echo "Status: $(cat "$S/$id/status" 2>/dev/null || echo Running)"; echo "Module hash: 0xfeed" ;;
  stop) [ "${FAKE_FAIL_STOP:-}" = "$id" ] && exit 1; echo Stopped >"$S/$id/status" ;;
  start) echo Running >"$S/$id/status" ;;
  call) cat "$S/$id/data" ;;
  snapshot)
    sub="$3"; id="$4"; snap_arg="${5:-}"; mkdir -p "$S/$id/snaps"
    case "$sub" in
      create)
        [ "${FAKE_FAIL_SNAPSHOT:-}" = "$id" ] && { echo "snapshot failed" >&2; exit 1; }
        [ "$(cat "$S/$id/status")" = Stopped ] || { echo "not stopped" >&2; exit 1; }
        snap="0000$(date +%s%N)"; mkdir -p "$S/$id/snaps/$snap"; cp "$S/$id/data" "$S/$id/snaps/$snap/memory.bin"; echo '{}' >"$S/$id/snaps/$snap/metadata.json"; echo "$snap" ;;
      list) ls "$S/$id/snaps" ;;
      download) out=""; while [ $# -gt 0 ]; do [ "$1" = -o ] && out="$2"; shift; done
        mkdir -p "$out"; cp "$S/$id/snaps/$snap_arg/"* "$out/" ;;
      delete) rm -rf "${S:?}/$id/snaps/$snap_arg" ;;
      upload) in=""; while [ $# -gt 0 ]; do [ "$1" = -i ] && in="$2"; shift; done
        mkdir -p "$S/$id/snaps/up1"; cp "$in/"* "$S/$id/snaps/up1/"; echo up1 ;;
      restore) [ "$(cat "$S/$id/status")" = Stopped ] || { echo "not stopped" >&2; exit 1; }
        cp "$S/$id/snaps/$snap_arg/memory.bin" "$S/$id/data" ;;
      *) exit 1 ;;
    esac ;;
  *) exit 1 ;;
esac
