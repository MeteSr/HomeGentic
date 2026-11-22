/**
 * @jest-environment node
 */
// Outbox event → push mapping and new-lead contractor matching.
import {
  FREE_LEAD_DELAY_MS, VISIT_REMINDER_BEFORE_MS, contractorWantsLead, notificationsFor, payloadFor, tradeLabel,
} from "../events";
import type { ContractorInfo, OutboxEvent, QuoteRequestInfo, VisitBookingInfo } from "../types";
import { PUSH_KINDS, REQUIRED_EMAIL_KINDS } from "../channels";

const REQ: QuoteRequestInfo = {
  id: "REQ_1", homeowner: "homeowner", serviceType: "HVAC", status: "Open",
  zipCode: "78701", minTrustScore: null, minJobsCompleted: null,
};

const PRO: ContractorInfo = {
  principal: "hvac-pro", specialties: ["HVAC"], serviceZips: ["78701"], alertZips: [],
  notifyPush: true, trustScore: 70, jobsCompleted: 3, isVerified: false,
};

const lead: OutboxEvent = { seq: 1, kind: "new_lead", recipient: null, refId: "REQ_1", summary: "HVAC" };

describe("tradeLabel", () => {
  it("spaces out camel-case tags and leaves acronyms alone", () => {
    expect(tradeLabel("GeneralHandyman")).toBe("General Handyman");
    expect(tradeLabel("HVAC")).toBe("HVAC");
  });
});

describe("payloadFor", () => {
  it("routes a signature request to the job", () => {
    const p = payloadFor({ seq: 1, kind: "job_awaiting_signature", recipient: "h", refId: "JOB_9", summary: "Water heater" });
    expect(p).toEqual({
      title: "A job needs your signature",
      body:  "Water heater is waiting for you to sign off.",
      route: "jobs/JOB_9",
    });
  });

  it("tells a contractor the homeowner signed and is waiting on them", () => {
    const p = payloadFor({ seq: 1, kind: "job_awaiting_contractor_signature", recipient: "c", refId: "JOB_4", summary: "Roof repair" });
    expect(p).toEqual({
      title: "A job needs your sign-off",
      body:  "The homeowner signed Roof repair and is waiting for you.",
      route: "jobs/JOB_4",
    });
  });

    it("describes accepted and declined bids by trade", () => {
    const base = { seq: 1, recipient: "c", refId: "QUOTE_1", summary: "KitchenRemodel" };
    expect(payloadFor({ ...base, kind: "bid_accepted" })?.body).toContain("Kitchen Remodel");
    expect(payloadFor({ ...base, kind: "bid_declined" })?.title).toBe("Bid not selected");
  });

  it("includes the zip in a new lead when known", () => {
    expect(payloadFor(lead, "78701")?.body).toBe("New HVAC request in 78701.");
    expect(payloadFor(lead, null)?.body).toBe("New HVAC request.");
  });

  it("words the homeowner events", () => {
    const base = { seq: 1, recipient: "h", refId: "JOB_2", summary: "Water heater" };
    expect(payloadFor({ ...base, kind: "job_verified" })).toEqual({
      title: "Job verified", body: "Water heater is now verified on your home's record.", route: "jobs/JOB_2",
    });
    expect(payloadFor({ ...base, kind: "sensor_alert", summary: "Water leak detected" })?.body)
      .toBe("Water leak detected. We opened a job for it.");
    expect(payloadFor({ ...base, kind: "quote_received", refId: "REQ_7", summary: "GeneralHandyman" })).toEqual({
      title: "New quote", body: "A contractor sent a quote for your General Handyman request.", route: "quotes/REQ_7",
    });
  });

  it("ignores unknown kinds", () => {
    expect(payloadFor({ ...lead, kind: "something_new" })).toBeNull();
  });
});

describe("contractorWantsLead", () => {
  it("matches an opted-in contractor in the trade and zip", () => {
    expect(contractorWantsLead(REQ, PRO)).toBe(true);
  });

  it("matches regardless of push opt-in (email may still want it)", () => {
    expect(contractorWantsLead(REQ, { ...PRO, notifyPush: false })).toBe(true);
  });

  it("requires the trade", () => {
    expect(contractorWantsLead(REQ, { ...PRO, specialties: ["Roofing"] })).toBe(false);
  });

  it("never sends homeowners a lead on their own request", () => {
    expect(contractorWantsLead(REQ, { ...PRO, principal: "homeowner" })).toBe(false);
  });

  it("uses alertZips over serviceZips, and treats no zips as everywhere", () => {
    expect(contractorWantsLead(REQ, { ...PRO, serviceZips: ["78701", "78702"], alertZips: ["78702"] })).toBe(false);
    expect(contractorWantsLead(REQ, { ...PRO, serviceZips: ["10001"] })).toBe(false);
    expect(contractorWantsLead(REQ, { ...PRO, serviceZips: [] })).toBe(true);
    expect(contractorWantsLead({ ...REQ, zipCode: null }, { ...PRO, serviceZips: ["10001"] })).toBe(true);
  });

  it("applies trust thresholds unless the contractor is verified", () => {
    const strict = { ...REQ, minTrustScore: 80, minJobsCompleted: 5 };
    expect(contractorWantsLead(strict, PRO)).toBe(false);
    expect(contractorWantsLead(strict, { ...PRO, trustScore: 90, jobsCompleted: 5 })).toBe(true);
    expect(contractorWantsLead(strict, { ...PRO, isVerified: true })).toBe(true);
  });
});

describe("notificationsFor", () => {
  const lookups = (req: QuoteRequestInfo | null, contractors: ContractorInfo[], pro: (p: string) => Promise<boolean> = async () => true) => ({
    getQuoteRequest: jest.fn(async () => req),
    getContractors:  jest.fn(async () => contractors),
    isPro:           jest.fn(pro),
    getSuccessionNotice: jest.fn(async () => null),
    getVisitBooking: jest.fn(async () => null),
  });

  it("sends a recipient event to its recipient", async () => {
    const l = lookups(null, []);
    const out = await notificationsFor({ seq: 2, kind: "bid_accepted", recipient: "c-1", refId: "Q", summary: "HVAC" }, l);
    expect(out).toEqual([{ type: "bid_accepted", principal: "c-1", pushOptIn: true, payload: expect.objectContaining({ route: "leads" }) }]);
    expect(l.getQuoteRequest).not.toHaveBeenCalled();
  });

  it("marks lead pushes with the contractor's notifyPush opt-in", async () => {
    const quiet = { ...PRO, principal: "quiet-pro", notifyPush: false };
    const out = await notificationsFor(lead, lookups(REQ, [PRO, quiet]));
    expect(out.map((n) => [n.principal, n.pushOptIn])).toEqual([["hvac-pro", true], ["quiet-pro", false]]);
  });

  it("fans a new lead out to every matching contractor", async () => {
    const other = { ...PRO, principal: "roofer", specialties: ["Roofing"] };
    const out = await notificationsFor(lead, lookups(REQ, [PRO, other]));
    expect(out.map((n) => n.principal)).toEqual(["hvac-pro"]);
    expect(out[0].payload.route).toBe("leads/REQ_1");
  });

  it("holds lead alerts 30 minutes for contractors without ContractorPro", async () => {
    expect(FREE_LEAD_DELAY_MS).toBe(30 * 60 * 1000);
    const free = { ...PRO, principal: "free-pro" };
    const broken = { ...PRO, principal: "broken" };
    const out = await notificationsFor(lead, lookups(REQ, [PRO, free, broken], async (p) => {
      if (p === "broken") throw new Error("payment down");
      return p === "hvac-pro";
    }), 1_000);
    expect(out.map((n) => [n.principal, n.notBefore])).toEqual([
      ["hvac-pro", undefined],
      ["free-pro", 1_000 + FREE_LEAD_DELAY_MS],
      ["broken", 1_000 + FREE_LEAD_DELAY_MS],
    ]);
  });

  it("asks the homeowner for a review only when the contractor has ContractorPro", async () => {
    const ask = { seq: 4, kind: "review_request", recipient: "home-1", refId: "JOB_9", summary: "pro-1" };
    const out = await notificationsFor(ask, lookups(null, [], async (p) => p === "pro-1"));
    expect(out).toEqual([{ type: "review_request", principal: "home-1", pushOptIn: true, payload: expect.objectContaining({ route: "review/pro-1/JOB_9" }) }]);
    expect(await notificationsFor({ ...ask, summary: "free-1" }, lookups(null, [], async (p) => p === "pro-1"))).toEqual([]);
    expect(await notificationsFor(ask, lookups(null, [], async () => { throw new Error("down"); }))).toEqual([]);
  });

  it("tells the FSBO seller about a showing request, linking to My Listing", async () => {
    const ev = { seq: 5, kind: "showing_request", recipient: "seller-1", refId: "PROP_7", summary: "Jane" };
    const out = await notificationsFor(ev, lookups(null, []));
    expect(out).toEqual([{
      type: "showing_request", principal: "seller-1", pushOptIn: true,
      payload: { title: "New showing request", body: "Jane asked to see your home. Reply to them from My Listing.", route: "my-listing/PROP_7" },
    }]);
    expect(payloadFor({ ...ev, summary: "" })!.body).toMatch(/^A buyer asked/);
  });

  it("tells the agent the seller chose their bid, linking to the page where they pay the platform fee", async () => {
    const ev = { seq: 6, kind: "bid_chosen", recipient: "agent-1", refId: "PROP_3", summary: "Orlando" };
    const out = await notificationsFor(ev, lookups(null, []));
    expect(out).toEqual([{
      type: "bid_chosen", principal: "agent-1", pushOptIn: true,
      payload: {
        title: "A seller chose your bid",
        body: "A seller in Orlando chose your Bid to List bid. Pay the platform fee to see their address and email.",
        route: "agents/bids/PROP_3",
      },
    }]);
    expect(PUSH_KINDS).toContain("bid_chosen");
    // Transactional: no setting turns it off, or the agent never learns they won.
    expect(REQUIRED_EMAIL_KINDS).toContain("bid_chosen");
  });

  it("doesn't look up tiers for recipient events", async () => {
    const l = lookups(null, []);
    await notificationsFor({ seq: 2, kind: "bid_accepted", recipient: "c-1", refId: "Q", summary: "HVAC" }, l);
    expect(l.isPro).not.toHaveBeenCalled();
  });

  it("skips a lead whose request is gone or no longer open", async () => {
    expect(await notificationsFor(lead, lookups(null, [PRO]))).toEqual([]);
    expect(await notificationsFor(lead, lookups({ ...REQ, status: "Cancelled" }, [PRO]))).toEqual([]);
  });

  it("drops a recipient event with no recipient", async () => {
    const out = await notificationsFor({ seq: 3, kind: "bid_declined", recipient: null, refId: "Q", summary: "HVAC" }, lookups(null, []));
    expect(out).toEqual([]);
  });
});

describe("visit times", () => {
  const HOUR = 60 * 60 * 1000;
  const NOW = Date.UTC(2026, 10, 15, 12);
  const booking = (over: Partial<VisitBookingInfo> = {}): VisitBookingInfo => ({
    quoteId: "Q_1", requestId: "REQ_1", status: "Booked", startsAtMs: NOW + 72 * HOUR, ...over,
  });
  const visitLookups = (b: VisitBookingInfo | null, req: QuoteRequestInfo | null = REQ) => ({
    getQuoteRequest: jest.fn(async () => req),
    getContractors:  jest.fn(async () => []),
    isPro:           jest.fn(async () => true),
    getSuccessionNotice: jest.fn(async () => null),
    getVisitBooking: jest.fn(async () => b),
  });
  const visit = (kind: string, recipient: string): OutboxEvent => ({ seq: 9, kind, recipient, refId: "Q_1", summary: "HVAC" });

  it("tells the homeowner to pick a time, linking to their quote request", async () => {
    const out = await notificationsFor(visit("visit_times_offered", "homeowner"), visitLookups(booking({ status: "TimesOffered", startsAtMs: null })), NOW);
    expect(out).toEqual([{
      type: "visit_times_offered", principal: "homeowner", pushOptIn: true,
      payload: { title: "Pick a visit time", body: "Your HVAC contractor offered times for a visit. Pick the one that suits you.", route: "quotes/REQ_1" },
    }]);
  });

  it("links the contractor to their leads", async () => {
    const out = await notificationsFor(visit("visit_new_times_requested", "hvac-pro"), visitLookups(booking({ status: "NewTimesRequested", startsAtMs: null })), NOW);
    expect(out).toEqual([{
      type: "visit_new_times_requested", principal: "hvac-pro", pushOptIn: true,
      payload: { title: "New visit times requested", body: "The homeowner asked for other times for the HVAC visit. Offer new ones in HomeGentic.", route: "leads" },
    }]);
  });

  it("sends a cancellation to whichever side is the recipient", async () => {
    const b = booking({ status: "Cancelled", startsAtMs: null });
    const toOwner = await notificationsFor(visit("visit_cancelled", "homeowner"), visitLookups(b), NOW);
    expect(toOwner[0].payload).toEqual({ title: "Visit cancelled", body: "The HVAC visit was cancelled.", route: "quotes/REQ_1" });
    const toPro = await notificationsFor(visit("visit_cancelled", "hvac-pro"), visitLookups(b), NOW);
    expect(toPro[0].payload.route).toBe("leads");
  });

  it("confirms a booking and holds a reminder for the day before, without the time (no time zone)", async () => {
    const out = await notificationsFor(visit("visit_booked", "hvac-pro"), visitLookups(booking()), NOW);
    expect(out).toEqual([
      {
        type: "visit_booked", principal: "hvac-pro", pushOptIn: true,
        payload: { title: "Visit booked", body: "The homeowner picked a time for the HVAC visit. Open HomeGentic to see it.", route: "leads" },
      },
      {
        type: "visit_reminder", principal: "hvac-pro", pushOptIn: true,
        notBefore: NOW + 72 * HOUR - VISIT_REMINDER_BEFORE_MS,
        payload: {
          title: "Visit tomorrow", body: "The HVAC visit is tomorrow. Open HomeGentic to see the time.", route: "leads",
          data: { startsAtMs: String(NOW + 72 * HOUR) },
        },
      },
    ]);
    const owner = await notificationsFor(visit("visit_confirmed", "homeowner"), visitLookups(booking()), NOW);
    expect(owner.map((n) => [n.type, n.payload.route])).toEqual([["visit_confirmed", "quotes/REQ_1"], ["visit_reminder", "quotes/REQ_1"]]);
    expect(owner[0].payload.body).toBe("Your HVAC visit is booked. Open HomeGentic to see the time.");
  });

  it("holds no reminder for a visit less than a day away", async () => {
    const out = await notificationsFor(visit("visit_booked", "hvac-pro"), visitLookups(booking({ startsAtMs: NOW + 20 * HOUR })), NOW);
    expect(out.map((n) => n.type)).toEqual(["visit_booked"]);
  });

  it("drops a visit event whose booking or request is gone", async () => {
    expect(await notificationsFor(visit("visit_booked", "hvac-pro"), visitLookups(null), NOW)).toEqual([]);
    expect(await notificationsFor(visit("visit_booked", "hvac-pro"), visitLookups(booking(), null), NOW)).toEqual([]);
    expect(await notificationsFor({ ...visit("visit_booked", "x"), recipient: null }, visitLookups(booking()), NOW)).toEqual([]);
  });
});

describe("in-app job payments", () => {
  const pay = (kind: string, recipient: string, refId: string): OutboxEvent => ({ seq: 4, kind, recipient, refId, summary: "$1200" });
  const l = () => ({
    getQuoteRequest: jest.fn(async () => null),
    getContractors:  jest.fn(async () => []),
    isPro:           jest.fn(async () => true),
    getSuccessionNotice: jest.fn(async () => null),
    getVisitBooking: jest.fn(async () => null),
  });

  it("tells the contractor a bank payment is on its way, and when it has cleared", async () => {
    expect(await notificationsFor(pay("job_payment_processing", "pro", "Q_1"), l())).toEqual([{
      type: "job_payment_processing", principal: "pro", pushOptIn: true,
      payload: {
        title: "Bank payment on its way",
        body: "The homeowner paid $1200 by bank. Stripe sends it to you once it clears, usually in about 4 business days.",
        route: "leads",
      },
    }]);
    const paid = await notificationsFor(pay("job_payment_paid", "pro", "Q_1"), l());
    expect(paid[0].payload).toEqual({
      title: "You've been paid",
      body: "The homeowner's $1200 payment went through. Stripe is sending it to your bank account.",
      route: "leads",
    });
  });

  it("sends the homeowner a receipt or a failure, linking to the request", async () => {
    const receipt = await notificationsFor(pay("job_payment_receipt", "owner", "REQ_1"), l());
    expect(receipt[0].payload).toEqual({
      title: "Payment complete",
      body: "Your $1200 payment to your contractor went through.",
      route: "quotes/REQ_1",
    });
    const failed = await notificationsFor(pay("job_payment_failed", "owner", "REQ_1"), l());
    expect(failed[0].payload).toEqual({
      title: "Payment didn't go through",
      body: "Your $1200 payment to your contractor didn't go through. Open the job in HomeGentic to try again.",
      route: "quotes/REQ_1",
    });
  });
});
