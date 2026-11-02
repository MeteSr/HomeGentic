# Changelog

Every merged pull request, newest first. Releases are the `mainnet-YYYYMMDD-HHMMSS` tags the Deploy Mainnet workflow creates; each has a GitHub release with the PRs it shipped and the module hash of every canister (`scripts/ops/release-manifest.sh`). See `docs/RELEASING.md`.

To add an entry: nothing to do. This file is regenerated from merged PR titles when a release is cut (`docs/RELEASING.md`), so write PR titles that say what changed for users.

## November 2026

- Cap Pro and ContractorPro chat at 200 a day (cycle-drain CD-8) (#684)
- Close the remaining cycle-drain paths (CD-5 to CD-15, except CD-8) (#683)
- Bound vetKD spend in market and quote, stop SMS pumping (cycle-drain CD-2, CD-3, CD-4) (#682)
- Human check and backoff on the address suggestion routes (#681)
- Gate Claude calls behind a human check, a free-tier budget and backoff (#680)
- Working address suggestions in Add Property, via the Worker (#679)

## October 2026

- Plain report attribution; real address lookup for job proposals (#678)
- Type every frontend canister call; plain report attribution; address lookup for job proposals (#677)
- Test the web app in a real browser on real canisters; fix four bugs it found (#676)
- Add lint, dead-code and compiler-warning gates to CI (#675)
- Test untested features, more races and relay/gateway/mobile clients on real canisters (#674)
- Test the Worker, dashboard and cross-canister calls against real canisters; fix 7 bugs they found (#673)
- Canister tests for transfers, payments, permissions, races and upgrades (+3 race fixes) (#672)
- Test that recurring ids stay distinct within one round (#670)
- Efficiency: one-call dashboard reads, upgrade-at-scale test, search caps, caching (#669)
- Fix findings from the 2026-10-28 security re-audit (#668)
- Launch wiring: install payment before property, grant identity relay, pass inbox domain (#667)
- Upgrade @icp-sdk/core 6, @icp-sdk/auth 10, TypeScript 7, Expo SDK (#665)
- Launch gaps: honest price benchmarks, relay hosting, sensor sign-in, invite address, sample report, mobile Sentry + universal links (#664)
- Accessibility: landmarks, skip link, 404 page, reduced motion, tap targets (#663)
- Off-chain photos, part 2: web and mobile upload off-chain, with on-chain fallback (#662)
- Mobile: seller's My listing screen + production-grade device pass (re-land #660 on main) (#661)
- Mobile: seller's My listing screen + production-grade device pass (#660)
- Build FSBO on the listing canister, fix screens that did nothing, close test gaps (#659)
- Permit import for the City of Orlando, plus a weekly permit-feed check (#658)
- Charge the Contractor Free referral fee (#657)
- Florida DBPR licence check and real ContractorPro features (#656)
- Florida insurance readiness: 4-point and wind mitigation (#655)
- Hand the home's record to the buyer at closing (#654)
- Capture without typing: forwarded invoices, label photos, recall alerts (#652)
- Accessibility PR 2: shared dialog, load-error states, page titles and focus, form labels (#648)
- Weekly Home Pulse email, signed records, one score formula (#651)
- Make Settings privacy switches save and take effect (#650)
- Show real contractor data on the Jobs pages instead of random numbers (#649)
- Off-chain photos, part 1: canister access checks + R2 routes in the voice Worker (#611)
- Make billing, verification and privacy copy match what the app does (#610)
- chore(deps): fix dependency audit findings; make license source-available (#606)
- Accessibility quick wins: phone layouts, keyboard dashboard, focus rings, contrast (#609)
- Fix production-readiness gaps: cycles, deploy errors, snapshots, watchdog, rollback docs (#608)
- Faster dashboard loads, working IoT load test, smaller public assets (#607)
- Bid to List confirm no longer bills the homeowner; k6 load tests run against the Worker (#600)
- Refactor: shared Admin/Canisters modules, dot notation everywhere, packages/shared, drop legacy Express voice server (#599)
- Share rate limiting, service actors and formatters instead of copying them (#598)
- Close the follow-up security items from the audit (#597)
- Fix the security audit findings; property and job IDs become UUIDs (#596)
- Motoko toolchain to moc 1.16.1 / core 2.6.1, plus DFINITY's ICP skills (#595)
- Backend data structures: photo Blobs, sensor event log, secondary indexes, address index, audit map (#594)
- Mobile CI job and EAS release workflow (TestFlight / Play) (#593)
- Mobile v3: rebuild the Expo app to the v3 design, wired to live canisters (#591)
- Grant the relay and voice Worker their canister access on every deploy (#581)
- Run the Cloudflare Worker deploy jobs on Node 22 (#580)
- Wire up email and SMS notifications in Settings (#579)
- fix(dashboard): stop rail chips fading colour on theme switch (#563)
- feat(notifications): real contractor bid and signature push toggles (#562)
- docs(deploy): cover every deployable component; fix mainnet deploy secrets (#561)
- feat(notifications): send real pushes from canister outboxes (#560)
- docs: add system and canister-call architecture diagrams (#559)
- fix(voice): verify callers with canister-issued sessions; enforce chat limit (#558)
- fix(voice): Worker resolves AI tier server-side; port Rentcast lookup (#557)
- fix(deploy): testnet voice Worker + frontend URL; read payment canister ID per call (#556)
- 6 dependency updates (Dependabot)

## September 2026

- docs: bring repo docs in line with the code (#555)
- feat(dashboard): adopt the v3 palette design (neutral black/white, light default) (#554)
- feat(frontend): give every page the v3 app shell (#553)
- Login page: simplify the card (design option 1b) (#552)
- deploy.sh: empty the testnet reinstall allow-list (#551)
- deploy.sh: send auth through the guarded testnet reinstall path (#550)
- Resolve npm audit findings (qs/ip-address in agent servers, dev tooling, wrangler 4) (#549)
- Dashboard: home brief and composed answer cards (#548)
- Pre-launch storage cleanup: transient constants, one ServiceType, live tiers, Free/Pro only (#532)
- Gate upgrades on stable-memory compatibility; stop deploy.sh wiping mainnet data (#531)
- Let homeowners share relevant utility usage with contractors (#530)
- Share a monthly-costs summary on buyer/agent reports (#529)
- perf: drop react-helmet-async and lazy-load low-traffic public pages (#528)
- Share a property's bills with its household, scoped by role (#527)
- Forecast bills 12 months ahead and explain the patterns (#526)
- Track fixed housing costs (mortgage, tax, HOA, insurance) in bills (#525)
- fix: one-time reinstall of testnet contractor canister (origin field upgrade trap) (#524)
- fix: sensor test.sh jobId assertions can SIGPIPE-fail under pipefail (#523)
- Make light the default color mode across hg-v3 pages (#522)
- License-verify contractor identity at guest countersignature (#521)
- Redesign People page to hg-v3 HUD theme (#517)
- fix: use 100dvh for dashboard/main viewport height on iOS/iPadOS Safari (#520)
- Redesign Sensors page to hg-v3 HUD theme (#516)
- fix: pre-flight check for stopped frontend canister before deploy (#515)
- Redesign Contractors page to hg-v3 HUD theme (#509)
- Redesign Jobs page to hg-v3 HUD theme (#508)
- Retheme sidebar to hg-v3 + redesign Market Intelligence page (#507)
- Add a Dashboard breadcrumb link to PropertyDetailPage (#506)
- Redesign PropertyDetailPage to match DashboardV3's HUD theme (#505)
- fix: dead CTA buttons on 7 of the 16 dashboard panels (#504)
- fix: one-time reinstall of testnet property canister (#503)
- fix: accept reviewed breaking Candid changes in deploy scripts with --yes (#502)
- fix: migrate remaining @dfinity/* imports to @icp-sdk/core (#501)
- test: add coverage for the 3 remaining components (Button, ResponsiveGrid, VoiceAgent) (#500)
- test: add coverage for the 20 remaining page files (#499)
- Add unit tests for all 33 remaining frontend services (#498)
- Add unit tests for 8 more frontend services (#497)
- Expand test coverage: 2 pages + 6 services (HomeSystemsEstimator, WarrantyWallet, errorReporting, propertyLookup, fee, icpLedger, documentOcr, benefit) (#496)
- Expand test coverage: 8 pages (Pricing, FAQ, PriceLookup, ContractorVerify, Register, ScoreCert, CheckAddress, PropertyTransferClaim) (#495)
- Expand test coverage: useActivityFeed hook + 9 small components (Badge, Checkbox, ChoicePill, PropertyCard, ScoreValueBanner, ScoreSparkline, JobValueDelta, IconBadge, DocumentedValueSection) (#494)
- Expand test coverage: 8 components (BidDetailDrawer, ActivityFeedDrawer, NeighborhoodBenchmark, AddressAutocomplete, PropertyAddressBar, ReportQAPanel, PermitImportReviewPanel, ConstructionPhotoUpload) (#493)
- Expand test coverage: 9 components (UserMenuPopover, RecurringServiceCard, ShowingCalendar, PropertyEstimatedValueInput, PropertyVerifyModal, PhotoQuotaDisplay, PriceBenchmarkWidget, ScoreHistoryChart, PublicFooter) (#492)
- Expand test coverage: 9 components (RecurringService, InitListing, InsuranceShare, Disclosure, PublicNav, ShowingInbox, LocalBroker, ListingPhoto, ConfirmSelection) (#491)
- Expand test coverage: modal components (LogJob, RegisterDevice, FsboOffer, SystemAges, RequestQuote, AddRoom) (#490)
- Expand test coverage: buyer's truth kit, mobile pages, resale-ready, insurance defense (#489)
- Expand test coverage: admin dashboard, system ages, badge, neighborhood, mobile account (#488)
- Expand test coverage: recurring services, listing, contractors, people, market intel (#487)
- Expand test coverage: 13 pages, real business logic (#486)
- Security audit hardening: payment paywall, principal spoofing, coverage (#485)
- Add anonymous-caller ingress guard to audit canister (#484)
- Fix lost-update race in job status/contractor-link/verify flows (#483)
- Make the Cycles Regression Check measure real cycles instead of static math (#482)
- Fix reentrancy race in quote canister accept/close/cancel flows (#481)
- Replace predictable transfer/invite tokens with cryptographic randomness (#480)
- Fix admin-bootstrap front-running race across 16 canisters (H-20) (#479)
- Add Homeowner Plus state to the v3 dashboard (#478)
- Rebuild homeowner dashboard as v3 left-rail, voice-first UI (#477)
- Fix npm ci: regenerate lockfile for @types/react drift (#476)
- Real People access, mock-data cleanup, and dead-code lint gate (#475)
- Replace PROD.3's character-distance test with real execution (#474)
- Fix cycles-balance parsing: grep anchor missed icp-cli's indented output (#473)
- Fix/sidebar dashboard property dual highlight (#472)
- Make wallet pre-flight cycles requirement scale with new canisters (#471)
- Chore/cycle scripts cleanup (#470)
- Rebuild Share Report Link modal on the V2 cobalt design system (#469)
- Rebuild Maintenance page on the V2 cobalt design system (#468)
- Open Free tier to AI/intelligence features; add weekly AI-call allowance (#466)
- test(expanded): E2E, a11y, integration, hooks, and mobile coverage (#433)
- Implement Contractor Plan & Billing UI, align referral fee to 3%/$20 floor (#450)
- test(visual): set up Playwright visual regression snapshot baseline (#449)
- Redesign Bid to List as a masked sealed-bid marketplace (#448)
- 19 dependency updates (Dependabot)

## August 2026

- test(coverage): add 178 unit tests across hooks, stores, services, and components (#431)
- feat(ai_proxy): ATTOM Data auto-fill on property signup (#425) (#430)
- feat(quote): vetKeys IBE encryption for sealed-bid quotes (#424) (#429)
- feat(#423): contractor discovery — search, trust score, reviews (#428)
- test(#422): cross-canister integration test suite (#427)
- ops(#421): fix cycle watchdog and add monitoring upgrade tests (#426)
- feat(design): complete V2 cobalt token migration (pt 2) (#420)
- design(v2): migrate to cobalt design system — tokens, primitives, and 26 pages (#419)
- fix(voice): bump @cloudflare/workers-types to ^5 to satisfy wrangler … (#418)
- fix(go-live): XSS fix, CodeQL resolution, Dependabot audit across all workspaces (#417)
- fix(security): apply all 32 findings from full-codebase security review (#416)
- feat(wizard): redesign Add Property modal as V2 hub-based wizard (#415)
- feat(tablet): responsive layout + Buyer's Truth Kit e2e (#414)
- feat(mobile): full mobile suite — nav, home, all tabs, plans flow (#413)
- feat(maintenance): Recurring Services section + layout redesign (#412)
- feat: V2 UI redesign + People tab + a11y fixes (#411)
- feat(ui): V2 redesign — dashboard, maintenance, jobs, contractors, sensors (#410)
- feat(landing): make marketing page fully responsive across all breakp… (#398)
- test(jobs): add submit-correctness tests and clarify photo data model (#182) (#397)
- feat(ui): redesign demo page + dual-signature landing section (#396)
- Feat/landing page redesign (#395)
- fix(prod-checklist): close four outstanding gaps from issue #361 (#394)
- feat(ux): bring all remaining 4/5 audit pages to 5/5 (#393)
- feat(ux): wireframe audit improvements — 8 pages upgraded (#392)
- 5 dependency updates (Dependabot)

## July 2026

- fix(prod): address deferred M4/L4/L5 audit findings (#383)
- fix(prod-readiness): close email relay, fix backup-controller CLI, gate mainnet deploy on tests, bound audit log, add crash handlers (#382)

## June 2026

- 4 dependency updates (Dependabot)

## May 2026

- Feat/343 cloudflare workers voice agent (#355)
- feat(infra): migrate voice agent proxy from Railway to Cloudflare Workers (#343) (#353)
- refactor(idl): centralise Candid IDL factories under src/declarations/ (#350) (#352)
- refactor(dashboard): extract sub-components to components/dashboard/ (#351)
- feat(contractors): redesign browse page and fix compilation errors (#349)
- style(icons): synchronize icon system with mockup design library (#348)
- Feat/dashboard routes redesign (#347)
- Feat/dashboard redesign (#346)
- feat(landing): redesign landing page with ICP/Quorum-focused layout (#345)
- feat(referrals): wire useReferralCode on registration + markConverted on first payment (#344)
- fix(ci): upgrade upload-artifact from v4 to v7 to fix Node.js 20 depr… (#342)
- feat(core): remove real estate agent features; add BidToList CTA + lo… (#341)
- Feat/337 warm referrals (#339)
- feat(agents): add BidtoList sub-router at /api/bidtolist/* (#43) (#331)
- Feat/329 quorum member coupon (#330)
- feat(listing): 360° panorama viewer for FSBO listings (#308) (#319)
- Feat/276 279 push notifications (#318)
- feat(fsbo): compute FSBO score on-chain via market canister (#317)
- fix(security): fix SSRF in SmartThings webhook and FSBO trust-signal … (#316)
- security: persist rate-limit maps, add input validation, IoT payload schema checks (#315)
- security: resolve remaining audit findings from issue #312 (C-4, H-3, H-6, M-3) (#314)
- fix(security): address audit findings from issue #312 (#313)
- feat(ops): audit canister for privileged action logging (#145) (#311)
- feat(ops): k6 load tests for IoT gateway and voice server CI gate (#2… (#310)
- feat(ops): migrate IoT pollers and voice server to structured logger … (#309)
- feat(monitoring+a11y): Sentry-like error aggregation and WCAG 2.1 AA … (#304)
- feat(observability): end-to-end tracing, canister metrics, cycle safe… (#303)
- fix(iot-gateway): structured logging, CORS restriction, postMessage o… (#295)
- feat(sensor): SolarEdge poller + tiered device registration UX (#272 … (#294)
- feat(report): machine-readable property risk profile for insurance carriers (#278) (#293)
- feat(quote): homeowner contractor quality filters on quote requests (#280) (#292)
- feat(tests): canister upgrade tests + Playwright smoke suite (#283, #284) (#291)
- feat(iot-gateway): LG ThinQ PCC webhook + GE SmartHQ OAuth polling (#273, #274) (#290)
- feat(iot-gateway): Enphase IQ Gateway + Tesla Powerwall local LAN pollers (#270, #271) (#289)
- feat(iot-gateway): SmartThings webhook integration (#268) (#288)
- feat(iot-gateway): Honeywell Home / Resideo REST polling (#263) (#287)
- test(iot-gateway): 68 unit tests for handlers and Ecobee poller (#282) (#286)
- feat(iot-gateway): Ecobee REST poller with token auto-refresh (#261) (#281)
- test(integration): add integration tests for 10 uncovered canisters (… (#260)
- feat(admin): add contractor and realtor pro-verification tabs (#247, … (#259)
- feat(#242,#243): getMyBids + service ZIP input for contractors (#246)
- fix(#244): wire missing set*CanisterId calls + static coverage test (#245)
- feat(#239): location-based contractor filtering for quote requests (#241)
- docs: add SYSTEMS.md — in-depth reference for all 17 canisters and voice server (#240)
- Pricing cancellation policy (#238)
- General cleanup (#237)
- Feat/photo compression cap (#236)
- feat(photo): two-pass compression with phase-aware byte caps (#230)
- feat(dashboard): redesign midsection with score gauge, aggregate stat… (#229)
- feat(landing): landing page makeover — social proof, problem section, pricing, final CTA (#226) (#228)
- 16 dependency updates (Dependabot)

## April 2026

- Test/tier propagation and sensor job (#224)
- feat(auth): block Free-tier Homeowners from all paid routes (#223)
- test(backend): add assertions for tier propagation and sensor→job aut… (#222)
- fix(#217): route paymentCanister to local dfx replica when DFX_NETWOR… (#221)
- ci: add test-voice job for agents/voice unit + integration tests (#220)
- fix(test): load agents/voice/.env in stripe.elements integration test (#219)
- Fix/213 voice dfx to ic agent (#218)
- fix(voice): replace dfx shell-outs with @dfinity/agent canister calls… (#216)
- feat(voice): expand /health to check required env vars (#215)
- feat(voice): fix start script + add Dockerfile and Railway config (#214)
- fix(deploy): record frontend canister ID + fix ENV seed + non-fatal push (#212)
- fix(deploy): include frontend in cycle deposit + proportional funding (#211)
- fix(deploy): seed icp-cli state from canister_ids.json before install (#210)
- Fix/testnet deploy cycles (#209)
- fix(deploy): commit testnet canister IDs + fix cycles check pipefail (#208)
- fix(deploy): use correct cycles ledger deposit method name (#207)
- fix(deploy): pass --wallet explicitly to dfx canister call --with-cycles (#206)
- fix(deploy): fund cycles ledger from dfx wallet before canister create (#205)
- fix(ci): call set-wallet after identity import; add DFX_WALLET_ID secret (#204)
- fix(ci): load DFX_IDENTITY_PEM into dfx before wallet balance check (#203)
- fix(ci): correct dfxvm PATH in ci.yml and deploy-testnet.yml (#202)
- fix(ci): install dfx in testnet workflow + mint cycles for local deploy (#201)
- ops(#101): remove canister_ids.json from .gitignore (#200)
- fix(ci): skip dfx deps pull — deploy backend canisters explicitly (#199)
- ops: wire testnet GitHub environment and missing deploy secrets (#198)
- ops(#102): wallet cycles pre-flight check for testnet deploy (#197)
- ops(#103): add BACKUP_CONTROLLER_PRINCIPAL to testnet deploy workflow (#196)
- feat(#178): wire photo upload after job creation in JobCreatePage (#195)
- fix(tests): eliminate act() warnings and IDB hangs in CI (#191) (#194)
- fix(git): prevent Claude agent worktrees from being staged as gitlinks (#192) (#193)
- fix(#181): jobService.getAll() always returning [] — score delta alwa… (#189)
- Fix/180 e2e coverage (#188)
- Fix/179 fsbo list public stub (#187)
- fix(audit): address critical, high, and medium code quality findings (#177)
- fix(e2e): add canister guard to contractorService.getContractor (#176)
- Feat/174 icp cli migration (#175)
- Chore/upgrade icp sdk auth 167 (#171)
- chore: update safe patch/minor packages (frontend + voice) (#170)
- docs: add FEATURES.md comprehensive feature reference (#166)
- Feat/realtor tiers 164 (#165)
- docs: update all docs to reflect current app state (#163)
- feat(sensor): expand IoT device sources from 4 to 12 (#161) (#162)
- feat(dashboard): surface baseline photo completion prompt (#135) (#160)
- feat(onboarding): add baseline photos step to onboarding wizard (#134) (#159)
- feat(observability): add lightweight client-side error tracker (#158)
- feat(payments): add Stripe webhook endpoint with subscription lifecyc… (#157)
- feat(credits): agent credit top-ups for power users (#89) (#156)
- security: add secrets scanning CI job, pre-commit hook installer, and… (#155)
- feat(mobile): wire all TODO service stubs to ICP canisters (#141) (#154)
- test(e2e): add P0 E2E coverage for onboarding, job limits, and tier g… (#153)
- fix(frontend): replace silent .catch(() => {}) with console.error or … (#152)
- feat(validation): add comprehensive input validation at canister boun… (#151)
- fix(payment): propagate tier changes cross-canister to property/quote… (#150)
- security(auth): close addAdmin bootstrap race and harden deploy.sh (#149)
- security(canisters): add system func inspect to all 14 unprotected canisters (#148)
- Onboarding wizard take2 (#132)
- Feat/onboarding wizard 129 (#131)
- fix(settings): prefetch subscription tier to eliminate spinner on sub… (#130)
- feat(listing): add FSBO listing photos with drag-to-reorder (#114) (#128)
- refactor(services): remove import.meta.env.DEV guards from service la… (#127)
- refactor(auth): adopt centralized isAuthorized() across cross-canister callers (#125)
- fix(deploy): export DFX_NETWORK before frontend build (#124)
- fix(assets): add .ic-assets.json5 with standard security policy (#121)
- feat(room): remove MOCK_ROOMS seed data from service layer (#123)
- feat: remove mock seed data from service layer; add scripts/seed.sh (… (#122)
- feat(quote): homeowners can cancel open quote requests (#113) (#120)
- security(property): replace sequential Nat ID with cryptographically … (#119)
- security(payment): add admin authorization guards to setUpdateRateLim… (#118)
- perf(ci): parallelize canister deploy, wiring, and test execution (#109)
- feat(payment): hard-cancel subscription with billing-cycle grace period (#108)
- feat(onboarding): modal wizard flow, mock guard fix, and market quote… (#107)
- Feat/UI cleanup (#106)
- feat(ci): gate PRs with code coverage comment and fix coverage workfl… (#105)
- fix(ci): add npm ci to deploy workflows — fix TS2688 type definition errors (#104)
- Chore/spontaneous improvements (#98)
- refactor(#91): extract domain hooks from PropertyDetailPage god compo… (#97)
- refactor(DashboardPage): extract domain hooks — closes #90 (#96)
- Feat/fsbo search marketplace (#92)
- feat(ui): frontend polish — nav cleanup, AI room tool, demo updates (#88)
- feat(test): add E2E and unit test coverage for issues #72, #73, #77 (#87)
- fix(code-quality): rename const S to UI, fix computeAverageRating, au… (#86)
- refactor(components): decompose large page/layout files into focused … (#85)
- fix(code-quality): silent errors, null returns, high-arity call (#81) (#84)
- test(services): expand unit tests for payment, property, and job (#71) (#80)
- feat(e2e/ci/coverage): Stripe E2E tests, subscription UI tests, and CI coverage (#70 #74 #76) (#79)
- Fix/e2e runtime (#78)
- Fix/canister compile errors (#69)
- feat(ai): agent call rate limiting, usage tracking, and ICP checkout … (#68)
- Feat/issue 63 stripe payments (#64)
- Redesign/landing page (#62)
- feat(bills): Epic #49 Stories 3–6 — efficiency alerts, rebates, insur… (#61)
- Fix/block font consistency (#60)
- 12 dependency updates (Dependabot)

## Before April 2026

The entries below were written by hand before this file was generated from pull requests.

### [0.5.0] - 2026-04-11

#### Security (ICP compliance hardening)
- Added `Principal.isAnonymous(caller)` rejection in every update-capable canister (`requireActive`) — SEC.1 test suite enforces coverage across all 16 canisters
- Declared `updateCallLimits` as `transient var` in every canister — resets on upgrade, preventing unbounded stable-memory growth from sliding-window rate-limit entries (SEC.2)
- Added `Principal.isAnonymous` guard to `ai_proxy/main.mo` (previously unchecked)
- Added inline anonymous guard to `payment.subscribe()` (no `requireActive` wrapper)

#### Tests
- Added SEC.1, SEC.2, SEC.3 test suites to `icpProd567.test.ts`
- Expanded Candid contract tests to cover all 16 canisters (was 4): listing, quote, contractor, photo, report, sensor, maintenance, agent, bills
- Added bills arity snapshot to `candidContracts.test.ts`

---

### [0.4.0] - 2026-04-04

#### Features
- **Bills Intelligence (Epic #49 Stories 3–6)**: system efficiency degradation detection, rebate finder (Electric bills), insurance discount triggers, telecom negotiation script generator — all via voice agent proxy and new `billsIntelligence.ts` service
- **Cycle Watchdog (Issue #55)**: `checkCycleLevels` on monitoring canister; automated top-up scripts; CI cycle-gate job
- **Document OCR (Issue #51)**: appliance manual and warranty upload with OCR text extraction
- **PricingPage**: tier toggle (monthly/annual), ContractorFree tier, annual billing discount, referral fee model, feature comparison tooltips
- **InsuranceDefensePage**: sensor × insurer discount estimator
- **Legal**: Terms of Service page with agreement checkbox at registration

#### Fixes
- Bills canister: Free tier gated to 1 upload/calendar month; timed-pause support added
- Job canister: `sourceQuoteId` field added to all job records (was missing, broke Candid IDL)
- CI: corrected perf-regression YAML; Playwright webServer port-conflict resolved; Vitest/RTL timeouts raised to fix parallel-suite flakiness

---

### [0.3.0] - 2026-03-28

#### Features
- **Bills canister**: utility bill upload, OCR extraction, anomaly detection (Epic #49 Stories 1–2); 3-month rolling baseline; >20% spikes flagged to Activity feed bell drawer
- **Mobile bill upload** screen
- **Activity feed**: proactive alerts moved from VoiceAgent float into bell drawer; avatar menu updated with receipt/photo attachment shortcuts

#### Fixes
- XSS and missing rate-limit security alerts resolved
- Property service mock path gated on `!process.env.VITEST` to prevent test contamination

---

### [0.2.0] - 2026-03-24

#### Added
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

### [0.1.0] - 2026-03-10

#### Added
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
