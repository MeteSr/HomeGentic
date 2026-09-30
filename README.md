# HomeGentic

![Coverage](https://img.shields.io/badge/coverage-74%25_lines_minimum-brightgreen) ![CI](https://img.shields.io/badge/CI-passing-brightgreen)

**The Carfax for Homes** — Blockchain-verified home maintenance history on the Internet Computer Protocol (ICP).

HomeGentic gives homeowners an immutable, tamper-proof record of every repair, upgrade, and inspection. Buyers and agents can verify a property's full history before closing — building trust and increasing home values.

---

## Stack

| Layer | Technology |
|---|---|
| Blockchain | Internet Computer Protocol (ICP) |
| Backend | Motoko canisters (20 total), managed with icp-cli |
| Auth | ICP Internet Identity |
| Frontend | React + TypeScript + Vite |
| AI Agent | Claude API (Anthropic) via a Cloudflare Worker — voice / AI proxy |
| Email | Resend (transactional, rate-limited to free tier: 100/day, 3,000/month) |
| Admin Dashboard | Standalone React SPA querying canisters via `@dfinity/agent` |

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
| `photo` | On-chain job photo storage with SHA-256 deduplication and tier-based quota enforcement |
| `report` | Immutable report snapshots, share links with visibility levels and revocation |
| `market` | ROI-ranked project recommendations and competitive analysis (2024 Remodeling Magazine data) |
| `maintenance` | Predictive scheduling engine, system lifespan estimates, seasonal task generation |
| `sensor` | IoT device registry (12 device types: Nest, Ecobee, Moen Flo, Ring Alarm, Honeywell Home, Rheem EcoNet, Sense, Emporia Vue, Rachio, SmartThings, Home Assistant, Manual); auto-creates pending jobs on Critical events |
| `monitoring` | Cycles usage, cost metrics, profitability analysis (ARPU/LTV/CAC), alerting |
| `listing` | FSBO listing lifecycle, sealed-bid offers, agent matching |
| `agent` | Realtor profiles, reviews, HomeGentic transaction count |
| `recurring` | Recurring service contracts (HVAC, pest, landscaping) and visit logs |
| `bills` | Utility bill storage per property; 3-month rolling anomaly detection (>20% spike flagged); feeds the Activity feed bell drawer |
| `ai_proxy` | IC HTTP outcalls: permit imports (ArcGIS / OpenPermit), property-record lookups, and transactional email (Resend) |
| `fee` | Bid to List platform-fee ledger (Owed → Invoiced → Paid / Waived) |
| `referrals` | Referral codes and $10 two-sided credits |
| `audit` | Append-only log of privileged (admin) actions |

---

## Quick Start

### Prerequisites

- [icp-cli](https://www.npmjs.com/package/@icp-sdk/icp-cli): `npm install -g @icp-sdk/icp-cli`
- [mops](https://mops.one) (Motoko packages)
- Node.js >= 20
- npm >= 9

### 1. Install dependencies

```bash
# Frontend
cd frontend && npm install && cd ..

# Voice agent proxy
cd agents/voice && npm install && cd ../..

# Admin dashboard
cd dashboard && npm install && cd ..
```

### 2. Configure environment

```bash
cp .env.example .env
# Fill in ANTHROPIC_API_KEY (required for voice agent)
# Fill in RESEND_API_KEY (required for email — get a free key at resend.com)
# Canister IDs are populated automatically by the deploy script
```

### 3. Start everything

```bash
make dev
# Starts the local ICP network, deploys all 20 canisters, and runs the frontend dev server
```

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
# or: npm run build && npm start  → legacy Express server on :3001
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
  → Text streams back into the answer card
  → SpeechSynthesis reads full response aloud
```

**Environment variables** (see `.env.example`):

| Variable | Default | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Required. Your Anthropic API key. |
| `RESEND_API_KEY` | — | Required for email. Free key at resend.com. |
| `RESEND_FROM_EMAIL` | `noreply@homegentic.app` | Sender address for transactional email. |
| `VOICE_AGENT_PORT` | `3001` | Port for the legacy Express server (`npm start`). |
| `FRONTEND_ORIGIN` | `http://localhost:3000` | CORS allowed origin. |
| `VITE_VOICE_AGENT_URL` | `http://localhost:3001` | Proxy URL used by the frontend. |

---

## Project Structure

```
homegentic/
├── icp.yaml                      # icp-cli project config (20 backend canisters + frontend)
├── dfx.json                      # Legacy config, still used by `dfx generate` and the PocketIC upgrade tests
├── mops.toml                     # Motoko package manager config (core = "2.3.1")
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
│   ├── ai_proxy/main.mo          # IC HTTP outcalls: permit imports, transactional email (Resend)
│   ├── fee/main.mo               # Bid to List platform fees
│   ├── referrals/main.mo         # Referral codes and credits
│   ├── audit/main.mo             # Append-only admin-action log
│   └── shared/ServiceType.mo     # ServiceType shared by job / quote / contractor
│
├── candid/                       # Hand-maintained Candid IDL snapshots (all canisters)
│
├── agents/                       # Off-chain services
│   ├── email/                    # Lead-form email relay (Cloudflare Worker → Resend)
│   ├── notifications/            # Push relay: APNs / FCM / VAPID web push
│   ├── iot-gateway/              # Smart-home webhook ingestion → sensor canister
│   └── voice/                    # Claude voice / AI proxy
│       ├── src/index.ts          # Cloudflare Worker entry (production)
│       ├── server.ts             # Legacy Express equivalent (port 3001)
│       ├── prompts.ts            # Dynamic system prompt builder
│       ├── tools.ts              # Claude tool definitions (server-side)
│       ├── provider.ts           # AIProvider interface
│       ├── anthropicProvider.ts  # Concrete Anthropic SDK implementation
│       ├── emailProvider.ts      # EmailProvider interface
│       ├── resendEmailProvider.ts # Resend SDK impl + rate limiter (100/day, 3k/month)
│       ├── forecast.ts           # Instant forecast endpoint logic
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
│   └── src/pages/MonitoringDashboard.tsx  # Live canister queries via @dfinity/agent
│
├── tests/
│   ├── e2e/                      # Playwright end-to-end tests
│   ├── upgrade/                  # PocketIC canister upgrade persistence tests (WSL only)
│   └── k6/                       # k6 load tests
│
├── mobile/                       # Expo React Native app
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── API.md                    # Canister methods (signatures generated from source)
│   ├── SYSTEMS.md                # Per-canister behaviour reference
│   ├── FEATURES.md               # Every route, page and user action
│   ├── DEPLOYMENT.md
│   ├── SECURITY.md
│   ├── AI_RATE_LIMITS.md
│   ├── PERFORMANCE.md
│   └── UPGRADE_RUNBOOK.md
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
    ├── ci/check-stable-compat.sh # CI gate: stable-memory compatibility vs. the PR base
    └── cleanup.sh                # Reset local ICP network state
```

---

## Subscription Tiers

| Tier | Properties | Photos/Job | Open Quote Requests | Price |
|---|---|---|---|---|
| Free | 1 | 5 | 3 | $0 |
| Pro | 20 | 30 | Unlimited | $59/year (annual only) |
| ContractorFree | 0 | 5 | Unlimited | $0 + 3% referral fee per winning bid, $20 min |
| ContractorPro | 0 | 50 | Unlimited | $40/mo (or yearly) |

A principal with no subscription is Free. Limits are enforced server-side in the `property`, `photo`, `quote` and `bills` canisters, which read the caller's tier live from `payment`. Realtors don't subscribe: the winning agent in a Bid to List auction pays a one-time platform fee ($399 default).

---

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

# Canister upgrade persistence tests (PocketIC — WSL only)
bash scripts/setup-pocketic.sh  # first time: install pocket-ic binary
dfx build auth payment          # compile Wasm (the tests read .dfx/local/canisters/)
npm run test:upgrade
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

### ICP Blob Storage Subnet

ICP storage costs are currently paid in cycles (stable memory at ~$5/GB/year). A dedicated ICP blob storage subnet (analogous to S3) is in development. When it ships, the admin dashboard will track it as a separate expense line automatically.

---

## License

MIT © HomeGentic 2026
