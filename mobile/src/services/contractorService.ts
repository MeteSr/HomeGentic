import { HttpAgent, Actor } from "@icp-sdk/core/agent";
import { idlFactory as quoteIdlFactory } from "@homegentic/shared/declarations/quote";
import { idlFactory as jobIdlFactory } from "@homegentic/shared/declarations/job";
import { idlFactory as contractorIdlFactory } from "@homegentic/shared/declarations/contractor";
import { getIcpAgent }      from "./icpAgent";
import { referralFeeCents, isFeeFloored, type PlanTier } from "./planService";
import { serviceTypeLabel } from "@homegentic/shared/serviceTypes";
import type { Job } from "./jobService";

export type Urgency = "Low" | "Medium" | "High" | "Emergency";

export interface Lead {
  id:          string;
  serviceType: string;
  description: string;
  urgency:     Urgency;
  propertyZip: string;
  createdAt?:  number;          // ms
  closeAt?:    number | null;   // ms
}

export interface ContractorProfile {
  name:          string;
  specialties:   string[];   // service type keys
  trustScore:    number;
  jobsCompleted: number;
  isVerified:    boolean;
}

export interface PendingSignatureJob {
  id:              string;
  propertyAddress: string;
  serviceType:     string;
  completedDate:   string;
  amountCents:     number;
  awaitingRole:    "homeowner" | "contractor";
}

export interface EarningsSummary {
  verifiedJobCount:  number;
  totalEarnedCents:  number;
  pendingJobCount:   number;
}

const URGENCY_ORDER: Record<Urgency, number> = { Emergency: 0, High: 1, Medium: 2, Low: 3 };

/** Pure — testable with no async/native deps */
export function formatPendingStatus(awaitingRole: "homeowner" | "contractor"): string {
  return awaitingRole === "contractor" ? "Your signature needed" : "Awaiting homeowner";
}

/** Pure — contractor-action jobs float to the top, then stable by completedDate */
export function sortPendingJobs(jobs: PendingSignatureJob[]): PendingSignatureJob[] {
  return [...jobs].sort((a, b) => {
    if (a.awaitingRole === b.awaitingRole) return 0;
    return a.awaitingRole === "contractor" ? -1 : 1;
  });
}

/** Pure — testable with no async/native deps */
export function filterLeadsBySpecialties(leads: Lead[], specialties: string[]): Lead[] {
  const filtered = specialties.length === 0
    ? [...leads]
    : leads.filter((l) => specialties.includes(l.serviceType));
  return filtered.sort((a, b) => URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency]);
}

/** Pure — testable with no async/native deps */
export function formatEarnings(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style:                 "currency",
    currency:              "USD",
    maximumFractionDigits: 0,
  });
}

// ── Canister wiring ───────────────────────────────────────────────────────────

const QUOTE_CANISTER_ID = process.env.EXPO_PUBLIC_QUOTE_CANISTER_ID ?? "";
const JOB_CANISTER_ID   = process.env.EXPO_PUBLIC_JOB_CANISTER_ID   ?? "";



function fromQuoteRequest(raw: any): Lead {
  return {
    id:          raw.id,
    serviceType: Object.keys(raw.serviceType)[0],
    description: raw.description,
    urgency:     Object.keys(raw.urgency)[0] as Urgency,
    propertyZip: raw.zipCode?.[0] ?? "",
    createdAt:   Number(raw.createdAt) / 1_000_000,
    closeAt:     raw.closeAt?.length ? Number(raw.closeAt[0]) / 1_000_000 : null,
  };
}

function nsToDateStr(ns: bigint): string {
  const ms = Number(ns) / 1_000_000;
  return ms > 0 ? new Date(ms).toISOString().slice(0, 10) : "";
}

function fromPendingJob(raw: any): PendingSignatureJob {
  // Determine which party still needs to sign
  const awaitingRole: "homeowner" | "contractor" =
    raw.homeownerSigned && !raw.contractorSigned ? "contractor" : "homeowner";
  return {
    id:              raw.id,
    propertyAddress: raw.propertyId,   // address not available on Job; show propertyId
    serviceType:     Object.keys(raw.serviceType)[0],
    completedDate:   nsToDateStr(raw.completedDate),
    amountCents:     Number(raw.amount),
    awaitingRole,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function getLeads(agent?: HttpAgent): Promise<Lead[]> {
  const ag = agent ?? getIcpAgent();
  const a = Actor.createActor(quoteIdlFactory as any, {
    agent: ag,
    canisterId: QUOTE_CANISTER_ID,
  });
  const raw: any[] = await (a as any).getOpenRequests();
  return raw.map(fromQuoteRequest);
}

export async function getPendingSignatureJobs(agent?: HttpAgent): Promise<PendingSignatureJob[]> {
  const ag = agent ?? getIcpAgent();
  const a = Actor.createActor(jobIdlFactory as any, {
    agent: ag,
    canisterId: JOB_CANISTER_ID,
  });
  const raw: any[] = await (a as any).getJobsPendingMySignature();
  return raw.map(fromPendingJob);
}

/**
 * Returns an earnings summary for the current contractor.
 *
 * pendingJobCount: sourced from jobs currently awaiting this contractor's signature.
 * verifiedJobCount / totalEarnedCents: the job canister does not yet expose a
 * per-contractor aggregate query. Both fields return 0 until the canister adds
 * getContractorVerifiedJobs() (tracked in MeteSr/homegentic#141).
 */
export async function getEarningsSummary(agent?: HttpAgent): Promise<EarningsSummary> {
  const pending = await getPendingSignatureJobs(agent);
  return {
    verifiedJobCount: 0,
    totalEarnedCents: 0,
    pendingJobCount:  pending.filter((j) => j.awaitingRole === "contractor").length,
  };
}

const CONTRACTOR_CANISTER_ID = process.env.EXPO_PUBLIC_CONTRACTOR_CANISTER_ID ?? "";

/** The signed-in contractor's profile, or null if they haven't set one up. */
export async function getMyContractorProfile(agent?: HttpAgent): Promise<ContractorProfile | null> {
  if (!CONTRACTOR_CANISTER_ID) return null;
  const a = Actor.createActor(contractorIdlFactory as any, { agent: agent ?? getIcpAgent(), canisterId: CONTRACTOR_CANISTER_ID });
  const r: any = await (a as any).getMyProfile();
  if (!("ok" in r)) return null;
  return {
    name:          r.ok.name,
    specialties:   r.ok.specialties.map((v: any) => Object.keys(v)[0]),
    trustScore:    Number(r.ok.trustScore),
    jobsCompleted: Number(r.ok.jobsCompleted),
    isVerified:    r.ok.isVerified,
  };
}

// ── Earnings ledger (pure) ────────────────────────────────────────────────────

export interface LedgerRow {
  id:          string;
  label:       string;   // "Roofing · 412 Grandview Ave"
  amountCents: number;
  feeCents:    number;
  feeLabel:    string;   // "$37.20 FEE · 3%", "$20.00 FEE · MINIMUM", "NO FEE · CONTRACTOR PRO"
}

export interface Ledger {
  month:         string;   // "OCTOBER"
  monthLong:     string;   // "October 2026"
  rows:          LedgerRow[];
  totalCents:    number;
  feeTotalCents: number;
  /** What the same month would cost on ContractorFree — shown to Pro as savings and to Free as the upsell. */
  freeFeeCents:  number;
}

/**
 * Verified winning bids completed this calendar month, newest first, with
 * the referral fee each carries on the contractor's tier.
 */
export function buildLedger(jobs: Job[], tier: PlanTier, addresses: Record<string, string> = {}, now = new Date()): Ledger {
  const y = now.getFullYear(), m = now.getMonth();
  const inMonth = jobs.filter((j) => {
    if (!j.verified || !j.completedDate) return false;
    const d = new Date(j.completedDate);
    return d.getUTCFullYear() === y && d.getUTCMonth() === m;
  }).sort((a, b) => b.completedDate.localeCompare(a.completedDate));

  const rows = inMonth.map((j) => {
    const fee = referralFeeCents(j.amountCents, tier);
    const feeLabel = tier === "ContractorPro"
      ? "NO FEE · CONTRACTOR PRO"
      : `$${(fee / 100).toFixed(2)} FEE · ${isFeeFloored(j.amountCents) ? "MINIMUM" : "3%"}`;
    const where = addresses[j.propertyId];
    return {
      id: j.id,
      label: `${serviceTypeLabel(j.serviceType)}${where ? ` · ${where}` : ""}`,
      amountCents: j.amountCents,
      feeCents: fee,
      feeLabel,
    };
  });

  return {
    month:         now.toLocaleDateString("en-US", { month: "long" }).toUpperCase(),
    monthLong:     now.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    rows,
    totalCents:    rows.reduce((s, r) => s + r.amountCents, 0),
    feeTotalCents: rows.reduce((s, r) => s + r.feeCents, 0),
    freeFeeCents:  inMonth.reduce((s, j) => s + referralFeeCents(j.amountCents, "ContractorFree"), 0),
  };
}
