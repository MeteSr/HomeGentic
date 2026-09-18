/**
 * disclosureService — real logic worth locking down:
 *   - computeDisclosureScore's rubric: +25 verification, +25 for ≥3 verified
 *     jobs, prorated key-systems points, +15 for a permit, +10 for ≥1 verified job
 *   - generateDisclosure pre-fills from property + verified job data
 *   - inspectionWaiverReady requires score ≥ 88 AND ≥2 key systems verified
 */

import { describe, it, expect } from "vitest";
import { computeDisclosureScore, generateDisclosure, inspectionWaiverReady } from "@/services/disclosureService";
import type { Property } from "@/services/property";
import type { Job } from "@/services/job";

function makeProperty(overrides: Partial<Property> = {}): Property {
  return {
    id: "prop-1", owner: "p-owner", address: "123 Main St", city: "Austin", state: "TX",
    zipCode: "78701", propertyType: "SingleFamily" as any, yearBuilt: 2000n, squareFeet: 2000n,
    verificationLevel: "None" as any, tier: "Free" as any, createdAt: 0n, updatedAt: 0n, isActive: true,
    ...overrides,
  };
}

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "job-1", propertyId: "prop-1", homeowner: "p-owner", serviceType: "HVAC",
    amount: 50000, date: "2024-01-01", description: "Service", isDiy: false,
    contractorName: "Cool Air Co.", status: "verified" as any, verified: true,
    homeownerSigned: true, contractorSigned: true, photos: [], createdAt: Date.now(),
    ...overrides,
  };
}

describe("computeDisclosureScore", () => {
  it("scores 0 for an unverified property with no jobs", () => {
    expect(computeDisclosureScore(makeProperty(), [])).toBe(0);
  });

  it("awards +25 for Basic or Premium verification", () => {
    expect(computeDisclosureScore(makeProperty({ verificationLevel: "Basic" as any }), [])).toBe(25);
    expect(computeDisclosureScore(makeProperty({ verificationLevel: "Premium" as any }), [])).toBe(25);
  });

  it("awards +25 for 3+ verified jobs, +10 for having at least 1", () => {
    const jobs = [makeJob({ id: "j1", serviceType: "Roofing" }), makeJob({ id: "j2", serviceType: "Roofing" }), makeJob({ id: "j3", serviceType: "Roofing" })];
    // 25 (3+ verified) + floor(25*1/4)=6 (1 of 4 key systems) + 10 (>=1 verified) = 41
    expect(computeDisclosureScore(makeProperty(), jobs)).toBe(41);
  });

  it("prorates key-systems points by floor(25 * verified / 4)", () => {
    const jobs = [
      makeJob({ id: "j1", serviceType: "HVAC" }),
      makeJob({ id: "j2", serviceType: "Roofing" }),
    ];
    // 0 (only 2 jobs, not >=3) + floor(25*2/4)=12 + 10 (>=1 verified) = 22
    expect(computeDisclosureScore(makeProperty(), jobs)).toBe(22);
  });

  it("awards +15 when any job has a permit number", () => {
    const jobs = [makeJob({ permitNumber: "P-123" })];
    // floor(25*1/4)=6 + 15 + 10 = 31
    expect(computeDisclosureScore(makeProperty(), jobs)).toBe(31);
  });

  it("caps the total score at 100", () => {
    const jobs = ["HVAC", "Roofing", "Plumbing", "Electrical"].map((t, i) =>
      makeJob({ id: `j${i}`, serviceType: t, permitNumber: "P-1" })
    );
    const score = computeDisclosureScore(makeProperty({ verificationLevel: "Premium" as any }), jobs);
    expect(score).toBeLessThanOrEqual(100);
    // 25 + 25 + 25 + 15 + 10 = 100
    expect(score).toBe(100);
  });
});

describe("generateDisclosure", () => {
  it("pre-fills property info and only verified jobs as material improvements", () => {
    const property = makeProperty({ address: "1 Elm St", city: "Austin", state: "TX", zipCode: "78701", yearBuilt: 1990n, squareFeet: 1800n, propertyType: "SingleFamily" as any });
    const jobs = [
      makeJob({ id: "j1", serviceType: "HVAC", date: "2023-05-01", isDiy: false, contractorSigned: true }),
      makeJob({ id: "j2", serviceType: "Roofing", verified: false, status: "pending" as any }),
    ];

    const statement = generateDisclosure(property, jobs);

    expect(statement.propertyInfo).toEqual({
      address: "1 Elm St", city: "Austin", state: "TX", zipCode: "78701",
      yearBuilt: 1990, squareFeet: 1800, propertyType: "SingleFamily",
    });
    expect(statement.materialImprovements).toHaveLength(1);
    expect(statement.materialImprovements[0]).toMatchObject({ title: "HVAC", year: 2023, verifiedByContractor: true });
  });

  it("includes permits from any job with a permitNumber regardless of verification", () => {
    const jobs = [makeJob({ permitNumber: "P-99", date: "2022-06-15", verified: false, status: "pending" as any })];
    const statement = generateDisclosure(makeProperty(), jobs);
    expect(statement.permits).toEqual([{ title: "HVAC", permitNumber: "P-99", year: 2022 }]);
  });
});

describe("inspectionWaiverReady", () => {
  it("is false when score is below 88 even with all key systems verified", () => {
    const jobs = ["HVAC", "Roofing", "Plumbing", "Electrical"].map((t, i) => makeJob({ id: `j${i}`, serviceType: t }));
    expect(inspectionWaiverReady(87, jobs)).toBe(false);
  });

  it("is false when score is 88+ but fewer than 2 key systems are verified", () => {
    const jobs = [makeJob({ serviceType: "HVAC" })];
    expect(inspectionWaiverReady(90, jobs)).toBe(false);
  });

  it("is true when score is 88+ and at least 2 key systems are verified", () => {
    const jobs = [makeJob({ id: "j1", serviceType: "HVAC" }), makeJob({ id: "j2", serviceType: "Roofing" })];
    expect(inspectionWaiverReady(88, jobs)).toBe(true);
  });
});
