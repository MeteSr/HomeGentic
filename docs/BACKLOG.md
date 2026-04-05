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

### 17.2 Zero-Effort Onboarding — Instant Value Before First Login

**Vision:** Enter your address → get a real maintenance forecast in under 30 seconds. No account needed for the first impression; account creation locks in the data.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 17.2.1 | Public address → forecast endpoint | ✅ Exists | M | `GET /api/instant-forecast` in voice relay — `forecast.ts` inlines SYSTEMS table, climate zone multipliers, `urgencyFor`, `estimateSystems`, `computeTenYearBudget`, `parseForecastQueryParams`; accepts `address`, `yearBuilt`, `state?`, + per-system override params; returns systems array sorted by urgency + `tenYearBudget`; 34 unit tests |
| 17.2.2 | Pre-auth forecast landing page | ✅ Exists | M | `/instant-forecast` page: address + year-built entry form → system forecast table with urgency + cost estimates; inline per-row "Last replaced: [year]" override inputs correct upgraded-system predictions; `computeTenYearBudget`, `parseForecastParams`, `buildForecastUrl` in `instantForecast.ts`; `estimateSystems()` updated with per-system override support |
| 17.2.3 | "Save your forecast" conversion CTA | ✅ Exists | S | "Save your forecast" link on results page → `/properties/new?address=...&yearBuilt=...` |
| 17.2.4 | Public records year-built lookup | ✅ Exists | L | `lookupYearBuilt(address)` in `instantForecast.ts`; relay stub `GET /api/lookup-year-built` in voice server (returns null); auto-fill on address blur; ATTOM Data integration deferred |
| 17.2.5 | Forecast → account migration | ✅ Exists | S | Pre-populate `propertyService.register()` from URL params (`address`, `yearBuilt`, `state`); system overrides pass as `systemAges` so the first dashboard view is accurate |

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

### 15.1 Foundation & Setup

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 15.1.1 | React Native scaffold (Expo managed workflow) | ✅ Exists | M | `mobile/` scaffolded with `create-expo-app` (blank-typescript); `@react-navigation/native` + `@react-navigation/bottom-tabs` installed |
| 15.1.2 | Shared TypeScript service layer | ✅ Exists | M | Polyfills (`react-native-get-random-values`, `text-encoding`) imported at top of `index.ts`; `propertyService.ts` and `jobService.ts` with mock-fallback pattern; `agentService.ts` bridges to voice proxy (7 unit tests) |
| 15.1.3 | Design token port | ✅ Exists | S | `mobile/src/theme.ts` — colors, fonts, spacing, borderWidth/borderRadius tokens ported from web design system |
| 15.1.4 | Navigation scaffold | ✅ Exists | S | `mobile/src/navigation/TabNavigator.tsx` — 4-tab bottom navigator (Chat, Photos, Report, Settings); deep-link config in `App.tsx` |
| 15.1.5 | Deep-link scheme registration | ✅ Exists | S | `homegentic://` scheme registered in `app.json`: `scheme`, `ios.infoPlist.CFBundleURLTypes`, `android.intentFilters`; linking config wired in `NavigationContainer` |

### 15.2 Authentication — Internet Identity WebView Bridge

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 15.2.1 | II WebView auth flow | ✅ Exists | L | `useAuth.ts`: opens II in `expo-web-browser` via `openAuthSessionAsync`, listens for `homegentic://auth` deep link, parses delegation from callback URL; `buildIIAuthUrl` / `parseAuthCallback` / `isDelegationExpired` in `authUtils.ts` (15 unit tests) |
| 15.2.2 | Delegation storage + session restore | ✅ Exists | M | `authStorage.ts`: `saveAuth` / `loadAuth` / `clearAuth` via `expo-secure-store`; `useAuth` restores session on mount and re-auths if delegation is expired |
| 15.2.3 | Biometric unlock | ✅ Exists | M | `biometricService.ts` — `shouldPromptBiometric`, `biometricPromptReason`, `biometricNotAvailableReason` pure helpers (10 tests) + `checkBiometricStatus` + `authenticateWithBiometrics`; `useAuth.restoreSession` gates session hydration behind biometric prompt; skips transparently when device unsupported; delegation preserved on cancel so user can retry; `NSFaceIDUsageDescription` in `app.json` |
| 15.2.4 | Role detection on login | ✅ Exists | S | `authTypes.ts` + `authService.ts`: `getProfile(agent)` calls auth canister; `fromProfile` transformation (7 unit tests); `AuthState.authenticated` now carries `profile: UserProfile \| null` |

### 15.3 Push Notifications Infrastructure

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 15.3.1 | Push token registration endpoint | ✅ Exists | L | `agents/notifications/` relay (port 3002): in-memory token store (`store.ts`), `POST /api/push/register` + `/unregister` + `/send`; 9 unit tests |
| 15.3.2 | APNs integration | ✅ Exists | L | `apns.ts` — JWT provider token (ES256, no extra dep), HTTP/2 `sendApns()`; skips gracefully when `APNS_KEY_ID/TEAM_ID/PRIVATE_KEY` not set; iOS `aps-environment` entitlement in `app.json` |
| 15.3.3 | FCM integration | ✅ Exists | L | `fcm.ts` — service-account JWT → OAuth token exchange, FCM v1 API `sendFcm()`; skips when `FCM_PROJECT_ID/FCM_SERVICE_ACCOUNT_JSON` not set |
| 15.3.4 | Canister event → push relay hooks | ✅ Exists | L | `poller.ts` — 30 s polling loop with `new_lead` + `job_signed` stubs; `dispatcher.ts` fans out to all devices, auto-evicts stale tokens (APNs 410 / FCM UNREGISTERED) |
| 15.3.5 | In-app permission prompt | ✅ Exists | S | `useNotifications` hook — deferred permission request after auth, Expo push token registered with relay via `notificationService.ts` |
| 15.3.6 | Notification tap → deep link routing | ✅ Exists | S | `addNotificationResponseReceivedListener` extracts `route` from payload data, calls `Linking.openURL("homegentic://…")`; `App.tsx` linking config expanded with `jobs/:jobId` + `leads/:leadId` + `earnings` |

### 15.4 Homeowner V1 Features (Read-Only)

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 15.4.1 | Property list screen | ✅ Exists | S | `PropertyListScreen.tsx` — score badge, built year, tap → PropertyDetail |
| 15.4.2 | HomeGentic Score screen | ✅ Exists | S | Score hero in `PropertyDetailScreen.tsx` — large score number, letter grade, address |
| 15.4.3 | Job history screen | ✅ Exists | S | Job list in `PropertyDetailScreen.tsx` — service type, description, date, amount, DIY flag, verified dot |
| 15.4.4 | Report WebView | ✅ Exists | S | `ReportScreen.tsx` — token/URL input + `expo-web-browser` opens the full web report; no native rebuild needed |
| 15.4.5 | Push: score change notification | ✅ Exists | M | Notify homeowner when HomeGentic Score changes by ≥5 points; requires 15.3 relay |
| 15.4.6 | Push: new job pending signature | ✅ Exists | M | Notify homeowner when a contractor marks a job complete and awaits their signature |
| 15.4.7 | Upgrade CTA (browser deep-link) | ✅ Exists | S | Upgrade banner in `PropertyDetailScreen.tsx` calls `Linking.openURL("https://homegentic.app/pricing")` |

### 15.5 Contractor V1 Features (Read-Only)

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 15.5.1 | Lead feed screen | ✅ Exists | M | `LeadFeedScreen.tsx` — urgency-sorted cards with colour bar; `filterLeadsBySpecialties` + `ContractorStack` stack navigator |
| 15.5.2 | Job pending signature screen | ✅ Exists | S | `PendingSignaturesScreen.tsx` — rust/grey colour indicator, `formatPendingStatus` + `sortPendingJobs`; accessible via PENDING tap on EarningsScreen (`EarningsStack`) |
| 15.5.3 | Earnings summary screen | ✅ Exists | S | `EarningsScreen.tsx` — total earned, verified jobs, pending count via `getEarningsSummary` |
| 15.5.4 | Push: new lead in my trades | ✅ Exists | M | Notify contractor when a new quote request matches any of their `specialties`; requires 15.3 relay |
| 15.5.5 | Push: bid accepted / not selected | ✅ Exists | M | Notify contractor of bid outcome when homeowner selects or declines |
| 15.5.6 | Upgrade CTA (browser deep-link) | ✅ Exists | S | Upgrade banner in `EarningsScreen.tsx` calls `Linking.openURL("https://homegentic.app/pricing")` |

### 15.6 App Store & Play Store Submission

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 15.6.1 | iOS App Store submission | ✅ Exists | M | Apple Developer account, provisioning profiles, `eas build --platform ios`, TestFlight beta, store listing (screenshots, privacy policy URL, app description) |
| 15.6.2 | Android Play Store submission | ✅ Exists | M | Google Play Developer account, `eas build --platform android`, internal track → production, store listing |
| 15.6.3 | Privacy disclosures | ✅ Exists | S | Both stores require data collection disclosures; document what is collected (principal, device push token, usage analytics if any) |
| 15.6.4 | App Store review: no in-app purchases | ✅ Exists | S | Ensure no upgrade UI collects payment inside the app; reviewer notes explaining browser redirect for subscriptions |

### 15.7 Agent Tool Expansion (Mobile-Specific)

Extend `agents/voice/tools.ts` so the mobile chat interface can drive the full task surface. The web voice agent has read tools today; these additions cover write operations and mobile-specific needs.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 15.7.1 | `log_job` tool | ✅ Exists | M | `create_maintenance_job` in `tools.ts` covers this — collects service type, DIY flag, cost, date, contractor name, permit, warranty |
| 15.7.2 | `request_quote` tool | ✅ Exists | M | `create_quote_request` in `tools.ts` |
| 15.7.3 | `submit_bid` tool (contractor) | ✅ Exists | M | `submit_bid` in `tools.ts` |
| 15.7.4 | `sign_job` tool | ✅ Exists | M | `sign_job_verification` in `tools.ts` |
| 15.7.5 | `find_contractor` tool | ✅ Exists | S | `search_contractors` in `tools.ts` |
| 15.7.6 | `get_score` tool | ✅ Exists | S | `get_score` added to `tools.ts`; accepts optional `property_id`; instructs Claude to explain top factor and suggest one improvement if score < 70 |
| 15.7.7 | `list_leads` tool (contractor) | ✅ Exists | S | `list_leads` in `tools.ts` |
| 15.7.8 | `open_report` tool | ✅ Exists | S | `share_report` in `tools.ts` |
| 15.7.9 | `upload_photos` handoff tool | ✅ Exists | S | `upload_photos` added to `tools.ts`; returns `homegentic://photos/job/:id` deep link; agent instructs user to tap it |
| 15.7.10 | Tool error handling + clarification loop | ✅ Exists | M | Clarification loop guidance added to `buildSystemPrompt` in `prompts.ts`: ask one field at a time, max 3 questions per task, never invent required field values |

### 15.8 V2 Write Operations (Future)

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| 15.8.1 | Log a job (homeowner) | ✅ Exists | L | `LogJobScreen.tsx` — service-type chips, description, amount ($→cents), date, DIY toggle, optional contractor/permit/photo; `jobFormService.ts` pure helpers (24 tests); `useFocusEffect` re-fetch on PropertyDetail; `expo-image-picker` base64 upload stub |
| 15.8.2 | Request a quote (homeowner) | ✅ Exists | M | `QuoteRequestScreen.tsx` — service-type chips, urgency selector (colour-coded), description; `MyQuotesScreen.tsx` — urgency-bar list with status badges; `quoteFormService.ts` pure helpers (13 tests); `quoteService.ts` mock; PropertyDetail footer links to both screens |
| 15.8.3 | Submit a bid (contractor) | ✅ Exists | M | `LeadDetailScreen.tsx` rewritten with `bidFormService.ts` pure helpers (22 tests) + `bidService.submitBid` mock; amount ($→cents), timeline (1–365 days), optional notes; confirmation Alert before submit |
| 15.8.4 | Sign a job (both roles) | ✅ Exists | M | `SignJobScreen.tsx` — job summary card, legal acknowledgment checkbox, `canSign` guard, `signJob` mock; `signJobService.ts` pure helpers (8 tests); PendingSignaturesScreen rows tappable → SignJob (contractor); ChatStack + ContractorStack both carry the SignJob route |
| 15.8.5 | Camera-first photo upload | ✅ Exists | L | `PhotoUploadScreen.tsx` — opens camera on mount, gallery fallback, full-screen preview with retake; `photoUploadService.ts` validates MIME type (JPEG/PNG), 10 MB cap, formats file size (11 tests); ⊕ camera button on every PropertyDetail job row |

---

## EPIC: AI Provider Abstraction

**Goal:** Decouple all AI inference calls from the Anthropic SDK so that any compatible provider (OpenAI, Gemini, local LLM, etc.) can be swapped in by changing configuration, not code.

**Motivation:** `agents/voice/server.ts` imports and calls `@anthropic-ai/sdk` directly in every route handler. Anthropic-specific types (`ToolUseBlock`, `TextBlock`), streaming event shapes (`content_block_delta`), tool schema format, and hardcoded model strings (`claude-sonnet-4-6`) are scattered across the file. There is no seam between the Express routes and the AI provider.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| AI.1 | Define `AIProvider` interface | ✅ Exists | S | New `agents/voice/provider.ts`: `stream()`, `complete()`, `completeWithTools()` methods with normalized types for tool definitions, tool call results, and streaming chunks — no SDK types exposed |
| AI.2 | Implement `AnthropicProvider` | ✅ Exists | M | Class wrapping `@anthropic-ai/sdk`: translates normalized tool schema → Anthropic wire format, maps `content_block_delta`/`text_delta` events → normalized chunks, extracts `ToolUseBlock`/`TextBlock` from responses. No Anthropic types leak outside this class |
| AI.3 | Wire provider into `server.ts` via DI | ✅ Exists | M | Replace all direct `anthropic.messages.*` calls in route handlers with `AIProvider` interface calls. Instantiate the concrete provider once at startup, selected by `AI_PROVIDER` env var |
| AI.4 | Extract model name to config | ✅ Exists | S | Remove the five hardcoded `"claude-sonnet-4-6"` strings. Add `AI_MODEL` to `.env.example`; provider reads it at startup. Route handlers never reference a model name |
| AI.5 | Normalize tool schema in `tools.ts` | ✅ Exists | S | Rewrite `HOMEGENTIC_TOOLS` using the normalized tool definition type from AI.1. Each provider implementation converts to its own wire format — route handlers and tool definitions remain provider-agnostic |
| AI.6 | Remove provider-specific strings | ✅ Exists | S | Replace `"Claude did not return valid JSON"` and equivalents with provider-agnostic wording. Update `GET /health` to return `AI_MODEL` from env instead of the hardcoded string |

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

## EPIC: SEO — Pre-rendered Public Pages

**Goal:** Make HomeGentic's public-facing pages crawlable, shareable, and rankable without changing the hosting infrastructure. Key pages should render as real static HTML so Google indexes them on first crawl, and social link previews (Twitter/Slack/iMessage) show meaningful titles, descriptions, and images.

**Situation:** The app is a pure client-side SPA (React + Vite on ICP assets canister). Today only `FsboListingPage` has dynamic OG tags; every other page serves the same static fallback title/description from `index.html`. There is no `robots.txt`, no `sitemap.xml`, no structured data, and no canonical URL strategy.

**Approach:** `vite-plugin-ssg` (or `vite-ssg`) generates static HTML shells at build time for each known public route. Each shell contains fully-resolved `<title>`, `<meta>`, OG tags, and JSON-LD in the `<head>` — so crawlers and link unfurlers get real content without executing JavaScript. Dynamic data pages (contractor profiles, listing pages) get pre-rendered with a loading skeleton; `react-helmet-async` then hydrates the real title/meta once the canister responds. Authenticated-only routes are excluded from pre-rendering entirely.

**Dependency order:** SEO.1 (helmet) is a prerequisite for all per-page meta work. SEO.2 (SSG build) must land before SEO.5 (sitemap) since the sitemap references the same route list. SEO.3–SEO.4 can proceed in parallel after SEO.1.

| # | Item | Status | Size | Notes |
|---|------|--------|------|-------|
| SEO.1 | `react-helmet-async` — per-route `<title>` and meta | ⬜ Missing | M | Install `react-helmet-async`. Wrap app in `<HelmetProvider>`. Add `<Helmet>` to `LandingPage`, `FsboListingPage`, `ContractorPublicPage`, `AgentPublicPage`, `ScoreCertPage`, `ListingDetailPage`, `InstantForecastPage`, `CheckAddressPage`. Migrate existing `document.title` + `setMeta` calls to Helmet. Each page sets `title`, `description`, `og:title`, `og:description`, `og:type`, `og:url`. |
| SEO.2 | `vite-plugin-ssg` build integration | ⬜ Missing | L | Install `vite-plugin-ssg`. Define the static route manifest (landing, pricing, public profile patterns, listing patterns). Update `vite.config.ts` to run SSG in production builds. Verify ICP assets canister serves pre-rendered HTML correctly (add `_redirects` or 404 fallback so deep links still work in SPA mode). Add SSG build step to CI. |
| SEO.3 | `og:image` for key pages | ⬜ Missing | M | Static brand OG image (`public/og-default.png`, 1200×630) used as fallback on all pages. Dynamic OG image for `FsboListingPage`: compose address + price + HomeGentic Score into a template using `@vercel/og` or a Canvas-based build-time script. `ScoreCertPage` gets its score badge as `og:image`. |
| SEO.4 | JSON-LD structured data | ⬜ Missing | M | `LandingPage`: `Organization` + `WebSite` schema with `SearchAction`. `FsboListingPage`: `RealEstateListing` schema (address, price, description, image). `ContractorPublicPage` + `AgentPublicPage`: `LocalBusiness` / `Person` schema with `aggregateRating` if reviews exist. `ScoreCertPage`: `CreativeWork` schema with the score as `description`. |
| SEO.5 | `sitemap.xml` + `robots.txt` | ⬜ Missing | S | Static `robots.txt` in `public/`: allow all crawlers, point to sitemap. Build-time `sitemap.xml` generator (Vite plugin or `scripts/gen-sitemap.ts`) that emits one `<url>` per static route plus a `<sitemapindex>` pointer to a dynamic sitemap for listing/profile pages. Dynamic sitemap served from a canister query endpoint. |
| SEO.6 | Canonical URLs | ⬜ Missing | S | Add `<link rel="canonical" href="https://homegentic.app/...">` via Helmet on every public page. Prevents duplicate-content penalties if the app is reachable at multiple ICP gateway origins (`ic0.app`, `raw.ic0.app`, custom domain). |
| SEO.7 | Landing page content depth | ⬜ Missing | M | `LandingPage` currently has minimal crawlable text — most content is inside React components that Googlebot may not wait for. Add a server-rendered FAQ section (5–8 questions targeting high-intent queries: "how to prove home maintenance", "home maintenance records for sale", "verified contractor work history") as static HTML within the SSG shell. |
| SEO.8 | Core Web Vitals baseline | ⬜ Missing | S | Run Lighthouse on the pre-rendered landing page. Target LCP < 2.5 s, CLS < 0.1, INP < 200 ms. The Google Fonts `preconnect` is already in place; likely wins: add `font-display: swap`, lazy-load below-fold images, defer non-critical scripts. Document baseline scores in `docs/PERFORMANCE.md`. |

---
