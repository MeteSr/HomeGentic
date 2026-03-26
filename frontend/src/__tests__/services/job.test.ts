import { describe, it, expect } from "vitest";
import { jobService } from "@/services/job";
import { jobToInput } from "@/services/report";
import type { Job } from "@/services/job";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id:          "1",
    propertyId:  "prop-1",
    serviceType: "HVAC",
    amount:      120_000,   // cents
    date:        "2024-06-15",
    description: "HVAC replacement",
    isDiy:       false,
    status:      "verified",
    photos:      [],
    createdAt:   Date.now(),
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

// ─── jobToInput adapter ───────────────────────────────────────────────────────

describe("jobToInput (report adapter)", () => {
  it("extracts completedYear from the date string", () => {
    const input = jobToInput(makeJob({ date: "2023-08-20" }));
    expect(input.completedYear).toBe(2023);
  });

  it("maps verified status correctly", () => {
    expect(jobToInput(makeJob({ status: "verified"  })).isVerified).toBe(true);
    expect(jobToInput(makeJob({ status: "completed" })).isVerified).toBe(false);
    expect(jobToInput(makeJob({ status: "pending"   })).isVerified).toBe(false);
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
