/**
 * Contractor-initiated job proposal — frontend service unit tests.
 *
 * contractorJobProposal wraps propertyService + jobService and is responsible for:
 *   1. Looking up the property by address (propertyService.searchByAddress)
 *   2. Checking for duplicates using the detectDuplicate utility
 *   3. Submitting the proposal to the job canister (jobService.createJobProposal)
 *   4. Confirming a staged proposal (jobService.approveJobProposal)
 *
 * Both services are mocked here — canister integration is tested in backend/job/test.sh.
 *
 * Implementation lives in: frontend/src/services/contractorJobProposal.ts
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  proposeJob,
  confirmJobProposal,
  type JobProposalArgs,
  type JobProposalResult,
  type ConfirmProposalResult,
} from "@/services/contractorJobProposal";

// ─── Mock the service layer ───────────────────────────────────────────────────

vi.mock("@/services/property", () => ({
  propertyService: {
    searchByAddress: vi.fn(),
  },
}));

vi.mock("@/services/job", () => ({
  jobService: {
    getByProperty:     vi.fn(),
    createJobProposal: vi.fn(),
    approveJobProposal: vi.fn(),
  },
}));

import { propertyService } from "@/services/property";
import { jobService }      from "@/services/job";

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeArgs(overrides: Partial<JobProposalArgs> = {}): JobProposalArgs {
  return {
    propertyAddress: "123 Main St, Austin TX 78701",
    serviceType:     "HVAC",
    description:     "Full HVAC system replacement — 3-ton Carrier unit.",
    amountCents:     240_000,
    completedDate:   "2026-04-05",
    contractorName:  "Cool Air Services",
    ...overrides,
  };
}

const MOCK_PROPERTY = {
  id:      "prop-abc",
  owner:   "principal-homeowner-xyz",
  address: "123 Main St, Austin TX 78701",
};

const MOCK_PROPOSAL_JOB = {
  id:               "JOB_99",
  propertyId:       "prop-abc",
  homeowner:        "principal-homeowner-xyz",
  contractorSigned: true,
  homeownerSigned:  false,
  status:           "pending_homeowner_approval",
};

// ─── proposeJob — happy path ──────────────────────────────────────────────────

describe("proposeJob — happy path", () => {
  beforeEach(() => {
    (propertyService.searchByAddress as ReturnType<typeof vi.fn>).mockResolvedValue([MOCK_PROPERTY]);
    (jobService.getByProperty        as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (jobService.createJobProposal    as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_PROPOSAL_JOB);
  });

  it("returns success: true when proposal is created", async () => {
    const result: JobProposalResult = await proposeJob(makeArgs());
    expect(result.success).toBe(true);
  });

  it("returns the proposal ID from the service response", async () => {
    const result = await proposeJob(makeArgs());
    expect(result.proposalId).toBe("JOB_99");
  });

  it("returns the propertyId resolved from the address lookup", async () => {
    const result = await proposeJob(makeArgs());
    expect(result.propertyId).toBe("prop-abc");
  });

  it("returns the homeownerPrincipal from the resolved property", async () => {
    const result = await proposeJob(makeArgs());
    expect(result.homeownerPrincipal).toBe("principal-homeowner-xyz");
  });

  it("calls searchByAddress with the provided property address", async () => {
    await proposeJob(makeArgs({ propertyAddress: "456 Oak Ave, Dallas TX 75201" }));
    expect(propertyService.searchByAddress).toHaveBeenCalledWith("456 Oak Ave, Dallas TX 75201");
  });

  it("calls createJobProposal with correct parameters", async () => {
    const args = makeArgs();
    await proposeJob(args);
    expect(jobService.createJobProposal).toHaveBeenCalledWith(
      expect.objectContaining({
        propertyId:    "prop-abc",
        serviceType:   "HVAC",
        description:   args.description,
        amountCents:   240_000,
        completedDate: "2026-04-05",
        contractorName: "Cool Air Services",
      }),
    );
  });
});

// ─── proposeJob — property not found ─────────────────────────────────────────

describe("proposeJob — property not found", () => {
  beforeEach(() => {
    (propertyService.searchByAddress as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  });

  it("returns success: false when address lookup returns no properties", async () => {
    const result = await proposeJob(makeArgs());
    expect(result.success).toBe(false);
  });

  it("returns a descriptive error mentioning address or property", async () => {
    const result = await proposeJob(makeArgs());
    expect(result.error?.toLowerCase()).toMatch(/address|property|not found|no match/);
  });

  it("does NOT call createJobProposal when address lookup fails", async () => {
    await proposeJob(makeArgs());
    expect(jobService.createJobProposal).not.toHaveBeenCalled();
  });
});

// ─── proposeJob — ambiguous address (multiple properties match) ───────────────

describe("proposeJob — ambiguous address", () => {
  const TWO_PROPERTIES = [
    { ...MOCK_PROPERTY, id: "prop-1", address: "123 Main St Unit A, Austin TX" },
    { ...MOCK_PROPERTY, id: "prop-2", address: "123 Main St Unit B, Austin TX" },
  ];

  beforeEach(() => {
    (propertyService.searchByAddress as ReturnType<typeof vi.fn>).mockResolvedValue(TWO_PROPERTIES);
  });

  it("returns success: false when multiple properties match", async () => {
    const result = await proposeJob(makeArgs());
    expect(result.success).toBe(false);
  });

  it("returns an ambiguous error containing the matched addresses", async () => {
    const result = await proposeJob(makeArgs());
    expect(result.error?.toLowerCase()).toMatch(/multiple|ambiguous|which property|clarif/);
  });

  it("returns candidateProperties in the result for disambiguation", async () => {
    const result = await proposeJob(makeArgs());
    expect(Array.isArray(result.candidateProperties)).toBe(true);
    expect(result.candidateProperties?.length).toBe(2);
  });
});

// ─── proposeJob — duplicate detection ────────────────────────────────────────

describe("proposeJob — duplicate detection", () => {
  const EXISTING_HVAC_JOB = {
    id:          "JOB_10",
    propertyId:  "prop-abc",
    serviceType: "HVAC",
    date:        "2026-04-01",   // 4 days before proposed date
    status:      "verified",
  };

  beforeEach(() => {
    (propertyService.searchByAddress as ReturnType<typeof vi.fn>).mockResolvedValue([MOCK_PROPERTY]);
    (jobService.getByProperty        as ReturnType<typeof vi.fn>).mockResolvedValue([EXISTING_HVAC_JOB]);
    (jobService.createJobProposal    as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_PROPOSAL_JOB);
  });

  it("returns success: false when a duplicate is detected", async () => {
    const result = await proposeJob(makeArgs({ completedDate: "2026-04-05" }));
    expect(result.success).toBe(false);
  });

  it("includes duplicate.jobId in the result", async () => {
    const result = await proposeJob(makeArgs({ completedDate: "2026-04-05" }));
    expect(result.duplicate?.jobId).toBe("JOB_10");
  });

  it("includes duplicate.reason in the result", async () => {
    const result = await proposeJob(makeArgs({ completedDate: "2026-04-05" }));
    expect(typeof result.duplicate?.reason).toBe("string");
    expect((result.duplicate?.reason ?? "").length).toBeGreaterThan(0);
  });

  it("does NOT call createJobProposal when duplicate is detected", async () => {
    await proposeJob(makeArgs({ completedDate: "2026-04-05" }));
    expect(jobService.createJobProposal).not.toHaveBeenCalled();
  });

  it("DOES proceed and create proposal when date is outside 14-day window", async () => {
    // 20 days after existing — not a duplicate
    const result = await proposeJob(makeArgs({ completedDate: "2026-04-21" }));
    expect(result.success).toBe(true);
    expect(jobService.createJobProposal).toHaveBeenCalledOnce();
  });
});

// ─── proposeJob — service error propagation ──────────────────────────────────

describe("proposeJob — service error propagation", () => {
  beforeEach(() => {
    (propertyService.searchByAddress as ReturnType<typeof vi.fn>).mockResolvedValue([MOCK_PROPERTY]);
    (jobService.getByProperty        as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  });

  it("returns success: false when createJobProposal throws", async () => {
    (jobService.createJobProposal as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("description too long")
    );
    const result = await proposeJob(makeArgs());
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/description too long|failed/i);
  });

  it("returns success: false and error when network throws", async () => {
    (jobService.createJobProposal as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("canister out of cycles")
    );
    const result = await proposeJob(makeArgs());
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/cycles|network|failed/i);
  });
});

// ─── confirmJobProposal ───────────────────────────────────────────────────────

describe("confirmJobProposal — happy path", () => {
  beforeEach(() => {
    (jobService.approveJobProposal as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...MOCK_PROPOSAL_JOB,
      homeownerSigned: true,
      status: "pending",
    });
  });

  it("returns success: true when the service approves", async () => {
    const result: ConfirmProposalResult = await confirmJobProposal("JOB_99");
    expect(result.success).toBe(true);
  });

  it("returns the job ID", async () => {
    const result = await confirmJobProposal("JOB_99");
    expect(result.jobId).toBe("JOB_99");
  });

  it("calls approveJobProposal on the job service with the proposal ID", async () => {
    await confirmJobProposal("JOB_99");
    expect(jobService.approveJobProposal).toHaveBeenCalledWith("JOB_99");
  });
});

describe("confirmJobProposal — error handling", () => {
  it("returns success: false when service throws NotFound", async () => {
    (jobService.approveJobProposal as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("NotFound")
    );
    const result = await confirmJobProposal("JOB_GHOST");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found|notfound/i);
  });

  it("returns success: false when job was already approved", async () => {
    (jobService.approveJobProposal as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("AlreadyVerified")
    );
    const result = await confirmJobProposal("JOB_99");
    expect(result.success).toBe(false);
  });
});
