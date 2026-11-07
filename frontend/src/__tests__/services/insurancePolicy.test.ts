import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Stateful stand-in for the property canister's #711 insurance methods.
const store = new Map<string, any>();
const mockActor = {
  getInsurancePolicy: vi.fn(async (propertyId: string) => {
    if (propertyId === "missing") return { err: { NotFound: null } };
    return { ok: store.has(propertyId) ? [store.get(propertyId)] : [] };
  }),
  setInsurancePolicy: vi.fn(async (propertyId: string, policy: any[]) => {
    if (propertyId === "missing") return { err: { NotFound: null } };
    if (policy.length === 0) store.delete(propertyId);
    else store.set(propertyId, { ...policy[0], updatedAt: 1_700_000_000_000_000_000n });
    return { ok: null };
  }),
};

vi.mock("@/services/actor", () => ({ getAgent: vi.fn().mockResolvedValue({}) }));
vi.mock("@icp-sdk/core/agent", () => ({ Actor: { createActor: vi.fn(() => mockActor) } }));

import {
  insurancePolicyService,
  renewalStatus,
  hurricaneDeductibleDollars,
  validatePolicy,
  type InsurancePolicy,
} from "@/services/insurancePolicy";

const POLICY: InsurancePolicy = {
  carrier: "Citizens",
  policyNumber: "HO3-42",
  renewalDate: "2027-06-01",
  coverageA: 350_000,
  hurricaneDeductible: { kind: "percent", percent: 2 },
};

beforeEach(() => {
  store.clear();
  vi.clearAllMocks();
});
afterEach(() => {
  delete (window as any).__e2e_insurance_policies;
});

describe("insurancePolicyService", () => {
  it("saves a policy in canister units and reads it back", async () => {
    await insurancePolicyService.save("p1", POLICY);
    expect(mockActor.setInsurancePolicy).toHaveBeenCalledWith("p1", [
      {
        carrier: "Citizens",
        policyNumber: "HO3-42",
        renewalDate: "2027-06-01",
        coverageACents: [35_000_000n],
        hurricaneDeductible: [{ PercentOfCoverageA: 2n }],
      },
    ]);
    expect(await insurancePolicyService.get("p1")).toEqual({ ...POLICY, updatedAt: 1_700_000_000_000 });
  });

  it("round-trips a dollar deductible and blank optional fields", async () => {
    await insurancePolicyService.save("p1", {
      ...POLICY,
      coverageA: null,
      hurricaneDeductible: { kind: "amount", dollars: 5000 },
    });
    expect(mockActor.setInsurancePolicy.mock.calls[0][1][0]).toMatchObject({
      coverageACents: [],
      hurricaneDeductible: [{ Amount: 500_000n }],
    });
    const back = await insurancePolicyService.get("p1");
    expect(back?.coverageA).toBeNull();
    expect(back?.hurricaneDeductible).toEqual({ kind: "amount", dollars: 5000 });

    await insurancePolicyService.save("p1", { ...POLICY, hurricaneDeductible: null });
    expect((await insurancePolicyService.get("p1"))?.hurricaneDeductible).toBeNull();
  });

  it("returns null when no policy is saved, and clears with null", async () => {
    expect(await insurancePolicyService.get("p1")).toBeNull();
    await insurancePolicyService.save("p1", POLICY);
    await insurancePolicyService.save("p1", null);
    expect(mockActor.setInsurancePolicy).toHaveBeenLastCalledWith("p1", []);
    expect(await insurancePolicyService.get("p1")).toBeNull();
  });

  it("throws a canister error when the canister refuses", async () => {
    await expect(insurancePolicyService.get("missing")).rejects.toMatchObject({ code: "NotFound" });
    await expect(insurancePolicyService.save("missing", POLICY)).rejects.toMatchObject({ code: "NotFound" });
  });

  it("uses the e2e policies when they are injected", async () => {
    (window as any).__e2e_insurance_policies = { p1: POLICY };
    expect(await insurancePolicyService.get("p1")).toEqual(POLICY);
    expect(await insurancePolicyService.get("p2")).toBeNull();
    await insurancePolicyService.save("p2", POLICY);
    await insurancePolicyService.save("p1", null);
    expect((window as any).__e2e_insurance_policies).toEqual({ p2: POLICY });
    expect(mockActor.getInsurancePolicy).not.toHaveBeenCalled();
  });
});

describe("renewalStatus", () => {
  const NOW = Date.UTC(2026, 10, 7, 15); // Nov 7, 2026, mid-afternoon UTC

  it("counts whole days to the renewal date", () => {
    expect(renewalStatus("2026-11-07", NOW)).toEqual({ days: 0, tone: "soon" });
    expect(renewalStatus("2027-01-06", NOW)).toEqual({ days: 60, tone: "soon" });
    expect(renewalStatus("2027-01-07", NOW)).toEqual({ days: 61, tone: "later" });
    expect(renewalStatus("2026-11-01", NOW)).toEqual({ days: -6, tone: "passed" });
  });

  it("returns null for a date it can't read", () => {
    expect(renewalStatus("", NOW)).toBeNull();
    expect(renewalStatus("2027-02-30", NOW)).toBeNull();
  });
});

describe("hurricaneDeductibleDollars", () => {
  it("works a percent out of Coverage A, and passes a dollar amount through", () => {
    expect(hurricaneDeductibleDollars(POLICY)).toBe(7000);
    expect(hurricaneDeductibleDollars({ ...POLICY, hurricaneDeductible: { kind: "amount", dollars: 500 } })).toBe(500);
  });

  it("can't work out a percent without Coverage A", () => {
    expect(hurricaneDeductibleDollars({ ...POLICY, coverageA: null })).toBeNull();
    expect(hurricaneDeductibleDollars({ ...POLICY, hurricaneDeductible: null })).toBeNull();
  });
});

describe("validatePolicy", () => {
  it("accepts a complete policy", () => {
    expect(validatePolicy(POLICY)).toBeNull();
  });

  it("matches the canister's rules", () => {
    expect(validatePolicy({ ...POLICY, carrier: "  " })).toMatch(/insurance company/i);
    expect(validatePolicy({ ...POLICY, carrier: "x".repeat(101) })).toMatch(/100/);
    expect(validatePolicy({ ...POLICY, policyNumber: "x".repeat(61) })).toMatch(/60/);
    expect(validatePolicy({ ...POLICY, renewalDate: "" })).toMatch(/renewal date/i);
    expect(validatePolicy({ ...POLICY, renewalDate: "2027-02-29" })).toMatch(/renewal date/i);
    expect(validatePolicy({ ...POLICY, hurricaneDeductible: { kind: "percent", percent: 0 } })).toMatch(/1 to 25/);
    expect(validatePolicy({ ...POLICY, hurricaneDeductible: { kind: "percent", percent: 2.5 } })).toMatch(/whole/);
    expect(validatePolicy({ ...POLICY, coverageA: 100_000_001 })).toMatch(/100,000,000/);
    expect(validatePolicy({ ...POLICY, coverageA: -1 })).toMatch(/Coverage A/);
    expect(validatePolicy({ ...POLICY, hurricaneDeductible: { kind: "amount", dollars: -5 } })).toMatch(/deductible/i);
  });
});
