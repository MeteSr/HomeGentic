/**
 * TDD tests for §16.4 — Post-Job Review Prompting
 *
 * Covers:
 *   - sign_job_verification returns contractor context for review follow-up (16.4.1)
 *   - submit_contractor_review tool — success and error paths (16.4.2)
 *   - toolActionLabel includes submit_contractor_review
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
    search:        vi.fn(),
    submitReview:  vi.fn(),
  },
}));

vi.mock("@/services/maintenance", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/maintenance")>();
  return {
    ...actual,
    maintenanceService: { createScheduleEntry: vi.fn() },
  };
});

vi.mock("@/services/maintenanceForecast", () => ({
  buildMaintenanceForecast: vi.fn().mockReturnValue(null),
}));

import { executeTool, toolActionLabel } from "@/services/agentTools";
import { jobService }        from "@/services/job";
import { contractorService } from "@/services/contractor";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeJob(overrides: Partial<{
  id: string;
  isDiy: boolean;
  contractorName: string;
  contractor: string;
  homeownerSigned: boolean;
  contractorSigned: boolean;
  status: string;
  verified: boolean;
}> = {}) {
  return {
    id:               overrides.id              ?? "JOB_1",
    propertyId:       "prop-1",
    homeowner:        "owner-principal",
    contractor:       overrides.contractor      ?? undefined,
    serviceType:      "HVAC",
    contractorName:   overrides.contractorName  ?? undefined,
    amount:           150_000,
    date:             "2024-01-15",
    description:      "HVAC tune-up",
    isDiy:            overrides.isDiy           ?? false,
    status:           (overrides.status         ?? "completed") as any,
    verified:         overrides.verified        ?? false,
    homeownerSigned:  overrides.homeownerSigned ?? false,
    contractorSigned: overrides.contractorSigned ?? false,
    photos:           [],
    createdAt:        Date.now(),
    permitNumber:     undefined,
    warrantyMonths:   undefined,
  };
}

// ─── 16.4.1 — sign_job_verification includes contractor context ───────────────

describe("sign_job_verification — contractor context for review follow-up", () => {
  beforeEach(() => vi.clearAllMocks());

  it("includes contractorName and contractorPrincipal in result when contractor was involved", async () => {
    const job = makeJob({
      isDiy: false,
      contractorName: "Apex HVAC",
      contractor: "abc-principal-123",
      homeownerSigned: false,
      contractorSigned: true,
      status: "verified",
      verified: true,
    });
    vi.mocked(jobService.verifyJob).mockResolvedValue(job as any);

    const result = await executeTool("sign_job_verification", { job_id: "JOB_1" });

    expect(result.success).toBe(true);
    expect(result.data?.contractorName).toBe("Apex HVAC");
    expect(result.data?.contractorPrincipal).toBe("abc-principal-123");
  });

  it("omits contractor fields when job is DIY", async () => {
    const job = makeJob({
      isDiy: true,
      contractorName: undefined,
      contractor: undefined,
      status: "verified",
      verified: true,
    });
    vi.mocked(jobService.verifyJob).mockResolvedValue(job as any);

    const result = await executeTool("sign_job_verification", { job_id: "JOB_1" });

    expect(result.success).toBe(true);
    expect(result.data?.contractorName).toBeUndefined();
    expect(result.data?.contractorPrincipal).toBeUndefined();
  });

  it("omits contractor fields when contractor principal is absent", async () => {
    // contractor name present but no principal yet (job not yet linked)
    const job = makeJob({
      isDiy: false,
      contractorName: "Bob's Plumbing",
      contractor: undefined,
      status: "completed",
    });
    vi.mocked(jobService.verifyJob).mockResolvedValue(job as any);

    const result = await executeTool("sign_job_verification", { job_id: "JOB_1" });

    expect(result.success).toBe(true);
    // contractorPrincipal is absent — agent can't route the review without it
    expect(result.data?.contractorPrincipal).toBeUndefined();
    // but we still surface the name if available, so agent can mention it in text
    expect(result.data?.contractorName).toBe("Bob's Plumbing");
  });
});

// ─── 16.4.2 — submit_contractor_review tool ───────────────────────────────────

describe("submit_contractor_review", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns success with summary when review is submitted with comment", async () => {
    vi.mocked(contractorService.submitReview).mockResolvedValue(undefined);

    const result = await executeTool("submit_contractor_review", {
      contractor_principal: "abc-principal-123",
      job_id:               "JOB_1",
      rating:               5,
      comment:              "Excellent work, very professional",
    });

    expect(result.success).toBe(true);
    expect(result.data?.summary).toMatch(/review.*submitted|submitted.*review/i);
    expect(contractorService.submitReview).toHaveBeenCalledWith(
      "abc-principal-123",
      5,
      "Excellent work, very professional",
      "JOB_1",
    );
  });

  it("submits with empty comment when comment is omitted", async () => {
    vi.mocked(contractorService.submitReview).mockResolvedValue(undefined);

    const result = await executeTool("submit_contractor_review", {
      contractor_principal: "abc-principal-123",
      job_id:               "JOB_1",
      rating:               4,
    });

    expect(result.success).toBe(true);
    expect(contractorService.submitReview).toHaveBeenCalledWith(
      "abc-principal-123",
      4,
      "",       // empty string when omitted
      "JOB_1",
    );
  });

  it("summary includes rating", async () => {
    vi.mocked(contractorService.submitReview).mockResolvedValue(undefined);

    const result = await executeTool("submit_contractor_review", {
      contractor_principal: "ctr-456",
      job_id:               "JOB_2",
      rating:               3,
    });

    expect(result.data?.summary).toMatch(/3/);
  });

  it("returns failure when rate limit is exceeded", async () => {
    vi.mocked(contractorService.submitReview).mockRejectedValue(
      new Error("RateLimitExceeded")
    );

    const result = await executeTool("submit_contractor_review", {
      contractor_principal: "abc-principal-123",
      job_id:               "JOB_1",
      rating:               5,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/rate limit|RateLimitExceeded/i);
  });

  it("returns failure with error message when submitReview throws", async () => {
    vi.mocked(contractorService.submitReview).mockRejectedValue(
      new Error("AlreadyReviewed")
    );

    const result = await executeTool("submit_contractor_review", {
      contractor_principal: "abc-principal-123",
      job_id:               "JOB_1",
      rating:               5,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("AlreadyReviewed");
  });

  it("returns failure when contractor_principal is missing", async () => {
    const result = await executeTool("submit_contractor_review", {
      job_id: "JOB_1",
      rating: 5,
    });

    expect(result.success).toBe(false);
  });

  it("returns failure when rating is missing", async () => {
    const result = await executeTool("submit_contractor_review", {
      contractor_principal: "abc-principal-123",
      job_id:               "JOB_1",
    });

    expect(result.success).toBe(false);
  });
});

// ─── toolActionLabel ──────────────────────────────────────────────────────────

describe("toolActionLabel", () => {
  it("returns a human-friendly label for submit_contractor_review", () => {
    const label = toolActionLabel("submit_contractor_review" as any);
    expect(label.length).toBeGreaterThan(0);
    expect(label).not.toBe("submit_contractor_review");
  });
});
