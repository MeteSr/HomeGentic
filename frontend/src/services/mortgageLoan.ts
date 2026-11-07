/**
 * #722: the owner's mortgage numbers, kept on the property canister (owner
 * and co-owners only), and the calculator that turns them into a payment
 * breakdown, an equity estimate and the PMI milestones
 * (packages/shared/src/mortgage.ts). It's arithmetic on the owner's own
 * numbers: no lending advice, rate predictions or lender referrals, and
 * nothing is sent to the lender.
 *
 * E2E: window.__e2e_mortgage_loans = { [propertyId]: MortgageLoan }.
 */
import { lazyActor } from "./lazyActor";
import { idlFactory } from "@homegentic/shared/declarations/property";
import type { _SERVICE as PropertyCanister } from "@homegentic/shared/types/property";
import type * as PropertyTypes from "@homegentic/shared/types/property";
import type { MortgageLoan } from "@homegentic/shared/mortgage";
import { canisterError } from "./candid";
import { isoDateMs } from "./insurancePolicy";

const PROPERTY_CANISTER_ID = (process.env as any).PROPERTY_CANISTER_ID || "";
const getActor = lazyActor<PropertyCanister>(idlFactory, PROPERTY_CANISTER_ID);

export const EMPTY_LOAN: MortgageLoan = {
  lender: "",
  originalAmount: 0,
  annualRatePct: 0,
  termMonths: 360,
  firstPaymentDate: "",
  originalValue: null,
  currentValue: null,
  monthlyPmi: null,
  monthlyEscrow: null,
  statementBalance: null,
  statementDate: "",
};

const MAX_AMOUNT = 100_000_000;
const MAX_MONTHLY = 100_000;
const cents = (d: number) => BigInt(Math.round(d * 100));
const optCents = (d: number | null): [] | [bigint] => (d === null ? [] : [cents(d)]);
const optDollars = (c: [] | [bigint]): number | null => (c.length ? Number(c[0]) / 100 : null);

function toCanister(l: MortgageLoan): PropertyTypes.MortgageLoanInput {
  return {
    lender: l.lender,
    originalAmountCents: cents(l.originalAmount),
    rateThousandthsPct: BigInt(Math.round(l.annualRatePct * 1000)),
    termMonths: BigInt(l.termMonths),
    firstPaymentDate: l.firstPaymentDate,
    originalValueCents: optCents(l.originalValue),
    currentValueCents: optCents(l.currentValue),
    monthlyPmiCents: optCents(l.monthlyPmi),
    monthlyEscrowCents: optCents(l.monthlyEscrow),
    statementBalanceCents: optCents(l.statementBalance),
    statementDate: l.statementDate,
  };
}

function fromCanister(raw: PropertyTypes.MortgageLoan): MortgageLoan {
  return {
    lender: raw.lender,
    originalAmount: Number(raw.originalAmountCents) / 100,
    annualRatePct: Number(raw.rateThousandthsPct) / 1000,
    termMonths: Number(raw.termMonths),
    firstPaymentDate: raw.firstPaymentDate,
    originalValue: optDollars(raw.originalValueCents),
    currentValue: optDollars(raw.currentValueCents),
    monthlyPmi: optDollars(raw.monthlyPmiCents),
    monthlyEscrow: optDollars(raw.monthlyEscrowCents),
    statementBalance: optDollars(raw.statementBalanceCents),
    statementDate: raw.statementDate,
  };
}

function e2e(): Record<string, MortgageLoan> | undefined {
  return typeof window !== "undefined" ? (window as any).__e2e_mortgage_loans : undefined;
}

export const mortgageLoanService = {
  /** The saved loan, or null (also when the caller isn't the owner or a co-owner). */
  async get(propertyId: string): Promise<MortgageLoan | null> {
    const s = e2e();
    if (s) return s[propertyId] ?? null;
    const res = await (await getActor()).getMortgageLoan(propertyId);
    if ("err" in res) {
      if ("NotAuthorized" in res.err) return null;
      throw canisterError(res.err);
    }
    return res.ok.length ? fromCanister(res.ok[0]) : null;
  },

  /** Save the loan, or clear it with null. */
  async save(propertyId: string, loan: MortgageLoan | null): Promise<void> {
    const s = e2e();
    if (s) {
      if (loan) s[propertyId] = loan;
      else delete s[propertyId];
      return;
    }
    const res = await (await getActor()).setMortgageLoan(propertyId, loan ? [toCanister(loan)] : []);
    if ("err" in res) throw canisterError(res.err);
  },
};

function realDate(d: string): boolean {
  const year = Number(d.slice(0, 4));
  return isoDateMs(d) !== null && year >= 1950 && year <= 2100;
}

const badValue = (v: number | null) => v !== null && !(v > 0 && v <= MAX_AMOUNT);
const badMonthly = (v: number | null) => v !== null && !(v >= 0 && v <= MAX_MONTHLY);

/** The canister's rules, checked before saving. Returns the problem, or null. */
export function validateLoan(l: MortgageLoan): string | null {
  if (l.lender.length > 100) return "Lender name is over 100 characters";
  if (!(l.originalAmount > 0)) return "Enter the amount borrowed";
  if (l.originalAmount > MAX_AMOUNT) return "Amount borrowed is over $100,000,000";
  if (!(l.annualRatePct >= 0)) return "Enter the interest rate";
  if (l.annualRatePct > 30) return "Interest rate is over 30%";
  if (Math.abs(l.annualRatePct * 1000 - Math.round(l.annualRatePct * 1000)) > 1e-6)
    return "Interest rate can have at most three decimal places";
  if (!Number.isInteger(l.termMonths) || l.termMonths < 12 || l.termMonths > 480) return "Loan term must be 1 to 40 years";
  if (!realDate(l.firstPaymentDate)) return "Enter the first payment date";
  if (badValue(l.originalValue)) return "Original home value must be more than $0";
  if (badValue(l.currentValue)) return "Current home value must be more than $0";
  if (badMonthly(l.monthlyPmi)) return "Monthly PMI must be $0 to $100,000";
  if (badMonthly(l.monthlyEscrow)) return "Monthly escrow must be $0 to $100,000";
  if (l.statementBalance !== null || l.statementDate !== "") {
    if (l.statementBalance === null || !realDate(l.statementDate)) return "Enter the statement balance with its date";
    if (l.statementBalance < 0) return "Statement balance can't be negative";
    if (l.statementBalance > l.originalAmount) return "Statement balance is more than the amount borrowed";
  }
  return null;
}
