/**
 * Integration tests — recurringService against the real ICP recurring canister.
 *
 * Requires: dfx start --background && make deploy
 * Run:      npm run test:integration  (from repo root)
 *
 * What these tests prove that unit tests cannot:
 *   - Candid IDL: RecurringServiceType Variant, Frequency Variant,
 *     ServiceStatus Variant, createdAt (Int ns→ms), VisitLog record
 *   - createRecurringService() stores contract and returns with non-empty id
 *   - All RecurringServiceType variants survive a Candid round-trip
 *   - All Frequency variants survive a Candid round-trip
 *   - getRecurringService(id) returns correct record; unknown id returns null
 *   - getByProperty(propertyId) returns only services for the queried property
 *   - updateStatus() transitions: Active → Paused → Cancelled
 *   - attachContractDoc() stores a doc reference
 *   - addVisitLog() appends a visit; getVisitLogs() returns all in order
 *   - Multiple visit logs accumulate (not overwritten)
 */

import { describe, it, expect, beforeAll } from "vitest";
import { recurringService } from "@/services/recurringService";
import { registerTestProperty } from "./helpers";
import type {
  RecurringService, RecurringServiceType, Frequency,
} from "@/services/recurringService";

const CANISTER_ID = (process.env as any).RECURRING_CANISTER_ID || "";
const deployed = !!CANISTER_ID;

const RUN_ID      = Date.now();
// Recurring services need write access to the property, so they go on one the
// test identity registers (beforeAll below).
let PROPERTY_ID = "";

const BASE = {
  propertyId:   "",   // set to PROPERTY_ID in beforeAll
  serviceType:  "PestControl" as RecurringServiceType,
  providerName: `Pest Pro ${RUN_ID}`,
  frequency:    "Quarterly" as Frequency,
  startDate:    "2025-01-01",
};

beforeAll(async () => {
  if (!deployed) return;
  PROPERTY_ID = await registerTestProperty("Recurring");
  BASE.propertyId = PROPERTY_ID;
});

// ─── createRecurringService — Candid serialization ───────────────────────────

describe.skipIf(!deployed)("createRecurringService — Candid serialization", () => {
  let svc: RecurringService;

  beforeAll(async () => {
    svc = await recurringService.create({
      ...BASE,
      providerLicense: `LIC-${RUN_ID}`,
      providerPhone:   "512-555-0100",
      notes:           "Annual contract",
    });
  });

  it("returns a non-empty id", () => {
    expect(svc.id).toBeTruthy();
  });

  it("propertyId is preserved", () => {
    expect(svc.propertyId).toBe(PROPERTY_ID);
  });

  it("serviceType round-trips through RecurringServiceType Variant", () => {
    expect(svc.serviceType).toBe("PestControl");
  });

  it("frequency round-trips through Frequency Variant", () => {
    expect(svc.frequency).toBe("Quarterly");
  });

  it("optional providerLicense is preserved", () => {
    expect(svc.providerLicense).toBe(`LIC-${RUN_ID}`);
  });

  it("status defaults to Active", () => {
    expect(svc.status).toBe("Active");
  });

  it("createdAt is a reasonable ms timestamp", () => {
    expect(svc.createdAt).toBeGreaterThan(Date.now() - 60_000);
    expect(svc.createdAt).toBeLessThan(Date.now() + 5_000);
  });
});

// ─── All RecurringServiceType variants ───────────────────────────────────────

describe.skipIf(!deployed)("RecurringServiceType — all variants survive Candid round-trip", () => {
  const TYPES: RecurringServiceType[] = [
    "LawnCare", "PestControl", "PoolMaintenance",
    "GutterCleaning", "PressureWashing", "Other",
  ];

  it.each(TYPES)("%s round-trips correctly", async (serviceType) => {
    const svc = await recurringService.create({
      ...BASE, serviceType, providerName: `${serviceType}-${RUN_ID}`,
    });
    expect(svc.serviceType).toBe(serviceType);
  }, 60_000);
});

// ─── All Frequency variants ───────────────────────────────────────────────────

describe.skipIf(!deployed)("Frequency — all variants survive Candid round-trip", () => {
  const FREQS: Frequency[] = [
    "Weekly", "BiWeekly", "Monthly", "Quarterly", "SemiAnnually", "Annually",
  ];

  it.each(FREQS)("%s round-trips correctly", async (frequency) => {
    const svc = await recurringService.create({
      ...BASE, frequency, providerName: `freq-${frequency}-${RUN_ID}`,
    });
    expect(svc.frequency).toBe(frequency);
  }, 60_000);
});

// ─── getRecurringService — by id ──────────────────────────────────────────────

describe.skipIf(!deployed)("getRecurringService — lookup by id", () => {
  let svcId: string;

  beforeAll(async () => {
    const svc = await recurringService.create({
      ...BASE, providerName: `Lookup ${RUN_ID}`,
    });
    svcId = svc.id;
  });

  it("returns the correct record by id", async () => {
    const found = await recurringService.getById(svcId);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(svcId);
  });

  it("returns null for an unknown id", async () => {
    const result = await recurringService.getById(`nonexistent-${RUN_ID}`);
    expect(result).toBeNull();
  });
});

// ─── getByProperty — entity scoping ──────────────────────────────────────────

describe.skipIf(!deployed)("getByProperty — entity scoping", () => {
  let svcId: string;

  beforeAll(async () => {
    const svc = await recurringService.create({
      ...BASE, providerName: `Scoped ${RUN_ID}`,
    });
    svcId = svc.id;
  });

  it("returns services for the queried property", async () => {
    const all = await recurringService.getByProperty(PROPERTY_ID);
    expect(all.some((s) => s.id === svcId)).toBe(true);
  });

  it("does not return services for a different property", async () => {
    const all = await recurringService.getByProperty(`other-${RUN_ID}`);
    expect(all.every((s) => s.id !== svcId)).toBe(true);
  });
});

// ─── updateStatus — state transitions ────────────────────────────────────────

describe.skipIf(!deployed)("updateStatus — Active → Paused → Cancelled", () => {
  let svcId: string;

  beforeAll(async () => {
    const svc = await recurringService.create({
      ...BASE, providerName: `Status ${RUN_ID}`,
    });
    svcId = svc.id;
  });

  it("can be paused", async () => {
    const updated = await recurringService.updateStatus(svcId, "Paused");
    expect(updated.status).toBe("Paused");
  });

  it("can be cancelled", async () => {
    const updated = await recurringService.updateStatus(svcId, "Cancelled");
    expect(updated.status).toBe("Cancelled");
  });
});

// ─── attachContractDoc ────────────────────────────────────────────────────────

describe.skipIf(!deployed)("attachContractDoc — stores doc reference on service", () => {
  it("contractDocPhotoId is set after attach", async () => {
    const svc = await recurringService.create({
      ...BASE, providerName: `Doc ${RUN_ID}`,
    });
    const photoId = `photo-${RUN_ID}`;
    const updated = await recurringService.attachContractDoc(svc.id, photoId);
    expect(updated.contractDocPhotoId).toBe(photoId);
  });
});

// ─── addVisitLog / getVisitLogs — accumulation ────────────────────────────────

describe.skipIf(!deployed)("addVisitLog & getVisitLogs — multiple visits accumulate", () => {
  let svcId: string;

  beforeAll(async () => {
    const svc = await recurringService.create({
      ...BASE, providerName: `Visits ${RUN_ID}`,
    });
    svcId = svc.id;
    await recurringService.addVisitLog(svcId, "2025-03-01", "First visit");
    await recurringService.addVisitLog(svcId, "2025-06-01", "Second visit");
    await recurringService.addVisitLog(svcId, "2025-09-01");
  });

  it("getVisitLogs returns all 3 entries", async () => {
    const logs = await recurringService.getVisitLogs(svcId);
    expect(logs.length).toBe(3);
  });

  it("visitDate is preserved for each log", async () => {
    const logs = await recurringService.getVisitLogs(svcId);
    const dates = logs.map((l) => l.visitDate).sort();
    expect(dates).toEqual(["2025-03-01", "2025-06-01", "2025-09-01"]);
  });

  it("optional note is preserved", async () => {
    const logs = await recurringService.getVisitLogs(svcId);
    const withNote = logs.filter((l) => l.note != null);
    expect(withNote.length).toBe(2);
  });

  it("logs have non-empty ids and correct serviceId", async () => {
    const logs = await recurringService.getVisitLogs(svcId);
    expect(logs.every((l) => l.id && l.serviceId === svcId)).toBe(true);
  });
});
