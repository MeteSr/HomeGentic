/**
 * TDD tests for §16.2 — Bid Management
 *
 * Covers:
 *   - list_bids tool — returns bids sorted by amount, top 3 with contractor name (16.2.2)
 *   - accept_bid tool — accepts a quote by ID (16.2.3)
 *   - decline_quote tool — closes a quote request without accepting (16.2.4)
 *   - toolActionLabel for all three new tools
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Service mocks ─────────────────────────────────────────────────────────────

vi.mock("@/services/property", () => ({
  propertyService: { getMyProperties: vi.fn(), getAll: vi.fn() },
}));

vi.mock("@/services/job", () => ({
  jobService: {
    create: vi.fn(), verifyJob: vi.fn(), updateJobStatus: vi.fn(), getAll: vi.fn(),
  },
}));

vi.mock("@/services/quote", () => ({
  quoteService: {
    createRequest:       vi.fn(),
    getRequests:         vi.fn(),
    getQuotesForRequest: vi.fn(),
    accept:              vi.fn(),
    close:               vi.fn(),
  },
}));

vi.mock("@/services/contractor", () => ({
  contractorService: {
    search:         vi.fn(),
    submitReview:   vi.fn(),
    getContractor:  vi.fn(),
  },
}));

vi.mock("@/services/maintenance", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/maintenance")>();
  return { ...actual, maintenanceService: { createScheduleEntry: vi.fn() } };
});

vi.mock("@/services/maintenanceForecast", () => ({
  buildMaintenanceForecast: vi.fn().mockReturnValue(null),
}));

vi.mock("@/services/report", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/report")>();
  return {
    ...actual,
    reportService: {
      generateReport: vi.fn(), listShareLinks: vi.fn(),
      revokeShareLink: vi.fn(), shareUrl: vi.fn(),
    },
  };
});

import { executeTool, toolActionLabel } from "@/services/agentTools";
import { quoteService }      from "@/services/quote";
import { contractorService } from "@/services/contractor";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeQuote(id: string, requestId: string, overrides: Partial<{
  amount: number;
  contractor: string;
  timeline: number;
  status: string;
}> = {}) {
  return {
    id,
    requestId,
    contractor:  overrides.contractor  ?? `ctr-principal-${id}`,
    amount:      overrides.amount      ?? 150_000,
    timeline:    overrides.timeline    ?? 5,
    validUntil:  Date.now() + 7 * 86_400_000,
    status:      (overrides.status     ?? "pending") as any,
    createdAt:   Date.now() - 86_400_000,
  };
}

function makeContractorProfile(principal: string, name: string, trustScore = 82) {
  return {
    id:            principal,
    name,
    trustScore,
    jobsCompleted: 47,
    isVerified:    true,
    specialties:   ["HVAC"],
    serviceArea:   "Austin, TX",
  };
}

// ─── list_bids ─────────────────────────────────────────────────────────────────

describe("list_bids", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns success with bids sorted by amount ascending", async () => {
    const bids = [
      makeQuote("Q3", "REQ_1", { amount: 300_000, contractor: "ctr-c" }),
      makeQuote("Q1", "REQ_1", { amount: 100_000, contractor: "ctr-a" }),
      makeQuote("Q2", "REQ_1", { amount: 200_000, contractor: "ctr-b" }),
    ];
    vi.mocked(quoteService.getQuotesForRequest).mockResolvedValue(bids as any);
    vi.mocked(contractorService.getContractor).mockResolvedValue(null);

    const result = await executeTool("list_bids", { request_id: "REQ_1" });

    expect(result.success).toBe(true);
    const returned = result.data?.bids as any[];
    expect(returned[0].amount).toBe(100_000);
    expect(returned[1].amount).toBe(200_000);
    expect(returned[2].amount).toBe(300_000);
  });

  it("includes contractor name when getContractor resolves", async () => {
    const bids = [makeQuote("Q1", "REQ_1", { contractor: "ctr-a" })];
    vi.mocked(quoteService.getQuotesForRequest).mockResolvedValue(bids as any);
    vi.mocked(contractorService.getContractor).mockResolvedValue(
      makeContractorProfile("ctr-a", "Apex HVAC") as any
    );

    const result = await executeTool("list_bids", { request_id: "REQ_1" });

    expect(result.success).toBe(true);
    const bid = (result.data?.bids as any[])[0];
    expect(bid.contractorName).toBe("Apex HVAC");
    expect(bid.trustScore).toBe(82);
  });

  it("returns at most 3 bids even when more exist", async () => {
    const bids = Array.from({ length: 6 }, (_, i) =>
      makeQuote(`Q${i}`, "REQ_1", { amount: (i + 1) * 50_000 })
    );
    vi.mocked(quoteService.getQuotesForRequest).mockResolvedValue(bids as any);
    vi.mocked(contractorService.getContractor).mockResolvedValue(null);

    const result = await executeTool("list_bids", { request_id: "REQ_1" });

    expect((result.data?.bids as any[]).length).toBeLessThanOrEqual(3);
  });

  it("summary mentions bid count and lowest price", async () => {
    const bids = [
      makeQuote("Q1", "REQ_1", { amount: 120_000 }),
      makeQuote("Q2", "REQ_1", { amount: 200_000 }),
    ];
    vi.mocked(quoteService.getQuotesForRequest).mockResolvedValue(bids as any);
    vi.mocked(contractorService.getContractor).mockResolvedValue(null);

    const result = await executeTool("list_bids", { request_id: "REQ_1" });

    expect(result.data?.summary).toMatch(/2/);        // bid count
    expect(result.data?.summary).toMatch(/1,200|1200/); // $1,200 lowest
  });

  it("returns a helpful message when no bids exist", async () => {
    vi.mocked(quoteService.getQuotesForRequest).mockResolvedValue([]);
    vi.mocked(contractorService.getContractor).mockResolvedValue(null);

    const result = await executeTool("list_bids", { request_id: "REQ_1" });

    expect(result.success).toBe(true);
    expect(result.data?.summary).toMatch(/no bid|no quote|0 bid/i);
  });

  it("returns failure when request_id is missing", async () => {
    const result = await executeTool("list_bids", {});
    expect(result.success).toBe(false);
  });

  it("returns failure when getQuotesForRequest throws", async () => {
    vi.mocked(quoteService.getQuotesForRequest).mockRejectedValue(new Error("NotFound"));
    const result = await executeTool("list_bids", { request_id: "REQ_MISSING" });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/NotFound/);
  });
});

// ─── accept_bid ────────────────────────────────────────────────────────────────

describe("accept_bid", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls quoteService.accept with the quote_id and returns success", async () => {
    vi.mocked(quoteService.accept).mockResolvedValue(undefined);

    const result = await executeTool("accept_bid", { quote_id: "Q1" });

    expect(result.success).toBe(true);
    expect(quoteService.accept).toHaveBeenCalledWith("Q1");
    expect(result.data?.summary).toMatch(/accept|confirm/i);
  });

  it("summary includes the quote ID", async () => {
    vi.mocked(quoteService.accept).mockResolvedValue(undefined);

    const result = await executeTool("accept_bid", { quote_id: "QUOTE_42" });

    expect(result.data?.summary).toMatch(/QUOTE_42/);
  });

  it("returns failure and propagates error when accept throws", async () => {
    vi.mocked(quoteService.accept).mockRejectedValue(new Error("Unauthorized"));

    const result = await executeTool("accept_bid", { quote_id: "Q1" });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Unauthorized/);
  });

  it("returns failure when quote_id is missing", async () => {
    const result = await executeTool("accept_bid", {});
    expect(result.success).toBe(false);
  });
});

// ─── decline_quote ─────────────────────────────────────────────────────────────

describe("decline_quote", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls quoteService.close with the request_id and returns success", async () => {
    vi.mocked(quoteService.close).mockResolvedValue(undefined);

    const result = await executeTool("decline_quote", { request_id: "REQ_1" });

    expect(result.success).toBe(true);
    expect(quoteService.close).toHaveBeenCalledWith("REQ_1");
    expect(result.data?.summary).toMatch(/clos|declin/i);
  });

  it("summary includes the request ID", async () => {
    vi.mocked(quoteService.close).mockResolvedValue(undefined);

    const result = await executeTool("decline_quote", { request_id: "REQ_99" });

    expect(result.data?.summary).toMatch(/REQ_99/);
  });

  it("returns failure and propagates error when close throws", async () => {
    vi.mocked(quoteService.close).mockRejectedValue(new Error("NotFound"));

    const result = await executeTool("decline_quote", { request_id: "REQ_1" });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/NotFound/);
  });

  it("returns failure when request_id is missing", async () => {
    const result = await executeTool("decline_quote", {});
    expect(result.success).toBe(false);
  });
});

// ─── toolActionLabel ───────────────────────────────────────────────────────────

describe("toolActionLabel", () => {
  it("returns a human-friendly label for list_bids", () => {
    const label = toolActionLabel("list_bids" as any);
    expect(label.length).toBeGreaterThan(0);
    expect(label).not.toBe("list_bids");
  });

  it("returns a human-friendly label for accept_bid", () => {
    const label = toolActionLabel("accept_bid" as any);
    expect(label.length).toBeGreaterThan(0);
    expect(label).not.toBe("accept_bid");
  });

  it("returns a human-friendly label for decline_quote", () => {
    const label = toolActionLabel("decline_quote" as any);
    expect(label.length).toBeGreaterThan(0);
    expect(label).not.toBe("decline_quote");
  });
});
