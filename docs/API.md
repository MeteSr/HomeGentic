# HomeGentic API Reference

All canisters return `Result.Result<T, Error>` on update calls unless noted otherwise.
All canisters expose `getMetrics()` (query, no args) and the admin lifecycle methods listed at the end of each section.

---

## Auth Canister

| Method | Type | Signature | Description |
|---|---|---|---|
| `register` | update | `(role: UserRole, email: Text, phone: Text)` | Register a new user |
| `getProfile` | query | `()` | Get caller's profile |
| `updateProfile` | update | `(email: ?Text, phone: ?Text)` | Update email / phone |
| `hasRole` | query | `(UserRole)` | Check caller's role |
| `recordLogin` | update | `()` | Record a login timestamp |
| `getUserStats` | query | `()` | Aggregate user stats (counts by tier/role) |

**UserRole:** `#Homeowner | #Contractor | #Realtor | #Builder`

**Admin / Lifecycle:** `addAdmin(Principal)` · `setUpdateRateLimit(Nat)` · `pause(?Nat)` · `unpause()`

---

## Property Canister

Owns property registration, ownership verification, transfers, and room/fixture CRUD (merged from old `room` canister).

### Property

| Method | Type | Signature | Description |
|---|---|---|---|
| `registerProperty` | update | `(RegisterPropertyArgs)` | Register a new property |
| `getMyProperties` | query | `()` | Caller's properties |
| `getPropertiesByOwner` | query | `(Principal)` | Properties for a given owner |
| `getProperty` | query | `(Nat)` | Get property by ID |
| `getPropertyOwner` | query | `(Nat)` | Get property owner principal |
| `getVerificationLevel` | query | `(Nat)` | Get verification level string |
| `getPropertyLimitForTier` | query | `(SubscriptionTier)` | Max properties allowed for tier |
| `getPendingVerifications` | query | `()` | Admin: list properties awaiting review |
| `submitVerification` | update | `(propertyId: Nat, ...)` | Homeowner submits for verification |
| `verifyProperty` | update | `(Nat, VerificationLevel)` | Admin: approve verification |
| `bulkRegisterProperties` | update | `([RegisterPropertyArgs])` | Admin: bulk seed |
| `isAdminPrincipal` | query | `(Principal)` | Check if principal is admin |

### Ownership Transfer

| Method | Type | Signature | Description |
|---|---|---|---|
| `initiateTransfer` | update | `(propertyId: Nat, to: Principal)` | Start a transfer (7-day conflict window) |
| `acceptTransfer` | update | `(propertyId: Nat)` | Recipient accepts transfer |
| `cancelTransfer` | update | `(propertyId: Nat)` | Cancel a pending transfer |
| `getPendingTransfer` | query | `(propertyId: Nat)` | Get pending transfer record |
| `getOwnershipHistory` | query | `(propertyId: Nat)` | Full transfer history |

### Rooms & Fixtures

| Method | Type | Signature | Description |
|---|---|---|---|
| `createRoom` | update | `(CreateRoomArgs)` | Add a room to a property |
| `getRoom` | query | `(Text)` | Get room by ID |
| `getRoomsByProperty` | query | `(propertyId: Text)` | All rooms for a property |
| `updateRoom` | update | `(id: Text, UpdateRoomArgs)` | Update room metadata |
| `deleteRoom` | update | `(id: Text)` | Delete a room |
| `addFixture` | update | `(roomId: Text, AddFixtureArgs)` | Add a fixture to a room |
| `updateFixture` | update | `(roomId: Text, fixtureId: Text, AddFixtureArgs)` | Update a fixture |
| `removeFixture` | update | `(roomId: Text, fixtureId: Text)` | Remove a fixture |
| `getRoomMetrics` | query | `()` | Room/fixture counts |

**Admin / Lifecycle:** `addAdmin(Principal)` · `setTier(Principal, SubscriptionTier)` · `setUpdateRateLimit(Nat)` · `addTrustedCanister(Principal)` · `removeTrustedCanister(Principal)` · `pause(?Nat)` · `unpause()`

---

## Job Canister

| Method | Type | Signature | Description |
|---|---|---|---|
| `createJob` | update | `(propertyId: Text, title: Text, serviceType: ServiceType, description: Text, contractorName: ?Text, amount: Nat, completedDate: Time, permitNumber: ?Text, isDiy: Bool)` | Create a maintenance job |
| `getJob` | query | `(jobId: Text)` | Get job by ID |
| `getJobsForProperty` | query | `(propertyId: Text)` | All jobs for a property |
| `getJobsByOwner` | query | `(Principal)` | All jobs for an owner |
| `getJobsPendingMySignature` | query | `()` | Jobs awaiting caller's signature |
| `updateJobStatus` | update | `(jobId: Text, JobStatus)` | Update job status |
| `linkContractor` | update | `(jobId: Text, contractorPrincipal: Principal)` | Link a contractor to a job |
| `verifyJob` | update | `(jobId: Text)` | Sign job (homeowner or contractor) |
| `createInviteToken` | update | `(jobId: Text, propertyAddress: Text)` | Generate invite token for contractor |
| `getJobByInviteToken` | query | `(token: Text)` | Preview job via invite token |
| `redeemInviteToken` | update | `(token: Text)` | Contractor redeems token to link themselves |
| `getCertificationData` | query | `(propertyId: Text)` | Aggregated score + verified job count |
| `createSensorJob` | update | `(...)` | Trusted: auto-create job from IoT event |
| `builderImportJob` | update | `(...)` | Builder: import a job record |

**JobStatus:** `#Pending | #InProgress | #Completed | #Cancelled`

**ServiceType:** `#HVAC | #Roofing | #Plumbing | #Electrical | #Landscaping | #Painting | #Flooring | #Foundation | #Windows | #Appliances | #Other`

**Admin / Lifecycle:** `addAdmin(Principal)` · `setUpdateRateLimit(Nat)` · `setContractorCanisterId(Text)` · `setPropertyCanisterId(Text)` · `setPaymentCanisterId(Text)` · `addSensorCanister(Principal)` · `addTrustedCanister(Principal)` · `removeTrustedCanister(Principal)` · `pause(?Nat)` · `unpause()`

---

## Contractor Canister

| Method | Type | Signature | Description |
|---|---|---|---|
| `register` | update | `(RegisterArgs)` | Register as a contractor; initializes `serviceZips=[]` |
| `getMyProfile` | query | `()` | Caller's contractor profile |
| `getContractor` | query | `(Principal)` | Get contractor by principal |
| `getAll` | query | `()` | List all contractors |
| `getBySpecialty` | query | `(ServiceType)` | Filter contractors by specialty |
| `getByZip` | query | `(zipCode: Text)` | Contractors who explicitly list that zip code in `serviceZips` |
| `updateProfile` | update | `(UpdateArgs)` | Update contractor profile; `UpdateArgs` includes `serviceZips: [Text]` (max 50, each exactly 5 digits) |
| `submitReview` | update | `(contractorPrincipal: Principal, rating: Nat, comment: Text)` | Submit a review (rate-limited: 10/day/user) |
| `getReviewsForContractor` | query | `(Principal)` | All reviews for a contractor |
| `recordJobVerified` | update | `(...)` | Trusted: increment verified job count |
| `getCredentials` | query | `(Principal)` | Verified job credentials for a contractor |
| `updateNotificationPrefs` | update | `(NotificationPrefsArgs)` | Update job-match notification settings; `NotificationPrefsArgs = { notifyEmail: ?Text, notifyPush: ?Bool, alertZips: [Text] }` |
| `verifyContractor` | update | `(Principal)` | Admin: mark contractor as verified |

**ContractorProfile new fields (after #279):** `notifyEmail: ?Text` (override email for alerts; null = use profile email), `notifyPush: ?Bool` (opt-in to mobile push), `alertZips: [Text]` (subset of serviceZips to receive alerts for; empty = all serviceZips).

**Admin / Lifecycle:** `addAdmin(Principal)` · `setUpdateRateLimit(Nat)` · `setJobCanisterId(Text)` · `setContractorCanisterId(Text)` · `addTrustedCanister(Principal)` · `removeTrustedCanister(Principal)` · `pause(?Nat)` · `unpause()`

---

## Quote Canister

### Standard Quotes

| Method | Type | Signature | Description |
|---|---|---|---|
| `createQuoteRequest` | update | `(propertyId: Text, serviceType: ServiceType, description: Text, urgency: UrgencyLevel, zipCode: ?Text)` | Create a quote request; `zipCode` restricts visibility to contractors serving that zip |
| `getQuoteRequest` | query | `(requestId: Text)` | Get a request by ID |
| `getOpenRequests` | query | `()` | All open requests unfiltered (contractor view; fast query) |
| `getOpenRequestsForMe` | update | `()` | Open requests filtered to caller's `serviceZips`; contractors with empty `serviceZips` receive all requests; requests with no `zipCode` are always included |
| `getMyQuoteRequests` | query | `()` | Caller's requests |
| `submitQuote` | update | `(requestId: Text, amount: Nat, timeline: Nat, validUntil: Time)` | Contractor submits a bid |
| `getQuotesForRequest` | query | `(requestId: Text)` | All bids on a request |
| `acceptQuote` | update | `(quoteId: Text)` | Homeowner accepts a bid |
| `closeQuoteRequest` | update | `(requestId: Text)` | Close a request without accepting |

### Sealed Bids

| Method | Type | Signature | Description |
|---|---|---|---|
| `createSealedBidRequest` | update | `(...)` | Create a sealed-bid request |
| `submitSealedBid` | update | `(requestId: Text, ciphertext: [Nat8])` | Contractor submits encrypted bid |
| `getMyBid` | query | `(requestId: Text)` | Caller's sealed bid |
| `revealBids` | update | `(requestId: Text)` | Reveal all bids after close |
| `getRevealedBids` | query | `(requestId: Text)` | All revealed bids |

**UrgencyLevel:** `#Low | #Medium | #High | #Emergency`

**Admin / Lifecycle:** `addAdmin(Principal)` · `setTier(Principal, SubscriptionTier)` · `setUpdateRateLimit(Nat)` · `setPropertyCanisterId(Principal)` · `setContractorCanisterId(Principal)` · `pause(?Nat)` · `unpause()`

---

## Payment Canister

Owns subscription management and pricing table (merged from old `price` canister).

| Method | Type | Signature | Description |
|---|---|---|---|
| `subscribe` | update | `(Tier)` | Subscribe to a tier |
| `getMySubscription` | query | `()` | Caller's active subscription |
| `getSubscriptionStats` | query | `()` | Platform-wide subscription counts |
| `getTierForPrincipal` | query | `(Principal)` | Look up tier for any principal |
| `getPricing` | query | `(Tier)` | Pricing info for a specific tier |
| `getAllPricing` | query | `()` | Pricing info for all tiers |

**Tier:** `#Basic | #Pro | #Premium | #ContractorFree | #ContractorPro | #RealtorFree | #RealtorPro`

`#Pro` ($59/year) is the only purchasable homeowner tier. `#Basic` and
`#Premium` remain valid variant values only so subscribers grandfathered
in before the pricing consolidation keep decoding and keep their original
limits enforced until they renew — `subscribe`/`getPricing` no longer
offer them as purchase options.

**Admin / Lifecycle:** `setUpdateRateLimit(Nat)` · `addTrustedCanister(Principal)` · `removeTrustedCanister(Principal)`

---

## Photo Canister

| Method | Type | Signature | Description |
|---|---|---|---|
| `uploadPhoto` | update | `(UploadArgs)` | Upload photo bytes; SHA-256 deduplication enforced |
| `getPhoto` | update | `(photoId: Text)` | Get photo metadata |
| `getPhotoData` | update | `(photoId: Text)` | Get raw photo bytes |
| `getPhotosByJob` | update | `(jobId: Text)` | Photos for a job |
| `getPhotosByRoom` | update | `(roomId: Text)` | Photos for a room |
| `getPhotosByProperty` | update | `(propertyId: Text)` | Photos for a property |
| `getPhotosByPhase` | update | `(jobId: Text, ConstructionPhase)` | Photos filtered by construction phase |
| `verifyPhoto` | update | `(photoId: Text)` | Admin: mark photo as verified |
| `deletePhoto` | update | `(photoId: Text)` | Delete a photo (owner or admin) |

**Admin / Lifecycle:** `addAdmin(Principal)` · `setTier(Principal, SubscriptionTier)` · `setUpdateRateLimit(Nat)` · `pause(?Nat)` · `unpause()`

---

## Report Canister

| Method | Type | Signature | Description |
|---|---|---|---|
| `generateReport` | update | `(propertyId: Text, property: PropertyInput, jobs: [JobInput], recurringServices: [RecurringServiceInput], expiryDays: ?Nat, visibility: VisibilityLevel, rooms: ?[RoomInput], hideAmounts: ?Bool)` | Generate an immutable report snapshot and share link |
| `getReport` | update | `(token: Text)` | Fetch report by share token (checks visibility + expiry) |
| `listShareLinks` | update | `(propertyId: Text)` | List all share links for a property |
| `revokeShareLink` | update | `(token: Text)` | Revoke a share link |
| `issueCert` | update | `(propertyId: Text, payload: Text)` | Admin: issue an on-chain certificate |
| `verifyCert` | query | `(certId: Text)` | Verify a certificate by ID |

**VisibilityLevel:** `#Public | #LinkOnly | #Private`

**Admin / Lifecycle:** `addAdmin(Principal)` · `setUpdateRateLimit(Nat)` · `setPropertyCanisterId(Text)` · `addTrustedCanister(Principal)` · `removeTrustedCanister(Principal)` · `pause(?Nat)` · `unpause()`

---

## Market Canister

| Method | Type | Signature | Description |
|---|---|---|---|
| `analyzeCompetitivePosition` | query | `(...)` | ROI-ranked project analysis for a property |
| `recommendValueAddingProjects` | query | `(...)` | Top recommended projects (2024 Remodeling Magazine data) |
| `recordMarketSnapshot` | update | `(zipCode: Text, medianSaleCents: Nat, medianDaysOnMarket: Nat, pricePerSqFtCents: Nat, trend: #Rising \| #Stable \| #Declining)` | Admin: push a zip-level market snapshot |
| `getMarketSnapshot` | query | `(zipCode: Text)` | Get latest snapshot for a zip code |

**Admin / Lifecycle:** `addAdmin(Principal)` · `setUpdateRateLimit(Nat)` · `pause(?Nat)` · `unpause()`

---

## Maintenance Canister

| Method | Type | Signature | Description |
|---|---|---|---|
| `predictMaintenance` | query | `(...)` | Predict upcoming maintenance tasks for a property |
| `createScheduleEntry` | update | `(...)` | Create a maintenance schedule entry |
| `getScheduleByProperty` | query | `(propertyId: Text)` | All schedule entries for a property |
| `markCompleted` | update | `(entryId: Text)` | Mark a schedule entry as completed |

**Admin / Lifecycle:** `addAdmin(Principal)` · `setUpdateRateLimit(Nat)` · `pause(?Nat)` · `unpause()`

---

## Sensor Canister

| Method | Type | Signature | Description |
|---|---|---|---|
| `registerDevice` | update | `(...)` | Register an IoT device for a property |
| `deactivateDevice` | update | `(deviceId: Text)` | Deactivate a device |
| `getDevicesForProperty` | query | `(propertyId: Text)` | All devices for a property |
| `recordEvent` | update | `(...)` | Gateway: record a sensor event; auto-creates pending job on Critical severity |
| `getEventsForProperty` | query | `(propertyId: Text, limit: Nat)` | Recent events for a property |
| `getPendingAlerts` | query | `(propertyId: Text)` | Unacknowledged critical events |

**Admin / Lifecycle:** `addAdmin(Principal)` · `setUpdateRateLimit(Nat)` · `setJobCanisterId(Text)` · `addGateway(Principal)` · `pause(?Nat)` · `unpause()`

---

## Monitoring Canister

| Method | Type | Signature | Description |
|---|---|---|---|
| `recordCanisterMetrics` | update | `(...)` | Push metrics for a canister |
| `recordCallCycles` | update | `(method: Text, cycles: Nat)` | Record cycles consumed by a call |
| `getAllCanisterMetrics` | query | `()` | Metrics for all tracked canisters |
| `calculateCostMetrics` | query | `(userCount: Nat)` | Cost breakdown (storage / compute / network) |
| `calculateProfitability` | query | `(...)` | ARPU, LTV, CAC, margin |
| `getActiveAlerts` | query | `()` | All unresolved alerts |
| `resolveAlert` | update | `(alertId: Text)` | Mark an alert as resolved |
| `createInfoAlert` | update | `(category: AlertCategory, canisterId: ?Principal, message: Text)` | Admin: fire a manual info-level alert |
| `generateDailyReport` | query | `(BusinessMetrics)` | Render a formatted daily report string |

**AlertCategory:** `#Cycles | #ErrorRate | #ResponseTime | #Memory | #Milestone | #TopUp | #Stale`

**Admin / Lifecycle:** `addAdmin(Principal)` · `setUpdateRateLimit(Nat)` · `pause(?Nat)` · `unpause()`

---

## Listing Canister

| Method | Type | Signature | Description |
|---|---|---|---|
| `createBidRequest` | update | `(...)` | Homeowner creates a listing bid request (FSBO) |
| `getMyBidRequests` | query | `()` | Caller's bid requests |
| `getBidRequest` | query | `(id: Text)` | Get a bid request by ID |
| `cancelBidRequest` | update | `(id: Text)` | Cancel a bid request |
| `getOpenBidRequests` | query | `()` | All open requests (agent view) |
| `submitProposal` | update | `(...)` | Agent submits a listing proposal |
| `getProposalsForRequest` | query | `(requestId: Text)` | All proposals for a request |
| `getMyProposals` | query | `()` | Agent's submitted proposals |
| `acceptProposal` | update | `(proposalId: Text)` | Homeowner accepts an agent proposal |
| `metrics` | query | `()` | Listing canister metrics |

**Admin / Lifecycle:** `addAdmin(Principal)` · `setUpdateRateLimit(Nat)` · `pause(?Nat)` · `unpause()`

---

## Agent Canister

Realtor profiles and performance tracking.

| Method | Type | Signature | Description |
|---|---|---|---|
| `register` | update | `(RegisterArgs)` | Register as a realtor agent |
| `getMyProfile` | query | `()` | Caller's agent profile |
| `getProfile` | query | `(Principal)` | Get agent profile by principal |
| `getAllProfiles` | query | `()` | List all agent profiles |
| `updateProfile` | update | `(UpdateArgs)` | Update agent profile |
| `addReview` | update | `(AddReviewArgs)` | Submit a review for an agent |
| `getReviews` | query | `(Principal)` | All reviews for an agent |
| `verifyAgent` | update | `(Principal)` | Admin: mark agent as verified |
| `recordListingClose` | update | `(agentId: Principal, daysOnMarket: Nat)` | Admin/trusted: record a completed transaction |
| `metrics` | query | `()` | Agent canister metrics |

**Admin / Lifecycle:** `addAdmin(Principal)` · `setUpdateRateLimit(Nat)` · `pause(?Nat)` · `unpause()`

---

## Recurring Canister

| Method | Type | Signature | Description |
|---|---|---|---|
| `createRecurringService` | update | `(...)` | Create a recurring service contract (HVAC, pest, landscaping, etc.) |
| `getRecurringService` | query | `(serviceId: Text)` | Get a service contract by ID |
| `getByProperty` | query | `(propertyId: Text)` | All recurring services for a property |
| `updateStatus` | update | `(serviceId: Text, status: RecurringStatus)` | Update service status |
| `attachContractDoc` | update | `(serviceId: Text, ...)` | Attach a contract document |
| `addVisitLog` | update | `(serviceId: Text, ...)` | Log a service visit |
| `getVisitLogs` | query | `(serviceId: Text)` | All visit logs for a service |

**Admin / Lifecycle:** `addAdmin(Principal)` · `setUpdateRateLimit(Nat)` · `pause(?Nat)` · `unpause()`

---

## AI Proxy Canister

Handles IC HTTP outcalls: permit imports (ArcGIS / OpenPermit) and transactional email (Resend). All email methods require the Resend API key to be set via `setResendApiKey`.

| Method | Type | Signature | Description |
|---|---|---|---|
| `sendEmail` | update | `(to, subject, htmlBody, textBody?: Text, replyTo?: Text, fromName?: Text)` | Send a transactional email via Resend |
| `sendInviteEmail` | update | `(to, contractorName?: Text, propertyAddress, serviceType, amount?: Nat, verifyUrl)` | Branded contractor job co-sign invite |
| `sendJobMatchEmail` | update | `(contractorEmail, jobId, serviceType, zipCode)` | Notify a contractor of a new job match; trusted-canister-only |
| `getPriceBenchmark` | query | `(serviceType, zipCode)` | Price benchmark lookup |
| `instantForecast` | query | `(address, yearBuilt, sqFt?: Text, state)` | 10-year maintenance forecast |
| `importPermits` | update | `(propertyId, address, lat, lng)` | Fetch + import permits from ArcGIS/OpenPermit |
| `emailUsage` | query | `()` | Resend usage summary |
| `getKeyStatus` | query | `()` | Which API keys are configured |
| `getMetrics` | query | `()` | Canister metrics |

**`sendJobMatchEmail` caller restriction:** only principals added via `addTrustedCanister` or admins may call this. The job canister is wired as a trusted canister during deploy.

**Admin / Lifecycle:** `addAdmin(Principal)` · `setResendApiKey(Text)` · `setResendFromAddress(Text)` · `setOpenPermitApiKey(Text)` · `addTrustedCanister(Principal)` · `removeTrustedCanister(Principal)` · `setUpdateRateLimit(Nat)` · `pause(?Nat)` · `unpause()`
