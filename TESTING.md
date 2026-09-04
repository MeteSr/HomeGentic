# HomeGentic Testing Guide

## Test suite overview

| Suite | Tool | Replica needed | Location |
|---|---|---|---|
| Unit + contract tests | Vitest | No | `frontend/src/__tests__/` |
| E2E tests | Playwright | Yes | `tests/e2e/` |
| Visual regression tests | Playwright | No (mock mode) | `tests/e2e/*.visual.spec.ts` |
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

## Visual regression tests (Playwright)

Pixel-diff snapshots of key pages, run against `window.__e2e_*` mock data — no replica needed. A separate config (`playwright.visual.config.ts`) from the functional E2E suite, so `npm run test:e2e` never touches these baselines and vice versa. Specs are named `*.visual.spec.ts` and live alongside the functional specs in `tests/e2e/`; the two configs' `testMatch`/`testIgnore` keep them from double-running each other.

```bash
make start && make frontend     # replica isn't required, but the dev server is

npm run test:visual             # compare against the committed baselines
npm run test:visual:update      # regenerate baselines after an intentional design change
```

Covered so far: landing page, pricing page, dashboard, property detail, and the AddPropertyModal onboarding wizard (address / details / saved-hub steps) — each at both the desktop (1280×800) and mobile (375×812) projects. A failure over 0.1% pixel diff (`maxDiffPixelRatio` in the config) fails the run; diffs are uploaded as a `visual-diff-report` artifact on CI failure.

**Two sources of non-determinism are handled explicitly, don't reintroduce them in a new spec:**
- **The clock.** Several pages render relative time ("3d ago") or `toLocaleDateString()` output from mock data timestamped `Date.now() - N`. Every visual spec calls `freezeClock(page)` (`tests/e2e/helpers/visual.ts`) *before* `page.goto()` so those strings are identical on the day a baseline is captured and every day after. It uses `page.clock.setFixedTime()`, not `pauseAt()`/`install()`, so real timers (toasts, the actor's `fetchRootKey` retry) keep running — only the reported wall clock is pinned.
- **CSS animations.** `animations: "disabled"` is set globally in `playwright.visual.config.ts`'s `expect.toHaveScreenshot`, so transitions/infinite animations don't produce a mid-animation frame.

**Updating baselines after an intentional design change:**
1. Locally: `npm run test:visual:update`, review the diff in `git diff tests/e2e/__snapshots__/`, commit.
2. From CI (recommended — matches the exact browser build `test-visual` compares against): run the **"Update visual regression baselines"** workflow (`.github/workflows/visual-baseline-update.yml`, Actions tab → Run workflow). It's `workflow_dispatch`-only and never commits by itself — it uploads the regenerated PNGs as a `visual-snapshots-updated` build artifact for a maintainer to download, review, and commit.

**Deferred, not forgotten:** the public `ReportPage` (`/report/:token`) isn't baselined yet — it has no `window.__e2e_*` mock path today (see `frontend/src/services/report.ts`), so exercising it visually would mean adding new mock infrastructure rather than reusing what exists. Same for the AddPropertyModal's four optional post-save steps (photos, documents, ages, verify). Both are reasonable fast-follows against this same issue's pattern, not blockers.

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

- [x] Visual regression tests (Playwright `toHaveScreenshot()`) — [#432](https://github.com/MeteSr/HomeGentic/issues/432)
- [ ] Accessibility (a11y) tests (`@axe-core/playwright`)
- [ ] Resend integration test (non-mocked, CI-only)
- [ ] Canister upgrade tests — additional canisters beyond auth/payment (low priority; EOP covers the main risk)
