# HomeGentic Deployment Guide

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
**test** keys and price IDs, the testnet `CANISTER_ID_PAYMENT` (see
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
| `DFX_IDENTITY_PEM` | Ed25519 PEM of the identity registered as admin in the payment canister |
| `CANISTER_ID_PAYMENT` | Payment canister ID |
| `CANISTER_ID_MONITORING` | Optional — monitoring canister, for frontend-error and cycle-alert routes |
| `BIDTOLIST_*` | Optional — Bid to List Stripe/Resend keys and canister IDs (see the comment block in `wrangler.toml`) |

Rentcast lookups (`/api/rentcast/properties`) exist only on the legacy
Express server and need `RENTCAST_API_KEY` there.

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
`deploy-email-worker` job in `deploy-mainnet.yml`. Secrets (set with
`npx wrangler secret put`): `RESEND_API_KEY`, and `ROUTE_CONFIG` — a JSON
array mapping each allowed origin to its to/from addresses.

---

## Notification Relay

The notification relay (`agents/notifications/`) is a standalone Node service
(`npm run build && npm start`). It is not deployed by CI and has no Dockerfile
in the repo — host it on any Node platform and set the variables below.

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
| `APNS_KEY_ID` | Apple APNs Auth Key ID (for iOS push) |
| `APNS_TEAM_ID` | Apple Team ID |
| `APNS_PRIVATE_KEY` | APNs `.p8` private key content |
| `FCM_PROJECT_ID` | Firebase project ID (for Android push) |
| `FCM_SERVICE_ACCOUNT_JSON` | Firebase service account JSON (for Android push) |

VAPID keys are stable — regenerate only if the private key is compromised (invalidates all existing browser subscriptions).

`INTERNAL_API_KEY` gates both `/api/push/send` and `/api/push/register`. It must be set in production — the server throws at startup if it is absent when `NODE_ENV=production`.

### Generate VAPID keys (first-time only)

```bash
cd agents/notifications && node -e "const wp=require('web-push'); const k=wp.generateVAPIDKeys(); console.log(JSON.stringify(k,null,2))"
```

---

## IoT Gateway

The IoT gateway (`agents/iot-gateway/`) is a Node/Express server that ingests
sensor events, manages OAuth credentials for smart-home platforms, and writes
events to the `sensor` ICP canister.

### Required environment variables

| Variable | Description |
|---|---|
| `NODE_ENV` | `production` |
| `IOT_GATEWAY_PORT` | Port to listen on (default `3002`) |
| `SENSOR_CANISTER_ID` | ICP principal of the `sensor` canister |
| `ADMIN_TOKEN` | Strong random secret required in `x-admin-token` on `POST /accounts/:platform` (credential proxy) and `GET /oauth/start/*` (OAuth initiation). Server logs a warning and disables the credential proxy endpoint if unset. Generate with `openssl rand -hex 32`. |
| `FRONTEND_ORIGIN` | Exact origin of the frontend — used in `postMessage` responses from the OAuth device picker |
| `HONEYWELL_CLIENT_ID` | Honeywell Home OAuth app client ID |
| `HONEYWELL_CLIENT_SECRET` | Honeywell Home OAuth app client secret |
| `GE_CLIENT_ID` | GE SmartHQ OAuth app client ID |
| `GE_CLIENT_SECRET` | GE SmartHQ OAuth app client secret |

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

## Mainnet Deployment

```bash
bash scripts/deploy.sh ic
```

Requires:
1. A funded cycles wallet
2. DFX identity with controller permissions
3. `DFX_IDENTITY_PEM` secret configured in GitHub (production environment)
4. `VITE_VOICE_AGENT_URL` set in `.env` to your production voice agent domain

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
