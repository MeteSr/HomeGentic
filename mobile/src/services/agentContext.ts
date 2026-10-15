/**
 * Builds the context the voice Worker's prompt needs (see agents/voice/types.ts):
 * the active property, its jobs, signatures, open quotes and score for
 * homeowners; profile, leads, signatures and this month's fees for contractors.
 */
import type { AgentContext } from "./agentService";
import { getJobs, getJobsPendingMySignature, getMyReferralJobs, Job } from "./jobService";
import { getMyQuoteRequests, isOpenRequest } from "./quoteService";
import { getLeads, getMyContractorProfile, getPendingSignatureJobs, buildLedger } from "./contractorService";
import { getStreetAddresses, Property } from "./propertyService";
import { computeBreakdown, computeScore, getScoreGrade, scoreHint } from "./scoreService";
import { PlanLimits, PlanTier, tierName } from "./planService";
import { serviceTypeLabel } from "./serviceTypes";

const DAY_MS = 86_400_000;

export function planSummary(tier: PlanTier, limits: PlanLimits): string {
  switch (tier) {
    case "Free":           return `Free covers ${limits.propertyLimit} property, ${limits.photosPerJob} photos per job and 3 open quote requests. Pro is $59 a year for 20 properties, shared access and PDF export, bought on homegentic.app.`;
    case "Pro":            return "Pro ($59 a year) covers 20 properties, shared access, PDF export and unlimited quote requests. Billing is managed on homegentic.app.";
    case "ContractorFree": return "Contractor Free pays a 3% referral fee on each winning bid, $20 minimum. Contractor Pro is $40 a month with no referral fees, bought on homegentic.app.";
    case "ContractorPro":  return "Contractor Pro ($40 a month) pays no referral fees. Billing is managed on homegentic.app.";
  }
}

export function homeownerContext(input: {
  property: Property;
  jobs: Job[];
  pendingSignatureJobIds: string[];
  openRequests: { id: string; serviceType: string; description: string; urgency: string; status: string }[];
  tier: PlanTier;
  limits: PlanLimits;
  now?: number;
}): AgentContext {
  const { property: p, jobs } = input;
  const now = input.now ?? Date.now();
  const expiring = jobs.flatMap((j) => {
    if (!j.warrantyMonths || !j.completedDate) return [];
    const exp = new Date(j.completedDate).getTime() + j.warrantyMonths * 30 * DAY_MS;
    const days = Math.ceil((exp - now) / DAY_MS);
    return days >= 0 && days <= 90
      ? [{ jobId: j.id, serviceType: serviceTypeLabel(j.serviceType), daysRemaining: days, expiryDate: new Date(exp).toISOString().slice(0, 10) }]
      : [];
  });
  const score = computeScore(jobs, p, now);
  return {
    role: "Homeowner",
    properties: [{
      id: p.id, address: p.street, city: p.city, state: p.state, zipCode: p.zipCode,
      propertyType: p.propertyType, yearBuilt: p.yearBuilt, squareFeet: p.squareFeet, verificationLevel: p.verificationLevel,
    }],
    recentJobs: jobs.slice(0, 20).map((j) => ({
      id: j.id, serviceType: serviceTypeLabel(j.serviceType), description: j.description, contractorName: j.contractorName,
      amount: j.amountCents, status: j.verified ? "verified" : j.status, date: j.completedDate, warrantyMonths: j.warrantyMonths,
    })),
    expiringWarranties: expiring,
    pendingSignatureJobIds: input.pendingSignatureJobIds,
    openQuoteCount: input.openRequests.length,
    openQuoteRequests: input.openRequests.map((r) => ({ ...r, serviceType: serviceTypeLabel(r.serviceType), bidCount: 0 })),
    score: {
      score,
      grade: getScoreGrade(score),
      breakdown: computeBreakdown(jobs, p),
      recentEvents: [],
      nextActions: [scoreHint(jobs, p, now)],
    },
    plan: { tier: tierName(input.tier), propertyLimit: input.limits.propertyLimit, summary: planSummary(input.tier, input.limits) },
  };
}

export async function loadHomeownerContext(property: Property | null, tier: PlanTier, limits: PlanLimits): Promise<AgentContext> {
  if (!property) {
    return {
      role: "Homeowner", properties: [], recentJobs: [], expiringWarranties: [], pendingSignatureJobIds: [], openQuoteCount: 0,
      plan: { tier: tierName(tier), propertyLimit: limits.propertyLimit, summary: planSummary(tier, limits) },
    };
  }
  const [jobs, toSign, requests] = await Promise.all([
    getJobs(property.id).catch(() => [] as Job[]),
    getJobsPendingMySignature().catch(() => [] as Job[]),
    getMyQuoteRequests(property.id).catch(() => []),
  ]);
  return homeownerContext({
    property,
    jobs,
    pendingSignatureJobIds: toSign.filter((j) => j.propertyId === property.id && !j.homeownerSigned).map((j) => j.id),
    openRequests: requests.filter((r) => r.propertyId === property.id && isOpenRequest(r)),
    tier,
    limits,
  });
}

export async function loadContractorContext(tier: PlanTier, limits: PlanLimits): Promise<AgentContext> {
  const [profile, leads, pending, referral] = await Promise.all([
    getMyContractorProfile().catch(() => null),
    getLeads().catch(() => []),
    getPendingSignatureJobs().catch(() => []),
    getMyReferralJobs().catch(() => [] as Job[]),
  ]);
  const addresses = await getStreetAddresses([...pending.map((p) => p.propertyAddress), ...referral.map((j) => j.propertyId)]).catch(() => ({} as Record<string, string>));
  const ledger = buildLedger(referral, tier, addresses);
  return {
    role: "Contractor",
    properties: [],
    recentJobs: [],
    expiringWarranties: [],
    pendingSignatureJobIds: pending.filter((p) => p.awaitingRole === "contractor").map((p) => p.id),
    openQuoteCount: leads.length,
    openQuoteRequests: leads.map((l) => ({ id: l.id, serviceType: l.serviceType, description: l.description, urgency: l.urgency, status: "Open", bidCount: 0 })),
    contractorProfile: profile ?? undefined,
    plan: { tier: tierName(tier), propertyLimit: limits.propertyLimit, summary: planSummary(tier, limits) },
    contractorSignatures: pending.map((p) => ({
      serviceType: serviceTypeLabel(p.serviceType),
      // PendingSignatureJob.propertyAddress holds the property id until resolved here.
      address: addresses[p.propertyAddress] ?? "a client's home",
      amountDollars: Math.round(p.amountCents / 100),
      awaiting: p.awaitingRole,
    })),
    contractorEarnings: {
      month: ledger.monthLong,
      jobs: ledger.rows.map((r) => ({ label: r.label, amountDollars: Math.round(r.amountCents / 100), feeDollars: r.feeCents / 100 })),
      feeTotalDollars: ledger.feeTotalCents / 100,
      feeRule: tier === "ContractorPro" ? "waived on Contractor Pro" : "3% of each winning bid, $20 minimum",
    },
  };
}
