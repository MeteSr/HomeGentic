/**
 * Turns canister outbox events into the pushes to send.
 *
 * Events with a recipient map to one push. A new_lead event has no recipient:
 * the relay looks up the quote request and sends to every contractor who opted
 * in to push (notifyPush), lists the trade among their specialties, covers the
 * request's zip, and meets its trust thresholds — the same rules the quote
 * canister's getOpenRequestsForMe applies (verified contractors skip the
 * thresholds; a contractor with no zips covers every zip).
 *
 * The minReviews threshold isn't checked here: review counts aren't on the
 * contractor profile, and an extra push to a contractor who then can't see
 * the lead is harmless.
 */
import type {
  ContractorInfo, NotificationEvent, OutboxEvent, PushPayload, QuoteRequestInfo,
} from "./types";

export interface LeadLookups {
  getQuoteRequest: (requestId: string) => Promise<QuoteRequestInfo | null>;
  getContractors:  () => Promise<ContractorInfo[]>;
}

/** "GeneralHandyman" → "General Handyman"; "HVAC" stays "HVAC". */
export function tradeLabel(tag: string): string {
  return tag.replace(/([a-z])([A-Z])/g, "$1 $2");
}

export function payloadFor(event: OutboxEvent, zipCode?: string | null): PushPayload | null {
  switch (event.kind) {
    case "job_awaiting_signature":
      return {
        title: "A job needs your signature",
        body:  `${event.summary} is waiting for you to sign off.`,
        route: `jobs/${event.refId}`,
      };
    case "job_awaiting_contractor_signature":
      return {
        title: "A job needs your sign-off",
        body:  `The homeowner signed ${event.summary} and is waiting for you.`,
        route: `jobs/${event.refId}`,
      };
    case "bid_accepted":
      return {
        title: "Your bid was accepted",
        body:  `The homeowner picked your ${tradeLabel(event.summary)} quote.`,
        route: "leads",
      };
    case "bid_declined":
      return {
        title: "Bid not selected",
        body:  `The homeowner chose another contractor for their ${tradeLabel(event.summary)} job.`,
        route: "leads",
      };
    case "new_lead":
      return {
        title: "New lead",
        body:  `New ${tradeLabel(event.summary)} request${zipCode ? ` in ${zipCode}` : ""}.`,
        route: `leads/${event.refId}`,
      };
    default:
      return null;
  }
}

export function contractorWantsLead(req: QuoteRequestInfo, c: ContractorInfo): boolean {
  if (!c.notifyPush) return false;
  if (c.principal === req.homeowner) return false;
  if (!c.specialties.includes(req.serviceType)) return false;
  if (req.zipCode) {
    const zips = c.alertZips.length > 0 ? c.alertZips : c.serviceZips;
    if (zips.length > 0 && !zips.includes(req.zipCode)) return false;
  }
  if (!c.isVerified) {
    if (req.minTrustScore    !== null && c.trustScore    < req.minTrustScore)    return false;
    if (req.minJobsCompleted !== null && c.jobsCompleted < req.minJobsCompleted) return false;
  }
  return true;
}

/**
 * The pushes one outbox event produces. `contractors` is fetched at most once
 * per poll by the caller and passed in through `lookups`.
 */
export async function notificationsFor(
  event: OutboxEvent,
  lookups: LeadLookups,
): Promise<NotificationEvent[]> {
  const kind = event.kind as NotificationEvent["type"];

  if (event.kind === "new_lead") {
    const req = await lookups.getQuoteRequest(event.refId);
    // Gone, or already closed by the time we got to it — nothing to bid on.
    if (!req || (req.status !== "Open" && req.status !== "Quoted")) return [];
    const payload = payloadFor(event, req.zipCode);
    if (!payload) return [];
    const contractors = await lookups.getContractors();
    return contractors
      .filter((c) => contractorWantsLead(req, c))
      .map((c) => ({ type: kind, principal: c.principal, payload }));
  }

  const payload = payloadFor(event);
  if (!payload || !event.recipient) return [];
  return [{ type: kind, principal: event.recipient, payload }];
}
