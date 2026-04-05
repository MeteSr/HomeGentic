/**
 * TDD tests for §16.5 — Natural Language Report Sharing
 *
 * Covers:
 *   - share_report tool — generates a report and returns a shareable URL (16.5.1)
 *   - revoke_report_link tool — lists active links and revokes by token (16.5.2)
 *   - toolActionLabel includes both new tools
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Service mocks ─────────────────────────────────────────────────────────────

vi.mock("@/services/property", () => ({
  propertyService: {
    getMyProperties: vi.fn(),
    getAll:          vi.fn(),
  },
}));

vi.mock("@/services/job", () => ({
  jobService: {
    create:          vi.fn(),
    verifyJob:       vi.fn(),
    updateJobStatus: vi.fn(),
    getAll:          vi.fn(),
  },
}));

vi.mock("@/services/quote", () => ({
  quoteService: { createRequest: vi.fn() },
}));

vi.mock("@/services/contractor", () => ({
  contractorService: {
    search:       vi.fn(),
    submitReview: vi.fn(),
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
    ...actual,   // keep jobToInput, propertyToInput, etc.
    reportService: {
      generateReport:  vi.fn(),
      listShareLinks:  vi.fn(),
      revokeShareLink: vi.fn(),
      shareUrl:        vi.fn(),
    },
  };
});

import { executeTool, toolActionLabel } from "@/services/agentTools";
import { propertyService } from "@/services/property";
import { jobService }      from "@/services/job";
import { reportService }   from "@/services/report";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeProperty(overrides: Partial<{ id: bigint; address: string }> = {}) {
  return {
    id:                overrides.id      ?? BigInt(1),
    address:           overrides.address ?? "123 Main St",
    city:              "Austin",
    state:             "TX",
    zipCode:           "78701",
    propertyType:      "SingleFamily" as const,
    yearBuilt:         BigInt(2000),
    squareFeet:        BigInt(2000),
    verificationLevel: "Basic" as const,
    tier:              "Pro" as const,
    owner:             "owner-principal",
    createdAt:         BigInt(0),
    updatedAt:         BigInt(0),
    isActive:          true,
  };
}

function makeJob(id: string, serviceType = "HVAC") {
  return {
    id,
    propertyId:       "prop-1",
    homeowner:        "owner-principal",
    contractor:       undefined,
    serviceType,
    contractorName:   "Test Co",
    amount:           150_000,
    date:             "2024-01-15",
    description:      "Service completed",
    isDiy:            false,
    status:           "verified" as const,
    verified:         true,
    homeownerSigned:  true,
    contractorSigned: true,
    photos:           [],
    createdAt:        Date.now(),
    permitNumber:     undefined,
    warrantyMonths:   undefined,
  };
}

function makeShareLink(token: string, overrides: Partial<{
  isActive: boolean;
  visibility: "Public" | "BuyerOnly";
  expiresAt: number | null;
  createdAt: number;
}> = {}) {
  return {
    token,
    snapshotId:  `SNAP_${token}`,
    propertyId:  "1",
    createdBy:   "owner-principal",
    expiresAt:   overrides.expiresAt   ?? null,
    visibility:  overrides.visibility  ?? "Public" as "Public" | "BuyerOnly",
    viewCount:   0,
    isActive:    overrides.isActive    ?? true,
    createdAt:   overrides.createdAt   ?? Date.now() - 86_400_000,
  };
}

// ─── 16.5.1 — share_report ────────────────────────────────────────────────────

describe("share_report", () => {
  beforeEach(() => vi.clearAllMocks());

  it("generates a report and returns the share URL", async () => {
    const prop = makeProperty();
    const job  = makeJob("JOB_1");
    const link = makeShareLink("TOKEN_ABC");

    vi.mocked(propertyService.getMyProperties).mockResolvedValue([prop] as any);
    vi.mocked(jobService.getAll).mockResolvedValue([job] as any);
    vi.mocked(reportService.generateReport).mockResolvedValue(link as any);
    vi.mocked(reportService.shareUrl).mockReturnValue("https://homegentic.app/report/TOKEN_ABC");

    const result = await executeTool("share_report", {
      property_id: "1",
      visibility:  "Public",
    });

    expect(result.success).toBe(true);
    expect(result.data?.url).toBe("https://homegentic.app/report/TOKEN_ABC");
    expect(result.data?.token).toBe("TOKEN_ABC");
    expect(reportService.generateReport).toHaveBeenCalled();
  });

  it("passes BuyerOnly visibility to generateReport", async () => {
    const prop = makeProperty();
    const link = makeShareLink("TOKEN_BUYER", { visibility: "BuyerOnly" });

    vi.mocked(propertyService.getMyProperties).mockResolvedValue([prop] as any);
    vi.mocked(jobService.getAll).mockResolvedValue([] as any);
    vi.mocked(reportService.generateReport).mockResolvedValue(link as any);
    vi.mocked(reportService.shareUrl).mockReturnValue("https://homegentic.app/report/TOKEN_BUYER");

    const result = await executeTool("share_report", {
      property_id: "1",
      visibility:  "BuyerOnly",
    });

    expect(result.success).toBe(true);
    const [, , , , , , visibility] = vi.mocked(reportService.generateReport).mock.calls[0];
    expect(visibility).toBe("BuyerOnly");
  });

  it("passes expiry_days to generateReport when provided", async () => {
    const prop = makeProperty();
    const link = makeShareLink("TOKEN_EXP");

    vi.mocked(propertyService.getMyProperties).mockResolvedValue([prop] as any);
    vi.mocked(jobService.getAll).mockResolvedValue([] as any);
    vi.mocked(reportService.generateReport).mockResolvedValue(link as any);
    vi.mocked(reportService.shareUrl).mockReturnValue("https://homegentic.app/report/TOKEN_EXP");

    await executeTool("share_report", {
      property_id:  "1",
      visibility:   "Public",
      expiry_days:  30,
    });

    const [, , , , , expiryDays] = vi.mocked(reportService.generateReport).mock.calls[0];
    expect(expiryDays).toBe(30);
  });

  it("defaults to null expiry when expiry_days is not provided", async () => {
    const prop = makeProperty();
    const link = makeShareLink("TOKEN_NOEXP");

    vi.mocked(propertyService.getMyProperties).mockResolvedValue([prop] as any);
    vi.mocked(jobService.getAll).mockResolvedValue([] as any);
    vi.mocked(reportService.generateReport).mockResolvedValue(link as any);
    vi.mocked(reportService.shareUrl).mockReturnValue("https://homegentic.app/report/TOKEN_NOEXP");

    await executeTool("share_report", {
      property_id: "1",
      visibility:  "Public",
    });

    const [, , , , , expiryDays] = vi.mocked(reportService.generateReport).mock.calls[0];
    expect(expiryDays).toBeNull();
  });

  it("returns failure when no properties are registered", async () => {
    vi.mocked(propertyService.getMyProperties).mockResolvedValue([]);
    vi.mocked(jobService.getAll).mockResolvedValue([]);

    const result = await executeTool("share_report", {
      visibility: "Public",
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no propert/i);
    expect(reportService.generateReport).not.toHaveBeenCalled();
  });

  it("returns failure and propagates error when generateReport throws", async () => {
    const prop = makeProperty();

    vi.mocked(propertyService.getMyProperties).mockResolvedValue([prop] as any);
    vi.mocked(jobService.getAll).mockResolvedValue([]);
    vi.mocked(reportService.generateReport).mockRejectedValue(
      new Error("Property must be verified")
    );

    const result = await executeTool("share_report", {
      property_id: "1",
      visibility:  "Public",
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/verified/i);
  });

  it("summary includes visibility and expiry info", async () => {
    const prop = makeProperty();
    const link = makeShareLink("TOKEN_SUMMARY", { expiresAt: Date.now() + 30 * 86_400_000 });

    vi.mocked(propertyService.getMyProperties).mockResolvedValue([prop] as any);
    vi.mocked(jobService.getAll).mockResolvedValue([] as any);
    vi.mocked(reportService.generateReport).mockResolvedValue(link as any);
    vi.mocked(reportService.shareUrl).mockReturnValue("https://homegentic.app/report/TOKEN_SUMMARY");

    const result = await executeTool("share_report", {
      property_id: "1",
      visibility:  "Public",
      expiry_days: 30,
    });

    expect(result.data?.summary).toMatch(/report|link|share/i);
  });
});

// ─── 16.5.2 — revoke_report_link ─────────────────────────────────────────────

describe("revoke_report_link", () => {
  beforeEach(() => vi.clearAllMocks());

  it("revokes an active link by token and returns success", async () => {
    vi.mocked(reportService.revokeShareLink).mockResolvedValue(undefined);

    const result = await executeTool("revoke_report_link", {
      token: "TOKEN_ABC",
    });

    expect(result.success).toBe(true);
    expect(reportService.revokeShareLink).toHaveBeenCalledWith("TOKEN_ABC");
    expect(result.data?.summary).toMatch(/revok/i);
  });

  it("returns failure when revokeShareLink throws", async () => {
    vi.mocked(reportService.revokeShareLink).mockRejectedValue(
      new Error("NotFound")
    );

    const result = await executeTool("revoke_report_link", {
      token: "TOKEN_MISSING",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("NotFound");
  });

  it("returns failure when token is missing", async () => {
    const result = await executeTool("revoke_report_link", {});

    expect(result.success).toBe(false);
  });

  it("lists active links for a property when property_id is provided", async () => {
    const links = [
      makeShareLink("T1", { createdAt: Date.now() - 2 * 86_400_000 }),
      makeShareLink("T2", { createdAt: Date.now() - 1 * 86_400_000 }),
    ];
    vi.mocked(reportService.listShareLinks).mockResolvedValue(links as any);

    const result = await executeTool("revoke_report_link", {
      list_links_for_property: "1",
    });

    expect(result.success).toBe(true);
    expect(result.data?.links).toHaveLength(2);
    expect(reportService.listShareLinks).toHaveBeenCalledWith("1");
    expect(reportService.revokeShareLink).not.toHaveBeenCalled();
  });

  it("returns empty list message when no active links exist", async () => {
    vi.mocked(reportService.listShareLinks).mockResolvedValue([]);

    const result = await executeTool("revoke_report_link", {
      list_links_for_property: "1",
    });

    expect(result.success).toBe(true);
    expect(result.data?.summary).toMatch(/no.*link|link.*none/i);
  });
});

// ─── toolActionLabel ──────────────────────────────────────────────────────────

describe("toolActionLabel", () => {
  it("returns a human-friendly label for share_report", () => {
    const label = toolActionLabel("share_report" as any);
    expect(label.length).toBeGreaterThan(0);
    expect(label).not.toBe("share_report");
  });

  it("returns a human-friendly label for revoke_report_link", () => {
    const label = toolActionLabel("revoke_report_link" as any);
    expect(label.length).toBeGreaterThan(0);
    expect(label).not.toBe("revoke_report_link");
  });
});
