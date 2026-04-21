/**
 * Tests for recurringService.ts — exercised via a stateful mock actor.
 *
 * We use vi.resetModules() + dynamic imports to get a fresh module per describe
 * block, with a patchRecurringService() helper that adds in-memory behavior.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type {
  RecurringService,
  CreateRecurringServiceInput,
  VisitLog,
} from "@/services/recurringService";

// ─── Mock ICP deps ────────────────────────────────────────────────────────────

vi.mock("@/services/actor", () => ({
  getAgent: vi.fn().mockResolvedValue({}),
}));
vi.mock("@icp-sdk/core/agent", () => ({
  Actor: { createActor: vi.fn(() => ({})) },
}));

// ─── In-memory patch helper ───────────────────────────────────────────────────

function patchRecurringService(svc: any): void {
  const services: RecurringService[] = [];
  const visits:   VisitLog[]         = [];
  let svcCounter = 0;
  let visCounter = 0;

  svc.create = async (input: CreateRecurringServiceInput): Promise<RecurringService> => {
    svcCounter++;
    const service: RecurringService = {
      id:                 `svc-${svcCounter}`,
      propertyId:         input.propertyId,
      homeowner:          "local",
      serviceType:        input.serviceType,
      providerName:       input.providerName,
      providerLicense:    input.providerLicense,
      providerPhone:      input.providerPhone,
      frequency:          input.frequency,
      startDate:          input.startDate,
      contractEndDate:    input.contractEndDate,
      notes:              input.notes,
      status:             "Active",
      createdAt:          Date.now(),
    };
    services.push(service);
    return service;
  };

  svc.getById = async (serviceId: string): Promise<RecurringService | null> => {
    return services.find((s) => s.id === serviceId) ?? null;
  };

  svc.getByProperty = async (propertyId: string): Promise<RecurringService[]> => {
    return services.filter((s) => s.propertyId === propertyId);
  };

  svc.updateStatus = async (serviceId: string, status: string): Promise<RecurringService> => {
    const service = services.find((s) => s.id === serviceId);
    if (!service) throw new Error("Service not found");
    (service as any).status = status;
    return service;
  };

  svc.attachContractDoc = async (serviceId: string, photoId: string): Promise<RecurringService> => {
    const service = services.find((s) => s.id === serviceId);
    if (!service) throw new Error("Service not found");
    (service as any).contractDocPhotoId = photoId;
    return service;
  };

  svc.addVisitLog = async (serviceId: string, visitDate: string, note?: string): Promise<VisitLog> => {
    const service = services.find((s) => s.id === serviceId);
    if (!service) throw new Error("Service not found");
    visCounter++;
    const log: VisitLog = {
      id:         `visit-${visCounter}`,
      serviceId,
      propertyId: service.propertyId,
      visitDate,
      note,
      createdAt:  Date.now(),
    };
    visits.push(log);
    return log;
  };

  svc.getVisitLogs = async (serviceId: string): Promise<VisitLog[]> => {
    return [...visits.filter((v) => v.serviceId === serviceId)]
      .sort((a, b) => b.visitDate.localeCompare(a.visitDate));
  };

  svc.reset = () => {
    services.length = 0;
    visits.length = 0;
    svcCounter = 0;
    visCounter = 0;
  };
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeInput(overrides: Partial<CreateRecurringServiceInput> = {}): CreateRecurringServiceInput {
  return {
    propertyId:   "prop-1",
    serviceType:  "LawnCare",
    providerName: "GreenThumb Co.",
    frequency:    "Monthly",
    startDate:    "2025-01-01",
    ...overrides,
  };
}

function makeService(overrides: Partial<RecurringService> = {}): RecurringService {
  return {
    id:           "svc-1",
    propertyId:   "prop-1",
    homeowner:    "mock-principal",
    serviceType:  "LawnCare",
    providerName: "GreenThumb Co.",
    frequency:    "Monthly",
    startDate:    "2025-01-01",
    status:       "Active",
    createdAt:    1_700_000_000_000,
    ...overrides,
  };
}

function makeVisit(overrides: Partial<VisitLog> = {}): VisitLog {
  return {
    id:         "v-1",
    serviceId:  "svc-1",
    propertyId: "prop-1",
    visitDate:  "2025-06-01",
    createdAt:  1_700_000_000_000,
    ...overrides,
  };
}

// ─── create / getByProperty / getById ─────────────────────────────────────────

describe("create / getByProperty / getById", () => {
  let svc: typeof import("@/services/recurringService");

  beforeEach(async () => {
    vi.resetModules();
    svc = await import("@/services/recurringService");
    patchRecurringService(svc.recurringService);
  });

  it("create() returns a service with Active status", async () => {
    const result = await svc.recurringService.create(makeInput());
    expect(result.status).toBe("Active");
    expect(result.serviceType).toBe("LawnCare");
    expect(result.providerName).toBe("GreenThumb Co.");
    expect(result.id).toBeTruthy();
  });

  it("create() sets optional fields when provided", async () => {
    const result = await svc.recurringService.create(makeInput({
      providerLicense: "LIC-123",
      providerPhone:   "512-555-0100",
      notes:           "Side gate code: 4321",
      contractEndDate: "2026-01-01",
    }));
    expect(result.providerLicense).toBe("LIC-123");
    expect(result.providerPhone).toBe("512-555-0100");
    expect(result.notes).toBe("Side gate code: 4321");
    expect(result.contractEndDate).toBe("2026-01-01");
  });

  it("getByProperty() returns only matching services", async () => {
    await svc.recurringService.create(makeInput({ propertyId: "prop-A" }));
    await svc.recurringService.create(makeInput({ propertyId: "prop-A" }));
    await svc.recurringService.create(makeInput({ propertyId: "prop-B" }));
    const results = await svc.recurringService.getByProperty("prop-A");
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.propertyId === "prop-A")).toBe(true);
  });

  it("getByProperty() returns empty array for unknown property", async () => {
    const results = await svc.recurringService.getByProperty("prop-unknown");
    expect(results).toHaveLength(0);
  });

  it("getById() finds a created service", async () => {
    const created = await svc.recurringService.create(makeInput());
    const found = await svc.recurringService.getById(created.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(created.id);
  });

  it("getById() returns null for unknown id", async () => {
    expect(await svc.recurringService.getById("no-such-id")).toBeNull();
  });
});

// ─── updateStatus ─────────────────────────────────────────────────────────────

describe("updateStatus", () => {
  let svc: typeof import("@/services/recurringService");

  beforeEach(async () => {
    vi.resetModules();
    svc = await import("@/services/recurringService");
    patchRecurringService(svc.recurringService);
  });

  it("transitions Active → Paused", async () => {
    const created = await svc.recurringService.create(makeInput());
    const updated = await svc.recurringService.updateStatus(created.id, "Paused");
    expect(updated.status).toBe("Paused");
  });

  it("transitions Active → Cancelled", async () => {
    const created = await svc.recurringService.create(makeInput());
    const updated = await svc.recurringService.updateStatus(created.id, "Cancelled");
    expect(updated.status).toBe("Cancelled");
  });

  it("persists the status change on subsequent getById", async () => {
    const created = await svc.recurringService.create(makeInput());
    await svc.recurringService.updateStatus(created.id, "Paused");
    const found = await svc.recurringService.getById(created.id);
    expect(found?.status).toBe("Paused");
  });

  it("throws when service not found", async () => {
    await expect(
      svc.recurringService.updateStatus("bad-id", "Paused")
    ).rejects.toThrow("Service not found");
  });
});

// ─── attachContractDoc ────────────────────────────────────────────────────────

describe("attachContractDoc", () => {
  let svc: typeof import("@/services/recurringService");

  beforeEach(async () => {
    vi.resetModules();
    svc = await import("@/services/recurringService");
    patchRecurringService(svc.recurringService);
  });

  it("sets contractDocPhotoId on the service", async () => {
    const created = await svc.recurringService.create(makeInput());
    const updated = await svc.recurringService.attachContractDoc(created.id, "photo-42");
    expect(updated.contractDocPhotoId).toBe("photo-42");
  });

  it("throws when service not found", async () => {
    await expect(
      svc.recurringService.attachContractDoc("bad-id", "photo-1")
    ).rejects.toThrow("Service not found");
  });
});

// ─── addVisitLog / getVisitLogs ───────────────────────────────────────────────

describe("addVisitLog / getVisitLogs", () => {
  let svc: typeof import("@/services/recurringService");

  beforeEach(async () => {
    vi.resetModules();
    svc = await import("@/services/recurringService");
    patchRecurringService(svc.recurringService);
  });

  it("addVisitLog() returns a VisitLog with correct fields", async () => {
    const created = await svc.recurringService.create(makeInput());
    const log = await svc.recurringService.addVisitLog(created.id, "2025-06-15", "All good");
    expect(log.serviceId).toBe(created.id);
    expect(log.visitDate).toBe("2025-06-15");
    expect(log.note).toBe("All good");
  });

  it("addVisitLog() works without a note", async () => {
    const created = await svc.recurringService.create(makeInput());
    const log = await svc.recurringService.addVisitLog(created.id, "2025-07-01");
    expect(log.note).toBeUndefined();
  });

  it("addVisitLog() throws when service not found", async () => {
    await expect(
      svc.recurringService.addVisitLog("bad-id", "2025-06-01")
    ).rejects.toThrow("Service not found");
  });

  it("getVisitLogs() returns logs sorted newest-first", async () => {
    const created = await svc.recurringService.create(makeInput());
    await svc.recurringService.addVisitLog(created.id, "2025-04-01");
    await svc.recurringService.addVisitLog(created.id, "2025-06-01");
    await svc.recurringService.addVisitLog(created.id, "2025-05-01");
    const logs = await svc.recurringService.getVisitLogs(created.id);
    expect(logs[0].visitDate).toBe("2025-06-01");
    expect(logs[1].visitDate).toBe("2025-05-01");
    expect(logs[2].visitDate).toBe("2025-04-01");
  });

  it("getVisitLogs() returns empty for a service with no logs", async () => {
    const created = await svc.recurringService.create(makeInput());
    expect(await svc.recurringService.getVisitLogs(created.id)).toHaveLength(0);
  });
});

// ─── toSummary ────────────────────────────────────────────────────────────────

describe("toSummary", () => {
  // toSummary is a pure function — no module reset needed
  let toSummary: typeof import("@/services/recurringService")["recurringService"]["toSummary"];

  beforeEach(async () => {
    vi.resetModules();
    const svc = await import("@/services/recurringService");
    toSummary = svc.recurringService.toSummary.bind(svc.recurringService);
  });

  it("maps service type and frequency to human labels", () => {
    const summary = toSummary(makeService({ serviceType: "PestControl", frequency: "Quarterly" }), []);
    expect(summary.serviceType).toBe("Pest Control");
    expect(summary.frequency).toBe("Quarterly");
  });

  it("returns totalVisits count", () => {
    const visits = [makeVisit(), makeVisit({ id: "v-2", visitDate: "2025-07-01" })];
    const summary = toSummary(makeService(), visits);
    expect(summary.totalVisits).toBe(2);
  });

  it("picks the newest visitDate as lastVisitDate", () => {
    const visits = [
      makeVisit({ visitDate: "2025-03-01" }),
      makeVisit({ id: "v-2", visitDate: "2025-09-01" }),
      makeVisit({ id: "v-3", visitDate: "2025-06-01" }),
    ];
    const summary = toSummary(makeService(), visits);
    expect(summary.lastVisitDate).toBe("2025-09-01");
  });

  it("lastVisitDate is undefined when no visits", () => {
    const summary = toSummary(makeService(), []);
    expect(summary.lastVisitDate).toBeUndefined();
  });

  it("copies status and startDate directly", () => {
    const summary = toSummary(makeService({ status: "Paused", startDate: "2024-03-15" }), []);
    expect(summary.status).toBe("Paused");
    expect(summary.startDate).toBe("2024-03-15");
  });

  it("handles all six service types", async () => {
    const { SERVICE_TYPE_LABELS } = await import("@/services/recurringService");
    for (const [key, label] of Object.entries(SERVICE_TYPE_LABELS) as [any, string][]) {
      const summary = toSummary(makeService({ serviceType: key }), []);
      expect(summary.serviceType).toBe(label);
    }
  });

  it("handles all six frequencies", async () => {
    const { FREQUENCY_LABELS } = await import("@/services/recurringService");
    for (const [key, label] of Object.entries(FREQUENCY_LABELS) as [any, string][]) {
      const summary = toSummary(makeService({ frequency: key }), []);
      expect(summary.frequency).toBe(label);
    }
  });
});
