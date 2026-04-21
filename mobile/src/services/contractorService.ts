import { HttpAgent } from "@icp-sdk/core/agent";

export type Urgency = "Low" | "Medium" | "High" | "Emergency";

export interface Lead {
  id:          string;
  serviceType: string;
  description: string;
  urgency:     Urgency;
  propertyZip: string;
}

export interface PendingSignatureJob {
  id:            string;
  propertyAddress: string;
  serviceType:   string;
  completedDate: string;
  amountCents:   number;
  awaitingRole:  "homeowner" | "contractor";
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

export async function getLeads(_agent?: HttpAgent): Promise<Lead[]> {
  throw new Error("Not implemented: getLeads — wire to quote canister getOpenRequests");
}

export async function getPendingSignatureJobs(_agent?: HttpAgent): Promise<PendingSignatureJob[]> {
  throw new Error("Not implemented: getPendingSignatureJobs — wire to job canister getPendingProposals");
}

export async function getEarningsSummary(_agent?: HttpAgent): Promise<EarningsSummary> {
  throw new Error("Not implemented: getEarningsSummary — wire to job canister getEarningsSummary");
}
