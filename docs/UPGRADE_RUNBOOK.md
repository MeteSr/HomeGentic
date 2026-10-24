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

## Schema Versioning

`ReportSnapshot` carries a `schemaVersion: ?Nat` field (added in 14.4.3):

| Version | Meaning |
|---------|---------|
| `null`  | Pre-14.4.3 snapshots (rooms field may be null) |
| `?1`    | Pre-1.4.7 snapshots migrated from V0 stable arrays |
| `?2`    | Current (14.4.3+) — includes `rooms` and `schemaVersion` |

The canister-level `SNAPSHOT_SCHEMA_VERSION : Nat` constant (a `transient let`, so a new value takes effect on upgrade) is stamped onto every new snapshot. Increment it any time `ReportSnapshot` gains a new required field.

**Rule:** Don't change the fields of a stored record type, not even to add an optional `?T` field: EOP rejects that upgrade too. Keep new data in a new stable var with an inline initializer (for example a side `Map` keyed by the record's id), as CLAUDE.md describes.

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
bash scripts/deploy.sh ic      # everything, in dependency order (preferred)
```

For each canister that already exists, `deploy.sh` stops it, takes a snapshot (replacing the previous pre-deploy snapshot, so there is one per canister), installs the new Wasm and starts it again. If the snapshot can't be taken, that canister is not upgraded and the deploy fails at the end. The snapshot IDs are printed under "Pre-upgrade snapshots".

To upgrade one canister by hand, do the same steps:

```bash
icp canister stop report -e ic
icp canister snapshot create report -e ic          # note the snapshot ID
icp deploy report -e ic
icp canister start report -e ic
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

Every successful mainnet deploy is tagged `mainnet-YYYYMMDD-HHMMSS` on the commit it ran (`git tag -l 'mainnet-*'`), so the last good version is always known.

### Option A — restore the pre-upgrade snapshot (code and data)

Use this when an upgrade broke a canister or corrupted its data. It puts back the Wasm **and** the state exactly as they were before the deploy, so anything written since the upgrade is lost.

```bash
icp canister snapshot list report -e ic            # the pre-deploy snapshot
icp canister stop report -e ic
icp canister snapshot restore report <snapshot-id> -e ic
icp canister start report -e ic
```

### Option B — redeploy the previous code (keeps current data)

```bash
git checkout <last mainnet-* tag>
bash scripts/deploy.sh ic     # or: icp deploy report -e ic for one canister
```

1. Rolling back is itself an upgrade, so EOP applies: it succeeds only if the **old** types can accept the data as the new version left it.
2. If the new version only added new stable vars, rollback is usually safe (the old code drops them). Run `check-stable-compat.sh` with the old commit as HEAD to confirm before deploying.
3. If the new version wrote data the old types can't represent, the rollback is refused. Use Option A, or fix forward.

**Never remove or rename a stable variable** unless you intend to drop its data.

### A deploy that failed part-way

`deploy.sh` keeps going after a canister fails to install, then exits non-zero, so the other canisters are on the new version and the failed one is on the old one. Read the failed canister's log in the deploy output, fix it, and run `deploy.sh` again (it is safe to re-run; already-upgraded canisters just upgrade to the same code). If the mix of versions breaks the app in the meantime, restore the canisters that did upgrade with Option A.

### The voice Worker

```bash
cd agents/voice
npx wrangler deployments list      # recent versions
npx wrangler rollback              # back to the previous version
```

Add `--env testnet` for the testnet Worker. Worker secrets are not rolled back.

---

## Incident checklist

1. **Contain.** Pause the affected canister so it stops taking writes: `icp canister call <canister> pause '(null)' -e ic` (`unpause` when fixed). For the voice Worker, roll it back as above.
2. **Tell affected users** by email. There is no status page yet.
3. **Roll back** with Option A or B above, or fix forward and redeploy.
4. **Check** that the Cycle Watchdog run after the fix is green (it checks the frontend, the Worker's `/health` and every canister's cycles).
5. **Write down** what happened and what changes, in the PR that fixes it.

---

## Adding a New Field to ReportSnapshot

1. Don't add it to `ReportSnapshot` itself (that breaks the upgrade). Add a new stable `Map` from snapshot ID to the new value, with an inline initializer; snapshots made before the change simply have no entry.
2. Write the entry in `generateReport`.
3. Read it back wherever the snapshot is returned (`getReport`, `applyDisclosure`), and include it in the API type the frontend sees if it needs it.
4. Increment `SNAPSHOT_SCHEMA_VERSION` in the constants section.
5. Make sure `stable-compat-check` is green on the PR.
6. Update this document with the new version row in the Schema Versioning table above.
