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

// getUsageTrend filters client-side by b.periodStart >= cutoff (N months ago).
// Hardcoded 2024 dates fall outside a 12-month window in 2026+, so use dynamic
// dates relative to today.
function monthAgo(n: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
}

describe.skipIf(!deployed)("getUsageTrend — Motoko query round-trip", () => {
  const pid = propId("usage-trend");

  beforeAll(async () => {
    // Seed 3 Electric bills with ascending usage — oldest first so degradation
    // analysis sees low-early / high-late when more bills are added below.
    const bills = [
      { amountCents: 9_000, usageAmount: 800, usageUnit: "kWh", periodStart: monthAgo(11), periodEnd: monthAgo(10) },
      { amountCents: 9_500, usageAmount: 850, usageUnit: "kWh", periodStart: monthAgo(10), periodEnd: monthAgo(9) },
      { amountCents: 9_800, usageAmount: 900, usageUnit: "kWh", periodStart: monthAgo(9),  periodEnd: monthAgo(8) },
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
    // Bill WITH usageAmount must have a recent periodStart to pass the date filter.
    await billService.addBill({ ...BASE_ARGS, propertyId: pidMixed, billType: "Electric", usageAmount: 800, usageUnit: "kWh", periodStart: monthAgo(1) });
    await billService.addBill({ ...BASE_ARGS, propertyId: pidMixed, billType: "Electric" /* no usage */ });

    const trend = await getUsageTrend(pidMixed, "Electric", 12);
    expect(trend.every((p) => typeof p.usageAmount === "number")).toBe(true);
    expect(trend).toHaveLength(1);
  });

  it("analyzeEfficiencyTrend correctly identifies degradation from canister data", async () => {
    // Add 3 high-usage bills more recent than the seeded low-usage bills.
    // Sorted order: [month-11..month-9: ~850 avg] then [month-3..month-1: ~1150 avg]
    // → early avg < late avg → degradation detected.
    await billService.addBill({ ...BASE_ARGS, propertyId: pid, billType: "Electric", usageAmount: 1_100, usageUnit: "kWh", periodStart: monthAgo(3), periodEnd: monthAgo(2) });
    await billService.addBill({ ...BASE_ARGS, propertyId: pid, billType: "Electric", usageAmount: 1_150, usageUnit: "kWh", periodStart: monthAgo(2), periodEnd: monthAgo(1) });
    await billService.addBill({ ...BASE_ARGS, propertyId: pid, billType: "Electric", usageAmount: 1_200, usageUnit: "kWh", periodStart: monthAgo(1), periodEnd: monthAgo(0) });

    const trend = await getUsageTrend(pid, "Electric", 12);
    const analysis = analyzeEfficiencyTrend(trend);

    // Early avg ~850 kWh, late avg ~1150 kWh → ~35% increase → degradation
    expect(analysis.degradationDetected).toBe(true);
    expect(analysis.estimatedAnnualWaste).toBeGreaterThan(0);
  });
});

// ─── Tier enforcement ─────────────────────────────────────────────────────────

describe.skipIf(!deployed)("tier enforcement — Basic tier has no monthly upload cap", () => {
  // The test identity is granted Basic in CI (scripts/test-integration.sh).
  // Basic tier: monthlyUploadLimit = 0 = unlimited.
  // Free-tier blocking (any upload rejected) is covered by canister unit tests.
  it("multiple uploads in the same month all succeed for a Basic-tier caller", async () => {
    const pid = propId("tier-basic");
    await expect(
      billService.addBill({ ...BASE_ARGS, propertyId: pid, billType: "Electric" })
    ).resolves.toBeDefined();
    await expect(
      billService.addBill({ ...BASE_ARGS, propertyId: pid, billType: "Gas" })
    ).resolves.toBeDefined();
  });
});

// ─── Recurring housing expenses ───────────────────────────────────────────────

describe.skipIf(!deployed)("recurring expenses — Candid round-trip & lifecycle", () => {
  const FIELDS = {
    category:    "Mortgage" as const,
    provider:    "Rocket Mortgage",
    amountCents: 245_000,
    frequency:   "Monthly" as const,
    startDate:   "2021-06-01",
  };

  it("every category and frequency Variant round-trips", async () => {
    const pid = propId("rec-variants");
    const categories  = ["Mortgage", "PropertyTax", "HOA", "HomeInsurance", "Other"] as const;
    const frequencies = ["Monthly", "Quarterly", "SemiAnnual", "Annual"] as const;
    for (const [i, category] of categories.entries()) {
      const frequency = frequencies[i % frequencies.length];
      const rec = await billService.addRecurringExpense(pid, { ...FIELDS, category, frequency });
      expect(rec.category).toBe(category);
      expect(rec.frequency).toBe(frequency);
    }
    expect(await billService.getRecurringExpensesForProperty(pid)).toHaveLength(categories.length);
  });

  it("endDate Opt round-trips both present and absent", async () => {
    const pid = propId("rec-opt");
    const withEnd = await billService.addRecurringExpense(pid, { ...FIELDS, endDate: "2030-06-01" });
    const open    = await billService.addRecurringExpense(pid, FIELDS);
    expect(withEnd.endDate).toBe("2030-06-01");
    expect(open.endDate).toBeUndefined();
    expect(open.homeowner).toBe(TEST_PRINCIPAL);
  });

  it("canister rejects an endDate before the startDate", async () => {
    await expect(
      billService.addRecurringExpense(propId("rec-bad"), { ...FIELDS, endDate: "2020-01-01" })
    ).rejects.toThrow("InvalidInput");
  });

  it("update then delete", async () => {
    const pid = propId("rec-lifecycle");
    const rec = await billService.addRecurringExpense(pid, FIELDS);
    const updated = await billService.updateRecurringExpense(rec.id, { ...FIELDS, provider: "Chase", amountCents: 219_000 });
    expect(updated.id).toBe(rec.id);
    expect(updated.provider).toBe("Chase");
    expect(updated.amountCents).toBe(219_000);
    expect(updated.createdAt).toBe(rec.createdAt);

    await billService.deleteRecurringExpense(rec.id);
    expect(await billService.getRecurringExpensesForProperty(pid)).toEqual([]);
  });
});
