/**
 * §17.5.1 — Municipal Permit API Integration
 *
 * Tests the permit import service layer:
 *   - mapPermitTypeToServiceType  → permit type string → HomeGentic service type
 *   - permitToJobInput            → OpenPermitRecord → Job create input
 *   - isPermitDataAvailable       → city+state coverage check
 *   - importPermitsForProperty    → async import with mocked ai_proxy canister
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  mapPermitTypeToServiceType,
  permitToJobInput,
  isPermitDataAvailable,
  importPermitsForProperty,
  type OpenPermitRecord,
  type PermitImportResult,
} from "@/services/permitImport";

vi.mock("@/services/aiProxy", () => ({
  aiProxyService: {
    importPermits: vi.fn(),
  },
}));

import { aiProxyService } from "@/services/aiProxy";

// ── mapPermitTypeToServiceType ────────────────────────────────────────────────

describe("mapPermitTypeToServiceType", () => {
  it.each([
    ["Electrical Permit",      "Electrical"],
    ["ELECTRICAL",             "Electrical"],
    ["electrical",             "Electrical"],
    ["Mechanical Permit",      "HVAC"],
    ["HVAC",                   "HVAC"],
    ["hvac permit",            "HVAC"],
    ["Plumbing Permit",        "Plumbing"],
    ["PLUMBING",               "Plumbing"],
    ["Roofing Permit",         "Roofing"],
    ["Roof Replacement",       "Roofing"],
    ["Window Permit",          "Windows"],
    ["Window Replacement",     "Windows"],
    ["Water Heater Permit",    "Water Heater"],
    ["Solar Permit",           "Solar Panels"],
    ["Solar Panel Installation", "Solar Panels"],
    ["Building Permit",        "General"],
    ["Demolition Permit",      "General"],
    ["unknown permit type",    "General"],
  ])("maps %s → %s", (input, expected) => {
    expect(mapPermitTypeToServiceType(input)).toBe(expected);
  });
});

// ── permitToJobInput ──────────────────────────────────────────────────────────

const SAMPLE_PERMIT: OpenPermitRecord = {
  permitNumber:         "2021-ELEC-00123",
  permitType:           "Electrical Permit",
  description:          "Panel upgrade to 200A service",
  issuedDate:           "2021-06-15",
  status:               "Finaled",
  estimatedValueCents:  350_000,
  contractorName:       "Bright Spark Electric",
};

describe("permitToJobInput", () => {
  it("maps serviceType via mapPermitTypeToServiceType", () => {
    const input = permitToJobInput(SAMPLE_PERMIT, "prop-1");
    expect(input.serviceType).toBe("Electrical");
  });

  it("uses issuedDate as the job date", () => {
    const input = permitToJobInput(SAMPLE_PERMIT, "prop-1");
    expect(input.date).toBe("2021-06-15");
  });

  it("sets propertyId correctly", () => {
    const input = permitToJobInput(SAMPLE_PERMIT, "prop-42");
    expect(input.propertyId).toBe("prop-42");
  });

  it("carries permit description into job description", () => {
    const input = permitToJobInput(SAMPLE_PERMIT, "prop-1");
    expect(input.description).toContain("Panel upgrade to 200A service");
  });

  it("stores the permit number", () => {
    const input = permitToJobInput(SAMPLE_PERMIT, "prop-1");
    expect(input.permitNumber).toBe("2021-ELEC-00123");
  });

  it("uses estimatedValueCents as job amount", () => {
    const input = permitToJobInput(SAMPLE_PERMIT, "prop-1");
    expect(input.amount).toBe(350_000);
  });

  it("defaults amount to 0 when estimatedValueCents absent", () => {
    const input = permitToJobInput({ ...SAMPLE_PERMIT, estimatedValueCents: undefined }, "prop-1");
    expect(input.amount).toBe(0);
  });

  it("carries contractorName when present", () => {
    const input = permitToJobInput(SAMPLE_PERMIT, "prop-1");
    expect(input.contractorName).toBe("Bright Spark Electric");
  });

  it("sets isDiy to false when contractor present", () => {
    const input = permitToJobInput(SAMPLE_PERMIT, "prop-1");
    expect(input.isDiy).toBe(false);
  });

  it("sets isDiy to true when contractorName absent", () => {
    const input = permitToJobInput({ ...SAMPLE_PERMIT, contractorName: undefined }, "prop-1");
    expect(input.isDiy).toBe(true);
  });

  it("status 'Finaled' maps to status 'verified'", () => {
    const input = permitToJobInput(SAMPLE_PERMIT, "prop-1");
    expect(input.status).toBe("verified");
  });

  it("status 'Open' maps to status 'pending'", () => {
    const input = permitToJobInput({ ...SAMPLE_PERMIT, status: "Open" }, "prop-1");
    expect(input.status).toBe("pending");
  });

  it("status 'Expired' maps to status 'completed'", () => {
    const input = permitToJobInput({ ...SAMPLE_PERMIT, status: "Expired" }, "prop-1");
    expect(input.status).toBe("completed");
  });
});

// ── isPermitDataAvailable ─────────────────────────────────────────────────────

describe("isPermitDataAvailable", () => {
  it.each([
    ["Los Angeles", "CA", true],
    ["Houston",     "TX", true],
    ["Phoenix",     "AZ", true],
    ["Austin",      "TX", true],
    ["New York",    "NY", true],
    ["Chicago",     "IL", true],
    ["San Diego",   "CA", true],
    ["Dallas",      "TX", true],
    ["San Jose",    "CA", true],
  ])("returns true for %s, %s", (city, state, expected) => {
    expect(isPermitDataAvailable(city, state)).toBe(expected);
  });

  it("returns false for a city not in the supported set", () => {
    expect(isPermitDataAvailable("Smalltown", "WY")).toBe(false);
  });

  it("is case-insensitive for city names", () => {
    expect(isPermitDataAvailable("austin", "TX")).toBe(true);
    expect(isPermitDataAvailable("HOUSTON", "TX")).toBe(true);
  });

  it("is case-insensitive for state codes", () => {
    expect(isPermitDataAvailable("Los Angeles", "ca")).toBe(true);
  });
});

// ── importPermitsForProperty ─────────────────────────────��────────────────────
//
// The canister returns a JSON string: { source: "openpermit", data: { results: [...] } }
// mapCanisterResponse maps data.results[].permit_type / permit_number / etc.

const MOCK_CANISTER_RESPONSE = JSON.stringify({
  source: "openpermit",
  data: {
    results: [
      {
        permit_number:   "2019-ROOF-0045",
        permit_type:     "Roofing Permit",
        description:     "Shingle replacement",
        issued_date:     "2019-04-10",
        status:          "Finaled",
        estimated_value: 2200,
        contractor_name: "Top Notch Roofing",
      },
      {
        permit_number:   "2021-ELEC-00123",
        permit_type:     "Electrical Permit",
        description:     "Panel upgrade",
        issued_date:     "2021-06-15",
        status:          "Finaled",
        estimated_value: 3500,
      },
    ],
  },
});

describe("importPermitsForProperty", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("returns citySupported: false and empty permits when city not supported", async () => {
    const result = await importPermitsForProperty("prop-1", "123 Main St", "Smalltown", "WY", "82001");
    expect(result.citySupported).toBe(false);
    expect(result.permits).toHaveLength(0);
    expect(result.imported).toBe(0);
  });

  it("calls aiProxyService.importPermits for a supported city", async () => {
    vi.mocked(aiProxyService.importPermits).mockResolvedValueOnce(MOCK_CANISTER_RESPONSE);

    await importPermitsForProperty("prop-1", "456 Oak Ave", "Austin", "TX", "78701");
    expect(aiProxyService.importPermits).toHaveBeenCalledWith("456 Oak Ave", "Austin", "TX", "78701");
  });

  it("returns citySupported: true for a supported city", async () => {
    vi.mocked(aiProxyService.importPermits).mockResolvedValueOnce(MOCK_CANISTER_RESPONSE);

    const result = await importPermitsForProperty("prop-1", "456 Oak Ave", "Austin", "TX", "78701");
    expect(result.citySupported).toBe(true);
  });

  it("maps canister permits to ImportedPermit entries", async () => {
    vi.mocked(aiProxyService.importPermits).mockResolvedValueOnce(MOCK_CANISTER_RESPONSE);

    const result = await importPermitsForProperty("prop-1", "456 Oak Ave", "Austin", "TX", "78701");
    expect(result.permits).toHaveLength(2);
    expect(result.permits[0].serviceType).toBe("Roofing");
    expect(result.permits[1].serviceType).toBe("Electrical");
  });

  it("reports correct imported count", async () => {
    vi.mocked(aiProxyService.importPermits).mockResolvedValueOnce(MOCK_CANISTER_RESPONSE);

    const result = await importPermitsForProperty("prop-1", "456 Oak Ave", "Austin", "TX", "78701");
    expect(result.imported).toBe(2);
  });

  it("returns empty result when canister returns null", async () => {
    vi.mocked(aiProxyService.importPermits).mockResolvedValueOnce(null);

    const result = await importPermitsForProperty("prop-1", "456 Oak Ave", "Austin", "TX", "78701");
    expect(result.imported).toBe(0);
    expect(result.permits).toHaveLength(0);
  });

  it("returns empty result when canister returns no permits", async () => {
    vi.mocked(aiProxyService.importPermits).mockResolvedValueOnce(
      JSON.stringify({ source: "openpermit", data: { results: [] } })
    );

    const result = await importPermitsForProperty("prop-1", "456 Oak Ave", "Austin", "TX", "78701");
    expect(result.imported).toBe(0);
    expect(result.permits).toHaveLength(0);
  });

  it("returns citySupported: false when canister returns unsupported source", async () => {
    vi.mocked(aiProxyService.importPermits).mockResolvedValueOnce(
      JSON.stringify({ source: "unsupported", data: null })
    );

    const result = await importPermitsForProperty("prop-1", "456 Oak Ave", "Austin", "TX", "78701");
    expect(result.citySupported).toBe(false);
  });
});
