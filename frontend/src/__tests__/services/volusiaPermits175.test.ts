/**
 * §17.5.1 — Volusia County Permit Adapter
 *
 * Tests the Volusia-specific permit layer adapter:
 *   - isVolusiaCounty        → city+state → boolean
 *   - mapAmandaFolderType    → FOLDERTYPE short code → HomeGentic service type
 *   - mapAmandaStatus        → STATUSDESC string → OpenPermit status enum
 *   - parseAmandaRecord      → raw ArcGIS feature → OpenPermitRecord
 */

import { describe, it, expect } from "vitest";
import {
  isVolusiaCounty,
  mapAmandaFolderType,
  mapAmandaStatus,
  parseAmandaRecord,
  type AmandaFeature,
} from "@/services/volusiaPermits";

// ── isVolusiaCounty ───────────────────────────────────────────────────────────

describe("isVolusiaCounty", () => {
  it.each([
    ["Daytona Beach",   "FL", true],
    ["Deltona",         "FL", true],
    ["Ormond Beach",    "FL", true],
    ["Port Orange",     "FL", true],
    ["Holly Hill",      "FL", true],
    ["South Daytona",   "FL", true],
    ["New Smyrna Beach","FL", true],
    ["Edgewater",       "FL", true],
    ["DeLand",          "FL", true],
    ["DeBary",          "FL", true],
    ["Orange City",     "FL", true],
    ["Ponce Inlet",     "FL", true],
    ["Oak Hill",        "FL", true],
  ])("returns true for %s, FL", (city, state, expected) => {
    expect(isVolusiaCounty(city, state)).toBe(expected);
  });

  it("returns false for a FL city outside Volusia County", () => {
    expect(isVolusiaCounty("Miami", "FL")).toBe(false);
    expect(isVolusiaCounty("Orlando", "FL")).toBe(false);
    expect(isVolusiaCounty("Tampa", "FL")).toBe(false);
  });

  it("returns false for a non-FL state", () => {
    expect(isVolusiaCounty("Daytona Beach", "GA")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isVolusiaCounty("daytona beach", "fl")).toBe(true);
    expect(isVolusiaCounty("DELTONA", "FL")).toBe(true);
  });
});

// ── mapAmandaFolderType ───────────────────────────────────────────────────────

describe("mapAmandaFolderType", () => {
  it.each([
    ["ELEC",  "Electrical"],
    ["MECH",  "HVAC"],
    ["PLMB",  "Plumbing"],
    ["ROOF",  "Roofing"],
    ["WIND",  "Windows"],
    ["WTRH",  "Water Heater"],
    ["SOLR",  "Solar Panels"],
    ["INSUL", "Insulation"],
    ["FLOOR", "Flooring"],
    ["RES",   "General"],
    ["COM",   "General"],
    ["DEMO",  "General"],
    ["UNKN",  "General"],
  ])("maps FOLDERTYPE %s → %s", (code, expected) => {
    expect(mapAmandaFolderType(code)).toBe(expected);
  });

  it("is case-insensitive", () => {
    expect(mapAmandaFolderType("elec")).toBe("Electrical");
    expect(mapAmandaFolderType("Mech")).toBe("HVAC");
  });
});

// ── mapAmandaStatus ───────────────────────────────────────────────────────────

describe("mapAmandaStatus", () => {
  it.each([
    ["Final",            "Finaled"],
    ["Finaled",          "Finaled"],
    ["Certificate of Occupancy", "Finaled"],
    ["Closed",           "Finaled"],
    ["Completed",        "Finaled"],
    ["Plan Review",      "Open"],
    ["Issued",           "Open"],
    ["Under Review",     "Open"],
    ["Pending",          "Open"],
    ["Expired",          "Expired"],
    ["Void",             "Cancelled"],
    ["Cancelled",        "Cancelled"],
    ["Withdrawn",        "Cancelled"],
    ["",                 "Open"],
  ] as [string, "Open" | "Finaled" | "Expired" | "Cancelled"][])("maps %j → %s", (input, expected) => {
    expect(mapAmandaStatus(input)).toBe(expected);
  });
});

// ── parseAmandaRecord ─────────────────────────────────────────────────────────

const SAMPLE_FEATURE: AmandaFeature = {
  attributes: {
    FOLDERNAME:        "2022-ELEC-00456",
    FOLDERTYPE:        "ELEC",
    STATUSDESC:        "Finaled",
    INDATE:            1655251200000, // 2022-06-15 in ms
    FOLDERDESCRIPTION: "Panel upgrade 200A — 123 Main St, Daytona Beach FL 32114",
    FOLDERLINK:        "https://connectlive.vcgov.org/permits/2022-ELEC-00456",
  },
};

describe("parseAmandaRecord", () => {
  it("sets permitNumber from FOLDERNAME", () => {
    const record = parseAmandaRecord(SAMPLE_FEATURE);
    expect(record.permitNumber).toBe("2022-ELEC-00456");
  });

  it("sets permitType from FOLDERTYPE", () => {
    const record = parseAmandaRecord(SAMPLE_FEATURE);
    expect(record.permitType).toBe("Electrical Permit");
  });

  it("sets description from FOLDERDESCRIPTION", () => {
    const record = parseAmandaRecord(SAMPLE_FEATURE);
    expect(record.description).toContain("Panel upgrade 200A");
  });

  it("converts INDATE millisecond timestamp to YYYY-MM-DD", () => {
    const record = parseAmandaRecord(SAMPLE_FEATURE);
    expect(record.issuedDate).toBe("2022-06-15");
  });

  it("maps STATUSDESC to OpenPermit status via mapAmandaStatus", () => {
    const record = parseAmandaRecord(SAMPLE_FEATURE);
    expect(record.status).toBe("Finaled");
  });

  it("sets estimatedValueCents to undefined (not in AMANDA schema)", () => {
    const record = parseAmandaRecord(SAMPLE_FEATURE);
    expect(record.estimatedValueCents).toBeUndefined();
  });

  it("sets contractorName to undefined (not in AMANDA schema)", () => {
    const record = parseAmandaRecord(SAMPLE_FEATURE);
    expect(record.contractorName).toBeUndefined();
  });

  it("handles null INDATE gracefully", () => {
    const feature: AmandaFeature = {
      attributes: { ...SAMPLE_FEATURE.attributes, INDATE: null },
    };
    const record = parseAmandaRecord(feature);
    expect(record.issuedDate).toBe("");
  });

  it("handles missing FOLDERNAME gracefully", () => {
    const feature: AmandaFeature = {
      attributes: { ...SAMPLE_FEATURE.attributes, FOLDERNAME: null },
    };
    const record = parseAmandaRecord(feature);
    expect(record.permitNumber).toBe("");
  });
});
