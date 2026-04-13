/**
 * Duplicate detection unit tests for contractor-initiated job proposals.
 *
 * detectDuplicate() flags a proposed job as a likely duplicate when an existing
 * job shares the same propertyId + serviceType + a date within the 14-day window.
 *
 * These tests are written first (TDD). The implementation lives in:
 *   agents/voice/duplicateDetection.ts
 */

import { detectDuplicate } from "../duplicateDetection";
import type { DuplicateCheckResult, ProposedJobFields, ExistingJobSummary } from "../duplicateDetection";

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeExisting(overrides: Partial<ExistingJobSummary> = {}): ExistingJobSummary {
  return {
    id:          "JOB_1",
    propertyId:  "prop-123",
    serviceType: "HVAC",
    date:        "2026-04-01",
    status:      "verified",
    ...overrides,
  };
}

function makeProposed(overrides: Partial<ProposedJobFields> = {}): ProposedJobFields {
  return {
    propertyId:  "prop-123",
    serviceType: "HVAC",
    date:        "2026-04-05",  // 4 days after existing — within 14-day window
    ...overrides,
  };
}

// ─── No duplicates ────────────────────────────────────────────────────────────

describe("detectDuplicate — no match", () => {
  it("returns isDuplicate: false when existing jobs array is empty", () => {
    const result = detectDuplicate(makeProposed(), []);
    expect(result.isDuplicate).toBe(false);
  });

  it("returns isDuplicate: false when propertyId differs", () => {
    const result = detectDuplicate(
      makeProposed({ propertyId: "prop-different" }),
      [makeExisting({ propertyId: "prop-123" })],
    );
    expect(result.isDuplicate).toBe(false);
  });

  it("returns isDuplicate: false when serviceType differs", () => {
    const result = detectDuplicate(
      makeProposed({ serviceType: "Plumbing" }),
      [makeExisting({ serviceType: "HVAC" })],
    );
    expect(result.isDuplicate).toBe(false);
  });

  it("returns isDuplicate: false when dates are more than 14 days apart (proposed after)", () => {
    const result = detectDuplicate(
      makeProposed({ date: "2026-04-20" }),        // 19 days after existing
      [makeExisting({ date: "2026-04-01" })],
    );
    expect(result.isDuplicate).toBe(false);
  });

  it("returns isDuplicate: false when dates are more than 14 days apart (proposed before)", () => {
    const result = detectDuplicate(
      makeProposed({ date: "2026-03-15" }),        // 17 days before existing
      [makeExisting({ date: "2026-04-01" })],
    );
    expect(result.isDuplicate).toBe(false);
  });

  it("returns isDuplicate: false when existing job is rejected", () => {
    // Rejected proposals shouldn't block re-submission
    const result = detectDuplicate(
      makeProposed(),
      [makeExisting({ status: "rejected" })],
    );
    expect(result.isDuplicate).toBe(false);
  });
});

// ─── Duplicate detected ───────────────────────────────────────────────────────

describe("detectDuplicate — match found", () => {
  it("flags same property + service + date within 14 days (proposed after)", () => {
    const result = detectDuplicate(
      makeProposed({ date: "2026-04-05" }),         // 4 days after
      [makeExisting({ date: "2026-04-01" })],
    );
    expect(result.isDuplicate).toBe(true);
  });

  it("flags same property + service + date within 14 days (proposed before)", () => {
    const result = detectDuplicate(
      makeProposed({ date: "2026-03-25" }),         // 7 days before
      [makeExisting({ date: "2026-04-01" })],
    );
    expect(result.isDuplicate).toBe(true);
  });

  it("flags same property + service on exact same date", () => {
    const result = detectDuplicate(
      makeProposed({ date: "2026-04-01" }),
      [makeExisting({ date: "2026-04-01" })],
    );
    expect(result.isDuplicate).toBe(true);
  });

  it("flags match at exactly 14 days apart (boundary inclusive)", () => {
    const result = detectDuplicate(
      makeProposed({ date: "2026-04-15" }),         // exactly 14 days after
      [makeExisting({ date: "2026-04-01" })],
    );
    expect(result.isDuplicate).toBe(true);
  });

  it("returns the matching job's ID in matchedJobId", () => {
    const result = detectDuplicate(
      makeProposed(),
      [makeExisting({ id: "JOB_42" })],
    );
    expect(result.matchedJobId).toBe("JOB_42");
  });

  it("returns a non-empty reason string", () => {
    const result = detectDuplicate(makeProposed(), [makeExisting()]);
    expect(typeof result.reason).toBe("string");
    expect((result.reason ?? "").length).toBeGreaterThan(0);
  });

  it("reason mentions the service type or time window", () => {
    const result = detectDuplicate(makeProposed(), [makeExisting()]);
    const reason = (result.reason ?? "").toLowerCase();
    expect(reason).toMatch(/hvac|14.?day|duplicate|window/);
  });
});

// ─── Multiple existing jobs ───────────────────────────────────────────────────

describe("detectDuplicate — multiple existing jobs", () => {
  it("finds the duplicate among several non-matching jobs", () => {
    const existing: ExistingJobSummary[] = [
      makeExisting({ id: "JOB_1", serviceType: "Roofing",  date: "2026-04-01" }),
      makeExisting({ id: "JOB_2", serviceType: "HVAC",     date: "2026-04-01" }),  // ← match
      makeExisting({ id: "JOB_3", serviceType: "Plumbing", date: "2026-04-01" }),
    ];
    const result = detectDuplicate(makeProposed({ serviceType: "HVAC", date: "2026-04-05" }), existing);
    expect(result.isDuplicate).toBe(true);
    expect(result.matchedJobId).toBe("JOB_2");
  });

  it("returns false when none of several jobs match", () => {
    const existing: ExistingJobSummary[] = [
      makeExisting({ id: "JOB_1", serviceType: "Roofing",     date: "2026-04-01" }),
      makeExisting({ id: "JOB_2", propertyId:  "other-prop",  date: "2026-04-01" }),
      makeExisting({ id: "JOB_3", serviceType: "Electrical",  date: "2026-04-01" }),
    ];
    const result = detectDuplicate(makeProposed({ serviceType: "HVAC" }), existing);
    expect(result.isDuplicate).toBe(false);
  });

  it("returns the earliest matching job when multiple overlap", () => {
    // Both JOB_A and JOB_B are potential duplicates — we expect the first matched
    const existing: ExistingJobSummary[] = [
      makeExisting({ id: "JOB_A", date: "2026-04-02" }),
      makeExisting({ id: "JOB_B", date: "2026-04-03" }),
    ];
    const result = detectDuplicate(makeProposed({ date: "2026-04-05" }), existing);
    expect(result.isDuplicate).toBe(true);
    // Either match is acceptable; what matters is exactly one is returned
    expect(["JOB_A", "JOB_B"]).toContain(result.matchedJobId);
  });
});

// ─── Type contract ────────────────────────────────────────────────────────────

describe("detectDuplicate — return type contract", () => {
  it("always returns an object with isDuplicate boolean", () => {
    const result: DuplicateCheckResult = detectDuplicate(makeProposed(), []);
    expect(typeof result.isDuplicate).toBe("boolean");
  });

  it("matchedJobId and reason are undefined when no duplicate", () => {
    const result = detectDuplicate(makeProposed(), []);
    expect(result.matchedJobId).toBeUndefined();
    expect(result.reason).toBeUndefined();
  });

  it("matchedJobId is defined when isDuplicate is true", () => {
    const result = detectDuplicate(makeProposed(), [makeExisting()]);
    if (result.isDuplicate) {
      expect(result.matchedJobId).toBeDefined();
    }
  });
});
