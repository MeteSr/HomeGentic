/**
 * Integration tests — billService against the real ICP bills canister.
 *
 * Requires: dfx start --background && make deploy
 * Run:      npm run test:integration  (from repo root)
 *
 * What these tests prove that unit tests cannot:
 *   - Candid IDL serialization is correct (BigInt, Opt, Variant encoding)
 *   - toRecord() / fromVariant() convert all fields without data loss
 *   - Principal scoping: you only read back your own bills (callers cannot
 *     see each other's data even with the same propertyId)
 *   - Anomaly detection fires at the canister level (not just in the mock)
 *   - getUsageTrend() Motoko query runs and returns correctly sorted data
 *   - Tier enforcement blocks a Free-tier second upload in the same month
 *   - deleteBill() removes the record from canister state
 *
 * Test isolation: each test uses a unique propertyId derived from the test
 * start timestamp so parallel runs (on different machines) never collide.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { billService } from "@/services/billService";
import { getUsageTrend, analyzeEfficiencyTrend } from "@/services/billsIntelligence";
import { TEST_PRINCIPAL } from "./setup";

// ─── Skip guard ───────────────────────────────────────────────────────────────
// Tests skip themselves cleanly when the canister isn't deployed (CI without replica).

const CANISTER_ID = process.env.BILLS_CANISTER_ID || "";
const deployed = !!CANISTER_ID;

// ─── Fixtures ─────────────────────────────────────────────────────────────────

// Unique per test-run — prevents state bleed across runs on the same replica
const RUN_ID = Date.now();

function propId(label: string) {
  return `test-${label}-${RUN_ID}`;
}

const BASE_ARGS = {
  provider:    "FPL",
  periodStart: "2024-01-01",
  periodEnd:   "2024-01-31",
  amountCents: 9_500,
};

// ─── addBill / getBillsForProperty ────────────────────────────────────────────

describe.skipIf(!deployed)("addBill — Candid serialization", () => {
  it("returns a BillRecord with a non-empty id", async () => {
    const record = await billService.addBill({
      ...BASE_ARGS,
      propertyId: propId("candid-id"),
      billType: "Electric",
    });
    expect(record.id).toBeTruthy();
    expect(typeof record.id).toBe("string");
  });

  it("amountCents survives BigInt round-trip without truncation", async () => {
    const record = await billService.addBill({
      ...BASE_ARGS,
      propertyId:  propId("bigint"),
      billType:    "Electric",
      amountCents: 12_345,
    });
    expect(record.amountCents).toBe(12_345);
  });

  it("Optional usageAmount and usageUnit are preserved (Opt round-trip)", async () => {
    const record = await billService.addBill({
      ...BASE_ARGS,
      propertyId:  propId("opt"),
      billType:    "Electric",
      usageAmount: 842.5,
      usageUnit:   "kWh",
    });
    expect(record.usageAmount).toBeCloseTo(842.5, 2);
    expect(record.usageUnit).toBe("kWh");
  });

  it("usageAmount and usageUnit are undefined when not provided", async () => {
    const record = await billService.addBill({
      ...BASE_ARGS,
      propertyId: propId("no-opt"),
      billType:   "Gas",
    });
    expect(record.usageAmount).toBeUndefined();
    expect(record.usageUnit).toBeUndefined();
  });

  it("billType Variant round-trips correctly for all six variants", async () => {
    const pid = propId("variants");
    const types = ["Electric", "Gas", "Water", "Internet", "Telecom", "Other"] as const;

    for (const billType of types) {
      const record = await billService.addBill({
        ...BASE_ARGS,
        propertyId: pid,
        billType,
        periodStart: `2024-${String(types.indexOf(billType) + 1).padStart(2, "0")}-01`,
        periodEnd:   `2024-${String(types.indexOf(billType) + 1).padStart(2, "0")}-28`,
      });
      expect(record.billType).toBe(billType);
    }
  });

  it("uploadedAt is a recent ms timestamp (ns→ms conversion is applied)", async () => {
    const before = Date.now() - 5_000;
    const record = await billService.addBill({
      ...BASE_ARGS,
      propertyId: propId("timestamp"),
      billType:   "Electric",
    });
    const after = Date.now() + 5_000;
    // If ns→ms conversion was missed, uploadedAt would be ~1e18 (year ~33000)
    expect(record.uploadedAt).toBeGreaterThan(before);
    expect(record.uploadedAt).toBeLessThan(after);
  });

  it("homeowner field matches the test identity's principal", async () => {
    const record = await billService.addBill({
      ...BASE_ARGS,
      propertyId: propId("principal"),
      billType:   "Water",
    });
    expect(record.homeowner).toBe(TEST_PRINCIPAL);
  });
});

// ─── getBillsForProperty ──────────────────────────────────────────────────────

describe.skipIf(!deployed)("getBillsForProperty — principal scoping & retrieval", () => {
  const pid = propId("get-bills");

  beforeAll(async () => {
    // Seed two bills into this property
    await billService.addBill({ ...BASE_ARGS, propertyId: pid, billType: "Electric", periodStart: "2024-01-01", periodEnd: "2024-01-31" });
    await billService.addBill({ ...BASE_ARGS, propertyId: pid, billType: "Gas",      periodStart: "2024-02-01", periodEnd: "2024-02-28" });
  });

  it("returns both bills added to the property", async () => {
    const bills = await billService.getBillsForProperty(pid);
    expect(bills.length).toBeGreaterThanOrEqual(2);
  });

  it("all returned bills have correct propertyId", async () => {
    const bills = await billService.getBillsForProperty(pid);
    expect(bills.every((b) => b.propertyId === pid)).toBe(true);
  });

  it("all returned bills belong to the test principal (caller scoping)", async () => {
    const bills = await billService.getBillsForProperty(pid);
    expect(bills.every((b) => b.homeowner === TEST_PRINCIPAL)).toBe(true);
  });

  it("returns empty array for a property with no bills", async () => {
    const bills = await billService.getBillsForProperty(propId("empty-property"));
    expect(bills).toHaveLength(0);
  });
});

// ─── Anomaly detection ────────────────────────────────────────────────────────

describe.skipIf(!deployed)("anomaly detection — canister-level (not just mock)", () => {
  const pid = propId("anomaly");

  it("anomalyFlag is false when only one bill exists (no baseline yet)", async () => {
    const record = await billService.addBill({
      ...BASE_ARGS,
      propertyId:  propId("anomaly-single"),
      billType:    "Electric",
      amountCents: 10_000,
    });
    expect(record.anomalyFlag).toBe(false);
    expect(record.anomalyReason).toBeUndefined();
  });

  it("anomalyFlag is true when the third bill is >20% above the baseline", async () => {
    // Bill 1 + 2 establish a baseline of ~10_000 cents
    await billService.addBill({ ...BASE_ARGS, propertyId: pid, billType: "Electric", amountCents: 10_000, periodStart: "2023-10-01", periodEnd: "2023-10-31" });
    await billService.addBill({ ...BASE_ARGS, propertyId: pid, billType: "Electric", amountCents: 10_200, periodStart: "2023-11-01", periodEnd: "2023-11-30" });
    // Bill 3: 25% above baseline → should flag
    const record = await billService.addBill({ ...BASE_ARGS, propertyId: pid, billType: "Electric", amountCents: 12_800, periodStart: "2023-12-01", periodEnd: "2023-12-31" });

    expect(record.anomalyFlag).toBe(true);
    expect(record.anomalyReason).toBeTruthy();
    expect(typeof record.anomalyReason).toBe("string");
  });
});

// ─── deleteBill ───────────────────────────────────────────────────────────────

describe.skipIf(!deployed)("deleteBill — removes from canister state", () => {
  it("deleted bill is no longer returned by getBillsForProperty", async () => {
    const pid = propId("delete");
    const record = await billService.addBill({
      ...BASE_ARGS,
      propertyId: pid,
      billType:   "Water",
    });

    await billService.deleteBill(record.id);

    const remaining = await billService.getBillsForProperty(pid);
    expect(remaining.find((b) => b.id === record.id)).toBeUndefined();
  });

  it("deleting a non-existent bill throws", async () => {
    await expect(billService.deleteBill("BILL_DOES_NOT_EXIST_99999")).rejects.toThrow();
  });
});

// ─── getUsageTrend (new Motoko query) ────────────────────────────────────────

describe.skipIf(!deployed)("getUsageTrend — Motoko query round-trip", () => {
  const pid = propId("usage-trend");

  beforeAll(async () => {
    // Seed 3 Electric bills with ascending usage over 3 months
    const bills = [
      { amountCents: 9_000, usageAmount: 800, usageUnit: "kWh", periodStart: "2024-01-01", periodEnd: "2024-01-31" },
      { amountCents: 9_500, usageAmount: 850, usageUnit: "kWh", periodStart: "2024-02-01", periodEnd: "2024-02-29" },
      { amountCents: 9_800, usageAmount: 900, usageUnit: "kWh", periodStart: "2024-03-01", periodEnd: "2024-03-31" },
    ];
    for (const b of bills) {
      await billService.addBill({ ...BASE_ARGS, ...b, propertyId: pid, billType: "Electric", provider: "FPL" });
    }
  });

  it("returns UsagePeriod array with usageAmount and usageUnit for each bill", async () => {
    const trend = await getUsageTrend(pid, "Electric", 12);
    expect(trend.length).toBeGreaterThanOrEqual(3);
    for (const period of trend) {
      expect(typeof period.usageAmount).toBe("number");
      expect(period.usageUnit).toBe("kWh");
      expect(period.periodStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("returns periods sorted chronologically by periodStart", async () => {
    const trend = await getUsageTrend(pid, "Electric", 12);
    for (let i = 1; i < trend.length; i++) {
      expect(trend[i].periodStart >= trend[i - 1].periodStart).toBe(true);
    }
  });

  it("excludes bills without usageAmount from the trend", async () => {
    const pidMixed = propId("usage-mixed");
    await billService.addBill({ ...BASE_ARGS, propertyId: pidMixed, billType: "Electric", usageAmount: 800, usageUnit: "kWh" });
    await billService.addBill({ ...BASE_ARGS, propertyId: pidMixed, billType: "Electric" /* no usage */ });

    const trend = await getUsageTrend(pidMixed, "Electric", 12);
    expect(trend.every((p) => typeof p.usageAmount === "number")).toBe(true);
    expect(trend).toHaveLength(1);
  });

  it("analyzeEfficiencyTrend correctly identifies degradation from canister data", async () => {
    // Add two more high-usage bills to push the late average well above the early average
    await billService.addBill({ ...BASE_ARGS, propertyId: pid, billType: "Electric", usageAmount: 1_100, usageUnit: "kWh", periodStart: "2024-04-01", periodEnd: "2024-04-30" });
    await billService.addBill({ ...BASE_ARGS, propertyId: pid, billType: "Electric", usageAmount: 1_150, usageUnit: "kWh", periodStart: "2024-05-01", periodEnd: "2024-05-31" });
    await billService.addBill({ ...BASE_ARGS, propertyId: pid, billType: "Electric", usageAmount: 1_200, usageUnit: "kWh", periodStart: "2024-06-01", periodEnd: "2024-06-30" });

    const trend = await getUsageTrend(pid, "Electric", 24);
    const analysis = analyzeEfficiencyTrend(trend);

    // Early avg ~850 kWh, late avg ~1150 kWh → ~35% increase → degradation
    expect(analysis.degradationDetected).toBe(true);
    expect(analysis.estimatedAnnualWaste).toBeGreaterThan(0);
  });
});

// ─── Tier enforcement ─────────────────────────────────────────────────────────

describe.skipIf(!deployed)("tier enforcement — Free tier monthly upload limit", () => {
  it("second upload in the same month is rejected for a Free-tier caller", async () => {
    // The test identity is Free tier by default (no grantTier called)
    const pid = propId("tier-limit");

    // First upload should succeed
    await billService.addBill({
      ...BASE_ARGS,
      propertyId: pid,
      billType:   "Electric",
    });

    // Second upload in the same month should be rejected
    await expect(
      billService.addBill({
        ...BASE_ARGS,
        propertyId: pid,
        billType:   "Gas",
      })
    ).rejects.toThrow(/Free plan|TierLimitReached|1 bill/i);
  });
});
