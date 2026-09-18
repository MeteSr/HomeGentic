/**
 * builderService — real logic worth locking down:
 *   - bulkImportProperties rejects duplicate addresses (existing and within-batch)
 *   - parsePropertiesCsv/parseJobsCsv parse headers and throw on missing columns
 *   - importSubcontractorJobs validates contractorName and a positive amount
 *   - getDevelopments aggregates job counts and pending transfers per property
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createBuilderService } from "@/services/builderService";

describe("builderService.bulkImportProperties", () => {
  let service: ReturnType<typeof createBuilderService>;
  beforeEach(() => { service = createBuilderService(); });

  function row(overrides: Record<string, unknown> = {}) {
    return { address: "1 Main St", city: "Austin", state: "TX", zipCode: "78701", propertyType: "SingleFamily", yearBuilt: 2020, squareFeet: 2000, ...overrides };
  }

  it("imports distinct properties successfully", async () => {
    const result = await service.bulkImportProperties([row(), row({ address: "2 Main St" })]);
    expect(result.succeeded).toHaveLength(2);
    expect(result.failed).toHaveLength(0);
  });

  it("rejects a duplicate address within the same batch", async () => {
    const result = await service.bulkImportProperties([row(), row()]);
    expect(result.succeeded).toHaveLength(1);
    expect(result.failed).toEqual([{ index: 1, reason: "DuplicateAddress" }]);
  });

  it("rejects a duplicate address already imported previously", async () => {
    await service.bulkImportProperties([row()]);
    const result = await service.bulkImportProperties([row()]);
    expect(result.failed).toEqual([{ index: 0, reason: "DuplicateAddress" }]);
  });
});

describe("builderService.parsePropertiesCsv", () => {
  it("parses valid CSV rows", () => {
    const service = createBuilderService();
    const csv = "address,city,state,zipCode,propertyType,yearBuilt,squareFeet\n1 Main St,Austin,TX,78701,SingleFamily,2020,2000";
    const rows = service.parsePropertiesCsv(csv);
    expect(rows).toEqual([{ address: "1 Main St", city: "Austin", state: "TX", zipCode: "78701", propertyType: "SingleFamily", yearBuilt: 2020, squareFeet: 2000 }]);
  });

  it("throws when a required column is missing", () => {
    const service = createBuilderService();
    expect(() => service.parsePropertiesCsv("address,city\n1 Main St,Austin")).toThrow("CSV missing required column: state");
  });

  it("returns an empty array for empty input", () => {
    expect(createBuilderService().parsePropertiesCsv("")).toEqual([]);
  });
});

describe("builderService.importSubcontractorJobs", () => {
  it("rejects a missing contractorName", async () => {
    const service = createBuilderService();
    const result = await service.importSubcontractorJobs([{ propertyId: "p1", serviceType: "HVAC", contractorName: "", amountCents: 1000, date: "2024-01-01", description: "d" }]);
    expect(result.failed).toEqual([{ index: 0, reason: "contractorName is required" }]);
  });

  it("rejects a non-positive amount", async () => {
    const service = createBuilderService();
    const result = await service.importSubcontractorJobs([{ propertyId: "p1", serviceType: "HVAC", contractorName: "Acme", amountCents: 0, date: "2024-01-01", description: "d" }]);
    expect(result.failed).toEqual([{ index: 0, reason: "amountCents must be positive" }]);
  });

  it("succeeds for a valid row", async () => {
    const service = createBuilderService();
    const result = await service.importSubcontractorJobs([{ propertyId: "p1", serviceType: "HVAC", contractorName: "Acme", amountCents: 5000, date: "2024-01-01", description: "d" }]);
    expect(result.succeeded).toHaveLength(1);
  });
});

describe("builderService.parseJobsCsv", () => {
  it("throws when a required column is missing", () => {
    const service = createBuilderService();
    expect(() => service.parseJobsCsv("propertyId,serviceType\np1,HVAC")).toThrow(/CSV missing required column/);
  });

  it("parses optional permitNumber and warrantyMonths columns", () => {
    const service = createBuilderService();
    const csv = "propertyId,serviceType,contractorName,amountCents,date,description,permitNumber,warrantyMonths\np1,HVAC,Acme,5000,2024-01-01,d,P-1,24";
    const rows = service.parseJobsCsv(csv);
    expect(rows[0]).toMatchObject({ permitNumber: "P-1", warrantyMonths: 24 });
  });
});

describe("builderService.getDevelopments / transfers", () => {
  it("aggregates job count and pending transfer for each imported property", async () => {
    const service = createBuilderService();
    const { succeeded } = await service.bulkImportProperties([{ address: "1 Main St", city: "Austin", state: "TX", zipCode: "78701", propertyType: "SingleFamily", yearBuilt: 2020, squareFeet: 2000 }]);
    const propertyId = succeeded[0];

    await service.importSubcontractorJobs([{ propertyId, serviceType: "HVAC", contractorName: "Acme", amountCents: 5000, date: "2024-01-01", description: "d" }]);
    await service.initiateFirstBuyerTransfer(propertyId, "buyer-principal");

    const developments = await service.getDevelopments();
    expect(developments).toHaveLength(1);
    expect(developments[0].jobCount).toBe(1);
    expect(developments[0].pendingTransfer?.buyerPrincipal).toBe("buyer-principal");
  });

  it("cancelFirstBuyerTransfer removes the pending transfer", async () => {
    const service = createBuilderService();
    const { succeeded } = await service.bulkImportProperties([{ address: "1 Main St", city: "Austin", state: "TX", zipCode: "78701", propertyType: "SingleFamily", yearBuilt: 2020, squareFeet: 2000 }]);
    const propertyId = succeeded[0];

    await service.initiateFirstBuyerTransfer(propertyId, "buyer-principal");
    service.cancelFirstBuyerTransfer(propertyId);

    const dev = service.getDevelopmentSync(propertyId);
    expect(dev?.pendingTransfer).toBeUndefined();
  });
});
