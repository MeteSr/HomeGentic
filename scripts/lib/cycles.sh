# shellcheck shell=bash
# HomeGentic — shared cycle policy and helpers.
#
# Sourced by deploy.sh (via cycles-balance-check.sh), check-cycle-health.sh
# and top-up-canisters.sh so the three agree on what "low" means.
#
# Thresholds are measured against each canister's own idle burn rather than a
# flat number: every canister runs with a 90-day freezing threshold, so it
# freezes once its balance drops below ~90 days of idle burn. A flat 500M
# "critical" line (the old value) sat far below that and fired only after the
# canister had already frozen. The absolute floors cover call/compute burn,
# which the idle figure doesn't include.

FREEZE_DAYS=90                       # freezing threshold set by deploy.sh
ALERT_MARGIN_DAYS=30                 # alert when < 30 days remain before freezing
TOPUP_MARGIN_DAYS=60                 # top up when < 60 days remain before freezing
TARGET_MARGIN_DAYS=180               # top up to 180 days past the freezing threshold
MIN_ALERT_CYCLES=1000000000000       # 1T  — alert floor
MIN_TOPUP_CYCLES=2000000000000       # 2T  — top-up floor
MIN_TARGET_CYCLES=5000000000000      # 5T  — top-up target floor

# Every canister the deploy creates, frontend included.
ALL_CANISTERS=(
  auth property job contractor quote payment photo
  report maintenance market sensor monitoring listing
  agent fee recurring bills ai_proxy audit referrals frontend
)

# canister_id <name> <env> — the ID recorded in canister_ids.json, or nothing.
canister_id() {
  python3 -c "import json,sys; d=json.load(open('canister_ids.json')); print(d.get(sys.argv[1],{}).get(sys.argv[2],''))" \
    "$1" "$2" 2>/dev/null || true
}

# cycles_read <status output> — sets CYC_BALANCE and CYC_IDLE_PER_DAY from
# `icp canister status` text ("  Cycles: 1_234", "  Idle cycles burned per day: 56").
# Returns 1 when the balance can't be parsed (not a controller, unreachable).
cycles_read() {
  CYC_BALANCE=$(printf '%s\n' "$1" | grep -iE '^[[:space:]]*Cycles:' | head -1 | awk '{print $2}' | tr -d '_,')
  CYC_IDLE_PER_DAY=$(printf '%s\n' "$1" | grep -iE '^[[:space:]]*Idle cycles burned per day:' | head -1 | awk '{print $NF}' | tr -d '_,')
  [[ "$CYC_IDLE_PER_DAY" =~ ^[0-9]+$ ]] || CYC_IDLE_PER_DAY=0
  [[ "$CYC_BALANCE" =~ ^[0-9]+$ ]]
}

_cyc_max() { if [ "$1" -gt "$2" ]; then echo "$1"; else echo "$2"; fi; }

# cycles_policy <balance> <idle per day> — sets CYC_ALERT_AT, CYC_TOPUP_AT,
# CYC_TARGET and CYC_RUNWAY_DAYS (days left before the freezing threshold
# bites, or "?" when the idle burn is unknown).
cycles_policy() {
  local balance=$1 idle=$2
  CYC_ALERT_AT=$(_cyc_max $(( idle * (FREEZE_DAYS + ALERT_MARGIN_DAYS) )) "$MIN_ALERT_CYCLES")
  CYC_TOPUP_AT=$(_cyc_max $(( idle * (FREEZE_DAYS + TOPUP_MARGIN_DAYS) )) "$MIN_TOPUP_CYCLES")
  CYC_TARGET=$(_cyc_max $(( idle * (FREEZE_DAYS + TARGET_MARGIN_DAYS) )) "$MIN_TARGET_CYCLES")
  if [ "$idle" -gt 0 ]; then
    CYC_RUNWAY_DAYS=$(( balance / idle - FREEZE_DAYS ))
  else
    CYC_RUNWAY_DAYS="?"
  fi
}

# cycles_t <n> — 1234567890000 → "1.23T"
cycles_t() { awk -v n="$1" 'BEGIN { printf "%.2fT", n / 1e12 }'; }
