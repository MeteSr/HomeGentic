# Canister Upgrade Runbook

**14.4.3 — Stable memory schema migration safety**

This document describes the safe upgrade procedure for HomeFax canisters and the schema versioning convention for `ReportSnapshot`.

---

## Schema Versioning

`ReportSnapshot` carries a `schemaVersion: ?Nat` field (added in 14.4.3):

| Version | Meaning |
|---------|---------|
| `null`  | Pre-14.4.3 snapshots (rooms field may be null) |
| `?1`    | Pre-1.4.7 snapshots migrated from V0 stable arrays |
| `?2`    | Current (14.4.3+) — includes `rooms` and `schemaVersion` |

The canister-level `snapshotSchemaVersion : Nat` stable variable tracks the schema the canister was last deployed with. Increment it any time `ReportSnapshot` gains a new required field.

**Rule:** New fields MUST use `?T` (optional) so that old serialized records deserialize safely to `null`. Never add a required non-optional field to an existing stable record type.

---

## Upgrade Procedure

### Step 1 — Verify current state

```bash
make status                        # confirm canister IDs and cycle balances
dfx canister call report metrics   # record current report/link counts
```

### Step 2 — Backup stable state (optional but recommended)

```bash
# Export current stable data to a local file (requires dfx 0.15+)
dfx canister call report getAllSnapshots  # manual audit dump if exposed
```

### Step 3 — Stop accepting traffic (optional for low-risk upgrades)

```bash
dfx canister call report pause '()'
```

### Step 4 — Deploy the upgrade

```bash
dfx deploy report --upgrade-unchanged
```

Motoko's upgrade runtime will:
1. Run `preupgrade()` — serialise HashMaps into stable arrays
2. Replace the wasm module
3. Run `postupgrade()` — deserialise stable arrays into HashMaps, run any migration logic

### Step 5 — Verify post-upgrade

```bash
dfx canister call report metrics
# Confirm report/link counts match pre-upgrade values
dfx canister call report getReport '("<a known token>")'
# Confirm an existing report still returns correctly
```

### Step 6 — Unpause (if paused in Step 3)

```bash
dfx canister call report unpause '()'
```

---

## Rollback Procedure

ICP canisters cannot be rolled back automatically — wasm modules are replaced atomically. To roll back:

1. Keep the previous wasm binary (built artifact from `dfx build`) in version control or a build artefact store.
2. Re-deploy the old wasm:
   ```bash
   dfx canister install report --mode upgrade --wasm path/to/previous/report.wasm
   ```
3. If the schema change added a `?T` field, rollback is safe — old code will ignore the unknown field in serialized records.
4. If the schema change removed a field or changed a field type, rollback may fail with a type mismatch. In that case, restore from a backup.

**Never remove or rename a stable variable** — the runtime treats this as deletion and the data is lost.

---

## Adding a New Field to ReportSnapshot

1. Add the field as `?NewType` (not `NewType`) to `ReportSnapshot`.
2. Add the same field to any `ReportSnapshotVN` migration types that need it, or let `null` serve as the default.
3. Set the field to `?<value>` in `generateReport`.
4. Pass the field through in `applyDisclosure` and any other place that reconstructs a snapshot literal.
5. Increment `snapshotSchemaVersion` in the stable vars section.
6. Add a migration entry in `postupgrade()` if V0 records need a non-null default.
7. Update this document with the new version row in the Schema Versioning table above.
