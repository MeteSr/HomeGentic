# HomeFax

**The Carfax for Homes** — Blockchain-verified home maintenance history on the Internet Computer Protocol (ICP).

HomeFax gives homeowners an immutable, tamper-proof record of every repair, upgrade, and inspection. Buyers and agents can verify a property's full history before closing — building trust and increasing home values.

---

## Stack

| Layer | Technology |
|---|---|
| Blockchain | Internet Computer Protocol (ICP) |
| Backend | Motoko canisters (13 total) |
| Auth | ICP Internet Identity |
| Frontend | React + TypeScript + Vite |
| AI Agent | Node.js + Claude API (Anthropic) — voice assistant proxy |

---

## Backend Canisters

| Canister | Responsibility |
|---|---|
| `auth` | User registration, profiles, role management (Homeowner / Contractor / Realtor) |
| `property` | Property registration, ownership verification (Unverified → PendingReview → Basic → Premium), 7-day conflict window |
| `job` | Maintenance job tracking with dual-signature verification (homeowner + contractor, or DIY homeowner-only) |
| `contractor` | Contractor profiles, specialties, trust scores, rate-limited reviews |
| `quote` | Quote requests & contractor bids, tier-enforced open-request limits |
| `payment` | Subscription tier management and expiry tracking |
| `photo` | Job photo storage with SHA-256 deduplication and tier-based quota enforcement |
| `price` | Static pricing table queries (read-only, no state) |
| `report` | Immutable report snapshots, share links with visibility levels and revocation |
| `market` | ROI-ranked project recommendations and competitive analysis (2024 Remodeling Magazine data) |
| `maintenance` | Predictive scheduling engine, system lifespan estimates, seasonal task generation |
| `sensor` | IoT device registry (Nest, Ecobee, Moen Flo); auto-creates pending jobs on Critical events |
| `monitoring` | Cycles usage, cost metrics, profitability analysis (ARPU/LTV/CAC), alerting |

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
```

### 2. Configure environment

```bash
cp .env.example .env
# Fill in ANTHROPIC_API_KEY (required for voice agent)
# Canister IDs are populated automatically by deploy script
```

### 3. Start everything

```bash
make dev
# Starts local ICP replica, deploys all 13 canisters, and runs the frontend dev server
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

The voice agent requires `ANTHROPIC_API_KEY` in `.env`. All other env vars have defaults for local development.

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
| `VOICE_AGENT_PORT` | `3001` | Port for the Express proxy. |
| `FRONTEND_ORIGIN` | `http://localhost:5173` | CORS allowed origin. |
| `VITE_VOICE_AGENT_URL` | `http://localhost:3001` | Proxy URL used by the frontend. |

---

## Project Structure

```
homefax/
├── dfx.json                      # ICP canister configuration (13 canisters + Internet Identity)
├── mops.toml                     # Motoko package manager config
├── package.json                  # Root scripts
├── Makefile                      # make dev / deploy / test / upgrade / clean
├── .env.example                  # Environment variable template
│
├── backend/                      # Motoko canisters
│   ├── auth/main.mo
│   ├── property/main.mo
│   ├── job/main.mo
│   ├── contractor/main.mo
│   ├── quote/main.mo
│   ├── payment/main.mo
│   ├── photo/main.mo
│   ├── price/main.mo
│   ├── report/main.mo
│   ├── market/main.mo
│   ├── maintenance/main.mo
│   ├── sensor/main.mo
│   └── monitoring/main.mo
│
├── agents/                       # AI agent services
│   ├── voice/                    # Active — Claude voice assistant proxy
│   │   ├── server.ts             # Express + SSE streaming → Claude API
│   │   ├── prompts.ts            # Dynamic system prompt builder
│   │   ├── tools.ts              # Claude tool definitions
│   │   └── types.ts
│   ├── iot-gateway/              # IoT event ingestion (in development)
│   └── maintenance/              # Predictive maintenance prompts (in development)
│
├── frontend/                     # React + Vite SPA
│   └── src/
│       ├── components/           # Layout, Button, Badge, VoiceAgent, etc.
│       ├── hooks/useVoiceAgent.ts # Web Speech API + SSE stream + TTS
│       ├── pages/                # 18 pages (landing → dashboard → property → job → ...)
│       ├── services/             # ICP canister actor clients + agentTools.ts
│       ├── store/                # Zustand: authStore, propertyStore, jobStore
│       └── contexts/AuthContext.tsx
│
├── dashboard/                    # Standalone monitoring SPA (admin)
│
├── tests/
│   └── e2e/                      # Playwright end-to-end tests
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── API.md
│   ├── DEPLOYMENT.md
│   └── SECURITY.md
│
└── scripts/
    ├── deploy.sh                 # Deploy all canisters, write canister IDs to .env
    ├── upgrade.sh                # Safe canister upgrade (preserves stable state)
    ├── status.sh                 # Show canister IDs and health
    ├── init-test-data.sh         # Seed test users and properties
    ├── load-test.sh
    └── cleanup.sh                # Reset local dfx state
```

---

## Subscription Tiers

| Tier | Properties | Photos/Job | Open Quote Requests | Price |
|---|---|---|---|---|
| Free | 1 | 5 | 3 | $0 |
| Pro | 5 | 20 | 10 | $10/mo |
| Premium | 25 | Unlimited | 10 | $49/yr |
| ContractorPro | Unlimited | 50 | Unlimited | $49/mo |

Limits are enforced server-side in the `property`, `photo`, and `quote` canisters.

---

## Testing

```bash
# Unit tests (Vitest)
cd frontend && npm run test:unit

# End-to-end tests (Playwright — requires running replica + frontend)
npm run test:e2e
npm run test:e2e:ui

# Backend canister tests (bash)
make test
```

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

> **Note:** `test_key_1` is available on local replicas and testnets today. Production use of `key_1` on ICP mainnet requires DFINITY approval. HomeFax will ship this feature once mainnet access is generally available.

---

## License

MIT © HomeFax 2026
