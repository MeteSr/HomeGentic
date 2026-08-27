/**
 * Unit tests for detectDuplicate (frontend duplicate job detection)
 */

import { describe, it, expect } from "vitest";
import {
  detectDuplicate,
  type ProposedJobFields,
  type ExistingJobSummary,
} from "@/services/duplicateDetection";

function makeExisting(overrides: Partial<ExistingJobSummary> = {}): ExistingJobSummary {
  return {
    id:          "job-existing-1",
    propertyId:  "prop-1",
    serviceType: "HVAC",
    date:        "2024-06-01",
    status:      "completed",
    ...overrides,
  };
}

function makeProposed(overrides: Partial<ProposedJobFields> = {}): ProposedJobFields {
  return {
    propertyId:  "prop-1",
    serviceType: "HVAC",
    date:        "2024-06-05",
    ...overrides,
  };
}

describe("detectDuplicate — no duplicate", () => {
  it("returns isDuplicate false when there are no existing jobs", () => {
    const result = detectDuplicate(makeProposed(), []);
    expect(result.isDuplicate).toBe(false);
  });

  it("returns isDuplicate false when propertyId differs", () => {
    const existing = makeExisting({ propertyId: "prop-other" });
    const result = detectDuplicate(makeProposed({ propertyId: "prop-1" }), [existing]);
    expect(result.isDuplicate).toBe(false);
  });

  it("returns isDuplicate false when serviceType differs", () => {
    const existing = makeExisting({ serviceType: "Plumbing" });
    const result = detectDuplicate(makeProposed({ serviceType: "HVAC" }), [existing]);
    expect(result.isDuplicate).toBe(false);
  });

  it("returns isDuplicate false when dates are more than 14 days apart", () => {
    const existing = makeExisting({ date: "2024-01-01" });
    const result = detectDuplicate(makeProposed({ date: "2024-01-20" }), [existing]);
    expect(result.isDuplicate).toBe(false);
  });

  it("returns isDuplicate false when existing job is rejected", () => {
    const existing = makeExisting({ status: "rejected", date: "2024-06-02" });
    const result = detectDuplicate(makeProposed({ date: "2024-06-04" }), [existing]);
    expect(result.isDuplicate).toBe(false);
  });

  it("returns isDuplicate false when existing job is rejected_by_homeowner", () => {
    const existing = makeExisting({ status: "rejected_by_homeowner", date: "2024-06-02" });
    const result = detectDuplicate(makeProposed({ date: "2024-06-04" }), [existing]);
    expect(result.isDuplicate).toBe(false);
  });
});

describe("detectDuplicate — duplicate detected", () => {
  it("detects duplicate when same property, serviceType, within 14 days", () => {
    const existing = makeExisting({ date: "2024-06-01" });
    const proposed = makeProposed({ date: "2024-06-05" }); // 4 days apart
    const result = detectDuplicate(proposed, [existing]);
    expect(result.isDuplicate).toBe(true);
    expect(result.matchedJobId).toBe("job-existing-1");
  });

  it("detects duplicate on exactly the same date", () => {
    const existing = makeExisting({ date: "2024-06-01" });
    const proposed = makeProposed({ date: "2024-06-01" });
    const result = detectDuplicate(proposed, [existing]);
    expect(result.isDuplicate).toBe(true);
  });

  it("detects duplicate exactly 14 days apart", () => {
    const existing = makeExisting({ date: "2024-06-01" });
    const proposed = makeProposed({ date: "2024-06-15" }); // exactly 14 days
    const result = detectDuplicate(proposed, [existing]);
    expect(result.isDuplicate).toBe(true);
  });

  it("includes a reason string explaining the conflict", () => {
    const existing = makeExisting({ id: "job-xyz", date: "2024-06-01", serviceType: "HVAC" });
    const proposed = makeProposed({ date: "2024-06-05", serviceType: "HVAC" });
    const result = detectDuplicate(proposed, [existing]);
    expect(result.reason).toContain("HVAC");
    expect(result.reason).toContain("job-xyz");
    expect(result.reason).toContain("14-day");
  });
});

describe("detectDuplicate — first match wins", () => {
  it("returns the first matching job when multiple match", () => {
    const existing1 = makeExisting({ id: "j1", date: "2024-06-02" });
    const existing2 = makeExisting({ id: "j2", date: "2024-06-03" });
    const proposed  = makeProposed({ date: "2024-06-05" });
    const result = detectDuplicate(proposed, [existing1, existing2]);
    expect(result.isDuplicate).toBe(true);
    expect(result.matchedJobId).toBe("j1");
  });
});
