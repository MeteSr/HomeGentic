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

Requires a DFX identity with cycles. Set `DFX_IDENTITY_PEM` as a GitHub secret for CI.

## Voice Agent (Railway)

The voice agent (`agents/voice/`) is a Node/Express server that proxies Claude API
calls and handles Stripe payments. It is deployed separately to
[Railway](https://railway.app) — not to ICP.

### First deploy

1. Create a new Railway project and connect the GitHub repo.
2. In **Settings → Build**:
   - Root Directory: `/` (repo root — required for the Dockerfile build context)
   - Dockerfile Path: `agents/voice/Dockerfile`
3. In **Settings → Deploy**, the health check path `/health` and timeout 30 s are
   already set via `agents/voice/railway.json`.
4. Add all required environment variables (see below).
5. Deploy. Verify at `https://<your-service>.railway.app/health` — all `checks`
   should be `true`.

### Required environment variables

| Variable | Description |
|---|---|
| `NODE_ENV` | `production` |
| `ANTHROPIC_API_KEY` | Claude API key (`sk-ant-...`) |
| `VOICE_AGENT_API_KEY` | Shared secret sent by the frontend in `x-api-key` |
| `FRONTEND_ORIGIN` | Exact origin of the frontend canister (no trailing slash) |
| `STRIPE_SECRET_KEY` | Stripe live secret key (`sk_live_...`) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret (`whsec_...`) |
| `STRIPE_PRICE_BASIC_MONTHLY` | Stripe price ID |
| `STRIPE_PRICE_BASIC_YEARLY` | Stripe price ID |
| `STRIPE_PRICE_PRO_MONTHLY` | Stripe price ID |
| `STRIPE_PRICE_PRO_YEARLY` | Stripe price ID |
| `STRIPE_PRICE_PREMIUM_MONTHLY` | Stripe price ID |
| `STRIPE_PRICE_PREMIUM_YEARLY` | Stripe price ID |
| `STRIPE_PRICE_CONTRACTOR_PRO_MONTHLY` | Stripe price ID |
| `STRIPE_PRICE_CONTRACTOR_PRO_YEARLY` | Stripe price ID |
| `STRIPE_PRICE_CREDITS_25` | Stripe price ID |
| `STRIPE_PRICE_CREDITS_100` | Stripe price ID |
| `DFX_IDENTITY_PEM` | Ed25519 PEM of the identity registered as admin in the payment canister — same value as the `DFX_IDENTITY_PEM` GitHub secret used for testnet deploys |

`CANISTER_ID_PAYMENT` is optional; it defaults to the testnet canister
`a3shm-xiaaa-aaaaj-a6moa-cai`. Override only when deploying against a different
payment canister.

### How canister calls work in production

After Stripe confirms payment, the voice server calls the ICP payment canister
directly via `@dfinity/agent` (see `agents/voice/paymentCanister.ts`). It uses
the Ed25519 identity from `DFX_IDENTITY_PEM` to authenticate as an admin and
invoke `adminActivateStripeSubscription`, `adminGrantAgentCredits`, or
`consumeAgentCredit`. No `dfx` binary is required at runtime.

Locally, `DFX_IDENTITY_PEM` is typically unset — canister calls gracefully degrade
with a `console.warn` and the activation is skipped. See issue #217 for the
planned local integration test path.

### Subsequent deploys

Railway redeploys automatically on every push to `main`. No manual steps needed
unless environment variables change.

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

All canisters use `persistent actor` with upgrade hooks — data is preserved automatically.

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

**Never remove a controller before confirming the replacement has access.**

## Stripe Setup

### Local development

1. Create a Stripe account and switch to **Test mode**.
2. Create four products in the Stripe dashboard — Pro, Premium, ContractorPro —
   each with a Monthly and Yearly recurring price.
3. Copy the six `price_xxx` IDs and the test key pair into `.env`:

```env
STRIPE_SECRET_KEY=sk_test_...
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_PRICE_PRO_MONTHLY=price_...
STRIPE_PRICE_PRO_YEARLY=price_...
STRIPE_PRICE_PREMIUM_MONTHLY=price_...
STRIPE_PRICE_PREMIUM_YEARLY=price_...
STRIPE_PRICE_CONTRACTOR_PRO_MONTHLY=price_...
STRIPE_PRICE_CONTRACTOR_PRO_YEARLY=price_...
```

4. Start the voice agent: `cd agents/voice && npm run dev`
5. Test with card `4242 4242 4242 4242`, any future expiry, any CVC.

### Production

1. Switch the Stripe dashboard to **Live mode** and copy live key/price IDs.
2. Set `STRIPE_SECRET_KEY=sk_live_...` and `VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...`
   in your production environment.
3. Configure a Stripe webhook pointing at `https://your-domain/api/stripe/webhook`
   for the `payment_intent.succeeded` and `customer.subscription.updated` events
   (not yet wired — currently the success page calls verify-subscription directly).
4. Ensure `DFX_IDENTITY_PEM` is set in Railway — the voice server calls the ICP
   payment canister directly via `@dfinity/agent` (no `dfx` binary required).

### How payment verification works

Stripe redirects to `/payment-success` immediately after card confirmation, before
its own webhook transitions the subscription from `incomplete` → `active`.
The verify endpoint therefore checks `paymentIntent.status === 'succeeded'`
(available immediately) rather than `subscription.status === 'active'`.

See [docs/EXTERNAL_APIS.md](EXTERNAL_APIS.md#0-stripe) for the full flow.

## Cleanup

```bash
make clean
```

Stops the local ICP network and removes local canister state. Use before a fresh deployment.
