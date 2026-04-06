/**
 * §17.5.2 — createJobsFromPermits: writes confirmed permits to jobService
 * §17.5.3 — triggerPermitImport: post-registration background trigger
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createJobsFromPermits,
  triggerPermitImport,
  type ImportedPermit,
} from "@/services/permitImport";

vi.mock("@/services/job", () => ({
  jobService: {
    create: vi.fn().mockResolvedValue({ id: "job-1" }),
  },
}));

vi.mock("@/services/aiProxy", () => ({
  aiProxyService: {
    importPermits: vi.fn(),
  },
}));

import { aiProxyService } from "@/services/aiProxy";

import { jobService } from "@/services/job";

const SAMPLE_PERMITS: ImportedPermit[] = [
  {
    permit: { permitNumber: "2020-ROOF-01", permitType: "Roofing Permit", description: "Shingle replacement", issuedDate: "2020-05-10", status: "Finaled" },
    serviceType: "Roofing",
    jobInput: { propertyId: "prop-1", serviceType: "Roofing", description: "Shingle replacement", amount: 0, date: "2020-05-10", isDiy: true, status: "verified" } as any,
  },
  {
    permit: { permitNumber: "2021-ELEC-02", permitType: "Electrical Permit", description: "Panel upgrade", issuedDate: "2021-06-15", status: "Finaled" },
    serviceType: "Electrical",
    jobInput: { propertyId: "prop-1", serviceType: "Electrical", description: "Panel upgrade", amount: 350000, date: "2021-06-15", isDiy: false, contractorName: "Bright Spark", status: "verified" } as any,
  },
];

// ── 17.5.2 — createJobsFromPermits ───────────────────────────────────────────

describe("createJobsFromPermits", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls jobService.create once per confirmed permit", async () => {
    await createJobsFromPermits("prop-1", SAMPLE_PERMITS);
    expect(jobService.create).toHaveBeenCalledTimes(2);
  });

  it("passes correct serviceType to jobService.create", async () => {
    await createJobsFromPermits("prop-1", SAMPLE_PERMITS);
    const calls = (jobService.create as any).mock.calls;
    expect(calls[0][0].serviceType).toBe("Roofing");
    expect(calls[1][0].serviceType).toBe("Electrical");
  });

  it("passes permitNumber into the job input", async () => {
    await createJobsFromPermits("prop-1", SAMPLE_PERMITS);
    const calls = (jobService.create as any).mock.calls;
    expect(calls[0][0].permitNumber).toBe("2020-ROOF-01");
    expect(calls[1][0].permitNumber).toBe("2021-ELEC-02");
  });

  it("returns the created Job objects", async () => {
    const jobs = await createJobsFromPermits("prop-1", SAMPLE_PERMITS);
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({ id: "job-1" });
  });

  it("returns empty array when no permits provided", async () => {
    const jobs = await createJobsFromPermits("prop-1", []);
    expect(jobs).toHaveLength(0);
    expect(jobService.create).not.toHaveBeenCalled();
  });

  it("creates only confirmed permits when a subset is passed", async () => {
    await createJobsFromPermits("prop-1", [SAMPLE_PERMITS[0]]);
    expect(jobService.create).toHaveBeenCalledTimes(1);
  });
});

// ── 17.5.3 — triggerPermitImport ─────────────────────────────────────────────

describe("triggerPermitImport", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns citySupported: false for unsupported city without calling jobService", async () => {
    const result = await triggerPermitImport({
      id: "prop-1", address: "99 Pine St", city: "Smalltown", state: "WY", zipCode: "82001",
    } as any);
    expect(result.citySupported).toBe(false);
    expect(jobService.create).not.toHaveBeenCalled();
  });

  it("returns imported count and permits for a supported city", async () => {
    vi.mocked(aiProxyService.importPermits).mockResolvedValueOnce(
      JSON.stringify({
        source: "openpermit",
        data: { results: [
          { permit_number: "2020-ROOF-01", permit_type: "Roofing Permit",    description: "Shingle replacement", issued_date: "2020-05-10", status: "Finaled" },
          { permit_number: "2021-ELEC-02", permit_type: "Electrical Permit", description: "Panel upgrade",        issued_date: "2021-06-15", status: "Finaled", estimated_value: 3500, contractor_name: "Bright Spark" },
        ]},
      })
    );

    const result = await triggerPermitImport({
      id: "prop-1", address: "456 Oak Ave", city: "Daytona Beach", state: "FL", zipCode: "32114",
    } as any);
    expect(result.citySupported).toBe(true);
    expect(result.imported).toBe(2);
  });

  it("does NOT auto-create jobs — returns permits for review", async () => {
    vi.mocked(aiProxyService.importPermits).mockResolvedValueOnce(
      JSON.stringify({
        source: "openpermit",
        data: { results: [
          { permit_number: "2020-ROOF-01", permit_type: "Roofing Permit", description: "Shingle replacement", issued_date: "2020-05-10", status: "Finaled" },
          { permit_number: "2021-ELEC-02", permit_type: "Electrical Permit", description: "Panel upgrade", issued_date: "2021-06-15", status: "Finaled" },
        ]},
      })
    );

    await triggerPermitImport({
      id: "prop-1", address: "456 Oak Ave", city: "Daytona Beach", state: "FL", zipCode: "32114",
    } as any);
    expect(jobService.create).not.toHaveBeenCalled();
  });

  it("returns the raw permits for the review UI", async () => {
    vi.mocked(aiProxyService.importPermits).mockResolvedValueOnce(
      JSON.stringify({
        source: "openpermit",
        data: { results: [
          { permit_number: "2020-ROOF-01", permit_type: "Roofing Permit", description: "Shingle replacement", issued_date: "2020-05-10", status: "Finaled" },
          { permit_number: "2021-ELEC-02", permit_type: "Electrical Permit", description: "Panel upgrade", issued_date: "2021-06-15", status: "Finaled" },
        ]},
      })
    );

    const result = await triggerPermitImport({
      id: "prop-1", address: "456 Oak Ave", city: "Daytona Beach", state: "FL", zipCode: "32114",
    } as any);
    expect(result.permits).toHaveLength(2);
  });
});
