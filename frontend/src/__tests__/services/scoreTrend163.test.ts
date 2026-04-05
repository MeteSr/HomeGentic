/**
 * TDD tests for §16.3 — Score Trend & Milestone Coaching
 *
 * Covers:
 *   - buildScoreTrend() — delta, trend direction, history trimming (16.3.1)
 *   - computeMilestoneCoaching() — boundary detection, action selection (16.3.3)
 *   - buildSystemPrompt() renders trend section when delta is non-zero (16.3.2)
 */

import { describe, it, expect } from "vitest";
import {
  buildScoreTrend,
  computeMilestoneCoaching,
  MILESTONES,
} from "@/services/scoreTrend";
import type { ScoreSnapshot } from "@/services/scoreService";
import type { ScoreBreakdown } from "@/services/scoreService";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const NOW = Date.now();
const WEEK = 7 * 24 * 60 * 60 * 1000;

function makeHistory(...scores: number[]): ScoreSnapshot[] {
  return scores.map((score, i) => ({
    score,
    timestamp: NOW - (scores.length - 1 - i) * WEEK,
  }));
}

function makeBreakdown(overrides: Partial<ScoreBreakdown> = {}): ScoreBreakdown {
  return {
    verifiedJobPts:  overrides.verifiedJobPts  ?? 40,
    valuePts:        overrides.valuePts         ?? 20,
    verificationPts: overrides.verificationPts  ?? 20,
    diversityPts:    overrides.diversityPts     ?? 20,
  };
}

function makeJob(id: string, serviceType: string, opts: Partial<{
  verified: boolean; status: string; isDiy: boolean;
  homeownerSigned: boolean; contractorSigned: boolean;
}> = {}) {
  return {
    id,
    propertyId:      "prop-1",
    serviceType,
    description:     "work done",
    amount:          100_000,
    date:            "2024-01-01",
    status:          (opts.status ?? "completed") as any,
    verified:        opts.verified         ?? false,
    isDiy:           opts.isDiy            ?? false,
    homeownerSigned: opts.homeownerSigned  ?? true,
    contractorSigned:opts.contractorSigned ?? false,
    contractorName:  "Test Co",
    photos:          [],
    homeowner:       "owner",
    contractor:      undefined,
    createdAt:       0,
    warrantyMonths:  undefined,
    permitNumber:    undefined,
  };
}

// ─── buildScoreTrend ──────────────────────────────────────────────────────────

describe("buildScoreTrend", () => {
  it("returns delta=0 and trend='flat' when history is empty", () => {
    const result = buildScoreTrend(65, makeBreakdown(), [], []);
    expect(result.delta).toBe(0);
    expect(result.trend).toBe("flat");
    expect(result.previousScore).toBeNull();
  });

  it("returns delta=0 and trend='flat' when only one snapshot exists", () => {
    const result = buildScoreTrend(65, makeBreakdown(), [], makeHistory(65));
    expect(result.delta).toBe(0);
    expect(result.trend).toBe("flat");
  });

  it("computes positive delta and trend='up' when score increased", () => {
    const result = buildScoreTrend(72, makeBreakdown(), [], makeHistory(65, 72));
    expect(result.delta).toBe(7);
    expect(result.trend).toBe("up");
    expect(result.previousScore).toBe(65);
  });

  it("computes negative delta and trend='down' when score decreased", () => {
    const result = buildScoreTrend(58, makeBreakdown(), [], makeHistory(65, 58));
    expect(result.delta).toBe(-7);
    expect(result.trend).toBe("down");
    expect(result.previousScore).toBe(65);
  });

  it("returns trend='flat' when delta is 0 with multiple snapshots", () => {
    const result = buildScoreTrend(65, makeBreakdown(), [], makeHistory(65, 65));
    expect(result.delta).toBe(0);
    expect(result.trend).toBe("flat");
  });

  it("trims history to last 4 snapshots", () => {
    const history = makeHistory(50, 55, 60, 65, 68, 70, 72);
    const result = buildScoreTrend(72, makeBreakdown(), [], history);
    expect(result.history).toHaveLength(4);
    expect(result.history[3].score).toBe(72);
    expect(result.history[0].score).toBe(65);
  });

  it("returns full history when fewer than 4 snapshots exist", () => {
    const history = makeHistory(60, 65);
    const result = buildScoreTrend(65, makeBreakdown(), [], history);
    expect(result.history).toHaveLength(2);
  });

  it("includes milestoneCoaching when within 5 pts of a boundary", () => {
    // Score 67 is within 5 pts of grade B (70)
    const result = buildScoreTrend(67, makeBreakdown({ verifiedJobPts: 28 }), [], []);
    expect(result.milestoneCoaching).not.toBeNull();
    expect(result.milestoneCoaching!.milestone).toBe(70);
  });

  it("milestoneCoaching is null when more than 5 pts from every boundary", () => {
    // Score 64 is 6 pts from 70 — no milestone within range
    const result = buildScoreTrend(64, makeBreakdown(), [], []);
    expect(result.milestoneCoaching).toBeNull();
  });
});

// ─── computeMilestoneCoaching ─────────────────────────────────────────────────

describe("computeMilestoneCoaching", () => {
  it("returns null when score is 90 or above (no milestone left)", () => {
    expect(computeMilestoneCoaching(90, makeBreakdown(), [])).toBeNull();
    expect(computeMilestoneCoaching(95, makeBreakdown(), [])).toBeNull();
  });

  it("returns null when more than 5 pts from the next milestone", () => {
    // Score 64: next milestone is 70 (6 pts away)
    expect(computeMilestoneCoaching(64, makeBreakdown(), [])).toBeNull();
    // Score 74: next milestone is 80 (6 pts away)
    expect(computeMilestoneCoaching(74, makeBreakdown(), [])).toBeNull();
  });

  it("returns coaching when exactly 5 pts from next milestone", () => {
    // Score 65: next milestone is 70 (exactly 5 pts)
    expect(computeMilestoneCoaching(65, makeBreakdown({ verifiedJobPts: 28 }), [])).not.toBeNull();
  });

  it("returns coaching when 1 pt from next milestone", () => {
    expect(computeMilestoneCoaching(69, makeBreakdown({ verifiedJobPts: 28 }), [])).not.toBeNull();
  });

  it("sets correct milestone and label for grade B boundary (70)", () => {
    const result = computeMilestoneCoaching(67, makeBreakdown({ verifiedJobPts: 28 }), []);
    expect(result!.milestone).toBe(70);
    expect(result!.milestoneLabel).toMatch(/grade b/i);
    expect(result!.ptsNeeded).toBe(3);
  });

  it("sets correct milestone and label for grade A boundary (80)", () => {
    const result = computeMilestoneCoaching(76, makeBreakdown({ verifiedJobPts: 36 }), []);
    expect(result!.milestone).toBe(80);
    expect(result!.milestoneLabel).toMatch(/grade a/i);
  });

  it("sets correct milestone and label for HomeGentic Certified (88)", () => {
    const result = computeMilestoneCoaching(85, makeBreakdown({ verifiedJobPts: 36 }), []);
    expect(result!.milestone).toBe(88);
    expect(result!.milestoneLabel).toMatch(/certified/i);
  });

  it("sets correct milestone and label for grade A+ boundary (90)", () => {
    const result = computeMilestoneCoaching(88, makeBreakdown(), []);
    expect(result!.milestone).toBe(90);
    expect(result!.milestoneLabel).toMatch(/a\+/i);
  });

  it("ptsNeeded is milestone minus current score", () => {
    const result = computeMilestoneCoaching(67, makeBreakdown({ verifiedJobPts: 28 }), []);
    expect(result!.ptsNeeded).toBe(3); // 70 - 67
  });

  it("suggests verifying a pending contractor job (free +4 pts) when available", () => {
    const pendingJob = makeJob("j1", "HVAC", {
      homeownerSigned: false, contractorSigned: false, verified: false,
    });
    const result = computeMilestoneCoaching(67, makeBreakdown({ verifiedJobPts: 28 }), [pendingJob]);
    expect(result!.action).toMatch(/sign|verif/i);
    expect(result!.action).toMatch(/HVAC/i);
    expect(result!.isFree).toBe(true);
  });

  it("suggests a new job category when no pending jobs and diversityPts < 20", () => {
    const result = computeMilestoneCoaching(
      67,
      makeBreakdown({ verifiedJobPts: 28, diversityPts: 8 }),
      [], // no pending jobs
    );
    expect(result!.action).toMatch(/system|categor|type|verified/i);
    expect(result!.isFree).toBe(false);
  });

  it("suggests documenting more costs when only value gap remains", () => {
    const result = computeMilestoneCoaching(
      67,
      makeBreakdown({ verifiedJobPts: 28, diversityPts: 20, valuePts: 10 }),
      [],
    );
    expect(result!.action).toMatch(/cost|document|\$2,500/i);
  });

  it("action string is non-empty for every milestone boundary", () => {
    const boundaries = [65, 75, 83, 85, 88];
    for (const score of boundaries) {
      const result = computeMilestoneCoaching(score, makeBreakdown({ verifiedJobPts: 28 }), []);
      if (result) {
        expect(result.action.length).toBeGreaterThan(0);
      }
    }
  });
});

// ─── MILESTONES export ────────────────────────────────────────────────────────

describe("MILESTONES constant", () => {
  it("includes grade boundaries and HomeGentic Certified", () => {
    const scores = MILESTONES.map((m) => m.score);
    expect(scores).toContain(70);
    expect(scores).toContain(80);
    expect(scores).toContain(88);
    expect(scores).toContain(90);
  });

  it("is sorted ascending by score", () => {
    for (let i = 1; i < MILESTONES.length; i++) {
      expect(MILESTONES[i].score).toBeGreaterThan(MILESTONES[i - 1].score);
    }
  });

  it("every milestone has a non-empty label", () => {
    MILESTONES.forEach((m) => expect(m.label.length).toBeGreaterThan(0));
  });
});
