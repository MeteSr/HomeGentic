import { HttpAgent, Actor } from "@icp-sdk/core/agent";
import { IDL }              from "@icp-sdk/core/candid";
import { getIcpAgent }      from "./icpAgent";

export type Urgency = "Low" | "Medium" | "High" | "Emergency";

export interface Lead {
  id:          string;
  serviceType: string;
  description: string;
  urgency:     Urgency;
  propertyZip: string;
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

const quoteIdlFactory = ({ IDL: I }: { IDL: typeof IDL }) => {
  const ServiceType = I.Variant({
    Roofing: I.Null, HVAC: I.Null, Plumbing: I.Null, Electrical: I.Null,
    Painting: I.Null, Flooring: I.Null, Windows: I.Null, Landscaping: I.Null,
  } as Record<string, IDL.Type>);
  const UrgencyLevel = I.Variant({
    Low: I.Null, Medium: I.Null, High: I.Null, Emergency: I.Null,
  } as Record<string, IDL.Type>);
  const RequestStatus = I.Variant({
    Open: I.Null, Quoted: I.Null, Accepted: I.Null, Closed: I.Null, Cancelled: I.Null,
  } as Record<string, IDL.Type>);
  const QuoteRequest = I.Record({
    id:          I.Text,
    propertyId:  I.Text,
    homeowner:   I.Principal,
    serviceType: ServiceType,
    description: I.Text,
    urgency:     UrgencyLevel,
    status:      RequestStatus,
    createdAt:   I.Int,
    closeAt:     I.Opt(I.Int),
  });
  return I.Service({
    getOpenRequests: I.Func([], [I.Vec(QuoteRequest)], ["query"]),
  });
};

const jobIdlFactory = ({ IDL: I }: { IDL: typeof IDL }) => {
  const ServiceType = I.Variant({
    Roofing: I.Null, HVAC: I.Null, Plumbing: I.Null, Electrical: I.Null,
    Painting: I.Null, Flooring: I.Null, Windows: I.Null, Landscaping: I.Null,
  } as Record<string, IDL.Type>);
  const JobStatus = I.Variant({
    Pending: I.Null, InProgress: I.Null, Completed: I.Null, Verified: I.Null,
    PendingHomeownerApproval: I.Null, RejectedByHomeowner: I.Null,
  } as Record<string, IDL.Type>);
  const Job = I.Record({
    id:               I.Text,
    propertyId:       I.Text,
    serviceType:      ServiceType,
    description:      I.Text,
    amount:           I.Nat,
    completedDate:    I.Int,
    status:           JobStatus,
    isDiy:            I.Bool,
    homeownerSigned:  I.Bool,
    contractorSigned: I.Bool,
    contractorName:   I.Opt(I.Text),
  });
  return I.Service({
    getJobsPendingMySignature: I.Func([], [I.Vec(Job)], ["query"]),
  });
};

function fromQuoteRequest(raw: any): Lead {
  return {
    id:          raw.id,
    serviceType: Object.keys(raw.serviceType)[0],
    description: raw.description,
    urgency:     Object.keys(raw.urgency)[0] as Urgency,
    propertyZip: "",  // zip not stored on QuoteRequest; populated if needed via property lookup
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
