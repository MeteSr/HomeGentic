# HomeFax

**The Carfax for Homes** — Blockchain-verified home maintenance history on the Internet Computer Protocol (ICP).

HomeFax gives homeowners an immutable, tamper-proof record of every repair, upgrade, and inspection. Buyers and agents can verify a property's full history before closing — building trust and increasing home values.

---

## Stack

| Layer | Technology |
|---|---|
| Blockchain | Internet Computer Protocol (ICP) |
| Backend | Motoko canisters (9 total) |
| Auth | ICP Internet Identity |
| Frontend | React + TypeScript + Vite |
| AI Agents | Node.js + Claude API (Anthropic) |

---

## Backend Canisters

| Canister | Responsibility |
|---|---|
| `auth` | User registration, profiles, role management (Homeowner / Contractor / Realtor) |
| `property` | Property registration, verification, tier-based limits |
| `job` | Maintenance job tracking with dual-signature verification |
| `contractor` | Contractor profiles, specialty, trust scores |
| `quote` | Quote request / submission with tier-based rate limiting |
| `payment` | Subscription management and tier tracking |
| `photo` | Job photo storage with SHA-256 deduplication and quota enforcement |
| `price` | Static pricing table for all subscription tiers |
| `monitoring` | Cost tracking, metrics aggregation, profitability analysis, alerting |

---

## AI Agents

| Agent | Location | Status |
|---|---|---|
| Voice Assistant | `agents/voice/` | Active |
| Predictive Maintenance | `agents/maintenance/` | Planned |
| Market Intelligence | `agents/market/` | Planned |
| Scheduling | `agents/scheduling/` | Planned |

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
# Canister IDs are populated automatically by dfx deploy
```

### 3. Deploy canisters locally

```bash
dfx start --background
dfx deploy
```

### 4. Start the frontend

```bash
npm run frontend
# → http://localhost:5173
```

### 5. Start the voice agent proxy

```bash
cd agents/voice && npm run dev
# → http://localhost:3001
```

The voice agent requires `ANTHROPIC_API_KEY` in `.env`. All other env vars have defaults for local development.

---

## Voice Agent

The voice agent is a floating mic button that appears on every page. Users tap it, speak a question, and hear a spoken response — powered by Claude.

**What it knows:**
- The authenticated user's registered properties and recent job history (pulled live from ICP canisters)
- Home maintenance best practices and schedules
- Upgrade ROI and cost estimates
- How maintenance history affects property value and resale
- Contractor selection guidance
- Building system lifespans and repair vs replace decisions

**How it works:**

```
User speaks
  → Web Speech API (browser, no cost)
  → useVoiceAgent hook fetches property + job context from ICP
  → POST agents/voice/server.ts  { message, context }
  → Express proxy builds scoped system prompt, calls Claude (streaming)
  → Text streams back into speech bubble word-by-word
  → SpeechSynthesis reads full response aloud
```

**To add it to a page**, import and render `<VoiceAgent />` — it positions itself fixed bottom-right:

```tsx
import { VoiceAgent } from "../components/VoiceAgent";

export function Layout({ children }) {
  return (
    <div>
      {children}
      <VoiceAgent />
    </div>
  );
}
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
├── dfx.json                      # ICP canister configuration
├── package.json                  # Root scripts
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
│   └── monitoring/main.mo
│
├── agents/                       # AI agents
│   └── voice/
│       ├── server.ts             # Express proxy → Claude API
│       ├── prompts.ts            # System prompt builder
│       ├── types.ts              # Shared request/context types
│       ├── package.json
│       └── tsconfig.json
│
├── frontend/                     # React + Vite app
│   ├── src/
│   │   ├── components/
│   │   │   └── VoiceAgent.tsx    # Floating mic button + speech bubble
│   │   ├── hooks/
│   │   │   └── useVoiceAgent.ts  # Web Speech API + SSE stream + TTS
│   │   ├── services/             # ICP canister actor clients
│   │   └── pages/
│   └── package.json
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── API.md
│   ├── DEPLOYMENT.md
│   └── SECURITY.md
│
└── scripts/
    ├── deploy.sh
    ├── status.sh
    └── upgrade.sh
```

---

## Subscription Tiers

| Tier | Properties | Open Quote Requests | Photos/Job | Price |
|---|---|---|---|---|
| Free | 1 | 3 | 5 | $0 |
| Pro | 5 | 10 | 50 | $9/mo |
| Premium | 25 | 10 | 100 | $49/yr |
| ContractorPro | Unlimited | Unlimited | 200 | $29/mo |

---

## Manual Test Commands

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

# Link a contractor principal
dfx canister call job linkContractor '("JOB_1", principal "aaaaa-aa")'

# Sign verification (homeowner)
dfx canister call job verifyJob '("JOB_1")'
```

### Quote canister

```bash
# Create a quote request (Free tier)
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

### Monitoring canister

```bash
# Push canister metrics
dfx canister call monitoring recordCanisterMetrics '(
  principal "aaaaa-aa", 8000000000000, 500000000,
  104857600, 4294967296, 1000, 12, 450
)'

# Get active alerts
dfx canister call monitoring getActiveAlerts

# Get cost breakdown
dfx canister call monitoring calculateCostMetrics '(150)'
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

ICP's [vetKeys](https://internetcomputer.org/docs/current/developer-docs/integrations/vetkeys/) (verifiable encrypted threshold keys) will enable privacy-preserving features without a centralized key custodian:

- **Encrypted job records** — homeowners encrypt maintenance records on-chain; only explicitly authorized principals (e.g. a buyer's agent) can obtain the decryption key from the canister
- **Buyer disclosure packages** — share a time-limited, scoped view of a property's verified history without exposing raw cost or contractor data
- **Contractor-gated access** — contractors can only read the job records they are linked to

> **Note:** vetKeys (`test_key_1`) are available on local replicas and testnets today. Production use of `key_1` on ICP mainnet is experimental and requires DFINITY approval. HomeFax will ship this feature once mainnet access is generally available.

---

## License

MIT © HomeFax 2025
