# HomeFax Deployment Guide

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
bash scripts/deploy.sh --network testnet
```

Requires a DFX identity with cycles. Set `DFX_IDENTITY_PEM` as a GitHub secret for CI.

## Mainnet Deployment

```bash
bash scripts/deploy.sh --network ic
```

Requires:
1. A funded cycles wallet
2. DFX identity with controller permissions
3. `DFX_IDENTITY_PEM` secret configured in GitHub (production environment)

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

## Cleanup

```bash
make clean
```

Stops dfx and removes local canister state. Use before a fresh deployment.
