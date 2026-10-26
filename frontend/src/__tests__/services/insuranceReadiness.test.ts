import { describe, it, expect } from "vitest";
import {
  fourPointReadiness, windMitigationReadiness, readinessCounts, inspectionQuotePrefill, isFlorida,
} from "@/services/insuranceReadiness";
import type { Job } from "@/services/job";

const NOW = new Date("2026-10-26T00:00:00Z");
const FL = { yearBuilt: 1995, state: "FL" };

function job(over: Partial<Job>): Job {
  return {
    id: "j", propertyId: "1", homeowner: "h", serviceType: "Roofing", amount: 0, date: "2020-01-01",
    description: "", isDiy: false, status: "verified", verified: true, homeownerSigned: true,
    contractorSigned: true, photos: [], createdAt: 0, ...over,
  } as Job;
}

describe("isFlorida", () => {
  it("accepts FL and Florida, case-insensitively", () => {
    expect(isFlorida({ yearBuilt: 0, state: "fl" })).toBe(true);
    expect(isFlorida({ yearBuilt: 0, state: "Florida" })).toBe(true);
    expect(isFlorida({ yearBuilt: 0, state: "TX" })).toBe(false);
  });
});

describe("fourPointReadiness", () => {
  it("marks every system missing with an empty record", () => {
    const items = fourPointReadiness(FL, [], {}, NOW);
    expect(items.map((i) => i.key)).toEqual(["roof", "electrical", "plumbing", "hvac"]);
    expect(items.every((i) => i.status === "missing")).toBe(true);
  });

  it("documents HVAC with an install year and a job", () => {
    const hvac = fourPointReadiness(FL, [job({ serviceType: "HVAC", date: "2025-05-01", contractorName: "Cool Air", description: "Annual tune-up" })], { HVAC: 2018 }, NOW)
      .find((i) => i.key === "hvac")!;
    expect(hvac.status).toBe("documented");
    expect(hvac.ageYears).toBe(8);
    expect(hvac.ageNote).toBeUndefined();
    expect(hvac.evidence).toEqual(["Installed 2018 (from your system ages)", "2025-05-01: Annual tune-up (Cool Air, verified)"]);
  });

  it("never calls electrical documented: panel and wiring aren't tracked", () => {
    const el = fourPointReadiness(FL, [job({ serviceType: "Electrical" })], { Electrical: 2010 }, NOW).find((i) => i.key === "electrical")!;
    expect(el.status).toBe("partial");
    expect(el.missing).toContain("Panel brand and amperage");
  });

  it("flags an old roof and says when the age comes from the build year", () => {
    const roof = fourPointReadiness(FL, [], {}, NOW).find((i) => i.key === "roof")!;
    expect(roof.ageYears).toBe(31);
    expect(roof.ageNote).toMatch(/15 years and older.*year the home was built/);
    const newer = fourPointReadiness(FL, [], { Roofing: 2020 }, NOW).find((i) => i.key === "roof")!;
    expect(newer.ageNote).toBeUndefined();
  });

  it("lists the water heater under plumbing", () => {
    const pl = fourPointReadiness(FL, [], { "Water Heater": 2019 }, NOW).find((i) => i.key === "plumbing")!;
    expect(pl.evidence).toContain("Water heater installed 2019 (from your system ages)");
    expect(pl.missing).not.toContain("Water heater age");
  });

  it("shows the newest jobs first, marks self-reported and permits", () => {
    const roof = fourPointReadiness(FL, [
      job({ date: "2019-01-01", description: "Patch", status: "pending" as any, isDiy: true }),
      job({ date: "2023-06-01", description: "Full replacement", permitNumber: "BP-77" }),
    ], {}, NOW).find((i) => i.key === "roof")!;
    expect(roof.evidence).toEqual([
      "2023-06-01: Full replacement (contractor, verified) · permit BP-77",
      "2019-01-01: Patch (DIY, self-reported)",
    ]);
  });
});

describe("windMitigationReadiness", () => {
  it("documents the roof covering only with a permit", () => {
    const none = windMitigationReadiness(FL, []).find((i) => i.key === "roofCovering")!;
    expect(none.status).toBe("missing");
    const noPermit = windMitigationReadiness(FL, [job({})]).find((i) => i.key === "roofCovering")!;
    expect(noPermit.status).toBe("partial");
    const permit = windMitigationReadiness(FL, [job({ permitNumber: "BP-1" })]).find((i) => i.key === "roofCovering")!;
    expect(permit.status).toBe("documented");
  });

  it("finds opening protection in window and handyman jobs", () => {
    const items = windMitigationReadiness(FL, [job({ serviceType: "Windows", description: "Installed impact windows" })]);
    expect(items.find((i) => i.key === "openings")!.status).toBe("partial");
    expect(windMitigationReadiness(FL, [job({ serviceType: "Windows", description: "Replaced screens" })])
      .find((i) => i.key === "openings")!.status).toBe("missing");
  });

  it("never claims code compliance from the build year alone", () => {
    const newer = windMitigationReadiness({ yearBuilt: 2008, state: "FL" }, []).find((i) => i.key === "code")!;
    expect(newer.status).toBe("partial");
    const older = windMitigationReadiness(FL, []).find((i) => i.key === "code")!;
    expect(older.status).toBe("onSite");
  });

  it("leaves attic items to the inspector", () => {
    const counts = readinessCounts(windMitigationReadiness(FL, []));
    expect(counts.onSite).toBe(2);
  });
});

describe("inspectionQuotePrefill", () => {
  it("uses the Other service type with a description", () => {
    expect(inspectionQuotePrefill("windMit", "7")).toEqual({
      propertyId: "7", serviceType: "Other",
      description: "Wind mitigation inspection (OIR-B1-1802 form) for my homeowners insurance.",
    });
  });
});
