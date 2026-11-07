import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Stand-in for the property canister's #719 home warranty methods.
const plans = new Map<string, any>();
const claims = new Map<string, any>();
const mockActor = {
  getHomeWarrantyPlan: vi.fn(async (pid: string) => (pid === "missing" ? { err: { NotFound: null } } : { ok: plans.has(pid) ? [plans.get(pid)] : [] })),
  setHomeWarrantyPlan: vi.fn(async (pid: string, p: any[]) => {
    if (p.length === 0) plans.delete(pid);
    else plans.set(pid, { ...p[0], updatedAt: 1_700_000_000_000_000_000n });
    return { ok: null };
  }),
  getHomeWarrantyClaims: vi.fn(async (pid: string) => ({ ok: [...claims.values()].filter((c) => c.propertyId === pid) })),
  addHomeWarrantyClaim: vi.fn(async (pid: string, c: any) => {
    const rec = { ...c, id: `c${claims.size + 1}`, propertyId: pid, createdAt: 1_700_000_000_000_000_000n, updatedAt: 1_700_000_000_000_000_000n };
    claims.set(rec.id, rec);
    return { ok: rec };
  }),
  updateHomeWarrantyClaim: vi.fn(async (id: string, c: any) => {
    if (!claims.has(id)) return { err: { NotFound: null } };
    const rec = { ...claims.get(id), ...c };
    claims.set(id, rec);
    return { ok: rec };
  }),
  deleteHomeWarrantyClaim: vi.fn(async (id: string) => (claims.delete(id) ? { ok: null } : { err: { NotFound: null } })),
};

vi.mock("@/services/actor", () => ({ getAgent: vi.fn().mockResolvedValue({}) }));
vi.mock("@icp-sdk/core/agent", () => ({ Actor: { createActor: vi.fn(() => mockActor) } }));

import {
  homeWarrantyService, validatePlan, validateClaim, claimTotals, EMPTY_PLAN, EMPTY_CLAIM,
  type HomeWarrantyPlan, type WarrantyClaim,
} from "@/services/homeWarranty";

const PLAN: HomeWarrantyPlan = {
  ...EMPTY_PLAN,
  provider: "American Home Shield",
  planName: "ShieldGold",
  contractNumber: "AHS-1",
  serviceFee: 125,
  startDate: "2026-03-15",
  renewalDate: "2027-03-15",
  coverageNotes: "HVAC, plumbing",
  contractDocId: "doc-1",
};
const CLAIM: WarrantyClaim = {
  ...EMPTY_CLAIM,
  dateFiled: "2026-07-02",
  issue: "AC not cooling",
  serviceFeePaid: 125,
  outcome: "PartlyApproved",
  jobId: "job-1",
};

beforeEach(() => {
  plans.clear();
  claims.clear();
  vi.clearAllMocks();
});
afterEach(() => {
  delete (window as any).__e2e_home_warranty;
});

describe("homeWarrantyService", () => {
  it("saves the plan in canister units and reads it back", async () => {
    await homeWarrantyService.savePlan("p1", PLAN);
    expect(mockActor.setHomeWarrantyPlan).toHaveBeenCalledWith("p1", [
      expect.objectContaining({ provider: "American Home Shield", serviceFeeCents: [12_500n], contractDocId: ["doc-1"] }),
    ]);
    const back = await homeWarrantyService.getPlan("p1");
    expect(back).toMatchObject({ ...PLAN, updatedAt: 1_700_000_000_000 });
    await homeWarrantyService.savePlan("p1", null);
    expect(await homeWarrantyService.getPlan("p1")).toBeNull();
    await expect(homeWarrantyService.getPlan("missing")).rejects.toThrow();
  });

  it("adds, edits and deletes claims", async () => {
    const added = await homeWarrantyService.addClaim("p1", CLAIM);
    expect(mockActor.addHomeWarrantyClaim).toHaveBeenCalledWith("p1", expect.objectContaining({
      outcome: { PartlyApproved: null }, serviceFeePaidCents: [12_500n], jobId: ["job-1"],
    }));
    expect(added).toMatchObject({ ...CLAIM, id: "c1" });
    const edited = await homeWarrantyService.updateClaim("c1", { ...CLAIM, outcome: "Approved", jobId: null });
    expect(edited).toMatchObject({ outcome: "Approved", jobId: null });
    expect(await homeWarrantyService.listClaims("p1")).toHaveLength(1);
    await homeWarrantyService.deleteClaim("c1");
    expect(await homeWarrantyService.listClaims("p1")).toEqual([]);
    await expect(homeWarrantyService.deleteClaim("c1")).rejects.toThrow();
  });

  it("uses window.__e2e_home_warranty in place of the canister", async () => {
    (window as any).__e2e_home_warranty = { plans: {}, claims: {} };
    await homeWarrantyService.savePlan("p1", PLAN);
    expect(await homeWarrantyService.getPlan("p1")).toMatchObject({ provider: "American Home Shield" });
    const c = await homeWarrantyService.addClaim("p1", CLAIM);
    expect(await homeWarrantyService.listClaims("p1")).toEqual([c]);
    await homeWarrantyService.updateClaim(c.id!, { ...CLAIM, outcome: "Denied" });
    expect((await homeWarrantyService.listClaims("p1"))[0].outcome).toBe("Denied");
    await homeWarrantyService.deleteClaim(c.id!);
    expect(await homeWarrantyService.listClaims("p1")).toEqual([]);
    expect(mockActor.setHomeWarrantyPlan).not.toHaveBeenCalled();
  });
});

describe("validation mirrors the canister", () => {
  it("checks the plan", () => {
    expect(validatePlan(PLAN)).toBeNull();
    expect(validatePlan({ ...PLAN, provider: " " })).toMatch(/company/i);
    expect(validatePlan({ ...PLAN, renewalDate: "" })).toMatch(/renewal date/i);
    expect(validatePlan({ ...PLAN, startDate: "2027-04-01" })).toMatch(/after the renewal/i);
    expect(validatePlan({ ...PLAN, serviceFee: 1000.01 })).toMatch(/\$1,000/);
    expect(validatePlan({ ...PLAN, coverageNotes: "x".repeat(2001) })).toMatch(/2,000/);
  });
  it("checks a claim", () => {
    expect(validateClaim(CLAIM)).toBeNull();
    expect(validateClaim({ ...CLAIM, issue: "" })).toMatch(/what the claim is for/i);
    expect(validateClaim({ ...CLAIM, dateFiled: "" })).toMatch(/date filed/i);
    expect(validateClaim({ ...CLAIM, serviceFeePaid: 2000 })).toMatch(/\$1,000/);
  });
});

describe("claimTotals", () => {
  it("adds up fees paid and counts open claims", () => {
    expect(claimTotals([CLAIM, { ...CLAIM, outcome: "Open", serviceFeePaid: null }, { ...CLAIM, serviceFeePaid: 100 }]))
      .toEqual({ feesPaid: 225, open: 1, count: 3 });
  });
});
