/**
 * publicRecordService — real logic worth locking down:
 *   - getByOwner filters properties and jobs to only those owned by the
 *     requested principal (the "dead man's switch" public-lookup surface)
 *   - an empty principal throws rather than returning an unfiltered dump
 */

import { describe, it, expect } from "vitest";
import { createPublicRecordService } from "@/services/publicRecordService";

const seed = {
  properties: [
    { id: "p1", address: "123 Main St", owner: "owner-a" },
    { id: "p2", address: "456 Oak Ave", owner: "owner-b" },
  ],
  jobs: [
    { id: "j1", propertyId: "p1", homeowner: "owner-a", serviceType: "HVAC" },
    { id: "j2", propertyId: "p2", homeowner: "owner-b", serviceType: "Roofing" },
    { id: "j3", propertyId: "p1", homeowner: "owner-a", serviceType: "Plumbing" },
  ],
};

describe("publicRecordService.getByOwner", () => {
  it("returns only the properties and jobs owned by the requested principal", async () => {
    const service = createPublicRecordService(seed);
    const result = await service.getByOwner("owner-a");

    expect(result.ownerPrincipal).toBe("owner-a");
    expect(result.properties).toEqual([seed.properties[0]]);
    expect(result.jobs).toEqual([seed.jobs[0], seed.jobs[2]]);
  });

  it("returns empty arrays for a principal with no records", async () => {
    const service = createPublicRecordService(seed);
    const result = await service.getByOwner("owner-nobody");

    expect(result.properties).toEqual([]);
    expect(result.jobs).toEqual([]);
  });

  it("stamps fetchedAt with the current time", async () => {
    const service = createPublicRecordService(seed);
    const before = Date.now();
    const result = await service.getByOwner("owner-a");
    expect(result.fetchedAt).toBeGreaterThanOrEqual(before);
  });

  it("rejects an empty principal", async () => {
    const service = createPublicRecordService(seed);
    await expect(service.getByOwner("")).rejects.toThrow("principal must not be empty");
  });

  it("defaults to an empty seed when none is provided", async () => {
    const service = createPublicRecordService();
    const result = await service.getByOwner("owner-a");
    expect(result.properties).toEqual([]);
    expect(result.jobs).toEqual([]);
  });
});
