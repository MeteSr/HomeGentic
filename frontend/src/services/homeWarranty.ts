/**
 * #719: the home warranty plan (a service contract on the home's systems and
 * appliances) and the claims filed under it, kept on the property canister.
 * It's the owner's own record of what the contract says: HomeGentic doesn't
 * sell or rate these plans, and nothing here is sent to or checked with the
 * warranty company. The weekly Home Pulse email reminds the owner in the 60
 * days before the renewal date.
 *
 * E2E: window.__e2e_home_warranty = { plans: { [propertyId]: plan }, claims: { [propertyId]: claim[] } }.
 */
import { lazyActor } from "./lazyActor";
import { idlFactory } from "@homegentic/shared/declarations/property";
import type { _SERVICE as PropertyCanister } from "@homegentic/shared/types/property";
import type * as PropertyTypes from "@homegentic/shared/types/property";
import { canisterError } from "./candid";
import { isoDateMs } from "./insurancePolicy";

const PROPERTY_CANISTER_ID = (process.env as any).PROPERTY_CANISTER_ID || "";
const getActor = lazyActor<PropertyCanister>(idlFactory, PROPERTY_CANISTER_ID);

export interface HomeWarrantyPlan {
  provider: string;
  planName: string;
  contractNumber: string;
  /** Phone number or website for filing a claim. */
  claimContact: string;
  /** Service-call fee per claim, dollars. */
  serviceFee: number | null;
  /** "YYYY-MM-DD" or "". */
  startDate: string;
  renewalDate: string;
  coverageNotes: string;
  exclusionNotes: string;
  /** The contract, a document in the home's vault. */
  contractDocId: string | null;
  updatedAt?: number;
}

export const CLAIM_OUTCOMES = ["Open", "Approved", "PartlyApproved", "Denied", "Withdrawn"] as const;
export type ClaimOutcome = (typeof CLAIM_OUTCOMES)[number];
export const CLAIM_OUTCOME_LABELS: Record<ClaimOutcome, string> = {
  Open: "Open",
  Approved: "Approved",
  PartlyApproved: "Partly approved",
  Denied: "Denied",
  Withdrawn: "Withdrawn",
};

export interface WarrantyClaim {
  id?: string;
  dateFiled: string;
  issue: string;
  claimNumber: string;
  /** The job on record for the visit or repair. */
  jobId: string | null;
  /** Dollars. */
  serviceFeePaid: number | null;
  outcome: ClaimOutcome;
  outcomeNotes: string;
  createdAt?: number;
}

export const EMPTY_PLAN: HomeWarrantyPlan = {
  provider: "",
  planName: "",
  contractNumber: "",
  claimContact: "",
  serviceFee: null,
  startDate: "",
  renewalDate: "",
  coverageNotes: "",
  exclusionNotes: "",
  contractDocId: null,
};

export const EMPTY_CLAIM: WarrantyClaim = {
  dateFiled: "",
  issue: "",
  claimNumber: "",
  jobId: null,
  serviceFeePaid: null,
  outcome: "Open",
  outcomeNotes: "",
};

const MAX_FEE = 1_000;
const nsToMs = (ns: bigint) => Math.floor(Number(ns) / 1_000_000);
const opt = (v: string | null): [] | [string] => (v ? [v] : []);
const unopt = (v: [] | [string]): string | null => (v.length ? v[0] : null);
const cents = (d: number | null): [] | [bigint] => (d === null ? [] : [BigInt(Math.round(d * 100))]);
const dollars = (c: [] | [bigint]): number | null => (c.length ? Number(c[0]) / 100 : null);

function planIn(p: HomeWarrantyPlan): PropertyTypes.HomeWarrantyPlanInput {
  return {
    provider: p.provider,
    planName: p.planName,
    contractNumber: p.contractNumber,
    claimContact: p.claimContact,
    serviceFeeCents: cents(p.serviceFee),
    startDate: p.startDate,
    renewalDate: p.renewalDate,
    coverageNotes: p.coverageNotes,
    exclusionNotes: p.exclusionNotes,
    contractDocId: opt(p.contractDocId),
  };
}

function planOut(raw: PropertyTypes.HomeWarrantyPlan): HomeWarrantyPlan {
  return {
    provider: raw.provider,
    planName: raw.planName,
    contractNumber: raw.contractNumber,
    claimContact: raw.claimContact,
    serviceFee: dollars(raw.serviceFeeCents),
    startDate: raw.startDate,
    renewalDate: raw.renewalDate,
    coverageNotes: raw.coverageNotes,
    exclusionNotes: raw.exclusionNotes,
    contractDocId: unopt(raw.contractDocId),
    updatedAt: nsToMs(raw.updatedAt),
  };
}

function claimIn(c: WarrantyClaim): PropertyTypes.HomeWarrantyClaimInput {
  return {
    dateFiled: c.dateFiled,
    issue: c.issue,
    claimNumber: c.claimNumber,
    jobId: opt(c.jobId),
    serviceFeePaidCents: cents(c.serviceFeePaid),
    outcome: { [c.outcome]: null } as PropertyTypes.WarrantyClaimOutcome,
    outcomeNotes: c.outcomeNotes,
  };
}

function claimOut(raw: PropertyTypes.HomeWarrantyClaim): WarrantyClaim {
  return {
    id: raw.id,
    dateFiled: raw.dateFiled,
    issue: raw.issue,
    claimNumber: raw.claimNumber,
    jobId: unopt(raw.jobId),
    serviceFeePaid: dollars(raw.serviceFeePaidCents),
    outcome: Object.keys(raw.outcome)[0] as ClaimOutcome,
    outcomeNotes: raw.outcomeNotes,
    createdAt: nsToMs(raw.createdAt),
  };
}

interface E2eStore {
  plans: Record<string, HomeWarrantyPlan>;
  claims: Record<string, WarrantyClaim[]>;
}
function e2e(): E2eStore | undefined {
  const s = typeof window !== "undefined" ? (window as any).__e2e_home_warranty : undefined;
  if (s) {
    s.plans ??= {};
    s.claims ??= {};
  }
  return s;
}
function e2eFind(s: E2eStore, id: string): [string, number] | null {
  for (const [pid, list] of Object.entries(s.claims)) {
    const i = list.findIndex((c) => c.id === id);
    if (i >= 0) return [pid, i];
  }
  return null;
}

const byFiledDesc = (a: WarrantyClaim, b: WarrantyClaim) =>
  b.dateFiled.localeCompare(a.dateFiled) || (b.createdAt ?? 0) - (a.createdAt ?? 0);

export const homeWarrantyService = {
  async getPlan(propertyId: string): Promise<HomeWarrantyPlan | null> {
    const s = e2e();
    if (s) return s.plans[propertyId] ?? null;
    const res = await (await getActor()).getHomeWarrantyPlan(propertyId);
    if ("err" in res) throw canisterError(res.err);
    return res.ok.length ? planOut(res.ok[0]) : null;
  },

  /** Save the plan, or clear it with null. */
  async savePlan(propertyId: string, plan: HomeWarrantyPlan | null): Promise<void> {
    const s = e2e();
    if (s) {
      if (plan) s.plans[propertyId] = { ...plan, updatedAt: Date.now() };
      else delete s.plans[propertyId];
      return;
    }
    const res = await (await getActor()).setHomeWarrantyPlan(propertyId, plan ? [planIn(plan)] : []);
    if ("err" in res) throw canisterError(res.err);
  },

  async listClaims(propertyId: string): Promise<WarrantyClaim[]> {
    const s = e2e();
    if (s) return [...(s.claims[propertyId] ?? [])].sort(byFiledDesc);
    const res = await (await getActor()).getHomeWarrantyClaims(propertyId);
    if ("err" in res) throw canisterError(res.err);
    return res.ok.map(claimOut);
  },

  async addClaim(propertyId: string, claim: WarrantyClaim): Promise<WarrantyClaim> {
    const s = e2e();
    if (s) {
      const rec = { ...claim, id: `hwc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, createdAt: Date.now() };
      (s.claims[propertyId] ??= []).push(rec);
      return rec;
    }
    const res = await (await getActor()).addHomeWarrantyClaim(propertyId, claimIn(claim));
    if ("err" in res) throw canisterError(res.err);
    return claimOut(res.ok);
  },

  async updateClaim(id: string, claim: WarrantyClaim): Promise<WarrantyClaim> {
    const s = e2e();
    if (s) {
      const at = e2eFind(s, id);
      if (!at) throw new Error("Not found");
      const rec = { ...s.claims[at[0]][at[1]], ...claim, id };
      s.claims[at[0]][at[1]] = rec;
      return rec;
    }
    const res = await (await getActor()).updateHomeWarrantyClaim(id, claimIn(claim));
    if ("err" in res) throw canisterError(res.err);
    return claimOut(res.ok);
  },

  async deleteClaim(id: string): Promise<void> {
    const s = e2e();
    if (s) {
      const at = e2eFind(s, id);
      if (at) s.claims[at[0]].splice(at[1], 1);
      return;
    }
    const res = await (await getActor()).deleteHomeWarrantyClaim(id);
    if ("err" in res) throw canisterError(res.err);
  },
};

function realDate(d: string): boolean {
  const year = Number(d.slice(0, 4));
  return isoDateMs(d) !== null && year >= 1990 && year <= 2100;
}

/** The canister's rules for a plan, checked before saving. Returns the problem, or null. */
export function validatePlan(p: HomeWarrantyPlan): string | null {
  if (p.provider.trim().length === 0) return "Enter the home warranty company";
  if (p.provider.length > 100) return "Company name is over 100 characters";
  if (p.planName.length > 100) return "Plan name is over 100 characters";
  if (p.contractNumber.length > 60) return "Contract number is over 60 characters";
  if (p.claimContact.length > 200) return "Claim contact is over 200 characters";
  if (p.serviceFee !== null && !(p.serviceFee >= 0 && p.serviceFee <= MAX_FEE)) return "Service fee must be $0 to $1,000";
  if (p.startDate !== "" && !realDate(p.startDate)) return "Enter a real start date";
  if (!realDate(p.renewalDate)) return "Enter a real renewal date";
  if (p.startDate !== "" && p.startDate > p.renewalDate) return "The start date is after the renewal date";
  if (p.coverageNotes.length > 2000) return "Coverage notes are over 2,000 characters";
  if (p.exclusionNotes.length > 2000) return "Exclusion notes are over 2,000 characters";
  return null;
}

/** The canister's rules for a claim. */
export function validateClaim(c: WarrantyClaim): string | null {
  if (c.issue.trim().length === 0) return "Say what the claim is for";
  if (c.issue.length > 120) return "Issue is over 120 characters";
  if (!realDate(c.dateFiled)) return "Enter a real date filed";
  if (c.claimNumber.length > 60) return "Claim number is over 60 characters";
  if (c.serviceFeePaid !== null && !(c.serviceFeePaid >= 0 && c.serviceFeePaid <= MAX_FEE)) return "Service fee must be $0 to $1,000";
  if (c.outcomeNotes.length > 1000) return "Outcome notes are over 1,000 characters";
  return null;
}

/** Service fees paid across the claims, and how many are still open. */
export function claimTotals(claims: WarrantyClaim[]): { feesPaid: number; open: number; count: number } {
  return {
    feesPaid: claims.reduce((s, c) => s + (c.serviceFeePaid ?? 0), 0),
    open: claims.filter((c) => c.outcome === "Open").length,
    count: claims.length,
  };
}
