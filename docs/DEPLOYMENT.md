# HomeGentic Deployment Guide

## What gets deployed

| Component | Code | Ships via | Section |
|---|---|---|---|
| 20 Motoko canisters | `backend/` | `scripts/deploy.sh` (CI: `deploy-testnet.yml` on green `main`, `deploy-mainnet.yml` by hand) | [Mainnet Deployment](#mainnet-deployment), [One-time canister configuration](#one-time-canister-configuration) |
| Web app (assets canister) | `frontend/` | Built and uploaded by `scripts/deploy.sh` | [Frontend build variables](#frontend-build-variables) |
| Voice / AI Worker | `agents/voice/` | `deploy-voice-worker` job (Cloudflare) | [Voice Agent](#voice-agent-cloudflare-workers) |
| Lead email Worker | `agents/email/` | `deploy-email-worker` job (Cloudflare) | [Email Relay](#email-relay-cloudflare-workers) |
| Notification relay | `agents/notifications/` | Manual — any Node host | [Notification Relay](#notification-relay) |
| IoT gateway | `agents/iot-gateway/` | Manual — any Node host | [IoT Gateway](#iot-gateway) |
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
config in `agents/voice/wrangler.toml`). `agents/voice/server.ts` is the
older Express equivalent with the same routes (still usable locally with
`npm run build && npm start`, or via `agents/voice/Dockerfile`).

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
every voice/Stripe call would fall back to `http://localhost:3001` and be
blocked by the CSP. The Worker only accepts requests from its
`FRONTEND_ORIGIN`, so that must match the frontend that uses it.

### First-time setup

1. Create the rate-limit KV namespace and put its IDs in `wrangler.toml`
   (the committed `id` / `preview_id` are placeholders):
   ```bash
   cd agents/voice
   npx wrangler kv namespace create RATE_LIMIT
   npx wrangler kv namespace create RATE_LIMIT --preview
   ```
2. Set the secrets below with `npx wrangler secret put <NAME>`.
3. Deploy (`npx wrangler deploy`) and check `https://<worker>/health`.

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
| `VOICE_AGENT_API_KEY` | Shared secret sent by the frontend in `x-api-key` |
| `FRONTEND_ORIGIN` | Exact origin of the frontend canister (no trailing slash) |
| `STRIPE_SECRET_KEY` | Stripe secret key (`sk_live_...`) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret (`whsec_...`) |
| `STRIPE_PRICE_PRO_YEARLY` | Stripe price ID — the $59/year homeowner plan |
| `STRIPE_PRICE_CONTRACTOR_PRO_MONTHLY` | Stripe price ID |
| `STRIPE_PRICE_CONTRACTOR_PRO_YEARLY` | Stripe price ID |
| `STRIPE_PRICE_CREDITS_25` | Stripe price ID — agent-credit pack |
| `STRIPE_PRICE_CREDITS_100` | Stripe price ID — agent-credit pack |
| `DFX_IDENTITY_PEM` | Ed25519 PEM of the identity the Worker signs canister calls with. Make it a payment admin — [One-time canister configuration](#one-time-canister-configuration), step 2 |
| `CANISTER_ID_PAYMENT` | Payment canister ID |
| `CANISTER_ID_AUTH` | Auth canister ID — resolves the `x-agent-session` tokens that identify callers on `/api/chat` and `/api/agent`. Without it those routes return 401 in production |
| `CANISTER_ID_MONITORING` | Optional — monitoring canister, for frontend-error and cycle-alert routes |
| `BIDTOLIST_*` | Optional — Bid to List Stripe/Resend keys and canister IDs (see the comment block in `wrangler.toml`) |

`STRIPE_PRICE_PRO_MONTHLY` is optional (Pro is sold yearly only).
`RENTCAST_API_KEY` is optional — it enables `/api/rentcast/properties`
(year built / square footage in the Add Property wizard); without it the
route returns 503 and the wizard just skips the prefill.

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
`deploy-testnet.yml`. There is only one Worker (no `[env.testnet]`), so a
testnet deploy also redeploys the production email Worker.

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
(`npm ci && npm run build && npm start`). It is not deployed by CI and has no
Dockerfile in the repo — host it on any Node platform and set the variables below.

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
| `CANISTER_ID_CONTRACTOR` | Contractor canister — profiles for new-lead matching and contractors' notification email |
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
the job and quote outboxes and look up users' email on auth, either when deploying:

```bash
NOTIFIER_PRINCIPAL=<relay principal> bash scripts/deploy.sh <env>
```

(in CI, set the `NOTIFIER_PRINCIPAL` variable on the GitHub environment), or directly:

```bash
icp canister call auth  addNotifier '(principal "<relay principal>")' -e <env>
icp canister call job   addNotifier '(principal "<relay principal>")' -e <env>
icp canister call quote addNotifier '(principal "<relay principal>")' -e <env>
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
events to the `sensor` ICP canister. Like the notification relay it isn't
deployed by CI: host it on any Node platform over HTTPS
(`npm ci && npm run build && npm start`). Its default port, 3002, is the same as
the relay's, so set `IOT_GATEWAY_PORT` if they share a host.

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

Set these as EAS environment variables (they're inlined at build time):

| Variable | Description |
|---|---|
| `EXPO_PUBLIC_ICP_HOST` | ICP API host (`https://icp-api.io`) |
| `EXPO_PUBLIC_AUTH_CANISTER_ID`, `EXPO_PUBLIC_PROPERTY_CANISTER_ID`, `EXPO_PUBLIC_JOB_CANISTER_ID`, `EXPO_PUBLIC_QUOTE_CANISTER_ID`, `EXPO_PUBLIC_PHOTO_CANISTER_ID` | Canister IDs for the target environment (`canister_ids.json`) |
| `EXPO_PUBLIC_VOICE_AGENT_URL` | Voice Worker URL |
| `EXPO_PUBLIC_WEB_URL` | Web app origin, used for shareable report links (default `https://homegentic.app`) |
| `EXPO_PUBLIC_NOTIFICATIONS_URL` | Notification relay URL; without it the app skips push registration |

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
| `RESEND_API_KEY`, `RESEND_FROM_ADDRESS` | no | Set on `ai_proxy` (transactional email) |
| `OPEN_PERMIT_API_KEY`, `ATTOM_API_KEY` | no | Set on `ai_proxy` (permit and property-record lookups) |
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

Running `npm run build` before step 1 will produce a bundle with empty canister IDs.
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
| `VITE_IOT_GATEWAY_URL` | optional | IoT gateway URL for the device-linking OAuth popup (defaults to `http://localhost:3002`) |
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
each, wires them to each other and sets the `ai_proxy` keys. A few things it
can't do, because they need values or principals from other services. Do these
once per environment (`-e ic` or `-e testnet`), as the deploying identity:

1. **Stripe on the payment canister (mainnet checkout).** On mainnet
   (`DFX_NETWORK=ic`) the web app starts checkout by calling
   `payment.createStripeCheckoutSession`, which calls Stripe itself; local and
   testnet builds go through the voice Worker instead. Until it's configured,
   mainnet checkout fails with "Stripe is not configured":
   ```bash
   icp canister call payment configureStripe '(record {
     secretKey  = "sk_live_…";
     priceIds   = record {
       proMonthly           = "";
       proYearly            = "price_…";
       contractorProMonthly = "price_…";
       contractorProYearly  = "price_…";
     };
     successUrl = "https://<app-origin>/payment-success";
     cancelUrl  = "https://<app-origin>/payment-failure";
   })' -e ic
   ```
   The secret key is stored in the canister's state, which the subnet's node
   operators can read; use a [restricted key](https://docs.stripe.com/keys#limit-access)
   limited to Checkout Sessions.
2. **Let the voice Worker act on payments.** The Worker signs canister calls
   with `DFX_IDENTITY_PEM` (see [Voice Agent](#voice-agent-cloudflare-workers)),
   which must be an **Ed25519** key (`openssl genpkey -algorithm ed25519`).
   Its principal must be a payment admin.
3. **Allowlist the notification relay** on `auth`, `job` and `quote` — see
   [Notification Relay](#allowlist-the-relay-on-the-canisters).
4. **Allowlist the IoT gateway** on `sensor` — see [IoT Gateway](#iot-gateway).

`deploy.sh` makes the grants in steps 2 and 3 itself when these are set, on
every deploy (they're idempotent, and a failure is reported without stopping
the deploy):

| Variable | Grant |
|---|---|
| `NOTIFIER_PRINCIPAL` | `addNotifier` on `auth`, `job` and `quote` for the relay's principal (logged by the relay at startup) |
| `VOICE_WORKER_PRINCIPAL` | `payment.addAdmin` for the voice Worker's principal |

The deploy workflows read them from the GitHub environment's **variables**
(or secrets) of the same name. To grant by hand instead:

```bash
icp canister call auth    addNotifier "(principal \"<relay>\")" -e <env>
icp canister call job     addNotifier "(principal \"<relay>\")" -e <env>
icp canister call quote   addNotifier "(principal \"<relay>\")" -e <env>
icp canister call payment addAdmin    "(principal \"<voice worker>\")" -e <env>
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
   and set its signing secret as `STRIPE_WEBHOOK_SECRET`. The Worker handles
   `customer.subscription.updated`, `customer.subscription.deleted` and
   `invoice.payment_failed` (reverting the tier when a subscription lapses);
   activation itself still happens when the success page calls verify-subscription.
4. Ensure `DFX_IDENTITY_PEM` is set as a Worker secret — the Worker calls the ICP
   payment canister directly via `@dfinity/agent` (no `dfx` binary required).
5. On mainnet, configure Stripe on the payment canister too
   ([One-time canister configuration](#one-time-canister-configuration), step 1):
   mainnet builds create and verify Checkout Sessions from the canister rather
   than the Worker. It only calls the Checkout Sessions API, so a restricted key
   with just that permission is enough.

### How payment verification works

Stripe redirects to `/payment-success` immediately after card confirmation, before
its own webhook transitions the subscription from `incomplete` → `active`.
The verify endpoint therefore checks `paymentIntent.status === 'succeeded'`
(available immediately) rather than `subscription.status === 'active'`.

See [docs/EXTERNAL_APIS.md](EXTERNAL_APIS.md#0-stripe) for the full flow.

---

## Cycle Wallet Funding and Automated Top-Up

All 20 canisters burn cycles continuously. The `cycle-watchdog` workflow (runs every 6 hours)
checks balances and tops up any canister below 2T cycles. For this to work the CI identity
must hold enough cycles.

### Thresholds (configured in `cycle-watchdog.yml`)

| Label | Threshold | Action |
|---|---|---|
| **Warning** | < 4T cycles (2× trigger) | Logged in summary; no topup |
| **Trigger** | < 2T cycles | Automatic topup to 5T |
| **Critical** | < 5T (monitoring canister alert) | Email sent to `OPS_ALERT_EMAIL` |

The monitoring canister fires a `#Critical` alert at < 5T and a `#Warning` at < 10T via
`recordCanisterMetrics()` / `checkCycleLevels()`. These thresholds are defined as constants
in `backend/monitoring/main.mo` (`criticalCyclesT` / `warningCyclesT`).

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
# Check current balances
bash scripts/check-cycle-health.sh

# Dry run — see what would be topped up without spending cycles
DFX_NETWORK=ic bash scripts/top-up-canisters.sh --dry-run

# Live top-up (requires funded CI identity to be active)
DFX_NETWORK=ic bash scripts/top-up-canisters.sh
```

### Required GitHub Actions secrets / variables

| Name | Type | Description |
|---|---|---|
| `MAINNET_IDENTITY_PEM` | Secret | Ed25519 PEM of the funded CI identity |
| `RESEND_API_KEY` | Secret | Used to send critical-cycle alert emails |
| `OPS_ALERT_EMAIL` | Variable | Email address for cycle alert notifications |
| `MONITORING_CANISTER_ID` | Variable | Optional — overrides `monitoring` if using canister ID directly |

### Ongoing maintenance

- **Refill the CI wallet** when `dfx wallet --network ic balance` falls below 10T cycles.
  At typical burn rates (~200B cycles/day across 20 canisters) this is roughly monthly.
- **Adjust thresholds** by updating `TOP_UP_TRIGGER_T` / `TOP_UP_TARGET_T` in
  `cycle-watchdog.yml` and `criticalCyclesT` / `warningCyclesT` in `backend/monitoring/main.mo`.
- The cycle watchdog workflow can be triggered manually via **Actions → Cycle Watchdog → Run workflow**
  with `dry_run: true` to audit balances without spending cycles.

---

## Cleanup

```bash
make clean
```

Stops the local ICP network and removes local canister state. Use before a fresh deployment.
