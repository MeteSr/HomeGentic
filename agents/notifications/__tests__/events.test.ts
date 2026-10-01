/**
 * @jest-environment node
 */
// Outbox event → push mapping and new-lead contractor matching.
import { contractorWantsLead, notificationsFor, payloadFor, tradeLabel } from "../events";
import type { ContractorInfo, OutboxEvent, QuoteRequestInfo } from "../types";

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

  it("describes accepted and declined bids by trade", () => {
    const base = { seq: 1, recipient: "c", refId: "QUOTE_1", summary: "KitchenRemodel" };
    expect(payloadFor({ ...base, kind: "bid_accepted" })?.body).toContain("Kitchen Remodel");
    expect(payloadFor({ ...base, kind: "bid_declined" })?.title).toBe("Bid not selected");
  });

  it("includes the zip in a new lead when known", () => {
    expect(payloadFor(lead, "78701")?.body).toBe("New HVAC request in 78701.");
    expect(payloadFor(lead, null)?.body).toBe("New HVAC request.");
  });

  it("ignores unknown kinds", () => {
    expect(payloadFor({ ...lead, kind: "something_new" })).toBeNull();
  });
});

describe("contractorWantsLead", () => {
  it("matches an opted-in contractor in the trade and zip", () => {
    expect(contractorWantsLead(REQ, PRO)).toBe(true);
  });

  it("requires push opt-in", () => {
    expect(contractorWantsLead(REQ, { ...PRO, notifyPush: false })).toBe(false);
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
  const lookups = (req: QuoteRequestInfo | null, contractors: ContractorInfo[]) => ({
    getQuoteRequest: jest.fn(async () => req),
    getContractors:  jest.fn(async () => contractors),
  });

  it("sends a recipient event to its recipient", async () => {
    const l = lookups(null, []);
    const out = await notificationsFor({ seq: 2, kind: "bid_accepted", recipient: "c-1", refId: "Q", summary: "HVAC" }, l);
    expect(out).toEqual([{ type: "bid_accepted", principal: "c-1", payload: expect.objectContaining({ route: "leads" }) }]);
    expect(l.getQuoteRequest).not.toHaveBeenCalled();
  });

  it("fans a new lead out to every matching contractor", async () => {
    const other = { ...PRO, principal: "roofer", specialties: ["Roofing"] };
    const out = await notificationsFor(lead, lookups(REQ, [PRO, other]));
    expect(out.map((n) => n.principal)).toEqual(["hvac-pro"]);
    expect(out[0].payload.route).toBe("leads/REQ_1");
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
