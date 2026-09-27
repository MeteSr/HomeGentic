/**
 * Unit tests for billService and extractBill
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/services/actor", () => ({
  getAgent: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/declarations/bills", () => ({
  idlFactory: vi.fn(),
}));

const mockActor = {
  addBill:              vi.fn(),
  getBillsForProperty:  vi.fn(),
  deleteBill:           vi.fn(),
  addRecurringExpense:             vi.fn(),
  getRecurringExpensesForProperty: vi.fn(),
  updateRecurringExpense:          vi.fn(),
  deleteRecurringExpense:          vi.fn(),
};

vi.mock("@icp-sdk/core/agent", () => ({
  Actor: {
    createActor: vi.fn(() => mockActor),
  },
  HttpAgent: vi.fn(),
}));

import {
  billService, extractBill, TierLimitReachedError, monthlyEquivalentCents, isActiveOn,
} from "@/services/billService";

// Rebuild actor state for each test
beforeEach(() => {
  vi.clearAllMocks();
  billService.reset();
});

// ── Raw bill fixture ───────────────────────────────────────────────────────────

function makeRawBill(overrides: Record<string, any> = {}) {
  return {
    id:            "bill-001",
    propertyId:    "prop-1",
    homeowner:     { toString: () => "owner-1" },
    billType:      { Electric: null },
    provider:      "Duke Energy",
    periodStart:   "2024-01-01",
    periodEnd:     "2024-01-31",
    amountCents:   BigInt(12000),
    usageAmount:   [BigInt(500)],
    usageUnit:     ["kWh"],
    uploadedAt:    BigInt(1_700_000_000_000) * BigInt(1_000_000), // ns
    anomalyFlag:   false,
    anomalyReason: [],
    ...overrides,
  };
}

// ── addBill ───────────────────────────────────────────────────────────────────

describe("billService.addBill", () => {
  it("calls actor.addBill and maps the raw record", async () => {
    const raw = makeRawBill();
    mockActor.addBill.mockResolvedValueOnce({ ok: raw });

    const result = await billService.addBill({
      propertyId:  "prop-1",
      billType:    "Electric",
      provider:    "Duke Energy",
      periodStart: "2024-01-01",
      periodEnd:   "2024-01-31",
      amountCents: 12000,
    });

    expect(result.id).toBe("bill-001");
    expect(result.billType).toBe("Electric");
    expect(result.provider).toBe("Duke Energy");
    expect(result.amountCents).toBe(12000);
    expect(result.usageAmount).toBe(500);
    expect(result.usageUnit).toBe("kWh");
    expect(result.anomalyFlag).toBe(false);
  });

  it("throws TierLimitReachedError when canister returns TierLimitReached", async () => {
    mockActor.addBill.mockResolvedValueOnce({
      err: { TierLimitReached: "Monthly upload limit reached" },
    });

    await expect(billService.addBill({
      propertyId:  "prop-1",
      billType:    "Gas",
      provider:    "Atmos Energy",
      periodStart: "2024-02-01",
      periodEnd:   "2024-02-28",
      amountCents: 8000,
    })).rejects.toBeInstanceOf(TierLimitReachedError);
  });

  it("throws generic error on other err variants", async () => {
    mockActor.addBill.mockResolvedValueOnce({ err: { Unauthorized: null } });
    await expect(billService.addBill({
      propertyId:  "prop-1",
      billType:    "Water",
      provider:    "City Water",
      periodStart: "2024-03-01",
      periodEnd:   "2024-03-31",
      amountCents: 4000,
    })).rejects.toThrow();
  });
});

// ── getBillsForProperty ───────────────────────────────────────────────────────

describe("billService.getBillsForProperty", () => {
  it("returns mapped array of BillRecords", async () => {
    const raw1 = makeRawBill({ id: "b1" });
    const raw2 = makeRawBill({ id: "b2", billType: { Gas: null }, anomalyFlag: true, anomalyReason: ["Spike detected"] });
    mockActor.getBillsForProperty.mockResolvedValueOnce({ ok: [raw1, raw2] });

    const results = await billService.getBillsForProperty("prop-1");
    expect(results).toHaveLength(2);
    expect(results[0].id).toBe("b1");
    expect(results[1].billType).toBe("Gas");
    expect(results[1].anomalyFlag).toBe(true);
    expect(results[1].anomalyReason).toBe("Spike detected");
  });

  it("returns empty array when ok is []", async () => {
    mockActor.getBillsForProperty.mockResolvedValueOnce({ ok: [] });
    const results = await billService.getBillsForProperty("prop-none");
    expect(results).toHaveLength(0);
  });

  it("converts nanosecond uploadedAt to milliseconds", async () => {
    const nsTimestamp = BigInt(1_700_000_000_000_000_000); // ns
    const raw = makeRawBill({ uploadedAt: nsTimestamp });
    mockActor.getBillsForProperty.mockResolvedValueOnce({ ok: [raw] });

    const results = await billService.getBillsForProperty("prop-1");
    expect(results[0].uploadedAt).toBe(Math.floor(Number(nsTimestamp) / 1_000_000));
  });
});

// ── deleteBill ────────────────────────────────────────────────────────────────

describe("billService.deleteBill", () => {
  it("resolves without error on success", async () => {
    mockActor.deleteBill.mockResolvedValueOnce({ ok: null });
    await expect(billService.deleteBill("bill-001")).resolves.toBeUndefined();
  });

  it("throws on error response", async () => {
    mockActor.deleteBill.mockResolvedValueOnce({ err: { NotFound: null } });
    await expect(billService.deleteBill("bill-999")).rejects.toThrow();
  });
});

// ── extractBill (fetch wrapper) ───────────────────────────────────────────────

describe("extractBill", () => {
  it("POSTs to /api/extract-bill and returns parsed JSON", async () => {
    const mockResponse = {
      billType: "Electric",
      provider: "Duke Energy",
      amountCents: 9500,
      confidence: "high",
      description: "Extracted successfully",
    };

    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    }));

    const result = await extractBill("bill.pdf", "application/pdf", "base64data==");
    expect(result.billType).toBe("Electric");
    expect(result.confidence).toBe("high");

    vi.unstubAllGlobals();
  });

  it("throws when fetch returns !ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: false,
      statusText: "Internal Server Error",
      json: async () => ({ error: "Claude Vision failed" }),
    }));

    await expect(extractBill("bill.jpg", "image/jpeg", "abc")).rejects.toThrow("Claude Vision failed");
    vi.unstubAllGlobals();
  });
});

// ── Recurring expenses ─────────────────────────────────────────────────────────

function makeRawRecurring(overrides: Record<string, any> = {}) {
  return {
    id:          "REC_1",
    propertyId:  "prop-1",
    homeowner:   { toString: () => "owner-1" },
    category:    { PropertyTax: null },
    provider:    "Hillsborough County",
    amountCents: BigInt(612_000),
    frequency:   { Annual: null },
    startDate:   "2019-11-01",
    endDate:     ["2030-11-01"],
    createdAt:   BigInt(1_700_000_000_000) * BigInt(1_000_000),
    updatedAt:   BigInt(1_700_000_500_000) * BigInt(1_000_000),
    ...overrides,
  };
}

const FIELDS = {
  category:    "PropertyTax" as const,
  provider:    "Hillsborough County",
  amountCents: 612_000,
  frequency:   "Annual" as const,
  startDate:   "2019-11-01",
  endDate:     "2030-11-01",
};

describe("billService recurring expenses", () => {
  it("addRecurringExpense encodes variants, BigInt and Opt, and decodes the record", async () => {
    mockActor.addRecurringExpense.mockResolvedValueOnce({ ok: makeRawRecurring() });
    const rec = await billService.addRecurringExpense("prop-1", FIELDS);

    expect(mockActor.addRecurringExpense).toHaveBeenCalledWith("prop-1", {
      category:    { PropertyTax: null },
      provider:    "Hillsborough County",
      amountCents: BigInt(612_000),
      frequency:   { Annual: null },
      startDate:   "2019-11-01",
      endDate:     ["2030-11-01"],
    });
    expect(rec).toEqual({
      id: "REC_1", propertyId: "prop-1", homeowner: "owner-1",
      category: "PropertyTax", provider: "Hillsborough County", amountCents: 612_000,
      frequency: "Annual", startDate: "2019-11-01", endDate: "2030-11-01",
      createdAt: 1_700_000_000_000, updatedAt: 1_700_000_500_000,
    });
  });

  it("omitted endDate is sent as an empty Opt and read back as undefined", async () => {
    mockActor.addRecurringExpense.mockResolvedValueOnce({ ok: makeRawRecurring({ endDate: [] }) });
    const rec = await billService.addRecurringExpense("prop-1", { ...FIELDS, endDate: undefined });
    expect(mockActor.addRecurringExpense.mock.calls[0][1].endDate).toEqual([]);
    expect(rec.endDate).toBeUndefined();
  });

  it("addRecurringExpense throws TierLimitReachedError on the tier gate", async () => {
    mockActor.addRecurringExpense.mockResolvedValueOnce({ err: { TierLimitReached: "Subscribe" } });
    await expect(billService.addRecurringExpense("prop-1", FIELDS)).rejects.toBeInstanceOf(TierLimitReachedError);
  });

  it("getRecurringExpensesForProperty maps every record", async () => {
    mockActor.getRecurringExpensesForProperty.mockResolvedValueOnce({
      ok: [makeRawRecurring(), makeRawRecurring({ id: "REC_2", category: { Mortgage: null }, frequency: { Monthly: null } })],
    });
    const list = await billService.getRecurringExpensesForProperty("prop-1");
    expect(list.map((e) => [e.id, e.category, e.frequency])).toEqual([
      ["REC_1", "PropertyTax", "Annual"],
      ["REC_2", "Mortgage", "Monthly"],
    ]);
  });

  it("updateRecurringExpense passes the id and encoded fields", async () => {
    mockActor.updateRecurringExpense.mockResolvedValueOnce({ ok: makeRawRecurring({ amountCents: BigInt(650_000) }) });
    const rec = await billService.updateRecurringExpense("REC_1", { ...FIELDS, amountCents: 650_000 });
    expect(mockActor.updateRecurringExpense.mock.calls[0][0]).toBe("REC_1");
    expect(mockActor.updateRecurringExpense.mock.calls[0][1].amountCents).toBe(BigInt(650_000));
    expect(rec.amountCents).toBe(650_000);
  });

  it("deleteRecurringExpense throws on NotFound", async () => {
    mockActor.deleteRecurringExpense.mockResolvedValueOnce({ err: { NotFound: null } });
    await expect(billService.deleteRecurringExpense("REC_404")).rejects.toThrow("NotFound");
  });
});

describe("monthlyEquivalentCents", () => {
  it.each([
    ["Monthly",    245_000, 245_000],
    ["Quarterly",   45_000,  15_000],
    ["SemiAnnual", 300_000,  50_000],
    ["Annual",     612_000,  51_000],
  ] as const)("%s %i → %i per month", (frequency, amountCents, expected) => {
    expect(monthlyEquivalentCents({ frequency, amountCents })).toBe(expected);
  });

  it("rounds to whole cents", () => {
    expect(monthlyEquivalentCents({ frequency: "Annual", amountCents: 100 })).toBe(8);
  });
});

describe("isActiveOn", () => {
  const e = { startDate: "2024-01-01", endDate: "2024-12-31" };
  it("is inclusive of both bounds", () => {
    expect(isActiveOn(e, "2024-01-01")).toBe(true);
    expect(isActiveOn(e, "2024-12-31")).toBe(true);
  });
  it("is false outside the range", () => {
    expect(isActiveOn(e, "2023-12-31")).toBe(false);
    expect(isActiveOn(e, "2025-01-01")).toBe(false);
  });
  it("treats a missing endDate as ongoing", () => {
    expect(isActiveOn({ startDate: "2024-01-01" }, "2099-01-01")).toBe(true);
  });
});
