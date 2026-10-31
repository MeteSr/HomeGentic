/**
 * TDD tests for §16.7 — Contractor Role Context
 *
 * Covers:
 *   - list_leads tool — open requests filtered by contractor specialties (16.7.3)
 *   - submit_bid tool — calls quoteService.submitQuote with correct args (16.7.4)
 *   - get_earnings_summary tool — completed jobs + total earnings for contractor (16.7.5)
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
    getOpenRequests:     vi.fn(),
    submitQuote:         vi.fn(),
    accept:              vi.fn(),
    close:               vi.fn(),
    getBidCountMap:      vi.fn(),
  },
}));

vi.mock("@/services/contractor", () => ({
  contractorService: {
    search:        vi.fn(),
    submitReview:  vi.fn(),
    getContractor: vi.fn(),
    getMyProfile:  vi.fn(),
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
import { jobService }        from "@/services/job";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeContractorProfile(specialties = ["HVAC", "Plumbing"]) {
  return {
    id:            "ctr-principal-abc",
    name:          "Bob's Services",
    specialties,
    email:         "bob@example.com",
    phone:         "555-1234",
    bio:           null,
    licenseNumber: "LIC-999",
    serviceArea:   "Austin, TX",
    trustScore:    88,
    jobsCompleted: 52,
    isVerified:    true,
    createdAt:     Date.now() - 365 * 86_400_000,
  };
}

function makeOpenRequest(id: string, serviceType: string, urgency = "medium") {
  return {
    id,
    propertyId:  "prop-1",
    homeowner:   "homeowner-principal",
    serviceType,
    urgency:     urgency as any,
    description: `Need ${serviceType} work done`,
    status:      "open" as const,
    createdAt:   Date.now() - 3600_000,
  };
}

function makeJob(id: string, overrides: Partial<{
  contractor: string;
  status: string;
  amount: number;
  verified: boolean;
}> = {}) {
  return {
    id,
    propertyId:       "prop-1",
    homeowner:        "owner-principal",
    contractor:       overrides.contractor   ?? "ctr-principal-abc",
    serviceType:      "HVAC",
    contractorName:   "Bob's Services",
    amount:           overrides.amount       ?? 200_000,
    date:             "2024-06-01",
    description:      "HVAC service",
    isDiy:            false,
    status:           (overrides.status      ?? "verified") as any,
    verified:         overrides.verified     ?? true,
    homeownerSigned:  true,
    contractorSigned: true,
    photos:           [],
    createdAt:        Date.now(),
    permitNumber:     undefined,
    warrantyMonths:   undefined,
  };
}

// ─── list_leads ────────────────────────────────────────────────────────────────

describe("list_leads", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns open requests matching the contractor's specialties", async () => {
    vi.mocked(contractorService.getMyProfile).mockResolvedValue(
      makeContractorProfile(["HVAC", "Plumbing"]) as any
    );
    vi.mocked(quoteService.getOpenRequests).mockResolvedValue([
      makeOpenRequest("REQ_1", "HVAC",      "high"),
      makeOpenRequest("REQ_2", "Roofing",   "medium"),
      makeOpenRequest("REQ_3", "Plumbing",  "emergency"),
      makeOpenRequest("REQ_4", "Electrical","low"),
    ] as any);

    const result = await executeTool("list_leads", {});

    expect(result.success).toBe(true);
    const leads = result.data?.leads as any[];
    expect(leads).toHaveLength(2);
    const types = leads.map((l: any) => l.serviceType);
    expect(types).toContain("HVAC");
    expect(types).toContain("Plumbing");
    expect(types).not.toContain("Roofing");
  });

  it("sorts matched leads by urgency — emergency first", async () => {
    vi.mocked(contractorService.getMyProfile).mockResolvedValue(
      makeContractorProfile(["HVAC"]) as any
    );
    vi.mocked(quoteService.getOpenRequests).mockResolvedValue([
      makeOpenRequest("REQ_1", "HVAC", "low"),
      makeOpenRequest("REQ_2", "HVAC", "emergency"),
      makeOpenRequest("REQ_3", "HVAC", "high"),
    ] as any);

    const result = await executeTool("list_leads", {});

    const leads = result.data?.leads as any[];
    expect(leads[0].urgency).toBe("emergency");
    expect(leads[1].urgency).toBe("high");
    expect(leads[2].urgency).toBe("low");
  });

  it("returns a helpful message when no leads match specialties", async () => {
    vi.mocked(contractorService.getMyProfile).mockResolvedValue(
      makeContractorProfile(["Flooring"]) as any
    );
    vi.mocked(quoteService.getOpenRequests).mockResolvedValue([
      makeOpenRequest("REQ_1", "HVAC"),
      makeOpenRequest("REQ_2", "Roofing"),
    ] as any);

    const result = await executeTool("list_leads", {});

    expect(result.success).toBe(true);
    expect(result.data?.summary).toMatch(/no.*lead|no.*match|0 lead/i);
  });

  it("returns failure when getMyProfile returns null (not a contractor)", async () => {
    vi.mocked(contractorService.getMyProfile).mockResolvedValue(null);

    const result = await executeTool("list_leads", {});

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/contractor profile|not found/i);
  });

  it("caps results at 5 leads", async () => {
    vi.mocked(contractorService.getMyProfile).mockResolvedValue(
      makeContractorProfile(["HVAC"]) as any
    );
    vi.mocked(quoteService.getOpenRequests).mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => makeOpenRequest(`REQ_${i}`, "HVAC")) as any
    );

    const result = await executeTool("list_leads", {});

    expect((result.data!.leads as any[]).length).toBeLessThanOrEqual(5);
  });
});

// ─── submit_bid ────────────────────────────────────────────────────────────────

describe("submit_bid", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls quoteService.submitQuote with amount converted from dollars to cents", async () => {
    vi.mocked(quoteService.submitQuote).mockResolvedValue({
      id: "QUOTE_NEW", requestId: "REQ_1",
      contractor: "ctr-abc", amount: 150_000,
      timeline: 5, validUntil: Date.now() + 7 * 86_400_000,
      status: "pending", createdAt: Date.now(),
    } as any);

    await executeTool("submit_bid", {
      request_id:   "REQ_1",
      amount_dollars: 1500,
      timeline_days:  5,
    });

    expect(quoteService.submitQuote).toHaveBeenCalledWith(
      "REQ_1",
      150_000,  // 1500 * 100
      5,
      expect.any(Number),
    );
  });

  it("returns success with a summary mentioning the amount and timeline", async () => {
    vi.mocked(quoteService.submitQuote).mockResolvedValue({
      id: "QUOTE_NEW", requestId: "REQ_1",
      contractor: "ctr-abc", amount: 200_000,
      timeline: 3, validUntil: Date.now() + 7 * 86_400_000,
      status: "pending", createdAt: Date.now(),
    } as any);

    const result = await executeTool("submit_bid", {
      request_id:     "REQ_1",
      amount_dollars: 2000,
      timeline_days:  3,
    });

    expect(result.success).toBe(true);
    expect(result.data?.summary).toMatch(/2,000|2000/);
    expect(result.data?.summary).toMatch(/3 day/i);
  });

  it("returns failure when request_id is missing", async () => {
    const result = await executeTool("submit_bid", { amount_dollars: 1000, timeline_days: 5 });
    expect(result.success).toBe(false);
  });

  it("returns failure when amount_dollars is missing", async () => {
    const result = await executeTool("submit_bid", { request_id: "REQ_1", timeline_days: 5 });
    expect(result.success).toBe(false);
  });

  it("returns failure when timeline_days is missing", async () => {
    const result = await executeTool("submit_bid", { request_id: "REQ_1", amount_dollars: 1000 });
    expect(result.success).toBe(false);
  });

  it("propagates error from submitQuote", async () => {
    vi.mocked(quoteService.submitQuote).mockRejectedValue(new Error("QuotaExceeded"));
    const result = await executeTool("submit_bid", {
      request_id: "REQ_1", amount_dollars: 500, timeline_days: 2,
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/QuotaExceeded/);
  });
});

// ─── get_earnings_summary ──────────────────────────────────────────────────────

describe("get_earnings_summary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns total earnings from verified jobs belonging to the contractor", async () => {
    vi.mocked(contractorService.getMyProfile).mockResolvedValue(
      makeContractorProfile() as any
    );
    vi.mocked(jobService.getAll).mockResolvedValue([
      makeJob("J1", { contractor: "ctr-principal-abc", amount: 200_000, status: "verified" }),
      makeJob("J2", { contractor: "ctr-principal-abc", amount: 150_000, status: "verified" }),
      makeJob("J3", { contractor: "other-ctr",         amount: 999_999, status: "verified" }),  // not mine
    ] as any);

    const result = await executeTool("get_earnings_summary", {});

    expect(result.success).toBe(true);
    expect(result.data?.jobsCompleted).toBe(2);
    expect(result.data?.totalEarningsCents).toBe(350_000);
    expect(result.data?.summary).toMatch(/3,500|3500/);  // $3,500
  });

  it("returns 0 earnings when no verified jobs exist for contractor", async () => {
    vi.mocked(contractorService.getMyProfile).mockResolvedValue(
      makeContractorProfile() as any
    );
    vi.mocked(jobService.getAll).mockResolvedValue([]);

    const result = await executeTool("get_earnings_summary", {});

    expect(result.success).toBe(true);
    expect(result.data?.jobsCompleted).toBe(0);
    expect(result.data?.totalEarningsCents).toBe(0);
    expect(result.data?.summary).toMatch(/no.*job|0 job/i);
  });

  it("returns failure when getMyProfile returns null", async () => {
    vi.mocked(contractorService.getMyProfile).mockResolvedValue(null);

    const result = await executeTool("get_earnings_summary", {});

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/contractor profile|not found/i);
  });

  it("counts pending (signed but not fully verified) jobs separately", async () => {
    vi.mocked(contractorService.getMyProfile).mockResolvedValue(
      makeContractorProfile() as any
    );
    vi.mocked(jobService.getAll).mockResolvedValue([
      makeJob("J1", { contractor: "ctr-principal-abc", status: "verified",   amount: 300_000 }),
      makeJob("J2", { contractor: "ctr-principal-abc", status: "completed",  amount: 100_000 }),
      makeJob("J3", { contractor: "ctr-principal-abc", status: "in_progress",amount: 50_000  }),
    ] as any);

    const result = await executeTool("get_earnings_summary", {});

    expect(result.success).toBe(true);
    // Only verified counts toward earnings
    expect(result.data?.jobsCompleted).toBe(1);
    expect(result.data?.totalEarningsCents).toBe(300_000);
    // Pending count (completed but awaiting signature) is visible
    expect(result.data?.pendingCount).toBeGreaterThanOrEqual(1);
  });
});

// ─── toolActionLabel ───────────────────────────────────────────────────────────

describe("toolActionLabel", () => {
  it("returns a human-friendly label for list_leads", () => {
    const label = toolActionLabel("list_leads" as any);
    expect(label.length).toBeGreaterThan(0);
    expect(label).not.toBe("list_leads");
  });

  it("returns a human-friendly label for submit_bid", () => {
    const label = toolActionLabel("submit_bid" as any);
    expect(label.length).toBeGreaterThan(0);
    expect(label).not.toBe("submit_bid");
  });

  it("returns a human-friendly label for get_earnings_summary", () => {
    const label = toolActionLabel("get_earnings_summary" as any);
    expect(label.length).toBeGreaterThan(0);
    expect(label).not.toBe("get_earnings_summary");
  });
});
