/**
 * @jest-environment node
 */
// First week: the welcome email when an owner adds their first home, two
// setup tips (day 1 and day 3) that are skipped once their step is done, and
// the ownership-review outcome.
jest.mock("../icp", () => ({}));
jest.mock("../dispatcher", () => ({ dispatchToUser: jest.fn() }));

import { notificationsFor, SETUP_TIP_AFTER_MS } from "../events";
import { EMAIL_DEFAULTS, EMAIL_GROUPS, PUSH_KINDS } from "../channels";
import { renderEmail } from "../email";
import { webPathFor } from "../links";
import type { OutboxEvent, OutboxPage, SetupStatus } from "../types";
import type { PollerDeps } from "../poller";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 16, 15);

const lookups = {
  getQuoteRequest: jest.fn(async () => null),
  getContractors: jest.fn(async () => []),
  isPro: jest.fn(async () => true),
  getSuccessionNotice: jest.fn(async () => null),
  getVisitBooking: jest.fn(async () => null),
};
const ev = (kind: string, over: Partial<OutboxEvent> = {}): OutboxEvent => ({
  seq: 1,
  kind,
  recipient: "owner",
  refId: "PROP_1",
  summary: "12 Elm St",
  ...over,
});

function freshPoller() {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require("../poller") as typeof import("../poller");
}

function deps(over: Partial<PollerDeps> = {}): PollerDeps {
  return {
    readOutbox: jest.fn(async (): Promise<OutboxPage> => ({ events: [], latestSeq: 0 })),
    getQuoteRequest: jest.fn(async () => null),
    getContractors: jest.fn(async () => []),
    isPro: jest.fn(async () => true),
    getSuccessionNotice: jest.fn(async () => null),
    getVisitBooking: jest.fn(async () => null),
    getSetupStatus: jest.fn(async () => ({ exists: true, hasShutoffs: false, hasJobs: false })),
    dispatch: jest.fn(async () => undefined),
    wantsPush: jest.fn(() => true),
    emailEnabled: jest.fn(() => true),
    wantsEmail: jest.fn(() => true),
    getEmail: jest.fn(async () => "owner@example.com"),
    sendEmail: jest.fn(async () => undefined),
    smsEnabled: jest.fn(() => false),
    smsPhoneFor: jest.fn(() => null),
    sendSms: jest.fn(async () => undefined),
    ...over,
  };
}

describe("first home added", () => {
  it("welcomes the owner at once and schedules a day-1 and a day-3 tip", async () => {
    const out = await notificationsFor(ev("first_home_added"), lookups, NOW);
    expect(out.map((n) => [n.type, n.principal, n.notBefore])).toEqual([
      ["welcome", "owner", undefined],
      ["setup_tip_shutoffs", "owner", NOW + 1 * DAY],
      ["setup_tip_first_job", "owner", NOW + 3 * DAY],
    ]);
    expect(SETUP_TIP_AFTER_MS).toEqual({ setup_tip_shutoffs: 1 * DAY, setup_tip_first_job: 3 * DAY });

    const [welcome, shutoffs, firstJob] = out.map((n) => n.payload);
    expect(welcome.title).toBe("Welcome to HomeGentic");
    expect(welcome.body).toContain("12 Elm St");
    expect(welcome.body).toMatch(/Monday/);
    expect(welcome.route).toBe("systems/PROP_1");
    expect(shutoffs.route).toBe("guide/PROP_1");
    expect(shutoffs.body).toMatch(/water shutoff/i);
    expect(firstJob.route).toBe("jobs");
    expect(firstJob.body).toMatch(/HomeGentic Score/);
    for (const p of out.map((n) => n.payload)) expect(p.data).toEqual({ propertyId: "PROP_1" });
  });

  it("ignores an event without a recipient", async () => {
    expect(await notificationsFor(ev("first_home_added", { recipient: null }), lookups, NOW)).toEqual([]);
  });

  it("sends these by email only, on a Getting started setting that's on by default", () => {
    for (const k of ["welcome", "setup_tip_shutoffs", "setup_tip_first_job"]) {
      expect(PUSH_KINDS).not.toContain(k);
      expect(EMAIL_GROUPS.getting_started).toContain(k);
    }
    expect(EMAIL_DEFAULTS.getting_started).toBe(true);
  });

  it("links each email to the page for its step", () => {
    expect(webPathFor("systems/PROP_1")).toBe("/properties/PROP_1/systems");
    expect(webPathFor("guide/PROP_1")).toBe("/properties/PROP_1?tab=guide");
    expect(webPathFor("property")).toBe("/dashboard");
  });

  it("renders the welcome email with a link to the system years page and the settings footer", async () => {
    const [welcome] = await notificationsFor(ev("first_home_added"), lookups, NOW);
    const email = renderEmail(welcome.payload);
    expect(email.subject).toBe("Welcome to HomeGentic");
    expect(email.html).toContain("/properties/PROP_1/systems");
    expect(email.text).toMatch(/notification settings/);
  });
});

describe("held setup tips", () => {
  async function holdTips(p: typeof import("../poller")) {
    await p.pollCanister("property-id", deps());
    const d = deps({
      readOutbox: jest.fn(async (): Promise<OutboxPage> => ({ events: [ev("first_home_added")], latestSeq: 1 })),
    });
    await p.pollCanister("property-id", d);
    expect(d.sendEmail).toHaveBeenCalledTimes(1); // the welcome
    expect(p.heldNotifications().map((h) => h.n.type)).toEqual(["setup_tip_shutoffs", "setup_tip_first_job"]);
  }
  const later = Date.now() + 4 * DAY;
  const status = (s: Partial<SetupStatus> | null) =>
    jest.fn(async () => (s === null ? null : { exists: true, hasShutoffs: false, hasJobs: false, ...s }));

  it("sends each tip when it's due and its step isn't done", async () => {
    const p = freshPoller();
    await holdTips(p);
    const d = deps();
    expect(await p.flushHeld(d, later)).toBe(2);
    expect(d.getSetupStatus).toHaveBeenCalledWith("owner", "PROP_1");
    expect(d.dispatch).not.toHaveBeenCalled();
    expect(p.heldNotifications()).toEqual([]);
  });

  it("skips the shutoff tip once the guide says where the shutoff is, and the job tip once a job is logged", async () => {
    const p = freshPoller();
    await holdTips(p);
    const d = deps({ getSetupStatus: status({ hasShutoffs: true, hasJobs: true }) });
    expect(await p.flushHeld(d, later)).toBe(0);
    expect(d.sendEmail).not.toHaveBeenCalled();
    expect(p.heldNotifications()).toEqual([]);
  });

  it("drops both when the home is gone", async () => {
    const p = freshPoller();
    await holdTips(p);
    const d = deps({ getSetupStatus: status({ exists: false }) });
    expect(await p.flushHeld(d, later)).toBe(0);
    expect(p.heldNotifications()).toEqual([]);
  });

  it("keeps them to retry when the record can't be read", async () => {
    const p = freshPoller();
    await holdTips(p);
    const d = deps({ getSetupStatus: status(null) });
    expect(await p.flushHeld(d, later)).toBe(0);
    expect(p.heldNotifications()).toHaveLength(2);
  });
});

describe("ownership review", () => {
  it("tells the owner their home was verified", async () => {
    const [n] = await notificationsFor(ev("verification_approved"), lookups, NOW);
    expect(n).toMatchObject({ type: "verification_approved", principal: "owner", pushOptIn: true });
    expect(n.payload.title).toBe("Your home is verified");
    expect(n.payload.body).toContain("12 Elm St");
    expect(n.payload.route).toBe("property");
  });

  it("tells the owner when the document wasn't accepted, and that they can send another", async () => {
    const [n] = await notificationsFor(ev("verification_rejected"), lookups, NOW);
    expect(n.payload.title).toBe("We couldn't verify your home yet");
    expect(n.payload.body).toMatch(/send another/i);
  });

  it("pushes and emails it, on its own setting that's on by default", () => {
    for (const k of ["verification_approved", "verification_rejected"]) {
      expect(PUSH_KINDS).toContain(k);
      expect(EMAIL_GROUPS.verification).toContain(k);
    }
    expect(EMAIL_DEFAULTS.verification).toBe(true);
  });
});
