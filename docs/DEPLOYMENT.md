# HomeGentic Deployment Guide

## What gets deployed

| Component | Code | Ships via | Section |
|---|---|---|---|
| 20 Motoko canisters | `backend/` | `scripts/deploy.sh` (CI: `deploy-testnet.yml` on green `main`, `deploy-mainnet.yml` by hand) | [Mainnet Deployment](#mainnet-deployment), [One-time canister configuration](#one-time-canister-configuration) |
| Web app (assets canister) | `frontend/` | Built and uploaded by `scripts/deploy.sh` | [Frontend build variables](#frontend-build-variables) |
| Voice / AI Worker | `agents/voice/` | `deploy-voice-worker` job (Cloudflare) | [Voice Agent](#voice-agent-cloudflare-workers) |
| Lead email Worker | `agents/email/` | `deploy-email-worker` job (Cloudflare) | [Email Relay](#email-relay-cloudflare-workers) |
| Notification relay | `agents/notifications/` | `deploy-relays.yml` → Fly.io | [Notification Relay](#notification-relay) |
| IoT gateway | `agents/iot-gateway/` | `deploy-relays.yml` → Fly.io | [IoT Gateway](#iot-gateway) |
| Mobile app | `mobile/` | Manual — Expo EAS | [Mobile App](#mobile-app) |
| Admin monitoring dashboard | `dashboard/` | Manual — static build | [Admin Dashboard](#admin-dashboard) |

`agents/maintenance/` holds prompt templates only; it isn't deployed on its own.

## Local Development

```bash
# Start local ICP network and deploy all canisters
make deploy

# Or manually:
icp network start -d
bash scripts/deploy.sh
```

## Running Tests

```bash
make test
# or
bash scripts/test-backend.sh
```

## Frontend Development

```bash
make frontend
# or
cd frontend && npm run dev
```

## Testnet Deployment

```bash
bash scripts/deploy.sh testnet
```

Requires an identity with cycles. In CI, `deploy-testnet.yml` runs this after a green `main` build using the `DFX_IDENTITY_PEM` and `DFX_WALLET_ID` secrets.

On testnet an upgrade that fails with `Memory-incompatible program upgrade` is retried as a reinstall (which wipes that canister's data) **only** for canisters listed in `TESTNET_REINSTALL_OK` in `scripts/deploy.sh` — empty by default. Mainnet never reinstalls. See [UPGRADE_RUNBOOK.md](UPGRADE_RUNBOOK.md).

## Voice Agent (Cloudflare Workers)

The voice / AI proxy (`agents/voice/`) proxies Claude API calls, handles
Stripe checkout and webhooks, and serves the Bid to List routes. In
production it runs as a Cloudflare Worker (`agents/voice/src/index.ts`,
config in `agents/voice/wrangler.toml`). Locally, `npm run dev` serves the
same Worker with `wrangler dev` on port 8787.

### Deploys

There are two Workers, one per environment:

| Environment | Worker name | Deployed by |
|---|---|---|
| mainnet | `homegentic-voice-agent` | `deploy-voice-worker` in `deploy-mainnet.yml` (`npx wrangler deploy`) |
| testnet | `homegentic-voice-agent-testnet` | `deploy-voice-worker` in `deploy-testnet.yml` (`npx wrangler deploy --env testnet`) |

Both jobs need the `CLOUDFLARE_API_TOKEN` secret. The testnet Worker is
configured under `[env.testnet]` in `wrangler.toml` and has its own secrets,
KV namespace (created automatically on its first deploy) and
`FRONTEND_ORIGIN`, so testnet never touches production Stripe keys,
canisters or rate-limit counters.

The frontend bundle (and the CSP `connect-src` in `frontend/index.html`) is
built with that URL baked in. Both deploy workflows pass it from the
`VITE_VOICE_AGENT_URL` secret, and `scripts/deploy.sh` refuses to build the
frontend for testnet or mainnet unless it is an `https://` URL — otherwise
every voice/Stripe call would fall back to `http://localhost:8787` and be
blocked by the CSP. The Worker only accepts requests from its
`FRONTEND_ORIGIN`, so that must match the frontend that uses it.

### First-time setup

1. Deploy the canisters first (`deploy.sh` / Deploy Mainnet), so their IDs
   exist in `canister_ids.json`.
2. Deploy the Worker once (`cd agents/voice && npx wrangler deploy`). The
   `RATE_LIMIT` KV namespace has no `id` in `wrangler.toml`, so wrangler
   creates it on this first deploy and reuses it afterwards.
3. Set the secrets below with `npx wrangler secret put <NAME>`, including the
   `CANISTER_ID_*` values from step 1.
4. Deploy again and check `https://<worker>/health` returns `{"ok":true}`. It
   returns 503 until the Anthropic, Stripe, `DFX_IDENTITY_PEM`,
   `CANISTER_ID_AUTH` and `CANISTER_ID_PAYMENT` secrets are all set.

Worker logs are kept by Cloudflare (`[observability]` in `wrangler.toml`):
**Workers & Pages → homegentic-voice-agent → Logs**.

**Testnet Worker (one-time):** deploy it once (`npx wrangler deploy --env testnet`,
or let `deploy-testnet.yml` do it), then set the same secrets with
`npx wrangler secret put <NAME> --env testnet` using testnet values — Stripe
**test** keys and price IDs, the testnet `CANISTER_ID_PAYMENT` and `CANISTER_ID_AUTH` (see
`canister_ids.json`), and the testnet frontend's origin as `FRONTEND_ORIGIN`.
Finally set the `VITE_VOICE_AGENT_URL` secret in the `testnet` GitHub
environment to `https://homegentic-voice-agent-testnet.<your-subdomain>.workers.dev`
so the next testnet deploy bakes it into the frontend.

Non-secret settings (`AI_MODEL`, `NODE_ENV`, `DFX_NETWORK`, ICP hosts) are
`[vars]` in `wrangler.toml`. The hourly cron trigger fires the Bid to List
deadline reminders.

### Secrets

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API key (`sk-ant-...`) |
| `VOICE_AGENT_API_KEY` | Client ID the frontend sends in `x-api-key`. It is baked into the public bundle, so it is not a secret; callers are identified by their `x-agent-session` token |
| `FRONTEND_ORIGIN` | Exact origin of the frontend canister (no trailing slash) |
| `STRIPE_SECRET_KEY` | Stripe secret key (`sk_live_...`) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret (`whsec_...`) |
| `STRIPE_PRICE_PRO_YEARLY` | Stripe price ID — the $59/year homeowner plan |
| `STRIPE_PRICE_CONTRACTOR_PRO_MONTHLY` | Stripe price ID |
| `STRIPE_PRICE_CONTRACTOR_PRO_YEARLY` | Stripe price ID |
| `STRIPE_PRICE_CREDITS_25` | Stripe price ID — agent-credit pack |
| `STRIPE_PRICE_CREDITS_100` | Stripe price ID — agent-credit pack |
| `DFX_IDENTITY_PEM` | Ed25519 PEM of the identity the Worker signs canister calls with. Its principal is `VOICE_WORKER_PRINCIPAL`, which `deploy.sh` grants on the canisters — see [One-time canister configuration](#one-time-canister-configuration) |
| `CANISTER_ID_PAYMENT` | Payment canister ID |
| `CANISTER_ID_AUTH` | Auth canister ID — resolves the `x-agent-session` tokens that identify callers on `/api/chat` and `/api/agent`. Without it those routes return 401 in production |
| `CANISTER_ID_JOB` | Job canister ID — contractor-invite email, and filing forwarded invoices as drafts |
| `CANISTER_ID_CONTRACTOR` | Contractor canister ID — records Florida DBPR licence lookups (`/api/license/check`). The Worker's identity must be added with `contractor.addLicenseRelay` (`scripts/deploy.sh` does it). Optional `DBPR_LICENSE_FILE_URL` overrides DBPR's construction licensee file URL |
| `CANISTER_ID_PHOTO` | Photo canister ID — access checks for off-chain photos (`/photos/*`). The Worker's identity must be added with `photo.addPhotoRelay` (`scripts/deploy.sh` does it) |
| `CANISTER_ID_PROPERTY` | Property canister ID — records Stripe Identity results (webhook `identity.verification_session.verified`). The Worker's identity must be added with `property.addIdentityRelay` (`scripts/deploy.sh` does it) |
| `CANISTER_ID_FEE` | Fee canister ID — Contractor Free referral fees: saving cards (`/api/stripe/referral-card`, webhook `checkout.session.completed`) and the hourly charge run; declined cards get a Stripe invoice (`invoice.paid` settles it). The Worker's identity must be added with `fee.addReferralRelay` (`scripts/deploy.sh` does it) |
| `RESEND_API_KEY`, `RESEND_FROM` | Transactional email (moved off `ai_proxy`, whose memory node operators can read) |
| `ATTOM_API_KEY` | Property-record lookups |
| `OPENPERMIT_API_KEY` | Permit imports |
| `LOCAL_BROKER_EMAIL` | Recipient of broker-lead emails |
| `CANISTER_ID_MONITORING` | Optional — monitoring canister, for frontend-error and cycle-alert routes |
| `BIDTOLIST_*` | Optional — Bid to List Stripe/Resend keys and canister IDs (see the comment block in `wrangler.toml`) |

`INBOX_DOMAIN` (a `[vars]` entry, not a secret) is the domain of homeowners'
forwarding addresses (`h-<token>@INBOX_DOMAIN`); see
[Forwarded invoices](#forwarded-invoices-email-routing). Unset, the Worker
ignores inbound mail.

`STRIPE_PRICE_PRO_MONTHLY` is optional (Pro is sold yearly only).
`RENTCAST_API_KEY` is optional — it enables `/api/rentcast/properties`
(year built / square footage in the Add Property wizard); without it the
route returns 503 and the wizard just skips the prefill.

### Forwarded invoices (Email Routing)

Each homeowner can show a private forwarding address on the Jobs page. Mail to
it reaches the Worker's `email()` handler (`agents/voice/src/inbox.ts`), which
reads the invoice with Claude and files a draft with `job.relayAddEmailDraft`.
Nothing becomes a job until the homeowner logs the draft. To turn it on:

1. Pick a domain or subdomain just for this (e.g. `in.homegentic.app`), on a
   zone in Cloudflare, and enable **Email Routing** on it.
2. Add a **catch-all** rule: action *Send to a Worker*, destination the voice
   Worker.
3. Set the Worker var `INBOX_DOMAIN` and the frontend build variable
   `VITE_INBOX_DOMAIN` to that domain (a variable on the `testnet` /
   `production` GitHub environment; both deploy workflows pass it to the build). The app hides the address while
   `VITE_INBOX_DOMAIN` is unset.
4. Allowlist the Worker on the job canister: `deploy.sh` does it when
   `VOICE_WORKER_PRINCIPAL` is set, or by hand
   `icp canister call job addInboxRelay '(principal "<voice worker>")' -e <env>`.

The Worker never replies to inbound mail (so forged senders get no
backscatter). The canister caps drafts at 30 a day and 50 open per homeowner,
and a homeowner can switch to a new address at any time.

### How canister calls work in production

After Stripe confirms payment, the Worker calls the ICP payment canister
directly via `@dfinity/agent` (see `agents/voice/paymentCanister.ts`). It uses
the Ed25519 identity from `DFX_IDENTITY_PEM` to authenticate as an admin and
invoke `adminActivateStripeSubscription`, `adminGrantAgentCredits`, or
`consumeAgentCredit`. No `dfx` binary is required at runtime.

Locally, `DFX_IDENTITY_PEM` is typically unset — canister calls gracefully degrade
with a warning and the activation is skipped.

---

## Email Relay (Cloudflare Workers)

`agents/email/` is a small Worker (`homegentic-email-relay`) that turns
lead-form submissions into emails via Resend. It is deployed by the
`deploy-email-worker` job in both `deploy-mainnet.yml` and
`deploy-testnet.yml`. Testnet deploys go to a separate
`homegentic-email-relay-testnet` Worker (`[env.testnet]`), which needs its own
secrets (`npx wrangler secret put <NAME> --env testnet`).

First-time setup:

1. `cd agents/email && npx wrangler deploy`
2. Set its secrets with `npx wrangler secret put <NAME>`:
   - `RESEND_API_KEY` — Resend key whose domain matches the `fromEmail` addresses
   - `ROUTE_CONFIG` — JSON array with one entry per site that may post leads:
     `[{"origin":"https://example.com","toEmail":"leads@…","fromEmail":"noreply@…","fromName":"…"}]`.
     Requests from any other origin are rejected.
3. Point each site's lead form at the Worker's URL.

---

## Notification Relay

The notification relay (`agents/notifications/`) is a standalone Node service
(`npm ci && npm run build && npm start`, or `agents/notifications/Dockerfile`).
CI deploys it to Fly.io — see [Hosting on Fly.io](#hosting-on-flyio). Set the
variables below as Fly secrets.

- Serve it over **HTTPS**: browsers only register push from an https page, and
  the web app's CSP lists the relay's origin.
- Run **one instance**. The outbox cursors live in `NOTIFICATIONS_DATA_FILE`;
  two instances would each send every push, email and text.
- Put `NOTIFICATIONS_DATA_FILE` on a disk that survives restarts and redeploys.

### Required environment variables

| Variable | Description |
|---|---|
| `NODE_ENV` | `production` |
| `FRONTEND_ORIGIN` | Exact origin of the frontend canister (no trailing slash) |
| `NOTIFICATIONS_PORT` | Port to listen on (default `3002`; `PORT` is not read) |
| `VAPID_PUBLIC_KEY` | Base64url VAPID public key (generate with `web-push`) |
| `VAPID_PRIVATE_KEY` | Base64url VAPID private key — keep secret |
| `VAPID_SUBJECT` | `mailto:` or URL identifying the sender (e.g. `mailto:admin@homegentic.io`) |
| `INTERNAL_API_KEY` | Shared secret required in `x-internal-key` header on `POST /api/push/send` |
| `NOTIFICATIONS_DATA_FILE` | Path of the JSON file holding device tokens, browser subscriptions, notification preferences, confirmed SMS numbers and outbox cursors (e.g. `/var/lib/homegentic/notifications.json`). Put it on persistent storage. |
| `RELAY_IDENTITY_SEED` | 32-byte hex seed for the relay's own ICP identity (`openssl rand -hex 32`). Keep secret and stable — its principal is allowlisted on the canisters. |
| `IC_HOST` | ICP API host (default `https://icp-api.io`; `http://localhost:4943` locally) |
| `CANISTER_ID_AUTH` | Auth canister — resolves the session tokens clients register with, and users' email addresses |
| `CANISTER_ID_JOB` | Job canister — outbox for job signatures, verified jobs and sensor alerts |
| `CANISTER_ID_QUOTE` | Quote canister — outbox for bid outcomes, quotes received and new leads |
| `CANISTER_ID_LISTING` | Listing canister — outbox for FSBO showing requests (push and email to the seller). The relay must be on its notifier list: `scripts/deploy.sh` grants `addNotifier` when `NOTIFIER_PRINCIPAL` is set |
| `CANISTER_ID_CONTRACTOR` | Contractor canister — profiles for new-lead matching and contractors' notification email |
| `CANISTER_ID_PAYMENT` | Payment canister — contractor tiers: ContractorPro gets new-lead alerts at once and Free 30 minutes later, and review requests go out only for ContractorPro. Without it every contractor is treated as Free |
| `POLL_INTERVAL_MS` | How often to read the outboxes (default `30000`) |
| `APNS_KEY_ID` | Apple APNs Auth Key ID (for iOS push) |
| `APNS_TEAM_ID` | Apple Team ID |
| `APNS_PRIVATE_KEY` | APNs `.p8` private key content |
| `APNS_BUNDLE_ID` | iOS bundle ID the pushes are for (default `app.homegentic.mobile`, matching `mobile/app.json`). `NODE_ENV=production` sends to APNs production, anything else to the sandbox |
| `FCM_PROJECT_ID` | Firebase project ID (for Android push) |
| `FCM_SERVICE_ACCOUNT_JSON` | Firebase service account JSON (for Android push) |

### Email and SMS (optional)

Each channel is off until its variables are set; Settings hides its rows while it's off.

| Variable | Description |
|---|---|
| `RESEND_API_KEY` | Resend API key. Turns notification email on |
| `NOTIFY_EMAIL_FROM` | Sender, on a domain verified in Resend (default `HomeGentic <notifications@homegentic.app>`) |
| `APP_URL` | Web app origin used for links in emails and texts (default `https://homegentic.app`) |
| `NOTIFICATIONS_PUBLIC_URL` | This relay's public HTTPS origin (e.g. `https://notify.homegentic.app`). Needed for the weekly Home Pulse email: each one carries a one-click unsubscribe link to `/api/email/unsubscribe`. Without it the weekly email is off |
| `CANISTER_ID_PROPERTY` | Property canister — the weekly Home Pulse email reads each homeowner's properties |
| `PULSE_HOUR_UTC` | Hour (UTC) on Mondays the weekly Home Pulse starts sending (default `13`) |
| `PULSE_SEND_INTERVAL_MS` | Pause between weekly emails, to stay under Resend's rate limit (default `600`) |
| `CANISTER_ID_REPORT` | Report canister — buyer report alerts from the public `/check` page ("notify me"). The relay checks each saved address hourly and emails the buyer once a public report exists. Needs `RESEND_API_KEY` too; without either the page says the request couldn't be saved |
| `REPORT_ALERT_INTERVAL_MS` | How often buyer report alerts are checked (default `3600000`) |
| `UNSUBSCRIBE_SECRET` | Signs unsubscribe links (default: `INTERNAL_API_KEY`). Changing it breaks links in emails already sent |
| `TWILIO_ACCOUNT_SID` | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | Twilio auth token — keep secret |
| `TWILIO_VERIFY_SERVICE_SID` | Twilio Verify service (`VA…`) that texts the confirmation codes |
| `TWILIO_MESSAGING_SERVICE_SID` | Messaging service (`MG…`) that sends alerts — or set `TWILIO_FROM_NUMBER` (E.164) instead |

SMS turns on only when the account SID, auth token, Verify service and a sender are all set.
Texting US numbers from a 10-digit long code needs an approved **A2P 10DLC** brand and campaign
in Twilio, attached to the messaging service; without it carriers filter the alerts. Each user can
request at most 5 codes an hour, and every alert ends "Reply STOP to opt out" (Twilio handles STOP).

VAPID keys are stable — regenerate only if the private key is compromised (invalidates all existing browser subscriptions).

`INTERNAL_API_KEY` gates `/api/push/send`. Registration (`/api/push/register`, `/api/push/vapid-subscribe`) is authenticated with the auth canister's session tokens instead. In production the server throws at startup if `INTERNAL_API_KEY`, `CANISTER_ID_AUTH`, `NOTIFICATIONS_DATA_FILE` or `RELAY_IDENTITY_SEED` is missing.

### Allowlist the relay on the canisters

The relay logs its principal at startup (`relay principal: …`). Allow it to read
the job and quote outboxes, look up users' email and the weekly Home Pulse recipients on
auth, and read the Home Pulse property summaries and jobs on property and job, either when deploying:

```bash
NOTIFIER_PRINCIPAL=<relay principal> bash scripts/deploy.sh <env>
```

(in CI, set the `NOTIFIER_PRINCIPAL` variable on the GitHub environment), or directly:

```bash
icp canister call auth     addNotifier '(principal "<relay principal>")' -e <env>
icp canister call property addNotifier '(principal "<relay principal>")' -e <env>
icp canister call job      addNotifier '(principal "<relay principal>")' -e <env>
icp canister call quote    addNotifier '(principal "<relay principal>")' -e <env>
icp canister call listing  addNotifier '(principal "<relay principal>")' -e <env>
```

Until it is allowlisted on job and quote, the relay logs `NotAuthorized` each poll and sends
nothing. Without auth, emails go only to contractors who set a notification email on their
profile; the rest are logged and skipped.

### Point the clients at the relay

- **Web:** set `VITE_NOTIFICATIONS_URL` (the relay's https URL) for the frontend
  build. The build adds its origin to the CSP. Without it, the push, email and
  SMS rows in Settings are hidden.
- **Mobile:** set `EXPO_PUBLIC_NOTIFICATIONS_URL` for the Expo build.
- Set the relay's `FRONTEND_ORIGIN` to the web app's origin (CORS).

### Generate VAPID keys (first-time only)

```bash
cd agents/notifications && node -e "const wp=require('web-push'); const k=wp.generateVAPIDKeys(); console.log(JSON.stringify(k,null,2))"
```

---

## IoT Gateway

The IoT gateway (`agents/iot-gateway/`) is a Node/Express server that ingests
sensor events, manages OAuth credentials for smart-home platforms, and writes
events to the `sensor` ICP canister. Like the notification relay, CI deploys it
to Fly.io ([Hosting on Fly.io](#hosting-on-flyio)); `agents/iot-gateway/Dockerfile`
also runs on any Docker host. Its default port, 3002, is the same as the relay's,
so set `IOT_GATEWAY_PORT` if they share a host.

**Allow it to write to the sensor canister.** The gateway logs its principal
at startup (`gatewayPrincipal` on the `listening on` line). Add it once per
environment:

```bash
icp canister call sensor addGateway '(principal "<gateway principal>")' -e <env>
```

Until then its `recordEvent` calls are rejected.

### Required environment variables

| Variable | Description |
|---|---|
| `NODE_ENV` | `production` |
| `IOT_GATEWAY_PORT` | Port to listen on (default `3002`) |
| `SENSOR_CANISTER_ID` | ICP principal of the `sensor` canister |
| `GATEWAY_IDENTITY_SEED` | 32-byte hex seed for the gateway's ICP identity (`openssl rand -hex 32`). Keep it stable — without it the gateway makes a new identity on every start, which the sensor canister won't accept |
| `ICP_HOST` | ICP API host (default `http://localhost:4943`; set `https://icp-api.io` for testnet / mainnet) |
| `ADMIN_TOKEN` | Strong random secret required in `x-admin-token` on `POST /accounts/:platform` (credential proxy) and `GET /oauth/start/*` (OAuth initiation). Server logs a warning and disables the credential proxy endpoint if unset. Generate with `openssl rand -hex 32`. |
| `FRONTEND_ORIGIN` | Exact origin of the frontend — used in `postMessage` responses from the OAuth device picker |
| `IOT_GATEWAY_PUBLIC_URL` | The gateway's public https URL (e.g. `https://homegentic-iot-gateway.fly.dev`). Every OAuth `redirect_uri` is built from it, so register `<it>/oauth/callback/<platform>` and `<it>/oauth/device/callback/<platform>` with each vendor. The gateway won't start in production without it |
| `HONEYWELL_CLIENT_ID` | Honeywell Home OAuth app client ID |
| `HONEYWELL_CLIENT_SECRET` | Honeywell Home OAuth app client secret |
| `GE_CLIENT_ID` | GE SmartHQ OAuth app client ID |
| `GE_CLIENT_SECRET` | GE SmartHQ OAuth app client secret |

Each smart-home platform also needs its own webhook secret or API tokens
(`NEST_WEBHOOK_SECRET`, `ECOBEE_*`, `MOEN_FLO_WEBHOOK_SECRET`, …); the table in
[`agents/iot-gateway/README.md`](../agents/iot-gateway/README.md) lists them.
Refreshed OAuth tokens are written to the `*_TOKENS_FILE` paths, so keep those on
persistent storage too. Set the web app's `VITE_IOT_GATEWAY_URL` to the
gateway's URL.

### Hosting on Fly.io

`.github/workflows/deploy-relays.yml` builds both images on every PR that
touches them, deploys to testnet on each push to `main`, and deploys to
production when run by hand from `main`. Each service is one always-on
machine (`--ha=false`; never scale past one) with a 1 GB volume at `/data`.
Until `FLY_API_TOKEN` is set on an environment, the deploy job skips.

One-time setup, per environment (`-testnet` suffix for testnet):

```bash
fly apps create homegentic-notifications-testnet
fly volumes create notifications_data --app homegentic-notifications-testnet --region iad --size 1
fly apps create homegentic-iot-gateway-testnet
fly volumes create iot_gateway_data --app homegentic-iot-gateway-testnet --region iad --size 1

# Relay: the required variables above, e.g.
fly secrets set --app homegentic-notifications-testnet --stage \
  FRONTEND_ORIGIN=… INTERNAL_API_KEY=… RELAY_IDENTITY_SEED=… \
  VAPID_PUBLIC_KEY=… VAPID_PRIVATE_KEY=… VAPID_SUBJECT=… \
  CANISTER_ID_AUTH=… CANISTER_ID_JOB=… CANISTER_ID_QUOTE=… CANISTER_ID_LISTING=… \
  CANISTER_ID_PROPERTY=… CANISTER_ID_REPORT=… CANISTER_ID_CONTRACTOR=… CANISTER_ID_PAYMENT=… \
  RESEND_API_KEY=… NOTIFICATIONS_PUBLIC_URL=https://homegentic-notifications-testnet.fly.dev
# Gateway:
fly secrets set --app homegentic-iot-gateway-testnet --stage \
  FRONTEND_ORIGIN=… SENSOR_CANISTER_ID=… GATEWAY_IDENTITY_SEED=… ADMIN_TOKEN=… \
  IOT_GATEWAY_PUBLIC_URL=https://homegentic-iot-gateway-testnet.fly.dev …vendor keys
```

`NODE_ENV`, the ports, `ICP_HOST` and the data-file paths are already in each
`fly.toml`. Then create a deploy token (`fly tokens create org`) and save it as
the `FLY_API_TOKEN` secret on the GitHub `testnet` and `production`
environments, set `VITE_NOTIFICATIONS_URL` and `VITE_IOT_GATEWAY_URL` for the
web build, and allowlist both principals (below). Back up the volumes with
`fly volumes snapshots` (Fly takes daily snapshots, kept 5 days by default).

### OAuth setup (Honeywell / GE)

OAuth credentials are obtained through admin-gated one-time flows — they are not
user-initiated:

```bash
# Initiate the flow (requires x-admin-token header)
curl -H "x-admin-token: $ADMIN_TOKEN" https://<gateway>/oauth/start/honeywell
# → redirects to Honeywell authorization page

# After approving, Honeywell redirects to /oauth/callback/honeywell?code=...&state=...
# The gateway validates the CSRF state token and exchanges the code for tokens automatically.
```

The device-picker OAuth flow (for homeowner-linked devices) uses the same CSRF
state pattern but is user-initiated via the frontend. See [SECURITY.md](SECURITY.md)
for the full OAuth CSRF state store design.

---

## Mobile App

The Expo app in `mobile/` (bundle ID / package `app.homegentic.mobile`) is built
and submitted with [EAS](https://docs.expo.dev/build/introduction/), using the
profiles in `mobile/eas.json` (`development`, `preview`, `production`):

```bash
cd mobile
npx eas-cli build --profile production --platform all
npx eas-cli submit --profile production --platform all
```

CI runs `npm run ci` (typecheck + Jest) and an iOS bundle export for `mobile/`
on every PR (`test-mobile` in `ci.yml`). Builds run from
`.github/workflows/mobile-release.yml` and are queued on EAS (`--no-wait`;
follow them on expo.dev):

| Trigger | Build |
|---|---|
| Push to `main` touching `mobile/**` | `preview` profile, internal distribution |
| Tag `mobile-vX.Y.Z` (must equal `expo.version` in `app.json`) | `production` profile, auto-submitted to TestFlight and the Play internal track |
| Manual run (Actions → Mobile Release) | Choose profile, platform, and whether to submit |

To cut a store release: bump `expo.version` in `mobile/app.json`, merge, then
push the tag (`git tag mobile-v1.1.0 && git push origin mobile-v1.1.0`). EAS sets
build numbers itself (`appVersionSource: remote`, `autoIncrement`).

The workflow needs, before it does anything beyond the tests:

- `EXPO_TOKEN` repository secret (an Expo access token).
- The app linked to an EAS project: `npx eas-cli init` in `mobile/` writes
  `extra.eas.projectId` into `app.json`; commit it.
- A `mobile-production` GitHub environment. Add required reviewers so store
  releases need an approval, as `deploy-mainnet.yml` does for `production`.
- To submit: App Store Connect API key and Play service-account JSON stored as
  EAS credentials, and real values for the `APPLE_ID` / `ASC_APP_ID` /
  `APPLE_TEAM_ID` placeholders in `eas.json`. Play rejects API uploads until
  one build has been uploaded by hand.

Until the first two exist, pushes to `main` skip the build with a notice; a
manual run or tag fails with a list of what's missing. Each `eas.json` profile
names its EAS environment (`development`, `preview`, `production`), which is
where the variables below are read from.

Set these as EAS environment variables (they're inlined at build time):

| Variable | Description |
|---|---|
| `EXPO_PUBLIC_ICP_HOST` | ICP API host (`https://icp-api.io`) |
| `EXPO_PUBLIC_AUTH_CANISTER_ID`, `EXPO_PUBLIC_PROPERTY_CANISTER_ID`, `EXPO_PUBLIC_JOB_CANISTER_ID`, `EXPO_PUBLIC_QUOTE_CANISTER_ID`, `EXPO_PUBLIC_PHOTO_CANISTER_ID`, `EXPO_PUBLIC_PAYMENT_CANISTER_ID`, `EXPO_PUBLIC_CONTRACTOR_CANISTER_ID`, `EXPO_PUBLIC_RECURRING_CANISTER_ID`, `EXPO_PUBLIC_MAINTENANCE_CANISTER_ID`, `EXPO_PUBLIC_SENSOR_CANISTER_ID`, `EXPO_PUBLIC_BILLS_CANISTER_ID`, `EXPO_PUBLIC_LISTING_CANISTER_ID` | Canister IDs for the target environment (`canister_ids.json`). Without `PAYMENT` every user reads as Free; without `SENSOR` the Property tab shows no sensors; without `BILLS` utility-bill upload says bills aren't available; without `LISTING` the Property tab has no My listing card and showing-request pushes open an empty My listing screen |
| `EXPO_PUBLIC_VOICE_AGENT_URL` | Voice Worker URL |
| `EXPO_PUBLIC_WEB_URL` | Web app origin (default `https://homegentic.app`). Sign-in opens `<origin>/mobile-auth`, which asks Internet Identity for a delegation to the app's session key and redirects to `homegentic://auth`, so this origin must serve a frontend build that has that page. It's also used for shareable report links and the pages the app opens on the web |
| `EXPO_PUBLIC_NOTIFICATIONS_URL` | Notification relay URL; without it the app skips push registration |
| `EXPO_PUBLIC_SENTRY_DSN` | Sentry DSN for crash reports. Without it crash reporting is off (it's always off in development). Events carry no user or IP, and share/invite tokens are redacted (`src/services/crashReporting.ts`) |
| `EXPO_PUBLIC_APP_ENV` | Sentry environment name (`production`, `preview`, …; default `production`) |
| `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` (secret), `SENTRY_DISABLE_AUTO_UPLOAD=false` | Upload source maps so crash reports show source lines. `eas.json` sets `SENTRY_DISABLE_AUTO_UPLOAD=true` so builds don't fail before Sentry is set up; set it to `false` here once the other three exist |

**Universal links.** `https://homegentic.app/dashboard`, `/people`,
`/report/…` and `/my-listing/…` open the app when it's installed
(`UNIVERSAL_LINK_PATHS` in `mobile/src/services/deepLinks.ts`, `associatedDomains`
and the `autoVerify` intent filter in `app.json`). The web build serves the
matching `/.well-known/apple-app-site-association` and `assetlinks.json` once the
`APPLE_TEAM_ID` and `ANDROID_CERT_SHA256` (Play app-signing certificate,
comma-separated if several) variables are set on the GitHub `testnet` /
`production` environments. They only work once `homegentic.app` points at the
frontend canister (custom domain); iOS caches the association at install time.

For push, the app registers its native device token with the relay. iOS is set
up already (`aps-environment` in `app.json`); the relay's APNs key must belong
to the same Apple team. Android isn't yet: add the Firebase project's
`google-services.json` and point `android.googleServicesFile` in `app.json` at
it, or the app can't get an FCM token.

---

## Admin Dashboard

`dashboard/` is a small Vite app showing monitoring, cycle and revenue metrics
from the `auth`, `payment` and `monitoring` canisters. It reads
`CANISTER_ID_AUTH`, `CANISTER_ID_PAYMENT`, `CANISTER_ID_MONITORING` and
`DFX_NETWORK` from the repo-root `.env`. It isn't deployed by CI; run it locally
(`cd dashboard && npm ci && npm run dev`, port 3002) or build it
(`npm run build` → `dashboard/dist/`) and serve it from any static host. It calls
the canisters with the anonymous identity, so it only shows what their public
queries return.

---

## Mainnet Deployment

```bash
bash scripts/deploy.sh ic
```

`deploy-mainnet.yml` runs this from **Actions → Deploy Mainnet → Run workflow**
(it never runs on its own). It needs these secrets in the `production`
GitHub environment; `deploy.sh`'s pre-flight stops the deploy if any marked
required is missing.

| Secret | Required | Used for |
|---|---|---|
| `MAINNET_IDENTITY_PEM` | yes | Deploying identity (controller of every canister); passed to `deploy.sh` as `DFX_IDENTITY_PEM` |
| `MAINNET_WALLET_ID` | yes | Funded cycles wallet |
| `CI_PUSH_TOKEN` | yes | Commits `canister_ids.json` after the deploy |
| `BACKUP_CONTROLLER_PRINCIPAL` | yes | Second controller (see [Controller Hardening](#controller-hardening)) |
| `ANTHROPIC_API_KEY`, `VOICE_AGENT_API_KEY` | yes | Pre-flight checks only — the Worker holds its own copies |
| `VITE_VOICE_AGENT_URL`, `VITE_VOICE_AGENT_API_KEY` | yes | Baked into the frontend |
| `STRIPE_SECRET_KEY` | yes | Pre-flight (must be `sk_live_…` on mainnet); also see [Stripe → Production](#production) |
| `VITE_STRIPE_PUBLISHABLE_KEY` | yes | Baked into the frontend |
| `IOT_GATEWAY_PRINCIPAL` | no | The IoT gateway's principal; `deploy.sh` registers it on `sensor`. Without it, sensor accepts self-asserted device IDs |
| `RESEND_API_KEY` | no | Cycle Watchdog alert emails. Resend, ATTOM and OpenPermit keys for the app are voice Worker secrets now, not `ai_proxy` settings |
| `VITE_NOTIFICATIONS_URL` | no | Notification relay URL baked into the frontend |
| `CLOUDFLARE_API_TOKEN` | yes | The Worker deploy jobs |

Locally, put the same values in `.env` (the `VITE_*` ones are read by the
frontend build) and use an identity with controller permissions and a funded
cycles wallet.

**Build and deploy ordering** — the script handles this automatically, but for manual steps:

```bash
# 1. Deploy all Motoko canisters (writes CANISTER_ID_* to .env)
icp deploy -e ic

# 2. Build the frontend (reads .env for canister IDs; writes dist/.ic-assets.json5)
cd frontend && npm run build && cd ..

# 3. Deploy the frontend/assets canister (uploads dist/ including security headers)
icp deploy frontend -e ic
```

Running `npm run build` before step 1 would produce a bundle with empty canister
IDs; `deploy.sh` sets `REQUIRE_CANISTER_IDS=1`, so the build fails instead.
Running `icp deploy frontend` before step 2 will serve a stale build without the
updated `.ic-assets.json5` security headers.

## Frontend build variables

`frontend/vite.config.ts` reads `.env` at the repo root (which `deploy.sh`
fills with `CANISTER_ID_*`) plus the build's environment. Besides the canister
IDs:

| Variable | Needed | Effect |
|---|---|---|
| `VITE_VOICE_AGENT_URL` | yes (testnet / mainnet) | Voice Worker URL; also added to the CSP. `deploy.sh` refuses a non-`https://` value |
| `VITE_VOICE_AGENT_API_KEY` | yes | Sent to the Worker as `x-api-key` |
| `VITE_STRIPE_PUBLISHABLE_KEY` | yes | Stripe.js |
| `VITE_NOTIFICATIONS_URL` | optional | Notification relay URL; added to the CSP. Unset hides the browser push toggle |
| `VITE_INBOX_DOMAIN` | optional | Domain of the invoice forwarding addresses; must match the Worker's `INBOX_DOMAIN`. Unset hides the address |
| `VITE_IOT_GATEWAY_URL` | optional | IoT gateway URL for the device-linking OAuth popup and the CSP. Unset hides the "Connect account" button (dev builds default to `http://localhost:3002`) |
| `VITE_GOOGLE_MAPS_API_KEY` | optional | Address autocomplete; without it the address field is plain text |
| `VITE_MONITORING_CANISTER_ID` | optional | Frontend error reporting to the `monitoring` canister |
| `VITE_CANISTER_ID_REPORT` | optional | Score certificate lookups (`/cert/:token`) |
| `VITE_QUORUM_BENEFIT_CANISTER_ID` | optional | Partner benefit lookups |
| `VITE_LOCAL_BROKER_EMAIL` | optional | Recipient for the local-broker contact form |

The last three canister-ID variables are read under these `VITE_` names, not
from the `CANISTER_ID_*` that `deploy.sh` writes, so copy the IDs over if you
want those features.

## One-time canister configuration

`deploy.sh` creates the canisters, makes the deploying identity an admin of
each and wires them to each other. Stripe keys are no longer stored on-chain:
`payment.configureStripe` now refuses and clears any stored key, and checkout
runs through the voice Worker on every network (its Stripe secrets are listed
under [Voice Agent → Secrets](#secrets)).

What `deploy.sh` can't do on its own is know the principals of the services
that call the canisters. Set these as **variables** (or secrets) on the
GitHub environment, and it grants them on every deploy. The grants are
idempotent; a failure is printed without stopping the deploy, so read the log.

| Variable | Grant |
|---|---|
| `NOTIFIER_PRINCIPAL` | `addNotifier` on `auth`, `property`, `job`, `quote` and `listing` for the notification relay (its principal is logged at startup) |
| `VOICE_WORKER_PRINCIPAL` | `payment.addStripeRelay`, `monitoring.addReporter`, `agent.addContactReader`, `photo.addPhotoRelay`, `job.addInboxRelay`, `contractor.addLicenseRelay`, `fee.addReferralRelay` and `property.addIdentityRelay` for the voice Worker (the principal of its `DFX_IDENTITY_PEM`, which must be **Ed25519**: `openssl genpkey -algorithm ed25519`) |
| `IOT_GATEWAY_PRINCIPAL` | `sensor.addGateway` for the IoT gateway. Without it, sensor accepts self-asserted device IDs |

To grant one by hand, as an admin of the canister:

```bash
icp canister call property addIdentityRelay '(principal "<voice worker>")' -e <env>
icp canister call listing  addNotifier      '(principal "<relay>")' -e <env>
```

## Upgrading Canisters

```bash
make upgrade
# or
bash scripts/upgrade.sh
```

`scripts/upgrade.sh` upgrades the core canisters (auth, property, job, contractor,
quote, payment, photo, monitoring) in place; `scripts/deploy.sh` upgrades all of
them. Canisters use `persistent actor` with enhanced orthogonal persistence — state
survives upgrades with no hooks, as long as the new stable types are compatible
with the running ones. The `stable-compat-check` CI job enforces that on every PR;
see [UPGRADE_RUNBOOK.md](UPGRADE_RUNBOOK.md).

## Checking Status

```bash
make status
# or
bash scripts/status.sh
```

## Controller Hardening

By default the deploying identity is the sole controller of every canister. A
compromised `MAINNET_IDENTITY_PEM` gives an attacker full control — they can
stop, delete, or replace any canister.

### Adding a backup controller

Set `BACKUP_CONTROLLER_PRINCIPAL` before deploying. The deploy script will add it
to all canisters. Note: `icp canister settings --add-controller` is not yet
documented — the script will print a warning until this is confirmed (see #174).

```bash
export BACKUP_CONTROLLER_PRINCIPAL=<your-hardware-wallet-or-secondary-principal>
bash scripts/deploy.sh ic
```

In GitHub Actions this should be a repository secret in the `production`
environment alongside `MAINNET_IDENTITY_PEM`.

### Viewing current controllers

```bash
icp canister status <canister-name> -e ic
```

### Rotating the primary controller

1. Add the new identity as a controller on all canisters (using icp canister
   settings when icp-cli documents the `--add-controller` flag; until then,
   use the IC management canister directly via the dashboard or SDK).
2. Verify the new identity can call admin methods.
3. Remove the old identity and rotate `MAINNET_IDENTITY_PEM` in GitHub Secrets.

**Never remove a controller before confirming the replacement has access.**

## Stripe Setup

### Local development

1. Create a Stripe account and switch to **Test mode**.
2. Create a **Pro** product at $59/year (annual only — this is the only
   homeowner plan offered for new purchases) and a **ContractorPro**
   product with Monthly and Yearly recurring prices.
3. Copy the `price_xxx` IDs and the test key pair into `.env`:

```env
STRIPE_SECRET_KEY=sk_test_...
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_PRICE_PRO_YEARLY=price_...
STRIPE_PRICE_CONTRACTOR_PRO_MONTHLY=price_...
STRIPE_PRICE_CONTRACTOR_PRO_YEARLY=price_...
```

`STRIPE_PRICE_PRO_MONTHLY` is optional — Pro is the single $59/year
homeowner plan. `priceIdFor(#Pro, #Monthly)` always
returns `null` regardless of whether `STRIPE_PRICE_PRO_MONTHLY` is set.

4. Start the voice agent: `cd agents/voice && npm run dev`
5. Test with card `4242 4242 4242 4242`, any future expiry, any CVC.

### Production

1. Switch the Stripe dashboard to **Live mode** and copy live key/price IDs.
2. Set `STRIPE_SECRET_KEY=sk_live_...` and `VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...`
   in your production environment.
3. Configure a Stripe webhook pointing at `https://<voice-worker>/api/stripe/webhook`
   and set its signing secret as `STRIPE_WEBHOOK_SECRET`. Send these events:
   `checkout.session.completed`, `invoice.paid`, `invoice.payment_succeeded`,
   `invoice.payment_failed`, `customer.subscription.updated`,
   `customer.subscription.deleted` and `identity.verification_session.verified`
   (and enable Stripe Identity in the same mode). Activation itself still
   happens when the success page calls verify-subscription.
4. Ensure `DFX_IDENTITY_PEM` is set as a Worker secret — the Worker calls the ICP
   payment canister directly via `@dfinity/agent` (no `dfx` binary required).

### How payment verification works

Stripe redirects to `/payment-success` immediately after card confirmation, before
its own webhook transitions the subscription from `incomplete` → `active`.
The verify endpoint therefore checks `paymentIntent.status === 'succeeded'`
(available immediately) rather than `subscription.status === 'active'`.

See [docs/EXTERNAL_APIS.md](EXTERNAL_APIS.md#0-stripe) for the full flow.

---

## Cycle Wallet Funding and Automated Top-Up

All 20 canisters (plus the frontend) burn cycles continuously, and each runs
with a **90-day freezing threshold** (set by `deploy.sh`). The `cycle-watchdog`
workflow runs **every hour** against mainnet and:

- checks the frontend canister answers and the voice Worker's `/health` is OK;
- reads every canister's balance and idle burn rate;
- tops up any canister that is low, from the CI identity's cycles ledger
  balance (refilled from `MAINNET_WALLET_ID`);
- emails `OPS_ALERT_EMAIL` and fails the run when anything is wrong.

It is currently **disabled** in GitHub (Actions → Cycle Watchdog → Enable
workflow). Enable it after the first mainnet deploy.

### Thresholds (configured in `scripts/lib/cycles.sh`)

Thresholds are days of idle burn **on top of** the freezing threshold, with an
absolute floor for call and compute burn:

| Label | When | Action |
|---|---|---|
| **Critical** | < 30 days before freezing, or < 1T | Watchdog run fails and emails |
| **Top up** | < 60 days before freezing, or < 2T | Topped up to the target |
| **Target** | 180 days before freezing, at least 5T | — |

`deploy.sh` applies the same top-up rule after every deploy.

### One-time setup: fund the CI cycles wallet

The `MAINNET_IDENTITY_PEM` identity needs a funded cycles wallet on mainnet. Do this once:

```bash
# 1. Get the principal for the CI identity
dfx identity import --storage-mode plaintext ci-watchdog /path/to/mainnet-identity.pem
dfx identity use ci-watchdog
dfx identity get-principal
# → e.g. abc12-defgh-...

# 2. On ICP mainnet: send ICP to that principal from the NNS dapp or exchange
#    Recommended initial funding: 5 ICP (~$25 at time of writing) ≈ 6.5T cycles

# 3. Convert ICP to cycles and create the wallet
dfx ledger create-canister $(dfx identity get-principal) --amount 5.0 --network ic
# → Canister ID printed; note it as your cycles wallet

# 4. Install the cycles wallet Wasm
dfx identity --network ic deploy-wallet <wallet-canister-id>

# 5. Verify
dfx wallet --network ic balance
```

### Topping up manually (ad-hoc)

```bash
# Check current balances (exits 1 when any canister is critical or unreadable)
ICP_ENV=ic bash scripts/check-cycle-health.sh

# Dry run — see what would be topped up without spending cycles
ICP_ENV=ic bash scripts/top-up-canisters.sh --dry-run

# Live top-up (needs the funded identity active in icp-cli, and in dfx when
# DFX_WALLET_ID is set to refill the ledger balance from the wallet)
ICP_ENV=ic DFX_WALLET_ID=<wallet> bash scripts/top-up-canisters.sh
```

### Required GitHub Actions secrets / variables (`production` environment)

| Name | Type | Description |
|---|---|---|
| `MAINNET_IDENTITY_PEM` | Secret | Ed25519 PEM of the funded CI identity (a controller of every canister) |
| `MAINNET_WALLET_ID` | Secret | Cycles wallet the top-ups are funded from |
| `VITE_VOICE_AGENT_URL` | Secret | The Worker whose `/health` is checked |
| `RESEND_API_KEY` | Secret | Sends the alert email |
| `OPS_ALERT_EMAIL` | Variable | Who gets the alert email. Without it (or the key), the failed run's GitHub notification is the only alert |
| `RESEND_FROM_ADDRESS` | Variable | Optional sender (default `noreply@homegentic.app`) |

### Ongoing maintenance

- **Refill the CI wallet** when `dfx wallet --network ic balance` falls below 10T cycles.
  At typical burn rates (~200B cycles/day across 20 canisters) this is roughly monthly.
- **Adjust thresholds** in `scripts/lib/cycles.sh`.
- Run the watchdog by hand via **Actions → Cycle Watchdog → Run workflow**, with
  `dry_run: true` to audit balances without spending cycles, or `env: testnet`
  to check testnet.

---

## Cleanup

```bash
make clean
```

Stops the local ICP network and removes local canister state. Use before a fresh deployment.
