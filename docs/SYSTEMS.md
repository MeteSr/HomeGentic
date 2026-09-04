# HomeGentic — System Reference

In-depth technical documentation for every backend canister and the voice agent server. Each section covers data types, entity lifecycle, role-based access control, rate limits, cross-canister dependencies, and notable business rules.

For a high-level overview see `ARCHITECTURE.md`. For public API signatures see `API.md`.

---

## Table of Contents

1. [Common Patterns](#common-patterns)
2. [Auth](#1-auth)
3. [Property](#2-property)
4. [Job](#3-job)
5. [Photo](#4-photo)
6. [Quote & Sealed Bids](#5-quote--sealed-bids)
7. [Contractor](#6-contractor)
8. [Payment](#7-payment)
9. [Report](#8-report)
10. [Market](#9-market)
11. [Maintenance](#10-maintenance)
12. [Sensor](#11-sensor)
13. [Listing & Agent Marketplace](#12-listing--agent-marketplace)
14. [Agent Profiles](#13-agent-profiles)
15. [Recurring Services](#14-recurring-services)
16. [Bills](#15-bills)
17. [Monitoring](#16-monitoring)
18. [Voice Agent Server](#17-voice-agent-server)

---

## Common Patterns

All 17 canisters share the following infrastructure.

### Stable Storage

Every canister uses `persistent actor` (Motoko `mo:core`). All variables are implicitly stable — no `preupgrade`/`postupgrade` hooks needed. `transient var` is used for in-memory structures that reset on upgrade (e.g. rate-limit sliding windows, caller-guard sets).

### Anonymous Rejection

The `system func inspect` entry point rejects all anonymous callers and zero-byte payloads before function execution. This prevents cycle-drain probes from reaching actor logic.

### Rate Limiting

Every canister enforces a per-principal update-call rate limit.

- Default: **30 calls/min** per principal
- Window: 60-second rolling window tracked in a `transient Map<Principal, (count, windowStart)>`
- Admin principals and registered trusted canisters bypass the limit
- Configurable via `setUpdateRateLimit(n)` (admin-only); pass `0` to disable
- Window resets automatically — callers are never permanently blocked

### Admin Bootstrap

Admins are stored as a stable `[Principal]` array. The first call to `addAdmin()` always succeeds regardless of caller (bootstrap). Subsequent calls require an existing admin. All canisters accept `pause(durationSeconds?)` and `unpause()` from admins; a pause with an optional expiry auto-lifts without needing a manual unpause.

### Trusted Canisters

Canisters that need to call each other at high frequency (e.g. job ↔ contractor) can be registered via `addTrustedCanister(p)`. Trusted principals bypass the per-minute rate limit.

### Tier Enforcement Pattern

Canisters that enforce subscription limits follow this lookup order:
1. If a payment canister ID has been wired via `setPaymentCanisterId()`, call `getTierForPrincipal(caller)` asynchronously.
2. Otherwise, use the local `tierGrants` map (admin-managed via `setTier(user, tier)`).

This allows canisters to function in development without a deployed payment canister.

### Error Variants

All canisters expose a `Result<T, Error>` return type. The `Error` variant always includes at minimum:
- `#NotFound`
- `#Unauthorized` / `#NotAuthorized`
- `#InvalidInput(Text)` — carries a human-readable message

---

## 1. Auth

**File:** `backend/auth/main.mo`

Manages user profiles and role assignment. The single source of truth for who is registered on the platform.

### Data Types

| Type | Fields |
|------|--------|
| `UserRole` | `#Homeowner \| #Contractor \| #Realtor \| #Builder` |
| `UserProfile` | `principal, role, email, phone, createdAt, updatedAt, isActive, lastLoggedIn?, onboardingComplete?` |
| `Metrics` | `totalUsers`, counts by role, `isPaused` |
| `UserStats` | New today/week, active this week, counts by role |
| `Error` | `#NotFound \| #AlreadyExists \| #NotAuthorized \| #Paused \| #InvalidInput(Text)` |

The `onboardingComplete` field is `?Bool` (null = false) for upgrade-safe backward compatibility.

### Entity Lifecycle

1. **Registration** — `register()` creates a profile with `isActive=true`, `lastLoggedIn=null`, `onboardingComplete=null`. Role is set at creation and **never changes**.
2. **First Session** — frontend calls `recordLogin()`, which sets `lastLoggedIn` to now. Silent no-op if principal is not registered.
3. **Onboarding** — frontend calls `completeOnboarding()`, which sets `onboardingComplete=true`. Idempotent.
4. **Profile Updates** — `updateProfile()` allows changes to `email` and `phone` only; `updatedAt` is refreshed.
5. **Deletion** — There is no delete function. Profiles are permanent.

### Role-Based Access

| Function | Who |
|----------|-----|
| `register()`, `updateProfile()`, `recordLogin()`, `completeOnboarding()` | Authenticated caller (self) |
| `getProfile()`, `hasRole()` | Self only |
| `getUserStats()`, `getMetrics()` | Public (no auth) |
| `setUpdateRateLimit()`, `addAdmin()`, `pause()`, `unpause()` | Admin |

### Validation

- **Email** (if non-empty): max 254 chars, must contain `@`, no spaces
- **Phone** (if non-empty): max 30 chars
- **Duplicate registration**: returns `#AlreadyExists`

### Cross-Canister Dependencies

None. Auth is standalone.

---

## 2. Property

**File:** `backend/property/main.mo`

Manages property registration, ownership verification, ownership transfers, delegated managers, and room/fixture records. Also serves as the authorization oracle for all other canisters via `isAuthorized()`.

### Data Types

| Type | Fields / Values |
|------|-----------------|
| `PropertyType` | `#SingleFamily \| #Condo \| #Townhouse \| #MultiFamily` |
| `VerificationLevel` | `#Unverified \| #PendingReview \| #Basic \| #Premium` |
| `SubscriptionTier` | `#Free \| #Basic \| #Pro \| #Premium \| #ContractorFree \| #ContractorPro` |
| `Property` | `id, owner, address, city, state, zipCode, propertyType, yearBuilt, squareFeet, verificationLevel, verificationDate?, verificationMethod?, verificationDocHash?, tier, createdAt, updatedAt, isActive` |
| `PropertyManager` | `principal, role (#Viewer \| #Manager), displayName, addedAt` |
| `ManagerInvite` | `token, propertyId, role, displayName, invitedBy, createdAt, expiresAt` |
| `OwnerNotification` | `id, managerPrincipal, managerName, description, timestamp, seen` |
| `TransferRecord` | `propertyId, from, to, timestamp, txHash` |
| `PendingTransfer` | `propertyId, from, token, initiatedAt, expiresAt` |
| `RoomRecord` | `id, propertyId, owner, name, floorName, floorType, paintColor, paintBrand, paintCode, notes, fixtures[], createdAt, updatedAt` |
| `Fixture` | `id, brand, model, serialNumber, installedDate, warrantyExpiry, notes` |
| `Error` | `#NotFound \| #NotAuthorized \| #Paused \| #LimitReached \| #InvalidInput(Text) \| #DuplicateAddress \| #AddressConflict(Int)` |

### Property Lifecycle

```
registerProperty()            → #Unverified
submitVerification()          → #PendingReview
verifyProperty() [admin]      → #Basic or #Premium  (or back to #Unverified on rejection)
initiateTransfer() + claimTransfer()  → owner changes, TransferRecord appended (immutable)
isActive flag                 → soft-delete; property never hard-deleted
```

**Duplicate Address Conflict Window (7 days)**

When User A registers an address, a 7-day window opens. During this window, User B's attempt to register the same address returns `#AddressConflict(expiryTimestamp)`. After the window, User B can register and displaces User A in the address index. Whichever owner first reaches `#Basic` or `#Premium` verification locks the address permanently — subsequent registrations then return `#DuplicateAddress`.

### Manager Lifecycle

```
inviteManager(role, displayName)  → bearer token (expires 90 days)
claimManagerRole(token)           → principal added as PropertyManager
#Viewer role: read-only operations
#Manager role: write operations (rooms, fixtures, activity logging)
removeManager() / resignAsManager()
```

Manager activity (write ops) pushes `OwnerNotification` records to the owner's queue. `dismissNotifications()` clears the entire queue.

### Tier-Based Property Limits

| Tier | Max Properties |
|------|----------------|
| Free | 0 (blocked) |
| Basic | 1 |
| Pro | 5 |
| Premium | 20 |
| ContractorFree | 0 |
| ContractorPro | Unlimited |

Limits are checked at registration time only. Existing properties are not revoked if the user downgrades.

### Role-Based Access

| Operation | Who |
|-----------|-----|
| `registerProperty()` | Any authenticated; tier-enforced |
| `submitVerification()` | Property owner |
| `verifyProperty()`, `bulkRegisterProperties()` | Admin |
| `getMyProperties()` | Owner (authenticated) |
| `getPropertiesByOwner()`, `getProperty()`, `getVerificationLevel()`, `getPropertyOwner()`, `isAuthorized()` | Public (no auth) |
| `initiateTransfer()`, `inviteManager()` | Property owner |
| `claimTransfer()`, `claimManagerRole()` | Any authenticated (bearer token) |
| `getPropertyManagers()`, `getOwnerNotifications()`, `dismissNotifications()` | Owner |
| `recordManagerActivity()` | Manager with `#Manager` role |
| Room/Fixture CRUD | Owner or `#Manager` manager |
| `setTier()`, `setPaymentCanisterId()`, `addAdmin()` | Admin |

### Validation Constraints

| Field | Rule |
|-------|------|
| Address | 1–500 chars, required |
| City | 1–100 chars, required |
| State | Exactly 2 uppercase letters |
| Zip | 5 digits or ZIP+4 format |
| Square feet | 1–100,000 |
| Year built | 1600 – current year |
| Room notes | 0–2,000 chars |
| Fixture brand/model/serial | 0–100 chars each |

### Cross-Canister Dependencies

Property is a dependency of almost every other canister but makes only one outbound call:

| Called By | Function | Purpose |
|-----------|----------|---------|
| Property → Payment | `getTierForPrincipal()` | Enforce property count limits at registration |
| Job, Photo, Quote, Maintenance → Property | `isAuthorized()` | Check write permission for any property operation |
| Job, Sensor → Property | `getPropertyOwner()` | Identify homeowner for sensor-triggered jobs |
| Report → Property | `getVerificationLevel()` | Gate share-link issuance |

### Notable Edge Cases

- **Bearer token non-sequentiality** — Transfer and invite tokens use `timestamp + counter`; nanosecond resolution makes them effectively unguessable.
- **Builder bulk import** — `bulkRegisterProperties()` bypasses per-owner tier limits and starts each unit at `#Unverified`. Soft-fails on duplicates (partial success).
- **Soft delete** — `isActive=false` hides a property from `getMyProperties()` but preserves the record for audit and data recovery.

---

## 3. Job

**File:** `backend/job/main.mo`

The maintenance record canister. Every verified job contributes to a property's HomeGentic score and unlocks a verified-history report.

### Data Types

| Type | Fields / Values |
|------|-----------------|
| `ServiceType` | `#Roofing \| #HVAC \| #Plumbing \| #Electrical \| #Painting \| #Flooring \| #Windows \| #Landscaping` |
| `JobStatus` | `#Pending \| #InProgress \| #Completed \| #Verified \| #PendingHomeownerApproval \| #RejectedByHomeowner` |
| `Job` | `id, propertyId, homeowner, contractor?, title, serviceType, description, contractorName?, amount (cents), completedDate, permitNumber?, warrantyMonths?, isDiy, status, verified, homeownerSigned, contractorSigned, createdAt, sourceQuoteId?` |
| `InviteToken` | `token, jobId, propertyAddress, createdAt, expiresAt (48h), usedAt?` |
| `InvitePreview` | Subset of job+token: jobId, title, serviceType, description, amount, completedDate, propertyAddress, contractorName, expiresAt, alreadySigned |
| `Error` | `#NotFound \| #Unauthorized \| #InvalidInput(Text) \| #AlreadyVerified \| #TierLimitReached(Text)` |

### Verification Model

Two paths to a fully verified job (`verified=true`):

**DIY (homeowner-only):**
- `contractorSigned` pre-set to `true` on creation
- Homeowner calls `verifyJob()` → `homeownerSigned=true` → fully verified

**Contractor (dual-signature):**
- Neither party pre-signed
- Either party may sign first via `verifyJob()`
- Both must sign before `verified=true`
- A contractor without a HomeGentic account can sign via a bearer `InviteToken` (48-hour TTL, single-use)

### Job Lifecycle

```
createJob(isDiy=true/false)        → #Pending
linkContractor(jobId, principal)   → contractor field set (non-DIY only)
verifyJob()                        → one or both sides sign
  → both signed or isDiy+owner     → #Verified, verified=true
                                   → notifies contractor canister (recordJobVerified)
                                   → referral fee triggered if sourceQuoteId is set

Alternative: createJobProposal()   [by contractor]
  → #PendingHomeownerApproval
approveJobProposal()               → #Pending (both sides already signed)
rejectJobProposal()                → record deleted (no audit trail)

Builder import: builderImportJob() → #Verified immediately (attestation by builder)
Sensor-triggered: createSensorJob()→ #Pending, isDiy=false, amount=0
```

### Role-Based Access

| Function | Who |
|----------|-----|
| `createJob()` | Any authenticated; Free tier blocked |
| `updateJobStatus()`, `linkContractor()`, `createInviteToken()`, `approveJobProposal()`, `rejectJobProposal()` | Property owner or manager |
| `verifyJob()` | Property owner OR linked contractor |
| `redeemInviteToken()` | Any caller (token is credential) |
| `createJobProposal()` | Any contractor (validated against property owner cross-canister) |
| `getJobsByOwner()` | Unauthenticated (data portability) |
| `getJobsPendingMySignature()` | Authenticated contractors |
| `createSensorJob()` | Authorized sensor canister principals or admin |
| `builderImportJob()`, `setContractorCanisterId()`, `setPropertyCanisterId()`, `setPaymentCanisterId()` | Admin |

### Tier Enforcement

- Free tier: `createJob()` blocked ("Job creation requires an active subscription. Subscribe to Basic ($10/mo)")
- If caller is a delegated manager, tier is looked up for the property owner, not the manager

### Cross-Canister Dependencies

| Direction | Canister | Function | Purpose |
|-----------|----------|----------|---------|
| Job → Property | `isAuthorized()`, `getPropertyOwner()` | Auth checks and ownership verification |
| Job → Payment | `getTierForPrincipal()` | Tier check on `createJob()` |
| Job → Contractor | `recordJobVerified()` | Bump trust score and mint credential on verification |

### Notable Edge Cases

- **Max amount** — capped at `$1,000,000` (100,000,000 cents) to prevent storage bloat.
- **Proposal rejection cleanup** — Rejected proposals are hard-deleted; no audit trail retained.
- **Builder attestation** — Post-transfer, `homeowner` field won't match the new buyer; `verified=true` is the canonical signal for downstream readers (e.g. Report canister).
- **Referral fee** — Only triggered when `sourceQuoteId` is set AND `verified=true`. Sourced-but-unverified jobs do not earn fees.

---

## 4. Photo

**File:** `backend/photo/main.mo`

Stores raw image bytes on-chain with SHA-256 deduplication and tier-based upload quotas. Also handles FSBO listing photos (publicly readable) and room photos.

### Data Types

| Type | Fields / Values |
|------|-----------------|
| `ConstructionPhase` | `PreConstruction \| Foundation \| Framing \| Electrical \| Plumbing \| HVAC \| Insulation \| Drywall \| Finishing \| PostConstruction \| Warranty \| Listing` |
| `Photo` | `id, jobId, propertyId, owner, phase, description, hash (SHA-256 hex), data ([Nat8]), size, verified, approvals[], createdAt` |
| `Error` | `#NotFound \| #Unauthorized \| #QuotaExceeded(Text) \| #Duplicate(Text) \| #InvalidInput(Text)` |

**Synthetic job ID conventions** (enforced by frontend, not canister):
- `"LISTING_<propertyId>"` — FSBO listing photos (publicly readable)
- `"ROOM_<roomId>"` — room-specific photos (owner-restricted)

### Upload Lifecycle

1. `uploadPhoto(jobId, propertyId, phase, description, hash, data)` — caller becomes owner
2. Canister checks SHA-256 `hash` against `hashIndex`; returns `#Duplicate(existingId)` if already stored
3. Tier quota checked (per job and per property); see table below
4. On success, photo stored and hash indexed

**Tier Quotas**

| Tier | Max per Job | Max per Property |
|------|-------------|-----------------|
| Free | 0 (blocked) | 0 (blocked) |
| ContractorFree / Basic | 5 | 25 |
| Pro | 10 | 100 |
| Premium | 30 | Unlimited |
| ContractorPro | 50 | Unlimited |

**Additional rate limit:** 10 photo uploads per minute per principal (hardcoded, independent of tier).

### Approval Model

`verifyPhoto(photoId)` adds the caller to the `approvals[]` array and sets `verified=true` on first call. Idempotent. Multiple approvals are additive (homeowner, inspector, contractor can all sign). There is no way to remove an approval.

### Role-Based Access

| Function | Who |
|----------|-----|
| `uploadPhoto()` | Any authenticated; tier quota enforced |
| `getPhoto()`, `getPhotoData()`, `getPhotosByJob()`, `getPhotosByProperty()` | Owner (or property auth check) |
| `verifyPhoto()`, `deletePhoto()` | Owner or admin (property auth check) |
| `getPublicListingPhotos()` | **No auth required** (FSBO buyer browsing) |
| `setTier()`, `setPaymentCanisterId()`, `setPropertyCanisterId()` | Admin |

### Cross-Canister Dependencies

| Direction | Canister | Purpose |
|-----------|----------|---------|
| Photo → Property | `isAuthorized()` | Auth check on reads, verify, delete |
| Photo → Property | `getPropertyOwner()` | Manager tier bypass on upload |
| Photo → Payment | `getTierForPrincipal()` | Quota enforcement |

### Notable Edge Cases

- **Inline storage** — Raw bytes are stored in canister stable memory. Large images directly increase `Metrics.totalStorageBytes` and canister cycle costs.
- **Hash deduplication is global** — The same image cannot be uploaded twice across any job or property, even by different users.
- **Property canister traps if unset** — Unlike other canisters, Photo traps (halts) if `propCanisterId` is unset and a non-admin calls a protected function. Auth must not silently degrade.

---

## 5. Quote & Sealed Bids

**File:** `backend/quote/main.mo`

Connects homeowners seeking contractor services with contractors who bid. Supports both open bidding (amounts visible to homeowner immediately) and sealed-bid auctions (amounts encrypted until after deadline).

### Data Types

| Type | Fields / Values |
|------|-----------------|
| `ServiceType` | `#Roofing \| #HVAC \| #Plumbing \| #Electrical \| #Painting \| #Flooring \| #Windows \| #Landscaping` |
| `UrgencyLevel` | `#Low \| #Medium \| #High \| #Emergency` |
| `QuoteRequest` | `id, propertyId, homeowner, serviceType, description, urgency, status, zipCode?, createdAt, closeAt?` |
| `RequestStatus` | `#Open \| #Quoted \| #Accepted \| #Closed \| #Cancelled` |
| `Quote` | `id, requestId, contractor, amount (cents), timeline (days), validUntil, status` |
| `QuoteStatus` | `#Pending \| #Accepted \| #Rejected \| #Expired` |
| `SealedBid` | `id, requestId, contractor, ciphertext ([Nat8]), timelineDays, submittedAt` |
| `RevealedBid` | `id, requestId, contractor, amountCents, timelineDays, submittedAt, isWinner` |

### Standard Quote Lifecycle

```
createQuoteRequest()          → #Open
submitQuote() [contractor]    → first bid: #Open → #Quoted; subsequent: #Quoted
acceptQuote() [homeowner]     → accepted quote → #Accepted; all others → #Rejected; request → #Accepted
closeQuoteRequest()           → #Closed (no bid selected)
cancelQuoteRequest()          → #Cancelled (bidder principals returned for notification)
```

**Best-value ranking** displayed to homeowner: 55% price rank + 45% contractor trust score.

### Sealed-Bid Lifecycle

```
createSealedBidRequest(..., closeAtNs)   → #Open with bid window
submitSealedBid(requestId, ciphertext)   → rejected if Time.now() >= closeAt
                                         → contractor can resubmit (overwrites)
revealBids(requestId) [homeowner only]   → rejected if Time.now() < closeAt
                                         → decrypts all ciphertexts
                                         → marks lowest-price bid isWinner=true
                                         → idempotent (cached on second call)
acceptQuote() [homeowner]                → standard acceptance flow
```

In production, ciphertexts are IBE-encrypted via vetKeys. In local dev, the ciphertext is the little-endian Nat8 encoding of the amount.

### Tier-Based Open Request Limits

| Tier | Concurrent Open Requests |
|------|--------------------------|
| Basic | 3 |
| Pro | 10 |
| Premium | 10 |
| ContractorFree / ContractorPro | Unlimited (999,999) |

**Manager bypass:** If the caller is a delegated manager, the property owner's tier is used.

### Role-Based Access

| Function | Who |
|----------|-----|
| `createQuoteRequest()`, `createSealedBidRequest()` | Homeowner; tier-enforced |
| `acceptQuote()`, `closeQuoteRequest()`, `cancelQuoteRequest()`, `revealBids()` | Homeowner |
| `getMyQuoteRequests()` | Homeowner |
| `submitQuote()`, `submitSealedBid()` | Any contractor (20 submissions/day limit) |
| `getMyBid()` | Contractor (own sealed bids only) |
| `getOpenRequests()` | Any authenticated (contractor marketplace view; unfiltered, fast query) |
| `getOpenRequestsForMe()` | Any contractor (filtered by caller's `serviceZips`; update call — cross-calls contractor canister) |
| `getQuotesForRequest()` | Homeowner of that request |
| `setPaymentCanisterId()`, `setPropertyCanisterId()`, `setContractorCanisterId()` | Admin |

### Rate Limits

- Contractor quote submissions: **20 per day** (24-hour rolling window)
- Update calls: **30 per minute** per principal (standard)

---

## 6. Contractor

**File:** `backend/contractor/main.mo`

Manages contractor profiles, trust scores, job credentials, and reviews.

### Data Types

| Type | Fields / Values |
|------|-----------------|
| `ServiceType` | 16 categories: Roofing, HVAC, Plumbing, Electrical, Painting, Flooring, Windows, Landscaping, Gutters, GeneralHandyman, Pest, Concrete, Fencing, Insulation, Solar, Pool |
| `ContractorProfile` | `id (Principal), name, specialties[], email, phone (E.164), bio?, licenseNumber?, serviceArea?, serviceZips[] (5-digit codes; empty = all zips), trustScore (70→100), jobsCompleted, isVerified, createdAt` |
| `JobCredential` | `id (sequential), jobId, contractorId, serviceType (Text), verifiedAt, homeownerPrincipal` |
| `Review` | `id, contractor, reviewer, rating (1–5), comment (1–2000 chars), jobId (composite dedup key), createdAt` |

### Trust Score

- Starts at **70** on registration
- **+2 per verified job** (capped at 100)
- Monotonically increasing; no decay
- Updated only by the job canister calling `recordJobVerified()` (cross-canister, guarded)

### Entity Lifecycle

```
register()                 → profile created, trustScore=70, jobsCompleted=0, isVerified=false
updateProfile()            → mutable fields updated; trustScore/jobsCompleted/verification preserved
Job canister recordJobVerified() → jobsCompleted++, trustScore+2 (max 100), JobCredential minted
Admin verifyContractor()   → isVerified=true
submitReview() [any user]  → composite dedup: reviewerPrincipal|jobId must be unique; 10/day limit
```

### Role-Based Access

| Function | Who |
|----------|-----|
| `register()`, `updateProfile()` | Self (msg.caller) |
| `submitReview()` | Any authenticated; 10/day per reviewer; composite dedup on reviewer+jobId |
| `getContractor()`, `getAll()`, `getReviewsForContractor()`, `getCredentials()` | Public |
| `recordJobVerified()` | Job canister or admin |
| `verifyContractor()`, `setJobCanisterId()` | Admin |

### Validation

| Field | Rule |
|-------|------|
| Name | 1–200 chars |
| Email | 1–254 chars, contains `@`, no spaces |
| Phone | E.164 format (`+` followed by 7–15 digits) |
| Specialties | 1–10 service types |
| `serviceZips` | 0–50 entries; each must be exactly 5 decimal digits |
| Comment | 1–2,000 chars |
| Rating | 1–5 |

### Key Query Functions

| Function | Type | Description |
|----------|------|-------------|
| `getBySpecialty(ServiceType)` | query | Returns contractors matching a single specialty |
| `getByZip(zipCode: Text)` | query | Returns contractors whose `serviceZips` includes `zipCode`; contractors with empty `serviceZips` are not returned |

### Cross-Canister Dependencies

- **Job canister** calls `recordJobVerified()` after a job reaches `verified=true`. The call is fire-and-forget (errors ignored); job verification already committed before the call is made.
- **Quote canister** calls `getContractor(caller)` inside `getOpenRequestsForMe()` to look up the contractor's `serviceZips` for filtering. If the contractor canister is not configured (`contrCanisterId` empty) or returns an error, all open requests are returned unfiltered.

---

## 7. Payment

**File:** `backend/payment/main.mo`

The subscription tier authority. All other canisters ultimately defer to this canister for the effective tier of a principal.

### Data Types

| Type | Fields / Values |
|------|-----------------|
| `Tier` | `#Free \| #Basic \| #Pro \| #Premium \| #ContractorFree \| #ContractorPro \| #RealtorFree \| #RealtorPro` |
| `BillingPeriod` | `#Monthly \| #Yearly` |
| `Subscription` | `owner, tier, expiresAt (0=never), createdAt, cancelledAt?` |
| `PendingGift` | `giftToken, tier, billing, recipientEmail, recipientName, senderName, giftMessage, deliveryDate, createdAt, redeemedBy?` |
| `AgentCreditBalance` | `balance (Nat), expiresAt` |
| `PricingInfo` | `tier, priceUSD, periodDays, propertyLimit, photosPerJob, quoteRequestsPerMonth` |
| `SubscriptionStats` | Counts by tier, `activePaid`, `estimatedMrrUsd` |

### Tier Pricing

| Tier | Monthly Price | Properties | Photos/Job | Open Quotes |
|------|---------------|------------|------------|-------------|
| Basic | $10 | 1 | 5 | 3 |
| Pro | $20 | 5 | 10 | 10 |
| Premium | $40 | 20 | 30 | Unlimited |
| ContractorFree | $0 | 0 | 5 | Unlimited |
| ContractorPro | $40 | 0 | 50 | Unlimited |
| RealtorFree | $0 | 0 | 5 | Unlimited |
| RealtorPro | $30 | 0 | 50 | Unlimited |

Annual billing: 365-day expiry (equivalent to 2 free months vs. monthly).

### Subscription Lifecycle

**Stripe path:**
```
createStripeCheckoutSession(tier, billing) → Stripe checkout URL
User pays on Stripe
verifyStripeSession(sessionId)             → subscription created; tier propagated downstream
```

**Direct ICP path:**
```
getPriceQuote(tier)                  → e8s amount with 5% buffer
Frontend: icrc2_approve(ledger, amount)
subscribe(tier)                      → fetches fresh rate; icrc2_transfer_from; creates subscription; propagates tier
```

**Gift path:**
```
createStripeCheckoutSession(tier, billing, gift=?meta) → Stripe checkout URL
verifyStripeSession(sessionId)                         → creates PendingGift (not Subscription)
Recipient: redeemGift(giftToken)                       → Subscription created for caller; gift marked redeemed
```

**Cancellation:**
```
cancelSubscription() → cancelledAt=now; tier revoked to Free immediately; access retained until expiresAt
```

**Expiry** is checked lazily: `getTierForPrincipal()` returns `#Free` if `expiresAt > 0 && expiresAt <= now`. No background cleanup job.

### Tier Propagation

After any subscription change, `propagateTier(principal, tier)` is called on all three downstream canisters (property, quote, photo) via `setTier(user, tier)`. Errors are swallowed — downstream failures do **not** roll back the subscription record.

### Agent Credits

Agent call quotas can be supplemented with purchased credit packs:
- `adminGrantAgentCredits(user, amount)` — adds to existing balance; extends expiry to 12 months if needed
- `consumeAgentCredit(user)` — decrements 1 credit; called by voice server when tier quota is exhausted
- Credits expire independently of subscription

### Cross-Canister Dependencies

| Direction | Canister | Purpose |
|-----------|----------|---------|
| Payment → Property, Quote, Photo | `setTier()` | Tier propagation on subscription change |
| Payment → XRC | `get_exchange_rate()` | ICP/USD rate for direct ICP payments |
| Payment → ICP Ledger | `icrc2_transfer_from()` | Pull ICP from user's account |

### Notable Edge Cases

- **CallerGuard** — A transient `activeSubscribers` map prevents concurrent `subscribe()` calls from the same principal (race condition / double-charge protection). The lock persists until canister upgrade if a call errors out mid-execution.
- **Session principal mismatch** — `verifyStripeSession()` checks that the session's embedded principal matches `msg.caller`; protects against session hijacking.
- **Admin bootstrap** — `initAdmins()` is a one-time call; subsequent calls fail with `#NotAuthorized`.

---

## 8. Report

**File:** `backend/report/main.mo`

Generates and shares immutable property-history snapshots. The only canister that requires a verified property (`#Basic` or `#Premium`) before issuing a share link.

### Data Types

| Type | Fields / Values |
|------|-----------------|
| `ReportSnapshot` | `snapshotId, propertyId, generatedBy, address, city, state, zipCode, propertyType, yearBuilt, squareFeet, verificationLevel (Text), jobs[], recurringServices[], rooms?, totalAmountCents, verifiedJobCount, diyJobCount, permitCount, generatedAt, schemaVersion?` |
| `ShareLink` | `token, snapshotId, propertyId, createdBy, expiresAt?, visibility (#Public \| #BuyerOnly), viewCount, isActive, createdAt, hideAmounts?, hideContractors?, hidePermits?, hideDescriptions?` |
| `JobInput` | `serviceType, description, contractorName?, amountCents, date, isDiy, permitNumber?, warrantyMonths?, isVerified, status` |
| `RecurringServiceInput` | `serviceType, providerName, frequency, status, startDate, lastVisitDate?, totalVisits` |
| `RoomInput` | `name, floorType, paintColor, paintBrand, paintCode, fixtureCount` |
| `CertRecord` | `id (CERT-N), propertyId, payload (JSON Text), issuedAt` |
| `Error` | `#NotFound \| #Expired \| #Revoked \| #Unauthorized \| #InvalidInput(Text) \| #UnverifiedProperty` |

### Report Lifecycle

```
generateReport(propertyId, data..., expiryDays?, visibility, hideFlags?)
  → cross-canister: getVerificationLevel(propertyId) — rejects #Unverified / #PendingReview
  → creates immutable ReportSnapshot (schemaVersion=2)
  → issues ShareLink with bearer token
  → returns ShareLink

getReport(token)
  → checks isActive && not expired
  → increments viewCount
  → applies disclosure filtering (applyDisclosure)
  → returns (ShareLink, ReportSnapshot)

revokeShareLink(token)
  → isActive=false
  → snapshot unchanged (immutable)
  → future getReport() returns #Revoked
```

### Disclosure Filtering

The four `hide*` flags are stored as `?Bool` on the `ShareLink` for backward compatibility with pre-14.2.3 links (null = false). Applied at read time in `getReport()`, not at write time:

| Flag | Effect on jobs array |
|------|---------------------|
| `hideAmounts` | `amountCents → 0`, `totalAmountCents → 0` |
| `hideContractors` | `contractorName → null` |
| `hidePermits` | `permitNumber → null`, `permitCount → 0` |
| `hideDescriptions` | `description → ""` |

### Score Certificates

`issueCert(propertyId, payload)` mints an immutable `CertRecord` (sequential `CERT-N` ID). `verifyCert(certId)` is a public query returning the JSON payload — no authentication required. Intended for lender/insurer verification. No revocation; certificates are permanent.

### Role-Based Access

| Function | Who |
|----------|-----|
| `generateReport()` | Any authenticated; property must be `#Basic`+ |
| `getReport()` | Any (bearer token sufficient) |
| `listShareLinks()` | Creator only |
| `revokeShareLink()` | Creator or admin |
| `issueCert()` | Any authenticated |
| `verifyCert()` | Public (no auth) |
| `setPropertyCanisterId()`, `addAdmin()` | Admin |

### Cross-Canister Dependencies

| Direction | Canister | Purpose |
|-----------|----------|---------|
| Report → Property | `getVerificationLevel()` | Gate share-link issuance to verified properties |

---

## 9. Market

**File:** `backend/market/main.mo`

Stateless ROI intelligence engine. All core functions are queries — no update cost for users. Also manages neighborhood score collection with vetKeys-encrypted personal scores.

### Embedded Reference Data

**Project Templates (2024 Remodeling Magazine)**

| Project | Base Cost | ROI | Payback | Min Property Age |
|---------|-----------|-----|---------|-----------------|
| Insulation / Energy Efficiency | $4K | 102% | 12 mo | — |
| Hardwood Floor Refinish | $5K | 147% | 8 mo | — |
| Minor Kitchen Remodel | $27K | 96% | 18 mo | — |
| Curb Appeal / Landscaping | $5K | 87% | 14 mo | — |
| HVAC Replacement | $12K | 85% | 24 mo | 15 years |
| Bathroom Remodel | $25K | 74% | 20 mo | — |
| Window Replacement | $20K | 69% | 28 mo | 20 years |
| Roof Replacement | $30K | 61% | 36 mo | 20 years |
| Solar Installation | $25K | 50% | 60 mo | — |

**State market multipliers:** CA/NY/MA/WA/OR/CO = 115%; TX/FL/AZ/GA/NC/TN/NV = 108%; all others = 100%.

**Zip premium multipliers:** ≥$1M median = 115%; ≥$600K median = 108%; below = 100%.

### System Lifespans (used for scoring)

| System | Lifespan | Weight |
|--------|----------|--------|
| HVAC | 18 yr | 25% |
| Roofing | 25 yr | 25% |
| Plumbing | 50 yr | 15% |
| Electrical | 35 yr | 15% |
| Windows | 22 yr | 10% |
| Flooring | 25 yr | 10% |

### Key Functions

**`analyzeCompetitivePosition(subject, comparisons[])`** — Stateless query.

Produces a `CompetitiveAnalysis` with three dimension scores:
- **Maintenance** (40%): Coverage of 6 key systems; verified = 100%, DIY = 80%, other = 50% per system
- **Modernization** (35%): Remaining lifespan fraction per system, weighted
- **Verification Depth** (25%): % of jobs on-chain verified

Composite score = `(maintenance×40 + modernization×35 + verification×25) / 100`

Grade: A≥90, B≥80, C≥65, D≥50, F<50. Returns rank among comparables and arrays of strengths (≥70) and improvements (<50).

**`recommendValueAddingProjects(profile, currentJobs[], budget)`** — Stateless query.

Filters templates by property age, whether the system was recently serviced, and budget cap. Applies state × zip multipliers to cost and ROI. Returns sorted descending by ROI with priority tags (High/Medium/Low based on urgency and ROI).

### Neighborhood Score System

Individual scores are stored encrypted and never returned in plaintext:

```
submitScore(jobs, yearBuilt, zipCode)     → stores composite score, adds principal to zipIndex
getMyScoreEncrypted(transportPublicKey)   → vetKeys encryption (~10B cycles); returns ScoreEnvelope
getZipStats(zipCode)                      → public aggregate: mean, median, sampleSize, grade
```

VetKeys config: key `"test_key_1"` (local), `"key_1"` (mainnet); context `"hg-score-v1"`.

### Role-Based Access

| Function | Who |
|----------|-----|
| `analyzeCompetitivePosition()`, `recommendValueAddingProjects()`, `getMarketSnapshot()`, `getZipStats()`, `getNeighborhoodPublicKey()` | Public (no auth, query) |
| `submitScore()` | Any authenticated |
| `getMyScoreEncrypted()` | Self (authenticated; costs cycles) |
| `recordMarketSnapshot()` | Admin |

---

## 10. Maintenance

**File:** `backend/maintenance/main.mo`

Stateless predictive scheduler plus a persistent maintenance schedule tracker.

### Embedded System Specs (2024 Angi/HomeAdvisor)

| System | Lifespan | Cost Range | DIY? |
|--------|----------|------------|------|
| HVAC | 18 yr | $8K–$15K | No |
| Roofing | 25 yr | $15K–$35K | No |
| Water Heater | 12 yr | $1.2K–$3.5K | No |
| Windows | 22 yr | $8K–$24K | No |
| Electrical | 35 yr | $2K–$6K | No |
| Plumbing | 50 yr | $4K–$15K | No |
| Flooring | 25 yr | $3K–$20K | Yes |
| Insulation | 30 yr | $1.5K–$5K | Yes |

**Annual Tasks (10 items):** Replaces HVAC filter (quarterly), clean gutters (semi-annually/Fall), dryer vent, flush water heater, test smoke/CO detectors, inspect roof (Spring), check weatherstripping (Fall), garage door service, HVAC professional tune-up (Spring), chimney cleaning (Fall).

### `predictMaintenance(yearBuilt, jobs[])` — Stateless Query

For each system:
1. Find most recent matching job, or use `yearBuilt` as baseline
2. `pctUsed = (age × 100) / lifespanYears` (can exceed 100 if overdue)
3. Urgency: Critical (≥100%), Soon (≥75%), Watch (≥50%), Good (<50%)
4. Emoji-tagged recommendation text with cost range

Budget totals include only **Critical** and **Soon** items. Results sorted Critical → Soon → Watch → Good.

### Schedule Entries

Persistent plans saved by the homeowner:

```
createScheduleEntry(propertyId, systemName, taskDescription, plannedYear, ...)
  → no property ownership check at creation
markCompleted(entryId)
  → checks: caller == createdBy OR admin OR property canister auth
getScheduleByProperty(propertyId)
  → no auth check (public query)
```

### Cross-Canister Dependencies

| Direction | Canister | Purpose |
|-----------|----------|---------|
| Maintenance → Property | `isAuthorized()` | Auth check in `markCompleted()` (if wired) |

---

## 11. Sensor

**File:** `backend/sensor/main.mo`

IoT device registry. Authorized gateways push sensor events; Critical events auto-create pending jobs.

### Data Types

| Type | Fields / Values |
|------|-----------------|
| `DeviceSource` | `#Nest \| #Ecobee \| #MoenFlo \| #Manual` (+ Honeywell Home, Ring Alarm, Rheem EcoNet, Sense, Emporia Vue, Rachio, SmartThings, Home Assistant) |
| `SensorDevice` | `id, propertyId, homeowner, externalDeviceId, source, name, registeredAt, isActive` |
| `SensorEventType` | `#WaterLeak \| #LeakDetected \| #FloodRisk \| #LowTemperature \| #HvacAlert \| #HvacFilterDue \| #HighHumidity \| #HighTemperature` |
| `Severity` | `#Info \| #Warning \| #Critical` |
| `SensorEvent` | `id, deviceId, propertyId, homeowner, eventType, value, unit, rawPayload, timestamp, severity, jobId?` |

### Severity & Auto-Job Mapping

| Event Type | Severity | Auto-Job? | Service Type |
|------------|----------|-----------|--------------|
| WaterLeak | Critical | Yes | Plumbing |
| LeakDetected | Critical | Yes | Plumbing |
| FloodRisk | Critical | Yes | Plumbing |
| HvacAlert | Critical | Yes | HVAC |
| LowTemperature | Warning | No | — |
| HighHumidity | Warning | No | — |
| HighTemperature | Warning | No | — |
| HvacFilterDue | Info | No | — |

### Event Recording Lifecycle

```
Gateway calls recordEvent(externalDeviceId, eventType, value, unit, rawPayload)
  → validate: rawPayload ≤ 4096 bytes; caller is authorized gateway or admin
  → look up device by externalDeviceId
  → compute severity
  → if Critical: async call to job canister createSensorJob() (non-blocking; event recorded even if job creation fails)
  → store SensorEvent with jobId=result or null
```

### Role-Based Access

| Function | Who |
|----------|-----|
| `registerDevice()` | Any authenticated (caller becomes homeowner) |
| `deactivateDevice()` | Device homeowner or admin |
| `recordEvent()` | Authorized gateway or admin |
| `getDevicesForProperty()`, `getEventsForProperty()`, `getPendingAlerts()` | Public query (no auth) |
| `addGateway()`, `setJobCanisterId()` | Admin |

### Cross-Canister Dependencies

| Direction | Canister | Purpose |
|-----------|----------|---------|
| Sensor → Job | `createSensorJob()` | Auto-create pending job for Critical events |

### Notable Edge Cases

- **Inactive device events** — `recordEvent()` does not check `isActive`; events can be recorded for deactivated devices by design (allows archival).
- **`getPendingAlerts()`** — Returns all Warning + Critical events for a property without timestamp filtering; there is no "mark resolved" function on events.
- **External device ID uniqueness** — Hard constraint; duplicate registration returns `#AlreadyExists`.

---

## 12. Listing & Agent Marketplace

**File:** `backend/listing/main.mo`

FSBO listing lifecycle and a sealed-bid agent marketplace where realtors compete for listing assignments.

### Data Types

| Type | Fields / Values |
|------|-----------------|
| `ListingBidRequest` | `id, propertyId, homeowner, targetListDate, desiredSalePrice?, notes, bidDeadline, status (#Open \| #Awarded \| #Cancelled), createdAt, milestones?, offers?, closedData?, agentPerformance?` |
| `ListingProposal` | `id, requestId, agentId, agentName, agentBrokerage, commissionBps, cmaSummary, marketingPlan, estimatedDaysOnMarket, estimatedSalePrice, includedServices[], validUntil, coverLetter, status (#Pending \| #Accepted \| #Rejected \| #Withdrawn), createdAt` |
| `CounterProposal` | `id, proposalId, requestId, fromRole, commissionBps, notes, status (#Pending \| #Accepted \| #Rejected), createdAt` |
| `PublicFsboListing` | `propertyId, homeowner, listPriceCents, activatedAt, address, city, state, zipCode, propertyType, yearBuilt, squareFeet, verificationLevel, score, verifiedJobCount, description, photoUrl, hasPublicReport, systemHighlights` |

### Agent Marketplace Lifecycle (Sealed-Bid)

```
createBidRequest(propertyId, targetListDate, notes, bidDeadline)
  → bidDeadline must be in future; request status #Open

submitProposal(requestId, agentDetails...)
  → rejected if Time.now() >= bidDeadline (bid window enforced server-side)
  → one proposal per agent per request

[Frontend hides proposals until deadline — enforced by UI; canister returns all proposals to owner]

acceptProposal(proposalId) [homeowner]
  → winning proposal → #Accepted
  → all others → #Rejected
  → request → #Awarded

counterProposal(proposalId, newCommissionBps, notes) [homeowner]
  → creates CounterProposal with fromRole="homeowner"
  → agent can accept/reject counter
  → counter history preserved on proposal card
```

### FSBO Listing Index

`activateFsboListing(listing)` publishes a property to the buyer-facing search index. Caller is stamped as `homeowner` server-side (no spoofing). `listActiveFsboListings()` is a public query — no authentication required.

**Listing photos:**
- First caller to `addListingPhoto(propertyId, photoId)` becomes photo owner; 15-photo cap
- `reorderListingPhotos()` and `removeListingPhoto()` — owner or admin only
- `getListingPhotos()` — public query

### Post-Acceptance Tracking

After a proposal is accepted, the listing gains milestone and offer tracking:
- **Milestones** — Agreement signed → Listed → Offer received → Closed
- **Offer Log** — Track individual offers with date, amount, contingencies
- **Transaction Close** — Final sale price
- **Agent Performance** — Actual commission charged, notes

### Role-Based Access

| Function | Who |
|----------|-----|
| `createBidRequest()`, `cancelBidRequest()`, `acceptProposal()`, `counterProposal()` | Homeowner |
| `activateFsboListing()` | Homeowner |
| `submitProposal()` | Agents (before deadline) |
| `getMyBidRequests()`, `getMyProposals()` | Authenticated self |
| `getOpenBidRequests()` | Any authenticated (agent marketplace view) |
| `listActiveFsboListings()`, `getListingPhotos()` | Public (no auth) |

---

## 13. Agent Profiles

**File:** `backend/agent/main.mo`

Realtor profile registry with performance metrics and client reviews.

### Data Types

| Type | Fields |
|------|--------|
| `AgentProfile` | `id (Principal), name, brokerage, licenseNumber, statesLicensed[], bio (≤2000 chars), phone, email, avgDaysOnMarket, listingsLast12Months, isVerified, createdAt, updatedAt` |
| `AgentReview` | `id, agentId, reviewerPrincipal, rating (1–5), comment, transactionId (composite dedup key), createdAt` |

### Performance Tracking

`recordListingClose(agentId, daysOnMarket)` (admin-only, called by listing canister after sale closes):
- Increments `listingsLast12Months`
- Recomputes `avgDaysOnMarket` as a weighted average: `(old_avg × old_count + new_days) / new_count`

### Review Deduplication

Composite key: `reviewerPrincipal|transactionId`. A reviewer can only review the same transaction once. Rate limit: **10 reviews/day** per reviewer (24-hour rolling window).

### Role-Based Access

| Function | Who |
|----------|-----|
| `register()`, `updateProfile()` | Self |
| `addReview()` | Any authenticated; 10/day; composite dedup |
| `getProfile()`, `getAllProfiles()`, `getReviews()` | Public |
| `verifyAgent()`, `recordListingClose()` | Admin |

---

## 14. Recurring Services

**File:** `backend/recurring/main.mo`

Tracks recurring home service contracts (HVAC, pest control, lawn care, etc.) and their visit history.

### Data Types

| Type | Fields / Values |
|------|-----------------|
| `RecurringServiceType` | `#LawnCare \| #PestControl \| #PoolMaintenance \| #GutterCleaning \| #PressureWashing \| #Other` |
| `Frequency` | `#Weekly \| #BiWeekly \| #Monthly \| #Quarterly \| #SemiAnnually \| #Annually` |
| `ServiceStatus` | `#Active \| #Paused \| #Cancelled` |
| `RecurringService` | `id, propertyId, homeowner, serviceType, providerName, providerLicense?, providerPhone?, frequency, startDate, contractEndDate?, notes?, status, contractDocPhotoId?, createdAt` |
| `VisitLog` | `id, serviceId, propertyId (denormalized), visitDate, note?, createdAt` |

### Lifecycle

```
createRecurringService()   → status=#Active
attachContractDoc(photoId) → contractDocPhotoId set (idempotent; re-attach changes reference)
updateStatus()             → #Active ↔ #Paused ↔ #Cancelled (cancelled is terminal)
addVisitLog()              → lightweight: date + optional note (no document upload)
```

`contractEndDate=null` means an open-ended contract with no expiration.

### Role-Based Access

| Function | Who |
|----------|-----|
| `createRecurringService()`, `updateStatus()`, `attachContractDoc()`, `addVisitLog()` | Homeowner or admin |
| `getRecurringService()`, `getByProperty()`, `getVisitLogs()` | **Public (no auth)** |

Note: query functions have no access control by design — buyer-facing disclosure of service history.

### Notable Edge Cases

- **No cross-canister validation** — `contractDocPhotoId` references the photo canister but is not validated; deleted photos leave a broken reference.
- **No tier enforcement** — Any authenticated user can create unlimited recurring services.
- **Cancelled is a tombstone** — Cannot transition away from `#Cancelled`. Record retained for audit.

---

## 15. Bills

**File:** `backend/bills/main.mo`

Utility bill storage with 3-month rolling anomaly detection. Flags spikes >20% above baseline and feeds the Activity feed.

### Data Types

| Type | Fields / Values |
|------|-----------------|
| `BillType` | `#Electric \| #Gas \| #Water \| #Internet \| #Telecom \| #Other` |
| `BillRecord` | `id, propertyId, homeowner, billType, provider, periodStart, periodEnd, amountCents, usageAmount?, usageUnit?, uploadedAt, anomalyFlag, anomalyReason?` |

### Anomaly Detection

On every `addBill()`:
1. Fetch all prior bills for `(propertyId, billType, homeowner)` uploaded in the past 3 months
2. If fewer than 2 prior bills exist: skip (insufficient baseline)
3. If `amount > avg × 1.2` (>20% above baseline): set `anomalyFlag=true` and generate human-readable reason (e.g., "Bill is 35.2% above your 3-month average for FPL")

The 3-month window uses `ONE_MONTH_NS = 30.44 days` (not calendar-aware).

### Tier Enforcement

| Tier | Upload Allowed |
|------|----------------|
| Free | Blocked entirely (`#TierLimitReached`) |
| Basic, Pro, Premium, ContractorFree, ContractorPro | Unlimited |

### Role-Based Access

| Function | Who |
|----------|-----|
| `addBill()` | Homeowner; tier-enforced |
| `getBillsForProperty()`, `getUsageTrend()` | Homeowner (caller must be bill owner) |
| `deleteBill()` | Bill owner or admin |
| `setPaymentCanisterId()`, `grantTier()` | Admin |

### Cross-Canister Dependencies

| Direction | Canister | Purpose |
|-----------|----------|---------|
| Bills → Payment | `getTierForPrincipal()` | Tier check on `addBill()` |

---

## 16. Monitoring

**File:** `backend/monitoring/main.mo`

Observability hub: collects canister health metrics, computes cost/profitability analytics, and fires operational alerts.

### Data Types

| Type | Fields |
|------|--------|
| `CanisterMetrics` | `canisterId, cyclesBalance, cyclesBurned, memoryBytes, memoryCapacity, requestCount, errorCount, avgResponseTimeMs, updatedAt` |
| `CostMetrics` | `totalCyclesBurned, totalUsdCost, storageCostUsd, computeCostUsd, networkCostUsd, projectedMonthlyCostUsd, costPerUserUsd, calculatedAt` |
| `ProfitabilityMetrics` | `revenueUsd, costUsd, profitUsd, marginPct, arpu, ltv, cac, ltvToCacRatio, breakEvenUsers, calculatedAt` |
| `Alert` | `id, severity (#Critical \| #Warning \| #Info), category (#Cycles \| #ErrorRate \| #ResponseTime \| #Memory \| #Milestone \| #TopUp \| #Stale), canisterId?, message, resolved, createdAt, resolvedAt?` |
| `MethodCyclesSummary` | `method, avgCycles (EMA α=0.2), sampleCount, lastUpdatedAt` |

### Ingestion (Push-Based)

Any canister can call `recordCanisterMetrics()` — no authentication required. After storing the snapshot, alerts are auto-evaluated:

| Threshold | Severity |
|-----------|----------|
| Cycles < 5T | Critical |
| Cycles 5T–10T | Warning |
| Error rate > 5% | Critical |
| Error rate 2–5% | Warning |
| Avg response > 2000ms | Warning |
| Memory > 80% capacity | Warning |
| Metrics not updated in >1 hour | Warning (Stale) |

### Cost Model

- 1T cycles ≈ $1.30 USD
- Split: 35% storage, 50% compute, 15% network
- Monthly projection: current total × 30

### Profitability Metrics

- **ARPU** = revenue / users
- **LTV** = ARPU × 18 months
- **CAC** = hardcoded $15
- **LTV/CAC ratio** = LTV / 15
- **Break-even users** = ceil(projectedMonthlyCost / ARPU)

### Cycle Level Polling

`checkCycleLevels()` calls IC management `canister_status()` for each registered canister. Falls back to last recorded metrics (`fromCache=true`) if this canister is not a controller of the target.

### EMA for Method Cycle Tracking

`recordCallCycles(method, cycles)` updates a per-method exponential moving average:
`new_avg = 0.8 × old_avg + 0.2 × sample`

α=0.2 means recent observations converge slowly; useful for detecting gradual increases.

### Role-Based Access

| Function | Who |
|----------|-----|
| `recordCanisterMetrics()`, `recordCallCycles()` | Any (open push API) |
| `calculateCostMetrics()`, `calculateProfitability()`, `generateDailyReport()` | Public query |
| `getActiveAlerts()` | Public query |
| `resolveAlert()`, `createInfoAlert()`, `registerCanister()`, `checkCycleLevels()`, `setLowCycleThreshold()` | Admin |

---

## 17. Voice Agent Server

**File:** `agents/voice/server.ts`

Express.js proxy (port 3001) between the frontend and the Claude API. Handles streaming chat, agentic tool-use loops, vision extraction, Stripe checkout, and operational endpoints.

### Authentication

| Header | Purpose |
|--------|---------|
| `x-api-key` | Required on all `/api/` routes except `/api/errors` and `/api/buyers-truth-kit` |
| `x-context-hmac` | SHA-256 HMAC of the request context body, signed with `VOICE_API_KEY`; verified on `/api/chat` and `/api/agent` |
| `x-icp-principal` | Caller's ICP principal; server overwrites `context.principal` (never trusts client) |
| `x-subscription-tier` | Tier for per-tier rate limit checks on `/api/agent` |

HMAC verification is skipped in development when `VOICE_API_KEY` is absent.

### Rate Limiting

**Global:** 30 requests/min per IP on all `/api/` routes (express-rate-limit). Returns 429: `{ error: "Too many requests" }`. Skipped in `NODE_ENV === "test"`.

**Per-tier daily agent call quota** (tracked by `agentLimiter`):

| Tier | Agent Calls/Day | Chat Calls/Day |
|------|-----------------|----------------|
| Free / ContractorFree / RealtorFree | 0 | 3 |
| Basic | 5 | Unlimited |
| Pro / ContractorPro / RealtorPro | 10 | Unlimited |
| Premium | 20 | Unlimited |

If the tier quota is exhausted, the server attempts to consume an `agent_credit` from the payment canister. Returns 429 with `{ error: "daily_agent_limit_reached", creditsAvailable: bool }` if both are exhausted.

Response headers: `X-Agent-Calls-Used`, `X-Agent-Calls-Limit` — used by the UI to display the counter.

### Endpoints

#### AI Endpoints

**`POST /api/chat`** — SSE streaming chat
- System prompt built from `AgentContext` via `buildSystemPrompt()`
- Max tokens: 200 (~150 words; tuned for voice)
- Streams: `data: {"text":"..."}\n\n` chunks, terminated with `data: [DONE]\n\n`

**`POST /api/agent`** — Agentic tool-use loop
- Max tokens: 1024
- Returns `{ type: "answer", text }` or `{ type: "tool_calls", toolCalls[] }`; frontend executes tools and loops back
- Max 5 agentic turns per interaction (frontend-enforced)

**`POST /api/maintenance/chat`** — Maintenance advisor chat
- Dedicated system prompt via `buildMaintenanceSystemPrompt()`
- Max tokens: 512

**`POST /api/classify`** — Document vision classification
- Body limit: 5 MB (base64 images)
- Supports JPEG, PNG, GIF, WebP, PDF
- Returns: `{ documentType, confidence, suggestedServiceType?, extractedDate?, extractedAmountCents?, extractedContractor? }`

**`POST /api/extract-bill`** — Utility bill OCR
- Returns: `{ billType, provider, periodStart, periodEnd, amountCents, usageAmount, usageUnit, confidence }`

**`POST /api/extract-document`** — Appliance/fixture OCR
- Returns: `{ brand, modelNumber, serialNumber, purchaseDate, warrantyMonths, serviceType }`

#### Analytics & Advisory Endpoints

**`POST /api/efficiency-alert`** — Usage trend anomaly detection
- Compares early-half vs. late-half average of a usage trend array
- Flags if degradation ≥ 15%; returns `{ degradationDetected, estimatedAnnualWaste, recommendation }`
- Rule-based fallback if Claude is unavailable

**`POST /api/rebate-finder`** — Rebate & incentive lookup
- Covers federal (IRA), state, and utility-specific programs
- Input: `state, zipCode, utilityProvider, billType`

**`POST /api/telecom-negotiate`** — Broadband price benchmarking
- Returns: `{ verdict, medianCents, savingsOpportunityCents, negotiationScript }`

**`POST /api/pulse`** — Home Pulse weekly digest
- Season/climate-aware Monday-morning digest
- Input: `propertyId, address, zipCode, yearBuilt, systemAges, userTopicWeights`

**`POST /api/negotiate`** — Contractor quote benchmarking
- Input: quote, request details, zip, benchmark (p25/median/p75)
- Returns: `{ verdict, percentile, suggestedCounterCents?, rationale }`

**`POST /api/insurer-discount`** — Sensor × insurer discount estimation
- Input: state, devices[], verifiedJobTypes[], criticalEventCount
- Returns: discount range, qualifying categories, insurer programs, recommendations

#### Stripe Endpoints

**`POST /api/stripe/create-checkout`** — Creates Stripe Checkout Session
**`POST /api/stripe/verify-session`** — Verifies payment; activates ICP subscription
**`POST /api/stripe/create-subscription-intent`** — PaymentElement flow (creates Subscription + PaymentIntent)
**`POST /api/stripe/verify-subscription`** — Verifies PaymentIntent; activates ICP subscription
**`POST /api/stripe/create-credit-checkout`** — Agent credit pack purchase (25 or 100 credits)
**`POST /api/stripe/verify-credit-purchase`** — Verifies credit purchase; calls `grantAgentCredits()` on payment canister

**`POST /api/stripe/webhook`** — Stripe lifecycle events (raw body; HMAC signature required)

| Event | Action |
|-------|--------|
| `customer.subscription.deleted` | Revert principal to Free |
| `customer.subscription.updated` | Revert if cancelled |
| `invoice.payment_failed` | Revert to Free |
| `invoice.payment_succeeded` | Activate tier |

#### Utility Endpoints

**`POST /api/buyers-truth-kit`** — Public free tool; no auth required. Geocodes address, fetches permit history, returns a property truth report.

**`POST /api/errors`** — Frontend error logging. No auth required. Sanitizes and length-caps all fields; emits JSON to stdout. Always returns 204.

**`GET /health`** — Returns 200 if all required env vars (`ANTHROPIC_API_KEY`, `VOICE_AGENT_API_KEY`, `FRONTEND_ORIGIN`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) are present; 503 otherwise.

### Cross-Service Dependencies

| Service | Purpose |
|---------|---------|
| Anthropic Claude API | All AI endpoints |
| Stripe API | Checkout, subscriptions, webhooks |
| ICP Payment Canister | Activate/revoke tiers; consume/grant agent credits |
| ArcGIS / OpenPermit | Geocoding and permit lookup (`/api/buyers-truth-kit`) |

### Logging & Shutdown

Structured JSON log line per request: `{ ts, method, path, status, latencyMs, ip, principal }` → stdout (consumed by Datadog/Loki/CloudWatch).

Graceful shutdown on SIGTERM/SIGINT: `httpServer.close()` with a 10-second force-exit fallback to allow in-flight SSE streams to drain.

---

## Cross-Canister Dependency Map

```
Payment ──────────────────────────────────────────────────────┐
  │ setTier()                                                   │
  ├→ Property                                                   │
  ├→ Quote                                                      │
  └→ Photo                                                      │
                                                                │
Property (isAuthorized, getPropertyOwner, getVerificationLevel)│
  ├─ queried by: Job, Photo, Quote, Maintenance, Report        │
  └─ calls: Payment (getTierForPrincipal)                       │
                                                                │
Job ──────────────────────────────────────────────────────────┐│
  ├─ calls: Property, Payment, Contractor (recordJobVerified) ││
  └─ called by: Sensor (createSensorJob)                      ││
                                                               ││
Contractor ────────────────────────────────────────────────────┘│
  ├─ called by: Job (recordJobVerified)                          │
  └─ called by: Quote (getContractor inside getOpenRequestsForMe)│
                                                                 │
Sensor ──────────────────────────────────────────────────────── ┘
  └─ calls: Job (createSensorJob on Critical events)

Report ──────────────────────────────────────────────────────────
  └─ calls: Property (getVerificationLevel — gates share links)

Market ──────────────────────────────────────────────────────────
  └─ calls: IC Management (vetKeys for encrypted scores)

Maintenance ─────────────────────────────────────────────────────
  └─ calls: Property (isAuthorized on markCompleted)

Listing ──────────────────────────────────────────────────────────
  └─ calls: Agent (recordListingClose after sale)

Bills ────────────────────────────────────────────────────────────
  └─ calls: Payment (getTierForPrincipal)

Voice Server ────────────────────────────────────────────────────
  ├─ calls: Payment (activate/revoke tier, agent credits)
  ├─ calls: Anthropic Claude API
  └─ calls: Stripe API
```
