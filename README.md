# HomeGentic

![Coverage](https://img.shields.io/badge/coverage-60%25_minimum-brightgreen) ![CI](https://img.shields.io/badge/CI-passing-brightgreen)

**The Carfax for Homes** — Blockchain-verified home maintenance history on the Internet Computer Protocol (ICP).

HomeGentic gives homeowners an immutable, tamper-proof record of every repair, upgrade, and inspection. Buyers and agents can verify a property's full history before closing — building trust and increasing home values.

---

## Stack

| Layer | Technology |
|---|---|
| Blockchain | Internet Computer Protocol (ICP) |
| Backend | Motoko canisters (17 total) |
| Auth | ICP Internet Identity |
| Frontend | React + TypeScript + Vite |
| AI Agent | Node.js + Claude API (Anthropic) — voice assistant proxy |
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
| `quote` | Quote requests & contractor bids, tier-enforced open-request limits |
| `payment` | Subscription tier management and expiry tracking; also owns pricing table queries (merged from old `price` canister) |
| `photo` | Job photo storage with SHA-256 deduplication and tier-based quota enforcement |
| `report` | Immutable report snapshots, share links with visibility levels and revocation |
| `market` | ROI-ranked project recommendations and competitive analysis (2024 Remodeling Magazine data) |
| `maintenance` | Predictive scheduling engine, system lifespan estimates, seasonal task generation |
| `sensor` | IoT device registry (12 device types: Nest, Ecobee, Moen Flo, Ring Alarm, Honeywell Home, Rheem EcoNet, Sense, Emporia Vue, Rachio, SmartThings, Home Assistant, Manual); auto-creates pending jobs on Critical events |
| `monitoring` | Cycles usage, cost metrics, profitability analysis (ARPU/LTV/CAC), alerting |
| `listing` | FSBO listing lifecycle, sealed-bid offers, agent matching |
| `agent` | Realtor profiles, reviews, HomeGentic transaction count |
| `recurring` | Recurring service contracts (HVAC, pest, landscaping) and visit logs |
| `bills` | Utility bill storage per property; 3-month rolling anomaly detection (>20% spike flagged); feeds the Activity feed bell drawer |
| `ai_proxy` | IC HTTP outcalls: permit imports (ArcGIS / OpenPermit) and transactional email (Resend) |

---

## Quick Start

### Prerequisites

- [DFX SDK](https://internetcomputer.org/docs/current/developer-docs/setup/install/) >= 0.15
- Node.js >= 18
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
# Starts local ICP replica, deploys all 17 canisters, and runs the frontend dev server
```

Or step by step:

```bash
make start       # dfx start --background
make deploy      # bash scripts/deploy.sh — deploys canisters, writes canister IDs to .env
make frontend    # cd frontend && npm run dev  →  http://localhost:5173
```

### 4. Start the voice agent proxy

```bash
cd agents/voice && npm run dev
# → http://localhost:3001
```

### 5. Start the admin dashboard (optional)

```bash
cd dashboard && npm run dev
# → http://localhost:3002
```

---

## Voice Agent

The voice agent is a floating mic button that appears on every authenticated page (mounted in `Layout.tsx`). Users tap it, speak a question, and hear a spoken response — powered by Claude.

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
  → POST agents/voice/server.ts  { message, context }
  → Express proxy builds scoped system prompt, calls Claude (streaming SSE)
  → Text streams back into speech bubble word-by-word
  → SpeechSynthesis reads full response aloud
```

**Environment variables** (see `.env.example`):

| Variable | Default | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Required. Your Anthropic API key. |
| `RESEND_API_KEY` | — | Required for email. Free key at resend.com. |
| `RESEND_FROM_EMAIL` | `noreply@homegentic.app` | Sender address for transactional email. |
| `VOICE_AGENT_PORT` | `3001` | Port for the Express proxy. |
| `FRONTEND_ORIGIN` | `http://localhost:3000` | CORS allowed origin. |
| `VITE_VOICE_AGENT_URL` | `http://localhost:3001` | Proxy URL used by the frontend. |

---

## Project Structure

```
homegentic/
├── dfx.json                      # ICP canister configuration (17 backend + frontend + Internet Identity)
├── mops.toml                     # Motoko package manager config (core = "2.3.1")
├── package.json                  # Root scripts (test, deploy, upgrade, etc.)
├── Makefile                      # make dev / deploy / test / upgrade / clean
├── .env.example                  # Environment variable template
│
├── backend/                      # Motoko canisters (17)
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
│   └── ai_proxy/main.mo          # IC HTTP outcalls: permit imports, transactional email (Resend)
│
├── candid/                       # Hand-maintained Candid IDL snapshots (all canisters)
│
├── agents/                       # AI agent services
│   └── voice/                    # Claude voice assistant proxy (Express, port 3001)
│       ├── server.ts             # Express + SSE streaming → Claude API
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
│       ├── components/           # Layout, Button, Badge, VoiceAgent, etc.
│       ├── hooks/                # useVoiceAgent, useInstantForecast, etc.
│       ├── pages/                # 20+ pages (landing → dashboard → property → job → ...)
│       ├── services/             # ICP canister actor clients + agentTools.ts
│       ├── store/                # Zustand: authStore, propertyStore, jobStore
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
├── docs/
│   ├── ARCHITECTURE.md
│   ├── API.md
│   ├── DEPLOYMENT.md
│   ├── SECURITY.md
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
    └── cleanup.sh                # Reset local dfx state
```

---

## Subscription Tiers

| Tier | Properties | Photos/Job | Open Quote Requests | Price |
|---|---|---|---|---|
| Basic | 1 | 5 | 3 | $10/mo |
| Pro | 5 | 10 | 10 | $20/mo |
| Premium | 20 | 30 | Unlimited | $40/mo |
| ContractorFree | 0 | 5 | Unlimited | $0 |
| ContractorPro | Unlimited | 50 | Unlimited | $30/mo |

Limits are enforced server-side in the `property`, `photo`, and `quote` canisters.

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

# Backend canister tests (bash — requires running replica + deployed canisters)
npm run test:canister           # all canister test suites
bash scripts/test-cross-canister.sh  # cross-canister integration scenarios

# Canister upgrade persistence tests (PocketIC — WSL only)
bash scripts/setup-pocketic.sh  # first time: install pocket-ic binary
dfx build auth payment          # compile Wasm
npm run test:upgrade
```

See [TESTING.md](TESTING.md) for full details and the test gap backlog.

---

## Manual Canister Commands

### Job canister

```bash
# Create a job
dfx canister call job createJob '(
  "1", "HVAC Replacement", variant { HVAC },
  "Full 3-ton Carrier system replacement",
  "Cool Air Services", 240000, 1700000000000000000
)'

# Fetch jobs for a property
dfx canister call job getJobsForProperty '("1")'

# Sign verification (homeowner)
dfx canister call job verifyJob '("JOB_1")'
```

### Quote canister

```bash
# Create a quote request
dfx canister call quote createQuoteRequest '(
  "1", variant { Roofing },
  "Need full roof replacement, ~2000 sq ft",
  variant { High }, variant { Free }
)'

# Submit a quote (as contractor)
dfx canister call quote submitQuote '("REQ_1", 850000, 5, 1800000000000000000)'

# Accept a quote (as homeowner)
dfx canister call quote acceptQuote '("QUOTE_1")'
```

### Admin commands

```bash
# Bootstrap admin on any canister
dfx canister call auth addAdmin "(principal \"$(dfx identity get-principal)\")"
dfx canister call property addAdmin "(principal \"$(dfx identity get-principal)\")"
dfx canister call job addAdmin "(principal \"$(dfx identity get-principal)\")"

# Pause / unpause
dfx canister call job pause
dfx canister call job unpause
```

---

## Coming Soon

### Privacy & Selective Disclosure via ICP vetKeys

ICP's [vetKeys](https://internetcomputer.org/docs/current/developer-docs/integrations/vetkeys/) will enable privacy-preserving features without a centralized key custodian:

- **Encrypted job records** — homeowners encrypt maintenance records on-chain; only authorized principals obtain the decryption key from the canister
- **Buyer disclosure packages** — share a time-limited, scoped view of verified history without exposing raw cost or contractor data
- **Contractor-gated access** — contractors can only read the job records they are linked to

> **Note:** `test_key_1` is available on local replicas and testnets today. Production use of `key_1` on ICP mainnet requires DFINITY approval. HomeGentic will ship this feature once mainnet access is generally available.

### ICP Blob Storage Subnet

ICP storage costs are currently paid in cycles (stable memory at ~$5/GB/year). A dedicated ICP blob storage subnet (analogous to S3) is in development. When it ships, the admin dashboard will track it as a separate expense line automatically.

---

## License

MIT © HomeGentic 2026
