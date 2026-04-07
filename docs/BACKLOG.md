# HomeGentic Product Backlog

Derived from the HomeGentic product vision. Items are grouped by domain, tagged with estimated complexity (S/M/L/XL), and annotated with what already exists in the codebase.

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
| 3.4.3 | Tokenized deed display in HomeGentic Report | ⬜ Missing | M | Show "Title token on-chain since [date]" badge in report |

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
| 4.3.4 | vetKeys aggregate privacy | ✅ Exists | L | `submitScore` stores composite score per principal; `getZipStats` exposes only zip-level mean/median/sampleSize; `getMyScoreEncrypted` gates individual score access via `vetkd_derive_key` (test_key_1; switch to key_1 for mainnet). `useNeighborhoodScore` hook handles full flow. |

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

## 6. HomeGentic Report — The Resale Weapon

### 6.2 Listing Platform Integration & Badge
**Vision:** HomeGentic-verified homes display a badge on Zillow/Realtor.com.

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

### 6.5 "HomeGentic Certified" Pre-Inspection Waiver
**Vision:** Score ≥ 88 qualifies for waived/discounted inspection contingency — killer feature in competitive markets.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 6.5.3 | Insurance / buyer agent API | ⬜ Missing | XL | Partner program for insurers/agents to programmatically verify certification; legal framework needed |

---

## 7. Platform & Business Model Differentiation

### 7.1 Homeowner-Owned Data Sovereignty
**Vision:** Explicitly market that data lives on ICP canisters the homeowner owns — HomeGentic is just the interface.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 7.1.3 | "Verified on ICP" explorer links | ⬜ Missing | S | Link each record to ic.rocks or dashboard.internetcomputer.org for independent verification |


### 7.3 Insurance Premium Integration
**Vision:** Partner with home insurers to offer premium discounts for high HomeGentic scores.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 7.3.1 | Insurer-facing score API | ⬜ Missing | M | Authenticated API endpoint: given property ID, return score + key risk factors |
| 7.3.2 | Score-to-risk mapping model | ⬜ Missing | L | Map HomeGentic dimensions (HVAC age, roof age, verified maintenance) to actuarial risk factors |
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

The core retention challenge for HomeGentic: value delivery is irregular. Homeowners don't engage daily, so perceived value dies in quiet periods. Every item below addresses a specific churn cause identified in the retention analysis.

### 8.4 Insurance Defense Mode — Florida-Specific Retention Hook
**Vision:** One-tap export of all maintenance records formatted for insurance company submission. One successful insurance interaction pays for 3+ years of HomeGentic.

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

## 17. Growth & Activation — "Inexplicable Not To Sign Up"

The features below address the core signup conversion gap: a new homeowner visits HomeGentic, reads the pitch, but has no immediate, personally-felt reason to create an account today. Each item below corresponds to a product lever that makes the value tangible before sign-up, or dramatically lowers the cost of getting that value.


### 17.4 Buyer-Side Product — Public Report Lookup

**Vision:** Buyers search by address to pull a public HomeGentic report before making an offer. This is the top-of-funnel for homeowner sign-ups: buyers ask sellers "why don't you have a HomeGentic report?"

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 17.4.1 | Public address search for reports | ✅ Exists | M | `CheckAddressPage` at `/check?address=...`; `lookupReport()` calls relay `GET /api/check`; "HomeGentic Verified" badge with link to full report when found |
| 17.4.2 | "Request a report" flow for buyers | ✅ Exists | M | Email capture form on "no report" state; `submitReportRequest()` posts to relay `POST /api/report-request`; confirmation shown after submit |
| 17.4.3 | Buyer-facing report view (no login) | ✅ Exists | S | `ReportPage` at `/report/:token` has no `ProtectedRoute` wrapper — already fully public |
| 17.4.4 | SEO-indexed report landing pages | 🟡 Partial | M | `document.title` + `<meta name="description">` set in `ReportPage` and `CheckAddressPage` when report loads; full SSR (Next.js/Cloudflare Worker) deferred |
| 17.4.5 | "No report found" seller CTA page | ✅ Exists | S | "Are you the homeowner?" block in `CheckAddressPage` not-found state; "Create a Free Report" links to `/properties/new?address=...` |

### 17.6 Email Receipt Forwarding → Auto-Log

**Vision:** Forward any contractor receipt to receipts@homegentic.app and the job is logged automatically. Zero-friction logging that works without opening the app.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 17.6.1 | Inbound email endpoint | ⬜ Missing | L | Set up `receipts@homegentic.app` via Postmark / SendGrid Inbound Parse or AWS SES; route to a new `emailParser` Node.js service |
| 17.6.2 | Email → principal mapping | ⬜ Missing | M | User registers a forwarding email address in account settings (stored on `auth` canister); inbound email matched to principal by `From` or `Reply-To` header |
| 17.6.3 | Claude vision receipt extraction | ⬜ Missing | M | `emailParser` passes attachments (PDF/JPG invoices) to Claude API with vision; extracts contractor, service, date, amount using same prompt as §16.6 |
| 17.6.4 | Extracted job → canister write | ⬜ Missing | M | After extraction, calls `jobService.create()` on behalf of the matched principal; sets `status: "pending_homeowner"` so homeowner can review before it counts toward score |
| 17.6.5 | Confirmation email to homeowner | ⬜ Missing | S | Send "We logged a [service] job for $[amount] on [date] — tap to confirm or edit" email with a magic link back to the pending job |
| 17.6.6 | Email forwarding setup UI | ⬜ Missing | S | Account settings page: "Forward receipts to receipts@homegentic.app from [your email]" with copy button and status indicator |
| 17.6.7 | Attachment-less email handling | ⬜ Missing | S | If email has no attachment, parse the email body as plain text receipt; fall back to asking the homeowner to resend with the attachment |

### 17.7 Public System Age Estimator (No Login)

**Vision:** Enter your home's year built → see estimated ages and remaining lifespan of every major system. No login. Drives sign-up by making abstract risk concrete and personal.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 17.7.4 | Estimator embeddable widget | ⬜ Missing | M | JavaScript embed snippet (`<script src="https://homegentic.app/widget.js">`) for real estate blogs, HOA sites, and home inspector websites; renders estimator inline; CTA links back to HomeGentic |

---

## 15. Native Mobile Apps (iOS & Android)

**Vision:** React Native app (one codebase, two roles) giving homeowners and contractors on-the-go access to HomeGentic. V1 is read-first with push notifications; write operations come in V2.

**Key constraints:**
- Authentication via Internet Identity requires a WebView bridge (SafariViewController on iOS, Chrome Custom Tab on Android) with a `homegentic://auth` deep-link callback to capture the delegation.
- No in-app purchases. Upgrade CTAs open `https://homegentic.app/pricing` in the browser (Apple policy compliance — App Store will reject any upgrade UI that collects payment inside the app).
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



### 15.6 App Store & Play Store Submission

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 15.6.1 | iOS App Store submission | ✅ Exists | M | Apple Developer account, provisioning profiles, `eas build --platform ios`, TestFlight beta, store listing (screenshots, privacy policy URL, app description) |
| 15.6.2 | Android Play Store submission | ✅ Exists | M | Google Play Developer account, `eas build --platform android`, internal track → production, store listing |
| 15.6.3 | Privacy disclosures | ✅ Exists | S | Both stores require data collection disclosures; document what is collected (principal, device push token, usage analytics if any) |
| 15.6.4 | App Store review: no in-app purchases | ✅ Exists | S | Ensure no upgrade UI collects payment inside the app; reviewer notes explaining browser redirect for subscriptions |


---

## EPIC: Mobile App Store Setup

**Goal:** Get the HomeGentic mobile app into TestFlight (iOS) and Google Play internal track (Android) so it can be tested on real devices before public launch.

**Situation:** The codebase is submission-ready — all screens are built, EAS build config is correct, privacy manifest and data-safety declaration are done, and the App Store listing copy is written. What remains is entirely account setup, credential wiring, and store asset production. None of this requires code changes.

**Dependency order:** MS.1 (Apple account) and MS.2 (Google account) must be completed before any build or submission steps. MS.3–MS.5 can run in parallel once accounts are ready. MS.6 is the final gate before public release.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| MS.1 | Apple Developer account + app record | ⬜ Missing | S | Enroll at developer.apple.com ($99/yr). Create app record in App Store Connect: bundle ID `app.homegentic.mobile`, primary language, category (Productivity). Note the numeric ASC App ID. |
| MS.2 | Google Play Developer account + app | ⬜ Missing | S | Enroll at play.google.com/console ($25 one-time). Create new app: package `app.homegentic.mobile`, default language, app or game → app, free or paid. |
| MS.3 | Fill EAS credentials in `eas.json` | ⬜ Missing | S | Replace `APPLE_ID`, `ASC_APP_ID`, `APPLE_TEAM_ID` placeholders with real values. Run `eas login` and `eas project:init` to link the Expo project. |
| MS.4 | Google service account key | ⬜ Missing | S | In Play Console → Setup → API access, link a Google Cloud project, create a service account with Release Manager role, download the JSON key, save as `mobile/google-service-account.json` (git-ignored). |
| MS.5 | iOS provisioning + push certificate | ⬜ Missing | M | Let EAS manage signing (`eas credentials`) — it creates the distribution certificate and provisioning profile automatically. Separately, create an APNs Auth Key (`.p8`) in Apple Developer portal; add `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY` to the notifications relay env. |
| MS.6 | Store screenshots | ⬜ Missing | M | iOS requires 6.5" iPhone + 12.9" iPad screenshots (min 3 each). Android requires phone screenshots (min 2). Run the app in Expo Go or a simulator, capture key screens: property list, score, job history, report, contractor lead feed. |
| MS.7 | Privacy policy + support pages | ⬜ Missing | S | Both stores require live URLs at submission. Publish a privacy policy at `homegentic.app/privacy` and a support page at `homegentic.app/support`. A simple static page is sufficient for initial review. |
| MS.8 | TestFlight internal build | ⬜ Missing | M | Once MS.1 + MS.3 + MS.5 are done: `eas build --platform ios --profile production` then `eas submit --platform ios`. Distribute to internal testers (up to 100) via TestFlight without App Store review. |
| MS.9 | Google Play internal track build | ⬜ Missing | M | Once MS.2 + MS.4 are done: `eas build --platform android --profile production` then `eas submit --platform android`. Share internal track link with testers — no Play Store review required at this stage. |
| MS.10 | App Store public release | ⬜ Missing | L | Requires MS.6 + MS.7 complete. Submit for App Store review from App Store Connect. Typical review time 1–3 days. Address any reviewer feedback on the browser-redirect subscription flow (reviewer notes already written in `store/listing.md`). |
| MS.11 | Google Play production release | ⬜ Missing | L | Promote from internal track → production in Play Console. Requires MS.6 + MS.7. Play Store review is typically faster than Apple's (hours to 1 day). |

---

## EPIC: Build & Compilation Health

Pre-existing TypeScript compilation failures that must be resolved before CI can cover these components.

### Voice Agent (`agents/voice/`)

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| DEV.1 | Fix voice agent `tsconfig.json` rootDir | ✅ Exists | S | Widened `rootDir` to `".."` and updated `include` to cover `../maintenance/*.ts`. |
| DEV.2 | Add missing type devDependencies to voice agent | ✅ Exists | S | `npm install` in `agents/voice/` resolved all missing modules; removed deprecated `@types/express-rate-limit` stub (express-rate-limit bundles its own types). |
| DEV.3 | Fix implicit `any` params in `agents/voice/server.ts` | ✅ Exists | S | Resolved automatically once `@types/express` was installed — TypeScript infers `req`/`res`/`next` types from the express callback context. |

### Mobile (`mobile/`)

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| DEV.4 | Run `npm install` for mobile and commit lockfile | ⬜ Missing | S | `mobile/` has no `node_modules` — `expo/tsconfig.base` is never found and all expo/react-native types are missing. Run `npm install` inside `mobile/`, commit the resulting `package-lock.json`. |
| DEV.5 | Fix syntax error in `mobile/src/screens/PropertyDetailScreen.tsx:113` | ⬜ Missing | S | `tsc` reports `TS1005: ')' expected` at line 113. Likely a JSX expression close `/>}` that confuses the parser without the full expo tsconfig. Diagnose and fix after DEV.4 unblocks the full error list. |

---

## EPIC: ICP Mainnet Production Readiness

Items identified during ICP production-readiness audit (2026-04-06). Grouped by severity. All blockers must be resolved before any `--network ic` deploy.

### Blockers — will cause silent failure on first mainnet deploy

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| PROD.1 | Rotate exposed Anthropic API key | 🟡 Partial | S | `.env` confirmed not in git history. `deploy.sh` now validates `ANTHROPIC_API_KEY` is set for non-local deploys. **Manual step still required:** revoke the exposed key at console.anthropic.com and generate a new one. |

---
