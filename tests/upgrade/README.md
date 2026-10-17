# Canister Upgrade Tests

Verifies that [Enhanced Orthogonal Persistence (EOP)](https://docs.internetcomputer.org/motoko/fundamentals/actors/orthogonal-persistence/enhanced) works correctly — state inserted before a canister upgrade is fully intact after.

**These tests require WSL 2.** The PocketIC server has no native Windows binary.

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
