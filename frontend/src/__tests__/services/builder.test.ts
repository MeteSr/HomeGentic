/**
 * TDD — 7.2: Builder / Developer Onboarding
 *
 * 7.2.2  Bulk property import
 * 7.2.3  Subcontractor record import
 * 7.2.4  Initiate first-buyer transfer
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  createBuilderService,
  type BulkPropertyRow,
  type SubcontractorJobRow,
  type BuilderDevelopment,
} from "@/services/builderService";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRow(overrides: Partial<BulkPropertyRow> = {}): BulkPropertyRow {
  return {
    address:      overrides.address      ?? "100 Main St",
    city:         overrides.city         ?? "Austin",
    state:        overrides.state        ?? "TX",
    zipCode:      overrides.zipCode      ?? "78701",
    propertyType: overrides.propertyType ?? "SingleFamily",
    yearBuilt:    overrides.yearBuilt    ?? 2022,
    squareFeet:   overrides.squareFeet   ?? 1800,
  };
}

function makeJobRow(overrides: Partial<SubcontractorJobRow> = {}): SubcontractorJobRow {
  return {
    propertyId:     overrides.propertyId     ?? "1",
    serviceType:    overrides.serviceType    ?? "HVAC",
    contractorName: overrides.contractorName ?? "Cool Air Inc",
    amountCents:    overrides.amountCents    ?? 120000,
    date:           overrides.date           ?? "2024-06-15",
    description:    overrides.description    ?? "HVAC installation",
    permitNumber:   overrides.permitNumber,
    warrantyMonths: overrides.warrantyMonths,
  };
}

// ── 7.2.2 Bulk property import ────────────────────────────────────────────────

describe("builderService.bulkImportProperties (7.2.2)", () => {
  let svc: ReturnType<typeof createBuilderService>;

  beforeEach(() => { svc = createBuilderService(); });

  it("imports a single row and returns its propertyId in succeeded", async () => {
    const result = await svc.bulkImportProperties([makeRow()]);
    expect(result.succeeded).toHaveLength(1);
    expect(typeof result.succeeded[0]).toBe("string");
    expect(result.failed).toHaveLength(0);
  });

  it("imports multiple rows and returns one id per row", async () => {
    const rows = [
      makeRow({ address: "101 Oak Ave" }),
      makeRow({ address: "102 Oak Ave" }),
      makeRow({ address: "103 Oak Ave" }),
    ];
    const result = await svc.bulkImportProperties(rows);
    expect(result.succeeded).toHaveLength(3);
    expect(result.failed).toHaveLength(0);
  });

  it("each succeeded id is unique", async () => {
    const rows = [makeRow({ address: "1 A St" }), makeRow({ address: "2 B St" })];
    const { succeeded } = await svc.bulkImportProperties(rows);
    expect(new Set(succeeded).size).toBe(2);
  });

  it("rejects duplicate address within the same batch", async () => {
    const rows = [makeRow({ address: "Same St" }), makeRow({ address: "Same St" })];
    const result = await svc.bulkImportProperties(rows);
    expect(result.succeeded).toHaveLength(1);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].index).toBe(1);
    expect(result.failed[0].reason).toMatch(/duplicate/i);
  });

  it("rejects address already registered in a previous import", async () => {
    await svc.bulkImportProperties([makeRow({ address: "Taken Rd" })]);
    const result = await svc.bulkImportProperties([makeRow({ address: "Taken Rd" })]);
    expect(result.succeeded).toHaveLength(0);
    expect(result.failed).toHaveLength(1);
  });

  it("returns empty arrays for empty input", async () => {
    const result = await svc.bulkImportProperties([]);
    expect(result.succeeded).toHaveLength(0);
    expect(result.failed).toHaveLength(0);
  });

  it("failed entry includes the 0-based row index", async () => {
    const rows = [
      makeRow({ address: "Unique A" }),
      makeRow({ address: "Dupe" }),
      makeRow({ address: "Dupe" }),
    ];
    const result = await svc.bulkImportProperties(rows);
    expect(result.failed[0].index).toBe(2);
  });
});

// ── 7.2.2 CSV parser ──────────────────────────────────────────────────────────

describe("builderService.parsePropertiesCsv (7.2.2)", () => {
  let svc: ReturnType<typeof createBuilderService>;
  beforeEach(() => { svc = createBuilderService(); });

  const HEADER = "address,city,state,zipCode,propertyType,yearBuilt,squareFeet";

  it("parses a single data row", () => {
    const csv = `${HEADER}\n123 Elm St,Dallas,TX,75201,SingleFamily,2020,2200`;
    const rows = svc.parsePropertiesCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].address).toBe("123 Elm St");
    expect(rows[0].city).toBe("Dallas");
    expect(rows[0].yearBuilt).toBe(2020);
    expect(rows[0].squareFeet).toBe(2200);
  });

  it("parses multiple data rows", () => {
    const csv = [
      HEADER,
      "1 A St,City,TX,78701,SingleFamily,2021,1500",
      "2 B St,City,TX,78702,Condo,2022,900",
    ].join("\n");
    expect(svc.parsePropertiesCsv(csv)).toHaveLength(2);
  });

  it("skips blank lines", () => {
    const csv = `${HEADER}\n1 A St,City,TX,78701,SingleFamily,2021,1500\n\n`;
    expect(svc.parsePropertiesCsv(csv)).toHaveLength(1);
  });

  it("throws on missing required column", () => {
    const csv = "address,city,state\n1 A St,City,TX";
    expect(() => svc.parsePropertiesCsv(csv)).toThrow();
  });
});

// ── 7.2.3 Subcontractor record import ─────────────────────────────────────────

describe("builderService.importSubcontractorJobs (7.2.3)", () => {
  let svc: ReturnType<typeof createBuilderService>;
  beforeEach(() => { svc = createBuilderService(); });

  it("imports a single job row and returns its jobId in succeeded", async () => {
    const result = await svc.importSubcontractorJobs([makeJobRow()]);
    expect(result.succeeded).toHaveLength(1);
    expect(typeof result.succeeded[0]).toBe("string");
    expect(result.failed).toHaveLength(0);
  });

  it("imports multiple job rows", async () => {
    const rows = [
      makeJobRow({ serviceType: "HVAC" }),
      makeJobRow({ serviceType: "Plumbing" }),
      makeJobRow({ serviceType: "Electrical" }),
    ];
    const result = await svc.importSubcontractorJobs(rows);
    expect(result.succeeded).toHaveLength(3);
  });

  it("each succeeded jobId is unique", async () => {
    const rows = [makeJobRow({ serviceType: "HVAC" }), makeJobRow({ serviceType: "Roofing" })];
    const { succeeded } = await svc.importSubcontractorJobs(rows);
    expect(new Set(succeeded).size).toBe(2);
  });

  it("imported jobs are pre-verified (builder attests)", async () => {
    const result = await svc.importSubcontractorJobs([makeJobRow()]);
    const jobs = svc.getImportedJobs(result.succeeded[0]);
    expect(jobs?.verified).toBe(true);
  });

  it("returns empty arrays for empty input", async () => {
    const result = await svc.importSubcontractorJobs([]);
    expect(result.succeeded).toHaveLength(0);
    expect(result.failed).toHaveLength(0);
  });

  it("fails row with missing contractorName", async () => {
    const row = makeJobRow({ contractorName: "" });
    const result = await svc.importSubcontractorJobs([row]);
    expect(result.succeeded).toHaveLength(0);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].reason).toMatch(/contractor/i);
  });

  it("fails row with non-positive amount", async () => {
    const row = makeJobRow({ amountCents: 0 });
    const result = await svc.importSubcontractorJobs([row]);
    expect(result.failed).toHaveLength(1);
  });
});

// ── 7.2.3 Jobs CSV parser ─────────────────────────────────────────────────────

describe("builderService.parseJobsCsv (7.2.3)", () => {
  let svc: ReturnType<typeof createBuilderService>;
  beforeEach(() => { svc = createBuilderService(); });

  const HEADER = "propertyId,serviceType,contractorName,amountCents,date,description";

  it("parses a single job row", () => {
    const csv = `${HEADER}\n42,HVAC,Cool Air,150000,2024-03-15,Full HVAC install`;
    const rows = svc.parseJobsCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].propertyId).toBe("42");
    expect(rows[0].amountCents).toBe(150000);
    expect(rows[0].contractorName).toBe("Cool Air");
  });

  it("parses optional permitNumber and warrantyMonths", () => {
    const headerFull = `${HEADER},permitNumber,warrantyMonths`;
    const csv = `${headerFull}\n42,HVAC,Cool Air,150000,2024-03-15,Install,PERMIT-001,24`;
    const [row] = svc.parseJobsCsv(csv);
    expect(row.permitNumber).toBe("PERMIT-001");
    expect(row.warrantyMonths).toBe(24);
  });

  it("throws on missing required column", () => {
    const csv = "propertyId,serviceType\n42,HVAC";
    expect(() => svc.parseJobsCsv(csv)).toThrow();
  });
});

// ── 7.2.4 Initiate first-buyer transfer ──────────────────────────────────────

describe("builderService.initiateFirstBuyerTransfer (7.2.4)", () => {
  let svc: ReturnType<typeof createBuilderService>;
  beforeEach(() => { svc = createBuilderService(); });

  it("records a pending transfer for the property", async () => {
    await svc.initiateFirstBuyerTransfer("prop-1", "buyer-principal-abc");
    const dev = svc.getDevelopmentSync("prop-1");
    expect(dev?.pendingTransfer?.buyerPrincipal).toBe("buyer-principal-abc");
  });

  it("returns the pending transfer record", async () => {
    const transfer = await svc.initiateFirstBuyerTransfer("prop-2", "buyer-xyz");
    expect(transfer.propertyId).toBe("prop-2");
    expect(transfer.buyerPrincipal).toBe("buyer-xyz");
    expect(typeof transfer.initiatedAt).toBe("number");
  });

  it("overwrites an existing pending transfer with a new one", async () => {
    await svc.initiateFirstBuyerTransfer("prop-3", "buyer-old");
    await svc.initiateFirstBuyerTransfer("prop-3", "buyer-new");
    const dev = svc.getDevelopmentSync("prop-3");
    expect(dev?.pendingTransfer?.buyerPrincipal).toBe("buyer-new");
  });

  it("cancelFirstBuyerTransfer removes the pending transfer", async () => {
    await svc.initiateFirstBuyerTransfer("prop-4", "buyer-xyz");
    svc.cancelFirstBuyerTransfer("prop-4");
    const dev = svc.getDevelopmentSync("prop-4");
    expect(dev?.pendingTransfer).toBeUndefined();
  });
});

// ── 7.2.5 getDevelopments ─────────────────────────────────────────────────────

describe("builderService.getDevelopments (7.2.5)", () => {
  let svc: ReturnType<typeof createBuilderService>;
  beforeEach(() => { svc = createBuilderService(); });

  it("returns empty array when no properties imported", async () => {
    const devs = await svc.getDevelopments();
    expect(devs).toHaveLength(0);
  });

  it("returns one development per imported property", async () => {
    await svc.bulkImportProperties([
      makeRow({ address: "1 Dev Rd" }),
      makeRow({ address: "2 Dev Rd" }),
    ]);
    const devs = await svc.getDevelopments();
    expect(devs).toHaveLength(2);
  });

  it("development includes address, city, state, zipCode", async () => {
    await svc.bulkImportProperties([makeRow({ address: "42 Garden St", city: "Houston" })]);
    const [dev] = await svc.getDevelopments();
    expect(dev.address).toBe("42 Garden St");
    expect(dev.city).toBe("Houston");
  });

  it("development includes jobCount reflecting imported jobs", async () => {
    const { succeeded: [propId] } = await svc.bulkImportProperties([makeRow({ address: "3 Dev Rd" })]);
    await svc.importSubcontractorJobs([
      makeJobRow({ propertyId: propId }),
      makeJobRow({ propertyId: propId, serviceType: "Roofing" }),
    ]);
    const devs = await svc.getDevelopments();
    expect(devs[0].jobCount).toBe(2);
  });

  it("development includes pendingTransfer when one is set", async () => {
    const { succeeded: [propId] } = await svc.bulkImportProperties([makeRow({ address: "4 Dev Rd" })]);
    await svc.initiateFirstBuyerTransfer(propId, "buyer-principal");
    const devs = await svc.getDevelopments();
    expect(devs[0].pendingTransfer?.buyerPrincipal).toBe("buyer-principal");
  });
});
