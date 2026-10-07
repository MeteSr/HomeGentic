/**
 * @jest-environment node
 */
// Outbox poller: cursors, first-run and reinstall handling, paging, fan-out.
jest.mock("../icp", () => ({}));
jest.mock("../dispatcher", () => ({ dispatchToUser: jest.fn() }));

import type { OutboxEvent, OutboxPage } from "../types";
import type { PollerDeps } from "../poller";

function freshPoller() {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require("../poller") as typeof import("../poller");
}

const ev = (seq: number, over: Partial<OutboxEvent> = {}): OutboxEvent => ({
  seq,
  kind:      "job_awaiting_signature",
  recipient: "homeowner-1",
  refId:     `JOB_${seq}`,
  summary:   `Job ${seq}`,
  ...over,
});

/** A fake outbox holding `events`, paged like the canister (seq > after, max 200). */
function outbox(events: OutboxEvent[], latestSeq = events.length ? events[events.length - 1].seq : 0) {
  return jest.fn(async (_id: string, after: number): Promise<OutboxPage> => ({
    events: events.filter((e) => e.seq > after).slice(0, 200),
    latestSeq,
  }));
}

function deps(over: Partial<PollerDeps> = {}): PollerDeps {
  return {
    readOutbox:      outbox([]),
    getQuoteRequest: jest.fn(async () => null),
    getContractors:  jest.fn(async () => []),
    dispatch:        jest.fn(async () => undefined),
    wantsPush:       jest.fn(() => true),
    emailEnabled:    jest.fn(() => false),
    wantsEmail:      jest.fn(() => false),
    getEmail:        jest.fn(async () => null),
    sendEmail:       jest.fn(async () => undefined),
    smsEnabled:      jest.fn(() => false),
    smsPhoneFor:     jest.fn(() => null),
    sendSms:         jest.fn(async () => undefined),
    ...over,
  };
}

describe("pollCanister", () => {
  it("starts at the latest seq on first run without replaying history", async () => {
    const p = freshPoller();
    const d = deps({ readOutbox: outbox([ev(1), ev(2)]) });
    expect(await p.pollCanister("job-id", d)).toBe(0);
    expect(d.dispatch).not.toHaveBeenCalled();
    expect(p.getCursor("job-id")).toBe(2);
  });

  it("sends events after the cursor and advances it", async () => {
    const p = freshPoller();
    const events = [ev(1)];
    const d = deps({ readOutbox: outbox(events) });
    await p.pollCanister("job-id", d); // cursor → 1
    events.push(ev(2), ev(3, { recipient: "homeowner-2" }));
    d.readOutbox = outbox(events);

    expect(await p.pollCanister("job-id", d)).toBe(2);
    expect(d.dispatch).toHaveBeenCalledWith("homeowner-1", expect.objectContaining({ route: "jobs/JOB_2" }));
    expect(d.dispatch).toHaveBeenCalledWith("homeowner-2", expect.objectContaining({ route: "jobs/JOB_3" }));
    expect(p.getCursor("job-id")).toBe(3);

    // Nothing new → nothing sent.
    expect(await p.pollCanister("job-id", d)).toBe(0);
  });

  it("restarts from 0 when the outbox is behind the cursor (canister reinstalled)", async () => {
    const p = freshPoller();
    await p.pollCanister("job-id", deps({ readOutbox: outbox([ev(5)]) })); // cursor → 5
    const d = deps({ readOutbox: outbox([ev(1), ev(2)]) });
    expect(await p.pollCanister("job-id", d)).toBe(2);
    expect(p.getCursor("job-id")).toBe(2);
  });

  it("pages through more than 200 events", async () => {
    const p = freshPoller();
    await p.pollCanister("job-id", deps({ readOutbox: outbox([]) })); // cursor → 0
    const many = Array.from({ length: 450 }, (_, i) => ev(i + 1));
    const d = deps({ readOutbox: outbox(many) });
    expect(await p.pollCanister("job-id", d)).toBe(450);
    expect(d.readOutbox).toHaveBeenCalledTimes(3);
    expect(p.getCursor("job-id")).toBe(450);
  });

  it("stops at a failing event and resumes there on the next poll", async () => {
    const p = freshPoller();
    await p.pollCanister("quote-id", deps({ readOutbox: outbox([]) })); // cursor → 0
    const events = [
      ev(1, { kind: "bid_accepted", recipient: "c-1", summary: "HVAC" }),
      ev(2, { kind: "new_lead", recipient: null, refId: "REQ_1", summary: "HVAC" }),
    ];
    const failing = deps({
      readOutbox:      outbox(events),
      getQuoteRequest: jest.fn(async () => { throw new Error("replica down"); }),
    });
    await expect(p.pollCanister("quote-id", failing)).rejects.toThrow("replica down");
    expect(failing.dispatch).toHaveBeenCalledTimes(1);
    expect(p.getCursor("quote-id")).toBe(1);

    const ok = deps({ readOutbox: outbox(events) });
    await p.pollCanister("quote-id", ok);
    expect(ok.getQuoteRequest).toHaveBeenCalledWith("REQ_1");
    expect(p.getCursor("quote-id")).toBe(2);
  });

  it("fetches contractor profiles at most once per poll", async () => {
    const p = freshPoller();
    await p.pollCanister("quote-id", deps({ readOutbox: outbox([]) }));
    const leads = [1, 2, 3].map((n) => ev(n, { kind: "new_lead", recipient: null, refId: `REQ_${n}`, summary: "Roofing" }));
    const d = deps({
      readOutbox:      outbox(leads),
      getQuoteRequest: jest.fn(async (id: string) => ({
        id, homeowner: "h", serviceType: "Roofing", status: "Open",
        zipCode: null, minTrustScore: null, minJobsCompleted: null,
      })),
      getContractors: jest.fn(async () => [{
        principal: "roofer", specialties: ["Roofing"], serviceZips: [], alertZips: [],
        notifyPush: true, trustScore: 70, jobsCompleted: 0, isVerified: false,
      }]),
    });
    expect(await p.pollCanister("quote-id", d)).toBe(3);
    expect(d.getContractors).toHaveBeenCalledTimes(1);
  });
});

describe("push preferences", () => {
  it("skips pushes the recipient turned off, but still advances past them", async () => {
    const p = freshPoller();
    await p.pollCanister("quote-id", deps({ readOutbox: outbox([]) }));
    const events = [
      ev(1, { kind: "bid_declined", recipient: "c-off", summary: "HVAC" }),
      ev(2, { kind: "bid_accepted", recipient: "c-on",  summary: "HVAC" }),
    ];
    const d = deps({
      readOutbox: outbox(events),
      wantsPush:  jest.fn((principal: string) => principal !== "c-off"),
    });
    expect(await p.pollCanister("quote-id", d)).toBe(1);
    expect(d.dispatch).toHaveBeenCalledTimes(1);
    expect(d.dispatch).toHaveBeenCalledWith("c-on", expect.anything());
    expect(d.wantsPush).toHaveBeenCalledWith("c-off", "bid_declined");
    expect(p.getCursor("quote-id")).toBe(2);
  });
});

describe("email and SMS", () => {
  async function primed(p: ReturnType<typeof freshPoller>, id: string) {
    await p.pollCanister(id, deps({ readOutbox: outbox([]) }));
  }

  it("emails and texts recipients who want it, keyed for idempotency", async () => {
    const p = freshPoller();
    await primed(p, "job-id");
    const d = deps({
      readOutbox:   outbox([ev(1, { kind: "sensor_alert", recipient: "h-1", summary: "Water leak detected" })]),
      emailEnabled: jest.fn(() => true),
      wantsEmail:   jest.fn(() => true),
      getEmail:     jest.fn(async () => "h1@example.com"),
      smsEnabled:   jest.fn(() => true),
      smsPhoneFor:  jest.fn(() => "+15125550142"),
    });
    expect(await p.pollCanister("job-id", d)).toBe(2);   // sensor_alert isn't pushed
    expect(d.dispatch).not.toHaveBeenCalled();
    expect(d.sendEmail).toHaveBeenCalledWith("h1@example.com", expect.objectContaining({ title: "Sensor alert" }), "job-id:1:h-1");
    expect(d.sendSms).toHaveBeenCalledWith("+15125550142", expect.objectContaining({ route: "jobs/JOB_1" }));
  });

  it("skips email when the channel is off or the user has no address", async () => {
    const p = freshPoller();
    await primed(p, "job-id");
    const events = [ev(1, { kind: "job_verified", recipient: "h-1" }), ev(2, { kind: "job_verified", recipient: "h-2" })];
    const off = deps({ readOutbox: outbox(events), emailEnabled: jest.fn(() => false), wantsEmail: jest.fn(() => true) });
    await p.pollCanister("job-id", off);
    expect(off.getEmail).not.toHaveBeenCalled();

    const p2 = freshPoller();
    await primed(p2, "job-id");
    const noAddress = deps({ readOutbox: outbox(events), emailEnabled: jest.fn(() => true), wantsEmail: jest.fn(() => true) });
    expect(await p2.pollCanister("job-id", noAddress)).toBe(0);
    expect(noAddress.sendEmail).not.toHaveBeenCalled();
  });

  it("looks each address up once per poll", async () => {
    const p = freshPoller();
    await primed(p, "quote-id");
    const events = [1, 2, 3].map((n) => ev(n, { kind: "quote_received", recipient: "h-1", refId: `REQ_${n}`, summary: "HVAC" }));
    const d = deps({
      readOutbox: outbox(events), emailEnabled: jest.fn(() => true), wantsEmail: jest.fn(() => true),
      getEmail: jest.fn(async () => "h1@example.com"),
    });
    expect(await p.pollCanister("quote-id", d)).toBe(3);
    expect(d.getEmail).toHaveBeenCalledTimes(1);
  });

  it("a failed email or text doesn't stop the push or the cursor", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    const p = freshPoller();
    await primed(p, "quote-id");
    const d = deps({
      readOutbox:   outbox([ev(1, { kind: "bid_accepted", recipient: "c-1", summary: "HVAC" })]),
      emailEnabled: jest.fn(() => true),
      wantsEmail:   jest.fn(() => true),
      getEmail:     jest.fn(async () => { throw new Error("auth canister down"); }),
      smsEnabled:   jest.fn(() => true),
      smsPhoneFor:  jest.fn(() => "+15125550142"),
      sendSms:      jest.fn(async () => { throw new Error("Twilio 500"); }),
    });
    expect(await p.pollCanister("quote-id", d)).toBe(1);
    expect(d.dispatch).toHaveBeenCalledTimes(1);
    expect(p.getCursor("quote-id")).toBe(1);
  });

  it("new leads: push follows notifyPush, email follows the contractor's email preference", async () => {
    const p = freshPoller();
    await primed(p, "quote-id");
    const req = { id: "REQ_1", homeowner: "h", serviceType: "Roofing", status: "Open", zipCode: null, minTrustScore: null, minJobsCompleted: null };
    const base = { specialties: ["Roofing"], serviceZips: [], alertZips: [], trustScore: 70, jobsCompleted: 0, isVerified: false };
    const d = deps({
      readOutbox:      outbox([ev(1, { kind: "new_lead", recipient: null, refId: "REQ_1", summary: "Roofing" })]),
      getQuoteRequest: jest.fn(async () => req),
      getContractors:  jest.fn(async () => [
        { ...base, principal: "pusher",  notifyPush: true },
        { ...base, principal: "emailer", notifyPush: false },
      ]),
      emailEnabled: jest.fn(() => true),
      wantsEmail:   jest.fn((principal: string) => principal === "emailer"),
      getEmail:     jest.fn(async (principal: string) => `${principal}@example.com`),
    });
    expect(await p.pollCanister("quote-id", d)).toBe(2);
    expect(d.dispatch).toHaveBeenCalledWith("pusher", expect.anything());
    expect(d.dispatch).not.toHaveBeenCalledWith("emailer", expect.anything());
    expect(d.sendEmail).toHaveBeenCalledWith("emailer@example.com", expect.anything(), "quote-id:1:emailer");
  });
});

describe("pollOnce", () => {
  const saved = { ...process.env };
  afterEach(() => { process.env = { ...saved }; });

  it("polls every configured outbox and keeps going when one fails", async () => {
    process.env.CANISTER_ID_JOB   = "job-id";
    process.env.CANISTER_ID_QUOTE = "quote-id";
    const p = freshPoller();
    const readOutbox = jest.fn(async (id: string) => {
      if (id === "job-id") throw new Error("boom");
      return { events: [], latestSeq: 0 };
    });
    jest.spyOn(console, "error").mockImplementation(() => {});
    await p.pollOnce(deps({ readOutbox }));
    expect(readOutbox).toHaveBeenCalledWith("job-id", 0);
    expect(readOutbox).toHaveBeenCalledWith("quote-id", 0);
    expect(p.getCursor("quote-id")).toBe(0);
  });

  it("skips canisters whose ID isn't set", async () => {
    delete process.env.CANISTER_ID_JOB;
    delete process.env.CANISTER_ID_QUOTE;
    const p = freshPoller();
    const d = deps();
    await p.pollOnce(d);
    expect(d.readOutbox).not.toHaveBeenCalled();
  });
});
