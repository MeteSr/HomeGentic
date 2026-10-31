# Canister Upgrade Tests

Verifies that [Enhanced Orthogonal Persistence (EOP)](https://docs.internetcomputer.org/motoko/fundamentals/actors/orthogonal-persistence/enhanced) works correctly — state inserted before a canister upgrade is fully intact after.

**These tests require WSL 2.** The PocketIC server has no native Windows binary.

**Why `@dfinity/pic` stays at 0.21 (with `@icp-sdk/core` 5) here.** The rest of the repo is on core 6. The first pic release that supports core 6 is 0.24, and it brings PocketIC server 16; this suite uses 0.21, which runs server 12. Under server 16, `scaling.perf.test.ts` measures about 1.5x growth after the fill even for main's unchanged Wasm (server 12 measures 1.01x). Since the check can't tell that apart from a full scan, the bump waits until the check is reworked.

---

## First-time setup

**1. Install the PocketIC server binary (WSL)**

```bash
bash scripts/setup-pocketic.sh
```

This downloads the binary to `~/.local/bin/pocket-ic`. Add to `~/.bashrc` or `~/.zshrc` so you don't need to set it each time:

```bash
export POCKET_IC_BIN=~/.local/bin/pocket-ic
```

**2. Install test dependencies**

```bash
cd tests/upgrade && npm install
```

**3. Compile the canister Wasm files**

From the project root (needs `moc` via mops; no replica or dfx):

```bash
bash scripts/ci/build-upgrade-wasms.sh                # every canister in this checkout
bash scripts/ci/build-upgrade-wasms.sh main photo job # also build `main` as the upgrade base
```

This checkout's Wasm lands at `.dfx/local/canisters/<name>/<name>.wasm`; a base ref's at `.dfx/base/canisters/<name>/<name>.wasm`. `from-base.upgrade.test.ts` upgrades from the base build to this one and skips when no base build exists. Rebuild whenever you change a Motoko source file. CI's `test-upgrade` job does the same against the PR's base commit.

**Same-round calls.** `Promise.all` over ordinary actors doesn't guarantee two calls interleave: the first can finish before the second is submitted. Use `sameRound()` from `__helpers__/setup.ts`, which submits every call before awaiting any. Within one round the execution order isn't the submission order, so a race test should check its invariant for either order (see the FSBO case in `concurrency.canister.test.ts`).

---

## Running the tests

```bash
# From the project root:
npm run test:upgrade

# Or directly (inline env var if not set in profile):
cd tests/upgrade
POCKET_IC_BIN=~/.local/bin/pocket-ic npm test
```

---

## What's tested

| File | Canister | Scenarios |
|---|---|---|
| `auth.upgrade.test.ts` | auth | Profile fields, lastLoggedIn timestamp, getUserStats total, metrics consistency, three successive upgrades |
| `payment.upgrade.test.ts` | payment | Pro/ContractorPro subscription tier + timestamps, getSubscriptionStats totals, estimatedMrrUsd |
| `all-canisters.upgrade.test.ts` | all 20 | Generic: writes through every non-destructive update with plausible arguments, upgrades from the base build, and checks every query answers the same |
| `authz-sweep.canister.test.ts` | all 20, wired | Every update method called by a stranger and anonymously; what gets through must match `authz-expectations.json` (regenerate with `UPDATE_AUTHZ=1` after a deliberate change, and review the diff) |
| `concurrency.canister.test.ts` | property, payment, job, quote, listing, market | Calls submitted in the same round (`sameRound`): tier limits, one home per address (incl. bulk import), one accepted quote, one invite redemption, FSBO score hide during a show |
| `property-access.canister.test.ts` | property, job, bills, recurring, payment | Ownership transfer (seller and delegates lose access everywhere, buyer keeps history), managers and their roles, approval requests |
| `payment.canister.test.ts` | payment | Stripe relay rules: relay-only, one grant per Stripe reference (also same-round), gifts never shorten a running plan, agent credits never below zero |
| `wired-indexes.upgrade.test.ts` | all 20, wired | Seeded through the real cross-canister flows (homes, jobs, proposal, quote, bills, recurring visits, maintenance plan, sensor events, an awarded Bid to List bid with its fee and review), all upgraded together from the base build: every index-backed read answers the same, new writes land in the rebuilt indexes, and the monitoring stale-metrics timer still fires |
| `browser-flow.live.test.ts` | all 20, wired, in Chromium | The web app (Vite dev server) against PocketIC's HTTP gateway, nothing mocked: sign-up, add a home, log and sign a job, invite the contractor, who signs from the link; an admin verifies them on /admin; a realtor is reviewed, browses and bids; gift and manager-invite links for a new person. Needs the root `npm install` and Playwright's Chromium (`npx playwright install chromium`) |

---

## Adding a test for a new canister

1. Add an IDL factory for the canister to `__helpers__/setup.ts`.
2. Create `<canister>.upgrade.test.ts` following the existing pattern:
   - `beforeAll`: `createPic()` → `setupCanister()` with the canister's Wasm and IDL.
   - Seed state via actor calls.
   - Call `pic.upgradeCanister({ canisterId, wasm: WASM })`.
   - Assert the seeded state is unchanged.
   - `afterAll`: `pic.tearDown()`.
3. Rebuild the Wasm (`dfx build <canister>`) and run `npm test`.

---

## Updating snapshots after an intentional type change

Upgrade tests don't use snapshots — they make explicit assertions. If you change a type, update the assertions and the IDL factory in `__helpers__/setup.ts` to match.

For IDL factory drift in the *frontend* services, see the Candid contract tests:

```bash
cd frontend && npm run test:unit -- --update-snapshots
```
