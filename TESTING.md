# HomeGentic Testing Guide

## Running All Backend Tests

```bash
make test
# or
bash scripts/test-backend.sh
```

This runs the full auth and property canister test suite, including upgrade persistence tests.

## Running Individual Canister Tests

Each canister has its own test script:

```bash
bash backend/auth/test.sh
bash backend/property/test.sh
bash backend/job/test.sh
bash backend/contractor/test.sh
bash backend/quote/test.sh
bash backend/price/test.sh
bash backend/payment/test.sh
bash backend/photo/test.sh
```

## Prerequisites

1. DFX must be running: `make start` or `dfx start --background`
2. Canisters must be deployed: `make deploy`

## Load Testing

```bash
bash scripts/load-test.sh 50
```

Runs 50 iterations of metric queries against auth and property canisters.

## Frontend Testing

```bash
cd frontend && npm run build
```

TypeScript compilation errors will surface during the build.

## What the Tests Cover

- **Auth**: Registration, profile retrieval, role checking, profile updates, metrics
- **Property**: Registration, tier limits, property retrieval, metrics, upgrade persistence
- **Job**: Job creation, retrieval by owner and property
- **Contractor**: Registration, profile retrieval, listing all contractors
- **Quote**: Request creation, retrieval by owner and ID
- **Price**: Pricing retrieval for all tiers
- **Payment**: Subscription creation and retrieval
- **Photo**: Photo upload (hash), retrieval by job, count queries

## Upgrade Persistence

The main test suite (`test-backend.sh`) includes explicit upgrade tests:
- Upgrades auth and property canisters with `--upgrade-unchanged`
- Verifies data (profiles, properties) still exists after upgrade
- This validates the `preupgrade`/`postupgrade` hook implementation
