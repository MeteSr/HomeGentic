import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  computeScore,
  computeScoreWithDecay,
  getScoreGrade,
  isCertified,
  generateCertToken,
  parseCertToken,
  premiumEstimate,
  recordSnapshot,
  loadHistory,
  scoreDelta,
  type ScoreSnapshot,
} from "@/services/scoreService";
import { SCORE_DECAY_FLOOR } from "@/services/scoreDecayService";
import type { Job } from "@/services/job";
import type { Property } from "@/services/property";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id:               "job-1",
    propertyId:       "prop-1",
    homeowner:        "principal-abc",
    serviceType:      "HVAC",
    description:      "HVAC replacement",
    contractorName:   "Cool Air LLC",
    amount:           240_000,   // $2,400 in cents
    date:             "2024-06-15",
    status:           "verified",
    verified:         true,
    isDiy:            false,
    permitNumber:     undefined,
    warrantyMonths:   0,
    homeownerSigned:  true,
    contractorSigned: true,
    photos:           [],
    createdAt:        Date.now(),
    ...overrides,
  };
}

function makeProperty(overrides: Partial<Property> = {}): Property {
  return {
    id:                BigInt(1),
    owner:             "principal-abc",
    address:           "123 Elm St",
    city:              "Austin",
    state:             "TX",
    zipCode:           "78701",
    propertyType:      "SingleFamily",
    yearBuilt:         BigInt(2000),
    squareFeet:        BigInt(2200),
    verificationLevel: "Basic",
    tier:              "Free",
    createdAt:         BigInt(0),
    updatedAt:         BigInt(0),
    isActive:          true,
    ...overrides,
  };
}

// ─── computeScore ─────────────────────────────────────────────────────────────

describe("computeScore", () => {
  it("returns 0 for empty inputs", () => {
    expect(computeScore([], [])).toBe(0);
  });

  it("adds 4 pts per verified job, capped at 40", () => {
    const jobs = Array.from({ length: 10 }, (_, i) =>
      makeJob({ id: `j${i}`, serviceType: `ServiceType${i}` })
    );
    // 10 verified jobs = 40 pts (capped); 10 unique types = 40 pts (capped) → total capped at 100
    // but value = 10 × $2400 = $24000 → floor(24000/2500) = 9 pts, capped at 20
    // no properties → 0 pts
    // diversity: 10 types × 4 = 40 pts (capped at 20) → 40 + 9 + 0 + 20 = 69
    expect(computeScore(jobs, [])).toBe(69);
  });

  it("caps verified-job points at 40", () => {
    const jobs = Array.from({ length: 15 }, (_, i) =>
      makeJob({ id: `j${i}`, serviceType: "HVAC" })  // same type, no diversity pts beyond 4
    );
    // verified pts: min(15*4, 40) = 40
    // value: 15 * $2400 = $36000 → floor(36000/2500) = 14 pts (capped at 20)
    // verification: 0 (no properties)
    // diversity: 1 type × 4 = 4 pts
    expect(computeScore(jobs, [])).toBe(40 + 14 + 0 + 4);
  });

  it("does not count unverified jobs toward verified-job points", () => {
    const verified   = makeJob({ id: "v1", verified: true,  status: "verified" });
    const unverified = makeJob({ id: "u1", verified: false, status: "pending" });
    const score = computeScore([verified, unverified], []);
    // verified pts: 1 × 4 = 4
    // value: 2 × $2400 = $4800 → floor(4800/2500) = 1 pt
    // diversity: 1 type × 4 = 4 pts
    expect(score).toBe(4 + 1 + 4);
  });

  it("adds value pts: 1 per $2500, capped at 20", () => {
    // $50,000 total → 20 pts; verified 0, diversity 0
    const job = makeJob({ verified: false, status: "pending", amount: 5_000_000, serviceType: "HVAC" });
    expect(computeScore([job], [])).toBe(0 + 20 + 0 + 4);
  });

  it("adds 10 pts for Premium property, 5 for Basic, capped at 20", () => {
    const premium = makeProperty({ verificationLevel: "Premium" });
    const basic   = makeProperty({ id: BigInt(2), verificationLevel: "Basic" });
    expect(computeScore([], [premium])).toBe(10);
    expect(computeScore([], [basic])).toBe(5);
    expect(computeScore([], [premium, basic])).toBe(15);
    // two Premium → 20, capped
    const premium2 = makeProperty({ id: BigInt(3), verificationLevel: "Premium" });
    expect(computeScore([], [premium, premium2])).toBe(20);
  });

  it("adds 4 pts per unique service type, capped at 20", () => {
    const types = ["HVAC", "Roofing", "Plumbing", "Electrical", "Painting", "Flooring"];
    const jobs = types.map((t, i) => makeJob({ id: `j${i}`, serviceType: t, verified: false, status: "pending" }));
    // diversity: min(6*4, 20) = 20
    const totalValue = jobs.reduce((s, j) => s + j.amount, 0) / 100;
    const valuePts = Math.min(Math.floor(totalValue / 2500), 20);
    expect(computeScore(jobs, [])).toBe(valuePts + 20);
  });

  it("caps total score at 100", () => {
    // 10 verified + 10 unique types + $100K+ value + 2 Premium properties → would exceed 100
    const jobs = Array.from({ length: 10 }, (_, i) =>
      makeJob({ id: `j${i}`, serviceType: `Type${i}`, amount: 1_000_000 })
    );
    const props = [
      makeProperty({ id: BigInt(1), verificationLevel: "Premium" }),
      makeProperty({ id: BigInt(2), verificationLevel: "Premium" }),
    ];
    expect(computeScore(jobs, props)).toBe(100);
  });
});

// ─── computeScoreWithDecay (8.7.1–8.7.4, 8.7.8) ─────────────────────────────

describe("computeScoreWithDecay", () => {
  it("returns raw score when decayPts is 0", () => {
    const job = makeJob();
    const raw = computeScore([job], []);
    expect(computeScoreWithDecay([job], [], 0)).toBe(raw);
  });

  it("subtracts decayPts from the raw score", () => {
    const job = makeJob();
    const raw = computeScore([job], []);
    expect(computeScoreWithDecay([job], [], 5)).toBe(raw - 5);
  });

  it(`clamps to SCORE_DECAY_FLOOR (${SCORE_DECAY_FLOOR}) when decay exceeds raw score`, () => {
    // 0 jobs → raw score 0, apply 3 decay pts → floor
    expect(computeScoreWithDecay([], [], 3)).toBe(SCORE_DECAY_FLOOR);
  });

  it("never returns below the floor even with large decay", () => {
    const jobs = [makeJob()]; // small raw score
    expect(computeScoreWithDecay(jobs, [], 999)).toBe(SCORE_DECAY_FLOOR);
  });
});

// ─── getScoreGrade ─────────────────────────────────────────────────────────────

describe("getScoreGrade", () => {
  it("returns A+ for 90–100", () => {
    expect(getScoreGrade(100)).toBe("A+");
    expect(getScoreGrade(90)).toBe("A+");
  });
  it("returns A for 80–89", () => {
    expect(getScoreGrade(89)).toBe("A");
    expect(getScoreGrade(80)).toBe("A");
  });
  it("returns B for 70–79", () => {
    expect(getScoreGrade(79)).toBe("B");
    expect(getScoreGrade(70)).toBe("B");
  });
  it("returns C for 60–69", () => {
    expect(getScoreGrade(69)).toBe("C");
    expect(getScoreGrade(60)).toBe("C");
  });
  it("returns D for 50–59", () => {
    expect(getScoreGrade(59)).toBe("D");
    expect(getScoreGrade(50)).toBe("D");
  });
  it("returns F below 50", () => {
    expect(getScoreGrade(49)).toBe("F");
    expect(getScoreGrade(0)).toBe("F");
  });
});

// ─── isCertified ──────────────────────────────────────────────────────────────

describe("isCertified", () => {
  it("requires score ≥ 88", () => {
    const jobs = Array.from({ length: 5 }, (_, i) =>
      makeJob({ id: `j${i}`, serviceType: ["HVAC", "Roofing", "Plumbing", "Electrical", "Painting"][i] })
    );
    expect(isCertified(87, jobs)).toBe(false);
    expect(isCertified(88, jobs)).toBe(true);
  });

  it("requires at least 3 verified jobs", () => {
    const jobs = [
      makeJob({ id: "j1", serviceType: "HVAC" }),
      makeJob({ id: "j2", serviceType: "Roofing" }),
    ];
    expect(isCertified(95, jobs)).toBe(false);
  });

  it("requires at least 2 of 4 key systems verified", () => {
    // 3 verified jobs but only 1 key system
    const jobs = [
      makeJob({ id: "j1", serviceType: "HVAC" }),
      makeJob({ id: "j2", serviceType: "Painting" }),
      makeJob({ id: "j3", serviceType: "Landscaping" }),
    ];
    expect(isCertified(95, jobs)).toBe(false);
  });

  it("passes when all criteria met", () => {
    const jobs = [
      makeJob({ id: "j1", serviceType: "HVAC",     verified: true, status: "verified" }),
      makeJob({ id: "j2", serviceType: "Roofing",  verified: true, status: "verified" }),
      makeJob({ id: "j3", serviceType: "Painting", verified: true, status: "verified" }),
    ];
    expect(isCertified(88, jobs)).toBe(true);
  });

  it("counts jobs with status='verified' even if verified flag is false", () => {
    const jobs = [
      makeJob({ id: "j1", serviceType: "HVAC",     verified: false, status: "verified" }),
      makeJob({ id: "j2", serviceType: "Roofing",  verified: false, status: "verified" }),
      makeJob({ id: "j3", serviceType: "Plumbing", verified: false, status: "verified" }),
    ];
    expect(isCertified(90, jobs)).toBe(true);
  });
});

// ─── generateCertToken / parseCertToken ───────────────────────────────────────

describe("generateCertToken / parseCertToken round-trip", () => {
  const payload = {
    address:     "123 Elm St",
    score:       88,
    grade:       "A",
    certified:   true,
    generatedAt: 1700000000000,
  };

  it("round-trips the payload", () => {
    const token   = generateCertToken(payload);
    const decoded = parseCertToken(token);
    expect(decoded).toEqual(payload);
  });

  it("produces a URL-safe token (no '=' padding)", () => {
    const token = generateCertToken(payload);
    expect(token).not.toContain("=");
  });

  it("returns null for an invalid token", () => {
    expect(parseCertToken("not-valid-base64!!!")).toBeNull();
  });
});

// ─── premiumEstimate ──────────────────────────────────────────────────────────

describe("premiumEstimate", () => {
  it("returns null below score 40", () => {
    expect(premiumEstimate(0)).toBeNull();
    expect(premiumEstimate(39)).toBeNull();
  });

  it("returns $3K–$8K for score 40–54", () => {
    const r = premiumEstimate(40)!;
    expect(r.low).toBe(3_000);
    expect(r.high).toBe(8_000);
    expect(premiumEstimate(54)).toEqual(r);
  });

  it("returns $8K–$15K for score 55–69", () => {
    const r = premiumEstimate(55)!;
    expect(r.low).toBe(8_000);
    expect(r.high).toBe(15_000);
    expect(premiumEstimate(69)).toEqual(r);
  });

  it("returns $15K–$25K for score 70–84", () => {
    const r = premiumEstimate(70)!;
    expect(r.low).toBe(15_000);
    expect(r.high).toBe(25_000);
    expect(premiumEstimate(84)).toEqual(r);
  });

  it("returns $20K–$35K for score 85+", () => {
    const r = premiumEstimate(85)!;
    expect(r.low).toBe(20_000);
    expect(r.high).toBe(35_000);
    expect(premiumEstimate(100)).toEqual(r);
  });
});

// ─── recordSnapshot / loadHistory / scoreDelta ────────────────────────────────

describe("recordSnapshot / loadHistory / scoreDelta", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("persists a snapshot and loads it back", () => {
    recordSnapshot(75);
    const history = loadHistory();
    expect(history).toHaveLength(1);
    expect(history[0].score).toBe(75);
  });

  it("appends a new snapshot after 6+ days", () => {
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    localStorage.setItem(
      "homegentic_score_history",
      JSON.stringify([{ score: 60, timestamp: sevenDaysAgo }])
    );
    recordSnapshot(70);
    expect(loadHistory()).toHaveLength(2);
  });

  it("updates the last snapshot in-place within 6 days", () => {
    const now = Date.now();
    const twoDaysAgo = now - 2 * 24 * 60 * 60 * 1000;
    localStorage.setItem(
      "homegentic_score_history",
      JSON.stringify([{ score: 60, timestamp: twoDaysAgo }])
    );
    recordSnapshot(65);
    const history = loadHistory();
    expect(history).toHaveLength(1);
    expect(history[0].score).toBe(65);
  });

  it("caps history at 12 snapshots", () => {
    const history: ScoreSnapshot[] = Array.from({ length: 12 }, (_, i) => ({
      score:     50 + i,
      timestamp: Date.now() - (13 - i) * 7 * 24 * 60 * 60 * 1000,
    }));
    localStorage.setItem("homegentic_score_history", JSON.stringify(history));
    recordSnapshot(99);
    expect(loadHistory()).toHaveLength(12);
    expect(loadHistory()[11].score).toBe(99);
  });

  it("scoreDelta returns 0 with fewer than 2 snapshots", () => {
    expect(scoreDelta([])).toBe(0);
    expect(scoreDelta([{ score: 50, timestamp: 1 }])).toBe(0);
  });

  it("scoreDelta returns the difference between last two snapshots", () => {
    const snaps: ScoreSnapshot[] = [
      { score: 60, timestamp: 1 },
      { score: 74, timestamp: 2 },
    ];
    expect(scoreDelta(snaps)).toBe(14);
  });

  it("returns negative delta for score drops", () => {
    const snaps: ScoreSnapshot[] = [
      { score: 80, timestamp: 1 },
      { score: 72, timestamp: 2 },
    ];
    expect(scoreDelta(snaps)).toBe(-8);
  });
});
