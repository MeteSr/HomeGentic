# HomeGentic Deployment Guide

## Local Development

```bash
# Start local replica and deploy all canisters
make deploy

# Or manually:
dfx start --background --clean
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
dfx deploy --network ic

# 2. Build the frontend (reads .env for canister IDs; writes dist/.ic-assets.json5)
cd frontend && npm run build && cd ..

# 3. Deploy the frontend/assets canister (uploads dist/ including security headers)
dfx deploy frontend --network ic
```

Running `npm run build` before step 1 will produce a bundle with empty canister IDs.
Running `dfx deploy frontend` before step 2 will serve a stale build without the
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

Set `BACKUP_CONTROLLER_PRINCIPAL` before deploying. The script will call
`dfx canister update-settings --add-controller` for every canister.

```bash
export BACKUP_CONTROLLER_PRINCIPAL=<your-hardware-wallet-or-secondary-principal>
bash scripts/deploy.sh ic
```

In GitHub Actions this should be a repository secret in the `production`
environment alongside `MAINNET_IDENTITY_PEM`.

### Viewing current controllers

```bash
dfx canister info <canister-name> --network ic
```

### Rotating the primary controller

1. Add the new identity as a controller on all canisters:
   ```bash
   for c in auth property job contractor quote payment photo report \
             maintenance market sensor monitoring listing agent \
             recurring ai_proxy frontend; do
     dfx canister update-settings $c --add-controller <NEW_PRINCIPAL> --network ic
   done
   ```
2. Verify the new identity can call admin methods.
3. Remove the old identity:
   ```bash
   for c in auth property job contractor quote payment photo report \
             maintenance market sensor monitoring listing agent \
             recurring ai_proxy frontend; do
     dfx canister update-settings $c --remove-controller <OLD_PRINCIPAL> --network ic
   done
   ```
4. Rotate `MAINNET_IDENTITY_PEM` in GitHub Secrets.

**Never remove a controller before confirming the replacement has access.**

## Cleanup

```bash
make clean
```

Stops dfx and removes local canister state. Use before a fresh deployment.
