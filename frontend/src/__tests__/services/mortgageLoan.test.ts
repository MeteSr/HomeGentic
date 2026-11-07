import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const store = new Map<string, any>();
const mockActor = {
  getMortgageLoan: vi.fn(async (pid: string) =>
    pid === "theirs" ? { err: { NotAuthorized: null } } : { ok: store.has(pid) ? [store.get(pid)] : [] },
  ),
  setMortgageLoan: vi.fn(async (pid: string, l: any[]) => {
    if (l.length === 0) store.delete(pid);
    else store.set(pid, { ...l[0], updatedAt: 1_700_000_000_000_000_000n });
    return { ok: null };
  }),
};

vi.mock("@/services/actor", () => ({ getAgent: vi.fn().mockResolvedValue({}) }));
vi.mock("@icp-sdk/core/agent", () => ({ Actor: { createActor: vi.fn(() => mockActor) } }));

import { mortgageLoanService, validateLoan, EMPTY_LOAN } from "@/services/mortgageLoan";
import type { MortgageLoan } from "@homegentic/shared/mortgage";

const LOAN: MortgageLoan = {
  ...EMPTY_LOAN,
  lender: "Sunshine Bank",
  originalAmount: 300_000,
  annualRatePct: 6.125,
  termMonths: 360,
  firstPaymentDate: "2024-02-01",
  originalValue: 350_000,
  currentValue: 420_000,
  monthlyPmi: 120,
  monthlyEscrow: 600.5,
};

beforeEach(() => {
  store.clear();
  vi.clearAllMocks();
});
afterEach(() => {
  delete (window as any).__e2e_mortgage_loans;
});

describe("mortgageLoanService", () => {
  it("saves in cents and thousandths of a percent, and reads back", async () => {
    await mortgageLoanService.save("p1", LOAN);
    expect(mockActor.setMortgageLoan).toHaveBeenCalledWith("p1", [
      expect.objectContaining({
        originalAmountCents: 30_000_000n,
        rateThousandthsPct: 6_125n,
        termMonths: 360n,
        monthlyEscrowCents: [60_050n],
        statementBalanceCents: [],
        statementDate: "",
      }),
    ]);
    expect(await mortgageLoanService.get("p1")).toMatchObject(LOAN);
    await mortgageLoanService.save("p1", null);
    expect(await mortgageLoanService.get("p1")).toBeNull();
  });

  it("treats a loan it may not see as none (managers and viewers)", async () => {
    expect(await mortgageLoanService.get("theirs")).toBeNull();
  });

  it("uses window.__e2e_mortgage_loans in place of the canister", async () => {
    (window as any).__e2e_mortgage_loans = {};
    await mortgageLoanService.save("p1", LOAN);
    expect(await mortgageLoanService.get("p1")).toEqual(LOAN);
    expect(mockActor.setMortgageLoan).not.toHaveBeenCalled();
  });
});

describe("validateLoan mirrors the canister", () => {
  it("accepts a sensible loan and names the problem otherwise", () => {
    expect(validateLoan(LOAN)).toBeNull();
    expect(validateLoan({ ...LOAN, originalAmount: 0 })).toMatch(/amount borrowed/i);
    expect(validateLoan({ ...LOAN, annualRatePct: 31 })).toMatch(/30%/);
    expect(validateLoan({ ...LOAN, annualRatePct: 6.1234 })).toMatch(/three decimal/i);
    expect(validateLoan({ ...LOAN, termMonths: 6 })).toMatch(/1 to 40 years/);
    expect(validateLoan({ ...LOAN, firstPaymentDate: "" })).toMatch(/first payment/i);
    expect(validateLoan({ ...LOAN, statementBalance: 250_000, statementDate: "" })).toMatch(/statement/i);
    expect(validateLoan({ ...LOAN, statementBalance: 300_001, statementDate: "2025-01-01" })).toMatch(
      /more than the amount borrowed/i,
    );
    expect(validateLoan({ ...LOAN, currentValue: 0 })).toMatch(/current home value/i);
  });
});
