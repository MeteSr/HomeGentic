/**
 * #711: the home insurance policy the household keeps on record (property
 * canister: setInsurancePolicy / getInsurancePolicy). It's the owner's own
 * copy of what the declarations page says: nothing here is checked with, or
 * sent to, the insurer. The weekly Home Pulse email reminds the owner in the
 * 60 days before the renewal date.
 */
import { lazyActor } from "./lazyActor";
import { idlFactory } from "@homegentic/shared/declarations/property";
import type { _SERVICE as PropertyCanister } from "@homegentic/shared/types/property";
import type * as PropertyTypes from "@homegentic/shared/types/property";
import { canisterError } from "./candid";

const PROPERTY_CANISTER_ID = (process.env as any).PROPERTY_CANISTER_ID || "";
const getActor = lazyActor<PropertyCanister>(idlFactory, PROPERTY_CANISTER_ID);

export type HurricaneDeductible = { kind: "percent"; percent: number } | { kind: "amount"; dollars: number };

export interface InsurancePolicy {
  carrier: string;
  policyNumber: string;
  /** Calendar date, "YYYY-MM-DD". */
  renewalDate: string;
  /** Dwelling coverage, whole dollars. */
  coverageA: number | null;
  hurricaneDeductible: HurricaneDeductible | null;
  /** When it was last saved (ms); absent before the first save. */
  updatedAt?: number;
}

/** A renewal this many days away or fewer is "soon": the same window the weekly email reminds in. */
export const RENEWAL_WINDOW_DAYS = 60;
const MAX_DOLLARS = 100_000_000;

/** E2E: window.__e2e_insurance_policies = { [propertyId]: InsurancePolicy } stands in for the canister. */
function e2ePolicies(): Record<string, InsurancePolicy> | undefined {
  return typeof window !== "undefined" ? (window as any).__e2e_insurance_policies : undefined;
}

function fromCanister(raw: PropertyTypes.InsurancePolicy): InsurancePolicy {
  const d = raw.hurricaneDeductible[0];
  return {
    carrier: raw.carrier,
    policyNumber: raw.policyNumber,
    renewalDate: raw.renewalDate,
    coverageA: raw.coverageACents.length ? Number(raw.coverageACents[0]) / 100 : null,
    hurricaneDeductible: !d
      ? null
      : "PercentOfCoverageA" in d
        ? { kind: "percent", percent: Number(d.PercentOfCoverageA) }
        : { kind: "amount", dollars: Number(d.Amount) / 100 },
    updatedAt: Math.floor(Number(raw.updatedAt) / 1_000_000),
  };
}

function toCanister(p: InsurancePolicy): PropertyTypes.InsurancePolicyInput {
  const cents = (dollars: number) => BigInt(Math.round(dollars * 100));
  const d = p.hurricaneDeductible;
  return {
    carrier: p.carrier,
    policyNumber: p.policyNumber,
    renewalDate: p.renewalDate,
    coverageACents: p.coverageA === null ? [] : [cents(p.coverageA)],
    hurricaneDeductible: !d
      ? []
      : [d.kind === "percent" ? { PercentOfCoverageA: BigInt(d.percent) } : { Amount: cents(d.dollars) }],
  };
}

export const insurancePolicyService = {
  async get(propertyId: string): Promise<InsurancePolicy | null> {
    const e2e = e2ePolicies();
    if (e2e) return e2e[propertyId] ?? null;
    const a = await getActor();
    const res = await a.getInsurancePolicy(propertyId);
    if ("err" in res) throw canisterError(res.err);
    return res.ok.length ? fromCanister(res.ok[0]) : null;
  },

  /** Save the policy, or clear it with null. */
  async save(propertyId: string, policy: InsurancePolicy | null): Promise<void> {
    const e2e = e2ePolicies();
    if (e2e) {
      if (policy) e2e[propertyId] = policy;
      else delete e2e[propertyId];
      return;
    }
    const a = await getActor();
    const res = await a.setInsurancePolicy(propertyId, policy ? [toCanister(policy)] : []);
    if ("err" in res) throw canisterError(res.err);
  },
};

/** UTC midnight of a real "YYYY-MM-DD" date, or null. */
export function isoDateMs(date: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(ms).toISOString().startsWith(date) ? ms : null;
}

export interface RenewalStatus {
  /** Whole days from today to the renewal date; negative once it has passed. */
  days: number;
  tone: "soon" | "later" | "passed";
}

/** How far off the renewal is, counted in calendar days (UTC, like the weekly email). */
export function renewalStatus(renewalDate: string, nowMs: number): RenewalStatus | null {
  const renews = isoDateMs(renewalDate);
  if (renews === null) return null;
  const now = new Date(nowMs);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = Math.round((renews - today) / 86_400_000);
  return { days, tone: days < 0 ? "passed" : days <= RENEWAL_WINDOW_DAYS ? "soon" : "later" };
}

/** The hurricane deductible in dollars: a percent worked out of Coverage A. Null when it can't be. */
export function hurricaneDeductibleDollars(p: InsurancePolicy): number | null {
  const d = p.hurricaneDeductible;
  if (!d) return null;
  if (d.kind === "amount") return d.dollars;
  return p.coverageA === null ? null : Math.round((p.coverageA * d.percent) / 100);
}

/** The canister's rules, checked before saving. Returns the problem, or null. */
export function validatePolicy(p: InsurancePolicy): string | null {
  if (p.carrier.trim().length === 0) return "Enter the insurance company";
  if (p.carrier.length > 100) return "Insurance company name is over 100 characters";
  if (p.policyNumber.length > 60) return "Policy number is over 60 characters";
  const year = Number(p.renewalDate.slice(0, 4));
  if (isoDateMs(p.renewalDate) === null || year < 2000 || year > 2100) return "Enter a real renewal date";
  if (p.coverageA !== null) {
    if (!(p.coverageA >= 0)) return "Coverage A must be a dollar amount";
    if (p.coverageA > MAX_DOLLARS) return "Coverage A is over $100,000,000";
  }
  const d = p.hurricaneDeductible;
  if (d?.kind === "percent") {
    if (!Number.isInteger(d.percent)) return "Hurricane deductible percent must be a whole number";
    if (d.percent < 1 || d.percent > 25) return "Hurricane deductible percent must be 1 to 25";
  }
  if (d?.kind === "amount") {
    if (!(d.dollars >= 0)) return "Hurricane deductible must be a dollar amount";
    if (d.dollars > MAX_DOLLARS) return "Hurricane deductible is over $100,000,000";
  }
  return null;
}
