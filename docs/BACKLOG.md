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
| 1.1.3 | 5-year rolling calendar view | 🟡 Partial | M | `PredictiveMaintenancePage` shows urgency cards but no multi-year calendar UI |
| 1.1.4 | Per-task cost estimate ranges | 🟡 Partial | M | `market` canister has ROI data; wire cost estimates into maintenance forecasts |
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
| 2.3.1 | Warranty record type in job/fixture entity | ⬜ Missing | M | Add `warrantyExpiry: ?Int` and `warrantyDocHash: ?Text` to Job or Fixture |
| 2.3.2 | Warranty entry UI | ⬜ Missing | S | Add warranty fields to `JobCreatePage` and `PropertyDetailPage` job editor |
| 2.3.3 | Expiry alert system | ⬜ Missing | M | `maintenance` canister scheduled query: find warranties expiring in <90 days, generate alerts |
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
| 3.2.2 | Document type taxonomy | 🟡 Partial | S | `ConstructionPhase` enum exists; extend with `Permit`, `Inspection`, `Warranty`, `Invoice` |
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
| 5.1.3 | Issue classification tool | 🟡 Partial | M | `agentTools.ts` has tools defined; classification tool not yet wired to `quote.createRequest()` |
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

- 1.1.3 5-year calendar view
- 1.1.4 Per-task cost estimates
- 2.1.5 Trust score auto-increment on verified jobs
- 2.3.1–2.3.5 Warranty wallet
- 3.1.2–3.1.4 Ownership transfer log + UI
- 3.2.2–3.2.3 Document type taxonomy + permit/inspection uploads
- 4.1.2 Field-level disclosure toggles on report shares
- 5.1.3 Issue classification tool (wire voice agent → quote creation)
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
| 8.1.4 | In-app Pulse notification | ⬜ Missing | S | Dashboard banner or notification feed entry for the week's Pulse content |
| 8.1.5 | Pulse opt-out / frequency controls | ⬜ Missing | S | User preference in `SettingsPage` Notifications tab; already has toggle UI pattern |
| 8.1.6 | Pulse content personalization over time | ⬜ Missing | M | Track which Pulse items the user acted on; Claude weights future digests toward high-signal topics |

### 8.2 Score Micro-Increments & Dollar-Value Display
**Vision:** The score moves every week for an engaged user. Every increment shows a dollar value. People don't cancel things they're actively improving.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 8.2.1 | Score event system | ⬜ Missing | M | Define all scoreable micro-actions: upload doc, add appliance, connect utility, confirm scheduled service, log DIY task, respond to AI prompt |
| 8.2.2 | Micro-increment scoring in `market` canister | ⬜ Missing | M | Lightweight point increments (not just full competitive analysis) for each score event; stored in `monitoring` canister for history |
| 8.2.3 | Score history / sparkline | ⬜ Missing | M | 30/90-day score trend chart on Dashboard; shows upward trajectory for engaged users |
| 8.2.4 | Dollar value of score change | ⬜ Missing | M | "Your score went from 74 to 77. In Flagler County, a 3-point increase ≈ $4,200 in home value." Requires score-to-value model (6.1.2) |
| 8.2.5 | Score increase push notification | ⬜ Missing | S | Trigger notification when score increases ≥ 1 point; show new score + dollar value |
| 8.2.6 | Score stagnation alert | ⬜ Missing | S | If score hasn't moved in 30 days, prompt the user with the easiest action to earn points |

### 8.3 Cancellation Flow — Make It Feel Like Data Loss
**Vision:** The cancel flow shows exactly what's at stake: verified records, active warranties, score, ICP chain of custody. Factually accurate, not manipulative.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 8.3.1 | Cancellation intent screen | ⬜ Missing | M | Before cancellation is confirmed, show: verified record count, active warranty reminders, current score, "what happens if you cancel" |
| 8.3.2 | Post-cancel read-only mode | ⬜ Missing | M | Cancelled accounts retain read access to their on-chain records; score stops updating; reports become static |
| 8.3.3 | "Your records stay on ICP" messaging | ⬜ Missing | S | Explicit copy explaining that ICP records are permanent even after cancel — honest, trust-building |
| 8.3.4 | Pause subscription option | ⬜ Missing | S | 1–3 month pause instead of cancel; reduces hard churn; `payment` canister needs pause state |
| 8.3.5 | Win-back email sequence | ⬜ Missing | M | 7/30/90-day post-cancel emails highlighting new records that would have been created; "Your home didn't stop aging" |

### 8.4 Insurance Defense Mode — Florida-Specific Retention Hook
**Vision:** One-tap export of all maintenance records formatted for insurance company submission. One successful insurance interaction pays for 3+ years of HomeFax.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 8.4.1 | Insurance Defense export format | ⬜ Missing | M | PDF template: HVAC dates, roof inspection photos, electrical updates — all with ICP timestamps and blockchain verification reference |
| 8.4.2 | "Insurance Defense Mode" UI | ⬜ Missing | M | Dedicated section in `ReportPage` or `SettingsPage`; single button generates insurer-formatted PDF |
| 8.4.3 | Key insurance-relevant fields on job records | ⬜ Missing | S | Flag jobs as "insurance-relevant" (roof, HVAC, electrical, plumbing, foundation); `Job` entity extension |
| 8.4.4 | Insurer-specific export templates | ⬜ Missing | L | Different Florida insurers have different documentation formats; template library for major carriers (Citizens, Universal, Heritage) |
| 8.4.5 | Insurance success story prompt | ⬜ Missing | S | After export, prompt: "Did this help with your insurer? Tell us what you saved." — feeds testimonials + in-app social proof |
| 8.4.6 | Premium discount estimate | ⬜ Missing | M | Based on record completeness and score, estimate potential insurance premium reduction (see 7.3.2) |

### 8.5 Annual Resale-Ready Milestone
**Vision:** At the 12-month mark, trigger a milestone that reframes the entire year as something meaningful and complete. Turns passive subscribers into advocates.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 8.5.1 | Annual milestone trigger | ⬜ Missing | S | Check account age in `auth` canister; on 12-month anniversary, fire milestone event |
| 8.5.2 | "Resale Ready" milestone screen | ⬜ Missing | M | Full-page milestone view: record depth vs. comparable homes, buyer confidence score, preview of what a buyer would see |
| 8.5.3 | Year-in-review email | ⬜ Missing | M | Email summarizing the year: jobs logged, score change, warranty reminders set, estimated value added |
| 8.5.4 | Milestone share card | ⬜ Missing | S | Shareable image: "My home has a HomeFax score of 81 — 43 verified records over 12 months." Organic social distribution |
| 8.5.5 | Advocate prompt at milestone | ⬜ Missing | S | After milestone screen, prompt referral: "Know a homeowner who should have this?" with referral link |

### 8.6 Post-Service Habit Loop
**Vision:** After every job: push notification → score increase → record on-chain → AI prompt for next related service. Three completions in year one → churn rate fraction of manual-only users.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 8.6.1 | Post-job completion notification | ⬜ Missing | S | Push/email after job status → `verified`: "Your HVAC service is now on your HomeFax record" |
| 8.6.2 | Next-service prompt from completed job | ⬜ Missing | M | After HVAC service verified, AI agent prompts: "HVAC filters should be replaced in 3 months — add to schedule?" |
| 8.6.3 | "Add to schedule" one-tap flow | 🟡 Partial | S | `PredictiveMaintenancePage` has schedule section; needs one-tap add from post-job prompt |
| 8.6.4 | Contractor re-engagement via job history | ⬜ Missing | M | After 11 months since last HVAC service: "Book Cool Air Services again — they did your last service and you gave no complaints" |
| 8.6.5 | In-app job completion animation | ⬜ Missing | S | Brief celebratory moment when a job is verified — score counter ticks up, record "locks" on-chain. Small but habit-forming. |
| 8.6.6 | 3-service engagement milestone | ⬜ Missing | S | Badge/reward at 3 contractor-verified jobs: "Your home history is taking shape" — correlates with long-term retention |

---

## Updated Priority Tiers

*(Tiers 1–4 from original backlog unchanged. Retention items added below.)*

### Tier 1-R — Retention: High ROI, Low Effort
Build these alongside Tier 1 MVP polish. Each addresses a root churn cause with minimal new infrastructure.

- 8.1.4 In-app Pulse notification (S)
- 8.1.5 Pulse opt-out controls (S)
- 8.2.3 Score sparkline on Dashboard (M)
- 8.2.5 Score increase push notification (S)
- 8.2.6 Score stagnation alert (S)
- 8.3.4 Pause subscription option (S)
- 8.4.3 Insurance-relevant job flags (S)
- 8.5.1 Annual milestone trigger (S)
- 8.6.1 Post-job completion notification (S)
- 8.6.5 In-app job completion animation (S)
- 8.6.6 3-service engagement milestone (S)

### Tier 2-R — Retention: Medium Effort, Core Differentiators
- 8.1.1–8.1.3 Home Pulse digest with email delivery (L+M+M)
- 8.2.1–8.2.2 Score event system + micro-increments (M+M)
- 8.2.4 Dollar value of score change (M) — requires 6.1.2 first
- 8.3.1–8.3.2 Cancellation flow + read-only mode (M+M)
- 8.4.1–8.4.2 Insurance Defense export (M+M)
- 8.5.2–8.5.3 Resale-ready milestone screen + email (M+M)
- 8.6.2–8.6.4 Post-service habit loop (M+M+M)

### Tier 3-R — Retention: Infrastructure-Heavy
- 8.1.6 Pulse personalization over time (M)
- 8.3.5 Win-back email sequence (M)
- 8.4.4 Insurer-specific export templates (L)
- 8.6.4 Contractor re-engagement (M)

---

*Last updated: 2026-03-26*
