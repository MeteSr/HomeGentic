/**
 * #722: the mortgage calculator (packages/shared/src/mortgage.ts), used by the
 * web app's loan card and the weekly Home Pulse email. Vectors were worked out
 * separately (month-by-month in Python) for a $300,000, 6.5%, 30-year loan
 * with its first payment on 2024-02-01 and a $350,000 original value.
 */
import { describe, it, expect } from "vitest";
import {
  monthlyPayment,
  scheduledBalance,
  paymentsMadeBy,
  paymentDate,
  mortgageSummary,
  pmiMilestones,
  pmiReminder,
  type MortgageLoan,
} from "@homegentic/shared/mortgage";

const LOAN: MortgageLoan = {
  lender: "Sunshine Bank",
  originalAmount: 300_000,
  annualRatePct: 6.5,
  termMonths: 360,
  firstPaymentDate: "2024-02-01",
  originalValue: 350_000,
  currentValue: 420_000,
  monthlyPmi: 120,
  monthlyEscrow: 600,
  statementBalance: null,
  statementDate: "",
};
const day = (iso: string) => Date.parse(`${iso}T12:00:00Z`);

describe("monthlyPayment", () => {
  it("matches the standard amortization formula", () => {
    expect(monthlyPayment(300_000, 6.5, 360)).toBeCloseTo(1896.2, 2);
  });
  it("splits a 0% loan evenly", () => {
    expect(monthlyPayment(12_000, 0, 24)).toBe(500);
  });
});

describe("scheduledBalance", () => {
  it("follows the schedule payment by payment", () => {
    expect(scheduledBalance(300_000, 6.5, 360, 0)).toBe(300_000);
    expect(scheduledBalance(300_000, 6.5, 360, 1)).toBeCloseTo(299_728.8, 1);
    expect(scheduledBalance(300_000, 6.5, 360, 12)).toBeCloseTo(296_646.82, 1);
    expect(scheduledBalance(300_000, 6.5, 360, 60)).toBeCloseTo(280_832.93, 1);
  });
  it("is zero once every payment is made, and never negative", () => {
    expect(scheduledBalance(300_000, 6.5, 360, 360)).toBe(0);
    expect(scheduledBalance(300_000, 6.5, 360, 400)).toBe(0);
    expect(scheduledBalance(12_000, 0, 24, 12)).toBe(6_000);
  });
});

describe("payment dates", () => {
  it("counts payments due on or before today", () => {
    expect(paymentsMadeBy("2024-02-01", day("2024-01-31"))).toBe(0);
    expect(paymentsMadeBy("2024-02-01", day("2024-02-01"))).toBe(1);
    expect(paymentsMadeBy("2024-02-01", day("2025-01-31"))).toBe(12);
    expect(paymentsMadeBy("2024-02-01", day("2025-02-01"))).toBe(13);
  });
  it("keeps month-end payment days inside short months", () => {
    expect(paymentDate("2024-01-31", 2)).toBe("2024-02-29");
    expect(paymentDate("2024-01-31", 3)).toBe("2024-03-31");
    expect(paymentsMadeBy("2024-01-31", day("2024-02-29"))).toBe(2);
  });
});

describe("pmiMilestones", () => {
  it("dates the 80% and 78% points of the original value on the original schedule", () => {
    expect(pmiMilestones(LOAN)).toEqual({ requestDate: "2029-04-01", automaticDate: "2030-09-01" });
  });
  it("has nothing without an original value", () => {
    expect(pmiMilestones({ ...LOAN, originalValue: null })).toBeNull();
  });
  it("puts a loan that starts at 80% or less on its first payment", () => {
    expect(pmiMilestones({ ...LOAN, originalValue: 400_000 })?.requestDate).toBe("2024-02-01");
  });
});

describe("mortgageSummary", () => {
  it("adds up the payment, the escrow share and the equity from the owner's numbers", () => {
    const s = mortgageSummary(LOAN, day("2025-01-15"));
    expect(s.paymentsMade).toBe(12);
    expect(s.principalAndInterest).toBeCloseTo(1896.2, 2);
    expect(s.monthlyTotal).toBeCloseTo(2616.2, 2);
    expect(s.escrowShare).toBeCloseTo(600 / 2616.2, 4);
    expect(s.balance).toBeCloseTo(296_646.82, 1);
    expect(s.balanceSource).toBe("schedule");
    expect(s.equity).toBeCloseTo(420_000 - 296_646.82, 1);
    expect(s.loanToValue).toBeCloseTo(296_646.82 / 420_000, 4);
    expect(s.loanToOriginalValue).toBeCloseTo(296_646.82 / 350_000, 4);
    expect(s.payoffDate).toBe("2054-01-01");
    expect(s.pmi).toEqual({ requestDate: "2029-04-01", automaticDate: "2030-09-01", reached80: false });
  });

  it("uses the statement balance when the owner gives one", () => {
    const s = mortgageSummary({ ...LOAN, statementBalance: 279_000, statementDate: "2025-01-01" }, day("2025-01-15"));
    expect(s.balance).toBe(279_000);
    expect(s.balanceSource).toBe("statement");
    expect(s.pmi?.reached80).toBe(true);
  });

  it("leaves equity out without a current value and PMI out without a premium", () => {
    const s = mortgageSummary({ ...LOAN, currentValue: null, monthlyPmi: null }, day("2025-01-15"));
    expect(s.equity).toBeNull();
    expect(s.loanToValue).toBeNull();
    expect(s.pmi).toBeNull();
    expect(s.monthlyTotal).toBeCloseTo(2496.2, 2);
  });

  it("shows a paid-off loan as zero", () => {
    const s = mortgageSummary(LOAN, day("2060-01-01"));
    expect(s.paymentsMade).toBe(360);
    expect(s.balance).toBe(0);
  });
});

describe("pmiReminder", () => {
  it("fires from 60 days before the 80% date to 60 days after", () => {
    expect(pmiReminder(LOAN, day("2029-01-30"))).toBeNull();
    expect(pmiReminder(LOAN, day("2029-02-01"))).toEqual({ requestDate: "2029-04-01", days: 59 });
    expect(pmiReminder(LOAN, day("2029-05-30"))).toEqual({ requestDate: "2029-04-01", days: -59 });
    expect(pmiReminder(LOAN, day("2029-06-15"))).toBeNull();
  });
  it("needs a PMI premium and an original value", () => {
    expect(pmiReminder({ ...LOAN, monthlyPmi: null }, day("2029-03-01"))).toBeNull();
    expect(pmiReminder({ ...LOAN, monthlyPmi: 0 }, day("2029-03-01"))).toBeNull();
    expect(pmiReminder({ ...LOAN, originalValue: null }, day("2029-03-01"))).toBeNull();
  });
});
