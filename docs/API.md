# HomeGentic API Reference

All canisters return `Result.Result<T, Error>` on update calls unless noted otherwise.
Every canister exposes a metrics query — `getMetrics()` in most, `metrics()` in agent, audit, bills, fee, listing and referrals — and the admin lifecycle methods listed at the end of each section.

Signatures and query/update types in this file are generated from the Motoko source; the canister's `main.mo` is authoritative if they ever disagree.

**Admin bootstrap.** Except `auth` (whose deployer principal is an install argument), a fresh canister has no admin: `setBootstrapNonce(nonce)` must be called first, then `addAdmin(principal, nonce)` — or `initAdmins(principals, nonce)` on `payment`, `agent` and `fee`. The nonce is single-use. `scripts/deploy.sh` generates one and does this automatically.

---

## Auth Canister

| Method | Type | Signature | Description |
|---|---|---|---|
| `register` | update | `(args: RegisterArgs)` | Register a new user |
| `getProfile` | query | `()` | Get caller's profile |
| `updateProfile` | update | `(args: UpdateArgs)` | Update email / phone |
| `hasRole` | query | `(role: UserRole)` | Check caller's role |
| `recordLogin` | update | `()` | Record a login timestamp |
| `getUserStats` | query | `()` | Aggregate user stats (counts by tier/role) |
| `completeOnboarding` | update | `()` | Mark the caller's onboarding as complete so they are not redirected to the wizard on subsequent logins. |
| `issueAgentSession` | update | `()` | Issue a 24-hour voice-agent session token (`hgs_…`) for the caller, replacing any earlier one. Registered users only (`#NotFound` otherwise). |
| `revokeAgentSession` | update | `()` | Revoke the caller's voice-agent session. |
| `resolveAgentSession` | query | `(token: Text)` | Principal owning a live session token, or null. Called by the voice Worker. |
| `getNotificationContact` | query | `(p: Principal)` | Notifier/admin: `?{ email }` for an active user with an email on file, else null — read by the notification relay to send notification email |
| `addNotifier` / `removeNotifier` | update | `(p: Principal)` | Admin: allow or revoke a principal (the relay's) calling `getNotificationContact` |

**UserRole:** `#Homeowner | #Contractor | #Realtor | #Builder`

**Admin / Lifecycle:** `setUpdateRateLimit(n: Nat)` · `addAdmin(newAdmin: Principal)` · `removeAdmin(target: Principal)` · `pause(durationSeconds: ?Nat)` · `unpause()` · `setAuditCanisterId(id: Principal)` · `getMetrics()`

---

## Property Canister

Owns property registration, ownership verification, transfers, and room/fixture CRUD (merged from old `room` canister).

### Property

| Method | Type | Signature | Description |
|---|---|---|---|
| `registerProperty` | update | `(args: RegisterPropertyArgs)` | Register a new property |
| `getMyProperties` | query | `()` | Caller's properties |
| `getPropertiesByOwner` | query | `(owner: Principal)` | Properties for a given owner |
| `getProperty` | query | `(id: Text)` | Get property by ID |
| `getPropertyOwner` | query | `(id: Text)` | Get property owner principal |
| `getVerificationLevel` | query | `(id: Text)` | Get verification level string |
| `getPropertyLimitForTier` | query | `(tier: SubscriptionTier)` | Max properties allowed for tier |
| `getPendingVerifications` | update | `()` | Admin: list properties awaiting review |
| `submitVerification` | update | `(propertyId: Text, method: Text, documentHash: Text, nameOnDoc: ?Text)` | Homeowner submits for verification |
| `verifyProperty` | update | `(id: Text, level: VerificationLevel, method: ?Text)` | Admin: approve verification |
| `bulkRegisterProperties` | update | `(rows: [RegisterPropertyArgs])` | Admin: bulk seed |
| `isAdminPrincipal` | query | `(p: Principal)` | Check if principal is admin |

### Ownership Transfer

| Method | Type | Signature | Description |
|---|---|---|---|
| `initiateTransfer` | update | `(propertyId: Text)` | Seller generates a bearer token for handing the property to a buyer |
| `claimTransfer` | update | `(token: Text)` | Buyer claims the property with the transfer token |
| `getPendingTransferByToken` | query | `(token: Text)` | Looks up a pending transfer by its bearer token. |
| `cancelTransfer` | update | `(propertyId: Text)` | Cancel a pending transfer |
| `getPendingTransfer` | query | `(propertyId: Text)` | Get pending transfer record |
| `getOwnershipHistory` | query | `(propertyId: Text)` | Full transfer history |

### Rooms & Fixtures

| Method | Type | Signature | Description |
|---|---|---|---|
| `createRoom` | update | `(args: CreateRoomArgs)` | Add a room to a property |
| `getRoom` | query | `(id: Text)` | Get room by ID |
| `getRoomsByProperty` | query | `(propertyId: Text)` | All rooms for a property |
| `updateRoom` | update | `(id: Text, args: UpdateRoomArgs)` | Update room metadata |
| `deleteRoom` | update | `(id: Text)` | Delete a room |
| `addFixture` | update | `(roomId: Text, args: AddFixtureArgs)` | Add a fixture to a room |
| `updateFixture` | update | `(roomId: Text, fixtureId: Text, args: AddFixtureArgs)` | Update a fixture |
| `removeFixture` | update | `(roomId: Text, fixtureId: Text)` | Remove a fixture |
| `getRoomMetrics` | query | `()` | Room/fixture counts |

### Managers & Approvals

| Method | Type | Signature | Description |
|---|---|---|---|
| `inviteManager` | update | `(propertyId: Text, role: ManagerRole, displayName: Text, spendLimitCents: ?Nat)` | Step 1: owner generates a bearer-token invite for a manager. |
| `getManagerInviteByToken` | query | `(token: Text)` | Look up a pending manager invite by token — used by the claim page to display context before the invitee logs in (unauthenticated query). |
| `claimManagerRole` | update | `(token: Text)` | Step 2: invitee claims manager access using the bearer token. |
| `cancelManagerInvite` | update | `(propertyId: Text, token: Text)` | Owner cancels a pending (not yet claimed) invite before it's accepted. |
| `updateManagerRole` | update | `(propertyId: Text, managerPrincipal: Principal, newRole: ManagerRole, newSpendLimitCents: ?Nat)` | Owner changes an existing manager's role and/or spend limit. |
| `removeManager` | update | `(propertyId: Text, managerPrincipal: Principal)` | Owner removes a manager from a property. |
| `resignAsManager` | update | `(propertyId: Text)` | Manager voluntarily removes themselves. |
| `recordManagerActivity` | update | `(propertyId: Text, description: Text)` | Called by a Manager-role user (via the frontend) after completing a significant write action to notify the property owner. |
| `getAccessRole` | query | `(propertyId: Text, principal: Principal)` | Public query: the principal's role on a property, or null when the property doesn't exist. |
| `isAuthorized` | query | `(propertyId: Text, caller: Principal, requireWrite: Bool)` | Public query: returns true if `caller` is the owner OR an authorised manager. |
| `requestApproval` | update | `(propertyId: Text, description: Text, amountCents: Nat)` | Called by a Manager who wants to spend above their limit (or a Viewer requesting an action they can't take directly). |
| `respondToApproval` | update | `(propertyId: Text, approvalId: Nat, approve: Bool)` | Owner approves or declines a pending approval request. |
| `dismissNotifications` | update | `(propertyId: Text)` | Owner dismisses all notifications for a property (marks as seen + clears). |

### Other

| Method | Type | Signature | Description |
|---|---|---|---|
| `getPropertyYearBuilt` | query | `(id: Text)` | Returns the year a property was built, or null if not found. |
| `markIdentityCleared` | update | `(propertyId: Text, sessionId: Text, name: Text)` | Called by the backend webhook handler after Stripe Identity confirms verification. |

**Admin / Lifecycle:** `isAdminPrincipal(p: Principal)` · `setPaymentCanisterId(id: Principal)` · `setUpdateRateLimit(n: Nat)` · `setBootstrapNonce(nonce: Text)` · `addAdmin(newAdmin: Principal, nonce: Text)` · `removeAdmin(target: Principal)` · `setAuditCanisterId(id: Principal)` · `addTrustedCanister(p: Principal)` · `removeTrustedCanister(p: Principal)` · `getTrustedCanisters()` · `pause(durationSeconds: ?Nat)` · `unpause()` · `getMetrics()`

---

## Job Canister

| Method | Type | Signature | Description |
|---|---|---|---|
| `createJob` | update | `(propertyId: Text, title: Text, serviceType: ServiceType, description: Text, contractorName: ?Text, amount: Nat, completedDate: Time.Time, permitNumber: ?Text, warrantyMonths: ?Nat, isDiy: Bool, sourceQuoteId: ?Text)` | Create a maintenance job |
| `getJob` | query | `(jobId: Text)` | Get job by ID |
| `getJobsForProperty` | update | `(propertyId: Text)` | All jobs for a property |
| `getJobsByOwner` | query | `(owner: Principal)` | All jobs for an owner |
| `getJobsPendingMySignature` | query | `()` | Jobs awaiting caller's signature |
| `updateJobStatus` | update | `(jobId: Text, status: JobStatus)` | Update job status |
| `linkContractor` | update | `(jobId: Text, contractorPrincipal: Principal)` | Link a contractor to a job |
| `verifyJob` | update | `(jobId: Text)` | Sign job (homeowner or contractor) |
| `createInviteToken` | update | `(jobId: Text, propertyAddress: Text)` | Generate invite token for contractor |
| `getJobByInviteToken` | query | `(token: Text)` | Preview job via invite token |
| `redeemInviteToken` | update | `(token: Text, contractorName: Text, phone: Text, email: Text, licenseNumber: ?Text)` | Contractor redeems token to link themselves |
| `getCertificationData` | query | `(propertyId: Text)` | Aggregated score + verified job count |
| `createSensorJob` | update | `(propertyId: Text, homeowner: Principal, title: Text, serviceType: ServiceType, description: Text)` | Trusted: auto-create job from IoT event |
| `builderImportJob` | update | `(propertyId: Text, serviceType: ServiceType, contractorName: Text, amount: Nat, completedDate: Time.Time, description: Text, permitNumber: ?Text, warrantyMonths: ?Nat)` | Builder: import a job record |
| `createJobProposal` | update | `(propertyId: Text, title: Text, serviceType: ServiceType, description: Text, contractorName: ?Text, amount: Nat, completedDate: Time.Time, permitNumber: ?Text, warrantyMonths: ?Nat)` | Called by a contractor to propose a completed job for homeowner approval. |
| `approveJobProposal` | update | `(jobId: Text)` | Homeowner approves a pending contractor proposal. |
| `rejectJobProposal` | update | `(jobId: Text)` | Homeowner rejects a pending contractor proposal. |
| `getJobSnapshotsForProperty` | query | `(propertyId: Text)` | Returns a lightweight snapshot of all jobs for a property, suitable for cross-canister consumption by the market canister's computePropertyScore. |
| `getReferralJobs` | update | `()` | Returns all jobs that were sourced via a HomeGentic quote request. |
| `getNotificationEvents` | query | `(afterSeq: Nat, limit: Nat)` | Notifier/admin: notification outbox events after `afterSeq` (max 200), with `latestSeq` — read by the notification relay. See `backend/shared/Notify.mo` |
| `addNotifier` / `removeNotifier` | update | `(p: Principal)` | Admin: allow or revoke a principal (the relay's) reading the outbox |

**JobStatus:** `#Pending | #InProgress | #Completed | #Verified | #PendingHomeownerApproval | #RejectedByHomeowner`

**ServiceType** (shared by job, quote and contractor — `backend/shared/ServiceType.mo`): `#Roofing | #HVAC | #Plumbing | #Electrical | #Painting | #Flooring | #Windows | #Landscaping | #Gutters | #GeneralHandyman | #Pest | #Concrete | #Fencing | #Insulation | #Solar | #Pool | #Foundation | #Drywall | #KitchenRemodel | #BathroomRemodel | #Other`

**Admin / Lifecycle:** `setContractorCanisterId(id: Text)` · `setPropertyCanisterId(id: Text)` · `setPaymentCanisterId(id: Text)` · `addSensorCanister(sensor: Principal)` · `setUpdateRateLimit(n: Nat)` · `setBootstrapNonce(nonce: Text)` · `addAdmin(newAdmin: Principal, nonce: Text)` · `removeAdmin(target: Principal)` · `addTrustedCanister(p: Principal)` · `removeTrustedCanister(p: Principal)` · `getTrustedCanisters()` · `pause(durationSeconds: ?Nat)` · `unpause()` · `getMetrics()`

---

## Contractor Canister

| Method | Type | Signature | Description |
|---|---|---|---|
| `register` | update | `(args: RegisterArgs)` | Register as a contractor; initializes `serviceZips=[]` |
| `getMyProfile` | query | `()` | Caller's contractor profile |
| `getContractor` | query | `(c: Principal)` | Get contractor by principal |
| `getAll` | query | `()` | List all contractors |
| `getBySpecialty` | query | `(s: ServiceType)` | Filter contractors by specialty |
| `getByZip` | query | `(zipCode: Text)` | Contractors who explicitly list that zip code in `serviceZips` |
| `updateProfile` | update | `(args: UpdateArgs)` | Update contractor profile; `UpdateArgs` includes `serviceZips: [Text]` (max 50, each exactly 5 digits) |
| `submitReview` | update | `(contractorPrincipal: Principal, rating: Nat, comment: Text, jobId: Text)` | Submit a review (rate-limited: 10/day/user) |
| `getReviewsForContractor` | query | `(c: Principal)` | All reviews for a contractor |
| `recordJobVerified` | update | `(contractorPrincipal: Principal, jobId: Text, serviceType: Text, homeownerPrincipal: Principal)` | Trusted: increment verified job count |
| `getCredentials` | query | `(contractorPrincipal: Principal)` | Verified job credentials for a contractor |
| `updateNotificationPrefs` | update | `(args: NotificationPrefsArgs)` | Update job-match notification settings; `NotificationPrefsArgs = { notifyEmail: ?Text, notifyPush: ?Bool, alertZips: [Text] }` |
| `verifyContractor` | update | `(c: Principal)` | Admin: mark contractor as verified |
| `createOrLinkGuestProfile` | update | `(contractorPrincipal: Principal, name: Text, phone: Text, email: Text, licenseNumber: ?Text, serviceTypeText: Text, originJobId: Text)` | #518 — Called by the Job canister (cross-canister) when a guest (no-account) contractor redeems an invite token. |
| `getContractorStats` | query | `(p: Principal)` | Lightweight stats query used by the quote canister to check visibility thresholds. |
| `getPage` | query | `(from: Nat, limit: Nat)` | Paginated contractor list |

**ContractorProfile new fields (after #279):** `notifyEmail: ?Text` (override email for alerts; null = use profile email), `notifyPush: ?Bool` (opt-in to new-lead push alerts on the contractor's phones and browsers), `alertZips: [Text]` (subset of serviceZips to receive alerts for; empty = all serviceZips).

**Admin / Lifecycle:** `setJobCanisterId(id: Text)` · `setUpdateRateLimit(n: Nat)` · `setBootstrapNonce(nonce: Text)` · `addAdmin(newAdmin: Principal, nonce: Text)` · `removeAdmin(target: Principal)` · `addTrustedCanister(p: Principal)` · `removeTrustedCanister(p: Principal)` · `getTrustedCanisters()` · `pause(durationSeconds: ?Nat)` · `unpause()` · `getMetrics()`

---

## Quote Canister

### Standard Quotes

| Method | Type | Signature | Description |
|---|---|---|---|
| `createQuoteRequest` | update | `(propertyId: Text, serviceType: ServiceType, description: Text, urgency: UrgencyLevel, zipCode: ?Text, minTrustScore: ?Nat, minJobsCompleted: ?Nat, minReviews: ?Nat, maxBids: ?Nat)` | Create a quote request; `zipCode` restricts visibility to contractors serving that zip |
| `getQuoteRequest` | query | `(requestId: Text)` | Get a request by ID |
| `getOpenRequests` | query | `()` | All open requests unfiltered (contractor view; fast query) |
| `getOpenRequestsForMe` | update | `()` | Open requests filtered to caller's `serviceZips`; contractors with empty `serviceZips` receive all requests; requests with no `zipCode` are always included |
| `getMyQuoteRequests` | query | `()` | Caller's requests |
| `submitQuote` | update | `(requestId: Text, amount: Nat, timeline: Nat, validUntil: Time.Time)` | Contractor submits a bid |
| `getQuotesForRequest` | query | `(requestId: Text)` | All bids on a request |
| `acceptQuote` | update | `(quoteId: Text)` | Homeowner accepts a bid |
| `closeQuoteRequest` | update | `(requestId: Text)` | Close a request without accepting |
| `getNotificationEvents` | query | `(afterSeq: Nat, limit: Nat)` | Notifier/admin: notification outbox events after `afterSeq` (max 200), with `latestSeq` — read by the notification relay. See `backend/shared/Notify.mo` |
| `addNotifier` / `removeNotifier` | update | `(p: Principal)` | Admin: allow or revoke a principal (the relay's) reading the outbox |

### Sealed Bids

| Method | Type | Signature | Description |
|---|---|---|---|
| `createSealedBidRequest` | update | `(propertyId: Text, serviceType: ServiceType, description: Text, urgency: UrgencyLevel, closeAtNs: Time.Time, zipCode: ?Text, minTrustScore: ?Nat, minJobsCompleted: ?Nat, minReviews: ?Nat, maxBids: ?Nat)` | Create a sealed-bid request |
| `submitSealedBid` | update | `(requestId: Text, ciphertext: [Nat8], timelineDays: Nat)` | Contractor submits encrypted bid |
| `getMyBid` | query | `(requestId: Text)` | Caller's sealed bid |
| `revealBids` | update | `(requestId: Text)` | Reveal all bids after close |
| `getRevealedBids` | query | `(requestId: Text)` | All revealed bids |

**UrgencyLevel:** `#Low | #Medium | #High | #Emergency`

### Request management & usage sharing

| Method | Type | Signature | Description |
|---|---|---|---|
| `cancelQuoteRequest` | update | `(requestId: Text)` | Cancel an open or quoted request. |
| `getOpenRequestsPage` | query | `(from: Nat, limit: Nat)` | Paginated open requests |
| `attachUsageSummary` | update | `(requestId: Text, summary: UsageSummary)` | Attach (or replace) utility usage on the caller's own open request. |
| `getUsageSummary` | update | `(requestId: Text)` | Usage attached to a request. |
| `removeUsageSummary` | update | `(requestId: Text)` | Stop sharing usage on the caller's request. |

### Sealed bids (vetKD)

| Method | Type | Signature | Description |
|---|---|---|---|
| `getIbePublicKey` | update | `()` | Returns the canister's BLS12-381 IBE public key for the sealed-bid context. |
| `revealBidsEncrypted` | update | `(requestId: Text, transportPublicKey: Blob)` | Derive the homeowner's IBE private key (encrypted to their transport public key) and return it together with all sealed bids for a request. |

**Admin / Lifecycle:** `setVetkdKeyName(name: Text)` · `getVetkdKeyName()` · `setPaymentCanisterId(id: Principal)` · `setContractorCanisterId(id: Principal)` · `setPropertyCanisterId(id: Principal)` · `setUpdateRateLimit(n: Nat)` · `setBootstrapNonce(nonce: Text)` · `addAdmin(newAdmin: Principal, nonce: Text)` · `removeAdmin(target: Principal)` · `pause(durationSeconds: ?Nat)` · `unpause()` · `getMetrics()`

---

## Payment Canister

Owns subscription management and pricing table (merged from old `price` canister).

| Method | Type | Signature | Description |
|---|---|---|---|
| `subscribe` | update | `(tier: Tier)` | Subscribe to a tier |
| `getMySubscription` | query | `()` | Caller's active subscription |
| `getSubscriptionStats` | query | `()` | Platform-wide subscription counts |
| `getTierForPrincipal` | query | `(p: Principal)` | Look up tier for any principal |
| `getPricing` | query | `(tier: Tier)` | Pricing info for a specific tier |
| `getAllPricing` | query | `()` | Pricing info for all tiers |

**Tier:** `#Free | #Pro | #ContractorFree | #ContractorPro`

`#Pro` ($59/year) is the only purchasable homeowner tier. A principal with
no subscription record is `#Free`. Other canisters read tiers from here via
`getTierForPrincipal`; admins set one with `grantSubscription`.

### Checkout, gifts & agent credits

| Method | Type | Signature | Description |
|---|---|---|---|
| `createStripeCheckoutSession` | update | `(tier: Tier, billing: BillingPeriod, gift: ?GiftMeta)` | Create a Stripe Checkout Session for a subscription upgrade. |
| `verifyStripeSession` | update | `(sessionId: Text)` | Verify a completed Stripe Checkout Session and activate the subscription. |
| `getPriceQuote` | update | `(tier: Tier)` | Returns the subscription price in e8s with a 5% buffer. |
| `cancelSubscription` | update | `()` | Mark the caller's subscription as cancelled-at-end-of-period. |
| `redeemGift` | update | `(giftToken: Text)` | Redeem a pending gift. |
| `adminActivateStripeSubscription` | update | `(userPrincipal: Principal, tier: Tier, months: Nat)` | Called by the Express voice server after Stripe confirms payment. |
| `adminGrantAgentCredits` | update | `(user: Principal, amount: Nat)` | Admin: grant agent credits to a principal after a verified Stripe payment. |
| `consumeAgentCredit` | update | `(user: Principal)` | Admin: atomically decrement 1 agent credit for a user. |
| `configureStripe` | update | `(config: StripeConfig)` | Admin: set Stripe secret key and price IDs |

**Admin / Lifecycle:** `transform(args: OutCall.TransformationInput)` · `setUpdateRateLimit(n: Nat)` · `pause(durationSeconds: ?Nat)` · `unpause()` · `addTrustedCanister(p: Principal)` · `removeTrustedCanister(p: Principal)` · `getTrustedCanisters()` · `setBootstrapNonce(nonce: Text)` · `initAdmins(newAdmins: [Principal], nonce: Text)` · `addAdmin(newAdmin: Principal)` · `removeAdmin(target: Principal)` · `isAdminPrincipal(p: Principal)` · `setAuditCanisterId(id: Principal)` · `setReferralsCanisterId(id: Text)` · `getMetrics()`

---

## Photo Canister

| Method | Type | Signature | Description |
|---|---|---|---|
| `uploadPhoto` | update | `(jobId: Text, propertyId: Text, phase: ConstructionPhase, description: Text, hash: Text, data: [Nat8])` | Upload photo bytes; SHA-256 deduplication enforced |
| `getPhoto` | update | `(photoId: Text)` | Get photo metadata |
| `getPhotoData` | update | `(photoId: Text)` | Get raw photo bytes |
| `getPhotosByJob` | update | `(jobId: Text)` | Photos for a job |
| `getPhotosByRoom` | update | `(roomId: Text)` | Photos for a room |
| `getPhotosByProperty` | update | `(propertyId: Text)` | Photos for a property |
| `getPhotosByPhase` | update | `(jobId: Text, phase: ConstructionPhase)` | Photos filtered by construction phase |
| `verifyPhoto` | update | `(photoId: Text)` | Admin: mark photo as verified |
| `deletePhoto` | update | `(photoId: Text)` | Delete a photo (owner or admin) |
| `getPublicListingPhotos` | query | `(propertyId: Text)` | All photos for a FSBO listing — publicly readable without authentication. |

**Admin / Lifecycle:** `setPaymentCanisterId(id: Principal)` · `setPropertyCanisterId(id: Principal)` · `setUpdateRateLimit(n: Nat)` · `setBootstrapNonce(nonce: Text)` · `addAdmin(newAdmin: Principal, nonce: Text)` · `removeAdmin(target: Principal)` · `setAuditCanisterId(id: Principal)` · `pause(durationSeconds: ?Nat)` · `unpause()` · `getMetrics()`

---

## Report Canister

| Method | Type | Signature | Description |
|---|---|---|---|
| `generateReport` | update | `(propertyId: Text, property: PropertyInput, jobs: [JobInput], recurringServices: [RecurringServiceInput], expiryDays: ?Nat, visibility: VisibilityLevel, rooms: ?[RoomInput], hideAmounts: ?Bool, hideContractors: ?Bool, hidePermits: ?Bool, hideDescriptions: ?Bool, billsSummary: ?BillsSummary)` | Generate an immutable report snapshot and share link |
| `getReport` | update | `(token: Text)` | Fetch report by share token (checks visibility + expiry) |
| `listShareLinks` | update | `(propertyId: Text)` | List all share links for a property |
| `revokeShareLink` | update | `(token: Text)` | Revoke a share link |
| `issueCert` | update | `(propertyId: Text, payload: Text)` | Admin: issue an on-chain certificate |
| `verifyCert` | query | `(certId: Text)` | Verify a certificate by ID |
| `generateRiskProfile` | update | `(propertyId: Text, expiryDays: ?Nat, verificationLevel: Text)` | Generate a time-limited risk profile token. |
| `getRiskProfile` | query | `(token: Text)` | Retrieve a previously generated risk profile by token. |
| `getBillsSummary` | query | `(token: Text)` | The cost summary attached to a report, if the owner included one. |
| `hasActivePublicShareLink` | query | `(propertyId: Text)` | Returns true if the property has at least one active, non-expired share link with Public visibility. |

**VisibilityLevel:** `#Public | #BuyerOnly`

**Admin / Lifecycle:** `setPropertyCanisterId(id: Text)` · `setUpdateRateLimit(n: Nat)` · `setBootstrapNonce(nonce: Text)` · `addAdmin(newAdmin: Principal, nonce: Text)` · `removeAdmin(target: Principal)` · `setAuditCanisterId(id: Principal)` · `addTrustedCanister(p: Principal)` · `removeTrustedCanister(p: Principal)` · `getTrustedCanisters()` · `pause(durationSeconds: ?Nat)` · `unpause()` · `setSensorCanisterId(id: Text)` · `setRiskJobCanisterId(id: Text)` · `getMetrics()`

---

## Market Canister

| Method | Type | Signature | Description |
|---|---|---|---|
| `analyzeCompetitivePosition` | query | `(subject: PropertyJobSummary, comparisons: [PropertyJobSummary])` | ROI-ranked project analysis for a property |
| `recommendValueAddingProjects` | query | `(profile: PropertyProfile, currentJobs: [JobSummary], budget: Nat)` | Top recommended projects (2024 Remodeling Magazine data) |
| `recordMarketSnapshot` | update | `(zipCode: Text, medianSaleCents: Nat, medianDaysOnMarket: Nat, pricePerSqFtCents: Nat, trend: { #Rising; #Stable; #Declining })` | Admin: push a zip-level market snapshot |
| `getMarketSnapshot` | query | `(zipCode: Text)` | Get latest snapshot for a zip code |

### Score (vetKD-encrypted)

| Method | Type | Signature | Description |
|---|---|---|---|
| `computePropertyScore` | update | `(propertyId: Text)` | Compute the composite HomeGentic score (0-100) for a property by fetching its job history and yearBuilt cross-canister, then applying the same maintenance/moder |
| `submitScore` | update | `(jobs: [JobSummary], yearBuilt: Nat, zipCode: Text)` | Homeowner submits their property's job summary; canister computes and stores the composite score. |
| `getMyScoreEncrypted` | update | `(transportPublicKey: Blob)` | Returns the caller's stored score encrypted to their transport public key via vetKeys key derivation. |
| `getNeighborhoodPublicKey` | update | `()` | Returns the canister's vetKeys public key for the neighbourhood score context. |
| `getZipStats` | query | `(zipCode: Text)` | Public zip-level aggregate statistics. |

**Admin / Lifecycle:** `setVetkdKeyName(name: Text)` · `getVetkdKeyName()` · `setPropertyCanisterId(id: Text)` · `setJobCanisterId(id: Text)` · `setUpdateRateLimit(n: Nat)` · `setBootstrapNonce(nonce: Text)` · `addAdmin(newAdmin: Principal, nonce: Text)` · `removeAdmin(target: Principal)` · `pause(durationSeconds: ?Nat)` · `unpause()` · `getMetrics()`

---

## Maintenance Canister

| Method | Type | Signature | Description |
|---|---|---|---|
| `predictMaintenance` | query | `(yearBuilt: Nat, jobs: [JobInput])` | Predict upcoming maintenance tasks for a property |
| `createScheduleEntry` | update | `(propertyId: Text, systemName: Text, taskDescription: Text, plannedYear: Nat, plannedMonth: ?Nat, estimatedCostCents: ?Nat)` | Create a maintenance schedule entry |
| `getScheduleByProperty` | query | `(propertyId: Text)` | All schedule entries for a property |
| `markCompleted` | update | `(entryId: Text)` | Mark a schedule entry as completed |

**Admin / Lifecycle:** `setPropertyCanisterId(id: Principal)` · `setUpdateRateLimit(n: Nat)` · `setBootstrapNonce(nonce: Text)` · `addAdmin(newAdmin: Principal, nonce: Text)` · `removeAdmin(target: Principal)` · `pause(durationSeconds: ?Nat)` · `unpause()` · `getMetrics()`

---

## Sensor Canister

| Method | Type | Signature | Description |
|---|---|---|---|
| `registerDevice` | update | `(propertyId: Text, externalDeviceId: Text, source: DeviceSource, name: Text)` | Register an IoT device for a property |
| `deactivateDevice` | update | `(deviceId: Text)` | Deactivate a device |
| `getDevicesForProperty` | query | `(propertyId: Text)` | All devices for a property |
| `recordEvent` | update | `(externalDeviceId: Text, eventType: SensorEventType, value: Float, unit: Text, rawPayload: Text)` | Gateway: record a sensor event; auto-creates pending job on Critical severity |
| `getEventsForProperty` | update | `(propertyId: Text, limit: Nat)` | Recent events for a property |
| `getPendingAlerts` | update | `(propertyId: Text)` | Unacknowledged critical events |

**Admin / Lifecycle:** `setJobCanisterId(id: Text)` · `setPropertyCanisterId(id: Text)` · `addGateway(gw: Principal)` · `setUpdateRateLimit(n: Nat)` · `setBootstrapNonce(nonce: Text)` · `addAdmin(newAdmin: Principal, nonce: Text)` · `removeAdmin(target: Principal)` · `pause(durationSeconds: ?Nat)` · `unpause()` · `getMetrics()`

---

## Monitoring Canister

| Method | Type | Signature | Description |
|---|---|---|---|
| `recordCanisterMetrics` | update | `(canisterId: Principal, cyclesBalance: Nat, cyclesBurned: Nat, memoryBytes: Nat, memoryCapacity: Nat, requestCount: Nat, errorCount: Nat, avgResponseTimeMs: Nat)` | Push metrics for a canister |
| `recordCallCycles` | update | `(method: Text, cycles: Nat)` | Record cycles consumed by a call |
| `getAllCanisterMetrics` | query | `()` | Metrics for all tracked canisters |
| `calculateCostMetrics` | query | `(userCount: Nat)` | Cost breakdown (storage / compute / network) |
| `calculateProfitability` | query | `(revenue: Float, users: Nat, _activeUsers: Nat)` | ARPU, LTV, CAC, margin |
| `getActiveAlerts` | query | `()` | All unresolved alerts |
| `resolveAlert` | update | `(alertId: Text)` | Mark an alert as resolved |
| `createInfoAlert` | update | `(category: AlertCategory, canisterId: ?Principal, message: Text)` | Admin: fire a manual info-level alert |
| `generateDailyReport` | query | `(bm: BusinessMetrics)` | Render a formatted daily report string |
| `checkCycleLevels` | update | `()` | Query cycle balances for all registered canisters via the IC management canister. |
| `getCriticalCycleAlerts` | query | `()` | Return all unresolved Critical and Warning cycle alerts. |
| `getProductMetrics` | update | `()` | Pull live product metrics from property, job, quote, and payment canisters. |
| `recordFrontendError` | update | `(input: ErrorSummaryInput)` | Record or merge a frontend error summary from the voice server. |
| `resolveFrontendError` | update | `(fingerprint: Text)` | Admin: mark a recorded frontend error resolved |
| `registerCanister` | update | `(id: Principal, name: Text)` | Register a canister for cycle-level polling via checkCycleLevels(). |
| `unregisterCanister` | update | `(id: Principal)` | Remove a canister from the polling registry. |
| `getTrackedCanisters` | query | `()` | Return the current registry of tracked canisters. |

**AlertCategory:** `#Cycles | #ErrorRate | #ResponseTime | #Memory | #Milestone | #TopUp | #Stale`

**Admin / Lifecycle:** `setLowCycleThreshold(threshold: Nat)` · `setProductCanisterIds(prop: Text, job: Text, quote: Text, payment: Text)` · `setUpdateRateLimit(n: Nat)` · `setBootstrapNonce(nonce: Text)` · `addAdmin(newAdmin: Principal, nonce: Text)` · `removeAdmin(target: Principal)` · `pause(durationSeconds: ?Nat)` · `unpause()` · `getMetrics()`

---

## Listing Canister

| Method | Type | Signature | Description |
|---|---|---|---|
| `createBidRequest` | update | `(propertyId: Text, address: Text, city: Text, county: Text, zipCode: Text, homeownerEmail: Text, beds: ?Nat, baths: ?Nat, sqft: ?Nat, targetListDate: Int, desiredSalePrice: ?Nat, notes: Text, windowDays: WindowDays)` | Homeowner creates a listing bid request (FSBO) |
| `getMyBidRequests` | query | `()` | Caller's bid requests |
| `getBidRequest` | query | `(id: Text)` | Get a bid request by ID |
| `cancelBidRequest` | update | `(id: Text)` | Cancel a bid request |
| `getOpenBidRequests` | query | `()` | All open requests (agent view) |
| `submitProposal` | update | `(requestId: Text, commissionBps: Nat, suggestedListCents: Nat, cmaSummary: Text, marketingPlan: Text, marketingCommitments: [Text], estimatedDaysOnMarket: Nat, includedServices: [Text], validUntil: Int, coverLetter: Text)` | Agent submits a listing proposal |
| `getProposalsForRequest` | query | `(requestId: Text)` | All proposals for a request |
| `getMyProposals` | query | `()` | Agent's submitted proposals |
| `acceptProposal` | update | `(proposalId: Text)` | Homeowner accepts an agent proposal |
| `metrics` | query | `()` | Listing canister metrics |

### Proposals & fee

| Method | Type | Signature | Description |
|---|---|---|---|
| `withdrawProposal` | update | `(proposalId: Text)` | Agent withdraws their proposal |
| `postMessage` | update | `(proposalId: Text, rawBody: Text, authorRole: MessageRole)` | Post a message on a proposal's thread |
| `getPlatformFee` | query | `()` | Current Bid to List platform fee, in cents ($399 default) |
| `markListingFeePaid` | update | `(requestId: Text, proposalId: Text)` | Called only from the settled Stripe webhook (via an admin-held identity, never a client). |
| `getCompsMedian` | query | `(zipCode: Text)` | Comparable-sales median for a zip code |

### FSBO listings

| Method | Type | Signature | Description |
|---|---|---|---|
| `activateFsboListing` | update | `(listing: PublicFsboListing)` | Publish or update a public FSBO listing |
| `deactivateFsboListing` | update | `(propertyId: Text)` | Take a FSBO listing down |
| `listActiveFsboListings` | query | `()` | All active public FSBO listings |
| `addListingPhoto` | update | `(propertyId: Text, photoId: Text)` | Attach an uploaded photo to a listing |
| `removeListingPhoto` | update | `(propertyId: Text, photoId: Text)` | Detach a photo from a listing |
| `reorderListingPhotos` | update | `(propertyId: Text, photoIds: [Text])` | Set listing photo order |
| `getListingPhotos` | query | `(propertyId: Text)` | Listing photo IDs in display order |
| `flagPhotoForReview` | update | `(photoId: Text)` | Flag a listing photo for moderation |
| `reviewPhoto` | update | `(photoId: Text)` | Admin: clear a flagged photo |
| `getPhotoReviewState` | query | `(photoId: Text)` | Moderation state of a listing photo |
| `addPanorama` | update | `(propertyId: Text, roomLabel: Text, photoId: Text)` | Attach a 360° panorama to a room |
| `removePanorama` | update | `(propertyId: Text, roomLabel: Text)` | Remove a room's panorama |
| `getPanoramas` | query | `(propertyId: Text)` | All panoramas for a listing |

**Admin / Lifecycle:** `setPropertyCanisterId(id: Text)` · `setJobCanisterId(id: Text)` · `setReportCanisterId(id: Text)` · `setMarketCanisterId(id: Text)` · `setAgentCanisterId(id: Text)` · `setFeeCanisterId(id: Text)` · `setUpdateRateLimit(n: Nat)` · `setBootstrapNonce(nonce: Text)` · `addAdmin(newAdmin: Principal, nonce: Text)` · `removeAdmin(target: Principal)` · `pause(durationSeconds: ?Nat)` · `unpause()` · `metrics()`

---

## Agent Canister

Realtor profiles and performance tracking.

| Method | Type | Signature | Description |
|---|---|---|---|
| `register` | update | `(args: RegisterArgs)` | Register as a realtor agent |
| `getMyProfile` | query | `()` | Caller's agent profile |
| `getProfile` | query | `(agentId: Principal)` | Get agent profile by principal |
| `getAllProfiles` | query | `()` | List all agent profiles |
| `updateProfile` | update | `(args: UpdateArgs)` | Update agent profile |
| `addReview` | update | `(args: AddReviewArgs)` | Submit a review for an agent |
| `getReviews` | query | `(agentId: Principal)` | All reviews for an agent |
| `verifyAgent` | update | `(agentId: Principal)` | Admin: mark agent as verified |
| `recordListingClose` | update | `(agentId: Principal, daysOnMarket: Nat)` | Admin/trusted: record a completed transaction |
| `metrics` | query | `()` | Agent canister metrics |
| `getAgentsForCity` | query | `(city: Text, limit: Nat)` | Cities are matched lowercase; caller passes an already-lowercased city. |
| `getProfilesByCounty` | query | `(county: Text)` | Agent profiles serving a county |
| `isVerifiedAgent` | query | `(principal: Principal)` | Whether a principal is a verified agent |
| `revokeAgent` | update | `(agentId: Principal)` | Withdraw a lapsed/failed licence (admin). |
| `setCardOnFile` | update | `(onFile: Bool)` | Mark the caller's card on file as authorized (A1 step 3). |

**Admin / Lifecycle:** `setListingCanisterId(id: Text)` · `setUpdateRateLimit(n: Nat)` · `setBootstrapNonce(nonce: Text)` · `initAdmins(newAdmins: [Principal], nonce: Text)` · `addAdmin(newAdmin: Principal)` · `removeAdmin(target: Principal)` · `pause(durationSeconds: ?Nat)` · `unpause()` · `metrics()`

---

## Recurring Canister

| Method | Type | Signature | Description |
|---|---|---|---|
| `createRecurringService` | update | `(propertyId: Text, serviceType: RecurringServiceType, providerName: Text, providerLicense: ?Text, providerPhone: ?Text, frequency: Frequency, startDate: Text, contractEndDate: ?Text, notes: ?Text)` | Create a recurring service contract (HVAC, pest, landscaping, etc.) |
| `getRecurringService` | query | `(serviceId: Text)` | Get a service contract by ID |
| `getByProperty` | query | `(propertyId: Text)` | All recurring services for a property |
| `updateStatus` | update | `(serviceId: Text, status: ServiceStatus)` | Update service status |
| `attachContractDoc` | update | `(serviceId: Text, photoId: Text)` | Attach a contract document |
| `addVisitLog` | update | `(serviceId: Text, visitDate: Text, note: ?Text)` | Log a service visit |
| `getVisitLogs` | query | `(serviceId: Text)` | All visit logs for a service |

**Admin / Lifecycle:** `setUpdateRateLimit(n: Nat)` · `setBootstrapNonce(nonce: Text)` · `addAdmin(newAdmin: Principal, nonce: Text)` · `removeAdmin(target: Principal)` · `pause(durationSeconds: ?Nat)` · `unpause()` · `getMetrics()`

---

## Bills Canister

Utility bills and fixed recurring housing costs per property. Tier-gated via `payment`.

| Method | Type | Signature | Description |
|---|---|---|---|
| `addBill` | update | `(args: AddBillArgs)` | Add a bill record for a property. |
| `getBillsForProperty` | update | `(propertyId: Text)` | Return a property's bills: all of them for anyone with a role on the property (owner, co-owner, manager, viewer), otherwise only the caller's own. |
| `getUsageTrend` | update | `(propertyId: Text, billType: BillType, months: Nat)` | Return usage-tracked periods for (propertyId, billType) sorted chronologically, limited to the last `months` months. |
| `deleteBill` | update | `(id: Text)` | Delete a bill. |
| `addRecurringExpense` | update | `(propertyId: Text, fields: RecurringExpenseFields)` | Add a fixed recurring housing cost. |
| `getRecurringExpensesForProperty` | update | `(propertyId: Text)` | Return a property's recurring expenses, oldest start first. |
| `updateRecurringExpense` | update | `(id: Text, fields: RecurringExpenseFields)` | Replace the editable fields of a recurring expense (e.g. |
| `deleteRecurringExpense` | update | `(id: Text)` | Delete a recurring expense. |

**Admin / Lifecycle:** `setPropertyCanisterId(id: Text)` · `setPaymentCanisterId(id: Text)` · `setBootstrapNonce(nonce: Text)` · `addAdmin(newAdmin: Principal, nonce: Text)` · `removeAdmin(target: Principal)` · `pause(durationSeconds: ?Nat)` · `unpause()` · `metrics()`

---

## AI Proxy Canister

Handles IC HTTP outcalls: permit imports (ArcGIS / OpenPermit) and transactional email (Resend). All email methods require the Resend API key to be set via `setResendApiKey`.

| Method | Type | Signature | Description |
|---|---|---|---|
| `sendEmail` | update | `(to: Text, subject: Text, html: Text, text: ?Text, replyTo: ?Text, from: ?Text)` | Send a transactional email via Resend |
| `sendInviteEmail` | update | `(to: Text, contractorName: ?Text, propertyAddress: Text, serviceType: Text, amount: ?Nat, verifyUrl: Text)` | Branded contractor job co-sign invite |
| `sendJobMatchEmail` | update | `(contractorEmail: Text, jobId: Text, serviceType: Text, zipCode: Text)` | Notify a contractor of a new job match; trusted-canister-only |
| `getPriceBenchmark` | query | `(service: Text, zip: Text)` | Price benchmark lookup |
| `instantForecast` | query | `(address: Text, yearBuilt: Nat, state: ?Text, _overrides: Text)` | 10-year maintenance forecast |
| `importPermits` | update | `(address: Text, city: Text, state: Text, zip: Text)` | Fetch + import permits from ArcGIS/OpenPermit |
| `emailUsage` | query | `()` | Resend usage summary |
| `getKeyStatus` | query | `()` | Which API keys are configured |
| `getMetrics` | query | `()` | Canister metrics |
| `checkReport` | query | `(address: Text)` | Whether a HomeGentic report exists for an address |
| `requestReport` | update | `(address: Text, _buyerEmail: Text)` | Buyer requests a report for an address |
| `lookupPropertyDetails` | update | `(address: Text, city: Text, state: Text, zip: Text)` | Public-record property details (HTTP outcall) |
| `lookupYearBuilt` | query | `(address: Text)` | Cached year-built lookup for an address |
| `health` | query | `()` | Health check |

**`sendJobMatchEmail` caller restriction:** only principals added via `addTrustedCanister` or admins may call this. The job canister is wired as a trusted canister during deploy.

**Admin / Lifecycle:** `transformResponse(args: TransformArgs)` · `setBootstrapNonce(nonce: Text)` · `addAdmin(newAdmin: Principal, nonce: Text)` · `removeAdmin(target: Principal)` · `setResendApiKey(key: Text)` · `setOpenPermitApiKey(key: Text)` · `setAttomApiKey(key: Text)` · `setResendFromAddress(addr: Text)` · `addTrustedCanister(p: Principal)` · `removeTrustedCanister(p: Principal)` · `getTrustedCanisters()` · `setUpdateRateLimit(n: Nat)` · `pause(durationSeconds: ?Nat)` · `unpause()` · `getMetrics()`

---

## Fee Canister

Bid to List platform-fee ledger. A fee is recorded Owed when a homeowner accepts a proposal and becomes Paid only on a settled Stripe webhook, which is also what releases identities in `listing`.

| Method | Type | Signature | Description |
|---|---|---|---|
| `recordFeeOwed` | update | `(requestId: Text, proposalId: Text, agentId: Principal, homeownerId: Principal, amountCents: Nat)` | Create a fee-owed record on selection. |
| `markFeeInvoiced` | update | `(feeId: Text)` | Admin: mark a fee invoiced |
| `markFeePaid` | update | `(feeId: Text)` | Called only from the settled Stripe webhook (via an admin-held identity). |
| `waiveFee` | update | `(feeId: Text)` | 30-day "we did not sign" refund path (H6 / A3's stated refund term). |
| `getMyFees` | query | `()` | Caller's fee records (agent) |
| `getAllFees` | query | `()` | Admin: all fee records |
| `getFeesDue` | query | `()` | Admin: fees still Owed or Invoiced |

**Admin / Lifecycle:** `setListingCanisterId(id: Text)` · `setUpdateRateLimit(n: Nat)` · `setBootstrapNonce(nonce: Text)` · `initAdmins(newAdmins: [Principal], nonce: Text)` · `addAdmin(newAdmin: Principal)` · `removeAdmin(target: Principal)` · `pause(durationSeconds: ?Nat)` · `unpause()` · `metrics()`

---

## Referrals Canister

Shareable referral codes (`HG-000001`) and $10 credits for both sides once the referee completes a first paid month.

| Method | Type | Signature | Description |
|---|---|---|---|
| `getMyCode` | update | `()` | Get (or lazily create) the caller's unique referral code. |
| `useReferralCode` | update | `(code: Text)` | Record that the caller is signing up via `code`. |
| `markConverted` | update | `(referee: Principal)` | Mark a referee as converted (first paid month complete). |
| `getMyReferrals` | query | `()` | All referrals made by the caller (people who used their code). |
| `getCreditBalance` | query | `()` | Credit balance in cents (1000 = $10.00). |

**Admin / Lifecycle:** `setPaymentCanisterId(id: Text)` · `setBootstrapNonce(nonce: Text)` · `addAdmin(p: Principal, nonce: Text)` · `pause(durationSeconds: ?Nat)` · `unpause()` · `metrics()`

---

## Audit Canister

Append-only log of privileged actions. Source canisters call `log()` fire-and-forget after admin operations; reads are admin-only and entries can never be edited or deleted.

| Method | Type | Signature | Description |
|---|---|---|---|
| `log` | update | `(canister: Text, action: Text, subject: ?Principal, detail: Text)` | Append a new audit entry. |
| `getEntries` | update | `(from: Nat, limit: Nat)` | Paginated read. |
| `getEntriesByCallerAndAction` | update | `(target: Principal, action: Text)` | Filtered read by the source caller principal and action string. |

**Admin / Lifecycle:** `setBootstrapNonce(nonce: Text)` · `addAdmin(newAdmin: Principal, nonce: Text)` · `removeAdmin(target: Principal)` · `addTrustedCanister(canisterId: Principal)` · `metrics()`
