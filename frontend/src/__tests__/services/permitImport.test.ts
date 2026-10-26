/**
 * permitImport — real logic worth locking down:
 *   - mapPermitTypeToServiceType classifies free-text permit types via regex
 *   - permitToJobInput converts a permit into job input, marking isDiy when
 *     no contractor name is present and mapping status correctly
 *   - isPermitDataAvailable checks the supported city:state set
 *   - importPermitsForProperty short-circuits when the city isn't supported
 *   - createJobsFromPermits writes each confirmed permit as a job
 *   - City of Orlando rows: type from application type / worktype, status,
 *     contractor company, cost; the city-limits caveat on the coverage badge
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockCreate, mockImport } = vi.hoisted(() => ({ mockCreate: vi.fn(), mockImport: vi.fn() }));
vi.mock("@/services/aiProxy", () => ({ aiProxyService: { importPermits: mockImport } }));
vi.mock("@/services/job", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/job")>();
  return { ...actual, jobService: { ...actual.jobService, create: mockCreate } };
});

import {
  mapPermitTypeToServiceType, permitToJobInput, isPermitDataAvailable,
  importPermitsForProperty, createJobsFromPermits, parseOrlandoPermit, permitCoverageNote,
  type OpenPermitRecord, type ImportedPermit,
} from "@/services/permitImport";

beforeEach(() => vi.clearAllMocks());

describe("mapPermitTypeToServiceType", () => {
  it("classifies common permit type strings", () => {
    expect(mapPermitTypeToServiceType("Electrical Permit")).toBe("Electrical");
    expect(mapPermitTypeToServiceType("Mechanical/HVAC")).toBe("HVAC");
    expect(mapPermitTypeToServiceType("Plumbing Permit")).toBe("Plumbing");
    expect(mapPermitTypeToServiceType("Reroof")).toBe("Roofing");
  });

  it("falls back to General for unrecognized types", () => {
    expect(mapPermitTypeToServiceType("Demolition")).toBe("General");
  });
});

describe("permitToJobInput", () => {
  function makePermit(overrides: Partial<OpenPermitRecord> = {}): OpenPermitRecord {
    return {
      permitNumber: "P-1", permitType: "Electrical", description: "Panel upgrade",
      issuedDate: "2024-01-01", status: "Finaled",
      ...overrides,
    };
  }

  it("marks isDiy true when no contractor name is present", () => {
    const input = permitToJobInput(makePermit(), "prop-1");
    expect(input.isDiy).toBe(true);
  });

  it("marks isDiy false when a contractor name is present", () => {
    const input = permitToJobInput(makePermit({ contractorName: "Acme Electric" }), "prop-1");
    expect(input.isDiy).toBe(false);
  });

  it("maps Finaled status to verified", () => {
    const input = permitToJobInput(makePermit({ status: "Finaled" }), "prop-1");
    expect(input.status).toBe("verified");
  });

  it("maps Open status to pending and Expired to completed", () => {
    expect(permitToJobInput(makePermit({ status: "Open" }), "prop-1").status).toBe("pending");
    expect(permitToJobInput(makePermit({ status: "Expired" }), "prop-1").status).toBe("completed");
  });

  it("defaults amount to 0 when estimatedValueCents is absent", () => {
    const input = permitToJobInput(makePermit(), "prop-1");
    expect(input.amount).toBe(0);
  });
});

describe("isPermitDataAvailable", () => {
  it("is true for a supported city:state pair, case-insensitive", () => {
    expect(isPermitDataAvailable("Austin", "TX")).toBe(true);
    expect(isPermitDataAvailable("austin", "tx")).toBe(true);
  });

  it("is false for an unsupported city", () => {
    expect(isPermitDataAvailable("Smalltown", "XX")).toBe(false);
  });
});

describe("importPermitsForProperty", () => {
  it("short-circuits with citySupported:false when the city isn't supported", async () => {
    const result = await importPermitsForProperty("prop-1", "1 Main St", "Nowhere", "XX", "00000");
    expect(result).toEqual({ citySupported: false, imported: 0, permits: [] });
  });
});

describe("createJobsFromPermits", () => {
  it("returns an empty array immediately for an empty list", async () => {
    const result = await createJobsFromPermits("prop-1", []);
    expect(result).toEqual([]);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("creates a job for each confirmed permit, carrying over the permit number", async () => {
    mockCreate.mockResolvedValue({ id: "job-1" });
    const permits: ImportedPermit[] = [{
      permit: { permitNumber: "P-1", permitType: "Electrical", description: "Panel", issuedDate: "2024-01-01", status: "Finaled" },
      serviceType: "Electrical",
      jobInput: {
        propertyId: "prop-1", serviceType: "Electrical", amount: 0, date: "2024-01-01",
        description: "Panel", isDiy: true, status: "verified",
      } as any,
    }];

    const jobs = await createJobsFromPermits("prop-1", permits);
    expect(jobs).toHaveLength(1);
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ permitNumber: "P-1" }));
  });
});

describe("City of Orlando permits", () => {
  const ROOF = {
    permit_number: "BLD2025-101", application_type: "Building Permit", worktype: "Roof",
    application_status: "Finaled", issue_permit_date: "2025-03-04T00:00:00.000", final_date: "2025-04-01T00:00:00.000",
    estimated_cost: "18500", contractor: "KRIS BOLLINGER (CATALYST ROOFING LLC)", project_name: "Reroof shingle",
  };

  it("reads a finaled roof permit", () => {
    expect(parseOrlandoPermit(ROOF)).toEqual({
      permitNumber: "BLD2025-101", permitType: "Roofing Permit", description: "Roof: Reroof shingle",
      issuedDate: "2025-03-04", status: "Finaled", estimatedValueCents: 1_850_000, contractorName: "CATALYST ROOFING LLC",
    });
  });

  it("maps trade permits, open and void statuses, and a missing cost or contractor", () => {
    const elec = parseOrlandoPermit({ ...ROOF, application_type: "Electrical", worktype: "Alteration", application_status: "Open",
      final_date: undefined, estimated_cost: "0", contractor: "SPARKY ELECTRIC", project_name: undefined });
    expect(elec).toMatchObject({ permitType: "Electrical Permit", status: "Open", description: "Alteration", contractorName: "SPARKY ELECTRIC" });
    expect(elec.estimatedValueCents).toBeUndefined();
    expect(parseOrlandoPermit({ ...ROOF, application_type: "Mechanical Permit", application_status: "Void", final_date: undefined }).status).toBe("Cancelled");
    expect(parseOrlandoPermit({ ...ROOF, application_status: "Closed", final_date: undefined }).status).toBe("Finaled");
    expect(parseOrlandoPermit({ ...ROOF, contractor: undefined }).contractorName).toBeUndefined();
    expect(mapPermitTypeToServiceType(parseOrlandoPermit({ ...ROOF, application_type: "Mechanical Permit" }).permitType)).toBe("HVAC");
  });

  it("imports through the Worker's orlando source", async () => {
    mockImport.mockResolvedValue(JSON.stringify({ source: "orlando", data: [ROOF] }));
    const result = await importPermitsForProperty("prop-1", "12 W Pine St", "Orlando", "FL", "32801");
    expect(result.citySupported).toBe(true);
    expect(result.permits).toHaveLength(1);
    expect(result.permits[0]).toMatchObject({ serviceType: "Roofing", jobInput: { contractorName: "CATALYST ROOFING LLC", isDiy: false, status: "verified" } });
  });

  it("is covered, with a city-limits caveat", () => {
    expect(isPermitDataAvailable("Orlando", "FL")).toBe(true);
    expect(permitCoverageNote("orlando", "fl")).toMatch(/City of Orlando permits only/);
    expect(permitCoverageNote("Deltona", "FL")).toBeNull();
  });
});
