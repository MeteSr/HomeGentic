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
 * A bid_chosen (listing canister) goes to the agent whose Bid to List bid the
 * seller chose; refId is the proposal, summary the city.
 * A showing_request (listing canister) goes to the FSBO seller; refId is the
 * property and summary the buyer's name. The buyer's contact stays on the
 * canister, readable only by the seller on My Listing.
 *
 * Lead alerts go out at once to ContractorPro and FREE_LEAD_DELAY_MS later to
 * everyone else (notBefore); the poller holds the late ones. The lead itself
 * is visible in the app to every matching contractor straight away.
 *
 * Visit events (quote canister, refId the quote) link the homeowner to their
 * quote request and the contractor to their leads. A booked visit also gets a
 * reminder the day before, held by the poller and sent only if the visit is
 * still booked for that time. Times aren't written out: the relay doesn't
 * know the recipient's time zone, so the message sends them to the app.
 *
 * In-app job payments (quote canister): the contractor's kinds carry the
 * quote as refId and link to their leads; the homeowner's carry the quote
 * request and link to it. summary is the bid as "$1200".
 *
 * The minReviews threshold isn't checked here: review counts aren't on the
 * contractor profile, and an extra alert to a contractor who then can't see
 * the lead is harmless.
 */
import type {
  ContractorInfo, NotificationEvent, OutboxEvent, PushPayload, QuoteRequestInfo, SuccessionNoticeInfo, VisitBookingInfo,
} from "./types";

/** How much later contractors without ContractorPro get new-lead alerts. */
export const FREE_LEAD_DELAY_MS = 30 * 60 * 1000;

export interface LeadLookups {
  getQuoteRequest: (requestId: string) => Promise<QuoteRequestInfo | null>;
  getContractors:  () => Promise<ContractorInfo[]>;
  /** Whether the contractor has ContractorPro. A failed lookup counts as no. */
  isPro:           (principal: string) => Promise<boolean>;
  /** #724: the successor claim behind a succession_* event, or null when it's gone. */
  getSuccessionNotice: (claimId: string) => Promise<SuccessionNoticeInfo | null>;
  /** The visit booking on a quote, or null when it's gone. */
  getVisitBooking: (quoteId: string) => Promise<VisitBookingInfo | null>;
}

/** How long before a booked visit both sides get a reminder. */
export const VISIT_REMINDER_BEFORE_MS = 24 * 60 * 60 * 1000;

const VISIT_KINDS = [
  "visit_times_offered", "visit_booked", "visit_confirmed", "visit_new_times_requested", "visit_cancelled",
];

/** The message for one visit notification, or null for an unknown kind. */
export function visitPayload(kind: string, trade: string, route: string): PushPayload | null {
  const t = tradeLabel(trade);
  switch (kind) {
    case "visit_times_offered":
      return { title: "Pick a visit time", body: `Your ${t} contractor offered times for a visit. Pick the one that suits you.`, route };
    case "visit_booked":
      return { title: "Visit booked", body: `The homeowner picked a time for the ${t} visit. Open HomeGentic to see it.`, route };
    case "visit_confirmed":
      return { title: "Visit booked", body: `Your ${t} visit is booked. Open HomeGentic to see the time.`, route };
    case "visit_new_times_requested":
      return { title: "New visit times requested", body: `The homeowner asked for other times for the ${t} visit. Offer new ones in HomeGentic.`, route };
    case "visit_cancelled":
      return { title: "Visit cancelled", body: `The ${t} visit was cancelled.`, route };
    case "visit_reminder":
      return { title: "Visit tomorrow", body: `The ${t} visit is tomorrow. Open HomeGentic to see the time.`, route };
    default:
      return null;
  }
}

/** The message for one in-app job payment notification, or null for another kind. */
export function jobPaymentPayload(kind: string, amount: string, refId: string): PushPayload | null {
  switch (kind) {
    case "job_payment_processing":
      return {
        title: "Bank payment on its way",
        body: `The homeowner paid ${amount} by bank. Stripe sends it to you once it clears, usually in about 4 business days.`,
        route: "leads",
      };
    case "job_payment_paid":
      return {
        title: "You've been paid",
        body: `The homeowner's ${amount} payment went through. Stripe is sending it to your bank account.`,
        route: "leads",
      };
    case "job_payment_receipt":
      return { title: "Payment complete", body: `Your ${amount} payment to your contractor went through.`, route: `quotes/${refId}` };
    case "job_payment_failed":
      return {
        title: "Payment didn't go through",
        body: `Your ${amount} payment to your contractor didn't go through. Open the job in HomeGentic to try again.`,
        route: `quotes/${refId}`,
      };
    default:
      return null;
  }
}

/**
 * #724: when the household is reminded of an open successor claim, counted
 * from the moment it was opened (the record can't move before day 30).
 */
export const SUCCESSION_REMINDER_AFTER_MS = [15 * 24 * 60 * 60 * 1000, 27 * 24 * 60 * 60 * 1000];

const longDate = (ms: number) =>
  new Date(ms).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

/** The email for one successor-claim notification, or null for an unknown kind. */
export function successionPayload(kind: string, notice: SuccessionNoticeInfo, recipient: string): PushPayload | null {
  const home  = `successor/${notice.propertyId}`;
  const mine  = "successor-claims";
  const date  = longDate(notice.waitEndsAtMs);
  const where = notice.address || "your home";
  switch (kind) {
    case "succession_claim_opened":
      return {
        title: "Someone asked to take over your home record",
        body:  `Someone used the successor link for ${where} to ask HomeGentic to pass the home record to them. ` +
               `If you didn't expect this, open HomeGentic and cancel the claim. The record can't move before ${date}.`,
        route: home, required: true,
      };
    case "succession_claim_reminder":
      return {
        title: "Reminder: a successor claim is open on your home",
        body:  `A successor claim on the home record for ${where} is still open. The record can move to them on or after ${date}` +
               `${notice.status === "Approved" ? "" : " if HomeGentic approves their document"}. ` +
               "If you didn't expect this, open HomeGentic and cancel the claim.",
        route: home, required: true,
      };
    case "succession_claim_approved":
      return recipient === notice.claimant
        ? {
            title: "Your successor claim was approved",
            body:  `HomeGentic approved your document for ${where}. You can take over the home record on or after ${date}, ` +
                   "unless the owner or a co-owner cancels the claim first.",
            route: mine, required: true,
          }
        : {
            title: "A successor claim on your home was approved",
            body:  `HomeGentic approved the document sent with the successor claim on ${where}. ` +
                   `The home record can move to them on or after ${date} unless you cancel the claim in HomeGentic.`,
            route: home, required: true,
          };
    case "succession_claim_rejected":
      return {
        title: "Your successor claim wasn't approved",
        body:  `HomeGentic couldn't approve the document you sent for ${where}. Open HomeGentic to see why; you can send another.`,
        route: mine, required: true,
      };
    case "succession_claim_cancelled":
      return {
        title: "Your successor claim was cancelled",
        body:  `The successor claim on ${where} was cancelled by the home's owner, a co-owner or HomeGentic.`,
        route: mine, required: true,
      };
    default:
      return null;
  }
}

/**
 * First week (property canister): first_home_added (an owner's first home;
 * refId the property, summary its address) brings a welcome email at once and
 * two tips, held until their day and skipped by the poller if the step is
 * done by then. The welcome is email only; the tips are pushed too.
 */
const DAY_MS = 24 * 60 * 60 * 1000;
export const SETUP_TIP_AFTER_MS = { setup_tip_shutoffs: 1 * DAY_MS, setup_tip_paperwork: 3 * DAY_MS } as const;

export function firstWeekPayloads(propertyId: string, address: string): Record<"welcome" | keyof typeof SETUP_TIP_AFTER_MS, PushPayload> {
  const home = address || "your home";
  const data = { propertyId };
  return {
    welcome: {
      title: "Welcome to HomeGentic",
      body:  `Your record for ${home} is started. Two things fill it in fastest: confirm when your main systems ` +
             "were installed, so forecasts start from real years, and log one past job to get your first HomeGentic Score. " +
             "Unless you turn it off in Settings, a Home Pulse email comes each Monday with what's due on your home.",
      route: `systems/${propertyId}`, data,
    },
    setup_tip_shutoffs: {
      title: "Do you know where your water shutoff is?",
      body:  `If a pipe bursts at ${home}, the main water shutoff is the first thing you'll need. Find it, then note ` +
             "where it is in your house guide so anyone at the house can find it too.",
      route: `guide/${propertyId}`, data,
    },
    setup_tip_paperwork: {
      title: "Turn one receipt into a record",
      body:  "Forward a contractor's invoice to your HomeGentic forwarding address (it's on the Jobs page) and we'll " +
             "turn it into a draft job for you to check, or scan an appliance's label to save its brand and model. " +
             `Either one starts the paperwork side of ${home}'s record.`,
      route: "jobs", data,
    },
  };
}

/** The email and push for an ownership review's outcome; summary is the address. */
export function verificationPayload(kind: string, address: string): PushPayload | null {
  const home = address || "your home";
  switch (kind) {
    case "verification_approved":
      return {
        title: "Your home is verified",
        body:  `HomeGentic checked your ownership document for ${home} and verified you as the owner.`,
        route: "property",
      };
    case "verification_rejected":
      return {
        title: "We couldn't verify your home yet",
        body:  `HomeGentic couldn't verify your ownership from the document you sent for ${home}. ` +
               "You can send another from the home's page.",
        route: "property",
      };
    default:
      return null;
  }
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
    case "bid_chosen":
      return {
        title: "A seller chose your bid",
        body:  `A seller${event.summary ? ` in ${event.summary}` : ""} chose your Bid to List bid. Pay the platform fee to see their address and email.`,
        route: `agents/bids/${event.refId}`,
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

  if (event.kind.startsWith("succession_claim_")) {
    if (!event.recipient) return [];
    const notice = await lookups.getSuccessionNotice(event.refId);
    if (!notice) return [];
    const payload = successionPayload(event.kind, notice, event.recipient);
    if (!payload) return [];
    const out: NotificationEvent[] = [{ type: kind, principal: event.recipient, payload, pushOptIn: false }];
    if (event.kind === "succession_claim_opened") {
      const reminder = successionPayload("succession_claim_reminder", notice, event.recipient)!;
      for (const after of SUCCESSION_REMINDER_AFTER_MS) {
        out.push({
          type: "succession_claim_reminder", principal: event.recipient, payload: reminder, pushOptIn: false,
          notBefore: notice.openedAtMs + after,
        });
      }
    }
    return out;
  }

  if (VISIT_KINDS.includes(event.kind)) {
    if (!event.recipient) return [];
    const booking = await lookups.getVisitBooking(event.refId);
    const req = booking ? await lookups.getQuoteRequest(booking.requestId) : null;
    if (!booking || !req) return [];
    const route = event.recipient === req.homeowner ? `quotes/${booking.requestId}` : "leads";
    const payload = visitPayload(event.kind, event.summary, route)!;
    const out: NotificationEvent[] = [{ type: kind, principal: event.recipient, payload, pushOptIn: true }];
    const booked = event.kind === "visit_booked" || event.kind === "visit_confirmed";
    if (booked && booking.status === "Booked" && booking.startsAtMs !== null) {
      const remindAt = booking.startsAtMs - VISIT_REMINDER_BEFORE_MS;
      if (remindAt > now) {
        out.push({
          type: "visit_reminder", principal: event.recipient, pushOptIn: true, notBefore: remindAt,
          payload: { ...visitPayload("visit_reminder", event.summary, route)!, data: { startsAtMs: String(booking.startsAtMs) } },
        });
      }
    }
    return out;
  }

  if (event.kind === "first_home_added") {
    if (!event.recipient) return [];
    const p = firstWeekPayloads(event.refId, event.summary);
    return [
      { type: "welcome", principal: event.recipient, payload: p.welcome, pushOptIn: false },
      ...(Object.keys(SETUP_TIP_AFTER_MS) as (keyof typeof SETUP_TIP_AFTER_MS)[]).map((tip) => ({
        type: tip, principal: event.recipient!, payload: p[tip], pushOptIn: true, notBefore: now + SETUP_TIP_AFTER_MS[tip],
      })),
    ];
  }

  if (event.kind === "verification_approved" || event.kind === "verification_rejected") {
    const payload = verificationPayload(event.kind, event.summary);
    if (!payload || !event.recipient) return [];
    return [{ type: event.kind, principal: event.recipient, payload, pushOptIn: true }];
  }

  if (event.kind.startsWith("job_payment_")) {
    const payload = jobPaymentPayload(event.kind, event.summary, event.refId);
    if (!payload || !event.recipient) return [];
    return [{ type: kind, principal: event.recipient, payload, pushOptIn: true }];
  }

  if (event.kind === "review_request") {
    const pro = event.summary ? await lookups.isPro(event.summary).catch(() => false) : false;
    if (!pro) return [];
  }

  const payload = payloadFor(event);
  if (!payload || !event.recipient) return [];
  return [{ type: kind, principal: event.recipient, payload, pushOptIn: true }];
}
