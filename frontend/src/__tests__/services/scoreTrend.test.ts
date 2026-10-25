/**
 * scoreTrend — real logic worth locking down:
 *   - computeMilestoneCoaching returns null when no milestone is within the
 *     5-pt coaching window, otherwise the best scoreSuggestions() action:
 *     a free contractor sign-off first, then the biggest real point gain
 *   - buildScoreTrend derives trend direction from the real scoreDelta() and
 *     slices history to the last 4 snapshots
 */

import { describe, it, expect } from "vitest";
import { computeMilestoneCoaching, buildScoreTrend } from "@/services/scoreTrend";
import type { Job } from "@/services/job";
import type { ScoreSnapshot } from "@/services/scoreService";
import type { Property } from "@/services/property";

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "job-1", propertyId: "prop-1", homeowner: "p-owner", serviceType: "HVAC",
    amount: 50000, date: "2024-01-01", description: "Service", isDiy: false,
    contractorName: "Cool Air Co.", status: "verified" as any, verified: true,
    homeownerSigned: true, contractorSigned: true, photos: [], createdAt: Date.now(),
    ...overrides,
  };
}

const PROPERTY = { id: "prop-1", yearBuilt: 1995n } as unknown as Property;

describe("computeMilestoneCoaching", () => {
  it("returns null when the score is not within 5 pts of any milestone", () => {
    expect(computeMilestoneCoaching(20, [], PROPERTY)).toBeNull();
  });

  it("prioritizes a free pending contractor sign-off over other actions", () => {
    const jobs = [makeJob({ isDiy: false, verified: false, status: "pending" as any, homeownerSigned: false, serviceType: "Plumbing" })];
    const coaching = computeMilestoneCoaching(66, jobs, PROPERTY);
    expect(coaching).not.toBeNull();
    expect(coaching!.isFree).toBe(true);
    expect(coaching!.action).toContain("Plumbing");
    expect(coaching!.milestoneLabel).toBe("Grade B");
  });

  it("otherwise suggests the key system with nothing on record", () => {
    const coaching = computeMilestoneCoaching(66, [makeJob()], PROPERTY);
    expect(coaching!.isFree).toBe(false);
    expect(coaching!.action).toContain("Roofing");
  });
});

describe("buildScoreTrend", () => {
  it("derives trend 'up' from increasing history and slices to the last 4 snapshots", () => {
    const history: ScoreSnapshot[] = [10, 20, 30, 40, 50, 60].map((score, i) => ({ score, timestamp: i } as ScoreSnapshot));
    const trend = buildScoreTrend(60, [], PROPERTY, history);

    expect(trend.trend).toBe("up");
    expect(trend.delta).toBeGreaterThan(0);
    expect(trend.history).toHaveLength(4);
    expect(trend.history[0].score).toBe(30);
    expect(trend.previousScore).toBe(50);
  });

  it("returns previousScore null when history has fewer than 2 entries", () => {
    const trend = buildScoreTrend(50, [], PROPERTY, [{ score: 50, timestamp: 0 } as ScoreSnapshot]);
    expect(trend.previousScore).toBeNull();
  });
});
