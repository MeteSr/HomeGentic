# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
```bash
make dev          # Start local ICP replica, deploy all canisters, run frontend (all-in-one)
make start        # dfx start --background (replica only)
make deploy       # bash scripts/deploy.sh (all 13 canisters)
make frontend     # cd frontend && npm run dev (Vite dev server at :5173)
```

The voice agent runs separately:
```bash
cd agents/voice && npm install && npm run dev   # Express proxy at :3001
```

### Testing
```bash
# Unit tests (Vitest)
cd frontend && npm run test:unit
cd frontend && npm run test:unit:watch
cd frontend && npm run test:unit:coverage

# E2E tests (Playwright — requires running replica + frontend)
npm run test:e2e
npm run test:e2e:ui

# Backend canister tests (bash, requires deployed canisters)
make test                  # alias for bash scripts/test-backend.sh
```

### Canister operations
```bash
make status       # Show canister IDs and health
make upgrade      # Safe canister upgrade (preserves state)
make clean        # Reset local dfx state
bash scripts/init-test-data.sh   # Seed test users and properties
```

### Frontend build
```bash
cd frontend && npm run build    # Outputs to frontend/dist/ (served by assets canister)
dfx generate                    # Regenerate Candid bindings after .mo changes
```

## Architecture

### Monorepo Layout

```
backend/          13 Motoko canisters (each has main.mo)
frontend/         React + TypeScript SPA (Vite)
agents/voice/     Node.js/Express proxy for Claude voice agent
agents/iot-gateway/  IoT event ingestion (future)
dashboard/        Standalone monitoring SPA (admin use)
tests/e2e/        Playwright tests
scripts/          Bash deploy/upgrade/test scripts
docs/             ARCHITECTURE.md, API.md, DEPLOYMENT.md, SECURITY.md
```

### ICP Canister Map

All 13 canisters use `persistent actor` + stable variable preupgrade/postupgrade for state across upgrades. HashMap for in-memory lookups, stable arrays for persistence. Each exports a `metrics()` query and `pause()`/`unpause()` admin capability.

| Canister | Responsibility |
|---|---|
| **auth** | User profiles, roles (Homeowner / Contractor / Realtor) |
| **property** | Registration, ownership verification (Unverified → PendingReview → Basic → Premium), 7-day conflict window |
| **job** | Maintenance records, dual-signature verification (homeowner + contractor, or DIY homeowner-only) |
| **contractor** | Profiles, trust scores, rate-limited reviews (10/day/user, composite key deduplication) |
| **quote** | Quote requests & contractor bids, tier-enforced open-request limits |
| **payment** | Subscription tier management & expiry |
| **photo** | SHA-256 deduplication, tier-based quotas, multi-approval for sensitive records |
| **price** | Static pricing table (read-only, no state) |
| **report** | Immutable report snapshots, share links with visibility levels & revocation |
| **market** | ROI-ranked project recommendations (2024 Remodeling Magazine data) |
| **maintenance** | Predictive scheduling, system lifespan estimates, seasonal task generation |
| **sensor** | IoT device registry, auto-creates pending jobs for Critical events |
| **monitoring** | Cycles usage, cost metrics, profitability (ARPU/LTV/CAC), alerting |

### Tier System (enforced server-side in multiple canisters)

| Tier | Properties | Photos/Job | Open Quotes | Price |
|---|---|---|---|---|
| Free | 1 | 5 | 3 | $0 |
| Pro | 5 | 20 | 10 | $9/mo |
| Premium | 25 | unlimited | 10 | $49/yr |
| ContractorPro | unlimited | 50 | unlimited | $29/mo |

### Frontend Service Layer

`frontend/src/services/actor.ts` creates the ICP `HttpAgent`. In local dev it uses a fixed-seed Ed25519 identity to survive hot-reloads without re-authenticating. In production it uses `@dfinity/auth-client` (Internet Identity).

Each service file (e.g. `job.ts`, `property.ts`) contains the Candid IDL factory inline and a mock-fallback pattern:
```typescript
if (!CANISTER_ID) return mockData;   // canister not deployed → use mock
```
Canister IDs come from `vite.config.ts` `define` block mapping `CANISTER_ID_*` env vars (written to `.env` by `scripts/deploy.sh`).

### State Management

Zustand stores in `frontend/src/store/`:
- `authStore` — `isAuthenticated`, `principal`, `profile`, `isLoading`
- `propertyStore` — cached `properties[]`
- `jobStore` — cached `jobs[]`

Auth flow: `AuthContext.tsx` wraps the app and exposes `login()` / `devLogin()` / `logout()`. `devLogin()` skips Internet Identity (only available when `import.meta.env.DEV`).

### Voice Agent

`agents/voice/server.ts` (Express, port 3001) exposes:
- `POST /api/chat` — SSE streaming chat (max 200 tokens, 2-3 sentence voice responses)
- `POST /api/agent` — Agentic tool-use loop returning tool_calls or final answer

The frontend `useVoiceAgent` hook (`frontend/src/hooks/useVoiceAgent.ts`) handles:
1. Web Speech API → user speech captured
2. `buildContext()` fetches live properties + jobs from ICP canisters
3. POST to `/api/agent` with context
4. SSE stream → text chunks rendered in speech bubble
5. Browser `SpeechSynthesis` reads the full response aloud
6. Max 5 agentic turns per interaction for safety

Tool definitions for Claude live in `frontend/src/services/agentTools.ts` (frontend side, used for UI) and `agents/voice/tools.ts` (server side, sent to Claude API). Requires `ANTHROPIC_API_KEY` in `.env`.

### Design System

The app uses an editorial "blueprint" aesthetic — no CSS framework. All styling is inline React styles. Key tokens (defined as `const S = {...}` at the top of each component file):

```typescript
ink: "#0E0E0C"      // Near-black text
paper: "#F4F1EB"    // Warm off-white background
rule: "#C8C3B8"     // Warm gray borders
rust: "#C94C2E"     // Rust red — primary accent
inkLight: "#7A7268" // Muted text
serif: "'Playfair Display', Georgia, serif"   // Headings (700/900 weight)
mono: "'IBM Plex Mono', monospace"            // Labels, nav, code
sans: "'IBM Plex Sans', sans-serif"           // Body text (weight 300–500)
```

Rules: **no border-radius anywhere** (sharp editorial corners), borders are `1px solid #C8C3B8`, section labels are mono uppercase ~0.65rem with letter-spacing. Google Fonts loaded in `frontend/index.html`.

Shared styled components: `Button.tsx`, `Badge.tsx`, `Layout.tsx`, `VoiceAgent.tsx`.

### E2E Testing Notes

Playwright tests use `window.__e2e_properties` and similar globals to inject mock data — the service layer checks for these before making canister calls. See `tests/e2e/helpers/testData.ts` for the injection pattern.

### Environment Variables

Copy `.env.example` to `.env`. Key vars:
```
DFX_NETWORK=local
ANTHROPIC_API_KEY=sk-ant-...     # Required for voice agent
VOICE_AGENT_PORT=3001
FRONTEND_ORIGIN=http://localhost:3000
VITE_VOICE_AGENT_URL=http://localhost:3001
```
Canister IDs (`CANISTER_ID_AUTH`, etc.) are auto-populated by `scripts/deploy.sh`.
