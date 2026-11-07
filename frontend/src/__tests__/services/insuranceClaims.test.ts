import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Stateful stand-in for the property canister's #711 claim methods.
let rows: any[] = [];
let n = 0;
const NS = 1_700_000_000_000_000_000n;
const mockActor = {
  getInsuranceClaims: vi.fn(async (propertyId: string) =>
    propertyId === "missing" ? { err: { NotFound: null } } : { ok: rows.filter((r) => r.propertyId === propertyId) },
  ),
  createInsuranceClaim: vi.fn(async (propertyId: string, input: any) => {
    const row = { ...input, id: `c${++n}`, propertyId, log: [], createdAt: NS, updatedAt: NS };
    rows.push(row);
    return { ok: row };
  }),
  updateInsuranceClaim: vi.fn(async (id: string, input: any) => {
    const i = rows.findIndex((r) => r.id === id);
    if (i < 0) return { err: { NotFound: null } };
    rows[i] = { ...rows[i], ...input };
    return { ok: rows[i] };
  }),
  addInsuranceClaimLog: vi.fn(async (id: string, date: string, note: string) => {
    const r = rows.find((x) => x.id === id);
    if (!r) return { err: { NotFound: null } };
    r.log = [...r.log, { date, note, addedAt: NS }];
    return { ok: r };
  }),
  deleteInsuranceClaim: vi.fn(async (id: string) => {
    const before = rows.length;
    rows = rows.filter((r) => r.id !== id);
    return rows.length < before ? { ok: null } : { err: { NotFound: null } };
  }),
};

vi.mock("@/services/actor", () => ({ getAgent: vi.fn().mockResolvedValue({}) }));
vi.mock("@icp-sdk/core/agent", () => ({ Actor: { createActor: vi.fn(() => mockActor) } }));

import {
  insuranceClaimService,
  claimPhotoJobId,
  repairQuotePrefill,
  validateClaim,
  validateLogEntry,
  EMPTY_CLAIM,
  type ClaimInput,
} from "@/services/insuranceClaims";

const INPUT: ClaimInput = {
  title: "Kitchen ceiling leak",
  dateOfLoss: "2026-09-28",
  cause: "Water leak",
  description: "Water through the ceiling after the storm",
  claimNumber: "CLM-778",
  adjusterName: "Dana Ruiz",
  adjusterContact: "dana@example.com",
  status: "open",
};

beforeEach(() => {
  rows = [];
  n = 0;
  vi.clearAllMocks();
});
afterEach(() => {
  delete (window as any).__e2e_insurance_claims;
});

describe("insuranceClaimService", () => {
  it("creates a claim in canister form and lists it back", async () => {
    const created = await insuranceClaimService.create("p1", INPUT);
    expect(mockActor.createInsuranceClaim).toHaveBeenCalledWith("p1", { ...INPUT, status: { Open: null } });
    expect(created).toEqual({
      ...INPUT,
      id: "c1",
      propertyId: "p1",
      log: [],
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
    });
    expect(await insuranceClaimService.list("p1")).toEqual([created]);
  });

  it("updates, logs and deletes", async () => {
    const { id } = await insuranceClaimService.create("p1", INPUT);
    const closed = await insuranceClaimService.update(id, { ...INPUT, status: "closed" });
    expect(mockActor.updateInsuranceClaim.mock.calls[0][1].status).toEqual({ Closed: null });
    expect(closed.status).toBe("closed");
    const logged = await insuranceClaimService.addLog(id, "2026-10-02", "Adjuster visited");
    expect(logged.log).toEqual([{ date: "2026-10-02", note: "Adjuster visited", addedAt: 1_700_000_000_000 }]);
    await insuranceClaimService.remove(id);
    expect(await insuranceClaimService.list("p1")).toEqual([]);
  });

  it("throws a canister error when the canister refuses", async () => {
    await expect(insuranceClaimService.list("missing")).rejects.toMatchObject({ code: "NotFound" });
    await expect(insuranceClaimService.update("nope", INPUT)).rejects.toMatchObject({ code: "NotFound" });
    await expect(insuranceClaimService.addLog("nope", "2026-10-02", "x")).rejects.toMatchObject({ code: "NotFound" });
    await expect(insuranceClaimService.remove("nope")).rejects.toMatchObject({ code: "NotFound" });
  });

  it("uses the e2e claims when they are injected", async () => {
    (window as any).__e2e_insurance_claims = {};
    const c = await insuranceClaimService.create("p1", INPUT);
    await insuranceClaimService.addLog(c.id, "2026-10-01", "Called the insurer");
    const [listed] = await insuranceClaimService.list("p1");
    expect(listed.log[0].note).toBe("Called the insurer");
    await insuranceClaimService.update(c.id, { ...INPUT, title: "Leak" });
    expect((await insuranceClaimService.list("p1"))[0].title).toBe("Leak");
    await insuranceClaimService.remove(c.id);
    expect(await insuranceClaimService.list("p1")).toEqual([]);
    expect(mockActor.getInsuranceClaims).not.toHaveBeenCalled();
  });
});

describe("claim helpers", () => {
  it("files damage photos under the claim", () => {
    expect(claimPhotoJobId("abc")).toBe("claim_abc");
  });

  it("pre-fills a repair quote from the claim, picking a trade from the cause", () => {
    const claim = { ...INPUT, id: "c1", propertyId: "p1", log: [], createdAt: 0, updatedAt: 0 };
    expect(repairQuotePrefill(claim)).toEqual({
      propertyId: "p1",
      serviceType: "Plumbing",
      description:
        "Repair needed after: Kitchen ceiling leak (loss on Sep 28, 2026). Water through the ceiling after the storm. Insurance claim CLM-778.",
    });
    expect(repairQuotePrefill({ ...claim, cause: "Wind or hurricane" }).serviceType).toBe("Roofing");
    expect(repairQuotePrefill({ ...claim, cause: "Hail" }).serviceType).toBe("Roofing");
    expect(repairQuotePrefill({ ...claim, cause: "Fire or smoke" }).serviceType).toBe("Other");
    const bare = repairQuotePrefill({ ...claim, description: "", claimNumber: "" });
    expect(bare.description).toBe("Repair needed after: Kitchen ceiling leak (loss on Sep 28, 2026).");
  });

  it("validates a claim the way the canister does", () => {
    expect(validateClaim(INPUT)).toBeNull();
    expect(validateClaim(EMPTY_CLAIM)).toMatch(/title/i);
    expect(validateClaim({ ...INPUT, title: "x".repeat(101) })).toMatch(/100/);
    expect(validateClaim({ ...INPUT, dateOfLoss: "" })).toMatch(/date of loss/i);
    expect(validateClaim({ ...INPUT, description: "x".repeat(2001) })).toMatch(/2,000/);
    expect(validateClaim({ ...INPUT, claimNumber: "x".repeat(61) })).toMatch(/60/);
    expect(validateClaim({ ...INPUT, adjusterName: "x".repeat(101) })).toMatch(/adjuster name/i);
    expect(validateClaim({ ...INPUT, adjusterContact: "x".repeat(201) })).toMatch(/200/);
  });

  it("validates a log entry", () => {
    expect(validateLogEntry("2026-10-02", "Called")).toBeNull();
    expect(validateLogEntry("", "Called")).toMatch(/date/i);
    expect(validateLogEntry("2026-10-02", "  ")).toMatch(/what happened/i);
    expect(validateLogEntry("2026-10-02", "x".repeat(1001))).toMatch(/1,000/);
  });
});
