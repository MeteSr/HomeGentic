import { describe, it, expect, beforeEach } from "vitest";
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
  computeBreakdown,
  scoreSuggestions,
  scoreChange,
  toScoreJob,
  type ScoreSnapshot,
} from "@/services/scoreService";
import { scoreBreakdown } from "@homegentic/shared/score";
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
    id:                "prop-1",
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
  const year = new Date().getFullYear();
  const prop = makeProperty({ yearBuilt: BigInt(year - 30) });   // every system past its rated life except plumbing/electrical

  it("returns 0 with no jobs", () => {
    expect(computeScore([], [])).toBe(0);
    expect(computeScore([], [prop])).toBe(0);
  });

  it("matches the shared formula exactly", () => {
    const jobs = [
      makeJob({ id: "a", serviceType: "HVAC", amount: 900_000, date: `${year - 1}-03-01` }),
      makeJob({ id: "b", serviceType: "Plumbing", isDiy: true, verified: false, status: "pending", amount: 20_000 }),
    ];
    const expected = scoreBreakdown(jobs.map(toScoreJob), year - 30, year).total;
    expect(computeScore(jobs, [prop])).toBe(expected);
  });

  it("counts each key system once: many filter changes don't beat one verified roof", () => {
    const filters = Array.from({ length: 100 }, (_, i) => makeJob({ id: `f${i}`, serviceType: "HVAC", amount: 9_000 }));
    const roof = [makeJob({ id: "r", serviceType: "Roofing", amount: 1_400_000, date: `${year - 1}-05-01` })];
    expect(computeScore(roof, [prop])).toBeGreaterThan(computeScore(filters, [prop]));
  });

  it("a cheap job covers a system but doesn't count as replacing it", () => {
    const filter = [makeJob({ serviceType: "HVAC", amount: 9_000, date: `${year}-01-01` })];
    const newUnit = [makeJob({ serviceType: "HVAC", amount: 900_000, date: `${year}-01-01` })];
    const b1 = computeBreakdown(filter, [prop]);
    const b2 = computeBreakdown(newUnit, [prop]);
    expect(b1.maintenance).toBe(b2.maintenance);
    expect(b2.modernization).toBeGreaterThan(b1.modernization);
  });

  it("verified jobs count fully; unsigned and unverified-contractor jobs count less", () => {
    const verified   = computeBreakdown([makeJob()], [prop]);
    const unsigned   = computeBreakdown([makeJob({ verified: false, status: "pending" })], [prop]);
    const badContractor = computeBreakdown([makeJob({ contractorUnverified: true })], [prop]);
    expect(verified.maintenance).toBe(25);
    expect(unsigned.maintenance).toBe(12);
    expect(badContractor.verification).toBe(0);
  });

  it("weighted points add up to the total", () => {
    const b = computeBreakdown([makeJob(), makeJob({ id: "j2", serviceType: "Roofing", verified: false, status: "pending" })], [prop]);
    expect(b.maintenancePts + b.modernizationPts + b.verificationPts).toBeLessThanOrEqual(b.total + 2);
    expect(b.maintenancePts + b.modernizationPts + b.verificationPts).toBeGreaterThanOrEqual(b.total - 2);
  });

  it("averages several properties, each on its own jobs", () => {
    const p2 = makeProperty({ id: "prop-2", yearBuilt: BigInt(year - 30) });
    const jobs = [makeJob({ propertyId: "prop-1" }), makeJob({ id: "x", propertyId: "prop-2", verified: false, status: "pending" })];
    const a = computeScore([jobs[0]], [prop]);
    const b = computeScore([jobs[1]], [p2]);
    expect(computeScore(jobs, [prop, p2])).toBe(Math.floor((a + b) / 2));
  });
});

describe("scoreSuggestions", () => {
  const year = new Date().getFullYear();
  const prop = makeProperty({ yearBuilt: BigInt(year - 30) });

  it("puts a free contractor sign-off first, with the points it really adds", () => {
    const pending = makeJob({ verified: false, status: "pending", serviceType: "Roofing" });
    const [first] = scoreSuggestions([pending], prop);
    expect(first.isFree).toBe(true);
    expect(first.pts).toBe(scoreChange([pending], [{ ...pending, verified: true, status: "verified" }], [prop]));
  });

  it("never suggests something worth zero points", () => {
    for (const s of scoreSuggestions([makeJob()], prop)) expect(s.pts).toBeGreaterThan(0);
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
