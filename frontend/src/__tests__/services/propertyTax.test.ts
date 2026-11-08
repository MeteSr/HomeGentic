import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const store = new Map<string, any[]>();
const mockActor = {
  getPropertyTaxYears: vi.fn(async (pid: string) =>
    pid === "theirs" ? { err: { NotAuthorized: null } } : { ok: store.get(pid) ?? [] },
  ),
  setPropertyTaxYear: vi.fn(async (pid: string, y: any) => {
    const rec = { ...y, updatedAt: 1_700_000_000_000_000_000n };
    store.set(
      pid,
      [...(store.get(pid) ?? []).filter((r) => r.year !== y.year), rec].sort((a, b) => Number(b.year - a.year)),
    );
    return { ok: rec };
  }),
  deletePropertyTaxYear: vi.fn(async (pid: string, year: bigint) => {
    const before = store.get(pid) ?? [];
    const after = before.filter((r) => r.year !== year);
    if (after.length === before.length) return { err: { NotFound: null } };
    store.set(pid, after);
    return { ok: null };
  }),
};

vi.mock("@/services/actor", () => ({ getAgent: vi.fn().mockResolvedValue({}) }));
vi.mock("@icp-sdk/core/agent", () => ({ Actor: { createActor: vi.fn(() => mockActor) } }));

import {
  propertyTaxService,
  validateTaxYear,
  assessedChange,
  EMPTY_TAX_YEAR,
  type TaxYear,
} from "@/services/propertyTax";

const Y2026: TaxYear = {
  ...EMPTY_TAX_YEAR,
  year: 2026,
  marketValue: 412_500,
  assessedValue: 318_000,
  taxableValue: 268_000,
  exemption: "Granted",
  petitionDeadline: "2026-09-15",
  notes: "TRIM mailed Aug 21",
};

beforeEach(() => {
  store.clear();
  vi.clearAllMocks();
});
afterEach(() => {
  delete (window as any).__e2e_property_tax;
});

describe("propertyTaxService", () => {
  it("saves in cents with the exemption as a variant, and reads back newest first", async () => {
    await propertyTaxService.save("p1", Y2026);
    expect(mockActor.setPropertyTaxYear).toHaveBeenCalledWith("p1", {
      year: 2026n,
      marketValueCents: [41_250_000n],
      assessedValueCents: [31_800_000n],
      taxableValueCents: [26_800_000n],
      exemption: { Granted: null },
      petitionDeadline: "2026-09-15",
      notes: "TRIM mailed Aug 21",
    });
    await propertyTaxService.save("p1", { ...Y2026, year: 2025, marketValue: null, petitionDeadline: "" });
    const years = await propertyTaxService.list("p1");
    expect(years.map((y) => y.year)).toEqual([2026, 2025]);
    expect(years[0]).toEqual(Y2026);
    expect(years[1].marketValue).toBeNull();

    await propertyTaxService.remove("p1", 2025);
    expect(mockActor.deletePropertyTaxYear).toHaveBeenCalledWith("p1", 2025n);
    expect((await propertyTaxService.list("p1")).map((y) => y.year)).toEqual([2026]);
    await expect(propertyTaxService.remove("p1", 2025)).rejects.toThrow();
  });

  it("treats years it may not see as none (managers and viewers)", async () => {
    expect(await propertyTaxService.list("theirs")).toEqual([]);
  });

  it("uses window.__e2e_property_tax in place of the canister", async () => {
    (window as any).__e2e_property_tax = {};
    await propertyTaxService.save("p1", { ...Y2026, year: 2025 });
    await propertyTaxService.save("p1", Y2026);
    expect((await propertyTaxService.list("p1")).map((y) => y.year)).toEqual([2026, 2025]);
    await propertyTaxService.remove("p1", 2025);
    expect(await propertyTaxService.list("p1")).toEqual([Y2026]);
    expect(mockActor.setPropertyTaxYear).not.toHaveBeenCalled();
  });
});

describe("validateTaxYear mirrors the canister", () => {
  it("accepts a sensible year and names the problem otherwise", () => {
    expect(validateTaxYear(Y2026)).toBeNull();
    expect(validateTaxYear({ ...EMPTY_TAX_YEAR, year: 2026 })).toBeNull();
    expect(validateTaxYear({ ...Y2026, year: 1949 })).toMatch(/1950 to 2100/);
    expect(validateTaxYear({ ...Y2026, year: 2026.5 })).toMatch(/1950 to 2100/);
    expect(validateTaxYear({ ...Y2026, marketValue: 1_000_000_001 })).toMatch(/market value/i);
    expect(validateTaxYear({ ...Y2026, assessedValue: -1 })).toMatch(/assessed value/i);
    expect(validateTaxYear({ ...Y2026, taxableValue: Number.NaN })).toMatch(/taxable value/i);
    expect(validateTaxYear({ ...Y2026, petitionDeadline: "2026-02-30" })).toMatch(/real date/i);
    expect(validateTaxYear({ ...Y2026, petitionDeadline: "2027-09-15" })).toMatch(/in the tax year/i);
    expect(validateTaxYear({ ...Y2026, notes: "x".repeat(1001) })).toMatch(/1,000 characters/);
  });
});

describe("assessedChange", () => {
  it("compares a year's assessed value with the year before, when both are saved", () => {
    const y2025 = { ...Y2026, year: 2025, assessedValue: 300_000 };
    expect(assessedChange([Y2026, y2025], Y2026)).toBeCloseTo(0.06);
    expect(assessedChange([Y2026], Y2026)).toBeNull();
    expect(assessedChange([Y2026, { ...y2025, assessedValue: null }], Y2026)).toBeNull();
    expect(assessedChange([Y2026, { ...y2025, year: 2024 }], Y2026)).toBeNull(); // not the year before
  });
});
