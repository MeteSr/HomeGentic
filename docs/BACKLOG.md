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

### 1.1 Predictive Maintenance Timeline
**Vision:** AI models each home's aging curve (build year, materials, climate, service history) and produces a 5-year forward-looking maintenance calendar with cost estimates.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 1.1.1 | System lifespan estimates per age/type | ✅ Exists | — | `maintenance` canister + `systemAges.ts` service |
| 1.1.2 | Seasonal task generation | ✅ Exists | — | `getSeasonalTasks()` in maintenance canister |
| 1.1.3 | 5-year rolling calendar view | ✅ Exists | — | `FiveYearCalendar` component in `PredictiveMaintenancePage` — "Schedule" tab with year columns, per-year budget, completion checkboxes |
| 1.1.4 | Per-task cost estimate ranges | ✅ Exists | — | `serviceCallLowCents`/`High` on `SystemPrediction`; numeric cents on `AnnualTask`; annual budget total on Annual Tasks tab; modal pre-fills service cost for Watch/Good, replacement cost for Critical/Soon |
| 1.1.5 | Climate-adjusted aging model | ⬜ Missing | L | Pull zip-code weather normals; adjust HVAC/roof lifespan curves by region |
| 1.1.6 | Material-aware forecasting | ⬜ Missing | L | Room digital twin (1.4) is a prerequisite — need material metadata |
| 1.1.7 | Exportable PDF maintenance calendar | ⬜ Missing | M | Generate printable 12-month schedule with estimated costs |

### 1.2 "Home Genome" Onboarding
**Vision:** NLP-powered bulk document ingestion at signup — PDFs, photos, receipts, inspection reports all parsed and auto-categorized into the historical record.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 1.2.1 | Multi-file upload UI | 🟡 Partial | S | `DocumentsTab` handles single-file uploads; needs batch mode |
| 1.2.2 | Claude-powered document classification | ⬜ Missing | L | POST files to voice agent server; Claude Vision classifies type (receipt/inspection/permit) |
| 1.2.3 | Auto-populate job records from parsed docs | ⬜ Missing | XL | Structured extraction → `job.createJob()` calls; needs review/confirm step |
| 1.2.4 | Onboarding wizard with bulk upload step | ⬜ Missing | M | Add step to `OnboardingPage` after property registration |
| 1.2.5 | Duplicate detection across ingested docs | ⬜ Missing | M | SHA-256 dedup already exists in `photo` canister; apply at ingestion time |
| 1.2.6 | Progress UI for batch processing | ⬜ Missing | S | Show per-file status (parsing / done / failed) during ingestion |

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

### 1.4 Room-by-Room Digital Twin
**Vision:** Each room has its own record — floor type, paint color, fixture model numbers, appliance brands. Catalogued for repairs, touch-ups, and buyer disclosure.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 1.4.1 | Room entity in `property` or new canister | ⬜ Missing | L | New Motoko stable type: `Room { id, propertyId, name, floorType, paintColor, fixtures: [Fixture] }` |
| 1.4.2 | Room CRUD frontend | ⬜ Missing | M | Add "Rooms" tab to `PropertyDetailPage`; list, add, edit rooms |
| 1.4.3 | Fixture/appliance inventory per room | ⬜ Missing | M | `Fixture { brand, model, serialNumber, installedDate, warrantyExpiry }` |
| 1.4.4 | Warranty wallet (see 2.3) | ⬜ Missing | L | Auto-alert before warranty expiry; shown in HomeFax Report |
| 1.4.5 | Room photo gallery | 🟡 Partial | S | `photo` canister exists; add room-scoped `getByRoom()` query |
| 1.4.6 | Paint color lookup / match | ⬜ Missing | M | Store paint brand + color code; generate a "touch-up" reference card |
| 1.4.7 | Room data in HomeFax Report export | ⬜ Missing | M | Include room finishes summary in generated report (buyer disclosure layer) |

---

## 2. Service Provider Network — Trust Infrastructure

### 2.1 Proof-of-Work NFTs for Contractors
**Vision:** Every completed job generates an on-chain credential for the contractor — verifiable, portable work history on ICP.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 2.1.1 | Dual-signature job verification | ✅ Exists | — | `job` canister has `homeownerSigned` + `contractorSigned` + `verified` flag |
| 2.1.2 | On-chain job credential issuance | ⬜ Missing | L | On job verification, mint a credential record in `contractor` canister: `{ jobId, contractorId, serviceType, verifiedAt, homeownerPrincipal }` |
| 2.1.3 | Contractor credential portfolio page | ⬜ Missing | M | New tab on `ContractorProfilePage` showing verified job history as credential cards |
| 2.1.4 | Portable credential export | ⬜ Missing | M | Generate a shareable link / QR code to a contractor's verified work history |
| 2.1.5 | Trust score driven by verified jobs | 🟡 Partial | S | `trustScore` exists in `contractor` canister; auto-increment on each verified job |

### 2.2 Escrow-Protected Job Completion
**Vision:** Payment held in ICP smart contract escrow; released automatically when homeowner approves the job.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 2.2.1 | Escrow canister | ⬜ Missing | XL | New Motoko canister: create escrow on job creation, release on homeowner approval, refund on dispute |
| 2.2.2 | ICP token / cycles integration | ⬜ Missing | XL | Integrate with ICP Ledger canister for actual token movement |
| 2.2.3 | Escrow UI in quote flow | ⬜ Missing | L | Show escrow amount during quote acceptance; "Release Payment" button on job completion |
| 2.2.4 | Dispute resolution flow | ⬜ Missing | L | Timed dispute window; admin arbitration; partial release logic |
| 2.2.5 | Payment release = homeowner signature | ⬜ Missing | M | Wire `verifyJob()` homeowner sign to trigger escrow release |

### 2.3 Warranty Wallet
**Vision:** Every appliance/installation warranty stored digitally, linked to contractor, with auto-alert before expiration.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 2.3.1 | Warranty record type in job/fixture entity | ✅ Exists | — | `warrantyMonths` field on `Job`; expiry computed as `date + warrantyMonths * 30.44 days` |
| 2.3.2 | Warranty entry UI | ✅ Exists | — | `warrantyMonths` input in `JobCreatePage` |
| 2.3.3 | Expiry alert system | ✅ Exists | — | Proactive alerts in `useVoiceAgent` — warranties expiring ≤90 days surfaced as VoiceAgent chips |
| 2.3.4 | Warranty summary in HomeFax Report | ⬜ Missing | M | Show "14 years warranty remaining on roof" in report output |
| 2.3.5 | Warranty doc upload | 🟡 Partial | S | `photo` canister can store docs; add `phase: "Warranty"` and link to job |

### 2.4 Contractor Bidding with ZKP Pricing
**Vision:** Homeowners see bids; contractors cannot see each other's prices. ZKPs attest "this is the lowest bid" without revealing other bids.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 2.4.1 | Sealed-bid quote submission | ⬜ Missing | L | Encrypt contractor bid price in `quote` canister; reveal only after bid window closes |
| 2.4.2 | ZKP "lowest bid" attestation | ⬜ Missing | XL | Requires ZKP library on ICP (or Groth16 verifier canister); prove ordering without revealing values |
| 2.4.3 | Bid window timer | ⬜ Missing | M | Quote requests have a close date; after close, all bids revealed to homeowner only |
| 2.4.4 | Blind bidding UI | ⬜ Missing | M | Contractor sees only their own submitted price, not competitors'; homeowner sees all after close |

---

## 3. ICP Blockchain Layer — Untouchable Differentiation

### 3.1 Tamper-Evident Ownership Chain
**Vision:** Every ownership transfer as an immutable canister event — independently verifiable without trusting HomeFax.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 3.1.1 | Property registration on-chain | ✅ Exists | — | `property` canister records owner principal + timestamp |
| 3.1.2 | Ownership transfer event log | ⬜ Missing | L | Append-only `transfers: [{ from, to, timestamp, txHash }]` stable array in `property` canister |
| 3.1.3 | Transfer UI | ⬜ Missing | M | "Transfer Property" in `SettingsTab`; requires both parties to sign |
| 3.1.4 | Public ownership verification endpoint | ⬜ Missing | M | Unauthenticated query: `getOwnershipHistory(propertyId)` → returns full chain |

### 3.2 Decentralized Document Vault
**Vision:** Photos, permits, inspection reports in ICP canisters — not AWS. Breach-proof, shutdown-proof.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 3.2.1 | SHA-256 dedup photo storage | ✅ Exists | — | `photo` canister |
| 3.2.2 | Document type taxonomy | ✅ Exists | — | `DOC_TYPES` in `ConstructionPhotoUpload.tsx`: Receipt, Invoice, Permit, Before/After Photo, Warranty Card, Inspection Report, Other |
| 3.2.3 | Permit / inspection upload flow | ⬜ Missing | M | Dedicated upload UI in `PropertyDetailPage` Documents tab beyond receipts |
| 3.2.4 | Per-tier storage quota enforcement | 🟡 Partial | S | `getQuota()` exists; quota banner shown; enforcement on upload needs hardening |
| 3.2.5 | Canister-level access control | ⬜ Missing | M | Only property owner + authorized contractors can read documents; add caller check in `photo` canister |

### 3.3 "Dead Man's Switch" Continuity
**Vision:** If HomeFax ceases to exist, homeowner records remain fully accessible on ICP.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 3.3.1 | Self-service data export | ⬜ Missing | M | Export all property data (jobs, photos, reports) as a ZIP / JSON from the canister |
| 3.3.2 | Public read query on all record canisters | ⬜ Missing | M | Unauthenticated queries for property/job/photo data given owner principal |
| 3.3.3 | Open-source canister interfaces | ⬜ Missing | S | Publish Candid IDL specs so third-party UIs can read HomeFax canister data |
| 3.3.4 | "Your data, your keys" marketing page | ⬜ Missing | S | Landing page section explaining ICP data sovereignty |

### 3.4 ICP-Native Home Title Tokens
**Vision:** Partner with title companies to tokenize property deeds on ICP.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 3.4.1 | ICRC-1 / ICRC-7 NFT canister for title | ⬜ Missing | XL | Implement an NFT standard canister; each token = one property title |
| 3.4.2 | Title company API integration | ⬜ Missing | XL | Partner integration; legal/regulatory layer required |
| 3.4.3 | Tokenized deed display in HomeFax Report | ⬜ Missing | M | Show "Title token on-chain since [date]" badge in report |

---

## 4. Zero-Knowledge Proofs — Privacy as a Feature

### 4.1 Selective Disclosure Reports
**Vision:** Sellers choose exactly what to share. ZKP-verified "all permits closed" without revealing contractor or cost.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 4.1.1 | Visibility levels on report shares | ✅ Exists | — | `report` canister has `Full / Summary / ScoreOnly` visibility + revocation |
| 4.1.2 | Field-level disclosure toggles | ⬜ Missing | M | UI in `ReportPage` to choose which fields are visible per share link |
| 4.1.3 | ZKP "permits closed" attestation | ⬜ Missing | XL | Requires ZKP circuit; prove all permit fields = Closed without revealing job details |
| 4.1.4 | ZKP "maintenance score above threshold" | ⬜ Missing | XL | Prove score ≥ N without revealing individual job records |

### 4.2 Income-Blind Mortgage Proof
**Vision:** Prove property maintained above a quality threshold to lenders — without personal financial disclosure.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 4.2.1 | HomeFax score certification endpoint | ⬜ Missing | M | Canister returns a signed score certificate with no personal data |
| 4.2.2 | Lender-facing score verification page | ⬜ Missing | M | Unauthenticated URL: lender enters certification code, sees score + grade only |
| 4.2.3 | ZKP score proof (no raw data) | ⬜ Missing | XL | Full ZKP implementation; score proven without job record disclosure |

### 4.3 Anonymous Neighborhood Benchmarking
**Vision:** Compare maintenance score vs. similar homes in zip code — without revealing individual neighbor data.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 4.3.1 | Zip code aggregate query | ⬜ Missing | L | `monitoring` or `market` canister: aggregate scores by zip, return percentile buckets only |
| 4.3.2 | Neighborhood benchmarking UI | ⬜ Missing | M | Show "Your score is in the top 23% of 78701" on dashboard |
| 4.3.3 | Neighborhood Health Index public page | ⬜ Missing | L | Public-facing zip code page: aggregate score, trend, top maintenance categories |
| 4.3.4 | ZKP aggregate attestation | ⬜ Missing | XL | Prove neighborhood statistics without revealing any individual record |

### 4.4 Buyer Verification Without Disclosure
**Vision:** Buyer proves pre-approval to seller without revealing loan amount or lender.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 4.4.1 | Buyer pre-approval credential schema | ⬜ Missing | L | Define verifiable credential structure; integrate with a lending API |
| 4.4.2 | ZKP pre-approval proof | ⬜ Missing | XL | Prove "pre-approved for ≥ $X" without revealing the exact amount |
| 4.4.3 | Buyer credential UI in transaction flow | ⬜ Missing | M | Buyer submits credential; seller sees "Verified: pre-approved" only |

---

## 5. AI Agents — The Self-Writing Internet Angle

### 5.1 Natural Language Home Management
**Vision:** "My kitchen faucet has been dripping for a week" → AI classifies, estimates urgency, finds plumber, schedules, drafts work order, logs job.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 5.1.1 | Voice agent (SSE streaming chat) | ✅ Exists | — | `agents/voice/server.ts` with Claude API |
| 5.1.2 | Agentic tool-use loop (up to 5 turns) | ✅ Exists | — | `POST /api/agent` in voice server |
| 5.1.3 | Issue classification tool | ✅ Exists | — | `classify_home_issue` → confirms with user → `create_quote_request` → `quoteService.createRequest()`; full classify-then-act loop in `tools.ts` and `agentTools.ts` |
| 5.1.4 | Contractor search + schedule via agent | ⬜ Missing | L | Agent calls `contractor.search()`, proposes top 3, and pre-fills `QuoteRequestPage` |
| 5.1.5 | Work order auto-draft from NL input | ⬜ Missing | M | Agent generates structured job description from homeowner's natural language input |
| 5.1.6 | Auto-log completed job from conversation | ⬜ Missing | M | After contractor confirmation, agent calls `job.createJob()` with parsed fields |

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
| 5.3.4 | Score-to-value calculator UI | ⬜ Missing | M | Show "Your score of 91 in 78704 is associated with $18–24K buyer premium" on Dashboard |

### 5.4 Autonomous Permit Research
**Vision:** When a contractor proposes a renovation, AI pre-checks permit requirements and drafts the application.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 5.4.1 | Municipal permit API integration | ⬜ Missing | XL | Per-city permit data; no universal API exists — requires city-by-city or OpenPermit integration |
| 5.4.2 | Permit requirement lookup tool | ⬜ Missing | L | Agent tool: given service type + zip, returns permit required Y/N + estimated cost |
| 5.4.3 | Permit status tracking in job record | ⬜ Missing | M | Add `permitRequired: Bool`, `permitNumber: ?Text`, `permitStatus` to Job entity |
| 5.4.4 | Permit alert in job creation flow | ⬜ Missing | M | During `JobCreatePage`, auto-warn if selected service type typically requires permit |
| 5.4.5 | Permit application draft generation | ⬜ Missing | L | Agent drafts permit application text from job details; user downloads/submits |

---

## 6. HomeFax Report — The Resale Weapon

### 6.1 Score-to-Value Calculator
**Vision:** Show sellers exactly how much their HomeFax score is worth in dollar terms in their market.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 6.1.1 | HomeFax score computation | ✅ Exists | — | `market` canister `analyzeCompetitivePosition()` returns score + grade |
| 6.1.2 | Score-to-dollar premium model | ⬜ Missing | L | Needs market data (5.3.2); map score band → estimated premium range per zip |
| 6.1.3 | Dollar premium display on Dashboard | ⬜ Missing | M | "Your score is worth an estimated $X–$Y in your market" card |
| 6.1.4 | Premium estimate in HomeFax Report | ⬜ Missing | M | Include dollar value range in generated report for buyer/agent view |

### 6.2 Listing Platform Integration & Badge
**Vision:** HomeFax-verified homes display a badge on Zillow/Realtor.com.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 6.2.1 | HomeFax badge image generation | ⬜ Missing | M | SVG/PNG badge with score + grade; generated from canister data |
| 6.2.2 | Embeddable badge widget | ⬜ Missing | M | `<iframe>` or JS snippet for listing agents to embed on property pages |
| 6.2.3 | Zillow / Realtor.com API partnership | ⬜ Missing | XL | Requires partner API access; long-term business development item |

### 6.3 Buyer Q&A via ZKP
**Vision:** Buyer asks "Has the roof been replaced since 2010?" → ZKP-verified yes/no, no seller manual response needed.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 6.3.1 | Buyer Q&A interface on shared report | ⬜ Missing | M | Buyers submit yes/no questions against the report; seller not required to respond manually |
| 6.3.2 | Automated answer engine | ⬜ Missing | L | Query job records against structured question templates; return verified answer |
| 6.3.3 | ZKP-verified answer | ⬜ Missing | XL | Prove answer is derived from on-chain data without revealing the underlying records |

### 6.4 Agent Co-Branding
**Vision:** Real estate agents get a white-labeled HomeFax report with their brand, ICP verification intact.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 6.4.1 | Agent account type / role | ⬜ Missing | M | Add `Realtor` role to `auth` canister (partially referenced in code; needs full flow) |
| 6.4.2 | Agent branding fields | ⬜ Missing | S | `AgentProfile { name, brokerage, logoUrl, phone }` in `auth` or new `agent` canister |
| 6.4.3 | Co-branded report PDF template | ⬜ Missing | M | Report PDF renders agent logo + contact in footer/header |
| 6.4.4 | Agent share link with co-branding | ⬜ Missing | M | Share links carry agent branding token; viewer sees agent info alongside HomeFax data |
| 6.4.5 | Agent dashboard | ⬜ Missing | L | Agent can see all properties they've shared + view counts + buyer engagement |

### 6.5 "HomeFax Certified" Pre-Inspection Waiver
**Vision:** Score ≥ 88 qualifies for waived/discounted inspection contingency — killer feature in competitive markets.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 6.5.1 | Certification threshold logic | ⬜ Missing | M | Canister query: `isCertified(propertyId)` → true if score ≥ 88 and all key systems verified |
| 6.5.2 | Certified badge in HomeFax Report | ⬜ Missing | S | Visual badge on report + certification date |
| 6.5.3 | Insurance / buyer agent API | ⬜ Missing | XL | Partner program for insurers/agents to programmatically verify certification; legal framework needed |

---

## 7. Platform & Business Model Differentiation

### 7.1 Homeowner-Owned Data Sovereignty
**Vision:** Explicitly market that data lives on ICP canisters the homeowner owns — HomeFax is just the interface.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 7.1.1 | Data sovereignty explainer on landing page | ⬜ Missing | S | Section explaining ICP data ownership model |
| 7.1.2 | Self-service canister data export | ⬜ Missing | M | (See 3.3.1) |
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
**Vision:** Aggregate (ZKP-anonymized) data by zip code → HOA, city planner, and investor product.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 7.4.1 | Zip-level score aggregation | ⬜ Missing | L | (See 4.3.1) |
| 7.4.2 | Neighborhood Health Index public page | ⬜ Missing | L | Public URL per zip code; shows aggregate score, top systems, trend |
| 7.4.3 | HOA portal | ⬜ Missing | XL | HOA admin can see aggregate scores for their community; cannot see individual homeowner data |
| 7.4.4 | Investor / city planner data product | ⬜ Missing | XL | Paid API for block-level risk analysis; city planning / insurance underwriting use case |

---

## Priority Tiers

### Tier 1 — Complete MVP (existing canisters, polish existing flows)
Items that use only what's already built. Ship these first.

- ~~1.1.3 5-year calendar view~~ ✅ FiveYearCalendar in PredictiveMaintenancePage
- ~~2.3.1–2.3.3 Warranty wallet (core)~~ ✅ WarrantyWalletPage + VoiceAgent alerts
- ~~3.2.2 Document type taxonomy~~ ✅ DOC_TYPES in ConstructionPhotoUpload
- ~~1.1.4 Per-task cost estimates~~ ✅
- 2.1.5 Trust score auto-increment on verified jobs
- 2.3.4–2.3.5 Warranty wallet (report + doc upload)
- 3.1.2–3.1.4 Ownership transfer log + UI
- 3.2.3 Permit/inspection upload flow
- 4.1.2 Field-level disclosure toggles on report shares
- ~~5.1.3 Issue classification → quote creation (voice agent)~~ ✅
- 6.1.3 Dollar premium display on Dashboard
- 6.4.1–6.4.4 Agent co-branding

### Tier 2 — AI Differentiation (new Claude agent capabilities)
Items that extend the voice agent layer. High leverage, no new canisters needed.

- 1.2.2–1.2.6 Home genome onboarding (Claude Vision + batch ingest)
- 5.1.4–5.1.6 Contractor search, work order draft, auto-log via agent
- 5.2.1–5.2.3 Negotiation agent
- 5.4.2 Permit requirement lookup tool
- 5.4.4 Permit alert in job creation

### Tier 3 — New Canisters / Infrastructure
Items requiring new Motoko canisters or major backend work.

- 1.4 Room digital twin (new `room` canister or extension to `property`)
- 1.3 Utility intelligence (new `utility` canister + OAuth integrations)
- 2.2 Escrow canister + ICP Ledger integration
- 3.4 ICRC-7 title token NFT
- 5.3 Market timing (requires external real estate API)

### Tier 4 — ZKP & Advanced Cryptography
Requires ZKP circuit development on ICP. Long-horizon R&D.

- 2.4.2 ZKP bidding
- 4.1.3–4.1.4 ZKP permit/score attestation
- 4.2.3 Income-blind mortgage proof
- 4.3.4 ZKP aggregate attestation
- 6.3.3 ZKP buyer Q&A answers

---

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
| 8.1.4 | In-app Pulse notification | ✅ Exists | — | Proactive alert chips in `VoiceAgent` component surface warranty/signature/quote alerts on every page load |
| 8.1.5 | Pulse opt-out / frequency controls | ✅ Exists | — | "Weekly Home Pulse" toggle in Settings Notifications tab; persisted to localStorage; `DashboardPage` checks `homefax_pulse_enabled` before showing pulse tip |
| 8.1.6 | Pulse content personalization over time | ⬜ Missing | M | Track which Pulse items the user acted on; Claude weights future digests toward high-signal topics |

### 8.2 Score Micro-Increments & Dollar-Value Display
**Vision:** The score moves every week for an engaged user. Every increment shows a dollar value. People don't cancel things they're actively improving.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 8.2.1 | Score event system | ✅ Exists | — | `scoreEventService.ts` derives events from jobs/properties: verified job (+4), DIY (+1), property verification (+5/+10), diversity milestone, value milestone |
| 8.2.2 | Micro-increment scoring in `market` canister | ✅ Exists | — | Score event feed ("Score Activity") on Dashboard shows each micro-action with pts and category badge |
| 8.2.3 | Score history / sparkline | ✅ Exists | — | `ScoreSparkline` + `ScoreHistoryChart` on Dashboard; `scoreService.ts` persists weekly snapshots to localStorage |
| 8.2.4 | Dollar value of score change | ⬜ Missing | M | "Your score went from 74 to 77. In Flagler County, a 3-point increase ≈ $4,200 in home value." Requires score-to-value model (6.1.2) |
| 8.2.5 | Score increase push notification | ✅ Exists | — | In-app banner on Dashboard when `scoreDelta > 0`; respects "Score Change Alerts" toggle in Settings |
| 8.2.6 | Score stagnation alert | ✅ Exists | — | `scoreStagnant` nudge in DashboardPage when score unchanged for 4+ weeks |

### 8.3 Cancellation Flow — Make It Feel Like Data Loss
**Vision:** The cancel flow shows exactly what's at stake: verified records, active warranties, score, ICP chain of custody. Factually accurate, not manipulative.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 8.3.1 | Cancellation intent screen | ✅ Exists | — | `SubscriptionTab` in `SettingsPage` — idle → confirm (features-lost list) → loading → done state machine |
| 8.3.2 | Post-cancel read-only mode | ⬜ Missing | M | Cancelled accounts retain read access to their on-chain records; score stops updating; reports become static |
| 8.3.3 | "Your records stay on ICP" messaging | ✅ Exists | — | Green info box in cancel confirm step: "Your ICP records are permanent even after cancellation" |
| 8.3.4 | Pause subscription option | ✅ Exists | — | `paymentService.pause(months)`/`resume()`/`getPauseState()` in localStorage; pause banner + 1/2/3-month buttons in SettingsPage; "Pause 1 month instead" shortcut in cancel confirm step |
| 8.3.5 | Win-back email sequence | ⬜ Missing | M | 7/30/90-day post-cancel emails highlighting new records that would have been created; "Your home didn't stop aging" |

### 8.4 Insurance Defense Mode — Florida-Specific Retention Hook
**Vision:** One-tap export of all maintenance records formatted for insurance company submission. One successful insurance interaction pays for 3+ years of HomeFax.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 8.4.1 | Insurance Defense export format | ✅ Exists | — | `InsuranceDefensePage.tsx` — print-ready report filtered to insurance-relevant jobs (Roofing, HVAC, Electrical, Plumbing, Foundation) with ICP verification status, blockchain disclaimer, permit numbers |
| 8.4.2 | "Insurance Defense Mode" UI | ✅ Exists | — | `/insurance-defense` route; "Insurance Defense" button in Dashboard Quick Actions; "Print / Export PDF" → `window.print()` |
| 8.4.3 | Key insurance-relevant fields on job records | ✅ Exists | — | `INSURANCE_SERVICE_TYPES` set + `isInsuranceRelevant()` in `job.ts`; badge shown in `JobCreatePage` when service type is insurance-relevant (Roofing, HVAC, Electrical, Plumbing, Foundation) |
| 8.4.4 | Insurer-specific export templates | ⬜ Missing | L | Different Florida insurers have different documentation formats; template library for major carriers (Citizens, Universal, Heritage) |
| 8.4.5 | Insurance success story prompt | ⬜ Missing | S | After export, prompt: "Did this help with your insurer? Tell us what you saved." — feeds testimonials + in-app social proof |
| 8.4.6 | Premium discount estimate | ⬜ Missing | M | Based on record completeness and score, estimate potential insurance premium reduction (see 7.3.2) |

### 8.5 Annual Resale-Ready Milestone
**Vision:** At the 12-month mark, trigger a milestone that reframes the entire year as something meaningful and complete. Turns passive subscribers into advocates.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 8.5.1 | Annual milestone trigger | ✅ Exists | — | `showMilestone` in DashboardPage — fires when `accountAgeMs >= 11 months` + at least one job logged; dismissible banner |
| 8.5.2 | "Resale Ready" milestone screen | ✅ Exists | — | `ResaleReadyPage.tsx` at `/resale-ready` — score arc, stats grid, premium estimate, HomeFax Certified badge, share link generation, insurance defense link, "what a buyer sees" preview |
| 8.5.3 | Year-in-review email | ⬜ Missing | M | Email summarizing the year: jobs logged, score change, warranty reminders set, estimated value added |
| 8.5.4 | Milestone share card | ⬜ Missing | S | Shareable image: "My home has a HomeFax score of 81 — 43 verified records over 12 months." Organic social distribution |
| 8.5.5 | Advocate prompt at milestone | ⬜ Missing | S | After milestone screen, prompt referral: "Know a homeowner who should have this?" with referral link |

### 8.6 Post-Service Habit Loop
**Vision:** After every job: push notification → score increase → record on-chain → AI prompt for next related service. Three completions in year one → churn rate fraction of manual-only users.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 8.6.1 | Post-job completion notification | ✅ Exists | — | Job success screen in `JobCreatePage` shows "Record Locked On-Chain" with next-service tip after every submission |
| 8.6.2 | Next-service prompt from completed job | ✅ Exists | — | Dashboard shows follow-up tip for most recent verified job ("Next Step" card) with "Add to Maintenance Schedule →" CTA; dismissible |
| 8.6.3 | "Add to schedule" one-tap flow | 🟡 Partial | S | `PredictiveMaintenancePage` has schedule section; needs one-tap add from post-job prompt |
| 8.6.4 | Contractor re-engagement via job history | ⬜ Missing | M | After 11 months since last HVAC service: "Book Cool Air Services again — they did your last service and you gave no complaints" |
| 8.6.5 | In-app job completion animation | ✅ Exists | — | "Job Verified" overlay in `ContractorDashboardPage` — 2.8s animated card with "Record Locked On-Chain" copy after contractor signs |
| 8.6.6 | 3-service engagement milestone | ✅ Exists | — | Dismissible milestone banner in DashboardPage when `verifiedCount >= 3` |

---

## Updated Priority Tiers

*(Tiers 1–4 from original backlog unchanged. Retention items added below.)*

### Tier 1-R — Retention: High ROI, Low Effort
Build these alongside Tier 1 MVP polish. Each addresses a root churn cause with minimal new infrastructure.

- ~~8.1.4 In-app Pulse notification (S)~~ ✅ VoiceAgent proactive alert chips
- ~~8.1.5 Pulse opt-out controls (S)~~ ✅ "Weekly Home Pulse" toggle in Settings Notifications tab
- ~~8.2.3 Score sparkline on Dashboard (M)~~ ✅ ScoreSparkline + ScoreHistoryChart
- ~~8.2.5 Score increase push notification (S)~~ ✅ In-app banner when scoreDelta > 0
- ~~8.2.6 Score stagnation alert (S)~~ ✅ scoreStagnant nudge in DashboardPage
- ~~8.3.1 Cancellation intent screen (M)~~ ✅ SettingsPage subscription tab
- ~~8.3.4 Pause subscription option (S)~~ ✅
- ~~8.4.3 Insurance-relevant job flags (S)~~ ✅ isInsuranceRelevant() + badge in JobCreatePage
- ~~8.5.1 Annual milestone trigger (S)~~ ✅ showMilestone in DashboardPage
- ~~8.6.1 Post-job completion notification (S)~~ ✅ "Record Locked On-Chain" success screen
- ~~8.6.5 In-app job completion animation (S)~~ ✅ Overlay in ContractorDashboardPage
- ~~8.6.6 3-service engagement milestone (S)~~ ✅ Dismissible banner when verifiedCount >= 3

### Tier 2-R — Retention: Medium Effort, Core Differentiators
- 8.1.1–8.1.3 Home Pulse digest with email delivery (L+M+M)
- ~~8.2.1–8.2.2 Score event system + micro-increments (M+M)~~ ✅ scoreEventService.ts + Dashboard Score Activity feed
- 8.2.4 Dollar value of score change (M) — requires 6.1.2 first
- 8.3.1–8.3.2 Cancellation flow + read-only mode — 8.3.1 ✅; 8.3.2 remaining
- ~~8.3.3 "Records stay on ICP" messaging~~ ✅ cancel confirm step
- ~~8.4.1–8.4.2 Insurance Defense export (M+M)~~ ✅ InsuranceDefensePage + Quick Actions button
- ~~8.5.2 Resale-ready milestone screen (M)~~ ✅ ResaleReadyPage + annual milestone CTA
- 8.5.3 Year-in-review email (M) — needs email backend
- ~~8.6.2 Next-service prompt from verified job (M)~~ ✅ Dashboard "Next Step" card
- 8.6.3–8.6.4 Post-service habit loop remainder (M+M)

### Tier 3-R — Retention: Infrastructure-Heavy
- 8.1.1–8.1.3 Home Pulse digest + email delivery (requires Claude backend + email service)
- 8.1.6 Pulse personalization over time (M)
- 8.3.2 Post-cancel read-only mode (M)
- 8.3.5 Win-back email sequence (M)
- 8.4.4 Insurer-specific export templates (L)
- 8.5.3 Year-in-review email (M)
- 8.6.4 Contractor re-engagement (M)

---

## 9. Seller's Marketplace — Make Agents Compete

**Strategic thesis:** HomeFax sits on the most valuable signal in a listing transaction — a verified, blockchain-anchored maintenance record and a quantified score. No other platform gives sellers this kind of leverage over agents before an agreement is signed. The natural move is to turn that signal into a competitive marketplace: agents submit structured proposals to win the listing, and sellers choose on merit, not familiarity. In a typical transaction, the seller never makes agents compete at all. HomeFax can make that the new normal.

---

### 9.1 Agent Role & Profile

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 9.1.1 | `Realtor` role in `auth` canister | 🟡 Partial | M | Role referenced in code; needs full registration flow, profile fields, and license verification step |
| 9.1.2 | Agent profile: brokerage, license #, markets served | ⬜ Missing | S | `AgentProfile { name, brokerage, licenseNumber, statesLicensed, avgDaysOnMarket, listingsLast12Months, bio }` |
| 9.1.3 | Agent verification badge | ⬜ Missing | M | Admin-verifiable license check (or self-attestation with warning); badge shown on proposals and co-branded reports |
| 9.1.4 | Agent public profile page | ⬜ Missing | M | Public `/agent/:id` page showing credentials, listings won through HomeFax, average commission, verified reviews from homeowners |
| 9.1.5 | Agent reviews from HomeFax transactions | ⬜ Missing | M | After a listing closes, homeowner rates the agent (1–5); stored on-chain in agent profile; rate-limited, same deduplication pattern as contractor reviews |

---

### 9.2 Listing Bid Request (Homeowner Side)

The homeowner initiates a bid request when they're considering selling. The request automatically surfaces their HomeFax score, verified record count, and property details — agents see exactly what they're pitching before submitting.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 9.2.1 | `ListingBidRequest` type in new `listing` canister | ⬜ Missing | L | Fields: `propertyId`, `targetListDate`, `desiredSalePrice` (optional), `notes`, `bidDeadline`, `status: { #Open \| #Awarded \| #Cancelled }` |
| 9.2.2 | Listing bid request creation UI | ⬜ Missing | M | New page `/listing/new` — property selector, target list date, desired price (optional, visible to agents), deadline for proposals, notes |
| 9.2.3 | HomeFax score + summary auto-attached to request | ⬜ Missing | S | When request is created, snapshot current score, verified job count, key system ages — attached to every agent's proposal view automatically |
| 9.2.4 | Bid request visibility controls | ⬜ Missing | S | Homeowner chooses: open to all licensed agents in their market, or invite-only (send to specific agents by email/ID) |
| 9.2.5 | Bid deadline enforcement | ⬜ Missing | S | After `bidDeadline`, request closes automatically; no new proposals accepted; homeowner receives notification |

---

### 9.3 Agent Proposal Submission

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 9.3.1 | `ListingProposal` type in `listing` canister | ⬜ Missing | M | Fields: `requestId`, `agentId`, `commissionRateBps` (basis points, e.g. 250 = 2.5%), `cmaSummary` (text), `marketingPlan` (text), `estimatedDaysOnMarket`, `estimatedSalePrice`, `includedServices` (list), `validUntil`, `coverLetter` |
| 9.3.2 | Proposal submission UI for agents | ⬜ Missing | M | Agent sees the property's HomeFax summary (score, key verified records, system ages) before proposing; fills in their CMA, commission, marketing narrative |
| 9.3.3 | Commission input with basis-points precision | ⬜ Missing | S | Slider + text input; show dollar equivalent in real-time based on homeowner's desired price; enforces legal minimums per state |
| 9.3.4 | CMA upload / attachment | ⬜ Missing | M | Agent uploads a PDF CMA or enters structured comps (address, sale price, date, bed/bath/sqft); stored in `photo` canister pattern |
| 9.3.5 | Proposal draft / save before submit | ⬜ Missing | S | Agents can save a draft and return before the deadline |
| 9.3.6 | Proposal sealed until deadline (blind bidding) | ⬜ Missing | M | Agents cannot see each other's commission rates or proposals until the bid deadline passes; homeowner sees all after close — same sealed-bid principle as 2.4 |

---

### 9.4 Proposal Comparison & Agent Selection (Homeowner Side)

This is the moment HomeFax wins. The seller sees every proposal side-by-side — normalized, comparable, with the HomeFax score as context — and picks on merit.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 9.4.1 | Proposal comparison view | ⬜ Missing | L | Side-by-side table: agent, commission rate, estimated sale price, estimated days on market, included services, verified reviews; sortable by any column |
| 9.4.2 | Net proceeds calculator per proposal | ⬜ Missing | M | Given desired price + each agent's commission, show estimated net proceeds after commission + estimated closing costs; makes the cost of a 0.5% commission difference visceral |
| 9.4.3 | HomeFax score context for each proposal | ⬜ Missing | S | Show agents how they priced the property relative to the HomeFax-estimated premium; flag agents who underpriced |
| 9.4.4 | Agent selection + engagement flow | ⬜ Missing | M | "Select this agent" → notification sent to agent; listing request marked `#Awarded`; other agents notified they were not selected |
| 9.4.5 | Post-selection contract upload | ⬜ Missing | S | After selecting an agent, homeowner uploads the signed listing agreement as a doc; stored on-chain as a milestone |
| 9.4.6 | Counter-proposal flow | ⬜ Missing | L | Homeowner can counter on commission rate or terms; agent accepts/rejects/counter-counters; async threaded negotiation |

---

### 9.5 Transaction Tracking (After Agent Selected)

Once an agent is selected, HomeFax stays in the transaction rather than disappearing at agreement signing.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 9.5.1 | Listing milestone timeline | ⬜ Missing | M | Checklist: listing agreement signed → listed on MLS → first showing → offer received → under contract → inspection → appraisal → close. Agent and homeowner both update milestones |
| 9.5.2 | Offer log | ⬜ Missing | M | Homeowner logs received offers (amount, contingencies, close date); HomeFax shows delta from listing price and HomeFax estimated premium |
| 9.5.3 | Final sale price logging | ⬜ Missing | S | After close, record final sale price; compute and display actual premium over HomeFax baseline; feeds into 6.1.2 model training data |
| 9.5.4 | Agent performance score post-close | ⬜ Missing | M | Compare: estimated days on market vs. actual, estimated sale price vs. actual, commission promised vs. charged; becomes part of agent's public profile |

---

### 9.6 Agent Discovery (Without a Bid Request)

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 9.6.1 | Agent browse / search page | ⬜ Missing | M | `/agents` page: filter by market, commission range, avg days on market, HomeFax transaction history; similar to existing `ContractorBrowsePage` |
| 9.6.2 | "Request proposal from this agent" direct invite | ⬜ Missing | S | From an agent's public profile, homeowner can send a direct bid invitation tied to their property |
| 9.6.3 | HomeFax-verified transaction badge on agent profiles | ⬜ Missing | S | Agents who have closed transactions through HomeFax get a "HomeFax Verified Transaction" badge — drives agent adoption loop |

---

## 10. For Sale By Owner (FSBO) Mode — Seller Without an Agent

**Strategic thesis:** Roughly 10% of US home sales are FSBO. These sellers are underserved by every major platform — Zillow makes it cumbersome, FSBO.com is dated, and no one gives them tools that actually equip them to negotiate, price, and close confidently. HomeFax's verified maintenance record is the best FSBO asset that exists: it pre-answers buyer objections, replaces an inspection contingency, and signals a serious, prepared seller. The app should be the platform that makes FSBO actually work.

---

### 10.1 FSBO Mode Activation

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 10.1.1 | FSBO flag on property record | ⬜ Missing | S | `isFsbo: Bool` + `fsboListPrice: ?Nat` (cents) on `property` canister; homeowner can toggle without impacting normal HomeFax functionality |
| 10.1.2 | FSBO mode activation flow | ⬜ Missing | M | In `PropertyDetailPage`, "Sell This Home Yourself" CTA leads to a checklist-style activation flow: set price → review HomeFax report → generate public listing page → done |
| 10.1.3 | FSBO savings calculator | ⬜ Missing | S | Show estimated agent commission savings in real-time as homeowner sets their list price (e.g. "At $485K, you save ~$14,550 vs. a 3% buyer's agent commission") |
| 10.1.4 | Readiness score for FSBO | ⬜ Missing | M | Based on HomeFax score, verified record completeness, and whether a public report exists — rate FSBO readiness (Not Ready / Ready / Optimally Ready); show what's missing |

---

### 10.2 Pricing Intelligence

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 10.2.1 | Comparable sales integration | ⬜ Missing | XL | Pull recent sold comps from ATTOM / Zillow / Redfin API (or public records) for the property's zip; display price/sqft, days on market, sale-to-list ratio |
| 10.2.2 | HomeFax-adjusted price recommendation | ⬜ Missing | L | Take median comp price/sqft × sqft + HomeFax score premium (6.1.2) = suggested list price range; show the premium component explicitly ("Your verified records add an estimated $X–Y") |
| 10.2.3 | Price history and reduction tracking | ⬜ Missing | S | If homeowner adjusts their list price, log the history with timestamps; buyers see stable or reduced pricing as signals |
| 10.2.4 | Days-on-market estimator | ⬜ Missing | M | Based on comp DOM, season, and HomeFax score band — estimate expected time to offer; refreshes weekly |

---

### 10.3 Public FSBO Listing Page

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 10.3.1 | Public listing page per FSBO property | ⬜ Missing | L | Unauthenticated `/for-sale/:propertyId` page: photos, list price, property details, HomeFax score badge, verified record summary, contact form — clean, shareable URL |
| 10.3.2 | HomeFax score badge as trust anchor | ⬜ Missing | S | On the public listing, the HomeFax score is front-and-center with a "Verified on ICP Blockchain" explainer; replaces the "trust us" gap that kills FSBO credibility |
| 10.3.3 | Full HomeFax report link on listing | ⬜ Missing | S | A "View Full Maintenance History" button links to the shared HomeFax report (uses existing `report` canister share link); buyer sees everything the seller wants to disclose |
| 10.3.4 | Showing request form on listing page | ⬜ Missing | M | Buyer submits name, contact, preferred time; notification sent to seller; all requests logged (no third-party scheduling tool required) |
| 10.3.5 | Listing page SEO and shareability | ⬜ Missing | M | Open Graph tags, clean title/description with price + location; designed to be shared on Nextdoor, Facebook Marketplace, Craigslist without losing credibility |
| 10.3.6 | Flat-fee MLS listing integration | ⬜ Missing | XL | Partner with a flat-fee MLS service (e.g. Houzeo, ListingSpark) to submit the FSBO listing to the MLS from within HomeFax; this single item 5×es FSBO buyer exposure |

---

### 10.4 Buyer Communication & Showing Management

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 10.4.1 | Showing request inbox | ⬜ Missing | M | Seller sees all showing requests in a simple inbox: buyer name, preferred time, contact info; accept/decline/propose alternate time |
| 10.4.2 | Showing calendar | ⬜ Missing | M | Calendar view of confirmed showings; iCal export; reminder notification before each showing |
| 10.4.3 | Post-showing feedback request | ⬜ Missing | S | After a showing, seller can send a one-question feedback request ("How did the showing go?"); buyer responses logged |
| 10.4.4 | Buyer Q&A via HomeFax report | 🟡 Partial | M | Buyers can submit questions against the report (see 6.3.1); seller not required to answer manually if HomeFax data covers it |

---

### 10.5 Offer Management

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 10.5.1 | Offer intake form | ⬜ Missing | M | Structured form for seller to log received offers: buyer name, offer price, earnest money, contingencies (inspection, financing, appraisal, sale of home), proposed close date, escalation clause Y/N |
| 10.5.2 | Offer comparison view | ⬜ Missing | M | Side-by-side comparison of all offers: net to seller after contingency risk, close date, strength of financing, contingency count; similar structure to 9.4.1 agent proposal comparison |
| 10.5.3 | Net proceeds calculator per offer | ⬜ Missing | S | For each offer: price − estimated closing costs − any seller concessions = estimated net; comparable to 9.4.2 |
| 10.5.4 | Counter-offer tracking | ⬜ Missing | M | Log counter-offers and responses; full thread per offer; timestamps on chain |
| 10.5.5 | Accepted offer milestone | ⬜ Missing | S | When seller marks an offer accepted, FSBO listing moves to "Under Contract"; public page updated; HomeFax score snapshot taken |

---

### 10.6 Disclosure & Legal

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 10.6.1 | Seller disclosure statement generator | ⬜ Missing | L | State-specific disclosure form pre-filled from HomeFax data (known defects, material improvements, permits, age of systems); seller reviews and signs; stored on-chain |
| 10.6.2 | Disclosure completeness score | ⬜ Missing | M | Rate how complete the disclosure is based on HomeFax data coverage; incomplete items flagged so sellers can address them before listing |
| 10.6.3 | Legal document library | ⬜ Missing | L | Curated, state-specific templates: purchase agreement, counter-offer form, earnest money agreement, seller's disclosure; FSBO sellers can download, fill, and upload signed copies |
| 10.6.4 | Uploaded legal documents stored on-chain | ⬜ Missing | S | Use existing `photo` canister (with appropriate `DocumentType`) to store signed contracts; creates an immutable record of the transaction paper trail |
| 10.6.5 | "Inspection waiver" readiness based on HomeFax score | ⬜ Missing | M | If HomeFax score ≥ 88 and key systems verified, show sellers a script for offering buyers an "inspection waiver" as a negotiating point — HomeFax data is the substitute; connect to 6.5 |

---

### 10.7 FSBO → Agent Handoff

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 10.7.1 | "I changed my mind — find me an agent" flow | ⬜ Missing | S | One-click from FSBO dashboard to open a listing bid request (9.2); FSBO data (price history, showing count, offer history) transferred to the bid request as context for agents |
| 10.7.2 | FSBO effort summary for agent proposals | ⬜ Missing | S | Agents bidding on a property that was previously FSBO see the seller's showing count, offer count, and days on market; this data strengthens the agent's proposal and HomeFax's positioning as the source of record |

---

## Updated Priority Tiers (Seller Features)

### Tier 1-S — Seller: High Impact, Low Infrastructure
Buildable without new canisters; leverages existing `quote`, `auth`, `report`, and `photo` patterns.

- 9.1.1 Realtor role in `auth` canister (see also 6.4.1 — consolidate)
- 9.1.2–9.1.3 Agent profile + verification badge
- 9.2.1–9.2.3 Listing bid request + score auto-attach (extend `quote` canister pattern)
- 9.3.1–9.3.3 Proposal type + submission UI + commission input
- 9.4.1–9.4.2 Proposal comparison + net proceeds calculator
- 10.1.1–10.1.3 FSBO flag, activation flow, savings calculator
- 10.3.1–10.3.3 Public listing page + HomeFax badge + report link
- 10.5.1–10.5.3 Offer intake + comparison + net proceeds

### Tier 2-S — Seller: Core Differentiators
Require modest new infrastructure; high product value.

- 9.2.4–9.2.6 Bid controls, deadline enforcement, sealed proposals (9.3.6)
- 9.4.3–9.4.6 Score context, selection flow, contract upload, counter-proposal
- 9.5.1–9.5.4 Transaction tracking + agent performance scoring
- 10.2.1–10.2.4 Pricing intelligence (requires comp data API)
- 10.4.1–10.4.3 Showing management inbox + calendar
- 10.6.1–10.6.2 Disclosure generator + completeness score
- 10.7.1–10.7.2 FSBO → agent handoff

### Tier 3-S — Seller: Infrastructure-Heavy or Partnership-Dependent
- 10.3.6 Flat-fee MLS integration (partner dependency)
- 10.6.3 Legal document library (state-by-state legal review required)
- 10.2.1 Comparable sales API integration (ATTOM / Zillow)
- 9.1.5 Agent reviews (trust system evolution)

---

*Last updated: 2026-03-27 (sprint 19)*

---

## 11. Design System Migration — New UI Language

**Vision:** Roll the new landing page design system (Fraunces serif, Plus Jakarta Sans, plum/sage/blush palette, rounded pill buttons, blob visuals) out across all authenticated app pages, replacing the current blueprint/editorial aesthetic. Delivers brand coherence from first impression through daily use.

**Design tokens to propagate:**
```
--plum: #2E2540        (replaces ink #0E0E0C as primary)
--sage: #7AAF76        (replaces rust #C94C2E as accent)
--sage-light: #E5F0E4  (replaces paper #F4F1EB as background tint)
--plum-mid: #6B5B7B    (replaces inkLight #7A7268 as muted text)
--white: #FDFCFA       (page background)
--blush: #F0CDBA       (warm accent surface)
--sky: #BAD5E8         (cool accent surface)
--butter: #F5E9BB      (highlight surface)
Fraunces (serif headings, 700/900) replaces Playfair Display
Plus Jakarta Sans (body, 300–700) replaces IBM Plex Sans
IBM Plex Mono retained for labels and data values
border-radius: pills (100px) for buttons; 20–24px for cards
```

---

### 11.1 Design Token Foundation

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 11.1.1 | Create `theme.ts` with new token constants | ⬜ Missing | S | Export `COLORS`, `FONTS`, `RADIUS` objects; replace inline `s = {...}` pattern used in every page component |
| 11.1.2 | Update Google Fonts in `index.html` | ⬜ Missing | S | Add Fraunces + Plus Jakarta Sans; keep IBM Plex Mono; remove Playfair Display after migration complete |
| 11.1.3 | Update global CSS resets in `index.css` | ⬜ Missing | S | Body font, background color, scrollbar, selection color aligned to new palette |
| 11.1.4 | Update shared `Button.tsx` component | ⬜ Missing | S | Primary (plum fill, pill), secondary (sage-light fill, pill), ghost (border); replace current sharp-corner variants |
| 11.1.5 | Update shared `Badge.tsx` component | ⬜ Missing | S | Pill shape, sage/blush/sky/butter surface variants matching new card language |
| 11.1.6 | Update shared `Layout.tsx` nav + sidebar | ⬜ Missing | M | New nav: plum logo, sage accent on active item, white background with sage-mid bottom border; sidebar uses plum-mid text |

---

### 11.2 Core Authenticated Pages

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 11.2.1 | `DashboardPage.tsx` | ⬜ Missing | M | Property cards → 20px radius, sage-light surface; score ring → sage gradient; section headers → Fraunces; stat pills → new palette |
| 11.2.2 | `PropertyDetailPage.tsx` | ⬜ Missing | M | Tab bar → plum active state; cards → new radius + surface colors; action buttons → pill style |
| 11.2.3 | `JobCreatePage.tsx` | ⬜ Missing | S | Form inputs → plum focus border; submit button → plum pill; success screen → sage-light background |
| 11.2.4 | `SettingsPage.tsx` | ⬜ Missing | S | Section cards → 20px radius; tier badges → new badge variants; save button → plum pill |
| 11.2.5 | `PricingPage.tsx` | ⬜ Missing | M | Tier cards → blush/sky/sage-light surfaces; CTA buttons → plum pill; recommended tier → plum card (dark) |
| 11.2.6 | `OnboardingPage.tsx` | ⬜ Missing | M | Step indicators → sage dots; form cards → new radius; progress bar → sage gradient |

---

### 11.3 Contractor & Quote Pages

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 11.3.1 | `ContractorDashboardPage.tsx` | ⬜ Missing | M | Job cards → new card style; trust score display → sage gradient bar; status badges → new variants |
| 11.3.2 | `ContractorProfilePage.tsx` | ⬜ Missing | S | Profile header → plum background; form fields → new focus state; save → plum pill |
| 11.3.3 | `ContractorBrowsePage.tsx` | ⬜ Missing | M | Contractor cards → 20px radius, hover sage border; filter pills → sage-light; search → plum focus |
| 11.3.4 | `ContractorPublicPage.tsx` | ⬜ Missing | M | Public-facing — must look polished; hero → plum gradient; review cards → new card style |
| 11.3.5 | `QuoteRequestPage.tsx` + `QuoteDetailPage.tsx` | ⬜ Missing | M | Quote cards → blush surface; status badges → new variants; action buttons → pill style |

---

### 11.4 Feature Pages

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 11.4.1 | `PredictiveMaintenancePage.tsx` | ⬜ Missing | M | Calendar grid → sage-light cells; urgency badges → blush (Soon) / sky (Watch) / sage (Good); tab bar → new style |
| 11.4.2 | `MarketIntelligencePage.tsx` | ⬜ Missing | S | ROI bars → sage gradient; project cards → 20px radius; category headers → Fraunces |
| 11.4.3 | `WarrantyWalletPage.tsx` | ⬜ Missing | S | Warranty cards → butter surface for active, plum-mid text for expired; expiry badges → new variants |
| 11.4.4 | `InsuranceDefensePage.tsx` | ⬜ Missing | S | Evidence cards → sky surface; score indicators → sage; action buttons → plum pill |
| 11.4.5 | `ResaleReadyPage.tsx` | ⬜ Missing | S | Checklist items → sage checkmark; progress ring → sage gradient; CTA → plum pill |
| 11.4.6 | `RecurringServiceCreatePage.tsx` + `RecurringServiceDetailPage.tsx` | ⬜ Missing | S | New pages — apply new design from the start rather than retrofitting |
| 11.4.7 | `SensorPage.tsx` | ⬜ Missing | S | Device cards → sky surface (IoT = tech/cool); alert badges → blush for warning |
| 11.4.8 | `SystemAgesPage.tsx` | ⬜ Missing | S | Age bars → sage (good) / blush (aging) / rust-equivalent warning; Fraunces system names |

---

### 11.5 Report & Certificate Pages

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 11.5.1 | `ReportPage.tsx` (public share page) | ⬜ Missing | L | Highest-stakes public page; score display → Fraunces large number + sage gradient bar; section cards → new style; HomeFax badge → pill; "Powered by HomeFax" footer → plum |
| 11.5.2 | `ScoreCertPage.tsx` | ⬜ Missing | M | Certificate → Fraunces display type + plum/sage palette; shareable badge → new style |
| 11.5.3 | `GenerateReportModal.tsx` | ⬜ Missing | S | Modal → 20px radius, white background; form inputs → plum focus; generate button → plum pill |

---

### 11.6 Admin & Agent Pages

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 11.6.1 | `AdminDashboardPage.tsx` | ⬜ Missing | M | Metric cards → new card style; charts → sage/plum palette; admin-only badge → plum dark |
| 11.6.2 | `AgentDashboardPage.tsx` | ⬜ Missing | M | Pipeline cards → blush surface; proposal status badges → new variants; earnings summary → Fraunces numerals |

---

### 11.7 Login & Auth Pages

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 11.7.1 | `LoginPage.tsx` | ⬜ Missing | S | Page background → sage-light; card → white, 24px radius; Internet Identity button → plum pill; dev login → ghost pill |
| 11.7.2 | `RegisterPage.tsx` | ⬜ Missing | S | Same card style as login; role selector → pill toggle (Homeowner / Contractor / Agent) in plum/sage |

---

### Priority Tiers — Design Migration

**Tier 1-D — Highest Visibility (do first)**
- 11.1.1–11.1.6 Token foundation + shared components (unlocks everything else)
- 11.7.1–11.7.2 Login/Register (first authenticated experience)
- 11.2.1 Dashboard (most-visited authenticated page)
- 11.5.1 ReportPage (public-facing, buyer-visible)
- 11.2.5 PricingPage (conversion-critical)

**Tier 2-D — Core Workflows**
- 11.2.2–11.2.4 Property detail, job create, settings
- 11.3.1–11.3.5 Contractor + quote pages
- 11.5.2–11.5.3 Score cert + generate modal

**Tier 3-D — Feature Pages (after core is done)**
- 11.4.1–11.4.8 All feature pages
- 11.6.1–11.6.2 Admin + agent pages
- 11.2.6 Onboarding
