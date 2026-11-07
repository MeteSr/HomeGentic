/**
 * #722: a mortgage calculator worked from the numbers the owner enters: the
 * payment, the balance on the original schedule, equity against the owner's
 * own home value, the escrow share of the payment and the PMI milestones.
 * Used by the web app's loan card and the weekly Home Pulse email.
 *
 * It is arithmetic, not advice. The PMI dates follow the federal Homeowners
 * Protection Act's schedule for conventional loans (ask to cancel at 80% of
 * the original value, automatic at 78%), but the rule depends on the loan and
 * the lender decides; FHA and other government loans differ.
 *
 * Amounts are dollars; dates are "YYYY-MM-DD" (UTC).
 */

export interface MortgageLoan {
  lender: string;
  /** The amount borrowed. */
  originalAmount: number;
  /** Interest rate, percent a year (6.5 = 6.5%). */
  annualRatePct: number;
  termMonths: number;
  /** Date of the first monthly payment. */
  firstPaymentDate: string;
  /** The home's value when the loan was made (purchase price or appraisal, whichever was lower). */
  originalValue: number | null;
  /** The owner's own estimate of what the home is worth now. */
  currentValue: number | null;
  monthlyPmi: number | null;
  /** Taxes and insurance collected with the payment. */
  monthlyEscrow: number | null;
  /** Balance from a statement, when the owner has one (extra payments put the schedule off). */
  statementBalance: number | null;
  statementDate: string;
}

export interface PmiMilestones {
  /** Payment date when the scheduled balance first reaches 80% of the original value. */
  requestDate: string;
  /** … and 78%. */
  automaticDate: string;
}

export interface MortgageSummary {
  paymentsMade: number;
  principalAndInterest: number;
  /** P&I plus escrow and PMI. */
  monthlyTotal: number;
  /** Escrow's share of monthlyTotal (0–1), or null without escrow. */
  escrowShare: number | null;
  balance: number;
  balanceSource: "schedule" | "statement";
  equity: number | null;
  loanToValue: number | null;
  loanToOriginalValue: number | null;
  payoffDate: string;
  pmi: (PmiMilestones & { reached80: boolean }) | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function parts(iso: string): [number, number, number] | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function iso(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** The date of payment `k` (1 = the first), keeping the payment day inside short months. */
export function paymentDate(firstPaymentDate: string, k: number): string {
  const p = parts(firstPaymentDate);
  if (!p) return "";
  const months = p[1] - 1 + (k - 1);
  const y = p[0] + Math.floor(months / 12);
  const m = (months % 12) + 1;
  return iso(y, m, Math.min(p[2], daysIn(y, m)));
}

function todayIso(nowMs: number): string {
  const d = new Date(nowMs);
  return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** How many payments fall on or before today. */
export function paymentsMadeBy(firstPaymentDate: string, nowMs: number): number {
  const p = parts(firstPaymentDate);
  const today = todayIso(nowMs);
  if (!p || today < firstPaymentDate) return 0;
  const [ty, tm] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
  let k = (ty - p[0]) * 12 + (tm - p[1]) + 1;
  if (paymentDate(firstPaymentDate, k) > today) k -= 1;
  return Math.max(0, k);
}

/** The level monthly principal-and-interest payment. */
export function monthlyPayment(principal: number, annualRatePct: number, termMonths: number): number {
  const r = annualRatePct / 1200;
  if (r === 0) return principal / termMonths;
  return (principal * r) / (1 - Math.pow(1 + r, -termMonths));
}

/** The balance after `paid` scheduled payments (never below zero). */
export function scheduledBalance(principal: number, annualRatePct: number, termMonths: number, paid: number): number {
  if (paid <= 0) return principal;
  if (paid >= termMonths) return 0;
  const r = annualRatePct / 1200;
  const pmt = monthlyPayment(principal, annualRatePct, termMonths);
  const b = r === 0 ? principal - pmt * paid : principal * Math.pow(1 + r, paid) - (pmt * (Math.pow(1 + r, paid) - 1)) / r;
  return Math.max(0, round2(b));
}

/** First payment (1-based) whose scheduled balance is at or below `target`. */
function firstPaymentAtOrBelow(loan: MortgageLoan, target: number): number {
  for (let k = 1; k <= loan.termMonths; k++) {
    if (scheduledBalance(loan.originalAmount, loan.annualRatePct, loan.termMonths, k) <= target) return k;
  }
  return loan.termMonths;
}

/** When the original schedule reaches 80% and 78% of the original value. */
export function pmiMilestones(loan: MortgageLoan): PmiMilestones | null {
  if (!loan.originalValue || loan.originalValue <= 0) return null;
  return {
    requestDate:   paymentDate(loan.firstPaymentDate, firstPaymentAtOrBelow(loan, loan.originalValue * 0.8)),
    automaticDate: paymentDate(loan.firstPaymentDate, firstPaymentAtOrBelow(loan, loan.originalValue * 0.78)),
  };
}

const hasPmi = (loan: MortgageLoan) => loan.monthlyPmi !== null && loan.monthlyPmi > 0;

export function mortgageSummary(loan: MortgageLoan, nowMs: number): MortgageSummary {
  const paymentsMade = Math.min(loan.termMonths, paymentsMadeBy(loan.firstPaymentDate, nowMs));
  const pi = monthlyPayment(loan.originalAmount, loan.annualRatePct, loan.termMonths);
  const escrow = loan.monthlyEscrow ?? 0;
  const monthlyTotal = round2(pi + escrow + (loan.monthlyPmi ?? 0));
  const fromStatement = loan.statementBalance !== null;
  const balance = fromStatement
    ? (loan.statementBalance as number)
    : scheduledBalance(loan.originalAmount, loan.annualRatePct, loan.termMonths, paymentsMade);
  const value = loan.currentValue && loan.currentValue > 0 ? loan.currentValue : null;
  const original = loan.originalValue && loan.originalValue > 0 ? loan.originalValue : null;
  const milestones = hasPmi(loan) ? pmiMilestones(loan) : null;
  return {
    paymentsMade,
    principalAndInterest: round2(pi),
    monthlyTotal,
    escrowShare: escrow > 0 ? escrow / monthlyTotal : null,
    balance,
    balanceSource: fromStatement ? "statement" : "schedule",
    equity: value === null ? null : round2(value - balance),
    loanToValue: value === null ? null : balance / value,
    loanToOriginalValue: original === null ? null : balance / original,
    payoffDate: paymentDate(loan.firstPaymentDate, loan.termMonths),
    pmi: milestones && original !== null
      ? { ...milestones, reached80: balance <= original * 0.8 }
      : null,
  };
}

/** Days the weekly email reminds either side of the 80% date. */
export const PMI_REMINDER_WINDOW_DAYS = 60;

/**
 * For the weekly email: the 80% date when it's within 60 days either side of
 * today (negative days = passed), or null. Needs a PMI premium and an
 * original value.
 */
export function pmiReminder(loan: MortgageLoan, nowMs: number): { requestDate: string; days: number } | null {
  if (!hasPmi(loan)) return null;
  const m = pmiMilestones(loan);
  if (!m) return null;
  const p = parts(m.requestDate);
  if (!p) return null;
  const now = new Date(nowMs);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = Math.round((Date.UTC(p[0], p[1] - 1, p[2]) - today) / 86_400_000);
  return Math.abs(days) <= PMI_REMINDER_WINDOW_DAYS ? { requestDate: m.requestDate, days } : null;
}
