/**
 * Turns canister outbox events into notifications: who gets told what. Which
 * channels each one then goes out on (push, email, SMS) is decided by the
 * poller from channels.ts and the recipient's preferences.
 *
 * Events with a recipient map to one notification. A new_lead event has no
 * recipient: the relay looks up the quote request and notifies every
 * contractor who lists the trade among their specialties, covers the
 * request's zip, and meets its trust thresholds — the same rules the quote
 * canister's getOpenRequestsForMe applies (verified contractors skip the
 * thresholds; a contractor with no zips covers every zip). Pushes for leads
 * also need the contractor's notifyPush opt-in (pushOptIn).
 *
 * A review_request (a contractor co-signed a job) goes to the homeowner only
 * when the contractor has ContractorPro; summary carries the contractor.
 *
 * A showing_request (listing canister) goes to the FSBO seller; refId is the
 * property and summary the buyer's name. The buyer's contact stays on the
 * canister, readable only by the seller on My Listing.
 *
 * Lead alerts go out at once to ContractorPro and FREE_LEAD_DELAY_MS later to
 * everyone else (notBefore); the poller holds the late ones. The lead itself
 * is visible in the app to every matching contractor straight away.
 *
 * The minReviews threshold isn't checked here: review counts aren't on the
 * contractor profile, and an extra alert to a contractor who then can't see
 * the lead is harmless.
 */
import type {
  ContractorInfo, NotificationEvent, OutboxEvent, PushPayload, QuoteRequestInfo,
} from "./types";

/** How much later contractors without ContractorPro get new-lead alerts. */
export const FREE_LEAD_DELAY_MS = 30 * 60 * 1000;

export interface LeadLookups {
  getQuoteRequest: (requestId: string) => Promise<QuoteRequestInfo | null>;
  getContractors:  () => Promise<ContractorInfo[]>;
  /** Whether the contractor has ContractorPro. A failed lookup counts as no. */
  isPro:           (principal: string) => Promise<boolean>;
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
    case "job_verified":
      return {
        title: "Job verified",
        body:  `${event.summary} is now verified on your home's record.`,
        route: `jobs/${event.refId}`,
      };
    case "sensor_alert":
      return {
        title: "Sensor alert",
        body:  `${event.summary}. We opened a job for it.`,
        route: `jobs/${event.refId}`,
      };
    case "quote_received":
      return {
        title: "New quote",
        body:  `A contractor sent a quote for your ${tradeLabel(event.summary)} request.`,
        route: `quotes/${event.refId}`,
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
    case "review_request":
      return {
        title: "How did your contractor do?",
        body:  "Your job is verified. A short review helps other homeowners pick a contractor.",
        route: `review/${event.summary}/${event.refId}`,
      };
    case "showing_request":
      return {
        title: "New showing request",
        body:  `${event.summary || "A buyer"} asked to see your home. Reply to them from My Listing.`,
        route: `my-listing/${event.refId}`,
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

/** Whether a lead fits this contractor (trade, zip, thresholds); opt-ins are checked later. */
export function contractorWantsLead(req: QuoteRequestInfo, c: ContractorInfo): boolean {
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
 * The notifications one outbox event produces. `contractors` is fetched at most once
 * per poll by the caller and passed in through `lookups`.
 */
export async function notificationsFor(
  event: OutboxEvent,
  lookups: LeadLookups,
  now: number = Date.now(),
): Promise<NotificationEvent[]> {
  const kind = event.kind as NotificationEvent["type"];

  if (event.kind === "new_lead") {
    const req = await lookups.getQuoteRequest(event.refId);
    // Gone, or already closed by the time we got to it — nothing to bid on.
    if (!req || (req.status !== "Open" && req.status !== "Quoted")) return [];
    const payload = payloadFor(event, req.zipCode);
    if (!payload) return [];
    const contractors = await lookups.getContractors();
    const matched = contractors.filter((c) => contractorWantsLead(req, c));
    const pro = await Promise.all(matched.map((c) => lookups.isPro(c.principal).catch(() => false)));
    return matched.map((c, i) => ({
      type: kind, principal: c.principal, payload, pushOptIn: c.notifyPush,
      ...(pro[i] ? {} : { notBefore: now + FREE_LEAD_DELAY_MS }),
    }));
  }

  if (event.kind === "review_request") {
    const pro = event.summary ? await lookups.isPro(event.summary).catch(() => false) : false;
    if (!pro) return [];
  }

  const payload = payloadFor(event);
  if (!payload || !event.recipient) return [];
  return [{ type: kind, principal: event.recipient, payload, pushOptIn: true }];
}
