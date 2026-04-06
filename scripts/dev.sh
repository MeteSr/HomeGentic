#!/usr/bin/env bash
# scripts/dev.sh — full local dev stack
#
# Starts every piece of the application in one terminal:
#   • dfx local replica + all 15 canisters (via scripts/deploy.sh)
#   • frontend Vite dev server        → http://localhost:5173
#   • voice agent Express proxy       → http://localhost:3001
#   • admin dashboard Vite dev server → http://localhost:3002
#
# Ctrl+C kills all background processes cleanly.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PIDS=()

# ── Colour helpers ─────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

header()  { echo -e "\n${BOLD}${CYAN}══ $* ══${RESET}"; }
ok()      { echo -e "  ${GREEN}✓${RESET} $*"; }
warn()    { echo -e "  ${YELLOW}⚠${RESET}  $*"; }
error()   { echo -e "  ${RED}✗${RESET} $*"; }
label()   { printf "${BOLD}%-12s${RESET} │ " "$1"; }

# ── Cleanup on exit ────────────────────────────────────────────────────────────
cleanup() {
  echo -e "\n${YELLOW}Shutting down…${RESET}"
  for pid in "${PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null && ok "killed PID $pid"
    fi
  done
  wait 2>/dev/null || true
  echo -e "${GREEN}All processes stopped.${RESET}"
}
trap cleanup SIGINT SIGTERM EXIT

# ── 1. dfx replica ────────────────────────────────────────────────────────────
header "dfx local replica"
cd "$REPO_ROOT"

if dfx ping --network local >/dev/null 2>&1; then
  ok "dfx is already running — skipping start"
else
  echo "  Starting dfx..."
  dfx start --background --clean
  ok "dfx started"
fi

# ── 2. Deploy all canisters ───────────────────────────────────────────────────
header "Deploying canisters"
bash "$REPO_ROOT/scripts/deploy.sh" local
ok "All canisters deployed"

# ── 3. Install dependencies (skip if node_modules up to date) ─────────────────
header "Checking dependencies"

maybe_install() {
  local dir="$1" name="$2"
  if [ ! -d "$dir/node_modules" ] || [ "$dir/package.json" -nt "$dir/node_modules/.package-lock.json" ]; then
    echo "  Installing $name dependencies..."
    npm install --prefix "$dir" --silent
    ok "$name deps installed"
  else
    ok "$name deps up to date"
  fi
}

maybe_install "$REPO_ROOT/frontend"       "frontend"
maybe_install "$REPO_ROOT/agents/voice"   "voice agent"
maybe_install "$REPO_ROOT/dashboard"      "dashboard"

# ── 4. Launch background services with labelled log output ────────────────────
header "Starting services"

# Shared log FIFO — all three services write here with a prefix label
LOG_DIR=$(mktemp -d /tmp/homegentic-dev-XXXXXX)
FRONTEND_LOG="$LOG_DIR/frontend"
VOICE_LOG="$LOG_DIR/voice"
DASHBOARD_LOG="$LOG_DIR/dashboard"
mkfifo "$FRONTEND_LOG" "$VOICE_LOG" "$DASHBOARD_LOG"

# Label and colour each service's stdout
(sed -u "s/^/$(printf "${GREEN}frontend ${RESET}│ ")/" < "$FRONTEND_LOG") &
(sed -u "s/^/$(printf "${CYAN}voice     ${RESET}│ ")/" < "$VOICE_LOG") &
(sed -u "s/^/$(printf "${YELLOW}dashboard ${RESET}│ ")/" < "$DASHBOARD_LOG") &

# Frontend (Vite, port 5173)
(cd "$REPO_ROOT/frontend" && npm run dev 2>&1) > "$FRONTEND_LOG" &
PIDS+=($!)
ok "frontend    started (PID ${PIDS[-1]})"

# Voice agent (ts-node, port 3001)
(cd "$REPO_ROOT/agents/voice" && npm run dev 2>&1) > "$VOICE_LOG" &
PIDS+=($!)
ok "voice agent started (PID ${PIDS[-1]})"

# Dashboard (Vite, port 3002)
(cd "$REPO_ROOT/dashboard" && npm run dev 2>&1) > "$DASHBOARD_LOG" &
PIDS+=($!)
ok "dashboard   started (PID ${PIDS[-1]})"

# ── 5. Summary ────────────────────────────────────────────────────────────────
echo -e "
${BOLD}${GREEN}══════════════════════════════════════════════${RESET}
${BOLD}  HomeGentic local stack is running${RESET}
${BOLD}${GREEN}══════════════════════════════════════════════${RESET}

  $(label "frontend")http://localhost:5173
  $(label "voice agent")http://localhost:3001
  $(label "dashboard")http://localhost:3002
  $(label "ICP replica")http://localhost:4943

  Press ${BOLD}Ctrl+C${RESET} to stop all services.
${BOLD}${GREEN}══════════════════════════════════════════════${RESET}
"

# ── 6. Wait — forward combined log output until Ctrl+C ────────────────────────
wait "${PIDS[@]}"
