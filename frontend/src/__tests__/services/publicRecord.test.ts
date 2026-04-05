/**
 * TDD — 3.3.2: Public Read Query
 *
 * publicRecordService allows unauthenticated lookup of any homeowner's
 * properties and jobs given their principal. This is the "dead man's switch"
 * — records are readable by anyone even if HomeGentic shuts down.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createPublicRecordService } from "@/services/publicRecordService";

describe("publicRecordService.getByOwner (3.3.2)", () => {
  let svc: ReturnType<typeof createPublicRecordService>;

  beforeEach(() => { svc = createPublicRecordService(); });

  it("returns an object with properties and jobs arrays", async () => {
    const r = await svc.getByOwner("abc-principal-123");
    expect(Array.isArray(r.properties)).toBe(true);
    expect(Array.isArray(r.jobs)).toBe(true);
  });

  it("returns empty arrays for an unknown principal", async () => {
    const r = await svc.getByOwner("unknown-principal-xyz");
    expect(r.properties).toHaveLength(0);
    expect(r.jobs).toHaveLength(0);
  });

  it("result includes the queried principal", async () => {
    const r = await svc.getByOwner("test-principal");
    expect(r.ownerPrincipal).toBe("test-principal");
  });

  it("result has a fetchedAt timestamp", async () => {
    const before = Date.now();
    const r = await svc.getByOwner("test-principal");
    expect(r.fetchedAt).toBeGreaterThanOrEqual(before);
  });

  it("seeded mock data is returned for the correct principal", async () => {
    const svcWithData = createPublicRecordService({
      properties: [{ id: "1", address: "100 Elm St", owner: "owner-1" }],
      jobs:       [{ id: "j1", propertyId: "1", homeowner: "owner-1", serviceType: "HVAC" }],
    });
    const r = await svcWithData.getByOwner("owner-1");
    expect(r.properties).toHaveLength(1);
    expect(r.jobs).toHaveLength(1);
  });

  it("does not return another owner's records", async () => {
    const svcWithData = createPublicRecordService({
      properties: [{ id: "1", address: "100 Elm St", owner: "owner-A" }],
      jobs:       [{ id: "j1", propertyId: "1", homeowner: "owner-A", serviceType: "HVAC" }],
    });
    const r = await svcWithData.getByOwner("owner-B");
    expect(r.properties).toHaveLength(0);
    expect(r.jobs).toHaveLength(0);
  });

  it("returns multiple properties for the same owner", async () => {
    const svcWithData = createPublicRecordService({
      properties: [
        { id: "1", address: "100 Elm St", owner: "owner-1" },
        { id: "2", address: "200 Oak Ave", owner: "owner-1" },
        { id: "3", address: "999 Other Rd", owner: "owner-2" },
      ],
      jobs: [],
    });
    const r = await svcWithData.getByOwner("owner-1");
    expect(r.properties).toHaveLength(2);
  });
});

describe("publicRecordService — empty principal guard (3.3.2)", () => {
  let svc: ReturnType<typeof createPublicRecordService>;
  beforeEach(() => { svc = createPublicRecordService(); });

  it("throws for empty principal string", async () => {
    await expect(svc.getByOwner("")).rejects.toThrow();
  });
});
