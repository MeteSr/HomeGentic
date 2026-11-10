# HomeGentic

[![CI](https://github.com/MeteSr/homegentic/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/MeteSr/homegentic/actions/workflows/ci.yml)

**The Carfax for Homes** — Blockchain-verified home maintenance history on the Internet Computer Protocol (ICP).

HomeGentic gives homeowners an immutable, tamper-proof record of every repair, upgrade, and inspection. Buyers and agents can verify a property's full history before closing — building trust and increasing home values.

Beyond the maintenance log, a home's record holds its document vault, insurance policies and claim kit,
improvements (tax basis), warranty, mortgage and flood-zone details, house guide and HOA paperwork, a move-in
plan, a storm and emergency card, lien waivers and permit close-out, a calendar feed and a reserve target.
Homeowners can also ask about their records from ChatGPT or Claude through DFINITY's ICP MCP connector.
[docs/FEATURES.md](docs/FEATURES.md) lists every route, page and user action.

---

## Stack

| Layer | Technology |
|---|---|
| Blockchain | Internet Computer Protocol (ICP) |
| Backend | Motoko canisters (20 total), managed with icp-cli |
| Auth | ICP Internet Identity |
| Frontend | React + TypeScript + Vite |
| AI Agent | Claude API (Anthropic, model set by `AI_MODEL` in `agents/voice/wrangler.toml`, currently Sonnet 5.5) via a Cloudflare Worker — voice / AI proxy |
| AI assistants | ICP MCP connector for ChatGPT / Claude: `/.well-known/ic-architecture` manifest, `getApiDoc()` and OQL `schema`/`execute` on the exposed canisters ([ARCHITECTURE.md → AI Assistants](docs/ARCHITECTURE.md#ai-assistants-icp-mcp)) |
| Email | Resend, sent from the voice Worker and the notification relay; inbound invoice email through Cloudflare Email Routing |
| Photos | Cloudflare R2 behind the voice Worker (records and access checks stay in the `photo` canister) |
| Notifications | Notification relay and IoT gateway on Fly.io (push, email, SMS, smart-home webhooks) |
| Admin Dashboard | Standalone React SPA querying canisters via `@icp-sdk/core` |
| Mobile | Expo React Native app (`mobile/`) |
| Shared code | `packages/shared`: Candid declarations and generated types used by frontend, mobile, dashboard and the Workers |

For a picture of how these pieces connect, see the
[system diagram](docs/ARCHITECTURE.md#system-diagram).

---

## Backend Canisters

| Canister | Responsibility |
|---|---|
| `auth` | User registration, profiles, role management (Homeowner / Contractor / Realtor / Builder) |
| `property` | Property registration, ownership verification (Unverified → PendingReview → Basic → Premium), 7-day conflict window; also owns room/fixture CRUD |
| `job` | Maintenance job tracking with dual-signature verification (homeowner + contractor, or DIY homeowner-only) |
| `contractor` | Contractor profiles, specialties, trust scores, rate-limited reviews (10/day/user) |
| `quote` | Quote requests & contractor bids, tier-enforced open-request limits, vetKD-sealed bids |
| `payment` | Subscription tier management and expiry tracking; also owns pricing table queries (merged from old `price` canister) |
| `photo` | Photo records, access checks, SHA-256 deduplication and tier quotas; the bytes live in R2 (older photos and a fallback path on-chain) |
| `report` | Immutable report snapshots, share links with visibility levels and revocation |
| `market` | ROI-ranked project recommendations (2024 Remodeling Magazine data); HomeGentic score, returned vetKD-encrypted to the owner |
| `maintenance` | Predictive scheduling engine, system lifespan estimates, seasonal task generation |
| `sensor` | IoT device registry (12 device types: Nest, Ecobee, Moen Flo, Ring Alarm, Honeywell Home, Rheem EcoNet, Sense, Emporia Vue, Rachio, SmartThings, Home Assistant, Manual); auto-creates pending jobs on Critical events |
| `monitoring` | Cycles usage, cost metrics, profitability analysis (ARPU/LTV/CAC), alerts, frontend and service errors |
| `listing` | FSBO listing lifecycle, sealed-bid offers, agent matching |
| `agent` | Realtor profiles, reviews, HomeGentic transaction count |
| `recurring` | Recurring service contracts (HVAC, pest, landscaping) and visit logs |
| `bills` | Utility bill storage per property; 3-month rolling anomaly detection (>20% spike flagged); feeds the Activity feed bell drawer |
| `ai_proxy` | Price benchmarks and instant forecasts (pure computation). Its outcall and email methods are retired: permits, property lookups and email moved to the voice Worker |
| `fee` | Bid to List platform-fee ledger (Owed → Invoiced → Paid / Waived) and the Contractor Free referral fee |
| `referrals` | Retired 2026-10-26 (referral credits were removed from the app); still deployed with its data |
| `audit` | Append-only log of privileged (admin) actions |

---

## Quick Start

### Prerequisites

- [icp-cli](https://www.npmjs.com/package/@icp-sdk/icp-cli): `npm install -g @icp-sdk/icp-cli`
- [mops](https://mops.one) (Motoko packages)
- Node.js >= 22
- npm >= 9

### 1. Install dependencies

```bash
# Frontend
npm install   # root workspace, includes frontend/

# Voice agent proxy
cd agents/voice && npm install && cd ../..

# Admin dashboard
cd dashboard && npm install && cd ..
```

### 2. Configure environment

```bash
cp .env.example .env
# Canister IDs are populated automatically by the deploy script
```

The voice Worker does not read the root `.env`. For local runs, put its secrets in
`agents/voice/.dev.vars` (git-ignored), which `wrangler dev` loads:

```bash
cat > agents/voice/.dev.vars <<'VARS'
ANTHROPIC_API_KEY=sk-ant-...
RESEND_API_KEY=re_...        # only needed to send email; free key at resend.com
VARS
```

In production these are Worker secrets (`wrangler secret put`); the full list is in
`agents/voice/wrangler.toml` and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

### 3. Start everything

```bash
make dev
# Starts the local ICP network, deploys all 20 canisters, and runs the frontend dev server
```

`make dev-full` also starts the voice Worker and the admin dashboard.

Or step by step:

```bash
make start       # icp network start -d
make deploy      # bash scripts/deploy.sh — deploys canisters, writes canister IDs to .env
make frontend    # cd frontend && npm run dev  →  http://localhost:3000
```

### 4. Start the voice agent proxy

```bash
cd agents/voice && npm run dev
# → wrangler dev, http://localhost:8787 (set VITE_VOICE_AGENT_URL to match)
```

### 5. Start the admin dashboard (optional)

```bash
cd dashboard && npm run dev
# → http://localhost:3002
```

---

## Voice Agent

The voice agent lives in the dashboard's "Ask about your home" bar. Users type or tap the mic, speak a question, and get an answer card plus a spoken response — powered by Claude.

**What it knows:**
- The authenticated user's registered properties and recent job history (pulled live from ICP canisters)
- Home maintenance best practices and schedules
- Upgrade ROI and cost estimates
- How maintenance history affects property value and resale
- Contractor selection guidance
- Building system lifespans and repair vs. replace decisions

**How it works:**

```
User speaks
  → Web Speech API (browser, no cost)
  → useVoiceAgent hook fetches property + job context from ICP
  → POST /api/agent on the voice Worker (agents/voice/src/index.ts)  { message, context }
  → Worker builds a scoped system prompt, calls Claude (tool-use loop / streaming SSE)
  → Claude can call read tools such as query_home_records (OQL over the job, bills and property canisters)
  → Text streams back into the answer card
  → SpeechSynthesis reads full response aloud
```

**Environment variables** (Worker vars and secrets; locally in `agents/voice/.dev.vars`, see `agents/voice/wrangler.toml`):

| Variable | Default | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Required. Your Anthropic API key. |
| `RESEND_API_KEY` | — | Required for email (a Worker secret in production). Free key at resend.com. |
| `RESEND_FROM` | `HomeGentic <noreply@homegentic.app>` | Sender address for transactional email, on a Resend-verified domain. |
| `FRONTEND_ORIGIN` | `http://localhost:3000` | CORS allowed origin. |
| `AI_MODEL` | `claude-sonnet-5-5` | Claude model (a var in `wrangler.toml`). |
| `VITE_VOICE_AGENT_URL` | `http://localhost:8787` | Voice Worker URL used by the frontend, set in the root `.env` (`wrangler dev` serves :8787). |

---

## Project Structure

```
homegentic/
├── icp.yaml                      # icp-cli project config (20 backend canisters + frontend)
├── dfx.json                      # Legacy config, still used by the PocketIC upgrade tests and the bash canister suites
├── mops.toml                     # Motoko package manager config (moc 1.16.1, core 2.6.1)
├── package.json                  # Root scripts (test, deploy, upgrade, etc.)
├── Makefile                      # make dev / deploy / test / upgrade / clean
├── .env.example                  # Environment variable template
│
├── backend/                      # Motoko canisters (20) + shared/ types
│   ├── auth/main.mo
│   ├── property/main.mo
│   ├── job/main.mo
│   ├── contractor/main.mo
│   ├── quote/main.mo
│   ├── payment/main.mo           # Merged: payment + pricing table
│   ├── photo/main.mo
│   ├── report/main.mo
│   ├── market/main.mo
│   ├── maintenance/main.mo
│   ├── sensor/main.mo
│   ├── monitoring/main.mo
│   ├── listing/main.mo
│   ├── agent/main.mo
│   ├── recurring/main.mo
│   ├── bills/main.mo             # Utility bills per property; anomaly detection; feeds Activity feed
│   ├── ai_proxy/main.mo          # Price benchmarks, instant forecasts (outcall/email methods retired)
│   ├── fee/main.mo               # Bid to List platform fees, Contractor Free referral fees
│   ├── referrals/main.mo         # Retired referral credits (still deployed)
│   ├── audit/main.mo             # Append-only admin-action log
│   └── shared/                   # Modules shared by the canisters (Admin, RateLimit, Errors, ApiDoc, ServiceType, …)
│                                 # Exposed canisters also have ApiDoc.mo (what getApiDoc() returns)
│
├── packages/shared/              # Candid declarations + generated types, shared helpers (frontend, mobile, dashboard, Workers)
│
├── agents/                       # Off-chain services
│   ├── email/                    # Lead-form email relay (Cloudflare Worker → Resend)
│   ├── notifications/            # Notification relay (Fly.io): push (APNs / FCM / VAPID), email, SMS, Home Pulse
│   ├── iot-gateway/              # Smart-home webhook ingestion → sensor canister (Fly.io)
│   └── voice/                    # Claude voice / AI proxy
│       ├── src/index.ts          # Cloudflare Worker entry (production)
│       ├── prompts.ts            # Dynamic system prompt builder
│       ├── tools.ts              # Claude tool definitions (server-side)
│       ├── src/offchainOutcalls.ts # Permits, property lookups and email (Resend)
│       ├── src/photos.ts         # Off-chain photo routes (R2)
│       ├── src/aiGuard.ts        # Human check, free-tier budget, backoff for paid calls
│       ├── provider.ts           # AIProvider interface
│       ├── anthropicProvider.ts  # Concrete Anthropic SDK implementation
│       └── types.ts
│
├── frontend/                     # React + Vite SPA (port 3000)
│   └── src/
│       ├── components/           # Layout (app shell), dashboardV3/, Button, Badge, etc.
│       ├── hooks/                # useVoiceAgent, useInstantForecast, etc.
│       ├── pages/                # 20+ pages (landing → dashboard → property → job → ...)
│       ├── services/             # ICP canister actor clients + agentTools.ts
│       ├── store/                # Zustand: authStore, propertyStore, jobStore, addPropertyStore
│       └── contexts/AuthContext.tsx
│
├── dashboard/                    # Admin metrics SPA (port 3002)
│   └── src/pages/MonitoringDashboard.tsx  # Live canister queries via @icp-sdk/core
│
├── tests/
│   ├── e2e/                      # Playwright end-to-end tests
│   ├── upgrade/                  # PocketIC tests on real canisters: upgrades, authz, races, clients (Linux/WSL)
│   ├── smoke/                    # Post-deploy smoke test (npm run test:smoke)
│   └── k6/                       # k6 load tests
│
├── mobile/                       # Expo React Native app (EAS builds, store release workflow)
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── API.md                    # Canister methods (signatures generated from source)
│   ├── SYSTEMS.md                # Per-canister behaviour reference
│   ├── FEATURES.md               # Every route, page and user action
│   ├── DEPLOYMENT.md
│   ├── SECURITY.md
│   ├── AI_RATE_LIMITS.md
│   ├── AI_CONNECTORS.md          # Getting users onto the ChatGPT / Claude connectors
│   ├── UNIT_ECONOMICS.md         # Per-user cost model (generated by scripts/cost-model)
│   ├── EXTERNAL_APIS.md          # Third-party services and their env vars
│   ├── STORAGE_CAPACITY.md       # Per-canister storage estimates
│   ├── PERFORMANCE.md
│   ├── UPGRADE_RUNBOOK.md
│   ├── INCIDENT_RUNBOOK.md       # Severity, containment, restores, breach notices
│   ├── RELEASING.md              # Versions and release paths
│   ├── DATA_RETENTION.md         # Where personal data lives and for how long
│   └── SLO.md                    # Service-level targets
│
└── scripts/
    ├── deploy.sh                 # Deploy all canisters sequentially, write IDs to .env
    ├── upgrade.sh                # Safe canister upgrade (preserves stable state via EOP)
    ├── setup-pocketic.sh         # One-step PocketIC binary installer for WSL
    ├── status.sh                 # Show canister IDs and health
    ├── init-test-data.sh         # Seed test users and properties
    ├── test-backend.sh           # Run all canister bash test suites
    ├── test-cross-canister.sh    # Cross-canister integration scenarios
    ├── load-test.sh
    ├── ci/                       # CI gates (stable compat, declarations, canister calls, warnings)
    ├── cost-model/               # Generates docs/UNIT_ECONOMICS.md (CI fails on drift)
    ├── gen-declaration-types.mjs # packages/shared declarations → TypeScript types
    ├── ops/                      # Ops alerts, off-chain backups, restore drill, release manifest, changelog
    └── cleanup.sh                # Reset local ICP network state
```

---

## Subscription Tiers

| Tier | Properties | Photos/Job | Documents/Home | Open Quote Requests | Price |
|---|---|---|---|---|---|
| Free | 1 | 5 | 25 | 3 | $0 |
| Pro | 20 | 30 | 250 | Unlimited | $59/year (annual only) |
| ContractorFree | 0 | 5 | 25 | Unlimited | $0 + 3% referral fee per winning bid, $20 min |
| ContractorPro | Unlimited | 50 | 250 | Unlimited | $40/mo (or yearly) |

AI limits per tier (agent calls, chat calls per day) are in [docs/AI_RATE_LIMITS.md](docs/AI_RATE_LIMITS.md). A principal with no subscription is Free. Limits are enforced server-side in the `property`, `photo`, `quote` and `bills` canisters, which read the caller's tier live from `payment`. Realtors don't subscribe: the winning agent in a Bid to List auction pays a one-time platform fee ($399 default).

---

## Lint and checks

```bash
npm run lint                     # oxlint over every TS/JS project
npm run knip                     # unused frontend files
make check-motoko                # compile-check every canister (icp build, no network)
npm run check:motoko-warnings    # new moc warnings fail
npm run gen:declaration-types    # after editing packages/shared/src/declarations
node scripts/cost-model/costModel.mjs --check   # docs/UNIT_ECONOMICS.md matches its assumptions
```

CI also checks stable-memory and Candid compatibility against the PR's base, and that new code is
covered by tests (TDD gates). [CLAUDE.md](CLAUDE.md) lists every gate.

## Testing

```bash
# Unit + contract tests (Vitest — no replica needed)
npm run test:unit

# Candid contract tests only (snapshot IDL factory signatures against canister types)
cd frontend && npm run test:unit -- src/__tests__/contracts/

# End-to-end tests (Playwright — requires running replica + frontend)
npm run test:e2e
npm run test:e2e:ui

# Visual regression tests (Playwright pixel-diff snapshots — mock mode, no replica)
npm run test:visual
npm run test:visual:update      # after an intentional design change

# Backend canister tests (bash — requires running replica + deployed canisters)
npm run test:canister           # all canister test suites
bash scripts/test-cross-canister.sh  # cross-canister integration scenarios

# PocketIC tests on real canisters (Linux or WSL): upgrades, authz, races, clients
bash scripts/ci/build-upgrade-wasms.sh   # compile every canister's Wasm into .dfx/local/canisters/
npm run test:upgrade

# Post-deploy smoke test
npm run test:smoke

# Ops scripts (backup / restore drill, against a stand-in icp-cli; needs age)
npm test --prefix scripts/ops
```

See [TESTING.md](TESTING.md) for full details and the test gap backlog.

---

## Manual Canister Commands

All commands target the local network; add `-e testnet` / `-e ic` for others. See [docs/API.md](docs/API.md) for every method and signature.

### Job canister

```bash
# Fetch jobs for a property
icp canister call job getJobsForProperty '("1")' -e local

# Sign verification (homeowner or contractor)
icp canister call job verifyJob '("JOB_1")' -e local
```

### Quote canister

```bash
# Contractor view of open requests
icp canister call quote getOpenRequests -e local

# Accept a quote (as homeowner)
icp canister call quote acceptQuote '("QUOTE_1")' -e local
```

### Admin commands

`scripts/deploy.sh` makes the deployer an admin of every canister. To add another admin later, call `addAdmin` as an existing admin (the nonce argument is only checked during the one-time bootstrap):

```bash
icp canister call job addAdmin "(principal \"<new-admin>\", \"\")" -e local

# Pause / unpause (optional auto-expiry in seconds)
icp canister call job pause '(null)' -e local
icp canister call job unpause -e local
```

---

## Coming Soon

### Privacy & Selective Disclosure via ICP vetKeys

vetKD is already in use: the `market` canister returns each owner's score encrypted to their transport key, and `quote` seals contractor bids with identity-based encryption until the homeowner reveals them. The deploy script sets the key per environment (`test_key_1` locally and on testnet, `key_1` on mainnet). Still to come:

- **Encrypted job records** — homeowners encrypt maintenance records on-chain; only authorized principals obtain the decryption key from the canister
- **Buyer disclosure packages** — share a time-limited, scoped view of verified history without exposing raw cost or contractor data
- **Contractor-gated access** — contractors can only read the job records they are linked to

---

## License

Source-available, all rights reserved © HomeGentic 2026. You can read and audit the code, but using, copying, deploying or redistributing it needs written permission. See [LICENSE](LICENSE).
