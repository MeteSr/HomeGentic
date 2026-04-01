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
| 1.2.1 | Multi-file upload UI | ✅ Done | S | `DocumentsTab` handles single-file uploads; needs batch mode |
| 1.2.2 | Claude-powered document classification | ⬜ Missing | L | POST files to voice agent server; Claude Vision classifies type (receipt/inspection/permit) |
| 1.2.3 | Auto-populate job records from parsed docs | ✅ Done | XL | `docIngestion.ts`: `ParsedDocExtraction` → `JobDraft` (pending_review); duplicate detection vs job history + existing drafts; `updateDraft` / `confirmDraft` (calls `jobService.create`) / `discardDraft` |
| 1.2.4 | Onboarding wizard with bulk upload step | ✅ Done | M | Add step to `OnboardingPage` after property registration |
| 1.2.5 | Duplicate detection across ingested docs | ✅ Done | M | SHA-256 dedup already exists in `photo` canister; apply at ingestion time |
| 1.2.6 | Progress UI for batch processing | ✅ Done | S | Show per-file status (parsing / done / failed) during ingestion |

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
| 2.4.1 | Sealed-bid quote submission | ⬜ Missing | L | Encrypt contractor bid price to canister IBE key via `@dfinity/vetkeys`; stored ciphertext in `quote` canister; reveal only after bid window closes |
| 2.4.2 | vetKeys sealed-bid reveal | ⬜ Missing | L | After window close, canister calls `vetkd_derive_key` to decrypt all bids in-canister, compares, and returns lowest-bid winner to homeowner only — no ZKP circuit required |
| 2.4.3 | Bid window timer | ⬜ Missing | M | Quote requests have a close date; after close, all bids revealed to homeowner only |
| 2.4.4 | Blind bidding UI | ⬜ Missing | M | Contractor sees only their own submitted price, not competitors'; homeowner sees all after close |

---

## 3. ICP Blockchain Layer — Untouchable Differentiation

### 3.3 "Dead Man's Switch" Continuity
**Vision:** If HomeFax ceases to exist, homeowner records remain fully accessible on ICP.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 3.3.1 | Self-service data export | ✅ Done | M | Export all property data (jobs, photos, reports) as a ZIP / JSON from the canister |
| 3.3.2 | Public read query on all record canisters | ⬜ Missing | M | Unauthenticated queries for property/job/photo data given owner principal |
| 3.3.3 | Open-source canister interfaces | ✅ Done | S | Publish Candid IDL specs so third-party UIs can read HomeFax canister data |
| 3.3.4 | "Your data, your keys" marketing page | ✅ Done | S | Landing page section explaining ICP data sovereignty |

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
| 4.1.1 | Visibility levels on report shares | ✅ Exists | — | `report` canister has `Full / Summary / ScoreOnly` visibility + revocation |
| 4.1.2 | Field-level disclosure toggles | ✅ Done | M | UI in `ReportPage` to choose which fields are visible per share link |
| 4.1.3 | vetKeys permit attestation | ⬜ Missing | M | Canister derives per-buyer key via `vetkd_derive_key`, issues IBE-encrypted signed "all permits closed" claim; buyer decrypts attestation with transport key, never sees underlying job data |
| 4.1.4 | vetKeys score threshold attestation | ⬜ Missing | M | Canister computes score, issues IBE-encrypted signed "score ≥ N" claim to requester's transport key without exposing individual job records |

### 4.2 Income-Blind Mortgage Proof
**Vision:** Prove property maintained above a quality threshold to lenders — without personal financial disclosure.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 4.2.1 | HomeFax score certification endpoint | ✅ Done | M | Canister returns a signed score certificate with no personal data |
| 4.2.2 | Lender-facing score verification page | ✅ Done | M | Unauthenticated URL: lender enters certification code, sees score + grade only |
| 4.2.3 | vetKeys score certificate | ⬜ Missing | L | Canister issues IBE-encrypted signed score attestation to lender's transport key; lender decrypts and reads score, no raw job records exposed |

### 4.3 Anonymous Neighborhood Benchmarking
**Vision:** Compare maintenance score vs. similar homes in zip code — without revealing individual neighbor data.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 4.3.1 | Zip code aggregate query | ✅ Done | L | `neighborhood.ts` service: deterministic mock stats, `getPercentileRank()` pure helper, factory closure with cache. 24 tests. |
| 4.3.2 | Neighborhood benchmarking UI | ✅ Done | M | `NeighborhoodBenchmark.tsx` component on dashboard — percentile bar, rank label, "Better than X% of N homes", trend, "View area →" link. |
| 4.3.3 | Neighborhood Health Index public page | ✅ Done | L | `NeighborhoodHealthPage.tsx` at `/neighborhood/:zipCode` — public, no auth. Avg/median scores, distribution chart, trend, top systems. |
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
| 5.3.4 | Score-to-value calculator UI | ✅ Done | M | Show "Your score of 91 in 78704 is associated with $18–24K buyer premium" on Dashboard |

### 5.4 Autonomous Permit Research
**Vision:** When a contractor proposes a renovation, AI pre-checks permit requirements and drafts the application.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 5.4.1 | Municipal permit API integration | ⬜ Missing | XL | Per-city permit data; no universal API exists — requires city-by-city or OpenPermit integration |
| 5.4.2 | Permit requirement lookup tool | ⬜ Missing | L | Agent tool: given service type + zip, returns permit required Y/N + estimated cost |
| 5.4.3 | Permit status tracking in job record | ✅ Done | M | Add `permitRequired: Bool`, `permitNumber: ?Text`, `permitStatus` to Job entity |
| 5.4.4 | Permit alert in job creation flow | ✅ Done | M | During `JobCreatePage`, auto-warn if selected service type typically requires permit |
| 5.4.5 | Permit application draft generation | ⬜ Missing | L | Agent drafts permit application text from job details; user downloads/submits |

---

## 6. HomeFax Report — The Resale Weapon

### 6.1 Score-to-Value Calculator
**Vision:** Show sellers exactly how much their HomeFax score is worth in dollar terms in their market.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 6.1.1 | HomeFax score computation | ✅ Exists | — | `market` canister `analyzeCompetitivePosition()` returns score + grade |
| 6.1.2 | Score-to-dollar premium model | ⬜ Missing | L | Needs market data (5.3.2); map score band → estimated premium range per zip |
| 6.1.3 | Dollar premium display on Dashboard | ✅ Done | M | "Your score is worth an estimated $X–$Y in your market" card |
| 6.1.4 | Premium estimate in HomeFax Report | ✅ Done | M | Include dollar value range in generated report for buyer/agent view |

### 6.2 Listing Platform Integration & Badge
**Vision:** HomeFax-verified homes display a badge on Zillow/Realtor.com.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 6.2.1 | HomeFax badge image generation | ✅ Done | M | SVG/PNG badge with score + grade; generated from canister data |
| 6.2.2 | Embeddable badge widget | ✅ Done | M | `<iframe>` or JS snippet for listing agents to embed on property pages |
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
| 6.5.1 | Certification threshold logic | ✅ Done | M | Canister query: `getCertificationData(propertyId)` → verifiedJobCount, verifiedKeySystems, meetsStructural (≥3 verified + ≥2 key systems) |
| 6.5.2 | Certified badge in HomeFax Report | ✅ Done | S | Visual badge on report + certification date |
| 6.5.3 | Insurance / buyer agent API | ⬜ Missing | XL | Partner program for insurers/agents to programmatically verify certification; legal framework needed |

---

## 7. Platform & Business Model Differentiation

### 7.1 Homeowner-Owned Data Sovereignty
**Vision:** Explicitly market that data lives on ICP canisters the homeowner owns — HomeFax is just the interface.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 7.1.1 | Data sovereignty explainer on landing page | ✅ Done | S | Section explaining ICP data ownership model |
| 7.1.2 | Self-service canister data export | ✅ Done | M | (See 3.3.1) |
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
| 7.4.1 | Zip-level score aggregation | ✅ Done | L | (See 4.3.1) |
| 7.4.2 | Neighborhood Health Index public page | ✅ Done | L | (See 4.3.3) |
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
| 8.4.5 | Insurance success story prompt | ✅ Done | S | After export, prompt: "Did this help with your insurer? Tell us what you saved." — feeds testimonials + in-app social proof |
| 8.4.6 | Premium discount estimate | ⬜ Missing | M | Based on record completeness and score, estimate potential insurance premium reduction (see 7.3.2) |

### 8.5 Annual Resale-Ready Milestone
**Vision:** At the 12-month mark, trigger a milestone that reframes the entire year as something meaningful and complete. Turns passive subscribers into advocates.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 8.5.1 | Annual milestone trigger | ✅ Exists | — | `showMilestone` in DashboardPage — fires when `accountAgeMs >= 11 months` + at least one job logged; dismissible banner |
| 8.5.2 | "Resale Ready" milestone screen | ✅ Exists | — | `ResaleReadyPage.tsx` at `/resale-ready` — score arc, stats grid, premium estimate, HomeFax Certified badge, share link generation, insurance defense link, "what a buyer sees" preview |
| 8.5.3 | Year-in-review email | ⬜ Missing | M | Email summarizing the year: jobs logged, score change, warranty reminders set, estimated value added |
| 8.5.4 | Milestone share card | ✅ Done | S | Shareable image: "My home has a HomeFax score of 81 — 43 verified records over 12 months." Organic social distribution |
| 8.5.5 | Advocate prompt at milestone | ✅ Done | S | After milestone screen, prompt referral: "Know a homeowner who should have this?" with referral link |

---

## 10. For Sale By Owner (FSBO) Mode — Seller Without an Agent

**Strategic thesis:** Roughly 10% of US home sales are FSBO. These sellers are underserved by every major platform — Zillow makes it cumbersome, FSBO.com is dated, and no one gives them tools that actually equip them to negotiate, price, and close confidently. HomeFax's verified maintenance record is the best FSBO asset that exists: it pre-answers buyer objections, replaces an inspection contingency, and signals a serious, prepared seller. The app should be the platform that makes FSBO actually work.

---

### 10.3 Public FSBO Listing Page

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 10.3.1 | Public listing page per FSBO property | ✅ Done | L | Unauthenticated `/for-sale/:propertyId` page: photos, list price, property details, HomeFax score badge, verified record summary, contact form — clean, shareable URL |
| 10.3.2 | HomeFax score badge as trust anchor | ✅ Done | S | On the public listing, the HomeFax score is front-and-center with a "Verified on ICP Blockchain" explainer; replaces the "trust us" gap that kills FSBO credibility |
| 10.3.3 | Full HomeFax report link on listing | ✅ Done | S | A "View Full Maintenance History" button links to the shared HomeFax report (uses existing `report` canister share link); buyer sees everything the seller wants to disclose |
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

## 12. Test Coverage — Gaps & Failing Areas

**Context:** Overall coverage is ~49% (12/21 frontend services, 12/30 pages e2e, 8/14 backend canisters). The gaps below are ordered by risk — scoring logic and canister algorithms with no tests are the highest priority.

---

### 12.1 Frontend Unit Tests — Missing Services

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 12.1.1 | `scoreService.ts` unit tests | ✅ Done | M | Highest risk gap. Tests needed for: `computeScore()` (40pt verified + 20pt value + 20pt verification + 20pt diversity rubric), `isCertified()` (score ≥88, ≥3 verified jobs, ≥2 key systems), `generateCertToken()` / `parseCertToken()` (Base64 encoding), `premiumEstimate()` (buyer premium ranges), `getScoreGrade()` (A+ through F) |
| 12.1.2 | `recurringService.ts` unit tests | ✅ Done | M | Completely untested despite complex canister integration. Cover: `create()`, `getByProperty()`, `updateStatus()`, `addVisitLog()`, `getVisitLogs()`, `toSummary()` — especially mock store behavior and `AlreadyCancelled` error guard |
| 12.1.3 | `scoreEventService.ts` unit tests | ✅ Done | S | Test `getRecentScoreEvents()` — 90-day window filter, max-12-events cap, deduplication, category assignment per event type |
| 12.1.4 | `auth.ts` unit tests | ✅ Done | M | Test: `register()`, `getProfile()`, `updateProfile()`, `hasRole()`, BigInt time-field conversions, Opt unwrapping (`raw.field[0] ?? undefined` pattern), error propagation |
| 12.1.5 | `pulseService.ts` unit tests | ✅ Done | S | Test `getWeeklyPulse()` — seasonal month detection, overdue service window (12 months), tip selection per season, empty-jobs edge case |
| 12.1.6 | `agentTools.ts` unit tests | ✅ Done | L | Test each Claude tool execution path: `classify_home_issue`, `create_maintenance_job`, `create_quote_request`, `search_contractors`, `sign_job_verification`, `update_job_status`; error recovery when canister call fails mid-tool |
| 12.1.7 | `agentProfile.ts` unit tests | ✅ Done | S | Test `appendToUrl()` / `fromParams()` round-trip, empty-param edge cases, `save()` / `load()` / `clear()` localStorage cycle |

---

### 12.2 Frontend Unit Tests — Gaps Within Existing Files

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 12.2.1 | `job.test.ts` — missing lifecycle methods | ✅ Done | M | Added: `create` (default fields, DIY `contractorSigned` behavior), `getByProperty` (filtering, empty result), `updateJob` (field updates, not-found), `updateJobStatus` (all four statuses), `verifyJob` (DIY→fully verified, non-DIY→partial), `linkContractor`, `getJobsPendingMySignature` (returns []), `getCertificationData` (meetsStructural threshold), `isInsuranceRelevant` + `INSURANCE_SERVICE_TYPES` |
| 12.2.2 | `property.test.ts` — transfer flow untested | ✅ Done | M | Added: `initiateTransfer` (maps PendingTransfer, error throws), `acceptTransfer` (ok/err via unwrap), `cancelTransfer` (resolves/throws), `getPendingTransfer` (mapped object + null when empty), `getOwnershipHistory` (maps TransferRecord[], returns [] without canister ID) |
| 12.2.3 | `quote.test.ts` — missing contractor side | ⬜ Missing | M | Add tests for contractor bid submission, quote expiration, urgency-based matching, and tier-enforced open-request limits (3 Free / 10 Pro+) |
| 12.2.4 | `report.test.ts` — missing share-link edge cases | ✅ Done | S | Add tests for: expired links (past `expiresAt`), `viewCount` increment, `listShareLinks` isolation per `propertyId`, `shareUrl` format with custom base URL |
| 12.2.5 | `contractor.test.ts` — missing review rate-limiting | ✅ Done | S | Add tests for 10-reviews-per-day-per-user limit, composite key deduplication on reviews |
| 12.2.6 | `sensor.test.ts` — missing anomaly detection | ⬜ Missing | M | Add tests for bulk reading ingestion, Critical event auto-creating a pending job (cross-service), alert threshold boundary values |
| 12.2.7 | `maintenance.test.ts` — missing climate/material variants | ⬜ Missing | M | Add tests for climate-adjusted lifespan (once 1.1.5 lands) and all 8 system types at boundary ages (exactly at threshold years) |

---

## 13. Benchmark & Load Testing

**Context:** HomeFax runs on ICP where cost is cycles-per-instruction, not per-request. Load testing has two goals: (1) throughput — can canisters handle concurrent users without queuing, and (2) cycles efficiency — are any calls burning disproportionate cycles that hit runway. The `monitoring` canister already tracks cycles and ARPU/LTV/CAC; what's missing is a baseline and stress scenarios.

---

### 13.1 Cycles Baseline — Cost Per Operation

Establish cycles cost for every significant canister call before any optimization work. Without a baseline, you can't measure improvement or catch regressions.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 13.1.1 | Baseline script for query calls | ⬜ Missing | S | Node.js script using `@dfinity/agent` that calls each read endpoint once and records cycles consumed; output CSV: canister, method, cycles_before, cycles_after, delta. Targets: `getMyProperties`, `getByProperty` (jobs), `getReport(token)`, `getSeasonalTasks`, `predictMaintenance` |
| 13.1.2 | Baseline script for update calls | ⬜ Missing | S | Same pattern for write paths: `createJob`, `generateReport`, `addVisitLog`, `createRecurringService`, `createRequest` (quote). Update calls go through consensus — latency matters as much as cycles |
| 13.1.3 | Identify top-3 cycles-heavy operations | ⬜ Missing | S | Run 13.1.1 + 13.1.2, sort by delta, flag any call above 1B cycles as a review candidate. `analyzeCompetitivePosition()` (market, 535 lines) and `predictMaintenance()` (iterates 8 systems) are the likely suspects |
| 13.1.4 | Integrate baseline into `monitoring` canister metrics | ⬜ Missing | M | Expose a `cyclesPerCall` map in `monitoring` canister's `metrics()` query; update it on each significant call so cost-per-operation is visible in the admin dashboard over time |

---

### 13.2 Canister Throughput & Concurrency

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 13.2.1 | Concurrent read stress test — `getReport` | ⬜ Missing | M | Simulate a HomeFax report URL shared in a real estate listing: fire 200 concurrent `getReport(token)` calls over 60 seconds via `@dfinity/agent`. Measure: p50/p95/p99 latency, error rate, cycles total. This is the most realistic "viral" scenario |
| 13.2.2 | Concurrent write stress test — `createJob` | ⬜ Missing | M | 50 concurrent `createJob` calls (simulating a busy contractor day). Measure consensus latency distribution, queue depth, any dropped calls. Update calls serialize through consensus — expect higher p99 |
| 13.2.3 | Contractor dashboard poll simulation | ⬜ Missing | S | 50 contractors refreshing `getOpenRequests()` every 30 seconds for 10 minutes. Query calls are cheap but volume can still saturate; measure cycles burn rate vs. expected monthly cost |
| 13.2.4 | Report generation spike | ⬜ Missing | M | 25 simultaneous `generateReport()` calls (snapshot creation + share link issuance). Tests canister stable memory write performance under concurrency |
| 13.2.5 | Cross-canister call latency | ⬜ Missing | M | Measure end-to-end latency for calls that touch multiple canisters: job creation (job → photo → property tier check), sensor Critical event (sensor → job auto-create). Inter-canister calls add latency per hop |

---

### 13.3 Algorithmic Load — Heavy Canister Methods

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 13.3.1 | `market` canister — `analyzeCompetitivePosition()` under load | ⬜ Missing | M | Largest canister (535 lines). Call with properties ranging from 1 to 100 jobs; chart cycles cost vs. input size. Flag if O(n²) or worse behavior exists in scoring loops |
| 13.3.2 | `maintenance` canister — `predictMaintenance()` at scale | ⬜ Missing | S | Call with build years from 1950 to 2024 for all 8 system types. Verify constant-time lookup (should be table-driven, not iterative). Measure with 1, 10, and 50 concurrent calls |
| 13.3.3 | `report` canister — snapshot size growth | ⬜ Missing | S | Generate reports with 0, 10, 50, 200 jobs and measure: snapshot serialization cycles, stable memory footprint, `getReport` deserialization time. Identify the point where large job histories create noticeable latency |
| 13.3.4 | `monitoring` canister — metrics aggregation under load | ⬜ Missing | S | Call `getMetrics()` while simultaneously running 13.2.1–13.2.4. Verify the monitoring canister doesn't become a bottleneck when all other canisters are logging to it concurrently |

---

### 13.4 Frontend Rendering Performance

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 13.4.1 | Dashboard rendering with large dataset | ⬜ Missing | M | Inject 25 properties + 200 jobs via `window.__e2e_*` and measure: time to first meaningful paint, React render time, scroll performance. The `Promise.all` in `DashboardPage` fetches all properties + jobs + recurring services in parallel — verify it doesn't block render |
| 13.4.2 | ReportPage rendering with 200-job snapshot | ⬜ Missing | S | Load a report snapshot containing 200 job records, 10 recurring services. Measure render time — this is a public page that buyers see; slow renders kill trust |
| 13.4.3 | Playwright performance baseline for key pages | ⬜ Missing | M | Use Playwright's `page.metrics()` to capture JS heap, DOM nodes, and layout duration for Dashboard, PropertyDetail, ReportPage. Commit as a baseline; alert on >20% regression. Ties into 12.6.2 |
| 13.4.4 | Bundle size audit | ⬜ Missing | S | Run `npm run build` and analyze `frontend/dist/` with `vite-bundle-visualizer`. Identify any unexpectedly large dependencies. Target: initial JS bundle < 200KB gzipped |

---

### 13.5 Load Test Scenarios — Realistic User Journeys

End-to-end scenarios that combine multiple calls, matching how real users interact with the app.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 13.5.1 | "Sell day" scenario | ⬜ Missing | M | Sequence: load ResaleReady checklist → view HomeFax score → generate report → create listing bid request. Measure total wall-clock time and total cycles burned end-to-end. This is the highest-value user journey |
| 13.5.2 | "Buyer due diligence" scenario | ⬜ Missing | S | Sequence: open shared report URL → view all sections → click score cert → view contractor public profiles. Entirely read-path; test with 100 concurrent "buyers" against one report token |
| 13.5.3 | "Active homeowner" scenario | ⬜ Missing | M | Simulate a homeowner who logs 3 jobs, adds 2 visit logs, uploads a photo, and regenerates their report in a single session. Measures realistic write load per engaged user |
| 13.5.4 | "Agent competition" scenario | ⬜ Missing | M | Once Section 9 (listing bid marketplace) is built: 10 agents simultaneously submit proposals to the same listing bid request. Tests write contention on the listing canister |

---

### 13.6 Infrastructure & Tooling

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 13.6.1 | `scripts/benchmark.sh` harness | ⬜ Missing | M | Bash/Node script that runs the full baseline suite (13.1.1 + 13.1.2) against a local replica and outputs a Markdown summary table. Run manually before each release; eventually CI on deploy |
| 13.6.2 | k6 load test suite for Express proxy | ⬜ Missing | M | k6 scripts targeting `POST /api/agent` and `POST /api/chat` on the voice agent server (port 3001). Scenarios: 1 VU ramp to 50, sustained 50 VU for 5 minutes, spike to 200 VU. Measures Anthropic API latency contribution vs. canister latency |
| 13.6.3 | Cycles burn rate dashboard | ⬜ Missing | M | Surface `monitoring` canister metrics in `AdminDashboardPage`: cycles remaining per canister, burn rate (cycles/day), estimated runway (days until top-up needed). Alert threshold at 30-day runway |
| 13.6.4 | Performance regression gate in CI | ⬜ Missing | L | After baseline is established (13.1.1–13.1.2): add a CI step that runs the baseline script on every PR and fails if any call regresses by >25% in cycles cost. Requires a lightweight local replica in CI |

---

---

## 14. Security — Audit Findings & Hardening

**Audit scope:** ~3,500 lines of Motoko across 14 canisters + ~2,000 lines of TypeScript/React + Express voice agent proxy. Audit completed 2026-03-27. Issues are ordered by severity.

---

### 14.4 Low / Hardening

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 14.4.1 | Warranty expiry timestamp overflow | ⬜ Missing | S | **LOW.** `useVoiceAgent.ts` computes warranty expiry as `Date.getTime() + warrantyMonths * MS_PER_MONTH`. Extreme values (year 2100 start date + 100-year warranty) can produce a number beyond JS `Number.MAX_SAFE_INTEGER`. Fix: clamp to a reasonable max date (e.g., year 2100) before comparison. |
| 14.4.2 | Secrets audit — confirm no keys in codebase | ⬜ Missing | S | Add `git-secrets` or `gitleaks` pre-commit hook to scan for API keys, private keys, and secrets patterns. Confirm `.env` is in `.gitignore` and `.env.example` contains only placeholders. Run a one-time `gitleaks detect` scan on full git history. |
| 14.4.3 | Stable memory schema migration safety | ⬜ Missing | M | The `report` canister's addition of `recurringServices` to `ReportSnapshot` is a breaking stable variable change. Old snapshots deserialized after upgrade will have an empty field (safe in this case due to Motoko's default handling), but there is no documented upgrade checklist or rollback plan. Fix: document a canister upgrade runbook (stop → redeploy → verify → rollback procedure) and add a schema version field to `ReportSnapshot`. |
| 14.4.4 | Canister `pause()` has no timeout or auto-recovery | ⬜ Missing | S | A paused canister stays paused indefinitely — if an admin principal is lost or compromised, the canister cannot be unpaused. Fix: add an optional `pauseDurationSeconds` parameter; auto-unpause after the duration. Alternatively, require 2-of-N admin approval to pause in production. |
| 14.4.5 | Verify `fetchRootKey` is never called in production | ⬜ Missing | S | `actor.ts` correctly gates `shouldFetchRootKey: IS_LOCAL`. Add a CI lint rule or build-time assertion that fails if `fetchRootKey: true` appears in any production code path. This is a defense-in-depth check — a future developer could accidentally enable it. |
| 14.4.6 | Anthropic API key not exposed to frontend — confirm in build | ⬜ Missing | S | The voice agent proxy correctly holds `ANTHROPIC_API_KEY` server-side and never sends it to the browser. Confirm this is enforced in the Vite config — no `VITE_ANTHROPIC_*` prefixed env var should exist, as Vite automatically inlines `VITE_*` vars into the bundle. Add a build step that greps `dist/` for the key pattern. |
| 14.4.7 | Migrate `agents/iot-gateway` from deprecated `@dfinity/*` to `@icp-sdk/core` | ⬜ Missing | M | **LOW.** `@dfinity/{agent,candid,identity,principal}` 1.x are deprecated in favour of `@icp-sdk/core` (migration guide: https://js.icp.build/core/latest/upgrading/v5). Current installs are on 1.4.0 (patched, no CVEs). Migrate before the gateway is built out — the API surface is small (`HttpAgent`, `Actor`, `Ed25519KeyIdentity`, `IDL`) so the change should be mechanical. Do this before the IoT gateway (1.3.6) is productionised. |

---

---

## 15. Free Tier Tightening — Conversion Urgency

**Problem:** The free tier currently gives away the full value proposition — unlimited job logging, permanent shareable reports, full score breakdown, market intelligence, and warranty wallet. There is no natural forcing function to upgrade. A homeowner can prepare their home for sale entirely on the free tier.

**Strategy:** Free users get enough to feel the value and get hooked, but hit professional-grade walls at the exact moment they need to use it seriously — when preparing to list or sell.

**The upgrade moment:** *"I'm ready to list — let me share my report"* → 7-day expiry warning → upgrade to Pro for a permanent, unbranded link.

---

### 15.2 Report Share Link Expiry

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 15.2.1 | Default share link TTL to 7 days for free tier | ✅ Done | M | In `report` canister `generateReport()`, check caller's tier. If Free, set `expiresAt = now + 7 days` regardless of what the caller passes. Pro+ retain the current behavior (caller-controlled expiry, including null = never). |
| 15.2.2 | Warn free users before link expires in `ReportPage` | ⬜ Missing | S | When a report is loaded and the share link expires within 48 hours, show a banner: "This report link expires [date]. Upgrade to Pro for a permanent link." |
| 15.2.3 | Show expiry in `GenerateReportModal` for free users | ⬜ Missing | S | In the success screen shown after `reportService.generateReport()` resolves (the screen that displays the shareable URL), add a conditional block below the URL: if the user is on Free, show an amber info row — "⚠ This link expires in 7 days · [Upgrade to Pro →]". If Pro+, show a green confirmation row — "✓ This link never expires". Check tier from `useAuthStore` / `paymentService.getSubscription()`. This is informational only, not a blocker — the user has already generated the report. |
| 15.2.4 | Expired free report shows upgrade prompt, not generic error | ⬜ Missing | S | When `getReport()` returns a revoked/expired token, `ReportPage` currently shows a generic error. For free-tier-expired links, show: "This HomeFax report has expired. The homeowner can upgrade to Pro to share a permanent link." |

---

### 15.3 Report Branding (Free Plan Watermark)

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 15.3.1 | Add `planTier` field to `ReportSnapshot` in `report` canister | ⬜ Missing | S | Add `planTier: Text` to the `ReportSnapshot` record type (use `Text` rather than importing the `Tier` variant from the payment canister to avoid inter-canister type coupling; valid values: `"Free"`, `"Pro"`, `"Premium"`, `"ContractorPro"`). In `generateReport()`, call `paymentCanister.getSubscription(msg.caller)`, read the tier, and store it in the snapshot. Requires `paymentCanisterId` stable var + `setPaymentCanisterId()` admin function (same pattern as 15.1.1). Update the IDL in `frontend/src/services/report.ts` to add `planTier: IDL.Text` to the `ReportSnapshot` record, and add `planTier: string` to the TypeScript interface. Old snapshots (before this field exists) will deserialize with an empty string — treat `""` as `"Free"` in the frontend. |
| 15.3.2 | Render "Free Plan" banner on `ReportPage` for free-tier reports | ✅ Done | S | When `snapshot.planTier === "Free"`, show a banner at the top of the public report: "Generated with HomeFax Free — upgrade to remove this banner and unlock permanent sharing." Buyers see this; it signals to them that the seller hasn't committed to the platform. |
| 15.3.3 | Remove banner from Pro+ reports | ⬜ Missing | S | Pro and Premium reports render with no banner, clean header, and a "Verified by HomeFax" trust badge instead. This makes the Pro report visually superior and the difference obvious. |

---

### 15.4 Score Breakdown Gating

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 15.4.1 | Show score number on free tier, lock breakdown | ✅ Done | M | The score breakdown appears in two places: (1) `DashboardPage` — the per-property score section, and (2) `PropertyDetailPage` — the Score tab. Apply the gate in both. Free users see the large score number and grade (e.g., "74 · C+") unchanged. The four scoring pillars rendered below it (`scoreService.computeScore()` returns `verifiedJobPts`, `valuePts`, `verificationPts`, `diversityPts`) are replaced with a single `<UpgradeGate>` card (see 15.7.1): icon 🔍, title "Score Breakdown", description "See exactly what's dragging your score down — upgrade to Pro." The gate check is: `if (tier === "Free") show gate else show pillars`. Read tier from `paymentService.getSubscription()` called once in the page's `useEffect`, stored in local state. |
| 15.4.2 | Lock improvement recommendations on free tier | ✅ Done | S | The "How to improve your score" action list (currently shown on Dashboard and PropertyDetailPage) is Pro-only. Free users see: "3 actions available — upgrade to see them." |
| 15.4.3 | Show full breakdown in score cert for Pro+ | ⬜ Missing | S | `ScoreCertPage` shows full breakdown for Pro+. Free users who earn a cert (score ≥88) still get the cert number, but the detailed sub-scores are blurred with an upgrade prompt. |

---

### 15.6 Feature Locks — High-Value Pages

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 15.6.1 | Lock Recurring Services on free tier | ✅ Done | S | Free users who navigate to `/recurring/new` see an upgrade gate page instead of the create form: "Recurring service contracts are a Pro feature — track lawn care, pest control, and pool maintenance with a Pro plan." This is a strong differentiator because contract continuity is exactly what buyers want to see. |
| 15.6.2 | Lock Market Intelligence on free tier | ✅ Done | S | `MarketIntelligencePage` shows a locked state for free users: "See how your home's maintenance investment compares to your neighbors — upgrade to Pro." The competitive positioning data is pure selling value and has no place on a free tier. |
| 15.6.3 | Lock Warranty Wallet on free tier | ✅ Done | S | `WarrantyWalletPage` shows a locked state: "Track active warranties and get expiry alerts — upgrade to Pro." Warranty data is high perceived value (especially for HVAC, roof, appliances) and easy to gate. |
| 15.6.4 | Lock Agent Marketplace and FSBO on free tier | ⬜ Missing | S | Both the listing bid request flow (Section 9) and FSBO mode (Section 10) require Pro or Premium. Free users who navigate to these flows see: "Selling your home? Upgrade to Pro to make agents compete for your listing — or go FSBO with our full toolkit." This is the highest-value gate of all. |
| 15.6.5 | Lock Insurance Defense on free tier | ✅ Done | S | `InsuranceDefensePage` is Pro-only. Free users see a locked state: "Build your evidence file for insurance claims — upgrade to Pro." |

---

### 15.7 Upgrade Prompts & Conversion UX

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 15.7.1 | Consistent upgrade gate component | ✅ Done | M | Create `frontend/src/components/UpgradeGate.tsx`. Props: `icon: string` (emoji), `feature: string` (feature name for the heading), `description: string` (one-line value prop), `tier?: "Pro" \| "Premium"` (defaults to `"Pro"`). Renders a bordered card (sage-light background, sage-mid border, 20px radius matching new design system) with: the icon at 40px, a Fraunces heading, the description in body text, and a plum pill button "Upgrade to [tier] →" that navigates to `/pricing`. No blurred preview of actual content — use a simple placeholder illustration or leave the card empty behind the gate. Blurring real content requires rendering it first, which leaks the data to the DOM; a clean locked card is both simpler and safer. Used by: 15.4.1, 15.4.2, 15.5.1, 15.5.2, 15.6.1–15.6.5. |
| 15.7.2 | Upgrade prompt on Dashboard for free users | ✅ Done | S | Free users see a persistent (but dismissible) upgrade banner on the Dashboard after logging their 3rd job: "You're building something valuable — unlock the full HomeFax experience." Triggers at job #3, not job #1 (let them get hooked first). |
| 15.7.3 | Highlight the upgrade moment in-app notification | ⬜ Missing | S | Scope: in-app notification only (no email or push — those require external infrastructure not yet in place). When a free user's `generateReport()` call succeeds in `GenerateReportModal`, immediately call `notificationService.create({ type: "ReportExpiry", message: "Your HomeFax report expires in 7 days — upgrade to Pro for a permanent link.", propertyId })`. This surfaces in the notification bell on the next page load. The existing `notifications.ts` service and bell UI already support this; no new infrastructure needed. Email/push upgrade reminders are a separate future item once an email provider is integrated. |
| 15.7.4 | Update `PricingPage` feature comparison table | ✅ Done | S | Reflect all new gates in the pricing table: add rows for Recurring Services, Market Intelligence, Warranty Wallet, Score Breakdown, 5-Year Maintenance Calendar, Permanent Report Links, Agent Marketplace, FSBO mode. Free column shows ✗ for all new locked items. |
| 15.7.5 | "You're on Free" tier indicator in Settings | ✅ Done | S | `SettingsPage` shows the user's current tier prominently with a one-click upgrade CTA. Currently this exists but should be made more prominent for free users — show what they're missing with a short feature list. |

---

## 16. Single-Property Home Screen — Closing the Dashboard Gap ⚠️ P0

> **Why this is top priority:** The Dashboard drives nearly every retention, engagement, and conversion mechanic in HomeFax — score intelligence, decay alerts, re-engagement prompts, market recommendations, milestone banners, upgrade nudges. But single-property users — the statistical majority of early adopters — never see it. When a user has exactly one property, `DashboardPage` immediately redirects them to `PropertyDetailPage`. That page has a basic score and two action buttons. Everything else is invisible to these users. Every retention feature we build is wasted on our largest cohort until this is fixed.
>
> **Design principle:** `PropertyDetailPage` already *is* the home screen for single-property users. It must feel complete — not like a Dashboard with features stripped out. Single-property users should never see a "Go to Dashboard" link or feel that they're on a lesser page. The property page gains a **Home Panel** above its tab bar that surfaces everything the Dashboard provides, contextualized to the single property they're looking at.
>
> **Architecture:** Extract shared sections into standalone components (16.1 is the enabling task). Both `DashboardPage` and `PropertyDetailPage` then import the same components. No logic duplication. The property page detects `storeProperties.length === 1` to know it's acting as the home screen and renders the full Home Panel.

### 16.3 Navigation & Routing Cleanup
**Vision:** Single-property users should never encounter navigation that assumes a multi-property context. Fix any copy, links, or empty states that point them toward a Dashboard they'll never see.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 16.3.1 | Remove "← Back to Dashboard" from property page for single-property users | ✅ Done | S | `PropertyDetailPage` back button navigates to `/dashboard` — for single-property users this redirects back to the property page (infinite loop). Conditionally hide or replace with "← Home" that navigates to `/` when `storeProperties.length === 1`. |
| 16.3.2 | Nav sidebar active state for single-property users | ✅ Done | S | The global nav highlights "Dashboard" as active. For single-property users whose home is `/properties/:id`, the sidebar shows nothing highlighted. Fix: treat the property detail route as "active home" when user has one property. |
| 16.3.3 | "Add a second property" upsell on Home Panel | ✅ Done | S | At the bottom of the Home Panel, show a soft upsell: "Tracking a rental or vacation property? Add it to HomeFax." Links to `/properties/new`. Shown only after 30+ days of active use (account age check) to avoid overwhelming new users. |

---

1. **16.1.1–16.1.7** Component extraction first — enables everything below without duplication
2. **16.2.1** Score Panel + decay on property page — fixes the most visible score accuracy gap
3. **16.2.2–16.2.5** Alert stack + feed + milestones + re-engagement — core retention parity
4. **16.3.1–16.3.2** Nav cleanup — prevents confusing UX regressions
5. **16.2.6–16.2.8 + 16.3.3** Market Intel, Recurring, modal UX, upsell — full feature parity
