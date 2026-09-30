# HomeGentic Testing Guide

## Test suite overview

| Suite | Tool | Replica needed | Location |
|---|---|---|---|
| Unit + contract tests | Vitest | No | `frontend/src/__tests__/` |
| E2E tests | Playwright | Yes | `tests/e2e/` |
| Visual regression tests | Playwright | No (mock mode) | `tests/e2e/*.visual.spec.ts` |
| Accessibility (axe) | Playwright + axe | No (mock mode) | `tests/e2e/helpers/a11y.ts`, called from page specs |
| Backend canister tests | Bash + dfx | Yes | `backend/*/test.sh` |
| Cross-canister integration | Bash + dfx | Yes | `scripts/test-cross-canister.sh` |
| Stable-memory compatibility | `moc --stable-compatible` | No | `scripts/ci/check-stable-compat.sh` |
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

`frontend/src/__tests__/contracts/candid.contract.test.ts` — verifies that frontend IDL factories stay in sync with Motoko canister types. Covers 13 canisters: ai_proxy, auth, bills, contractor, job, listing, maintenance, payment, photo, property, quote, report, and sensor.

**If you change a canister type:**
1. Update the Motoko source in `backend/<canister>/main.mo`.
2. Update the corresponding IDL in `frontend/src/declarations/<canister>/index.ts` (`bash scripts/generate-declarations.sh` regenerates it if `dfx` is installed).
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
- **Candid contracts**: IDL factory signatures for the 13 canisters above (snapshot tests)

---

## End-to-end tests (Playwright)

Requires a running local replica and frontend dev server.

```bash
make start       # icp network start -d
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

Covered so far: landing page, pricing page, dashboard, property detail, jobs, contractors, market intelligence, sensors, people, and the AddPropertyModal onboarding wizard (address / details / saved-hub steps) — each at the desktop (1280×800), mobile (375×812), and tablet (768×1024) projects. A failure over 0.1% pixel diff (`maxDiffPixelRatio` in the config) fails the run; diffs are uploaded as a `visual-diff-report` artifact on CI failure.

**The tablet project exists specifically to catch a class of bug the other two miss**: short content under a viewport tall enough to reveal whatever's behind it. `min-height: "100%"` resolving to nothing (issue #520) only showed up at 768×1024 — desktop's content was usually tall enough to not expose it, and mobile (375px) is narrow enough that several of these pages fork to a dedicated mobile component with different markup entirely. When a new page's hg-v3 background needs to fill the viewport, give it a tablet baseline, not just desktop/mobile. Pages inside the app shell should size themselves with `SHELL_PAGE_MIN_HEIGHT` (`components/dashboardV3/chrome.tsx`), not a bare `100dvh`, or they'll scroll by the header's height.

**Sources of non-determinism handled explicitly — don't reintroduce them in a new spec:**
- **The clock.** Several pages render relative time ("3d ago") or `toLocaleDateString()` output from mock data timestamped `Date.now() - N`. Every visual spec calls `freezeClock(page)` (`tests/e2e/helpers/visual.ts`) *before* `page.goto()` so those strings are identical on the day a baseline is captured and every day after. It uses `page.clock.setFixedTime()`, not `pauseAt()`/`install()`, so real timers (toasts, the actor's `fetchRootKey` retry) keep running — only the reported wall clock is pinned.
- **CSS animations.** `animations: "disabled"` is set globally in `playwright.visual.config.ts`'s `expect.toHaveScreenshot`, so transitions/infinite animations don't produce a mid-animation frame.
- **Time-of-day copy.** The dashboard brief's greeting ("Good morning/afternoon/evening") depends on the runner's local hour, so `visual-dashboard.visual.spec.ts` masks `data-testid="brief-greeting"`.

**Updating baselines after an intentional design change:**
1. **Automatically, on the PR (the normal path).** When `test-visual` fails, CI's `test-visual-heal` job regenerates the baselines on the same runner and commits them to the branch as `test(visual): auto-heal baseline after layout change`. It also runs on pushes to `main`. Review the committed PNGs — heal accepts whatever the page now renders, so a real visual bug would be baked in; `test-e2e` and the axe checks are the safety net for that.
2. **On demand:** the **"Update visual regression baselines"** workflow (`.github/workflows/visual-baseline-update.yml`, Actions tab → Run workflow) regenerates the PNGs and uploads them as a `visual-snapshots-updated` artifact without committing.
3. **Locally:** `npm run test:visual:update` works for checking a change, but local fonts and Chromium differ from CI, so don't commit locally generated baselines.

**Deferred, not forgotten:** the public `ReportPage` (`/report/:token`) isn't baselined yet — it has no `window.__e2e_*` mock path today (see `frontend/src/services/report.ts`), so exercising it visually would mean adding new mock infrastructure rather than reusing what exists. Same for the AddPropertyModal's four optional post-save steps (photos, documents, ages, verify). Both are reasonable fast-follows against this same issue's pattern, not blockers.

---

## Backend canister tests (bash)

Requires a running local replica with deployed canisters. These suites still drive `dfx canister call` (they predate the move to icp-cli), so they need `dfx` on the PATH and canisters it can resolve by name.

```bash
make start && make deploy       # if not already running

npm run test:canister           # all canister test suites (test-backend.sh)
bash scripts/test-cross-canister.sh   # cross-canister integration scenarios
```

Individual canister test scripts:

```bash
bash backend/<canister>/test.sh   # any of: ai_proxy auth bills contractor job maintenance
                                  # market monitoring payment photo property quote recurring
                                  # report sensor
```

---

## Canister upgrade tests (PocketIC)

Verifies that [Enhanced Orthogonal Persistence (EOP)](https://docs.internetcomputer.org/motoko/fundamentals/actors/orthogonal-persistence/enhanced) correctly preserves canister state across upgrades. **WSL 2 is required** — no native Windows pocket-ic binary.

See [`tests/upgrade/README.md`](tests/upgrade/README.md) for full instructions. Quick start:

```bash
bash scripts/setup-pocketic.sh         # one-time: download pocket-ic binary to WSL
dfx build auth payment                 # compile Wasm (project root; tests read .dfx/local/canisters/)
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
One file per canister — `auth`, `contractor`, `job`, `monitoring`, `payment`, `property`, `quote`, `sensor` (`tests/upgrade/*.upgrade.test.ts`) — each writes representative state, upgrades, and asserts it survived. For example:

| File | Scenarios |
|---|---|
| `auth.upgrade.test.ts` | Profile fields, lastLoggedIn, getUserStats total, metrics consistency, three successive upgrades |
| `payment.upgrade.test.ts` | Pro tier + timestamps, getSubscriptionStats, estimatedMrrUsd |

---

## Stable-memory compatibility (CI gate)

`stable-compat-check` (`.github/workflows/stable-compat.yml`) runs on every PR: for each canister in `icp.yaml` it compiles the PR base and head with `moc --stable-types` and fails if `moc --stable-compatible` reports that the upgrade would be rejected. Run it locally with:

```bash
bash scripts/ci/check-stable-compat.sh origin/main
```

See [docs/UPGRADE_RUNBOOK.md](docs/UPGRADE_RUNBOOK.md) for what counts as a break and how to handle one.

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
- [x] Accessibility (a11y) tests — axe WCAG 2.1 AA scans via `assertNoA11yViolations` (`tests/e2e/helpers/a11y.ts`)
- [ ] Resend integration test (non-mocked, CI-only)
- [x] Canister upgrade tests for 8 canisters (the rest are covered by the `stable-compat-check` CI gate)
