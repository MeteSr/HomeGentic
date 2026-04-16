import { describe, it, expect, beforeEach, vi } from "vitest";
import { jobService, isInsuranceRelevant, INSURANCE_SERVICE_TYPES } from "@/services/job";
import { jobToInput } from "@/services/report";
import type { Job } from "@/services/job";

// Ensure Date.now() always increments so consecutive create() calls get unique IDs.
let _nowCounter = 1_000_000_000;
vi.spyOn(Date, "now").mockImplementation(() => ++_nowCounter);

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id:               "1",
    propertyId:       "prop-1",
    homeowner:        "test-principal",
    serviceType:      "HVAC",
    amount:           120_000,   // cents
    date:             "2024-06-15",
    description:      "HVAC replacement",
    isDiy:            false,
    status:           "verified",
    verified:         true,
    homeownerSigned:  true,
    contractorSigned: true,
    photos:           [],
    createdAt:        Date.now(),
    ...overrides,
  };
}

// ─── getTotalValue ────────────────────────────────────────────────────────────

describe("jobService.getTotalValue", () => {
  it("returns 0 for empty array", () => {
    expect(jobService.getTotalValue([])).toBe(0);
  });

  it("sums all amounts in cents", () => {
    const jobs = [
      makeJob({ amount: 120_000 }),
      makeJob({ amount: 850_000 }),
      makeJob({ amount:  65_000 }),
    ];
    expect(jobService.getTotalValue(jobs)).toBe(1_035_000);
  });

  it("handles a single job", () => {
    expect(jobService.getTotalValue([makeJob({ amount: 999 })])).toBe(999);
  });
});

// ─── getVerifiedCount ─────────────────────────────────────────────────────────

describe("jobService.getVerifiedCount", () => {
  it("returns 0 when no jobs are verified", () => {
    const jobs = [makeJob({ status: "pending" }), makeJob({ status: "completed" })];
    expect(jobService.getVerifiedCount(jobs)).toBe(0);
  });

  it("counts only verified jobs", () => {
    const jobs = [
      makeJob({ status: "verified"  }),
      makeJob({ status: "pending"   }),
      makeJob({ status: "verified"  }),
      makeJob({ status: "completed" }),
    ];
    expect(jobService.getVerifiedCount(jobs)).toBe(2);
  });

  it("returns total when all jobs are verified", () => {
    const jobs = [
      makeJob({ status: "verified" }),
      makeJob({ status: "verified" }),
    ];
    expect(jobService.getVerifiedCount(jobs)).toBe(2);
  });
});

// ─── isDiy ────────────────────────────────────────────────────────────────────

describe("jobService.isDiy", () => {
  it("returns true for DIY jobs", () => {
    expect(jobService.isDiy(makeJob({ isDiy: true }))).toBe(true);
  });

  it("returns false for contractor jobs", () => {
    expect(jobService.isDiy(makeJob({ isDiy: false }))).toBe(false);
  });
});

// ─── mock data integrity ─────────────────────────────────────────────────────

describe("mock data", () => {
  it("all amounts are in cents (≥ 1000)", async () => {
    const jobs = await jobService.getAll();
    jobs.forEach((j) => {
      expect(j.amount).toBeGreaterThanOrEqual(1_000);
    });
  });

  it("all jobs have an isDiy field", async () => {
    const jobs = await jobService.getAll();
    jobs.forEach((j) => {
      expect(typeof j.isDiy).toBe("boolean");
    });
  });

  it("DIY jobs have no contractorName", async () => {
    const jobs = await jobService.getAll();
    jobs.filter((j) => j.isDiy).forEach((j) => {
      expect(j.contractorName).toBeUndefined();
    });
  });
});

// ─── Mock-store lifecycle tests ───────────────────────────────────────────────
// Each describe block uses a unique propertyId so MOCK_JOBS doesn't bleed between suites
// (reset() only clears _actor, not MOCK_JOBS).

describe("jobService.create", () => {
  beforeEach(() => jobService.reset());

  it("returns a job with default fields", async () => {
    const job = await jobService.create({
      propertyId:  "create-prop-1",
      serviceType: "Plumbing",
      amount:      50_000,
      date:        "2024-05-01",
      description: "Fix leak",
      isDiy:       false,
    });
    expect(job.status).toBe("pending");
    expect(job.verified).toBe(false);
    expect(job.homeownerSigned).toBe(false);
    expect(job.photos).toEqual([]);
    expect(typeof job.id).toBe("string");
  });

  it("sets contractorSigned=true for DIY jobs", async () => {
    const job = await jobService.create({
      propertyId:  "create-prop-1",
      serviceType: "Painting",
      amount:      10_000,
      date:        "2024-06-01",
      description: "Painted walls",
      isDiy:       true,
    });
    expect(job.contractorSigned).toBe(true);
    expect(job.isDiy).toBe(true);
  });

  it("sets contractorSigned=false for contractor jobs", async () => {
    const job = await jobService.create({
      propertyId:   "create-prop-1",
      serviceType:  "HVAC",
      amount:       200_000,
      date:         "2024-07-01",
      description:  "New unit",
      isDiy:        false,
      contractorName: "Cool Air Inc",
    });
    expect(job.contractorSigned).toBe(false);
    expect(job.contractorName).toBe("Cool Air Inc");
  });

  it("stores optional permit and warranty fields", async () => {
    const job = await jobService.create({
      propertyId:    "create-prop-1",
      serviceType:   "Electrical",
      amount:        30_000,
      date:          "2024-08-01",
      description:   "Panel upgrade",
      isDiy:         false,
      permitNumber:  "ELEC-2024-99",
      warrantyMonths: 12,
    });
    expect(job.permitNumber).toBe("ELEC-2024-99");
    expect(job.warrantyMonths).toBe(12);
  });
});

describe("jobService.getByProperty", () => {
  beforeEach(() => jobService.reset());

  it("returns empty array when no jobs exist for a property", async () => {
    const result = await jobService.getByProperty("gbp-prop-no-match");
    expect(result).toEqual([]);
  });

  it("returns only jobs matching the requested propertyId", async () => {
    await jobService.create({ propertyId: "gbp-prop-A", serviceType: "HVAC",    amount: 1_000, date: "2024-01-01", description: "d", isDiy: false });
    await jobService.create({ propertyId: "gbp-prop-B", serviceType: "Roofing", amount: 2_000, date: "2024-01-02", description: "d", isDiy: false });
    await jobService.create({ propertyId: "gbp-prop-A", serviceType: "Plumbing",amount: 3_000, date: "2024-01-03", description: "d", isDiy: false });

    const result = await jobService.getByProperty("gbp-prop-A");
    expect(result).toHaveLength(2);
    result.forEach((j) => expect(j.propertyId).toBe("gbp-prop-A"));
  });
});

describe("jobService.updateJob", () => {
  beforeEach(() => jobService.reset());

  it("updates editable fields on an existing job", async () => {
    const created = await jobService.create({ propertyId: "upd-prop-1", serviceType: "Painting", amount: 5_000, date: "2024-01-01", description: "old", isDiy: false });
    const updated = await jobService.updateJob(created.id, { description: "new description", amount: 9_000 });
    expect(updated.description).toBe("new description");
    expect(updated.amount).toBe(9_000);
  });

  it("throws 'Job not found' for an unknown id", async () => {
    await expect(jobService.updateJob("nonexistent-id", { description: "x" }))
      .rejects.toThrow("Job not found");
  });
});

describe("jobService.updateJobStatus", () => {
  beforeEach(() => jobService.reset());

  it("transitions through all four status values", async () => {
    const created = await jobService.create({ propertyId: "ust-prop-1", serviceType: "Flooring", amount: 8_000, date: "2024-01-01", description: "d", isDiy: false });
    for (const status of ["pending", "in_progress", "completed", "verified"] as const) {
      const j = await jobService.updateJobStatus(created.id, status);
      expect(j.status).toBe(status);
    }
  });

  it("throws 'Job not found' for an unknown id", async () => {
    await expect(jobService.updateJobStatus("bad-id", "completed"))
      .rejects.toThrow("Job not found");
  });
});

describe("jobService.verifyJob", () => {
  beforeEach(() => jobService.reset());

  it("fully verifies a DIY job on first call", async () => {
    const created = await jobService.create({ propertyId: "vj-prop-diy", serviceType: "Painting", amount: 1_000, date: "2024-01-01", description: "d", isDiy: true });
    const verified = await jobService.verifyJob(created.id);
    expect(verified.homeownerSigned).toBe(true);
    expect(verified.contractorSigned).toBe(true);
    expect(verified.verified).toBe(true);
    expect(verified.status).toBe("verified");
  });

  it("only sets homeownerSigned for a non-DIY job (contractor still unsigned)", async () => {
    const created = await jobService.create({ propertyId: "vj-prop-con", serviceType: "HVAC", amount: 1_000, date: "2024-01-01", description: "d", isDiy: false });
    const result = await jobService.verifyJob(created.id);
    expect(result.homeownerSigned).toBe(true);
    expect(result.contractorSigned).toBe(false);
    expect(result.verified).toBe(false);
  });

  it("throws 'Job not found' for an unknown id", async () => {
    await expect(jobService.verifyJob("ghost-id")).rejects.toThrow("Job not found");
  });
});

describe("jobService.linkContractor", () => {
  beforeEach(() => jobService.reset());

  it("sets the contractor field on a job", async () => {
    const created = await jobService.create({ propertyId: "lc-prop-1", serviceType: "Plumbing", amount: 1_000, date: "2024-01-01", description: "d", isDiy: false });
    const linked = await jobService.linkContractor(created.id, "contractor-principal-123");
    expect(linked.contractor).toBe("contractor-principal-123");
  });

  it("throws 'Job not found' for an unknown id", async () => {
    await expect(jobService.linkContractor("no-such-id", "p")).rejects.toThrow("Job not found");
  });
});

describe("jobService.getJobsPendingMySignature", () => {
  it("returns empty array when no canister ID is configured", async () => {
    const result = await jobService.getJobsPendingMySignature();
    expect(result).toEqual([]);
  });
});

describe("jobService.getCertificationData", () => {
  beforeEach(() => jobService.reset());

  it("returns zeros for a property with no jobs", async () => {
    const data = await jobService.getCertificationData("cert-prop-empty");
    expect(data.verifiedJobCount).toBe(0);
    expect(data.verifiedKeySystems).toEqual([]);
    expect(data.meetsStructural).toBe(false);
  });

  it("does not count unverified jobs", async () => {
    await jobService.create({ propertyId: "cert-prop-unver", serviceType: "HVAC", amount: 1_000, date: "2024-01-01", description: "d", isDiy: false });
    const data = await jobService.getCertificationData("cert-prop-unver");
    expect(data.verifiedJobCount).toBe(0);
    expect(data.meetsStructural).toBe(false);
  });

  it("meetsStructural=false with fewer than 3 verified jobs", async () => {
    const j1 = await jobService.create({ propertyId: "cert-prop-few", serviceType: "HVAC",    amount: 1_000, date: "2024-01-01", description: "d", isDiy: true });
    const j2 = await jobService.create({ propertyId: "cert-prop-few", serviceType: "Roofing", amount: 2_000, date: "2024-01-02", description: "d", isDiy: true });
    await jobService.verifyJob(j1.id);
    await jobService.verifyJob(j2.id);
    const data = await jobService.getCertificationData("cert-prop-few");
    expect(data.verifiedJobCount).toBe(2);
    expect(data.meetsStructural).toBe(false);
  });

  it("meetsStructural=true with 3 verified DIY jobs across 2+ key systems", async () => {
    const j1 = await jobService.create({ propertyId: "cert-prop-full", serviceType: "HVAC",      amount: 1_000, date: "2024-01-01", description: "d", isDiy: true });
    const j2 = await jobService.create({ propertyId: "cert-prop-full", serviceType: "Roofing",   amount: 2_000, date: "2024-01-02", description: "d", isDiy: true });
    const j3 = await jobService.create({ propertyId: "cert-prop-full", serviceType: "Electrical", amount: 3_000, date: "2024-01-03", description: "d", isDiy: true });
    await jobService.verifyJob(j1.id);
    await jobService.verifyJob(j2.id);
    await jobService.verifyJob(j3.id);
    const data = await jobService.getCertificationData("cert-prop-full");
    expect(data.verifiedJobCount).toBe(3);
    expect(data.verifiedKeySystems.length).toBeGreaterThanOrEqual(2);
    expect(data.meetsStructural).toBe(true);
  });

  it("only counts KEY_SYSTEMS (HVAC, Roofing, Plumbing, Electrical) in verifiedKeySystems", async () => {
    const j1 = await jobService.create({ propertyId: "cert-prop-keys", serviceType: "Painting", amount: 1_000, date: "2024-01-01", description: "d", isDiy: true });
    const j2 = await jobService.create({ propertyId: "cert-prop-keys", serviceType: "HVAC",     amount: 2_000, date: "2024-01-02", description: "d", isDiy: true });
    const j3 = await jobService.create({ propertyId: "cert-prop-keys", serviceType: "Roofing",  amount: 3_000, date: "2024-01-03", description: "d", isDiy: true });
    await jobService.verifyJob(j1.id);
    await jobService.verifyJob(j2.id);
    await jobService.verifyJob(j3.id);
    const data = await jobService.getCertificationData("cert-prop-keys");
    expect(data.verifiedKeySystems).not.toContain("Painting");
    expect(data.verifiedKeySystems).toContain("HVAC");
    expect(data.verifiedKeySystems).toContain("Roofing");
  });
});

// ─── isInsuranceRelevant ──────────────────────────────────────────────────────

describe("isInsuranceRelevant", () => {
  it("returns true for all five insurance-relevant service types", () => {
    const relevant = ["Roofing", "HVAC", "Electrical", "Plumbing", "Foundation"];
    relevant.forEach((t) => expect(isInsuranceRelevant(t)).toBe(true));
  });

  it("returns false for non-insurance service types", () => {
    const irrelevant = ["Painting", "Flooring", "Landscaping", "Windows"];
    irrelevant.forEach((t) => expect(isInsuranceRelevant(t)).toBe(false));
  });
});

describe("INSURANCE_SERVICE_TYPES", () => {
  it("contains exactly the five expected types", () => {
    expect(INSURANCE_SERVICE_TYPES.has("Roofing")).toBe(true);
    expect(INSURANCE_SERVICE_TYPES.has("HVAC")).toBe(true);
    expect(INSURANCE_SERVICE_TYPES.has("Electrical")).toBe(true);
    expect(INSURANCE_SERVICE_TYPES.has("Plumbing")).toBe(true);
    expect(INSURANCE_SERVICE_TYPES.has("Foundation")).toBe(true);
  });

  it("does not contain non-insurance types", () => {
    expect(INSURANCE_SERVICE_TYPES.has("Painting")).toBe(false);
    expect(INSURANCE_SERVICE_TYPES.has("Flooring")).toBe(false);
  });
});

// ─── createInviteToken ────────────────────────────────────────────────────────

describe("jobService.createInviteToken", () => {
  it("returns a MOCK_INV_ prefixed token in mock mode", async () => {
    const token = await jobService.createInviteToken("job-abc", "123 Main St");
    expect(token).toBe("MOCK_INV_job-abc");
  });
});

// ─── getJobByInviteToken ──────────────────────────────────────────────────────

describe("jobService.getJobByInviteToken", () => {
  it("returns a preview with jobId, serviceType, and amount in mock mode", async () => {
    const preview = await jobService.getJobByInviteToken("any-token");
    expect(preview.jobId).toBe("MOCK_JOB");
    expect(typeof preview.serviceType).toBe("string");
    expect(preview.amount).toBeGreaterThan(0);
    expect(preview.alreadySigned).toBe(false);
    expect(preview.expiresAt).toBeGreaterThan(Date.now());
  });
});

// ─── redeemInviteToken ────────────────────────────────────────────────────────

describe("jobService.redeemInviteToken", () => {
  it("returns a mock verified job in mock mode", async () => {
    const job = await jobService.redeemInviteToken("any-token");
    expect(job.id).toBe("MOCK_JOB");
    expect(job.verified).toBe(true);
    expect(job.homeownerSigned).toBe(true);
    expect(job.contractorSigned).toBe(true);
  });
});

// ─── getReferralJobs ──────────────────────────────────────────────────────────

describe("jobService.getReferralJobs", () => {
  it("returns empty array in mock mode (no canister ID)", async () => {
    const result = await jobService.getReferralJobs();
    expect(result).toEqual([]);
  });
});

// ─── createJobProposal ────────────────────────────────────────────────────────

describe("jobService.createJobProposal", () => {
  beforeEach(() => jobService.reset());

  it("creates a proposal with status pending_homeowner_approval", async () => {
    const proposal = await jobService.createJobProposal({
      propertyId:     "proposal-prop-1",
      serviceType:    "Plumbing",
      description:    "Fix kitchen leak",
      contractorName: "Pipes Inc",
      amountCents:    35_000,
      completedDate:  "2024-09-01",
    });
    expect(proposal.status).toBe("pending_homeowner_approval");
    expect(proposal.contractorSigned).toBe(true);
    expect(proposal.homeownerSigned).toBe(false);
    expect(proposal.isDiy).toBe(false);
    expect(proposal.contractorName).toBe("Pipes Inc");
    expect(proposal.amount).toBe(35_000);
  });

  it("stores optional permit and warranty on proposal", async () => {
    const proposal = await jobService.createJobProposal({
      propertyId:     "proposal-prop-2",
      serviceType:    "Electrical",
      description:    "Panel upgrade",
      contractorName: "Sparks LLC",
      amountCents:    75_000,
      completedDate:  "2024-10-01",
      permitNumber:   "ELEC-2024-77",
      warrantyMonths: 24,
    });
    expect(proposal.permitNumber).toBe("ELEC-2024-77");
    expect(proposal.warrantyMonths).toBe(24);
  });
});

// ─── getPendingProposals ──────────────────────────────────────────────────────

describe("jobService.getPendingProposals", () => {
  beforeEach(() => jobService.reset());

  it("returns empty array when no proposals exist", async () => {
    const result = await jobService.getPendingProposals();
    expect(result).toEqual([]);
  });

  it("returns only jobs with pending_homeowner_approval status", async () => {
    await jobService.create({ propertyId: "pp-prop-1", serviceType: "HVAC", amount: 1_000, date: "2024-01-01", description: "d", isDiy: false });
    await jobService.createJobProposal({ propertyId: "pp-prop-1", serviceType: "Roofing", description: "d", contractorName: "X", amountCents: 5_000, completedDate: "2024-01-02" });
    const proposals = await jobService.getPendingProposals();
    expect(proposals.every((j) => j.status === "pending_homeowner_approval")).toBe(true);
    expect(proposals.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── approveJobProposal ───────────────────────────────────────────────────────

describe("jobService.approveJobProposal", () => {
  beforeEach(() => jobService.reset());

  it("sets homeownerSigned=true and status='pending' on approval", async () => {
    const proposal = await jobService.createJobProposal({
      propertyId: "approve-prop-1", serviceType: "Plumbing", description: "d",
      contractorName: "X", amountCents: 10_000, completedDate: "2024-01-01",
    });
    const approved = await jobService.approveJobProposal(proposal.id);
    expect(approved.homeownerSigned).toBe(true);
    expect(approved.status).toBe("pending");
  });

  it("throws NotFound for an unknown proposal id", async () => {
    await expect(jobService.approveJobProposal("ghost-id")).rejects.toThrow(/not found/i);
  });
});

// ─── rejectJobProposal ────────────────────────────────────────────────────────

describe("jobService.rejectJobProposal", () => {
  beforeEach(() => jobService.reset());

  it("removes the proposal from the store on rejection", async () => {
    const proposal = await jobService.createJobProposal({
      propertyId: "reject-prop-1", serviceType: "Roofing", description: "d",
      contractorName: "Y", amountCents: 20_000, completedDate: "2024-01-01",
    });
    await expect(jobService.rejectJobProposal(proposal.id)).resolves.toBeUndefined();
    const proposals = await jobService.getPendingProposals();
    expect(proposals.find((j) => j.id === proposal.id)).toBeUndefined();
  });

  it("throws NotFound for an unknown proposal id", async () => {
    await expect(jobService.rejectJobProposal("ghost-id")).rejects.toThrow(/not found/i);
  });
});

// ─── updateJobStatus — pending_homeowner_approval and rejected_by_homeowner ──

describe("jobService.updateJobStatus — extended statuses", () => {
  beforeEach(() => jobService.reset());

  it("transitions to pending_homeowner_approval", async () => {
    const j = await jobService.create({ propertyId: "ext-status-1", serviceType: "Plumbing", amount: 1_000, date: "2024-01-01", description: "d", isDiy: false });
    const updated = await jobService.updateJobStatus(j.id, "pending_homeowner_approval");
    expect(updated.status).toBe("pending_homeowner_approval");
  });

  it("transitions to rejected_by_homeowner", async () => {
    const j = await jobService.create({ propertyId: "ext-status-2", serviceType: "Roofing", amount: 1_000, date: "2024-01-01", description: "d", isDiy: false });
    const updated = await jobService.updateJobStatus(j.id, "rejected_by_homeowner");
    expect(updated.status).toBe("rejected_by_homeowner");
  });
});

// ─── jobToInput adapter ───────────────────────────────────────────────────────

describe("jobToInput (report adapter)", () => {
  it("extracts completedYear from the date string", () => {
    const input = jobToInput(makeJob({ date: "2023-08-20" }));
    expect(input.completedYear).toBe(2023);
  });

  it("uses the verified field when present", () => {
    expect(jobToInput(makeJob({ verified: true  })).isVerified).toBe(true);
    expect(jobToInput(makeJob({ verified: false })).isVerified).toBe(false);
  });

  it("falls back to status === 'verified' when verified field is absent", () => {
    const withoutVerified = makeJob({ status: "verified" });
    delete (withoutVerified as any).verified;
    expect(jobToInput(withoutVerified).isVerified).toBe(true);

    const completed = makeJob({ status: "completed" });
    delete (completed as any).verified;
    expect(jobToInput(completed).isVerified).toBe(false);
  });

  it("explicit verified=false overrides a 'verified' status", () => {
    // verified field is the authoritative signal — status is a display concern
    expect(jobToInput(makeJob({ status: "verified", verified: false })).isVerified).toBe(false);
  });

  it("passes amountCents through unchanged", () => {
    const input = jobToInput(makeJob({ amount: 240_000 }));
    expect(input.amountCents).toBe(240_000);
  });

  it("maps isDiy and contractorName", () => {
    const contractor = jobToInput(makeJob({ isDiy: false, contractorName: "ABC Plumbing" }));
    const diy        = jobToInput(makeJob({ isDiy: true,  contractorName: undefined       }));

    expect(contractor.isDiy).toBe(false);
    expect(contractor.contractorName).toBe("ABC Plumbing");
    expect(diy.isDiy).toBe(true);
    expect(diy.contractorName).toBeUndefined();
  });

  it("maps optional permit and warranty fields", () => {
    const withExtras = jobToInput(makeJob({ permitNumber: "HVAC-001", warrantyMonths: 24 }));
    const noExtras   = jobToInput(makeJob({ permitNumber: undefined,  warrantyMonths: undefined }));

    expect(withExtras.permitNumber).toBe("HVAC-001");
    expect(withExtras.warrantyMonths).toBe(24);
    expect(noExtras.permitNumber).toBeUndefined();
    expect(noExtras.warrantyMonths).toBeUndefined();
  });
});
