import { describe, it, expect } from "vitest";
import { marketService } from "@/services/market";
import type { PropertyJobSummary, JobSummary, PropertyProfile } from "@/services/market";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const YEAR = new Date().getFullYear();

function job(overrides: Partial<JobSummary> = {}): JobSummary {
  return {
    serviceType:   "HVAC",
    completedYear: YEAR - 2,
    amountCents:   120_000,
    isDiy:         false,
    isVerified:    false,
    ...overrides,
  };
}

function subject(jobs: JobSummary[] = [], yearBuilt = 2000): PropertyJobSummary {
  return {
    propertyId:   "1",
    yearBuilt,
    squareFeet:   2000,
    propertyType: "SingleFamily",
    state:        "OH",
    zipCode:      "43201",
    jobs,
  };
}

function profile(overrides: Partial<PropertyProfile> = {}): PropertyProfile {
  return {
    yearBuilt:    1990,
    squareFeet:   2000,
    propertyType: "SingleFamily",
    state:        "OH",
    zipCode:      "43201",
    ...overrides,
  };
}

// ─── analyzeCompetitivePosition ───────────────────────────────────────────────

describe("analyzeCompetitivePosition", () => {
  it("returns scores in 0-100 range for a property with no jobs", () => {
    const result = marketService.analyzeCompetitivePosition(subject(), []);

    expect(result.maintenanceScore.score).toBe(0);
    expect(result.verificationDepth.score).toBe(0);
    expect(result.systemModernization.score).toBeGreaterThanOrEqual(0);
    expect(result.systemModernization.score).toBeLessThanOrEqual(100);
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.overallScore).toBeLessThanOrEqual(100);
  });

  it("gives full maintenance score (100) when all 6 system categories are verified", () => {
    const jobs = [
      job({ serviceType: "HVAC",       isVerified: true }),
      job({ serviceType: "Roofing",    isVerified: true }),
      job({ serviceType: "Plumbing",   isVerified: true }),
      job({ serviceType: "Electrical", isVerified: true }),
      job({ serviceType: "Windows",    isVerified: true }),
      job({ serviceType: "Painting",   isVerified: true }),  // counts as "other"
    ];
    const result = marketService.analyzeCompetitivePosition(subject(jobs), []);
    expect(result.maintenanceScore.score).toBe(100);
  });

  it("gives HVAC verified job 25 maintenance points (weight × full factor)", () => {
    const result = marketService.analyzeCompetitivePosition(
      subject([job({ serviceType: "HVAC", isVerified: true })]),
      []
    );
    // HVAC weight = 25, verified factor = 10/10 → 25 points
    expect(result.maintenanceScore.score).toBe(25);
  });

  it("DIY job scores 80% of verified equivalent (factor 8 vs 10)", () => {
    const verified = marketService.analyzeCompetitivePosition(
      subject([job({ serviceType: "HVAC", isVerified: true,  isDiy: false })]),
      []
    );
    const diy = marketService.analyzeCompetitivePosition(
      subject([job({ serviceType: "HVAC", isVerified: false, isDiy: true  })]),
      []
    );
    // verified: 25 * 10/10 = 25,  diy: 25 * 8/10 = 20
    expect(verified.maintenanceScore.score).toBe(25);
    expect(diy.maintenanceScore.score).toBe(20);
  });

  it("verification depth is 50 when half the jobs are verified", () => {
    const jobs = [
      job({ isVerified: true  }),
      job({ isVerified: false }),
    ];
    const result = marketService.analyzeCompetitivePosition(subject(jobs), []);
    expect(result.verificationDepth.score).toBe(50);
  });

  it("verification depth is 0 when there are no jobs", () => {
    const result = marketService.analyzeCompetitivePosition(subject([]), []);
    expect(result.verificationDepth.score).toBe(0);
  });

  it("ranks subject #1 when its score is the highest", () => {
    const rich = subject([
      job({ serviceType: "HVAC",       isVerified: true }),
      job({ serviceType: "Roofing",    isVerified: true }),
      job({ serviceType: "Electrical", isVerified: true }),
    ]);
    const poor = subject([], 1960);   // old house, no jobs → low modernization

    const result = marketService.analyzeCompetitivePosition(rich, [poor]);
    expect(result.rankOutOf).toBe(1);
    expect(result.totalCompared).toBe(2);
  });

  it("ranks subject #2 when one comparison beats it", () => {
    const withJobs    = subject([job({ isVerified: true })]);
    const betterProp  = { ...subject([
      job({ serviceType: "HVAC",       isVerified: true }),
      job({ serviceType: "Roofing",    isVerified: true }),
      job({ serviceType: "Plumbing",   isVerified: true }),
      job({ serviceType: "Electrical", isVerified: true }),
    ]), propertyId: "2" };

    const result = marketService.analyzeCompetitivePosition(withJobs, [betterProp]);
    expect(result.rankOutOf).toBe(2);
  });

  it("populates strengths when maintenance score ≥ 70", () => {
    const jobs = [
      job({ serviceType: "HVAC",       isVerified: true }),
      job({ serviceType: "Roofing",    isVerified: true }),
      job({ serviceType: "Plumbing",   isVerified: true }),
    ]; // 25+25+15 = 65... need more. Add Electrical+Windows+other
    const allJobs = [
      ...jobs,
      job({ serviceType: "Electrical", isVerified: true }),
      job({ serviceType: "Windows",    isVerified: true }),
      job({ serviceType: "Painting",   isVerified: true }),
    ];
    const result = marketService.analyzeCompetitivePosition(subject(allJobs), []);
    expect(result.maintenanceScore.score).toBe(100);
    expect(result.strengths).toContain("Strong documented maintenance history");
  });

  it("populates improvements when maintenance score < 50", () => {
    const result = marketService.analyzeCompetitivePosition(subject([]), []);
    expect(result.improvements.some((s) => s.includes("maintenance records"))).toBe(true);
  });

  it("assigns correct grade labels", () => {
    // No jobs → low scores → should be F or D on some dimensions
    const result = marketService.analyzeCompetitivePosition(subject([]), []);
    expect(result.maintenanceScore.grade).toBe("F");
    expect(result.verificationDepth.grade).toBe("F");
  });

  it("overall grade is A when all dimensions score 100", () => {
    // A perfectly maintained, recently-built property with all systems verified
    const jobs = [
      job({ serviceType: "HVAC",       isVerified: true, completedYear: YEAR - 1 }),
      job({ serviceType: "Roofing",    isVerified: true, completedYear: YEAR - 1 }),
      job({ serviceType: "Plumbing",   isVerified: true, completedYear: YEAR - 1 }),
      job({ serviceType: "Electrical", isVerified: true, completedYear: YEAR - 1 }),
      job({ serviceType: "Windows",    isVerified: true, completedYear: YEAR - 1 }),
      job({ serviceType: "Painting",   isVerified: true, completedYear: YEAR - 1 }),
    ];
    const result = marketService.analyzeCompetitivePosition(
      subject(jobs, YEAR - 1),
      []
    );
    expect(result.maintenanceScore.score).toBe(100);
    expect(result.verificationDepth.score).toBe(100);
    expect(result.overallGrade).toBe("A");
  });
});

// ─── recommendValueAddingProjects ─────────────────────────────────────────────

describe("recommendValueAddingProjects", () => {
  it("returns results sorted by ROI descending", () => {
    const recs = marketService.recommendValueAddingProjects(
      profile({ yearBuilt: 1990 }), // old enough for all projects
      [],
      0 // no budget cap
    );
    expect(recs.length).toBeGreaterThan(0);
    for (let i = 0; i < recs.length - 1; i++) {
      expect(recs[i].estimatedRoiPercent).toBeGreaterThanOrEqual(recs[i + 1].estimatedRoiPercent);
    }
  });

  it("excludes projects over budget", () => {
    // Budget: $5,000 = 500_000 cents — only Energy Efficiency ($4K) and Flooring ($5K) fit
    const recs = marketService.recommendValueAddingProjects(
      profile({ yearBuilt: 1990, state: "OH" }),
      [],
      500_000
    );
    recs.forEach((r) => {
      expect(r.estimatedCostCents).toBeLessThanOrEqual(500_000);
    });
  });

  it("excludes a project already completed within its lifespan", () => {
    const recentHvac: JobSummary = {
      serviceType:   "HVAC",
      completedYear: YEAR - 2,
      amountCents:   120_000,
      isDiy:         false,
      isVerified:    true,
    };
    const recs = marketService.recommendValueAddingProjects(
      profile({ yearBuilt: 1990 }),
      [recentHvac],
      0
    );
    expect(recs.find((r) => r.category === "HVAC")).toBeUndefined();
  });

  it("includes HVAC after it ages past its 18-year lifespan", () => {
    const oldHvac: JobSummary = {
      serviceType:   "HVAC",
      completedYear: YEAR - 20,   // 20 years ago — past 18-year lifespan
      amountCents:   80_000,
      isDiy:         false,
      isVerified:    false,
    };
    const recs = marketService.recommendValueAddingProjects(
      profile({ yearBuilt: 1990 }),
      [oldHvac],
      0
    );
    expect(recs.find((r) => r.category === "HVAC")).toBeDefined();
  });

  it("does not recommend roof replacement for a 5-year-old house (minPropertyAge=20)", () => {
    const recs = marketService.recommendValueAddingProjects(
      profile({ yearBuilt: YEAR - 5 }),
      [],
      0
    );
    expect(recs.find((r) => r.category === "Roofing")).toBeUndefined();
  });

  it("applies CA state multiplier (115%) to cost and ROI", () => {
    const ohRecs = marketService.recommendValueAddingProjects(
      profile({ state: "OH", yearBuilt: 1990 }), [], 0
    );
    const caRecs = marketService.recommendValueAddingProjects(
      profile({ state: "CA", yearBuilt: 1990 }), [], 0
    );

    const ohEnergy = ohRecs.find((r) => r.category === "Insulation")!;
    const caEnergy = caRecs.find((r) => r.category === "Insulation")!;

    expect(caEnergy.estimatedCostCents).toBeGreaterThan(ohEnergy.estimatedCostCents);
    expect(caEnergy.estimatedRoiPercent).toBeGreaterThan(ohEnergy.estimatedRoiPercent);
  });

  it("estimatedGainCents equals cost × roi / 100", () => {
    const recs = marketService.recommendValueAddingProjects(
      profile({ yearBuilt: 1990 }), [], 0
    );
    recs.forEach((r) => {
      const expected = Math.round(r.estimatedCostCents * r.estimatedRoiPercent / 100);
      expect(r.estimatedGainCents).toBe(expected);
    });
  });

  it("marks high-ROI AND old-property projects as High priority", () => {
    // Energy Efficiency: roiPercent=102 (≥85), minPropertyAge=10, old house → High
    const recs = marketService.recommendValueAddingProjects(
      profile({ yearBuilt: 1990 }), // propAge = ~35 years
      [],
      0
    );
    const energy = recs.find((r) => r.category === "Insulation");
    expect(energy?.priority).toBe("High");
  });
});

// ─── formatCost ───────────────────────────────────────────────────────────────

describe("formatCost", () => {
  it("formats cents as dollar string", () => {
    expect(marketService.formatCost(2_700_000)).toBe("$27,000");
    expect(marketService.formatCost(400_000)).toBe("$4,000");
    expect(marketService.formatCost(100)).toBe("$1");
  });
});
