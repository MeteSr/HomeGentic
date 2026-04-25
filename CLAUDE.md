# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
```bash
make dev          # Start local ICP network, deploy all canisters, run frontend (all-in-one)
make start        # icp network start -d (network only)
make deploy       # bash scripts/deploy.sh (all 17 canisters)
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

### E2E test maintenance (IMPORTANT)

**Always update `tests/e2e/` when changing UI-visible behaviour.** Common triggers:

| Change type | What to check in tests/e2e/ |
|---|---|
| New page or route | Add a new `*.spec.ts` mirroring the pattern of existing specs |
| Rename/move a UI label, heading, or button text | `grep -r "old text" tests/e2e/` and update all matching assertions |
| Add/remove a form field | Update the spec for that page — add/remove `getByLabel`, `fill`, and validation assertions |
| Change validation logic (required fields, enable/disable rules) | Update step-flow tests that submit or advance through the affected form |
| Change auth/routing (new ProtectedRoute, redirect logic) | Ensure relevant specs call `injectTestAuth` in `beforeEach` |
| Add a modal that replaces a navigation | Change `toHaveURL` assertions to check the modal heading instead |

**E2E mock injection pattern** — tests use `window.__e2e_*` globals (set via `addInitScript`) so no canister is needed:
- `window.__e2e_principal` / `__e2e_profile` — auth state (see `helpers/auth.ts`)
- `window.__e2e_properties` / `__e2e_jobs` — property and job data (see `helpers/testData.ts`)
- `window.__e2e_subscription` — payment tier

Run `CI=true npx playwright test` after any frontend change that touches pages, forms, routes, or auth to catch regressions before pushing.

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
backend/          17 Motoko canisters (each has main.mo)
frontend/         React + TypeScript SPA (Vite)
agents/voice/     Node.js/Express proxy for Claude voice agent
agents/iot-gateway/  IoT event ingestion (future)
dashboard/        Standalone monitoring SPA (admin use)
tests/e2e/        Playwright tests
scripts/          Bash deploy/upgrade/test scripts
docs/             ARCHITECTURE.md, API.md, DEPLOYMENT.md, SECURITY.md, AI_RATE_LIMITS.md
```

### ICP Canister Map

All 17 active canisters use `persistent actor` (Motoko mo:core) — all variables are implicitly stable, so no `preupgrade`/`postupgrade` hooks are needed. `transient var` is used for in-memory structures that should reset on upgrade (e.g. rate-limit sliding-window maps). Each exports a `metrics()` query and `pause()`/`unpause()` admin capability.

| Canister | Responsibility |
|---|---|
| **auth** | User profiles, roles (Homeowner / Contractor / Realtor) |
| **property** | Registration, ownership verification (Unverified → PendingReview → Basic → Premium), 7-day conflict window; also owns room/fixture CRUD (merged from old `room` canister) |
| **job** | Maintenance records, dual-signature verification (homeowner + contractor, or DIY homeowner-only) |
| **contractor** | Profiles, trust scores, rate-limited reviews (10/day/user, composite key deduplication) |
| **quote** | Quote requests & contractor bids, tier-enforced open-request limits |
| **payment** | Subscription tier management & expiry; also owns pricing table queries — `getPricing(tier)` / `getAllPricing()` (merged from old `price` canister) |
| **photo** | SHA-256 deduplication, tier-based quotas, multi-approval for sensitive records |
| **report** | Immutable report snapshots, share links with visibility levels & revocation |
| **market** | ROI-ranked project recommendations (2024 Remodeling Magazine data) |
| **maintenance** | Predictive scheduling, system lifespan estimates, seasonal task generation |
| **sensor** | IoT device registry (12 device types: Nest, Ecobee, Moen Flo, Ring Alarm, Honeywell Home, Rheem EcoNet, Sense, Emporia Vue, Rachio, SmartThings, Home Assistant, Manual); auto-creates pending jobs for Critical events |
| **monitoring** | Cycles usage, cost metrics, profitability (ARPU/LTV/CAC), alerting |
| **listing** | FSBO listing lifecycle, sealed-bid offers, agent matching |
| **agent** | Realtor profiles, reviews, HomeGentic transaction count |
| **recurring** | Recurring service contracts (HVAC, pest, landscaping) and visit logs |
| **bills** | Utility bill storage per property; 3-month rolling anomaly detection (>20% spike flagged); feeds Activity feed bell drawer |
| **ai_proxy** | IC HTTP outcalls: permit imports (ArcGIS / OpenPermit) and transactional email (Resend) |

### Tier System (enforced server-side in multiple canisters)

| Tier | Properties | Photos/Job | Open Quotes | Price |
|---|---|---|---|---|
| Basic | 1 | 5 | 3 | $10/mo |
| Pro | 5 | 10 | 10 | $20/mo |
| Premium | 20 | 30 | unlimited | $40/mo |
| ContractorFree | 0 | 5 | unlimited | $0 |
| ContractorPro | unlimited | 50 | unlimited | $30/mo |
| RealtorFree | 0 | 5 | unlimited | $0 |
| RealtorPro | 0 | 50 | unlimited | $30/mo |

### AI Agent Rate Limits (enforced in Express voice server)

Agent calls (agentic tool-use loop) are counted separately from chat calls. See `docs/AI_RATE_LIMITS.md` for full financial basis and implementation notes.

| Tier | Agent calls/day | Chat calls/day |
|---|---|---|
| Free / ContractorFree / RealtorFree | 0 | 3 |
| Basic | 5 | Unlimited |
| Pro / ContractorPro / RealtorPro | 10 | Unlimited |
| Premium | 20 | Unlimited |

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
