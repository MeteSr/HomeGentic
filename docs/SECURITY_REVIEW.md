# HomeGentic Security Review

**Date:** 2026-08-26  
**Scope:** Full codebase — Express voice server, IoT gateway, 17 Motoko canisters, notifications service, mobile app, frontend SPA  
**Methodology:** Parallel static analysis across all source layers; findings filtered at ≥ 8/10 confidence (HIGH) or ≥ 7/10 (MEDIUM) with concrete exploit paths  
**Result:** **20 HIGH · 12 MEDIUM**

---

## Remediation Status

**All 32 findings resolved** — commit `b8725ac` on branch `fix/security-review` (PR #416), merged 2026-08-26.

Each finding below carries a ✅ with the file and the nature of the fix. The patterns introduced by these fixes (bootstrap nonce, fail-secure auth, OAuth CSRF state, server-side secret proxying) are documented in [SECURITY.md](SECURITY.md).

---

## Table of Contents

- [HIGH Severity](#high-severity)
- [MEDIUM Severity](#medium-severity)
- [Summary Table](#summary-table)
- [Recommended Priority Order](#recommended-priority-order)

---

## HIGH Severity

---

### H-01 · Unauthenticated Credential Proxy Endpoint
**File:** `agents/iot-gateway/server.ts` ~L759  
**Confidence:** 10/10

`POST /accounts/:platform` accepts `email` and `password` for Rheem EcoNet, Sense, and Emporia Vue with **zero authentication** — no session, no API key, no HMAC. It forwards the credentials directly to the upstream platform API and stores the resulting access token in `process.env`, overwriting any legitimate homeowner's polling token for the lifetime of the process.

**Exploit:** Attacker sends `POST /accounts/sense { "email": "victim@example.com", "password": "..." }` to the gateway's public URL. The gateway proxies the login to Sense, stores the access token, and thereafter polls the victim's account. The endpoint can also be used as an unauthenticated credential-stuffing proxy against Rheem/Sense/Emporia at scale — the gateway's IP absorbs any account-lockout consequences.

**Fix:** Gate behind the same `x-admin-token` check used on `/admin/` routes. Fail hard at startup if the admin token is not set.

---

### H-02 · Subscription Tier Spoofed via Client-Supplied Header
**File:** `agents/voice/server.ts` ~L350  
**Confidence:** 9/10

The AI rate-limit tier used by `agentLimiter` is taken directly from the `x-subscription-tier` request header. The server never verifies the claimed tier against the ICP payment canister. Because `VOICE_AGENT_API_KEY` is a static shared secret visible in every browser request, any authenticated user can set `x-subscription-tier: Premium` to receive 20 agent calls/day regardless of what they paid for.

**Exploit:** A Basic subscriber opens DevTools, copies the `x-api-key` value, and crafts requests with `x-subscription-tier: Premium`. The limiter grants them 20 Anthropic API calls/day they did not purchase.

**Fix:** Remove `x-subscription-tier`. Resolve the tier server-side by calling `payment.getTier(principal)` on the ICP canister, using the principal derived from the request's ICP delegation chain.

---

### H-03 · Arbitrary Email Injection via BidtoList Endpoints
**File:** `agents/voice/bidtolistRouter.ts` ~L209  
**Confidence:** 9/10

The BidtoList email endpoints (`/api/bidtolist/email/new-proposal`, `/proposal-result`, `/agent-verified`, `/new-listing`) accept recipient address, agent name, and city from the request body without verifying the caller is authorized to trigger emails on behalf of the supplied `requestId`. Any holder of `VOICE_AGENT_API_KEY` can send emails to arbitrary addresses from HomeGentic's legitimate sending domain.

**Exploit:** Authenticated user sends `POST /api/bidtolist/email/proposal-result { agentEmail: "victim@example.com", won: true }`. Victim receives a fraudulent "You won the listing — please pay the $295 agent fee" email. `/email/agent-verified` can send spoofed "Your account is verified" emails to any address.

**Fix:** Resolve the agent's email from the database using a validated `requestId` — never accept recipient addresses from the request body.

---

### H-04 · OAuth CSRF — Honeywell & GE OAuth Callbacks
**File:** `agents/iot-gateway/server.ts` ~L478, ~L584  
**Confidence:** 9/10

`GET /oauth/callback/honeywell` and `GET /oauth/callback/ge` accept any `code` query parameter and immediately exchange it for tokens that permanently replace the gateway's credentials. No `state` parameter is generated, stored, or verified — a textbook OAuth CSRF vulnerability on both endpoints.

**Exploit:** Attacker initiates a Honeywell OAuth flow with their own account and captures the authorization code. They trick an admin into visiting `/oauth/callback/honeywell?code=ATTACKER_CODE`. The gateway exchanges the attacker's code, stores the resulting tokens as the gateway's permanent Honeywell credentials, and begins polling the attacker's thermostat — enabling injection of fabricated `WaterLeak` or `LowTemperature` alerts against real homeowner properties.

**Fix:** Generate `crypto.randomBytes(32).toString('hex')` as `state` at OAuth initiation, store it in a server-side session, and reject any callback where `req.query.state` does not match.

---

### H-05 · OAuth CSRF — All Device-Picker Flows
**File:** `agents/iot-gateway/server.ts` ~L649  
**Confidence:** 8/10

`GET /oauth/device/start/:platform` initiates OAuth for all four platforms (ecobee, honeywell, lgthinq, ge) without generating a `state` parameter. `GET /oauth/device/callback/:platform` never validates one. Any window with a reference to the app can substitute its own authorization code.

**Exploit:** Attacker triggers the device-picker popup flow. When the victim authenticates with Ecobee, the attacker submits their own code to `/oauth/device/callback/ecobee`, causing the gateway to exchange the attacker's code and postMessage attacker-controlled device data to the opener — or persist the attacker's Ecobee tokens as the victim's device credential.

**Fix:** Same `state` parameter pattern as H-04, applied to all four platform flows in the device picker.

---

### H-06 · No Device Ownership Verification Before ICP Event Write
**File:** `agents/iot-gateway/icp.ts` ~L99  
**Confidence:** 8/10

The gateway forwards whatever `externalDeviceId` arrives in a webhook payload to `recordSensorEvent()` on the ICP canister without verifying the device belongs to the homeowner associated with the inbound webhook credential. A valid HMAC secret can be used to write events attributed to any device in the system.

**Exploit:** An attacker with a valid Moen Flo HMAC secret sends a crafted webhook with `deviceId` set to another user's Flo sensor. The gateway calls `recordEvent()` for the victim's device, triggering a `WaterLeak` maintenance job on their property — potentially initiating insurance claims or contractor dispatches.

**Fix:** Before forwarding to the canister, verify that `externalDeviceId` is registered under the `homeownerId` associated with the inbound webhook credential.

---

### H-07 · Payment Endpoint Auth Silently Disabled When API Key Unset
**File:** `agents/voice/server.ts` ~L147  
**Confidence:** 8/10

The `x-api-key` middleware skips all authentication when `VOICE_AGENT_API_KEY` is falsy. This is not gated on `NODE_ENV`. Any deployment launched without the env var — staging, container with missing secret injection, misconfigured production — silently opens every `/api/` route (including all Stripe payment and subscription activation endpoints) to the internet with no authentication.

**Exploit:** A staging deployment with `STRIPE_SECRET_KEY` set but `VOICE_AGENT_API_KEY` unset receives external traffic. Attacker calls `POST /api/stripe/verify-session` with a previously-used Stripe session ID to re-activate a subscription.

**Fix:** `if (!process.env.VOICE_AGENT_API_KEY) { console.error("FATAL: VOICE_AGENT_API_KEY not set"); process.exit(1); }`

---

### H-08 · verify-subscription Activates Arbitrary ICP Principal from Request Body
**File:** `agents/voice/server.ts` ~L1359  
**Confidence:** 8/10

`POST /api/stripe/verify-subscription` prefers the ICP principal from `req.body.principal` over the subscription's own Stripe metadata. Any caller who knows a valid `subscriptionId` and `paymentIntentId` — both present in Stripe redirect URLs — can activate any subscription tier for any ICP principal by supplying it in the body.

**Exploit:** Attacker purchases a Stripe subscription. The redirect URL contains `payment_intent=pi_xxx&subscription_id=sub_xxx`. They send `POST /api/stripe/verify-subscription { subscriptionId: "sub_xxx", paymentIntentId: "pi_xxx", principal: "<victim_principal>" }`. The server verifies the payment succeeded and calls `activateInCanister("<victim_principal>", tier, months)`.

**Fix:** Never accept the ICP principal from the request body. Derive it exclusively from Stripe subscription metadata written at checkout-creation time.

---

### H-09 · Push Notification Auth Bypassed When INTERNAL_API_KEY Unset
**File:** `agents/notifications/server.ts` ~L80  
**Confidence:** 9/10

The `/api/push/send` guard is `if (internalKey && req.headers["x-internal-key"] !== internalKey)`. When `INTERNAL_API_KEY` is not set, `internalKey` is `undefined`, the condition short-circuits to false, and the auth check is entirely skipped. Any network-reachable caller can send push notifications to any registered principal.

**Exploit:** Attacker posts `{ principal: "<victim>", payload: { title: "Security alert", body: "Tap here to verify your account", route: "/phishing" } }`. Because `INTERNAL_API_KEY` was never set, the dispatch proceeds and the victim receives a spoofed push from the legitimate HomeGentic app.

**Fix:** Fail at startup if `INTERNAL_API_KEY` is not set. Remove the `&&` short-circuit: change `if (internalKey && ...)` to `if (req.headers["x-internal-key"] !== internalKey)`.

---

### H-10 · `builderImportJob()` Writes Pre-Verified Jobs to Any Property
**File:** `backend/job/main.mo` ~L788  
**Confidence:** 10/10

`builderImportJob()` creates a job with `verified=true`, `homeownerSigned=true`, and `contractorSigned=true` for any caller-supplied `propertyId`. Only `requireActive()` is enforced — there is no ownership or authorization check. This directly corrupts the dual-signature verification that is the platform's core trust primitive.

**Exploit:** Any authenticated principal calls `builderImportJob("PROP_<victim>", #Roofing, "Fake Co", 50000, ...)`. A fully-verified $50,000 roofing job is written to the victim's property — spoofing contractor relationships, inflating their maintenance record, and corrupting all generated property reports, which treat `verified=true` as the canonical trust signal.

**Fix:** `if (not isOwner(msg.caller, propertyId) and not isAdmin(msg.caller)) return #err(#NotAuthorized)`. Cross-canister ownership verification required.

---

### H-11 · `uploadPhoto()` Attaches Photos to Any Property
**File:** `backend/photo/main.mo` ~L242  
**Confidence:** 10/10

`uploadPhoto()` enforces tier quotas and rate limits but performs no ownership check against the supplied `propertyId`. The function calls `checkPropertyAuth()` in `getPhoto`, `verifyPhoto`, and `deletePhoto` — but not here.

**Exploit:** An attacker with a ContractorPro account calls `uploadPhoto(jobId="JOB_123", propertyId="PROP_<victim>", ...)`. Up to 50 photos are attached to a property they don't own, incrementing the victim's quotas and polluting their photo galleries and maintenance records.

**Fix:** Call `checkPropertyAuth(msg.caller, propertyId)` at the start of `uploadPhoto()`, identical to the existing pattern in `getPhoto` and `deletePhoto`.

---

### H-12 · `getPendingVerifications()` Exposes Legal Names & Stripe Session IDs Publicly
**File:** `backend/property/main.mo` ~L872  
**Confidence:** 10/10

`getPendingVerifications()` is a public, unauthenticated query returning all properties in `#PendingReview`. Each record includes `nameOnId` (legal name from government-issued ID via Stripe Identity), `nameOnDocument`, `identitySessionId` (Stripe Verification Session ID), `verificationDocHash`, and full home address. No admin or caller check is present.

**Exploit:** Any unauthenticated caller queries `getPendingVerifications()` and receives a list of all users currently undergoing identity verification — including their legal names from government ID, Stripe session IDs, and home addresses.

**Fix:** `if (not isAdmin(msg.caller)) return #err(#NotAuthorized)`.

---

### H-13 · `issueCert()` Ignores Caller — Any Principal Can Mint Certificates
**File:** `backend/report/main.mo` ~L981  
**Confidence:** 9/10

`issueCert()` uses `ignore msg.caller` and performs no ownership or authorization check. Any authenticated principal can mint a score certificate for any `propertyId` with arbitrary `payload` text. Certificates are publicly verifiable via `verifyCert()`.

**Exploit:** Attacker calls `issueCert("PROP_<victim>", "{\"score\":99,\"grade\":\"A+\",\"certified\":true}")` and receives a `CERT-N` ID. They share the `verifyCert` result with mortgage lenders or insurers. The victim's property now has a fraudulent on-chain certificate that cannot be deleted.

**Fix:** `if (not isOwner(msg.caller, propertyId) and not isAdmin(msg.caller)) return #err(#NotAuthorized)`.

---

### H-14 · `generateRiskProfile()` Leaks Sensor & Job Data for Any Property
**File:** `backend/report/main.mo` ~L751  
**Confidence:** 9/10

`generateRiskProfile()` fetches live sensor events and job data via cross-canister calls for any `propertyId` with no ownership check, returning full sensor coverage, critical alert timestamps, and job statistics for properties the caller does not own.

**Exploit:** Attacker calls `generateRiskProfile("PROP_<victim>", null, "Basic")`. The canister makes authorized cross-canister queries on the attacker's behalf, returning the victim's full system health data and alert history.

**Fix:** Verify `msg.caller == property.owner` (or `isAdmin`) before making any cross-canister data fetches.

---

### H-15 · `registerDevice()` Registers Sensors Against Any Property
**File:** `backend/sensor/main.mo` ~L311  
**Confidence:** 9/10

`registerDevice()` allows any authenticated principal to register an IoT device for any `propertyId` without verifying property ownership. Subsequent `recordEvent()` calls for that device auto-create jobs attributed to the victim's property.

**Exploit:** Attacker calls `registerDevice("PROP_<victim>", "fake-device-001", #MoenFlo, "Leak Sensor")`. A subsequent `recordEvent("fake-device-001", #WaterLeak, ...)` triggers `createSensorJob()` on the job canister — creating unwanted maintenance records and alerts on the victim's property.

**Fix:** Cross-canister ownership check: verify `msg.caller == property.owner` before allowing device registration.

---

### H-16 · `getProposalsForRequest()` Exposes Sealed Agent Bids Before Deadline
**File:** `backend/listing/main.mo` ~L332  
**Confidence:** 9/10

`getProposalsForRequest()` is a public query with no authentication or deadline enforcement, returning all proposals (`commissionBps`, `cmaSummary`, `marketingPlan`, `estimatedSalePrice`) to any caller. A comment in the code explicitly states: "The sealed-bid reveal gate is enforced by the frontend service." On-chain, all bids are immediately readable.

**Exploit:** Agent A submits a 2.5% commission proposal. Agent B calls `getProposalsForRequest("BID_1")`, reads the terms, and submits a 2.4% counter-proposal — winning on information they should not have had access to.

**Fix:** `if (Time.now() < request.bidDeadline) return #err(#BidsNotYetRevealed)`. Never rely on the frontend for security enforcement.

---

### H-17 · `getReferralJobs()` Is an Unguarded Public Admin View
**File:** `backend/job/main.mo` ~L1127  
**Confidence:** 9/10

`getReferralJobs()` is a public, unauthenticated query returning full `Job` records — homeowner principal, contractor principal, dollar amounts, property IDs, permit numbers — for all jobs that originated from quote requests. The comment describes it as an "admin referral fee pipeline view."

**Fix:** `if (not isAdmin(msg.caller)) return #err(#NotAuthorized)`.

---

### H-18 · `VITE_RENTCAST_API_KEY` Exposed in Browser Bundle
**File:** `frontend/src/services/propertyLookup.ts` ~L11  
**Confidence:** 9/10

Vite inlines all `VITE_*` environment variables verbatim into the browser bundle at build time. The Rentcast API key is sent directly from the browser to `api.rentcast.io` in the `X-Api-Key` header — trivially extractable from the shipped JS by any user with DevTools.

**Exploit:** Attacker opens DevTools → Sources, searches the built chunk for `rentcast`, extracts the literal key, and uses it to exhaust the account's monthly quota or run up charges on a paid plan. No authentication or CORS bypass required.

**Fix:** Proxy all Rentcast calls through a server-side route that holds the key as a non-`VITE_` secret.

---

### H-19 · `postMessage` Origin Not Validated in OAuth Device Picker
**File:** `frontend/src/hooks/useOAuthDevicePicker.ts` ~L66  
**Confidence:** 8/10

The `window.addEventListener("message", onMessage)` handler accepts messages from any origin, gated only by `msg.type === "oauth-devices"`. A comment in the code acknowledges this: "allow wildcard because popup may not share origin after auth-provider redirects." Any window with a reference to the app can inject a fake device list.

**Exploit:** An attacker with `window.opener` access posts `{ type: "oauth-devices", devices: [{ id: "fake", type: "SmartThings" }] }`. The hook accepts the payload and the caller proceeds to register the attacker-supplied device to the homeowner's ICP account, enabling fabricated sensor events attributed to their property (see H-15).

**Fix:** `if (event.origin !== new URL(GATEWAY_URL).origin) return;` — remove the wildcard allowance.

---

### H-20 · `addAdmin()` Bootstrap Race Window — Property & Job Canisters
**Files:** `backend/property/main.mo` ~L1399 · `backend/job/main.mo` ~L688  
**Confidence:** 8/10

Both canisters start with `admins = []` and rely on a post-deploy `addAdmin()` call to bootstrap. The guard is `if (adminInitialized and not isAdmin(msg.caller)) return #err`. When `adminInitialized = false`, any authenticated principal can install themselves as admin by winning the race before the operator's first `addAdmin()` call.

**Exploit:** Attacker monitors the IC for a new canister deployment and calls `addAdmin(attacker_principal)` before the operator does. As admin of the Job canister, they call `setPropertyCanisterId()` pointing to an attacker-controlled canister that always returns `true` for ownership checks — bypassing all authorization on `verifyJob`, `updateJobStatus`, and `builderImportJob`. As admin of Property, they call `setTier()` to grant any user Premium for free.

**Fix:** Follow the pattern in `auth.mo` — set the deployer as the initial admin atomically at class instantiation (before any external calls are possible), using the canister's deployer principal or a deploy-time constructor argument.

---

## MEDIUM Severity

---

### M-01 · `Math.random()` Used for Monetarily-Redeemable Discount Codes
**File:** `agents/voice/bidtolistRouter.ts` ~L158 · **Confidence:** 7/10

`generateDiscountCode()` uses `Math.random()` (not a CSPRNG) to generate one-time discount codes redeemable against the payment canister. An attacker who knows the approximate generation timestamp can narrow the search space significantly.

**Fix:** `crypto.randomBytes(16).toString("hex")`.

---

### M-02 · HMAC Bypass on `/api/chat` via Operator Precedence Bug
**File:** `agents/voice/server.ts` ~L251 · **Confidence:** 7/10

When a request contains `message` but no `context`, an operator precedence bug causes `context` to evaluate as `{}`. A caller can precompute `HMAC(key, "{}")` — a fixed constant — and satisfy the context integrity check on every `/api/chat` request regardless of actual context content.

**Fix:** Explicitly parenthesize: `const ctx = req.body?.context ?? (req.body?.message != null ? {} : null)` and add a test for the `message`-only case.

---

### M-03 · Client-Supplied PII Logged Verbatim via Error Breadcrumbs
**File:** `agents/voice/server.ts` ~L986 · **Confidence:** 7/10

`POST /api/errors` logs client-supplied `breadcrumbs[].data` sub-objects verbatim to stdout with no server-side filtering. Any authenticated caller can POST arbitrary key-value pairs under `data` that persist in the log aggregation system indefinitely.

**Exploit:** User posts `data: { password: "hunter2", creditCard: "4111..." }` — those values appear verbatim in Datadog/CloudWatch with no expiry unless the operator has configured filtering rules.

**Fix:** Strip or allowlist keys in `data` before logging; remove any key matching `/pass|secret|token|card|ssn|dob/i`.

---

### M-04 · `/api/push/register` Has No Authentication
**File:** `agents/notifications/server.ts` ~L46 · **Confidence:** 8/10

`POST /api/push/register` accepts `(principal, token, platform)` with no authentication. Any unauthenticated caller can register their device token under a victim's principal, receiving all future push notifications sent to that principal — including job status changes, bill anomalies, and security events.

**Fix:** Require the same `x-internal-key` authentication as `/api/push/send`.

---

### M-05 · `getQuotesForRequest()` Exposes Competitor Bids
**File:** `backend/quote/main.mo` ~L607 · **Confidence:** 8/10

Public query returning all quotes (contractor identities, amounts, timelines) for a request to any caller before the homeowner selects a winner — undermining blind-bidding fairness.

**Fix:** Return only the caller's own quote, or restrict full results to the property owner after award.

---

### M-06 · `generateReport()` No Property Ownership Check
**File:** `backend/report/main.mo` ~L376 · **Confidence:** 8/10

Any authenticated principal can generate an official HomeGentic report snapshot for any non-`#Unverified` property, receive a shareable token, and distribute it as if they were the owner.

**Fix:** `if (msg.caller != property.owner and not isAdmin(msg.caller)) return #err(#NotAuthorized)`.

---

### M-07 · `getEventsForProperty()` Is a Public Query
**File:** `backend/sensor/main.mo` ~L482 · **Confidence:** 8/10

Returns all sensor events (homeowner principal, event type, readings, raw payloads) for any `propertyId` to any unauthenticated caller, enabling enumeration of properties with active water leaks, HVAC failures, or security alerts.

**Fix:** Restrict to `msg.caller == device.homeowner` or `isAdmin(msg.caller)`.

---

### M-08 · ArcGIS WHERE Clause Injection
**Files:** `backend/ai_proxy/main.mo` ~L529 · `frontend/src/services/volusiaPermits.ts` ~L131 · **Confidence:** 8/10

User-supplied address strings are interpolated directly into an ArcGIS SQL WHERE clause (`FOLDERDESCRIPTION LIKE '%<street>%'`) with only space-encoding. Single quotes, `%`, and `&` are unescaped, enabling boolean-based injection.

**Exploit:** Input `"O'Brien%' OR '1'='1"` → WHERE becomes `LIKE '%O'Brien%' OR '1'='1%'` — potentially returning all permit records in the county.

**Fix:** Double single-quotes before interpolation; percent-encode `%`, `&`, and `+`, or use ArcGIS parameterized query format.

---

### M-09 · `submitReview()` Accepts Fabricated Job IDs
**File:** `backend/contractor/main.mo` ~L305 · **Confidence:** 8/10

`submitReview()` accepts a caller-supplied `jobId` but never cross-canister validates it. The composite key only prevents the same reviewer from using the same `jobId` twice — any caller can post multiple reviews with fabricated IDs to artificially tank or inflate a contractor's trust score.

**Fix:** Cross-canister verify: job exists, `msg.caller` was the homeowner on that job, and the reviewed contractor was the assigned contractor on that job.

---

### M-10 · `getJobsForProperty()` Is a Public Query
**File:** `backend/job/main.mo` ~L348 · **Confidence:** 8/10

Returns full job records (amounts, contractor identities, permit numbers, warranty details) for any property to any unauthenticated caller.

**Fix:** Restrict to `msg.caller == job.homeowner`, `isAdmin`, or a verified cross-canister caller.

---

### M-11 · `activateFsboListing()` Bypasses Ownership When `propCanisterId` Unset
**File:** `backend/listing/main.mo` ~L590 · **Confidence:** 7/10

Ownership is only verified when `propCanisterId` is configured. In a freshly deployed or misconfigured environment, any authenticated principal can list any property at an arbitrary price with themselves as homeowner, redirecting all buyer inquiries to the attacker.

**Fix:** Return `#err(#NotConfigured)` when `propCanisterId` is empty rather than silently skipping the ownership check.

---

### M-12 · `redeemInviteToken()` Does Not Link Caller to Contractor Signature
**File:** `backend/job/main.mo` ~L913 · **Confidence:** 7/10

`public shared func redeemInviteToken()` (no `msg` binding) never captures or validates the caller's identity. Any principal possessing the invite URL can redeem the token, placing `contractorSigned=true` on the job even if they are not the intended contractor — forging a contractor signature and potentially triggering full job verification.

**Fix:** Capture `msg.caller`. Store the intended `contractorPrincipal` at token creation time. On redemption: `if (msg.caller != token.contractorPrincipal) return #err(#NotAuthorized)`.

---

## Summary Table

| ID | Component | Finding | Severity |
|----|-----------|---------|----------|
| H-01 | IoT Gateway | Unauthenticated `/accounts/:platform` credential proxy | **HIGH** |
| H-02 | Voice Server | Subscription tier spoofed via client header | **HIGH** |
| H-03 | Voice Server | BidtoList arbitrary email injection | **HIGH** |
| H-04 | IoT Gateway | OAuth CSRF — Honeywell & GE callbacks | **HIGH** |
| H-05 | IoT Gateway | OAuth CSRF — all device-picker flows | **HIGH** |
| H-06 | IoT Gateway | No device ownership check before ICP write | **HIGH** |
| H-07 | Voice Server | All payment endpoint auth disabled when key unset | **HIGH** |
| H-08 | Voice Server | `verify-subscription` activates arbitrary principal | **HIGH** |
| H-09 | Notifications | `push/send` auth bypassed when key unset | **HIGH** |
| H-10 | `job` canister | `builderImportJob()` no property ownership check | **HIGH** |
| H-11 | `photo` canister | `uploadPhoto()` no property ownership check | **HIGH** |
| H-12 | `property` canister | `getPendingVerifications()` exposes legal names & PII | **HIGH** |
| H-13 | `report` canister | `issueCert()` ignores caller entirely | **HIGH** |
| H-14 | `report` canister | `generateRiskProfile()` no property ownership check | **HIGH** |
| H-15 | `sensor` canister | `registerDevice()` no property ownership check | **HIGH** |
| H-16 | `listing` canister | `getProposalsForRequest()` public before bid deadline | **HIGH** |
| H-17 | `job` canister | `getReferralJobs()` unguarded public admin view | **HIGH** |
| H-18 | Frontend | `VITE_RENTCAST_API_KEY` exposed in browser bundle | **HIGH** |
| H-19 | Frontend | `postMessage` origin not validated in device picker | **HIGH** |
| H-20 | `property`/`job` canisters | `addAdmin()` bootstrap race window | **HIGH** |
| M-01 | Voice Server | `Math.random()` for monetarily-redeemable discount codes | MEDIUM |
| M-02 | Voice Server | HMAC bypass via operator precedence bug | MEDIUM |
| M-03 | Voice Server | Client-supplied PII logged via error breadcrumbs | MEDIUM |
| M-04 | Notifications | `/api/push/register` has no authentication | MEDIUM |
| M-05 | `quote` canister | `getQuotesForRequest()` exposes competitor bids | MEDIUM |
| M-06 | `report` canister | `generateReport()` no property ownership check | MEDIUM |
| M-07 | `sensor` canister | `getEventsForProperty()` public query | MEDIUM |
| M-08 | `ai_proxy` / frontend | ArcGIS WHERE clause injection | MEDIUM |
| M-09 | `contractor` canister | `submitReview()` accepts fabricated job IDs | MEDIUM |
| M-10 | `job` canister | `getJobsForProperty()` public query | MEDIUM |
| M-11 | `listing` canister | `activateFsboListing()` ownership bypass when unwired | MEDIUM |
| M-12 | `job` canister | `redeemInviteToken()` caller not bound to contractor | MEDIUM |

---

## Recommended Priority Order

### Immediate — fix before next deploy

| # | Finding | Why urgent |
|---|---------|------------|
| H-01 | Unauthenticated credential proxy | Allows unauthenticated credential stuffing through the gateway right now |
| H-07 | API key startup guard | One-line fix; prevents complete auth removal on misconfigured deploys |
| H-09 | Push notification key startup guard | Same one-line fix pattern |
| H-12 | `getPendingVerifications()` PII leak | Active breach of legal names from government ID |
| H-10 | `builderImportJob()` ownership check | Corrupts the platform's core dual-signature trust primitive |

### This Sprint

| # | Finding |
|---|---------|
| H-02 | Tier spoofing — direct Anthropic API cost impact |
| H-08 | `verify-subscription` principal injection — financial impact |
| H-18 | Rentcast API key in browser bundle |
| H-11 | `uploadPhoto()` ownership check |
| H-13 | `issueCert()` caller check |
| H-14 | `generateRiskProfile()` ownership check |
| H-15 | `registerDevice()` ownership check |
| H-03 | BidtoList email injection — phishing from legitimate domain |
| M-04 | `/api/push/register` authentication |

### Next Sprint

| # | Finding |
|---|---------|
| H-04, H-05 | OAuth CSRF on IoT gateway callbacks and device picker |
| H-06 | Device ownership check before ICP write |
| H-16 | Sealed bids enforced on-chain |
| H-17 | `getReferralJobs()` admin gate |
| H-19 | `postMessage` origin validation |
| H-20 | Admin bootstrap race — automate `addAdmin()` call atomically at deploy |
| M-05–M-12 | Canister data exposure and business logic gaps |
