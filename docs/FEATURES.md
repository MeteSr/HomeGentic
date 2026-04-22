# HomeGentic — Feature Reference

This document is the authoritative list of every feature, page, and user action in the app.
Intended audience: anyone doing a UI/UX revamp who needs to ensure nothing is missed when
rewiring screens.

---

## User Roles

| Role | Signs up via | Primary purpose |
|---|---|---|
| **Homeowner** | Register page → role selection | Log maintenance, track score, sell smarter |
| **Contractor** | Register page → role selection | Receive leads, submit quotes, build trust score |
| **Realtor** | Register page → role selection | Bid on listing requests, co-brand reports |
| **Admin** | Backend grant | Verify properties, monitor platform health |

---

## Route Map

### Public (no auth required)

| Route | Page | What it is |
|---|---|---|
| `/` | LandingPage | Marketing homepage |
| `/login` | LoginPage | Internet Identity auth |
| `/pricing` | PricingPage | Plan selector (Homeowner / Contractor / Realtor tabs) |
| `/privacy` | PrivacyPolicyPage | Privacy policy |
| `/terms` | TermsOfServicePage | Terms of service |
| `/support` | SupportPage | Contact / support |
| `/faq` | FAQPage | Frequently asked questions |
| `/demo` | DemoPage | Interactive demo (no account) |
| `/demo/:persona` | DemoPage | Persona-specific demo (homeowners, contractors, realtors, property-managers) |
| `/checkout` | CheckoutPage | Stripe checkout (tier + billing from query params) |
| `/payment-success` | PaymentSuccessPage | Post-payment confirmation |
| `/payment-failure` | PaymentFailurePage | Payment error |
| `/gift` | GiftPage | Gift a subscription |
| `/homes` | FsboSearchPage | Browse public FSBO listings |
| `/for-sale/:propertyId` | FsboListingPage | Public FSBO listing detail |
| `/transfer/claim/:token` | PropertyTransferClaimPage | Accept a property ownership transfer |
| `/manage/claim/:token` | PropertyManagerClaimPage | Accept a property manager invitation |
| `/verify/:token` | ContractorVerifyPage | Contractor email verification link |
| `/report/:token` | ReportPage | Shareable HomeGentic report (print-ready) |
| `/badge/:token` | BadgePage | Shareable verified badge |
| `/cert/:token` | ScoreCertPage | HomeGentic score certificate |

### Public free tools (no auth required)

| Route | Page | What it does |
|---|---|---|
| `/check` | CheckAddressPage | Look up any address — shows if a HomeGentic report exists; lets buyers submit a request |
| `/prices` | PriceLookupPage | Contractor price benchmarks by service type + zip code |
| `/instant-forecast` | InstantForecastPage | 10-year maintenance cost forecast from address + year built; system-age overrides inline |
| `/home-systems` | HomeSystemsEstimatorPage | Urgency table for 9 home systems from year built; shareable URL |
| `/truth-kit` | BuyersTruthKitPage | Buyer's due-diligence kit: permit records, credibility flags, questions to ask before closing |

> `/neighborhood/:zipCode` (NeighborhoodHealthPage) is implemented but currently disabled in routing.

### Authenticated (all roles)

| Route | Page | Notes |
|---|---|---|
| `/register` | RegisterPage | 3-step wizard: role → email/phone → terms |
| `/onboarding` | OnboardingWizard | First-time homeowner setup (6 steps) |
| `/settings` | SettingsPage | Account, subscription, notifications, privacy |
| `/dashboard` | DashboardPage | Homeowner hub |
| `/properties/new` | PropertyRegisterPage | Register a property |
| `/properties/:id` | PropertyDetailPage | Full property view (multi-tab) |
| `/properties/:id/verify` | PropertyVerifyPage | Upload ownership documents |
| `/properties/:id/systems` | SystemAgesPage | Manage system ages |
| `/jobs/new` | JobCreatePage | Log a maintenance job |
| `/quotes/new` | QuoteRequestPage | Post a quote request |
| `/quotes/:id` | QuoteDetailPage | View bids, accept a quote |
| `/maintenance` | PredictiveMaintenancePage | 5-year calendar + system life bars |
| `/market` | MarketIntelligencePage | Competitive analysis + project ROI |
| `/warranties` | WarrantyWalletPage | Warranty tracker |
| `/insurance-defense` | InsuranceDefensePage | Insurance-eligible job report |
| `/resale-ready` | ResaleReadyPage | Pre-sale preparation checklist |
| `/sensors` | SensorPage | IoT device registry + alerts |
| `/recurring/new` | RecurringServiceCreatePage | Create recurring service contract |
| `/recurring/:id` | RecurringServiceDetailPage | View / manage recurring service |
| `/listing/new` | ListingNewPage | Post listing intent (solicit agent proposals) |
| `/listing/:id` | ListingDetailPage | Compare agent proposals, accept, manage transaction |
| `/my-listing/:propertyId` | FsboListingManagerPage | Manage FSBO listing (photos, offers, showings) |
| `/contractors` | ContractorBrowsePage | Browse contractor directory |
| `/contractor/:id` | ContractorPublicPage | Contractor public profile |
| `/contractor/profile` | ContractorProfilePage | Edit own contractor profile |
| `/contractor-dashboard` | ContractorDashboardPage | Contractor leads + quotes + earnings |
| `/agents` | AgentBrowsePage | Browse realtor directory |
| `/agent/:id` | AgentPublicPage | Realtor public profile |
| `/agent/profile` | AgentProfileEditPage | Edit own realtor profile + co-branding |
| `/agent-dashboard` | AgentDashboardPage | Realtor's shared report links |
| `/agent/marketplace` | AgentMarketplacePage | Browse listing intents, submit proposals |
| `/admin` | AdminDashboardPage | Admin only |

---

## Features by Area

### Landing page (`/`)

- Feature tabs carousel (8 s/slide, pauses on hover): Verified Record · AI Home Intelligence · Sell Smarter · Service Network
- Feature deep-dive sections: Insurance Defense Mode, Market Intelligence, 5-Year Maintenance Calendar, Warranty Wallet, Recurring Services
- Testimonials carousel
- 4 persona CTAs: Homeowner, Contractor, Realtor, Ready to Sell
- Free tools section (5 no-login tools linked)

---

### Auth & Registration

**Login (`/login`)**
- Internet Identity (ICP) authentication
- Dev login bypass (DEV environment only)

**Register (`/register`)**
- Step 1: Role selection — Homeowner / Contractor / Realtor
- Step 2: Email + optional phone
- Step 3: Terms acceptance
- Post-registration: redirects to `/checkout` if a tier intent is pending, else `/onboarding` (homeowner) or `/contractor-dashboard` / `/agent-dashboard`

**Onboarding wizard (`/onboarding`) — Homeowner only, first visit**
- Step 1: Address + property details (type, year built, sq ft)
- Step 2: Permit import — trigger search, review & select permits to log as jobs
- Step 3: Ownership verification — upload deed / utility bill / tax record
- Step 4: System ages — photograph HVAC, water heater, electrical panel, shutoff, roof, garage door for baseline
- Step 5: Homeowner's insurance — upload declaration page
- Step 6: Additional documents (optional)
- Completion generates initial HomeGentic score

---

### Homeowner Dashboard (`/dashboard`)

- Property cards (all owned properties) with score and quick actions
- Score summary with sparkline trend
- Activity feed (jobs logged, score changes, alerts)
- Quick-action buttons: Add Property · Log Job · Request Quote · Generate Report
- Weekly Home Pulse (AI maintenance tips, toggleable)
- Market Intelligence panel (competitive analysis, top ROI projects)
- Recurring services panel (list + quick-add)
- FSBO listing initiation CTA

---

### Property Detail (`/properties/:id`)

Multi-tab page — the main workspace for a property.

**Header / overview**
- HomeGentic Score with sparkline, decay warnings, at-risk alerts
- Estimated home value (editable, factors into premium score estimate)
- Score badges: Top X%, Certified, Trending
- Property details: address, owner, verification level
- Quick actions: Generate Report · Log Job · Request Quote · Invite Contractor · Add Recurring Service · Start Listing

**Tab: Timeline**
- Chronological feed of all property events: jobs, photos, milestones, score changes

**Tab: Jobs**
- All service records with: status, cost, contractor, warranty info, permit number
- Inline photo viewer per job
- Log new job (opens LogJobModal)

**Tab: Rooms**
- Room/space inventory with type, notes, photos
- Add / edit / delete rooms (AddRoomModal)
- Fixtures per room (add/edit/remove)

**Tab: Documents**
- Uploaded permits, contracts, receipts, warranties
- OCR-extracted metadata displayed inline

**Tab: Bills**
- Monthly utility bills (Electric, Gas, Water, Internet, Telecom) if uploaded
- 3-month rolling anomaly detection: bills >20% above baseline are flagged

**Tab: Settings**
- Edit property details (type, year built, sq ft)
- Verification level display + submit for upgrade
- Ownership transfer: initiate transfer to another principal
- Property claim: initiate / respond to ownership disputes

**Modals triggered from this page**
- `GenerateReportModal` — share link with expiry, view limit, visibility level
- `LogJobModal` — full job creation form inline
- `RequestQuoteModal` — post a quote request
- `InviteContractorModal` — invite a contractor directly via token
- `PropertyVerifyModal` — upload verification documents
- `SystemAgesModal` — override system ages
- `RecurringServiceCreateModal` — set up a recurring service
- `InitListingModal` — start FSBO or agent-proposal listing

---

### Property Registration (`/properties/new`)

- Address autocomplete with public-record lookup (year built, sq ft pre-filled)
- Property type + details form
- Permit import trigger (Volusia County supported) with coverage indicator
- Permit import review panel: select which permits to log as jobs
- System ages import from Instant Forecast params (optional)

---

### Property Verification (`/properties/:id/verify`)

- Upload deed, utility bill, or tax record
- Verification level progression: Unverified → PendingReview → Basic → Premium
- Admin reviews uploaded documents and approves/rejects

### System Ages (`/properties/:id/systems`)

- View estimated vs. actual system ages for all 9 major systems
- Override any system with a "last replaced" date
- Impact: updates maintenance forecast, score decay calculations

---

### Job Logging (`/jobs/new`)

- Property selector
- Service type (HVAC · Roofing · Plumbing · Electrical · Flooring · Painting · Landscaping · Windows · Foundation · Insulation · Drywall · Kitchen Remodel · Bathroom Remodel · Other)
- DIY vs. Contractor toggle
- Contractor name
- Amount ($)
- Date of service
- Description
- Permit number (optional — marks job as permitted)
- Warranty months (optional)
- Photo upload (quota by tier)
- Post-submission: score delta shown, service-specific follow-up suggestions

---

### Quote Requests

**Post a request (`/quotes/new`)**
- Property selector
- Service type + subcategory
- Urgency (Low / Medium / High / Emergency)
- Description + optional budget range
- Price benchmark widget (shows typical range for service in this zip)
- Tier limit on open requests: Basic=3, Pro=10, Premium=Unlimited

**View bids (`/quotes/:id`)**
- Request details
- Contractor quotes (price, timeline, validity), sortable
- Accept a quote → converts to a job
- Messaging with contractors

---

### Predictive Maintenance (`/maintenance`)

- 5-year maintenance calendar with urgency indicators (Critical / Soon / Watch / Good)
- System life bars (age relative to expected lifespan)
- Task completion toggle (scheduled / done)
- Market intelligence suggestions (ROI-ranked projects for this zip)
- Inline estimate requests
- Schedule system ages override
- Export maintenance plan to PDF

---

### Market Intelligence (`/market`)

- **Tab: Competitive Analysis** — property score vs. comparable properties in zip; chart of local score distribution; top improvement suggestions
- **Tab: Project ROI** — renovation recommendations ranked by local ROI; budget slider; sort by ROI / cost / payback; project cards with est. cost, ROI $, payback years

---

### Warranty Wallet (`/warranties`)

- All warranties from logged jobs
- Status: Active / Expiring Soon (30-day warning) / Expired
- Days-remaining countdown
- Upload warranty documents (OCR extracts expiry, coverage, terms)
- Filter by status and service type
- Export to PDF

---

### Insurance Defense Mode (`/insurance-defense`)

- Filter jobs by insurance-relevant service (roof, HVAC, electrical, plumbing, etc.)
- Generate a filtered report of these jobs (sorted by system + date)
- Print / share for insurance claims
- Sensor × insurer discount estimator (IoT coverage → potential discount)

---

### Resale Ready (`/resale-ready`)

- Pre-sale preparation checklist
- Inspection report integration
- Repair recommendations (critical vs. nice-to-have)
- Timeline-to-sale-readiness score based on system ages, recent work, and inspections

---

### Sensors & IoT (`/sensors`)

- Register devices: Nest · Ecobee · Moen Flo · Ring Alarm · Honeywell Home · Rheem EcoNet · Sense · Emporia Vue · Rachio · SmartThings · Home Assistant · Manual
- Pending alerts panel: water leaks, temperature anomalies, filter replacements, etc.
- Auto-create pending jobs from Critical severity events
- Active / Inactive badge per device; deactivate device
- Stats bar: active devices, active alerts, auto-created jobs

---

### Recurring Services

**Create (`/recurring/new`)**
- Service type (HVAC, Pest, Landscaping, Pool, etc.)
- Contractor
- Frequency (monthly / quarterly / bi-annual / annual)
- Cost per visit
- Start / end date
- Each completed visit auto-logged as a job

**Manage (`/recurring/:id`)**
- Service details + visit history
- Edit frequency / cost
- Cancel contract

---

### Reports & Sharing

**Generate report** (modal on property detail)
- Expiry (days) + view limit + visibility level (Public / LinkOnly / Private)
- Optional: hide amounts, select rooms to include
- Produces a share token → `/report/:token`

**Public report (`/report/:token`)**
- Print-ready, no auth required
- Realtor co-branding if configured
- Visibility controlled by owner

**Badge (`/badge/:token`) and Certificate (`/cert/:token`)**
- Embeddable proof-of-score widgets

---

### FSBO Listing (Sell without an agent)

**Public listing page (`/for-sale/:propertyId`)**
- List price, property details, HomeGentic score badge
- Verified job summary (counts by service type)
- Photo gallery with full-screen lightbox
- Showing request form (name, contact, preferred time)

**Browse listings (`/homes`)**
- Filter by location, price range, property type, score range

**Listing manager (`/my-listing/:propertyId`) — authenticated owner**
- List price editor
- Photo gallery: add / remove / reorder (drag-and-drop)
- Listing status: Active / Under Contract / Sold
- Showing request inbox + response
- Offer inbox: accept / counter / reject
- Sealed-bid mode: encrypted offers, reveal after deadline
- Listing analytics: views, inquiries

---

### Agent-Assisted Sale (Listing Intent)

**Post listing intent (`/listing/new`)**
- Desired list price, target sale price, preferred commission range, notes
- Sends bid request to realtors in the marketplace

**Manage proposals (`/listing/:id`)**
- Side-by-side comparison of agent proposals: commission %, estimated net proceeds, timeline
- Accept proposal → agent selected
- Counter-proposal flow
- Post-acceptance milestones: Listed → Pending → Closed
- Offer log: all buyer offers received; accept / reject each
- Transaction close form: final sale price, closing date
- Agent performance logging

---

### Contractor Features

**Dashboard (`/contractor-dashboard`)**
- Leads list (filter by trade, urgency, location)
- Quote request detail + submit quote modal
- Active quotes (pending homeowner decision)
- Completed jobs with homeowner reviews
- Earnings summary + trust score tracker

**Profile (`/contractor/profile`)**
- Specialties (multi-select)
- Name, email, phone, bio, license number, service area
- Public profile preview

**Public profile (`/contractor/:id`)**
- Specialties, trust score, jobs completed, license badge, bio, reviews
- Contact button (for authenticated homeowners)

**Directory (`/contractors`)**
- Filter by specialty; sort by trust score or job count
- Contractor cards with name, specialties, trust score, verification badge

**Verification link (`/verify/:token`)**
- Email-based contractor verification flow

---

### Realtor / Agent Features

**Dashboard (`/agent-dashboard`)**
- All report share links created across client properties
- View counts, expiry dates per link
- Revoke link
- Copy link

**Marketplace (`/agent/marketplace`)**
- Browse active listing intents from homeowners
- View property, desired price, agent competition
- Submit proposal (commission %, est. net proceeds, timeline)

**Profile edit (`/agent/profile`)**
- Name, brokerage, phone, logo URL
- Co-branding preview (how it looks on shared reports)

**Public profile (`/agent/:id`)**
- Name, brokerage, closed deals count
- Client property score distribution
- Reviews and contact info

**Directory (`/agents`)**
- Browse realtors by location and specialties

---

### Settings (`/settings`)

- **Account tab** — edit email, phone; view role; realtor co-branding link
- **Subscription tab** — current plan + features; upgrade options; pause (1/2/3 months); cancel with confirmation
- **Notifications tab** — weekly pulse toggle, score alerts, email/SMS preferences per event type (differs by role)
- **Privacy tab** — visibility controls (public report, contractor visibility, trust score); export data as JSON

---

### Admin Dashboard (`/admin`)

- **Verifications tab** — list properties pending admin review; approve / reject
- **Tiers tab** — subscription counts by tier; breakdown chart
- **Cycles tab** — ICP canister burn rate and runway (days remaining); critical warning if runway < 7 days
- **Referrals tab** — referral metrics and payout tracking

---

## Subscription Tier Gates

| Feature | Basic | Pro | Premium |
|---|---|---|---|
| Properties | 1 | 5 | 20 |
| Photos per job | 5 | 10 | 30 |
| Open quote requests | 3 | 10 | Unlimited |
| AI agent calls/day | 5 | 10 | 20 |
| Score breakdown | ✓ | ✓ | ✓ |
| Warranty Wallet | ✓ | ✓ | ✓ |
| Recurring Services | ✓ | ✓ | ✓ |
| Market Intelligence | ✓ | ✓ | ✓ |
| 5-Year Maintenance Calendar | ✓ | ✓ | ✓ |
| Insurance Defense Mode | ✓ | ✓ | ✓ |
| Resale Ready | ✓ | ✓ | ✓ |

Contractor tiers: **ContractorFree** (profile + view leads, $15/verified job) · **ContractorPro** ($30/mo, quote submissions + earnings dashboard + reviews)

Realtor tiers: **RealtorFree** (profile + bid on listing requests, $100/won bid) · **RealtorPro** ($30/mo, unlimited bids + priority placement + verified badge + 10 AI calls/day)

---

## Key Modals (wired from multiple locations)

| Modal | Triggered from |
|---|---|
| `LogJobModal` | Dashboard, property detail, property header |
| `GenerateReportModal` | Property detail, dashboard |
| `RequestQuoteModal` | Dashboard, property detail |
| `InviteContractorModal` | Property detail, job detail |
| `RegisterDeviceModal` | Sensors page |
| `PropertyVerifyModal` | Property detail settings tab |
| `SystemAgesModal` | Property detail, maintenance page |
| `RecurringServiceCreateModal` | Dashboard, property detail |
| `InitListingModal` | Dashboard, property detail |
| `AddRoomModal` | Property detail rooms tab |
| `UpgradeModal` | Various tier-gated surfaces |

---

## Voice Agent

Floating mic button on every authenticated page (mounted in `Layout`).

- Tap → speak a question → hear a spoken response
- Knows: authenticated user's properties + recent jobs (fetched live from ICP)
- Topics: maintenance schedules, upgrade ROI, contractor guidance, system lifespans, property value context
- Powered by Claude via Express proxy at `:3001`
- Rate-limited by tier (see AI_RATE_LIMITS.md)
- Max 5 tool-use turns per interaction

---

## Key Data Flows

### Job logged
Property selected → Job form submitted → Written to ICP `job` canister → Score recomputed → Activity feed updated → If sensor-triggered: alert acknowledged

### Quote accepted
Homeowner accepts bid → Quote marked accepted → Job created from quote → Contractor notified → Job appears in contractor dashboard

### Agent proposal accepted
Homeowner accepts proposal → Agent selected → Transaction milestones created (Listed → Pending → Closed) → Transaction close form → Final sale price logged → Agent performance recorded

### FSBO offer flow
Buyer submits offer at `/for-sale/:id` → Seller sees offer in `/my-listing/:id` → Seller accepts / counters / rejects → If sealed-bid: encrypted until reveal deadline

### Report shared
Owner generates report → Share token created with expiry + view limit → Token-based URL shared → Any visitor with link can view (no auth) → Realtor co-branding shown if configured

### Sensor event → job
IoT device reports Critical event → `sensor` canister auto-creates pending job → Alert appears on `/sensors` → Homeowner can review and approve or dismiss

### Verification
Homeowner uploads ownership doc → `property` canister stores hash → Admin reviews in admin dashboard → Verification level upgraded → Score badge updates
