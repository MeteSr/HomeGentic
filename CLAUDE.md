# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
```bash
make dev          # Start local ICP network, deploy all canisters, run frontend (all-in-one)
make dev-full     # Network + canisters + frontend + voice agent + admin dashboard
make start        # icp network start -d (network only)
make deploy       # bash scripts/deploy.sh (all 20 backend canisters + frontend)
make deploy-one CANISTER=payment   # Deploy a single canister
make frontend     # cd frontend && npm run dev (Vite dev server at :3000)
make check-motoko # Compile-check every canister with `icp build` (no network needed)
```

The canister CLI is **icp-cli** (`npm install -g @icp-sdk/icp-cli`; `icp.yaml` is the project config). `dfx.json` is still present for `dfx generate` (declarations), the PocketIC upgrade tests (which build with `dfx build`), and the bash canister test suites (`backend/*/test.sh`, which call `dfx canister call`).

The voice agent runs separately (Cloudflare Workers via wrangler):
```bash
cd agents/voice && npm install && npm run dev   # wrangler dev at :8787
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

# Visual regression (Playwright pixel diffs, mock mode — no replica)
npm run test:visual
npm run test:visual:update   # regenerate baselines

# Backend canister tests (bash, requires deployed canisters)
make test                  # alias for bash scripts/test-backend.sh
```

Local visual baselines don't match CI (different fonts/Chromium build), so don't commit locally regenerated PNGs. When a PR intentionally changes the UI, CI's `test-visual` fails and `test-visual-heal` commits baselines regenerated on the CI runner back to the branch — review those images.

### Stable-memory compatibility (IMPORTANT)

Canisters use enhanced orthogonal persistence: an upgrade whose stable types aren't compatible with the running version (e.g. a new non-optional field on a record stored in a `Map`) is rejected with `Memory-incompatible program upgrade`, and the only way out is a reinstall that wipes data. The `stable-compat-check` CI job (`scripts/ci/check-stable-compat.sh`) compares every canister's stable types against the PR's base and fails on a break. Add new record fields as `?T`. An intentional break needs the `allow-stable-break` label, and on testnet `scripts/deploy.sh` only reinstalls canisters listed in its `TESTNET_REINSTALL_OK` allow-list (empty by default); mainnet never reinstalls.

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
make upgrade      # Upgrade the core canisters in place (auth, property, job, contractor, quote, payment, photo, monitoring)
make logs         # Tail recent logs for the key canisters
make clean        # Reset local ICP network state
bash scripts/init-test-data.sh   # Seed test users and properties
```

### Frontend build
```bash
cd frontend && npm run build    # Outputs to frontend/dist/ (served by assets canister)
bash scripts/generate-declarations.sh   # Regenerate Candid bindings after .mo changes (needs dfx)
```

## Architecture

### Monorepo Layout

```
backend/          20 Motoko canisters (each has main.mo) + shared/ (e.g. ServiceType.mo)
frontend/         React + TypeScript SPA (Vite)
agents/voice/     Claude voice/AI proxy — Cloudflare Worker (src/index.ts) in production; server.ts is the legacy Express equivalent
agents/email/     Lead-form email relay (Cloudflare Worker → Resend)
agents/notifications/  Push relay (APNs / FCM / VAPID web push)
agents/iot-gateway/    Smart-home webhook ingestion → sensor canister
dashboard/        Standalone monitoring SPA (admin use)
mobile/           Expo React Native app
tests/e2e/        Playwright tests (functional, visual, a11y)
tests/upgrade/    PocketIC upgrade-persistence tests
scripts/          Bash deploy/upgrade/test scripts; scripts/ci/ holds CI gates
docs/             ARCHITECTURE.md, API.md, SYSTEMS.md, FEATURES.md, DEPLOYMENT.md, SECURITY.md, AI_RATE_LIMITS.md, UPGRADE_RUNBOOK.md
```

### ICP Canister Map

All 20 canisters use `persistent actor` (Motoko mo:core) — all variables are implicitly stable, so no `preupgrade`/`postupgrade` hooks are needed. `transient var` is used for in-memory structures that should reset on upgrade (e.g. rate-limit sliding-window maps). Each exports a `metrics()` query and `pause()`/`unpause()` admin capability.

| Canister | Responsibility |
|---|---|
| **auth** | User profiles, roles (Homeowner / Contractor / Realtor / Builder) |
| **property** | Registration, ownership verification (Unverified → PendingReview → Basic → Premium), 7-day conflict window; also owns room/fixture CRUD (merged from old `room` canister) |
| **job** | Maintenance records, dual-signature verification (homeowner + contractor, or DIY homeowner-only) |
| **contractor** | Profiles, trust scores, rate-limited reviews (10/day/user, composite key deduplication) |
| **quote** | Quote requests & contractor bids, tier-enforced open-request limits; vetKD-sealed bids |
| **payment** | Subscription tier management & expiry; also owns pricing table queries — `getPricing(tier)` / `getAllPricing()` (merged from old `price` canister) |
| **photo** | Photo bytes stored on-chain, SHA-256 deduplication, tier-based quotas, multi-approval for sensitive records |
| **report** | Immutable report snapshots, share links with visibility levels & revocation |
| **market** | ROI-ranked project recommendations (2024 Remodeling Magazine data); HomeGentic score (returned vetKD-encrypted to the owner) |
| **maintenance** | Predictive scheduling, system lifespan estimates, seasonal task generation |
| **sensor** | IoT device registry (12 device types: Nest, Ecobee, Moen Flo, Ring Alarm, Honeywell Home, Rheem EcoNet, Sense, Emporia Vue, Rachio, SmartThings, Home Assistant, Manual); auto-creates pending jobs for Critical events |
| **monitoring** | Cycles usage, cost metrics, profitability (ARPU/LTV/CAC), alerting |
| **listing** | FSBO listing lifecycle, sealed-bid offers, agent matching |
| **agent** | Realtor profiles, reviews, HomeGentic transaction count |
| **recurring** | Recurring service contracts (HVAC, pest, landscaping) and visit logs |
| **bills** | Utility bill storage per property; 3-month rolling anomaly detection (>20% spike flagged); feeds Activity feed bell drawer |
| **ai_proxy** | IC HTTP outcalls: permit imports (ArcGIS / OpenPermit), property-record lookups, and transactional email (Resend) |
| **fee** | Bid to List platform-fee ledger (Owed → Invoiced → Paid / Waived); identities are released only after the fee settles |
| **referrals** | Referral codes (`HG-000001`) and $10 credits for both sides after the referee's first paid month |
| **audit** | Append-only log of privileged (admin) actions, written fire-and-forget by the other canisters |

### Tier System (enforced server-side in multiple canisters)

Two homeowner tiers — **Free** and **Pro ($59/year, annual only)** — plus two contractor tiers. A principal with no subscription is Free. `payment` is the single source of truth: `property`, `quote`, `photo` and `bills` read the caller's tier live with `getTierForPrincipal` (no local caches; fail closed to Free if `payment` isn't wired).

| Tier | Properties | Photos/Job | Open Quotes | Price |
|---|---|---|---|---|
| Free | 1 | 5 | 3 | $0 |
| Pro | 20 | 30 | unlimited | $59/yr |
| ContractorFree | 0 | 5 | unlimited | $0 + 3% referral fee per winning bid, $20 min |
| ContractorPro | 0 | 50 | unlimited | $40/mo (or yearly) |

Realtors have no subscription tier: the winning agent in a Bid to List auction pays a one-time platform fee (`listing.getPlatformFee()`, $399 default), tracked in the `fee` canister.

### AI Agent Rate Limits (enforced in the voice agent)

Agent calls (agentic tool-use loop) are counted separately from chat calls. Limits live in `agents/voice/agentLimiter.ts` (`TIER_LIMITS`, `TIER_PERIOD`, `CHAT_LIMITS`). See `docs/AI_RATE_LIMITS.md` for the financial basis.

| Tier | Agent calls | Chat calls/day |
|---|---|---|
| Free | 10/week | 3 |
| Pro | 10/day | Unlimited |
| ContractorFree | 0 | 3 |
| ContractorPro | 10/day | Unlimited |

### Frontend Service Layer

`frontend/src/services/actor.ts` creates the ICP `HttpAgent`. In local dev it uses a fixed-seed Ed25519 identity to survive hot-reloads without re-authenticating. In production it uses `@dfinity/auth-client` (Internet Identity).

Each service file (e.g. `job.ts`, `property.ts`) imports its canister's IDL from `frontend/src/declarations/<canister>/` and follows a mock-fallback pattern:
```typescript
if (!CANISTER_ID) return mockData;   // canister not deployed → use mock
```
Canister IDs come from `vite.config.ts` `define` block mapping `CANISTER_ID_*` env vars (written to `.env` by `scripts/deploy.sh`).

**IDL maintenance rule** — whenever you add or rename a variant in a Motoko `.mo` file, you must update the matching IDL in **two** places:
1. `frontend/src/declarations/<canister>/index.ts` — the single source of truth for each canister's Candid interface (replaces the old inline `idlFactory` in service files). Run `bash scripts/generate-declarations.sh` if `dfx` is available, otherwise edit the file by hand.
2. `agents/iot-gateway/icp.ts` — `SensorDeviceIDL` / `SensorEventTypeIDL` (sensor canister only)

After updating declarations, regenerate snapshots: `cd frontend && npm run test:unit -- --update` and commit the `.snap` files.

### State Management

Zustand stores in `frontend/src/store/`:
- `authStore` — `isAuthenticated`, `principal`, `profile`, `isLoading`
- `propertyStore` — cached `properties[]`
- `jobStore` — cached `jobs[]`
- `addPropertyStore` — open/close state for the Add Property wizard

Auth flow: `AuthContext.tsx` wraps the app and exposes `login()` / `devLogin()` / `logout()`. `devLogin()` skips Internet Identity (only available when `import.meta.env.DEV`).

### Voice Agent

Production runs the Cloudflare Worker `agents/voice/src/index.ts` (deployed by CI with `wrangler deploy`; rate-limit counters in Workers KV). `agents/voice/server.ts` is the older Express equivalent (port 3001, `npm start`) with the same routes. Main endpoints:
- `POST /api/chat` — SSE streaming chat (max 200 tokens, 2-3 sentence voice responses)
- `POST /api/agent` — Agentic tool-use loop returning tool_calls or final answer
- Plus document/bill extraction, Stripe checkout + webhook, Bid to List routes, and `/health` — see `docs/SYSTEMS.md` §17.

In the app, voice lives in the dashboard's "Ask about your home" bar (`DashboardV3`), driven by the `useVoiceAgent` hook (`frontend/src/hooks/useVoiceAgent.ts`):
1. Web Speech API → user speech captured
2. `buildContext()` fetches live properties + jobs from ICP canisters
3. POST to `/api/agent` with context
4. SSE stream → text chunks rendered in the answer card
5. Browser `SpeechSynthesis` reads the full response aloud
6. Max 5 agentic turns per interaction for safety

Tool definitions for Claude live in `frontend/src/services/agentTools.ts` (frontend side, used for UI) and `agents/voice/tools.ts` (server side, sent to Claude API). The model is set by `AI_MODEL` in `agents/voice/wrangler.toml`. Requires `ANTHROPIC_API_KEY`.

**Caller identity:** the Worker never trusts a principal or tier the browser asserts. The frontend gets a session token from `auth.issueAgentSession()` (`services/agentSession.ts`) and sends it as `x-agent-session`; the Worker resolves it via the auth canister (`src/session.ts`), then reads the tier from `payment` (`src/tier.ts`).

### Design System

No CSS framework — styling is inline React styles plus a few global classes in `frontend/src/index.css`. Two token sets:

- **`frontend/src/theme.ts`** — app-wide `V2_COLORS` (cobalt `#2B34FF` primary, yellow `#FFD23F` highlight, `#0B0D1A` ink), `V2_FONTS` (Bricolage Grotesque display, Hanken Grotesk body, JetBrains Mono labels), `V2_RADIUS` (pill 100, card 16, input 10). Older `COLORS`/`FONTS`/`RADIUS` exports are deprecated.
- **`.hg-v3` tokens** (`frontend/src/components/dashboardV3/dashboardV3.css`) — the v3 palette as CSS custom properties (`--hg-bg`, `--hg-ink`, `--hg-line`, `--hg-blue`, `--hg-yel`, …) with light (default, `data-theme="light"`) and dark modes. Neutral black/white with cobalt and yellow accents.

**App shell.** `/dashboard` renders `DashboardV3` (top bar + left chip rail + panels + ask bar). Every other authenticated page is wrapped in `Layout.tsx`, whose desktop chrome uses the same top bar and chip rail; `dashboardV3/chrome.tsx` (`BrandMark`, `railChipStyle`, `RailChipCount`, `SHELL_PAGE_MIN_HEIGHT`) is shared by both so they can't drift. The active rail chip is solid yellow. Mobile keeps its own header, bottom nav and FAB.

Google Fonts are loaded in `frontend/index.html`.

### E2E Testing Notes

Playwright tests use `window.__e2e_properties` and similar globals to inject mock data — the service layer checks for these before making canister calls. See `tests/e2e/helpers/testData.ts` for the injection pattern.

### Environment Variables

Copy `.env.example` to `.env`. Key vars:
```
DFX_NETWORK=local
ANTHROPIC_API_KEY=sk-ant-...     # Required for voice agent (local .env; Worker secrets in production)
VOICE_AGENT_PORT=3001
FRONTEND_ORIGIN=http://localhost:3000
VITE_VOICE_AGENT_URL=http://localhost:3001
```
Canister IDs (`CANISTER_ID_AUTH`, etc.) are auto-populated by `scripts/deploy.sh`.
