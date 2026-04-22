# HomeGentic — Architecture

HomeGentic is a **home maintenance intelligence platform** built entirely on the
Internet Computer Protocol (ICP). Every record — job, photo hash, score,
report, quote — lives as stable on-chain state inside Motoko canisters.
No traditional database. No centralized server. No single point of failure.

---

## The Big Picture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Browser (SPA)                                   │
│                                                                         │
│   React + TypeScript · Vite · Zustand · inline styles (no CSS framework)│
│                                                                         │
│   Public pages         │  Authenticated pages    │  Shared widgets      │
│   /  /pricing          │  /dashboard             │  VoiceAgent (mic)    │
│   /check               │  /properties/:id        │  Toasts              │
│   /home-systems        │  /maintenance           │  Layout / Badge      │
│   /prices              │  /market                │  ScoreValueBanner    │
│   /instant-forecast    │  /quotes/:id            │                      │
│   /report/:token       │  /jobs/new              │                      │
│   /cert/:token         │  /settings              │                      │
│   /neighborhood/:zip   │  /sensors               │                      │
│                        │  /warranties            │                      │
│                        │  /recurring/:id         │                      │
│                        │  /listing/:id           │                      │
│                        │  /agents                │                      │
└────────────┬───────────┴──────────┬──────────────┴──────────────────────┘
             │                      │
             │ @dfinity/agent       │ fetch (mocked when no canister)
             │ (Candid RPC)         │
             ▼                      ▼
┌────────────────────┐   ┌──────────────────────────────────────────────┐
│   ICP Local/Main   │   │           Voice Agent Proxy (Node/Express)   │
│     Replica        │   │                  :3001                       │
│                    │   │                                              │
│  17 Motoko         │   │  POST /api/agent   ── agentic tool-use loop  │
│  canisters         │   │  POST /api/chat    ── SSE streaming chat     │
│  (see below)       │   │  GET  /api/check   ── buyer report lookup    │
│                    │   │  GET  /api/price-benchmark                   │
└────────────────────┘   │  GET  /api/lookup-year-built                 │
                         │  GET  /api/instant-forecast                  │
                         │                                              │
                         │  Calls: Claude API (Anthropic)               │
                         └──────────────────────────────────────────────┘
```

---

## Canister Map

All 17 canisters use `persistent actor` (Motoko mo:core) — all variables
are implicitly stable, so no `preupgrade`/`postupgrade` hooks are needed.
`transient var` is used for in-memory structures that should reset on upgrade
(e.g. rate-limit sliding-window maps). Each canister exports `metrics()`,
`pause()`, and `unpause()` for operational control.

```
┌──────────────────┬─────────────────────────────────────────────────────────┐
│ Canister         │ What it owns                                            │
├──────────────────┼─────────────────────────────────────────────────────────┤
│ auth             │ User profiles, roles (Homeowner / Contractor / Realtor) │
│                  │ Internet Identity principal mapping                     │
├──────────────────┼─────────────────────────────────────────────────────────┤
│ property         │ Property registration & ownership verification          │
│                  │ Verification pipeline: Unverified → PendingReview →     │
│                  │   Basic → Premium; 7-day conflict window                │
│                  │ Room / fixture CRUD (merged from former room canister)  │
├──────────────────┼─────────────────────────────────────────────────────────┤
│ job              │ Maintenance records with dual-signature verification:   │
│                  │   homeowner + contractor, or DIY homeowner-only         │
│                  │ Immutable once both parties have signed                 │
├──────────────────┼─────────────────────────────────────────────────────────┤
│ contractor       │ Contractor profiles, trust scores                       │
│                  │ Rate-limited reviews (10/day/user, composite-key dedup) │
├──────────────────┼─────────────────────────────────────────────────────────┤
│ quote            │ Quote requests & contractor bids                        │
│                  │ Tier-enforced open-request limits                       │
├──────────────────┼─────────────────────────────────────────────────────────┤
│ payment          │ Subscription tier management & expiry                   │
│                  │ Pricing table queries: getPricing(tier) / getAllPricing()│
│                  │   (merged from former price canister)                   │
├──────────────────┼─────────────────────────────────────────────────────────┤
│ photo            │ SHA-256 deduplication of job photos                     │
│                  │ Tier-based upload quotas                                │
│                  │ Multi-approval workflow for sensitive records           │
├──────────────────┼─────────────────────────────────────────────────────────┤
│ report           │ Immutable report snapshots (point-in-time score + jobs) │
│                  │ Share links with visibility levels & revocation         │
├──────────────────┼─────────────────────────────────────────────────────────┤
│ market           │ ROI-ranked project recommendations                      │
│                  │   (sourced from 2024 Remodeling Magazine cost data)     │
├──────────────────┼─────────────────────────────────────────────────────────┤
│ maintenance      │ Predictive scheduling engine                            │
│                  │ System lifespan estimates, seasonal task generation     │
├──────────────────┼─────────────────────────────────────────────────────────┤
│ sensor           │ IoT device registry (12 device types: Nest, Ecobee,     │
│                  │ Moen Flo, Ring Alarm, Honeywell Home, Rheem EcoNet,     │
│                  │ Sense, Emporia Vue, Rachio, SmartThings, Home Assistant,│
│                  │ Manual). Auto-creates pending jobs for Critical events.  │
├──────────────────┼─────────────────────────────────────────────────────────┤
│ monitoring       │ Cycles usage, cost metrics                              │
│                  │ Profitability signals: ARPU / LTV / CAC; alerting      │
├──────────────────┼─────────────────────────────────────────────────────────┤
│ listing          │ FSBO listing lifecycle, sealed-bid offers, agent match  │
├──────────────────┼─────────────────────────────────────────────────────────┤
│ agent            │ Realtor profiles, reviews, HomeGentic transaction count    │
├──────────────────┼─────────────────────────────────────────────────────────┤
│ recurring        │ Recurring service contracts (HVAC, pest, landscaping)  │
│                  │ Visit logs per contract                                 │
├──────────────────┼─────────────────────────────────────────────────────────┤
│ bills            │ Utility bill records per property (Electric, Gas, Water,│
│                  │ Internet, Telecom). 3-month rolling anomaly detection    │
│                  │ flags bills > 20% above baseline. Anomaly events surface│
│                  │ in the Activity feed bell drawer.                        │
├──────────────────┼─────────────────────────────────────────────────────────┤
│ ai_proxy         │ IC HTTP outcalls: permit imports (ArcGIS / OpenPermit)  │
│                  │ and transactional email via Resend. Requires             │
│                  │ `RESEND_API_KEY` in `.env`.                              │
└──────────────────┴─────────────────────────────────────────────────────────┘
```

---

## Subscription Tiers

Enforced server-side inside `payment`, `quote`, `photo`, and `property`.
The frontend reflects tier state but never gates logic unilaterally.

```
┌──────────────────┬──────────┬──────────┬──────────┬───────────────┬───────────────┐
│                  │  Basic   │   Pro    │ Premium  │ContractorFree │ ContractorPro │
├──────────────────┼──────────┼──────────┼──────────┼───────────────┼───────────────┤
│ Price            │ $10 / mo │ $20 / mo │ $40 / mo │ $0            │ $30 / mo      │
│ Properties       │ 1        │ 5        │ 20       │ 0             │ unlimited     │
│ Photos / job     │ 5        │ 10       │ 30       │ 5             │ 50            │
│ Open quote reqs  │ 3        │ 10       │ unlimited│ unlimited     │ unlimited     │
└──────────────────┴──────────┴──────────┴──────────┴───────────────┴───────────────┘
```

All limits are enforced server-side in the `payment`, `quote`, `photo`, and `property` canisters.

---

## Frontend Architecture

### Service Layer

Every service file under `frontend/src/services/` embeds the Candid IDL
factory inline and follows the same fallback contract:

```typescript
if (!CANISTER_ID) return mockData;   // canister not deployed → use fixture
```

Canister IDs are injected at build time via `vite.config.ts` `define` block,
populated from the `.env` written by `scripts/deploy.sh`.

### State Management

Three Zustand stores, kept deliberately lean:

- **`authStore`** — `isAuthenticated`, `principal`, `profile`, `isLoading`
- **`propertyStore`** — cached `properties[]`
- **`jobStore`** — cached `jobs[]`

### Auth Flow

`AuthContext.tsx` wraps the entire app. In production it uses
`@dfinity/auth-client` (Internet Identity). In local dev, `devLogin()`
injects a fixed-seed Ed25519 identity so hot-reloads don't re-authenticate.
E2E tests inject `window.__e2e_principal` via `addInitScript`, which
`AuthContext` detects and uses to skip Identity entirely.

### Code Splitting

Landing, Login, and Pricing are bundled statically (first-paint critical
path). Every other page is `React.lazy()` — loaded on first navigation,
split into separate Vite chunks.

---

## Voice Agent

A standalone Node/Express proxy at `agents/voice/` (port 3001) bridges the
browser to the Claude API. It is intentionally outside ICP — it needs
Anthropic SDK streaming, which the browser's CORS environment can't do
directly.

```
User speaks
    │
    ▼ Web Speech API (browser)
useVoiceAgent hook
    │  builds context: live properties + jobs from ICP canisters
    ▼
POST /api/agent   ──►  Express proxy
                            │
                            ▼
                       Claude API (claude-opus-4-6)
                       system prompt + tool definitions
                            │
                     ┌──────┴──────────────────────┐
                     │ tool_calls?                 │ answer?
                     ▼                             ▼
              executeTool()                  setResponse()
              (frontend dispatches            SpeechSynthesis
               to real canister)             reads text aloud
                     │
                     └──► next turn (max 5 turns)
```

Tool calls are executed on the **frontend** (not the proxy), so they hit
the real ICP canisters with the user's identity. The proxy only sees
serialized context and tool results — never raw canister credentials.

Max response: 200 tokens, 2–3 sentences, tuned for speech rhythm.

---

## Public-Facing Pages (No Login Required)

These pages are designed for buyers, curious homeowners, and SEO — they
load without authentication and call the voice-agent relay for data.

| Route                      | What it does                                                    |
|----------------------------|-----------------------------------------------------------------|
| `/check?address=`          | Buyer lookup — checks if a HomeGentic report exists for an address |
| `/report/:token`           | Public report view — shareable snapshot with visibility levels  |
| `/cert/:token`             | Score certificate — embeddable proof of HomeGentic score           |
| `/badge/:token`            | Shareable verified badge                                        |
| `/home-systems`            | System Age Estimator — year built → urgency table for 9 systems |
| `/instant-forecast`        | Instant Forecast — address + year built → 10-yr maintenance budget, per-system override inputs |
| `/prices`                  | Price Intelligence — contractor cost benchmarks by service + zip |
| `/neighborhood/:zipCode`   | Neighborhood Health Index — aggregate zip-level maintenance data |

---

## Data Persistence Model

All canisters use `persistent actor` with `mo:core/Map` (a functional B-tree):

```
persistent actor {
  // All vars are implicitly stable — survive upgrades automatically.
  // No preupgrade / postupgrade hooks needed.
  private var records : Map.Map<Text, Record> = Map.empty();

  // Exception: transient var resets on upgrade (correct for rate-limit windows)
  private transient var updateCallLimits : Map.Map<Text, (Nat, Int)> = Map.empty();
}
```

`mo:core/Map` is a purely functional B-tree that lives in stable memory natively.
Reads are O(log n); writes via `Map.add` / `Map.delete` return new tree roots.

Photos are stored as SHA-256 hashes only — raw bytes live off-chain.
The hash on-chain provides tamper evidence without consuming cycle budget.

Reports are immutable snapshots: once generated, the `report` canister
freezes the score + job list at that moment. Subsequent job additions
do not alter existing reports.

---

## Design System

No CSS framework. All styling is inline React styles. Tokens are defined
as `const S = { ... }` at the top of each component file. The aesthetic
is editorial — sharp corners, warm paper tones, serif display type.

```
ink:      #0E0E0C   near-black text
paper:    #F4F1EB   warm off-white background
rule:     #C8C3B8   warm gray borders
rust:     #C94C2E   primary accent (CTAs, critical urgency)
inkLight: #7A7268   muted / secondary text
sage:     varies    success states, verification badges

serif:    'Playfair Display', Georgia, serif   — headings (700/900)
mono:     'IBM Plex Mono', monospace           — labels, nav, data
sans:     'IBM Plex Sans', sans-serif          — body (weight 300–500)
```

Rules: **no border-radius anywhere** (sharp editorial corners).
Section labels are mono uppercase ~0.65rem with letter-spacing.
Google Fonts loaded once in `frontend/index.html`.

---

## Monorepo Layout

```
backend/
  agent/          ai_proxy/       auth/         bills/
  contractor/     job/            listing/      maintenance/
  market/         monitoring/     payment/      photo/
  property/       quote/          recurring/    report/
  sensor/
  — each has main.mo + test.sh

frontend/
  src/
    pages/        — one file per route (~45 pages)
    components/   — shared UI (Button, Badge, Layout, VoiceAgent, …)
    services/     — canister bindings + mock fallbacks
    hooks/        — useVoiceAgent, useAuth, …
    store/        — authStore, propertyStore, jobStore (Zustand)
    contexts/     — AuthContext
  index.html      — Google Fonts, global reset

agents/
  voice/          — Node/Express proxy for Claude API (port 3001)
  iot-gateway/    — IoT event ingestion (scaffolded)

tests/
  e2e/            — Playwright specs (~36 spec files)

dashboard/        — standalone admin monitoring SPA
scripts/          — deploy.sh, upgrade.sh, test-backend.sh, init-test-data.sh
docs/             — ARCHITECTURE.md, API.md, DEPLOYMENT.md, SECURITY.md, BACKLOG.md
```

---

## Local Development

```bash
make dev          # replica + all 16 canisters + frontend in one command
make frontend     # Vite dev server only (:5173)
cd agents/voice && npm run dev   # voice proxy (:3001)

cd frontend && npm run test:unit          # Vitest unit tests
npm run test:e2e                          # Playwright E2E (needs replica + frontend)
make test                                 # backend canister tests
```

`.env` is auto-written by `scripts/deploy.sh` with all `CANISTER_ID_*` vars.
Copy `.env.example` → `.env` and add `ANTHROPIC_API_KEY` to enable the voice agent.
