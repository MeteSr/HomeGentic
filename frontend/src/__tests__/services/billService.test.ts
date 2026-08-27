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
};

vi.mock("@icp-sdk/core/agent", () => ({
  Actor: {
    createActor: vi.fn(() => mockActor),
  },
  HttpAgent: vi.fn(),
}));

import { billService, extractBill, TierLimitReachedError } from "@/services/billService";

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
