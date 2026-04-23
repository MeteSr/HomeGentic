# External API Dependencies

All third-party services HomeGentic calls, the env vars required to enable them,
and where in the codebase each integration lives.

---

## Summary

| Service | Purpose | Env Var(s) | Pricing | Required? |
|---|---|---|---|---|
| [Stripe](#0-stripe) | Subscription billing & payments | `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, 6× `STRIPE_PRICE_*` | Per-transaction | Yes — checkout disabled without it |
| [Anthropic Claude](#1-anthropic-claude) | AI voice agent & document analysis | `ANTHROPIC_API_KEY` | Paid (token-based) | Voice agent only |
| [Resend](#2-resend) | Transactional email | `RESEND_API_KEY` | Free 3k/mo | No |
| [Google Maps / Places](#3-google-maps--places) | Address autocomplete | `VITE_GOOGLE_MAPS_API_KEY` | Paid (per-request) | No — falls back to plain input |
| [Google Fonts](#4-google-fonts) | Typography CDN | None | Free | No — fonts degrade gracefully |
| [Firebase FCM](#5-firebase-cloud-messaging-fcm) | Mobile push notifications | `FCM_PROJECT_ID`, `FCM_SERVICE_ACCOUNT_JSON` | Free | No |
| [Google Nest SDM](#6-google-nest-sdm) | Thermostat webhooks | `NEST_WEBHOOK_SECRET` | Free | No |
| [Ecobee](#7-ecobee) | Thermostat webhooks | `ECOBEE_WEBHOOK_SECRET` | Free | No |
| [Moen Flo](#8-moen-flo) | Water sensor webhooks | `MOEN_FLO_WEBHOOK_SECRET` | Free | No |
| [Rentcast](#9-rentcast) | Property year built & sq ft lookup | `VITE_RENTCAST_API_KEY` | Free 50/mo | No — fields default to manual entry |
| [Volusia County ArcGIS](#10-volusia-county-arcgis) | Building permits (Volusia County, FL) | None | Free (public) | No |
| [OpenPermit](#11-openpermit) | Building permits (20+ US cities) | `OPEN_PERMIT_API_KEY` | Paid | No |

---

## 0. Stripe

**Purpose:** Subscription billing for Pro, Premium, ContractorPro, and RealtorPro tiers.
Handles payment collection via Stripe Elements (`PaymentElement`) embedded
directly in the app's checkout page — no redirect to Stripe-hosted pages.

**Env vars:**

| Variable | Used by | Description |
|---|---|---|
| `STRIPE_SECRET_KEY` | `agents/voice/server.ts` | Server-side only. Starts with `sk_test_` (sandbox) or `sk_live_`. |
| `VITE_STRIPE_PUBLISHABLE_KEY` | `frontend/src/pages/CheckoutPage.tsx` | Client-side. Starts with `pk_test_` or `pk_live_`. |
| `STRIPE_PRICE_PRO_MONTHLY` | server | `price_xxx` ID from Stripe dashboard |
| `STRIPE_PRICE_PRO_YEARLY` | server | `price_xxx` ID |
| `STRIPE_PRICE_PREMIUM_MONTHLY` | server | `price_xxx` ID |
| `STRIPE_PRICE_PREMIUM_YEARLY` | server | `price_xxx` ID |
| `STRIPE_PRICE_CONTRACTOR_PRO_MONTHLY` | server | `price_xxx` ID |
| `STRIPE_PRICE_CONTRACTOR_PRO_YEARLY` | server | `price_xxx` ID |
| `STRIPE_PRICE_REALTOR_PRO_MONTHLY` | server | `price_xxx` ID |
| `STRIPE_PRICE_REALTOR_PRO_YEARLY` | server | `price_xxx` ID |

**Pricing:** 2.9% + 30¢ per successful card charge (standard Stripe fees).
No platform fee. See https://stripe.com/pricing

---

### Checkout flow

```
PricingPage → /checkout?tier=Pro&billing=Monthly
  └─ POST /api/stripe/create-subscription-intent
       1. stripe.customers.create({ email, metadata: { icp_principal, tier, billing } })
       2. stripe.subscriptions.create({ payment_behavior: 'default_incomplete', ... })
       3. stripe.invoicePayments.list({ invoice: latest_invoice_id })
            → invoicePayment.payment.payment_intent  (PI id)
       4. stripe.paymentIntents.retrieve(piId)
            → client_secret  (pi_xxx_secret_xxx)
       Returns: { clientSecret, subscriptionId }

  └─ Frontend: Elements({ clientSecret }) + PaymentElement
  └─ stripe.confirmPayment({ return_url: '/payment-success?subscription_id=...&tier=...&billing=...&payment_intent=...' })

  └─ Stripe redirects to /payment-success (appends payment_intent + redirect_status)
  └─ POST /api/stripe/verify-subscription
       1. stripe.paymentIntents.retrieve(paymentIntentId) — must be 'succeeded'
       2. stripe.subscriptions.retrieve(subscriptionId) — read metadata
       3. dfx canister call payment adminActivateStripeSubscription (local dev)
       Returns: { type: 'subscription', tier, billing }
```

**Key design decisions:**

- **`Elements` requires a `pi_` secret.** Stripe's Checkout Session `cs_` secret
  is for `EmbeddedCheckout`, not `PaymentElement`. The correct flow is
  Customer → Subscription (`payment_behavior: 'default_incomplete'`) →
  PaymentIntent via `invoicePayments`.

- **Verify via PaymentIntent, not subscription status.** Stripe redirects to
  `return_url` immediately after card confirmation, before the webhook transitions
  the subscription from `incomplete` → `active`. `verify-subscription` checks
  `paymentIntent.status === 'succeeded'` (available instantly) and accepts
  `incomplete` subscriptions when payment is confirmed this way.

- **Stripe SDK v22 breaking change.** `Invoice.payment_intent` was removed from
  the TypeScript types and is no longer returned in the default Invoice response.
  Use `stripe.invoicePayments.list({ invoice: id })` to get
  `data[0].payment.payment_intent`, then retrieve the PaymentIntent separately.

- **Windows `.env` CRLF.** dotenv on Windows can bleed values across lines if
  the file has CRLF line endings. All price ID reads use `.trim()`.

---

### ICP canister activation

After payment, the Express server calls the ICP `payment` canister to write the
subscription tier server-side:

```bash
dfx canister call payment adminActivateStripeSubscription \
  '(principal "<icp_principal>", variant { Pro }, 1)'
```

This calls `adminActivateStripeSubscription` in `backend/payment/main.mo`, which
is guarded by `isAdmin(msg.caller)`. The Express process must be running under
the same dfx identity that was added as an admin when the canister was deployed.

**On mainnet**, replace the `dfx` CLI call with an ICP HTTP outcall or a
server-to-canister call using the management canister — the `dfx` approach only
works in local dev.

---

### Content Security Policy

`frontend/index.html` CSP must include:

```
script-src  'self' 'wasm-unsafe-eval' https://js.stripe.com
connect-src 'self' ... https://api.stripe.com ...
frame-src   https://js.stripe.com https://*.stripe.com
img-src     'self' data: blob: https://*.stripe.com
```

Stripe loads `https://js.stripe.com/dahlia/stripe.js` and iframes from
`https://*.stripe.com` for PCI-compliant card collection.

---

### Integration tests

```bash
cd agents/voice && npm test -- stripe.elements.integration
```

Tests ELEM.1–ELEM.7 in `agents/voice/__tests__/stripe.elements.integration.test.ts`
hit the real Stripe sandbox API and are skipped when `STRIPE_SECRET_KEY` is absent.
They create real (incomplete) subscriptions — no charges are ever made.

---

## 1. Anthropic Claude

**Purpose:** Powers the voice agent — streaming chat, agentic tool-use loops,
document classification, negotiation analysis, and maintenance digest generation.

**Env var:** `ANTHROPIC_API_KEY`

**Pricing:** Token-based. No free tier. See https://anthropic.com/pricing

**Used in:**
- `agents/voice/anthropicProvider.ts` — API client
- `agents/voice/server.ts` — all six AI endpoints (`/api/chat`, `/api/agent`,
  `/api/maintenance/chat`, `/api/classify`, `/api/pulse`, `/api/negotiate`)

**Notes:** The voice agent runs as a separate Express process (port 3001) and acts
as a secure proxy so the API key is never exposed to the browser.

---

## 2. Resend

**Purpose:** Sends transactional emails — digest emails, notifications, and invites.

**Env var:** `RESEND_API_KEY`, `RESEND_FROM_ADDRESS`

**Pricing:** Free tier: 3,000 emails/month, 100/day. Paid from $20/month.
See https://resend.com/pricing

**Used in:**
- `agents/voice/resendEmailProvider.ts` — email provider with rate-limit enforcement
- `backend/ai_proxy/main.mo` — HTTP outcall to `https://api.resend.com/emails`

**Notes:** A rate-limiting wrapper in `resendEmailProvider.ts` enforces the free-tier
limits (100/day, 3,000/month) so the service doesn't fail silently when the quota
is exhausted.

---

## 3. Google Maps / Places

**Purpose:** Address autocomplete on the property registration form.

**Env var:** `VITE_GOOGLE_MAPS_API_KEY`

**Pricing:** Usage-based — billed per Autocomplete session. A Places API key with
billing enabled is required. See https://developers.google.com/maps/billing-and-pricing

**Used in:**
- `frontend/src/components/AddressAutocomplete.tsx`
- Script loaded from `https://maps.googleapis.com/maps/api/js?libraries=places`

**Notes:** When `VITE_GOOGLE_MAPS_API_KEY` is not set the component falls back to
a plain `<input>` — users can still type an address manually.

---

## 4. Google Fonts

**Purpose:** Hosts the three typefaces used across the app:
`Fraunces` (headings), `Plus Jakarta Sans` (body), `IBM Plex Mono` (labels/code).

**Env var:** None — CDN links are hardcoded.

**Pricing:** Free.

**Used in:**
- `frontend/index.html` — `<link>` preconnect and stylesheet tags
- Domains: `fonts.googleapis.com`, `fonts.gstatic.com`

---

## 5. Firebase Cloud Messaging (FCM)

**Purpose:** Delivers push notifications to mobile devices.

**Env vars:** `FCM_PROJECT_ID`, `FCM_SERVICE_ACCOUNT_JSON`

**Pricing:** Free (unlimited push notifications on Spark plan).
See https://firebase.google.com/pricing

**Used in:**
- `agents/notifications/fcm.ts` — FCM client using service-account JWT auth
- OAuth token exchange: `https://oauth2.googleapis.com/token`
- Send endpoint: `https://fcm.googleapis.com/v1/projects/{PROJECT_ID}/messages:send`

**Notes:** The service account JSON should be kept server-side only and never
committed to the repo.

---

## 6. Google Nest SDM

**Purpose:** Receives thermostat events from Nest devices via Google Cloud Pub/Sub
push webhooks.

**Env var:** `NEST_WEBHOOK_SECRET`

**Pricing:** Free (part of the Google Home platform).
See https://developers.google.com/home/develop/get-started

**Used in:**
- `agents/iot-gateway/server.ts` — `POST /webhooks/nest`
- Validates `google-cloud-token` header before processing; events are normalized
  and forwarded to the ICP Sensor canister.

---

## 7. Ecobee

**Purpose:** Receives thermostat alerts and sensor readings from Ecobee devices.

**Env var:** `ECOBEE_WEBHOOK_SECRET`

**Pricing:** Free — requires device ownership.

**Used in:**
- `agents/iot-gateway/server.ts` — `POST /webhooks/ecobee`
- Validates `X-Ecobee-Signature` (HMAC-SHA256) before processing.

---

## 8. Moen Flo

**Purpose:** Receives water leak and flow alerts from Moen Flo smart water detectors.

**Env var:** `MOEN_FLO_WEBHOOK_SECRET`

**Pricing:** Free — requires device ownership.

**Used in:**
- `agents/iot-gateway/server.ts` — `POST /webhooks/moen-flo`
- Validates `X-Moen-Signature` (HMAC-SHA256) before processing.

---

## 9. Rentcast

**Purpose:** Looks up year built and square footage from public records when a user
registers a property, pre-filling those fields automatically.

**Env var:** `VITE_RENTCAST_API_KEY`

**Pricing:** Free tier: 50 requests/month. Paid tiers available.
Get a key at https://app.rentcast.io/app/api-access

**Used in:**
- `frontend/src/services/propertyLookup.ts`
- Endpoint: `GET https://api.rentcast.io/v1/properties`
- Auth header: `X-Api-Key: {key}`

**Notes:** When the key is absent or the lookup returns no result, the year built
and square footage fields remain empty and the user fills them in manually.
The lookup fires client-side when the user advances from the address step.

---

## 10. Volusia County ArcGIS

**Purpose:** Queries building permits for properties in Volusia County, FL
(Daytona Beach, Deltona, Ormond Beach, Port Orange, and surrounding cities).

**Env var:** None — fully public, no authentication required.

**Pricing:** Free (public government data).

**Used in:**
- `frontend/src/services/volusiaPermits.ts` — client-side permit lookup
- `backend/ai_proxy/main.mo` — server-side IC HTTP outcall
- Endpoint: `https://maps5.vcgov.org/arcgis/rest/services/CurrentProjects/MapServer/1/query`

---

## 11. OpenPermit

**Purpose:** Queries building permits for 20+ major US cities beyond Volusia County.

**Env var:** `OPEN_PERMIT_API_KEY`

**Pricing:** Paid — contact https://openpermit.org for pricing.

**Used in:**
- `backend/ai_proxy/main.mo` — IC HTTP outcall
- Endpoint: `https://api.openpermit.org/v1/permits`
- Auth header: `Authorization: Bearer {key}`

**Supported cities include:** Austin, Atlanta, Chicago, Dallas, Denver, Houston,
Jacksonville, Las Vegas, Los Angeles, Miami, Minneapolis, Nashville, New York,
Philadelphia, Phoenix, San Antonio, San Diego, San Jose, Seattle, Tampa.

---

## Adding a new external API

1. Add the env var to `.env.example` with a comment describing where to get a key.
2. Use `import.meta.env.VITE_*` for frontend vars, plain `process.env.*` for server vars.
3. Write a graceful no-op fallback for when the key is absent (don't hard-crash).
4. Add a row to the summary table above and a full section below it.
