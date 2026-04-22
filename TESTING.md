# HomeGentic Testing Guide

## Test suite overview

| Suite | Tool | Replica needed | Location |
|---|---|---|---|
| Unit + contract tests | Vitest | No | `frontend/src/__tests__/` |
| E2E tests | Playwright | Yes | `tests/e2e/` |
| Backend canister tests | Bash + dfx | Yes | `backend/*/test.sh` |
| Cross-canister integration | Bash + dfx | Yes | `scripts/test-cross-canister.sh` |
| Canister upgrade tests | PocketIC (WSL) | No | `tests/upgrade/` |
| Load tests | k6 | Yes | `tests/k6/` |

---

## Unit and contract tests (Vitest)

No replica required. Run from the project root:

```bash
npm run test:unit                   # all unit tests
npm run test:unit:watch             # watch mode
npm run test:unit:coverage          # with v8 coverage report
```

Or from `frontend/`:

```bash
cd frontend
npm run test:unit
npm run test:unit:watch
npm run test:unit:coverage
```

### Candid contract tests

`frontend/src/__tests__/contracts/candid.contract.test.ts` — verifies that frontend IDL factories stay in sync with Motoko canister types. Covers 13 canisters: auth, payment, job, property, listing, quote, contractor, photo, report, sensor, maintenance, agent, and bills.

**If you change a canister type:**
1. Update the Motoko source in `backend/<canister>/main.mo`.
2. Update the corresponding `idlFactory` in `frontend/src/services/<canister>.ts`.
3. Run with snapshot update: `cd frontend && npm run test:unit -- --update-snapshots`
4. Review the diff in `frontend/src/__tests__/contracts/__snapshots__/candid.contract.test.ts.snap`.
5. Commit the IDL factory change and the updated snapshot together.

### What the unit tests cover

- **Auth**: Registration, profile retrieval, role checking, profile updates, metrics, getUserStats
- **Property**: Registration, tier limits, property retrieval, verification workflow
- **Job**: Job creation, retrieval by owner and property, dual-signature flow, DIY jobs
- **Contractor**: Registration, profile retrieval, listing, trust scores, rate-limited reviews
- **Quote**: Request creation, bid submission, acceptance, tier enforcement
- **Payment**: Subscription creation, retrieval, getSubscriptionStats
- **Photo**: Photo upload (hash), retrieval by job, deduplication, tier quotas
- **Maintenance**: Predictive scheduling, seasonal tasks, system lifespan estimates
- **Sensor**: IoT device registration, Critical event → job creation
- **Listing**: FSBO lifecycle, sealed-bid offers
- **Email provider**: RateLimitedEmailProvider — daily/monthly counters, reset on day/month rollover
- **Candid contracts**: IDL factory signatures for auth, payment, job, property (snapshot tests)

---

## End-to-end tests (Playwright)

Requires a running local replica and frontend dev server.

```bash
make start       # dfx start --background
make deploy      # deploy all canisters
make frontend    # cd frontend && npm run dev  (separate terminal)

npm run test:e2e        # run all specs headlessly
npm run test:e2e:ui     # open Playwright UI
```

Specs live in `tests/e2e/`. Mock data injection uses `window.__e2e_*` globals — see `tests/e2e/helpers/testData.ts`.

---

## Backend canister tests (bash)

Requires a running local replica with deployed canisters.

```bash
make start && make deploy       # if not already running

npm run test:canister           # all canister test suites (test-backend.sh)
bash scripts/test-cross-canister.sh   # cross-canister integration scenarios
```

Individual canister test scripts:

```bash
bash backend/auth/test.sh
bash backend/property/test.sh
bash backend/job/test.sh
bash backend/contractor/test.sh
bash backend/quote/test.sh
bash backend/payment/test.sh
bash backend/photo/test.sh
bash backend/report/test.sh
bash backend/maintenance/test.sh
bash backend/recurring/test.sh
bash backend/monitoring/test.sh
```

---

## Canister upgrade tests (PocketIC)

Verifies that [Enhanced Orthogonal Persistence (EOP)](https://docs.internetcomputer.org/motoko/fundamentals/actors/orthogonal-persistence/enhanced) correctly preserves canister state across upgrades. **WSL 2 is required** — no native Windows pocket-ic binary.

See [`tests/upgrade/README.md`](tests/upgrade/README.md) for full instructions. Quick start:

```bash
bash scripts/setup-pocketic.sh         # one-time: download pocket-ic binary to WSL
dfx build auth payment                 # compile Wasm (project root)
cd tests/upgrade && npm install        # one-time: install @dfinity/pic
POCKET_IC_BIN=~/.local/bin/pocket-ic npm test
```

Or via root script:

```bash
npm run test:upgrade
```

### What's tested

| File | Scenarios |
|---|---|
| `auth.upgrade.test.ts` | Profile fields, lastLoggedIn, getUserStats total, metrics consistency, three successive upgrades |
| `payment.upgrade.test.ts` | Pro/Premium tier + timestamps, getSubscriptionStats, estimatedMrrUsd |

---

## Load tests (k6)

```bash
bash scripts/load-test.sh 50
# or
cd tests/k6 && k6 run <script>.js
```

Runs metric query load against auth and property canisters. Requires a running replica.

---

## Testing gap backlog

Open items tracked at [MeteSr/HomeGentic#33](https://github.com/MeteSr/HomeGentic/issues/33):

- [ ] Visual regression tests (Playwright `toHaveScreenshot()`)
- [ ] Accessibility (a11y) tests (`@axe-core/playwright`)
- [ ] Resend integration test (non-mocked, CI-only)
- [ ] Canister upgrade tests — additional canisters beyond auth/payment (low priority; EOP covers the main risk)
