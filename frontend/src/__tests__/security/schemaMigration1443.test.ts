/**
 * TDD — 14.4.3: Stable memory schema migration safety
 *
 * Verifies that:
 *  1. ReportSnapshot in the report canister includes schemaVersion: ?Nat
 *  2. snapshotSchemaVersion stable var exists and is > 1
 *  3. V0 migration in postupgrade() sets schemaVersion for old records
 *  4. applyDisclosure passes schemaVersion through
 *  5. generateReport sets schemaVersion on new snapshots
 *  6. Upgrade runbook exists and contains required sections
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(__dirname, "../../../../");

function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf-8");
}

describe("14.4.3: report canister schema versioning", () => {
  const canister = read("backend/report/main.mo");

  it("ReportSnapshot type includes schemaVersion: ?Nat", () => {
    expect(canister).toMatch(/schemaVersion\s*:\s*\?Nat/);
  });

  it("snapshotSchemaVersion stable var is > 1 (reflects current schema)", () => {
    const match = canister.match(/snapshotSchemaVersion\s*:\s*Nat\s*=\s*(\d+)/);
    expect(match).not.toBeNull();
    const version = parseInt(match![1], 10);
    expect(version).toBeGreaterThan(1);
  });

  it("V0 migration in postupgrade sets schemaVersion = ?1 for old records", () => {
    expect(canister).toMatch(/schemaVersion\s*=\s*\?1/);
  });

  it("generateReport sets schemaVersion = ?2 on new snapshots", () => {
    expect(canister).toMatch(/schemaVersion\s*=\s*\?2/);
  });

  it("applyDisclosure passes schemaVersion through from the input snapshot", () => {
    expect(canister).toMatch(/schemaVersion\s*=\s*snap\.schemaVersion/);
  });

  it("new fields use ?T (optional) pattern — not bare required types", () => {
    // The rooms field is also ?[RoomInput] — confirm the pattern is consistent
    expect(canister).toMatch(/rooms\s*:\s*\?\[RoomInput\]/);
    expect(canister).toMatch(/schemaVersion\s*:\s*\?Nat/);
  });
});

describe("14.4.3: upgrade runbook documentation", () => {
  const runbook = read("docs/UPGRADE_RUNBOOK.md");

  it("runbook exists", () => {
    expect(runbook.length).toBeGreaterThan(0);
  });

  it("runbook documents the schema version table", () => {
    expect(runbook).toMatch(/schemaVersion|Schema Version/i);
    expect(runbook).toMatch(/\?1|\?2/);
  });

  it("runbook describes the upgrade procedure steps", () => {
    expect(runbook).toMatch(/Step \d/i);
    expect(runbook).toMatch(/dfx deploy/);
    expect(runbook).toMatch(/preupgrade|postupgrade/);
  });

  it("runbook describes the rollback procedure", () => {
    expect(runbook).toMatch(/[Rr]ollback/);
    expect(runbook).toMatch(/dfx canister install/);
  });

  it("runbook warns against removing stable variables", () => {
    expect(runbook).toMatch(/[Nn]ever remove|[Nn]ever rename/i);
  });

  it("runbook explains the ?T rule for new fields", () => {
    expect(runbook).toMatch(/\?T|optional.*field|new fields.*\?/i);
  });
});
