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

--

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

---

## 3. ICP Blockchain Layer — Untouchable Differentiation

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

### 8.4 Insurance Defense Mode — Florida-Specific Retention Hook
**Vision:** One-tap export of all maintenance records formatted for insurance company submission. One successful insurance interaction pays for 3+ years of HomeFax.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 8.4.4 | Insurer-specific export templates | ⬜ Missing | L | Different Florida insurers have different documentation formats; template library for major carriers (Citizens, Universal, Heritage) |
| 8.4.6 | Premium discount estimate | ⬜ Missing | M | Based on record completeness and score, estimate potential insurance premium reduction (see 7.3.2) |

---

### 13.5 Load Test Scenarios — Realistic User Journeys

End-to-end scenarios that combine multiple calls, matching how real users interact with the app.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 13.5.4 | "Agent competition" scenario | ⬜ Missing | M | Once Section 9 (listing bid marketplace) is built: 10 agents simultaneously submit proposals to the same listing bid request. Tests write contention on the listing canister |

---

## 16. AI Agent — Expanded Capabilities

### 16.1 Predictive Maintenance Intelligence

**Context:** `maintenanceService.predictMaintenance()` already computes system lifespan estimates, replacement windows, and cost forecasts from year built + job history. The agent currently ignores this entirely. Wiring it in turns generic maintenance advice into property-specific predictions.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 16.1.1 | Inject predictive maintenance data into agent context | ✅ Exists | M | `buildMaintenanceForecast()` in `maintenanceForecast.ts` injected via `buildContext()` in `useVoiceAgent.ts` |
| 16.1.2 | System lifespan section in system prompt | ✅ Exists | S | Rendered in `agents/voice/prompts.ts` — urgent systems with % life used, years remaining, cost range; stable systems listed briefly |
| 16.1.3 | `get_maintenance_forecast` tool | ✅ Exists | M | Specific system lookup (case-insensitive) + overview mode; graceful messages for unknown systems and no properties |
| 16.1.4 | Proactive replacement alerts in agent greeting | ✅ Exists | S | `"maintenance"` alert fires in `useVoiceAgent.ts` when `criticalSystems.length > 0` |

### 16.2 Bid Management

**Context:** The agent knows a quote request exists (`openQuoteCount`) but cannot show, compare, or act on bids. The full quote → bid → accept/decline loop is invisible.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 16.2.1 | Inject open quotes + bids into agent context | ✅ Exists | M | `buildContext()` fetches open/quoted requests + `getBidCountMap()`; injects `openQuoteRequests[]` into `AgentContext`; system prompt renders each request with bid count |
| 16.2.2 | `list_bids` tool | ✅ Exists | M | Fetches bids via `quoteService.getQuotesForRequest()`, sorts by amount, enriches top 3 with contractor name + trust score via `contractorService.getContractor()` |
| 16.2.3 | `accept_bid` tool | ✅ Exists | M | Calls `quoteService.accept(quoteId)`; agent always confirms before calling |
| 16.2.4 | `decline_quote` tool | ✅ Exists | S | Calls `quoteService.close(requestId)`; confirms with user before calling |

### 16.3 Score Trend & Coaching

**Context:** Score history is already stored as weekly snapshots in localStorage. The agent can report the current score but cannot explain movement or proactively coach users toward the next milestone.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 16.3.1 | Inject score trend into agent context | ✅ Exists | S | `buildScoreTrend()` in `scoreTrend.ts` calls `loadHistory()` + `scoreDelta()`; injected as `scoreTrend` in `buildContext()` |
| 16.3.2 | Score trend section in system prompt | ✅ Exists | S | Rendered in `agents/voice/prompts.ts` — "Score moved up/down from X → Y (+/- Z pts since last week)" when delta is non-zero |
| 16.3.3 | Score milestone coaching | ✅ Exists | M | `computeMilestoneCoaching()` detects within-5-pts of grade/Certified boundaries; picks cheapest free action first (pending job sign-off), then diversity, value, verification |

### 16.4 Post-Job Review Prompting

**Context:** After a job is signed, the agent currently says nothing more. Contractor reviews are a trust signal that benefit the whole marketplace — closing the loop in-conversation is the highest-leverage place to collect them.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 16.4.1 | Post-sign review prompt | ✅ Exists | S | `sign_job_verification` result now includes `contractorName` + `contractorPrincipal`; system prompt instructs agent to follow up with review offer when principal is present |
| 16.4.2 | `submit_contractor_review` tool | ✅ Exists | M | Tool in `agentTools.ts` + `agents/voice/tools.ts`; calls `contractorService.submitReview(principal, rating, comment, jobId)`; rate-limit errors surfaced gracefully |

### 16.5 Natural Language Report Sharing

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 16.5.1 | `share_report` tool | ✅ Exists | M | Calls `reportService.generateReport()` with property + jobs from services; returns `shareUrl(token)`; supports `Public`/`BuyerOnly` visibility and optional `expiry_days` |
| 16.5.2 | `revoke_report_link` tool | ✅ Exists | S | Two-mode tool: `list_links_for_property` shows active links first; `token` revokes after user confirms; calls `reportService.revokeShareLink()` |

### 16.6 Receipt & Document Photo Parsing (Vision)

**Context:** Claude supports vision in the API. If a user attaches a photo of a receipt or contractor invoice, the agent can extract job details and pre-fill `create_maintenance_job` — dramatically lowering logging friction.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 16.6.1 | Image upload in chat UI | ✅ Exists | M | `VoiceAgent` has a hidden file input + paperclip button; `attachImage(file)` in `useVoiceAgent` calls `fileToBase64()` and stores `pendingImage` state; pending indicator shown with X to clear |
| 16.6.2 | Vision support in agent server | ✅ Exists | M | `buildImageUserMessage()` in `imageUtils.ts` builds Claude-compatible `[image, text]` content block; `runAgentLoop` prepends it when `pendingImage` is set; server JSON limit raised to 5MB |
| 16.6.3 | Receipt extraction → job pre-fill | ✅ Exists | M | System prompt instructs agent to extract contractor/service/date/amount from image, confirm all fields before calling `create_maintenance_job`, and handle illegible images gracefully |

### 16.7 Contractor Role Context

**Context:** The agent currently has no awareness of the logged-in user's role. A contractor logging in gets the homeowner experience — no lead feed, no bid tools, no earnings summary.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 16.7.1 | Inject role + contractor profile into agent context | ✅ Exists | M | `buildContext()` reads role from `useAuthStore`; if Contractor, calls `contractorService.getMyProfile()` and injects `ContractorContext` into `AgentContext.contractorProfile` |
| 16.7.2 | Role-aware system prompt branching | ✅ Exists | S | `buildSystemPrompt()` branches to `buildContractorSystemPrompt()` when `ctx.role === "Contractor"` — separate persona focused on leads, bids, earnings, and job signing |
| 16.7.3 | `list_leads` tool | ✅ Exists | M | Calls `contractorService.getMyProfile()` for specialties, `quoteService.getOpenRequests()` for leads, filters + sorts by urgency, caps at 5 |
| 16.7.4 | `submit_bid` tool | ✅ Exists | M | Calls `quoteService.submitQuote(requestId, amountCents, timelineDays, validUntilMs)`; converts dollars→cents; 30-day validity default |
| 16.7.5 | `get_earnings_summary` tool | ✅ Exists | S | Filters `jobService.getAll()` by `job.contractor === profile.id`; sums verified job earnings; counts pending (completed/in-progress) separately |

---

## 17. Growth & Activation — "Inexplicable Not To Sign Up"

The features below address the core signup conversion gap: a new homeowner visits HomeFax, reads the pitch, but has no immediate, personally-felt reason to create an account today. Each item below corresponds to a product lever that makes the value tangible before sign-up, or dramatically lowers the cost of getting that value.

### 17.1 Pre-Quote Price Benchmarking by Zip Code

**Vision:** Before a homeowner ever submits a quote request, show them what that job actually costs in their area. Eliminates "am I getting ripped off?" anxiety and makes HomeFax the first stop for any repair decision.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 17.1.1 | Zip-code price benchmark data source | ⬜ Missing | L | Aggregate from closed bids in the `quote` canister (anonymized) + seed with Homewyse / RSMeans baseline data; store in a new `pricing_benchmark` canister or extend `price` canister |
| 17.1.2 | `get_price_benchmark` agent tool | ⬜ Missing | M | Takes `serviceType` + `zipCode`; returns `{ low, median, high }` in dollars with sample size; agent quotes ranges conversationally |
| 17.1.3 | Price benchmark UI widget on quote request page | ⬜ Missing | M | Show "Typical cost in [zip]: $800–$1,200" inline before the homeowner submits; no login required to view |
| 17.1.4 | Public price lookup page (no login) | ⬜ Missing | M | `/prices?service=roofing&zip=33101` — shareable, SEO-indexed; CTA to "Get quotes from verified contractors" drives registration |
| 17.1.5 | Benchmark confidence indicator | ⬜ Missing | S | Show sample size ("based on 47 local jobs") and last-updated date; hide widget when sample < 5 to avoid misleading ranges |

### 17.2 Zero-Effort Onboarding — Instant Value Before First Login

**Vision:** Enter your address → get a real maintenance forecast in under 30 seconds. No account needed for the first impression; account creation locks in the data.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 17.2.1 | Public address → forecast endpoint | ⬜ Missing | M | Unauthenticated API: accepts address, returns `MaintenanceForecastContext` derived from year built + property type (sourced from public records or user input); no canister write, stateless |
| 17.2.2 | Pre-auth forecast landing page | ⬜ Missing | M | `/instant-forecast` page: address autocomplete + year-built input → renders forecast summary (critical systems, estimated 10-year budget); no login wall |
| 17.2.3 | "Save your forecast" conversion CTA | ⬜ Missing | S | After forecast renders, prompt "Create a free account to track this property and log maintenance" — one click preserves the forecast into the user's registered property |
| 17.2.4 | Public records year-built lookup | ⬜ Missing | L | Integrate ATTOM Data or a county assessor API to auto-fill year built from address; reduces user friction to zero inputs |
| 17.2.5 | Forecast → account migration | ⬜ Missing | S | After sign-up, pre-populate `propertyService.register()` with the address and year built from the pre-auth session; forecast is immediately available in the dashboard |

### 17.3 Score → Dollar Value Translation

**Vision:** Replace the abstract "your score is 74/100" with "your verified maintenance records add an estimated $18,400 to your home's resale value." Converts an engagement metric into a financial asset the homeowner owns.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 17.3.1 | Score-to-dollar conversion model | ⬜ Missing | L | Model maps score + property value (estimated from Zestimate API or user-entered) to resale premium; basis: NAR/NerdWallet data showing documented maintenance = 1–3% value uplift; store coefficients in `market` canister |
| 17.3.2 | Dollar value display on score page | ⬜ Missing | M | "Your HomeFax records are worth approximately $[X] in buyer confidence" shown prominently on `ScorePage`; updates as score changes |
| 17.3.3 | Dollar delta on job log | ⬜ Missing | S | When a job is logged and verified, show "+$[estimated delta] added to your home's documented value" in the confirmation UI |
| 17.3.4 | Property value input / Zestimate integration | ⬜ Missing | M | Allow homeowner to enter estimated home value; optional: pull from Zillow Zestimate API if available; store on `property` canister as `estimatedValueDollars` |
| 17.3.5 | Score value section in HomeFax Report | ⬜ Missing | S | Report includes "Documented maintenance value: $[X]" line in the summary section shown to buyers |

### 17.4 Buyer-Side Product — Public Report Lookup

**Vision:** Buyers search by address to pull a public HomeFax report before making an offer. This is the top-of-funnel for homeowner sign-ups: buyers ask sellers "why don't you have a HomeFax report?"

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 17.4.1 | Public address search for reports | ⬜ Missing | M | `/check/:address` page (no login): searches `report` canister for any public share link for that address; shows "HomeFax Verified" badge or "No report on file" with a CTA for the seller |
| 17.4.2 | "Request a report" flow for buyers | ⬜ Missing | M | If no report exists, buyer can submit a request via email to the property owner (or leave a pending request notification if the owner signs up later) |
| 17.4.3 | Buyer-facing report view (no login) | ⬜ Missing | S | When a `Public` share link exists, render the full report without requiring the buyer to create an account; existing report share page may already support this — confirm and remove any login gate |
| 17.4.4 | SEO-indexed report landing pages | ⬜ Missing | M | Public reports rendered server-side (SSR/ISR via Next.js or Cloudflare Worker) for Google indexing; `<title>HomeFax Report — 123 Main St, Austin TX</title>` drives organic search traffic |
| 17.4.5 | "No report found" seller CTA page | ⬜ Missing | S | When a buyer searches an address with no report, show "Are you the homeowner? Start your free HomeFax report in 2 minutes" — direct acquisition channel from buyer intent |

### 17.5 Permit Auto-Import on Sign-Up

**Vision:** On registration, pull every permit on record for the address from municipal databases and pre-populate the job history. The homeowner sees value before they type a single thing.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 17.5.1 | Municipal permit API integration | ✅ Exists | XL | `permitImport.ts` service + `POST /api/permits/import` relay on voice server; queries OpenPermit.org (requires `OPEN_PERMIT_API_KEY`); 24-city MVP coverage; `mapPermitTypeToServiceType` maps 9 permit categories; returns empty list in dev when key absent |
| 17.5.2 | Permit → job record mapping | ✅ Exists | M | `permitToJobInput()` maps OpenPermitRecord → job input; `createJobsFromPermits()` calls `jobService.create()` for each confirmed permit with permitNumber injected |
| 17.5.3 | Post-registration permit import trigger | ✅ Exists | M | `triggerPermitImport()` called in `PropertyRegisterPage.handleSubmit` after registration; routes to review step (step 4) if permits found; skips to dashboard if none |
| 17.5.4 | Permit import review UI | ✅ Exists | M | `PermitImportReviewPanel` component: per-permit checkboxes, contractor/cost display, "Add to History" (confirmed subset) + "Skip" actions; wired as step 4 in `PropertyRegisterPage` |
| 17.5.5 | Permit import coverage indicator | ✅ Exists | S | `PermitCoverageIndicator` shown in step 1 of `PropertyRegisterPage` when city+state filled; "✓ Permit data available for Daytona Beach" or "not available" |

### 17.6 Email Receipt Forwarding → Auto-Log

**Vision:** Forward any contractor receipt to receipts@homefax.app and the job is logged automatically. Zero-friction logging that works without opening the app.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 17.6.1 | Inbound email endpoint | ⬜ Missing | L | Set up `receipts@homefax.app` via Postmark / SendGrid Inbound Parse or AWS SES; route to a new `emailParser` Node.js service |
| 17.6.2 | Email → principal mapping | ⬜ Missing | M | User registers a forwarding email address in account settings (stored on `auth` canister); inbound email matched to principal by `From` or `Reply-To` header |
| 17.6.3 | Claude vision receipt extraction | ⬜ Missing | M | `emailParser` passes attachments (PDF/JPG invoices) to Claude API with vision; extracts contractor, service, date, amount using same prompt as §16.6 |
| 17.6.4 | Extracted job → canister write | ⬜ Missing | M | After extraction, calls `jobService.create()` on behalf of the matched principal; sets `status: "pending_homeowner"` so homeowner can review before it counts toward score |
| 17.6.5 | Confirmation email to homeowner | ⬜ Missing | S | Send "We logged a [service] job for $[amount] on [date] — tap to confirm or edit" email with a magic link back to the pending job |
| 17.6.6 | Email forwarding setup UI | ⬜ Missing | S | Account settings page: "Forward receipts to receipts@homefax.app from [your email]" with copy button and status indicator |
| 17.6.7 | Attachment-less email handling | ⬜ Missing | S | If email has no attachment, parse the email body as plain text receipt; fall back to asking the homeowner to resend with the attachment |

### 17.7 Public System Age Estimator (No Login)

**Vision:** Enter your home's year built → see estimated ages and remaining lifespan of every major system. No login. Drives sign-up by making abstract risk concrete and personal.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 17.7.1 | Public estimator page | ✅ Exists | M | `/home-systems?yearBuilt=1998&type=single-family` — renders a system age table with urgency indicators; no login; `estimateSystems()` in `systemAgeEstimator.ts` wraps `predictMaintenance()` |
| 17.7.2 | Shareable estimator URL | ✅ Exists | S | `buildEstimatorUrl()` encodes inputs into URL params; read-only input + copy button on results page |
| 17.7.3 | "Track this property" CTA | ✅ Exists | S | CTA on results page links to `/properties/new?yearBuilt=…&type=…`; converts estimation curiosity into registration intent |
| 17.7.4 | Estimator embeddable widget | ⬜ Missing | M | JavaScript embed snippet (`<script src="https://homefax.app/widget.js">`) for real estate blogs, HOA sites, and home inspector websites; renders estimator inline; CTA links back to HomeFax |
| 17.7.5 | Estimator → forecast migration | ✅ Exists | S | CTA href carries `yearBuilt` + `type` params; `PropertyRegisterPage` can read them to pre-populate fields |

---

## 14. Technical Debt & Architecture

### 14.1 Inter-Canister Call Audit (post-consolidation)
**Context:** The `price` canister was merged into `payment`, and the `room` canister was merged into `property`. Any code that still calls these as separate canisters (by principal ID or service binding) will break silently in production.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 14.1.1 | Audit all canisters for cross-calls to `price` | ⬜ Missing | S | Grep all `.mo` files for `price` canister principal references; update any `actor(priceId)` calls to use `payment` canister's `getPricing`/`getAllPricing` queries instead |
| 14.1.2 | Audit all canisters for cross-calls to `room` | ⬜ Missing | S | Grep all `.mo` files for `room` canister principal references; update any actor calls to target `property` canister's room methods |
| 14.1.3 | Remove `backend/price/` and `backend/room/` directories | ⬜ Missing | S | After confirming no remaining references, `git rm` the old canister directories to prevent confusion |
| 14.1.4 | Update CLAUDE.md canister map | ⬜ Missing | S | Remove `price` and `room` rows; update `payment` row to note merged pricing queries; update `property` row to note merged room/fixture CRUD |

---

## 15. Native Mobile Apps (iOS & Android)

**Vision:** React Native app (one codebase, two roles) giving homeowners and contractors on-the-go access to HomeFax. V1 is read-first with push notifications; write operations come in V2.

**Key constraints:**
- Authentication via Internet Identity requires a WebView bridge (SafariViewController on iOS, Chrome Custom Tab on Android) with a `homefax://auth` deep-link callback to capture the delegation.
- No in-app purchases. Upgrade CTAs open `https://homefax.app/pricing` in the browser (Apple policy compliance — App Store will reject any upgrade UI that collects payment inside the app).
- Push notifications require new backend infrastructure (APNs + FCM relay) — the ICP canisters have no native push capability.

**Architecture decision — agent-first UI:**
The primary interface is a chat window backed by the existing voice agent (`agents/voice/server.ts`). The agent handles most task initiation conversationally (log a job, request a quote, find a contractor, view score, browse leads, submit a bid). Traditional screens are built only where chat is genuinely worse: photo upload (camera), report viewing (WebView/PDF), and list scanning. This significantly reduces V1 screen count — §15.4 and §15.5 native screens become targeted complements to the agent, not the primary affordance. Tab nav is a fallback.

**What the agent can handle via tools (expand `agents/voice/tools.ts`):**
- Homeowner: view score + explain, browse job history, log a job, request a quote, find a contractor, sign a job, share a report
- Contractor: browse leads filtered by specialties, submit a bid, view pending signatures, view earnings summary

**What still needs dedicated UI:**
- Photo capture and upload (camera is irreplaceable)
- Report viewing (PDF/WebView rendering)
- Onboarding / property registration (address autocomplete UX)

### 15.1 Foundation & Setup

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 15.1.1 | React Native scaffold (Expo managed workflow) | ⬜ Missing | M | `npx create-expo-app homefax-mobile --template expo-template-blank-typescript`; monorepo under `mobile/` |
| 15.1.2 | Shared TypeScript service layer | ⬜ Missing | M | Wire `@dfinity/agent` + polyfills (`react-native-get-random-values`, `text-encoding`, `node-libs-react-native`) into the mobile app; reuse `frontend/src/services/` types |
| 15.1.3 | Design token port | ⬜ Missing | S | Copy color/font tokens from `frontend/src/theme.ts` into `mobile/src/theme.ts`; use `react-native-google-fonts` for IBM Plex Mono/Sans and Playfair Display |
| 15.1.4 | Navigation scaffold | ⬜ Missing | S | React Navigation v7: minimal tab navigator (Chat, Photos, Report, Settings); chat tab is the home screen |
| 15.1.5 | Deep-link scheme registration | ⬜ Missing | S | Register `homefax://` URI scheme in `app.json` (iOS `CFBundleURLSchemes`, Android intent filter); needed for II auth callback and push tap routing |

### 15.2 Authentication — Internet Identity WebView Bridge

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 15.2.1 | II WebView auth flow | ⬜ Missing | L | Open `https://identity.ic0.app` in `expo-web-browser` (SafariViewController/CCT); intercept `homefax://auth?delegation=...` deep link; parse and store delegation in `expo-secure-store` |
| 15.2.2 | Delegation storage + session restore | ⬜ Missing | M | On app launch, read stored delegation from `expo-secure-store`; reconstruct `DelegationIdentity` for `HttpAgent`; re-auth if expired |
| 15.2.3 | Biometric unlock (optional, V1.1) | ⬜ Missing | M | Gate app re-open on Face ID / fingerprint via `expo-local-authentication`; still requires II for first login and after delegation expiry |
| 15.2.4 | Role detection on login | ⬜ Missing | S | After auth, call `authService.getProfile()` to determine Homeowner vs. Contractor; route to appropriate tab set |

### 15.3 Push Notifications Infrastructure

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 15.3.1 | Push token registration endpoint | ⬜ Missing | L | New relay service (Node.js or new `notifications` canister): store `(principal → [APNs/FCM token])` mapping; expose `registerToken(principal, token, platform)` |
| 15.3.2 | APNs integration | ⬜ Missing | L | Server-side APNs HTTP/2 push with `node-apn` or Apple's provider API; configure iOS push entitlement in `app.json` |
| 15.3.3 | FCM integration | ⬜ Missing | L | Server-side FCM v1 API with service account credentials; configure `google-services.json` in Expo |
| 15.3.4 | Canister event → push relay hooks | ⬜ Missing | L | Canister post-update logic (or off-chain polling job) detects relevant events (new lead, job signed, score change) and calls the relay to dispatch push; start with polling for simplicity |
| 15.3.5 | In-app permission prompt | ⬜ Missing | S | Request push permissions on first meaningful interaction (not on launch); use `expo-notifications` |
| 15.3.6 | Notification tap → deep link routing | ⬜ Missing | S | Tapped notification payload includes route (e.g. `homefax://jobs/123`); `Linking` listener opens the correct screen |

### 15.4 Homeowner V1 Features (Read-Only)

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 15.4.1 | Property list screen | ⬜ Missing | S | Mirrors `DashboardPage`; list cards with score badge; tap → property detail |
| 15.4.2 | HomeFax Score screen | ⬜ Missing | S | Score dial + recent events feed; mirrors web `ScorePage` |
| 15.4.3 | Job history screen | ⬜ Missing | S | Read-only list of completed and pending jobs; tap → job detail with photos |
| 15.4.4 | Report WebView | ⬜ Missing | S | Open HomeFax report in embedded `WebView` (or `expo-web-browser`) rather than rebuilding the full report component natively |
| 15.4.5 | Push: score change notification | ⬜ Missing | M | Notify homeowner when HomeFax Score changes by ≥5 points; requires 15.3 relay |
| 15.4.6 | Push: new job pending signature | ⬜ Missing | M | Notify homeowner when a contractor marks a job complete and awaits their signature |
| 15.4.7 | Upgrade CTA (browser deep-link) | ⬜ Missing | S | "Upgrade to Pro" buttons call `Linking.openURL("https://homefax.app/pricing")`; no in-app payment UI |

### 15.5 Contractor V1 Features (Read-Only)

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 15.5.1 | Lead feed screen | ⬜ Missing | M | Open quote requests filtered to contractor's `specialties[]`; mirrors `ContractorDashboardPage` lead list |
| 15.5.2 | Job pending signature screen | ⬜ Missing | S | List of jobs awaiting homeowner or contractor signature; read-only in V1 |
| 15.5.3 | Earnings summary screen | ⬜ Missing | S | Read-only view of completed jobs count and value; mirrors contractor dashboard earnings widget |
| 15.5.4 | Push: new lead in my trades | ⬜ Missing | M | Notify contractor when a new quote request matches any of their `specialties`; requires 15.3 relay |
| 15.5.5 | Push: bid accepted / not selected | ⬜ Missing | M | Notify contractor of bid outcome when homeowner selects or declines |
| 15.5.6 | Upgrade CTA (browser deep-link) | ⬜ Missing | S | ContractorPro upgrade CTA calls `Linking.openURL("https://homefax.app/pricing")` |

### 15.6 App Store & Play Store Submission

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 15.6.1 | iOS App Store submission | ⬜ Missing | M | Apple Developer account, provisioning profiles, `eas build --platform ios`, TestFlight beta, store listing (screenshots, privacy policy URL, app description) |
| 15.6.2 | Android Play Store submission | ⬜ Missing | M | Google Play Developer account, `eas build --platform android`, internal track → production, store listing |
| 15.6.3 | Privacy disclosures | ⬜ Missing | S | Both stores require data collection disclosures; document what is collected (principal, device push token, usage analytics if any) |
| 15.6.4 | App Store review: no in-app purchases | ⬜ Missing | S | Ensure no upgrade UI collects payment inside the app; reviewer notes explaining browser redirect for subscriptions |

### 15.7 Agent Tool Expansion (Mobile-Specific)

Extend `agents/voice/tools.ts` so the mobile chat interface can drive the full task surface. The web voice agent has read tools today; these additions cover write operations and mobile-specific needs.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 15.7.1 | `log_job` tool | ⬜ Missing | M | Agent collects service type, contractor (optional), date, cost, notes conversationally; calls `jobService.create()`; responds with confirmation and updated score delta |
| 15.7.2 | `request_quote` tool | ⬜ Missing | M | Agent collects service type, description, urgency; calls `quoteService.create()`; responds with matched contractor count |
| 15.7.3 | `submit_bid` tool (contractor) | ⬜ Missing | M | Agent collects bid amount and notes for a specific quote request ID; calls `quoteService.submitBid()` |
| 15.7.4 | `sign_job` tool | ⬜ Missing | M | Agent confirms intent with user, calls `jobService.verifyJob()`; both homeowner and contractor roles |
| 15.7.5 | `find_contractor` tool | ⬜ Missing | S | Agent accepts service type + optional location; calls `contractorService.search()`; returns top 3 with trust scores |
| 15.7.6 | `get_score` tool | ⬜ Missing | S | Returns current HomeFax score + top 3 contributing factors with plain-English explanation |
| 15.7.7 | `list_leads` tool (contractor) | ⬜ Missing | S | Returns open quote requests matching caller's `specialties[]`; agent summarises top opportunities |
| 15.7.8 | `open_report` tool | ⬜ Missing | S | Returns shareable report URL; agent instructs user to tap link which opens WebView screen |
| 15.7.9 | `upload_photos` handoff tool | ⬜ Missing | S | Agent cannot take photos; this tool returns a deep link (`homefax://photos/job/:id`) that the app intercepts to open the native camera screen |
| 15.7.10 | Tool error handling + clarification loop | ⬜ Missing | M | Agent asks follow-up questions when required fields are missing rather than returning a raw error; max 3 clarification turns per tool call |

### 15.8 V2 Write Operations (Future)

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 15.8.1 | Log a job (homeowner) | ⬜ Missing | L | Create job record from mobile; upload photos via `expo-image-picker` → `photo` canister |
| 15.8.2 | Request a quote (homeowner) | ⬜ Missing | M | Submit quote request form; mirrors `QuoteRequestPage` |
| 15.8.3 | Submit a bid (contractor) | ⬜ Missing | M | Contractor submits bid amount and notes on a lead from the lead feed |
| 15.8.4 | Sign a job (both roles) | ⬜ Missing | M | Homeowner and contractor sign job completion from mobile; requires II delegation with appropriate permissions |
| 15.8.5 | Camera-first photo upload | ⬜ Missing | L | Native camera integration; compress + hash before upload; show upload progress; wire to `photo` canister quota checks |

---
