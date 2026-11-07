/**
 * #711 claim kit: the household's own record of an insurance claim on the home
 * (property canister: createInsuranceClaim, updateInsuranceClaim,
 * addInsuranceClaimLog, deleteInsuranceClaim, getInsuranceClaims). Nothing
 * here files a claim or contacts the insurer. Damage photos go to the photo
 * canister under the claim's own id (claimPhotoJobId), stamped with the time
 * they were uploaded.
 */
import { lazyActor } from "./lazyActor";
import { idlFactory } from "@homegentic/shared/declarations/property";
import type { _SERVICE as PropertyCanister } from "@homegentic/shared/types/property";
import type * as PropertyTypes from "@homegentic/shared/types/property";
import { canisterError } from "./candid";
import { isoDateMs } from "./insurancePolicy";
import { formatIsoDate } from "@/utils/format";

const PROPERTY_CANISTER_ID = (process.env as any).PROPERTY_CANISTER_ID || "";
const getActor = lazyActor<PropertyCanister>(idlFactory, PROPERTY_CANISTER_ID);

export type ClaimStatus = "open" | "closed";

export interface ClaimInput {
  title: string;
  /** "YYYY-MM-DD" */
  dateOfLoss: string;
  cause: string;
  description: string;
  claimNumber: string;
  adjusterName: string;
  adjusterContact: string;
  status: ClaimStatus;
}

export interface ClaimLogEntry {
  /** "YYYY-MM-DD", the day it happened. */
  date: string;
  note: string;
  /** When it was written down (ms). */
  addedAt: number;
}

export interface InsuranceClaim extends ClaimInput {
  id: string;
  propertyId: string;
  log: ClaimLogEntry[];
  createdAt: number;
  updatedAt: number;
}

export const EMPTY_CLAIM: ClaimInput = {
  title: "",
  dateOfLoss: "",
  cause: "",
  description: "",
  claimNumber: "",
  adjusterName: "",
  adjusterContact: "",
  status: "open",
};

/** Causes offered in the form, with the trade a repair quote starts from. */
export const CLAIM_CAUSES: Array<{ label: string; trade: string }> = [
  { label: "Wind or hurricane", trade: "Roofing" },
  { label: "Hail", trade: "Roofing" },
  { label: "Water leak", trade: "Plumbing" },
  { label: "Flood", trade: "Other" },
  { label: "Fire or smoke", trade: "Other" },
  { label: "Theft or vandalism", trade: "Other" },
  { label: "Other", trade: "Other" },
];

/** The photo canister jobId the claim's damage photos are filed under. */
export function claimPhotoJobId(claimId: string): string {
  return `claim_${claimId}`;
}

/** location.state.prefill for /quotes/new: the home, a starting trade, and what happened. */
export function repairQuotePrefill(c: InsuranceClaim): Record<string, string> {
  const trade = CLAIM_CAUSES.find((x) => x.label === c.cause)?.trade ?? "Other";
  const parts = [`Repair needed after: ${c.title} (loss on ${formatIsoDate(c.dateOfLoss)}).`];
  if (c.description.trim()) parts.push(c.description.trim().replace(/([^.!?])$/, "$1."));
  if (c.claimNumber.trim()) parts.push(`Insurance claim ${c.claimNumber.trim()}.`);
  return { propertyId: c.propertyId, serviceType: trade, description: parts.join(" ") };
}

const nsToMs = (ns: bigint) => Math.floor(Number(ns) / 1_000_000);

function fromCanister(r: PropertyTypes.InsuranceClaim): InsuranceClaim {
  return {
    id: r.id,
    propertyId: r.propertyId,
    title: r.title,
    dateOfLoss: r.dateOfLoss,
    cause: r.cause,
    description: r.description,
    claimNumber: r.claimNumber,
    adjusterName: r.adjusterName,
    adjusterContact: r.adjusterContact,
    status: "Closed" in r.status ? "closed" : "open",
    log: r.log.map((e) => ({ date: e.date, note: e.note, addedAt: nsToMs(e.addedAt) })),
    createdAt: nsToMs(r.createdAt),
    updatedAt: nsToMs(r.updatedAt),
  };
}

function toCanister(c: ClaimInput): PropertyTypes.ClaimInput {
  return { ...c, status: c.status === "closed" ? { Closed: null } : { Open: null } };
}

/** E2E: window.__e2e_insurance_claims = { [propertyId]: InsuranceClaim[] } stands in for the canister. */
function e2eClaims(): Record<string, InsuranceClaim[]> | undefined {
  return typeof window !== "undefined" ? (window as any).__e2e_insurance_claims : undefined;
}

function e2eFind(store: Record<string, InsuranceClaim[]>, id: string): InsuranceClaim {
  const c = Object.values(store)
    .flat()
    .find((x) => x.id === id);
  if (!c) throw new Error("Claim not found");
  return c;
}

function e2eReplace(store: Record<string, InsuranceClaim[]>, next: InsuranceClaim) {
  store[next.propertyId] = (store[next.propertyId] ?? []).map((x) => (x.id === next.id ? next : x));
}

function unwrap<T>(res: { ok: T } | { err: PropertyTypes.Error }): T {
  if ("err" in res) throw canisterError(res.err);
  return res.ok;
}

export const insuranceClaimService = {
  async list(propertyId: string): Promise<InsuranceClaim[]> {
    const e2e = e2eClaims();
    if (e2e) return [...(e2e[propertyId] ?? [])];
    const a = await getActor();
    return unwrap(await a.getInsuranceClaims(propertyId)).map(fromCanister);
  },

  async create(propertyId: string, input: ClaimInput): Promise<InsuranceClaim> {
    const e2e = e2eClaims();
    if (e2e) {
      const now = Date.now();
      const c: InsuranceClaim = {
        ...input,
        id: `e2e-claim-${now}`,
        propertyId,
        log: [],
        createdAt: now,
        updatedAt: now,
      };
      e2e[propertyId] = [c, ...(e2e[propertyId] ?? [])];
      return c;
    }
    const a = await getActor();
    return fromCanister(unwrap(await a.createInsuranceClaim(propertyId, toCanister(input))));
  },

  async update(claimId: string, input: ClaimInput): Promise<InsuranceClaim> {
    const e2e = e2eClaims();
    if (e2e) {
      const next = { ...e2eFind(e2e, claimId), ...input, updatedAt: Date.now() };
      e2eReplace(e2e, next);
      return next;
    }
    const a = await getActor();
    return fromCanister(unwrap(await a.updateInsuranceClaim(claimId, toCanister(input))));
  },

  async addLog(claimId: string, date: string, note: string): Promise<InsuranceClaim> {
    const e2e = e2eClaims();
    if (e2e) {
      const c = e2eFind(e2e, claimId);
      const next = { ...c, log: [...c.log, { date, note, addedAt: Date.now() }] };
      e2eReplace(e2e, next);
      return next;
    }
    const a = await getActor();
    return fromCanister(unwrap(await a.addInsuranceClaimLog(claimId, date, note)));
  },

  async remove(claimId: string): Promise<void> {
    const e2e = e2eClaims();
    if (e2e) {
      const c = e2eFind(e2e, claimId);
      e2e[c.propertyId] = e2e[c.propertyId].filter((x) => x.id !== claimId);
      return;
    }
    const a = await getActor();
    unwrap(await a.deleteInsuranceClaim(claimId));
  },
};

const realDate = (d: string) => isoDateMs(d) !== null && Number(d.slice(0, 4)) >= 2000 && Number(d.slice(0, 4)) <= 2100;

/** The canister's rules for a claim. Returns the problem, or null. */
export function validateClaim(c: ClaimInput): string | null {
  const t = c.title.trim();
  if (!t) return "Give the claim a short title";
  if (t.length > 100) return "Title is over 100 characters";
  if (!realDate(c.dateOfLoss)) return "Enter a real date of loss";
  if (c.cause.trim().length > 60) return "Cause is over 60 characters";
  if (c.description.trim().length > 2000) return "Description is over 2,000 characters";
  if (c.claimNumber.trim().length > 60) return "Claim number is over 60 characters";
  if (c.adjusterName.trim().length > 100) return "Adjuster name is over 100 characters";
  if (c.adjusterContact.trim().length > 200) return "Adjuster contact is over 200 characters";
  return null;
}

/** The canister's rules for a log entry. Returns the problem, or null. */
export function validateLogEntry(date: string, note: string): string | null {
  if (!realDate(date)) return "Enter the date it happened";
  if (!note.trim()) return "Write what happened";
  if (note.trim().length > 1000) return "Log note is over 1,000 characters";
  return null;
}
