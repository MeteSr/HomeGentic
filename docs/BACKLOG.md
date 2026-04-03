# HomeFax Product Backlog

Derived from the HomeFax product vision. Items are grouped by domain, tagged with estimated complexity (S/M/L/XL), and annotated with what already exists in the codebase.

---

## Legend

| Tag | Meaning |
|-----|---------|
| ✅ Exists | Already built (canister + frontend) |
| 🟡 Partial | Scaffolding exists, feature incomplete |
| ⬜ Missing | Not yet started |
| S / M / L / XL | Story size: Small (<1 day) / Medium (1–3 days) / Large (1 week) / Extra-large (2+ weeks) |

---

## 1. Home Management — Differentiated Ops

### 1.2 "Home Genome" Onboarding
**Vision:** NLP-powered bulk document ingestion at signup — PDFs, photos, receipts, inspection reports all parsed and auto-categorized into the historical record.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 1.2.2 | Claude-powered document classification | ⬜ Missing | L | POST files to voice agent server; Claude Vision classifies type (receipt/inspection/permit) |

### 1.3 Utility Intelligence Layer
**Vision:** Connect to utility accounts and flag anomalies (water spike → possible leak, HVAC runtime increase → refrigerant loss).

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 1.3.1 | Utility account OAuth integration | ⬜ Missing | XL | Integrate Green Button API (electricity/gas) + WaterSmart or utility-specific APIs |
| 1.3.2 | Usage baseline modeling per property | ⬜ Missing | L | Store monthly utility readings; compute rolling baseline in `sensor` or new `utility` canister |
| 1.3.3 | Anomaly detection engine | ⬜ Missing | L | Statistical threshold alerts (>15% deviation); wire into `sensor` canister alert model |
| 1.3.4 | Anomaly → pending job auto-creation | 🟡 Partial | M | `sensor` canister already auto-creates pending jobs for Critical IoT events; extend to utility anomalies |
| 1.3.5 | Utility dashboard UI | ⬜ Missing | M | New page or tab showing usage trends, baselines, anomaly events |
| 1.3.6 | Smart meter direct integration (IoT) | ⬜ Missing | XL | `agents/iot-gateway` scaffolded but not implemented; extend for utility meters |

## 2. Service Provider Network — Trust Infrastructure

### 2.2 Escrow-Protected Job Completion
**Vision:** Payment held in ICP smart contract escrow; released automatically when homeowner approves the job.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 2.2.1 | Escrow canister | ⬜ Missing | XL | New Motoko canister: create escrow on job creation, release on homeowner approval, refund on dispute |
| 2.2.2 | ICP token / cycles integration | ⬜ Missing | XL | Integrate with ICP Ledger canister for actual token movement |
| 2.2.3 | Escrow UI in quote flow | ⬜ Missing | L | Show escrow amount during quote acceptance; "Release Payment" button on job completion |
| 2.2.4 | Dispute resolution flow | ⬜ Missing | L | Timed dispute window; admin arbitration; partial release logic |
| 2.2.5 | Payment release = homeowner signature | ⬜ Missing | M | Wire `verifyJob()` homeowner sign to trigger escrow release |

### 2.4 Contractor Bidding with vetKeys Sealed Bids
**Vision:** Homeowners see bids; contractors cannot see each other's prices. Bids are encrypted under the canister's IBE-derived key so only the canister can open them; after the window closes the canister compares in-canister and reveals only the winner.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 2.4.1 | Sealed-bid quote submission | ✅ Exists | L | `sealedBidService.submitSealedBid()` stores IBE ciphertext (mock: base64 JSON; production: vetKeys IBE); canister `submitSealedBid()` enforces window + indexes by contractor; ciphertext never exposes plaintext amount |
| 2.4.2 | vetKeys sealed-bid reveal | ✅ Exists | L | `sealedBidService.revealBids()` + canister `revealBids()` — decrypts all bids after closeAt, marks lowest isWinner; in production canister calls `vetkd_derive_key`; mock uses little-endian byte decode |
| 2.4.3 | Bid window timer | ✅ Exists | M | `QuoteRequest.closeAt: ?Time.Time`; `isBidWindowOpen()` helper; `submitSealedBid` rejects after closeAt; `revealBids` rejects before closeAt; `createSealedBidRequest` requires future closeAt |
| 2.4.4 | Blind bidding UI | ✅ Exists | M | `getMyBid()` returns own ciphertext only (no amountCents field); `getRevealedBids()` empty before reveal, returns all bids with amounts after; `getWinner()` returns lowest-bid RevealedBid |

---

## 3. ICP Blockchain Layer — Untouchable Differentiation

### 3.3 "Dead Man's Switch" Continuity
**Vision:** If HomeFax ceases to exist, homeowner records remain fully accessible on ICP.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 3.3.2 | Public read query on all record canisters | ⬜ Missing | M | Unauthenticated queries for property/job/photo data given owner principal |
| 3.3.4 | "Your data, your keys" marketing page | ⬜ Missing | S | Landing page section explaining ICP data sovereignty |

### 3.4 ICP-Native Home Title Tokens
**Vision:** Partner with title companies to tokenize property deeds on ICP.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 3.4.1 | ICRC-1 / ICRC-7 NFT canister for title | ⬜ Missing | XL | Implement an NFT standard canister; each token = one property title |
| 3.4.2 | Title company API integration | ⬜ Missing | XL | Partner integration; legal/regulatory layer required |
| 3.4.3 | Tokenized deed display in HomeFax Report | ⬜ Missing | M | Show "Title token on-chain since [date]" badge in report |

---

## 4. vetKeys — Privacy as a Feature

### 4.1 Selective Disclosure Reports
**Vision:** Sellers choose exactly what to share. vetKeys-attested "all permits closed" without revealing contractor or cost.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 4.1.3 | vetKeys permit attestation | ⬜ Missing | M | Canister derives per-buyer key via `vetkd_derive_key`, issues IBE-encrypted signed "all permits closed" claim; buyer decrypts attestation with transport key, never sees underlying job data |
| 4.1.4 | vetKeys score threshold attestation | ⬜ Missing | M | Canister computes score, issues IBE-encrypted signed "score ≥ N" claim to requester's transport key without exposing individual job records |

### 4.2 Income-Blind Mortgage Proof
**Vision:** Prove property maintained above a quality threshold to lenders — without personal financial disclosure.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 4.2.3 | vetKeys score certificate | ⬜ Missing | L | Canister issues IBE-encrypted signed score attestation to lender's transport key; lender decrypts and reads score, no raw job records exposed |

### 4.3 Anonymous Neighborhood Benchmarking
**Vision:** Compare maintenance score vs. similar homes in zip code — without revealing individual neighbor data.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 4.3.4 | vetKeys aggregate privacy | ⬜ Missing | L | Individual scores encrypted on-chain under per-homeowner derived keys; canister aggregates internally and publishes only zip-level statistics — no individual record exposed |

### 4.4 Buyer Verification Without Disclosure
**Vision:** Buyer proves pre-approval to seller without revealing loan amount or lender.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 4.4.1 | Buyer pre-approval credential schema | ⬜ Missing | L | Define verifiable credential structure; integrate with a lending API |
| 4.4.2 | vetKeys IBE pre-approval attestation | ⬜ Missing | L | Lender issues credential encrypted to buyer's principal via IBE; canister verifies and re-issues "pre-approved ≥ $X" attestation encrypted to seller's transport key — exact amount never leaves the buyer |
| 4.4.3 | Buyer credential UI in transaction flow | ⬜ Missing | M | Buyer submits credential; seller sees "Verified: pre-approved" only |

---

## 5. AI Agents — The Self-Writing Internet Angle

### 5.2 Negotiation Agents
**Vision:** AI negotiates contractor bids on homeowner's behalf using network-wide pricing history.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 5.2.1 | Historical pricing data aggregation | 🟡 Partial | M | `market` canister has cost data; needs per-zip, per-service-type pricing history |
| 5.2.2 | Negotiation agent tool | ⬜ Missing | L | Claude agent with access to pricing benchmarks; generates counter-offer rationale |
| 5.2.3 | Negotiation UI | ⬜ Missing | M | "Let HomeFax negotiate" toggle in `QuoteDetailPage` |

### 5.3 Market Timing Intelligence
**Vision:** AI tells you when your HomeFax score + local inventory makes listing favorable. "Listing in Q1 could yield 6–9% above comps."

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 5.3.1 | Local real estate data ingestion | ⬜ Missing | L | Integrate with Zillow / ATTOM / MLS API for inventory and days-on-market data |
| 5.3.2 | Score-to-premium model | ⬜ Missing | L | Regression model: HomeFax score × zip × season → estimated price premium |
| 5.3.3 | Market timing alert | ⬜ Missing | M | Push notification / dashboard banner: "Now is a good time to list" |

### 5.4 Autonomous Permit Research
**Vision:** When a contractor proposes a renovation, AI pre-checks permit requirements and drafts the application.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 5.4.1 | Municipal permit API integration | ⬜ Missing | XL | Per-city permit data; no universal API exists — requires city-by-city or OpenPermit integration |
| 5.4.2 | Permit requirement lookup tool | ⬜ Missing | L | Agent tool: given service type + zip, returns permit required Y/N + estimated cost |
| 5.4.5 | Permit application draft generation | ⬜ Missing | L | Agent drafts permit application text from job details; user downloads/submits |

---

## 6. HomeFax Report — The Resale Weapon

### 6.2 Listing Platform Integration & Badge
**Vision:** HomeFax-verified homes display a badge on Zillow/Realtor.com.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 6.2.3 | Zillow / Realtor.com API partnership | ⬜ Missing | XL | Requires partner API access; long-term business development item |

### 6.3 Buyer Q&A via vetKeys
**Vision:** Buyer asks "Has the roof been replaced since 2010?" → vetKeys-attested yes/no, no seller manual response needed.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 6.3.1 | Buyer Q&A interface on shared report | ⬜ Missing | M | Buyers submit yes/no questions against the report; seller not required to respond manually |
| 6.3.2 | Automated answer engine | ⬜ Missing | L | Query job records against structured question templates; return verified answer |
| 6.3.3 | vetKeys canister attestation | ⬜ Missing | L | Canister queries its own on-chain records, derives the yes/no answer, and issues an IBE-encrypted signed response to the buyer's transport key — cryptographically bound to chain state, underlying records never revealed |

### 6.5 "HomeFax Certified" Pre-Inspection Waiver
**Vision:** Score ≥ 88 qualifies for waived/discounted inspection contingency — killer feature in competitive markets.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 6.5.3 | Insurance / buyer agent API | ⬜ Missing | XL | Partner program for insurers/agents to programmatically verify certification; legal framework needed |

---

## 7. Platform & Business Model Differentiation

### 7.1 Homeowner-Owned Data Sovereignty
**Vision:** Explicitly market that data lives on ICP canisters the homeowner owns — HomeFax is just the interface.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 7.1.3 | "Verified on ICP" explorer links | ⬜ Missing | S | Link each record to ic.rocks or dashboard.internetcomputer.org for independent verification |

### 7.2 Builder / Developer Onboarding
**Vision:** New construction developers create HomeFax records before first owner — home arrives with a score and full build record.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 7.2.1 | Builder account role | ⬜ Missing | M | New role in `auth` canister; can create properties without Internet Identity ownership check |
| 7.2.2 | Bulk property import | ⬜ Missing | L | CSV/API upload of a development's unit list; creates property records in batch |
| 7.2.3 | Subcontractor record import | ⬜ Missing | L | Builder uploads all subcontractor job records during construction phase |
| 7.2.4 | Ownership transfer to first buyer | ⬜ Missing | M | Builder initiates transfer at closing; buyer accepts via Internet Identity |
| 7.2.5 | Builder dashboard | ⬜ Missing | M | Builder views all their developments + per-unit HomeFax scores |

### 7.3 Insurance Premium Integration
**Vision:** Partner with home insurers to offer premium discounts for high HomeFax scores.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 7.3.1 | Insurer-facing score API | ⬜ Missing | M | Authenticated API endpoint: given property ID, return score + key risk factors |
| 7.3.2 | Score-to-risk mapping model | ⬜ Missing | L | Map HomeFax dimensions (HVAC age, roof age, verified maintenance) to actuarial risk factors |
| 7.3.3 | Insurance partner program page | ⬜ Missing | S | Marketing/landing page for insurer partnerships |
| 7.3.4 | Premium discount display for homeowner | ⬜ Missing | M | "Your score qualifies you for up to 12% off your home insurance — connect your insurer" |

### 7.4 Neighborhood Health Index
**Vision:** Aggregate (vetKeys-encrypted individual records) data by zip code → HOA, city planner, and investor product.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 7.4.3 | HOA portal | ⬜ Missing | XL | HOA admin can see aggregate scores for their community; cannot see individual homeowner data |
| 7.4.4 | Investor / city planner data product | ⬜ Missing | XL | Paid API for block-level risk analysis; city planning / insurance underwriting use case |

---

## 8. Retention & Anti-Churn — Designing Out Cancellation

The core retention challenge for HomeFax: value delivery is irregular. Homeowners don't engage daily, so perceived value dies in quiet periods. Every item below addresses a specific churn cause identified in the retention analysis.

### 8.1 Weekly AI-Powered Home Pulse
**Vision:** A Monday-morning personalized digest that makes the AI feel like it's always watching — even when nothing has happened. Hyper-local, hyper-specific. Not generic tips.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 8.1.1 | Home Pulse digest generation (Claude) | ⬜ Missing | L | Claude agent generates digest from: property location, build year, system ages, local climate/season, recent job history |
| 8.1.2 | Climate zone data integration | ⬜ Missing | M | Map zip code → NOAA climate zone; feed into digest and maintenance forecasts (see 1.1.5) |
| 8.1.3 | Weekly digest email delivery | ⬜ Missing | M | Email template + send pipeline (Resend / SendGrid); one digest per active property per user |
| 8.1.6 | Pulse content personalization over time | ⬜ Missing | M | Track which Pulse items the user acted on; Claude weights future digests toward high-signal topics |

### 8.4 Insurance Defense Mode — Florida-Specific Retention Hook
**Vision:** One-tap export of all maintenance records formatted for insurance company submission. One successful insurance interaction pays for 3+ years of HomeFax.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 8.4.4 | Insurer-specific export templates | ⬜ Missing | L | Different Florida insurers have different documentation formats; template library for major carriers (Citizens, Universal, Heritage) |
| 8.4.6 | Premium discount estimate | ⬜ Missing | M | Based on record completeness and score, estimate potential insurance premium reduction (see 7.3.2) |

### 8.5 Annual Resale-Ready Milestone
**Vision:** At the 12-month mark, trigger a milestone that reframes the entire year as something meaningful and complete. Turns passive subscribers into advocates.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 8.5.3 | Year-in-review email | ⬜ Missing | M | Email summarizing the year: jobs logged, score change, warranty reminders set, estimated value added |

---

## 13. Benchmark & Load Testing

**Context:** HomeFax runs on ICP where cost is cycles-per-instruction, not per-request. Load testing has two goals: (1) throughput — can canisters handle concurrent users without queuing, and (2) cycles efficiency — are any calls burning disproportionate cycles that hit runway. The `monitoring` canister already tracks cycles and ARPU/LTV/CAC; what's missing is a baseline and stress scenarios.

---

### 13.1 Cycles Baseline — Cost Per Operation

Establish cycles cost for every significant canister call before any optimization work. Without a baseline, you can't measure improvement or catch regressions.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 13.1.1 | Baseline script for query calls | ✅ Exists | S | `scripts/benchmark-queries.mjs` — 8 query targets (getMyProperties, getJobsForProperty, getReport, getSeasonalTasks, predictMaintenance, recommendValueAddingProjects, getMetrics, getOpenRequests). `--live` hits real replica; `--csv` outputs CSV; `--repeat N` averages. |
| 13.1.2 | Baseline script for update calls | ✅ Exists | S | `scripts/benchmark-updates.mjs` — 7 update targets (createJob, generateReport, addVisitLog, createRecurringService, createRequest, recordCanisterMetrics, uploadPhoto). Same flags as 13.1.1. Consensus overhead modeled at +3M cycles. |
| 13.1.3 | Identify top-3 cycles-heavy operations | ✅ Exists | S | 24 tests validate ICP cost model, verify scripts exist with correct columns/flags, identify top-3 (all update calls). generateReport is heaviest query+update. Operations above 1B cycles flagged. Full cost table logged in CI. |
| 13.1.4 | Integrate baseline into `monitoring` canister metrics | ✅ Exists | M | `MethodCyclesSummary` type added; `recordCallCycles(method, cycles)` update func with EMA (α=0.2); `cyclesPerCallEntries` stable var; `getMetrics()` now returns `cyclesPerCall: [MethodCyclesSummary]`. |

---

### 13.2 Canister Throughput & Concurrency

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 13.2.1 | Concurrent read stress test — `getReport` | ✅ Exists | M | 200 concurrent reads: 0% error rate, p99<5×p50, <500ms wall-clock, viewCount consistency. Also flagged: mock ID collision under concurrent create (canister uses Nat increment). |
| 13.2.2 | Concurrent write stress test — `createJob` | ✅ Exists | M | 50 concurrent creates: 0% errors, all valid Job objects, p95<5×p50, <200ms wall-clock. Mock uses Date.now() for ID (collision-prone at ms resolution) — real canister uses atomic Nat. |
| 13.2.3 | Contractor dashboard poll simulation | ✅ Exists | S | 50×10 poll rounds <500ms, no per-round degradation, cycles cost model: 1000 polls/min ≈ $0.74/month — well within ICP economics. |
| 13.2.4 | Report generation spike | ✅ Exists | M | 25 simultaneous generateReport(): 0% errors, unique tokens, all immediately readable, <200ms wall-clock, p99<5×p50. |
| 13.2.5 | Cross-canister call latency | ✅ Exists | M | 5 chain patterns: A (create+status+read <50ms), B (sensor→job auto-create <30ms), C (10 concurrent chains 0% errors), D (generate+share+read <20ms), E (4-hop <10× 1-hop). |

---

### 13.3 Algorithmic Load — Heavy Canister Methods

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 13.3.1 | `market` canister — `analyzeCompetitivePosition()` under load | ✅ Exists | M | Pure JS O(C×N). 14 tests: correctness at 1/50/100×100 scale, N-scaling, C-scaling, 100×100 <500ms cap, 50 concurrent calls, recommendValueAddingProjects linear scaling. All green. |
| 13.3.2 | `maintenance` canister — `predictMaintenance()` at scale | ✅ Exists | S | 11 tests: all 9 systems × build years 1950–2024, J-scaling guard, 1000 calls <1000ms, all 5 climate zones, 50 concurrent calls. Green. |
| 13.3.3 | `report` canister — snapshot size growth | ✅ Exists | S | 16 tests: correctness at 0/10/50/200 jobs, JSON footprint linear (no O(N²)), 200-job <200KB, generateReport/getReport timing, 20 concurrent calls with unique tokens. Green. |
| 13.3.4 | `monitoring` canister — metrics aggregation under load | ✅ Exists | S | 16 tests: JS model mirrors Motoko HashMap logic; alert generation, O(C) calculateCostMetrics, O(A) getMetrics, 13-canister production scale <5ms, 1000 reads <100ms, concurrent reads+writes. Green. |

---

### 13.5 Load Test Scenarios — Realistic User Journeys

End-to-end scenarios that combine multiple calls, matching how real users interact with the app.

| # | Item | Status | Size | Notes |
| 13.5.4 | "Agent competition" scenario | ⬜ Missing | M | Once Section 9 (listing bid marketplace) is built: 10 agents simultaneously submit proposals to the same listing bid request. Tests write contention on the listing canister |

---

### 13.6 Infrastructure & Tooling

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 13.6.1 | `scripts/benchmark.sh` harness | ✅ Exists | M | Runs 13.1.1+13.1.2 scripts with `--csv`, generates Markdown table, writes `tests/perf-baselines/{query,update}-baseline.csv` + `benchmark-report.md`. `--live` flag for real replica; dry-run by default. Stages files for git commit. |
| 13.6.2 | k6 load test suite for Express proxy | ✅ Exists | M | `tests/k6/voice-agent-load.js` — 3 scenarios: ramp (1→50 VU), spike (200 VU, 30s), soak (25 VU, 10 min). Thresholds: chat p95<3s, agent p95<5s, health p99<50ms, error rate <5%. Custom Trend metrics for each endpoint. |
| 13.6.3 | Cycles burn rate dashboard | ✅ Exists | M | `monitoringService.ts` + "Cycles & Health" tab in AdminDashboardPage. Shows balance/burn/runway per canister sorted by lowest runway. Orange banner at <30d, red cells at <7d. Mock data when canister not deployed. |
| 13.6.4 | Performance regression gate in CI | ✅ Exists | L | `.github/workflows/perf-regression.yml` — triggers on PR to main. Runs both baselines in dry-run, compares cycles_estimate to committed CSVs, fails on >25% regression. Posts PR comment + GitHub step summary. Path-filtered to relevant files only. |

---
