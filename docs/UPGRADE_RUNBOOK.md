# Canister Upgrade Runbook

**14.4.3 — Stable memory schema migration safety**

This document describes how HomeGentic canisters are upgraded safely and the schema versioning convention for `ReportSnapshot`.

## How upgrades preserve state

Every canister is a `persistent actor` using Motoko's **enhanced orthogonal persistence (EOP)**. All `var`s are stable by default and survive upgrades as-is — there are no `preupgrade`/`postupgrade` hooks and no serialisation step. `transient` declarations reset on every upgrade (rate-limit windows, install-time constants).

EOP checks compatibility when the new Wasm is installed: if the new stable types can't accept the old data (a new non-optional field on a record stored in a `Map`, a changed field type, a narrowed variant), the upgrade is **rejected** with `RTS error: Memory-incompatible program upgrade` and the canister keeps running the old version. The only way past that is a reinstall, which wipes the canister's data.

**Safeguards:**
- **`stable-compat-check` (CI).** `scripts/ci/check-stable-compat.sh` compiles every canister at the PR's base and head with `moc --stable-types` and fails the PR if `moc --stable-compatible` reports a break. An intentional break needs the `allow-stable-break` label.
- **`scripts/deploy.sh`.** On testnet, an upgrade that fails with the error above is retried as a reinstall only for canisters listed in `TESTNET_REINSTALL_OK` (empty by default). On mainnet it never reinstalls.

---



---

## Schema Versioning

`ReportSnapshot` carries a `schemaVersion: ?Nat` field (added in 14.4.3):

| Version | Meaning |
|---------|---------|
| `null`  | Pre-14.4.3 snapshots (rooms field may be null) |
| `?1`    | Pre-1.4.7 snapshots migrated from V0 stable arrays |
| `?2`    | Current (14.4.3+) — includes `rooms` and `schemaVersion` |

The canister-level `SNAPSHOT_SCHEMA_VERSION : Nat` constant (a `transient let`, so a new value takes effect on upgrade) is stamped onto every new snapshot. Increment it any time `ReportSnapshot` gains a new required field.

**Rule:** New fields MUST use `?T` (optional) so that old serialized records deserialize safely to `null`. Never add a required non-optional field to an existing stable record type.

---

## Upgrade Procedure

All commands use icp-cli; swap `-e ic` for `-e testnet` / `-e local` as needed.

### Step 1 — Verify current state

```bash
make status                                     # canister IDs and cycle balances
icp canister call report getMetrics -e ic       # record current report/link counts
```

### Step 2 — Confirm the change is stable-compatible

The PR's `stable-compat-check` job must be green (or the break deliberate and labelled). To check locally against `main`:

```bash
bash scripts/ci/check-stable-compat.sh origin/main
```

### Step 3 — Stop accepting traffic (optional for low-risk upgrades)

```bash
icp canister call report pause '(null)' -e ic
```

### Step 4 — Deploy the upgrade

```bash
icp deploy report -e ic        # one canister
bash scripts/deploy.sh ic      # everything, in dependency order
```

The runtime swaps the Wasm and keeps the existing stable memory. If the types are incompatible the install is refused and the old version keeps running — nothing is lost, but the change has to be made compatible (or the canister reinstalled deliberately).

### Step 5 — Verify post-upgrade

```bash
icp canister call report getMetrics -e ic
# Confirm report/link counts match pre-upgrade values
icp canister call report getReport '("<a known token>")' -e ic
# Confirm an existing report still returns correctly
```

### Step 6 — Unpause (if paused in Step 3)

```bash
icp canister call report unpause -e ic
```

---

## Rollback Procedure

ICP canisters cannot be rolled back automatically — Wasm modules are replaced atomically. To roll back, redeploy the previous version from its git tag or commit (`git checkout <sha> && icp deploy report -e ic`).

1. Rolling back is itself an upgrade, so EOP applies: it succeeds only if the **old** types can accept the data as the new version left it.
2. If the new version only added `?T` fields or new variants that were never stored, rollback is usually safe. Run `check-stable-compat.sh` with the old commit as HEAD to confirm before deploying.
3. If the new version wrote data the old types can't represent, the rollback is refused. Fix forward instead.

**Never remove or rename a stable variable** unless you intend to drop its data.

---

## Adding a New Field to ReportSnapshot

1. Add the field as `?NewType` (not `NewType`) to `ReportSnapshot`, so existing records read it as `null`.
2. Set the field to `?<value>` in `generateReport`.
3. Pass the field through in `applyDisclosure` and any other place that reconstructs a snapshot literal.
4. Increment `SNAPSHOT_SCHEMA_VERSION` in the constants section.
5. Make sure `stable-compat-check` is green on the PR.
6. Update this document with the new version row in the Schema Versioning table above.
