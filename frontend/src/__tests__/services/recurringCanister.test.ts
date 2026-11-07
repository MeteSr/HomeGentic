/**
 * recurringService against the canister (test-gap audit 2026-11-03, M2):
 * opt encoding, record decoding, typed errors, and the batch schedule call
 * with its per-property fallback.
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";

const a = {
  getRecurringService: vi.fn(),
  getByProperty: vi.fn(),
  getScheduleForProperties: vi.fn(),
  createRecurringService: vi.fn(),
  updateStatus: vi.fn(),
  attachContractDoc: vi.fn(),
  addVisitLog: vi.fn(),
  getVisitLogs: vi.fn(),
};
vi.mock("@/services/actor", () => ({ getAgent: vi.fn().mockResolvedValue({}) }));
vi.mock("@icp-sdk/core/agent", () => ({ Actor: { createActor: vi.fn(() => a) }, HttpAgent: vi.fn() }));

const NS = 1_000_000n;
function rawService(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    propertyId: "p1",
    homeowner: { toText: () => "owner" },
    serviceType: { PestControl: null },
    providerName: "BugBusters",
    providerLicense: [],
    providerPhone: ["407-555-0101"],
    frequency: { Quarterly: null },
    startDate: "2026-01-01",
    contractEndDate: [],
    notes: [],
    status: { Active: null },
    contractDocPhotoId: [],
    createdAt: 4_000n * NS,
    ...extra,
  };
}
const rawVisit = (id: string, serviceId: string, date: string) => ({
  id,
  serviceId,
  propertyId: "p1",
  visitDate: date,
  note: [],
  createdAt: 1n * NS,
});

let recurringService: typeof import("@/services/recurringService").recurringService;
let hasErrorCode: typeof import("@/services/candid").hasErrorCode;

beforeAll(async () => {
  vi.stubEnv("RECURRING_CANISTER_ID", "aaaaa-aaaaa-aaaaa-aaaaa-cai");
  vi.resetModules();
  recurringService = (await import("@/services/recurringService")).recurringService;
  ({ hasErrorCode } = await import("@/services/candid"));
});
afterAll(() => vi.unstubAllEnvs());
beforeEach(() => {
  vi.clearAllMocks();
  recurringService.reset();
});

describe("create", () => {
  it("encodes variants and leaves blank optional fields as empty opts", async () => {
    a.createRecurringService.mockResolvedValue({ ok: rawService("s1") });
    const s = await recurringService.create({
      propertyId: "p1",
      serviceType: "PestControl",
      providerName: "BugBusters",
      providerPhone: "407-555-0101",
      frequency: "Quarterly",
      startDate: "2026-01-01",
    });
    expect(a.createRecurringService).toHaveBeenCalledWith(
      "p1",
      { PestControl: null },
      "BugBusters",
      [],
      ["407-555-0101"],
      { Quarterly: null },
      "2026-01-01",
      [],
      [],
    );
    expect(s).toMatchObject({
      id: "s1",
      homeowner: "owner",
      providerPhone: "407-555-0101",
      providerLicense: undefined,
      status: "Active",
      createdAt: 4_000,
    });
  });

  it("throws the canister's typed error", async () => {
    a.createRecurringService.mockResolvedValue({ err: { InvalidInput: "Start date must be YYYY-MM-DD." } });
    const err = await recurringService
      .create({ propertyId: "p1", serviceType: "Other", providerName: "x", frequency: "Weekly", startDate: "bad" })
      .catch((e) => e);
    expect(hasErrorCode(err, "InvalidInput")).toBe(true);
    expect(err.message).toBe("Start date must be YYYY-MM-DD.");
  });
});

describe("getById", () => {
  it("decodes the service", async () => {
    a.getRecurringService.mockResolvedValue({ ok: rawService("s1", { contractDocPhotoId: ["ph1"] }) });
    expect((await recurringService.getById("s1"))?.contractDocPhotoId).toBe("ph1");
  });

  it("returns null for NotFound", async () => {
    a.getRecurringService.mockResolvedValue({ err: { NotFound: null } });
    expect(await recurringService.getById("gone")).toBeNull();
  });

  it("throws on an outage instead of reporting the service missing", async () => {
    a.getRecurringService.mockResolvedValue({ err: { Paused: null } });
    expect(hasErrorCode(await recurringService.getById("s1").catch((e) => e), "Paused")).toBe(true);
  });
});

describe("updates", () => {
  it("updateStatus, attachContractDoc and addVisitLog pass their arguments through", async () => {
    a.updateStatus.mockResolvedValue({ ok: rawService("s1", { status: { Paused: null } }) });
    a.attachContractDoc.mockResolvedValue({ ok: rawService("s1", { contractDocPhotoId: ["ph9"] }) });
    a.addVisitLog.mockResolvedValue({ ok: { ...rawVisit("v1", "s1", "2026-02-01"), note: ["sprayed"] } });
    expect((await recurringService.updateStatus("s1", "Paused")).status).toBe("Paused");
    expect(a.updateStatus).toHaveBeenCalledWith("s1", { Paused: null });
    expect((await recurringService.attachContractDoc("s1", "ph9")).contractDocPhotoId).toBe("ph9");
    expect(await recurringService.addVisitLog("s1", "2026-02-01", "sprayed")).toMatchObject({
      id: "v1",
      note: "sprayed",
    });
    expect(a.addVisitLog).toHaveBeenCalledWith("s1", "2026-02-01", ["sprayed"]);
  });

  it("addVisitLog without a note sends an empty opt and surfaces NotAuthorized", async () => {
    a.addVisitLog.mockResolvedValue({ err: { NotAuthorized: null } });
    const err = await recurringService.addVisitLog("s1", "2026-02-01").catch((e) => e);
    expect(a.addVisitLog).toHaveBeenCalledWith("s1", "2026-02-01", []);
    expect(hasErrorCode(err, "NotAuthorized")).toBe(true);
  });
});

describe("reads", () => {
  it("getByProperty and getVisitLogs decode lists", async () => {
    a.getByProperty.mockResolvedValue([rawService("s1"), rawService("s2")]);
    a.getVisitLogs.mockResolvedValue([rawVisit("v1", "s1", "2026-03-01")]);
    expect((await recurringService.getByProperty("p1")).map((s) => s.id)).toEqual(["s1", "s2"]);
    expect((await recurringService.getVisitLogs("s1"))[0]).toMatchObject({ visitDate: "2026-03-01", note: undefined });
  });

  it("getScheduleForProperties groups the batch's visits by service, with [] for none", async () => {
    a.getScheduleForProperties.mockResolvedValue({
      services: [rawService("s1"), rawService("s2")],
      visits: [rawVisit("v1", "s1", "2026-01-05"), rawVisit("v2", "s1", "2026-04-05")],
    });
    const out = await recurringService.getScheduleForProperties(["p1"]);
    expect(out.services.map((s) => s.id)).toEqual(["s1", "s2"]);
    expect(out.visitLogs.s1.map((v) => v.id)).toEqual(["v1", "v2"]);
    expect(out.visitLogs.s2).toEqual([]);
    expect(a.getByProperty).not.toHaveBeenCalled();
  });

  it("falls back to per-property calls when the batch call fails, tolerating one bad visit log", async () => {
    a.getScheduleForProperties.mockRejectedValue(new Error("method not found"));
    a.getByProperty.mockImplementation(async (p: string) => [rawService("s-" + p, { propertyId: p })]);
    a.getVisitLogs.mockImplementation(async (s: string) => {
      if (s === "s-p2") throw new Error("boom");
      return [rawVisit("v", s, "2026-01-01")];
    });
    const out = await recurringService.getScheduleForProperties(["p1", "p2"]);
    expect(out.services.map((s) => s.id)).toEqual(["s-p1", "s-p2"]);
    expect(out.visitLogs).toEqual({ "s-p1": [expect.objectContaining({ id: "v" })], "s-p2": [] });
  });

  it("asks nothing for an empty property list", async () => {
    expect(await recurringService.getScheduleForProperties([])).toEqual({ services: [], visitLogs: {} });
    expect(a.getScheduleForProperties).not.toHaveBeenCalled();
  });
});
