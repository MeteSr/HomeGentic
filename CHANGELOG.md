# Changelog

All notable changes to HomeGentic are documented here.

---

## [Unreleased]

### Features
- **IoT device sources expanded to 12 (#161)**: Added Ring Alarm, Honeywell Home, Rheem EcoNet, Sense Energy Monitor, Emporia Vue, Rachio Smart Sprinkler, Samsung SmartThings, and Home Assistant alongside existing Nest, Ecobee, Moen Flo, and Manual. IDL `DeviceSource` variant and TypeScript union type updated to match; E2E spec added for all 12 sources.

### Security
- Shortened Internet Identity delegation from 7 days to 8 hours to limit stolen-delegation exposure
- Added `Idempotency-Key` header to Resend email POST requests — prevents duplicate emails when the IC retries HTTP outcalls across subnet nodes
- Added CallerGuard (`activeSubscribers` map) around both inter-canister `await` calls in `payment.subscribe()` to prevent TOCTOU double-charge from concurrent calls of the same principal

---

## [0.5.0] - 2026-04-11

### Security (ICP compliance hardening)
- Added `Principal.isAnonymous(caller)` rejection in every update-capable canister (`requireActive`) — SEC.1 test suite enforces coverage across all 16 canisters
- Declared `updateCallLimits` as `transient var` in every canister — resets on upgrade, preventing unbounded stable-memory growth from sliding-window rate-limit entries (SEC.2)
- Added `Principal.isAnonymous` guard to `ai_proxy/main.mo` (previously unchecked)
- Added inline anonymous guard to `payment.subscribe()` (no `requireActive` wrapper)

### Tests
- Added SEC.1, SEC.2, SEC.3 test suites to `icpProd567.test.ts`
- Expanded Candid contract tests to cover all 16 canisters (was 4): listing, quote, contractor, photo, report, sensor, maintenance, agent, bills
- Added bills arity snapshot to `candidContracts.test.ts`

---

## [0.4.0] - 2026-04-04

### Features
- **Bills Intelligence (Epic #49 Stories 3–6)**: system efficiency degradation detection, rebate finder (Electric bills), insurance discount triggers, telecom negotiation script generator — all via voice agent proxy and new `billsIntelligence.ts` service
- **Cycle Watchdog (Issue #55)**: `checkCycleLevels` on monitoring canister; automated top-up scripts; CI cycle-gate job
- **Document OCR (Issue #51)**: appliance manual and warranty upload with OCR text extraction
- **PricingPage**: tier toggle (monthly/annual), ContractorFree tier, annual billing discount, referral fee model, feature comparison tooltips
- **InsuranceDefensePage**: sensor × insurer discount estimator
- **Legal**: Terms of Service page with agreement checkbox at registration

### Fixes
- Bills canister: Free tier gated to 1 upload/calendar month; timed-pause support added
- Job canister: `sourceQuoteId` field added to all job records (was missing, broke Candid IDL)
- CI: corrected perf-regression YAML; Playwright webServer port-conflict resolved; Vitest/RTL timeouts raised to fix parallel-suite flakiness

---

## [0.3.0] - 2026-03-28

### Features
- **Bills canister**: utility bill upload, OCR extraction, anomaly detection (Epic #49 Stories 1–2); 3-month rolling baseline; >20% spikes flagged to Activity feed bell drawer
- **Mobile bill upload** screen
- **Activity feed**: proactive alerts moved from VoiceAgent float into bell drawer; avatar menu updated with receipt/photo attachment shortcuts

### Fixes
- XSS and missing rate-limit security alerts resolved
- Property service mock path gated on `!process.env.VITEST` to prevent test contamination

---

## [0.2.0] - 2026-03-24

### Added
- `bills` canister: utility bill records per property
- `ai_proxy` canister: IC HTTP outcalls for permit imports (ArcGIS / OpenPermit) and transactional email (Resend)
- `listing` canister: FSBO lifecycle, sealed-bid offers, agent matching
- `agent` canister: realtor profiles, reviews, HomeGentic transaction count
- `recurring` canister: recurring service contracts and visit logs
- `monitoring` canister: ARPU / LTV / CAC profitability metrics, cycles alerting
- `market` canister: ROI-ranked project recommendations (2024 Remodeling Magazine data)
- `sensor` canister: IoT device registry; Critical events auto-create pending jobs
- Room / fixture CRUD merged into `property` canister (removed standalone `room` canister)
- Pricing table merged into `payment` canister (removed standalone `price` canister)
- Dual-signature verification on `job` records (homeowner + contractor, or DIY)
- Contractor invite-token flow: `createInviteToken` → `redeemInviteToken`
- Property ownership transfer with 7-day conflict window
- Voice agent: Claude-powered floating mic assistant on all authenticated pages
- Public pages: `/check`, `/report/:token`, `/cert/:token`, `/home-systems`, `/instant-forecast`, `/prices`, `/neighborhood/:zip`
- Admin dashboard SPA (`dashboard/`) querying live canister metrics
- PocketIC upgrade tests for `auth` and `payment` canisters
- Playwright E2E suite (~36 specs)
- k6 load tests for metric query endpoints
- Real-canister integration test mode for 6 core services

---

## [0.1.0] - 2026-03-10

### Added
- Initial multi-canister ICP architecture
- Auth canister: user registration, profiles, role management (Homeowner, Contractor, Realtor)
- Property canister: property registration with tier-based limits and verification levels
- Job canister: maintenance job records with status tracking
- Contractor canister: contractor profiles with trust scores
- Quote canister: quote requests and contractor offer matching
- Payment canister: on-chain subscription management
- Photo canister: SHA-256 hashed photo storage for tamper-evidence
- Monitoring canister: platform health metrics
- React + TypeScript frontend with Internet Identity authentication
- CI/CD workflows for local, testnet, and mainnet deployments
- Comprehensive test suite for all backend canisters
