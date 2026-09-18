/**
 * scoreTrend — real logic worth locking down:
 *   - computeMilestoneCoaching returns null when no milestone is within the
 *     5-pt coaching window, otherwise the cheapest-first action: pending
 *     contractor sign-off > diversity gap > value gap > verification gap
 *   - buildScoreTrend derives trend direction from the real scoreDelta() and
 *     slices history to the last 4 snapshots
 */

import { describe, it, expect } from "vitest";
import { computeMilestoneCoaching, buildScoreTrend } from "@/services/scoreTrend";
import type { Job } from "@/services/job";
import type { ScoreBreakdown, ScoreSnapshot } from "@/services/scoreService";

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "job-1", propertyId: "prop-1", homeowner: "p-owner", serviceType: "HVAC",
    amount: 50000, date: "2024-01-01", description: "Service", isDiy: false,
    contractorName: "Cool Air Co.", status: "verified" as any, verified: true,
    homeownerSigned: true, contractorSigned: true, photos: [], createdAt: Date.now(),
    ...overrides,
  };
}

function makeBreakdown(overrides: Partial<ScoreBreakdown> = {}): ScoreBreakdown {
  return { diversityPts: 20, valuePts: 20, verificationPts: 20, totalPts: 60, ...overrides } as ScoreBreakdown;
}

describe("computeMilestoneCoaching", () => {
  it("returns null when the score is not within 5 pts of any milestone", () => {
    expect(computeMilestoneCoaching(20, makeBreakdown(), [])).toBeNull();
  });

  it("prioritizes a free pending contractor sign-off over other actions", () => {
    const jobs = [makeJob({ isDiy: false, verified: false, status: "pending" as any, homeownerSigned: false, serviceType: "Plumbing" })];
    const coaching = computeMilestoneCoaching(66, makeBreakdown(), jobs);
    expect(coaching).not.toBeNull();
    expect(coaching!.isFree).toBe(true);
    expect(coaching!.action).toContain("Plumbing");
    expect(coaching!.milestoneLabel).toBe("Grade B");
  });

  it("suggests a diversity gap job when no pending sign-off exists and diversityPts < 20", () => {
    const coaching = computeMilestoneCoaching(66, makeBreakdown({ diversityPts: 10 }), []);
    expect(coaching!.isFree).toBe(false);
    expect(coaching!.action).toContain("diversity pts");
  });

  it("suggests documenting costs when diversity is full but valuePts < 20", () => {
    const coaching = computeMilestoneCoaching(66, makeBreakdown({ diversityPts: 20, valuePts: 5 }), []);
    expect(coaching!.action).toContain("documented job costs");
  });

  it("falls back to property verification when diversity and value are both full", () => {
    const coaching = computeMilestoneCoaching(66, makeBreakdown({ diversityPts: 20, valuePts: 20 }), []);
    expect(coaching!.action).toContain("property verification");
  });
});

describe("buildScoreTrend", () => {
  it("derives trend 'up' from increasing history and slices to the last 4 snapshots", () => {
    const history: ScoreSnapshot[] = [10, 20, 30, 40, 50, 60].map((score, i) => ({ score, timestamp: i } as ScoreSnapshot));
    const trend = buildScoreTrend(60, makeBreakdown(), [], history);

    expect(trend.trend).toBe("up");
    expect(trend.delta).toBeGreaterThan(0);
    expect(trend.history).toHaveLength(4);
    expect(trend.history[0].score).toBe(30);
    expect(trend.previousScore).toBe(50);
  });

  it("returns previousScore null when history has fewer than 2 entries", () => {
    const trend = buildScoreTrend(50, makeBreakdown(), [], [{ score: 50, timestamp: 0 } as ScoreSnapshot]);
    expect(trend.previousScore).toBeNull();
  });
});
