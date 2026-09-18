/**
 * volusiaPermits — real logic worth locking down:
 *   - isVolusiaCounty matches only FL cities in the coverage set
 *   - mapAmandaFolderType and mapAmandaStatus classify raw AMANDA codes
 *   - parseAmandaRecord converts a raw ArcGIS feature into an OpenPermitRecord
 *   - fetchVolusiaPermits throws on a non-OK response and maps features on success
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { isVolusiaCounty, mapAmandaFolderType, mapAmandaStatus, parseAmandaRecord, fetchVolusiaPermits } from "@/services/volusiaPermits";

describe("isVolusiaCounty", () => {
  it("is true for a covered FL city, case-insensitive", () => {
    expect(isVolusiaCounty("Daytona Beach", "FL")).toBe(true);
    expect(isVolusiaCounty("deltona", "fl")).toBe(true);
  });

  it("is false for a non-covered city or non-FL state", () => {
    expect(isVolusiaCounty("Orlando", "FL")).toBe(false);
    expect(isVolusiaCounty("Daytona Beach", "GA")).toBe(false);
  });
});

describe("mapAmandaFolderType", () => {
  it("maps known codes to service types", () => {
    expect(mapAmandaFolderType("elec")).toBe("Electrical");
    expect(mapAmandaFolderType("MECH")).toBe("HVAC");
    expect(mapAmandaFolderType("roof")).toBe("Roofing");
  });

  it("falls back to General for unknown codes", () => {
    expect(mapAmandaFolderType("xyz")).toBe("General");
  });
});

describe("mapAmandaStatus", () => {
  it("classifies Finaled, Expired, Cancelled, and defaults to Open", () => {
    expect(mapAmandaStatus("Certificate of Completion")).toBe("Finaled");
    expect(mapAmandaStatus("Expired")).toBe("Expired");
    expect(mapAmandaStatus("Voided")).toBe("Cancelled");
    expect(mapAmandaStatus("In Review")).toBe("Open");
  });
});

describe("parseAmandaRecord", () => {
  it("converts a raw feature into an OpenPermitRecord", () => {
    const feature = {
      attributes: {
        FOLDERNAME: "P-12345", FOLDERTYPE: "elec", STATUSDESC: "Finaled",
        INDATE: 1_700_000_000_000, FOLDERDESCRIPTION: "Panel upgrade", FOLDERLINK: null,
      },
    };
    const record = parseAmandaRecord(feature);
    expect(record.permitNumber).toBe("P-12345");
    expect(record.permitType).toBe("Electrical Permit");
    expect(record.status).toBe("Finaled");
    expect(record.issuedDate).toBe(new Date(1_700_000_000_000).toISOString().slice(0, 10));
  });

  it("handles null fields gracefully", () => {
    const feature = { attributes: { FOLDERNAME: null, FOLDERTYPE: null, STATUSDESC: null, INDATE: null, FOLDERDESCRIPTION: null, FOLDERLINK: null } };
    const record = parseAmandaRecord(feature);
    expect(record.permitNumber).toBe("");
    expect(record.permitType).toBe("Building Permit");
    expect(record.issuedDate).toBe("");
  });
});

describe("fetchVolusiaPermits", () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; vi.restoreAllMocks(); });

  it("throws when the response is not ok", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    await expect(fetchVolusiaPermits("123 Main St, Daytona Beach")).rejects.toThrow("Volusia ArcGIS error: 500");
  });

  it("maps features from a successful response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ features: [{ attributes: { FOLDERNAME: "P-1", FOLDERTYPE: "roof", STATUSDESC: "Open", INDATE: null, FOLDERDESCRIPTION: "Reroof", FOLDERLINK: null } }] }),
    });
    const result = await fetchVolusiaPermits("123 Main St, Daytona Beach");
    expect(result).toHaveLength(1);
    expect(result[0].permitNumber).toBe("P-1");
    expect(result[0].permitType).toBe("Roofing Permit");
  });
});
