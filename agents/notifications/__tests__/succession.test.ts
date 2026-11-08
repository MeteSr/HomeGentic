/**
 * @jest-environment node
 */
// #724 successor claims: who is emailed what, waiting-period reminders, and
// why these emails ignore notification settings.
jest.mock("../icp", () => ({}));
jest.mock("../dispatcher", () => ({ dispatchToUser: jest.fn() }));

import { notificationsFor, SUCCESSION_REMINDER_AFTER_MS } from "../events";
import { renderEmail } from "../email";
import { webPathFor } from "../links";
import type { OutboxEvent, OutboxPage, SuccessionNoticeInfo } from "../types";
import type { PollerDeps } from "../poller";

const DAY = 24 * 60 * 60 * 1000;
const OPENED = Date.UTC(2026, 10, 8, 12);
const NOTICE: SuccessionNoticeInfo = {
  claimId: "sc-1",
  propertyId: "PROP_1",
  claimant: "heir",
  status: "AwaitingReview",
  openedAtMs: OPENED,
  waitEndsAtMs: OPENED + 30 * DAY,
  address: "70 Heritage Way",
  household: ["owner", "co-owner"],
};

const lookups = (notice: SuccessionNoticeInfo | null) => ({
  getQuoteRequest: jest.fn(async () => null),
  getContractors: jest.fn(async () => []),
  isPro: jest.fn(async () => true),
  getSuccessionNotice: jest.fn(async () => notice),
});
const ev = (kind: string, recipient: string | null): OutboxEvent => ({
  seq: 1,
  kind,
  recipient,
  refId: "sc-1",
  summary: "70 Heritage Way",
});

describe("successor claim notifications", () => {
  it("tells each household member at once and schedules two reminders", async () => {
    const out = await notificationsFor(ev("succession_claim_opened", "owner"), lookups(NOTICE), OPENED);
    expect(out[0]).toEqual({
      type: "succession_claim_opened",
      principal: "owner",
      pushOptIn: false,
      payload: expect.objectContaining({ route: "successor/PROP_1", required: true }),
    });
    expect(out[0].payload.title).toBe("Someone asked to take over your home record");
    expect(out[0].payload.body).toContain("70 Heritage Way");
    expect(out[0].payload.body).toContain("December 8, 2026");
    expect(out[0].payload.body).toMatch(/cancel/i);

    const reminders = out.slice(1);
    expect(SUCCESSION_REMINDER_AFTER_MS).toEqual([15 * DAY, 27 * DAY]);
    expect(reminders.map((r) => [r.type, r.principal, r.notBefore])).toEqual([
      ["succession_claim_reminder", "owner", OPENED + 15 * DAY],
      ["succession_claim_reminder", "owner", OPENED + 27 * DAY],
    ]);
    expect(reminders[0].payload.body).toContain("if HomeGentic approves");
  });

  it("words approval differently for the household and the claimant", async () => {
    const approved = { ...NOTICE, status: "Approved" as const };
    const [home] = await notificationsFor(ev("succession_claim_approved", "co-owner"), lookups(approved));
    expect(home.payload.route).toBe("successor/PROP_1");
    expect(home.payload.body).toMatch(/unless you cancel/);
    const [heir] = await notificationsFor(ev("succession_claim_approved", "heir"), lookups(approved));
    expect(heir.payload.route).toBe("successor-claims");
    expect(heir.payload.body).toMatch(/You can take over the home record on or after December 8, 2026/);
  });

  it("tells the claimant about a rejection or cancellation", async () => {
    for (const kind of ["succession_claim_rejected", "succession_claim_cancelled"]) {
      const out = await notificationsFor(ev(kind, "heir"), lookups({ ...NOTICE, status: "Rejected" }));
      expect(out).toHaveLength(1);
      expect(out[0]).toMatchObject({
        type: kind,
        principal: "heir",
        payload: { route: "successor-claims", required: true },
      });
    }
  });

  it("sends nothing when the claim is gone or the event has no recipient", async () => {
    expect(await notificationsFor(ev("succession_claim_opened", "owner"), lookups(null))).toEqual([]);
    expect(await notificationsFor(ev("succession_claim_opened", null), lookups(NOTICE))).toEqual([]);
  });

  it("emails regardless of notification settings, and says so", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const prefs = require("../prefs") as typeof import("../prefs");
    prefs.setPrefs("owner", { email: { job_updates: false, weekly_pulse: false } });
    for (const kind of [
      "succession_claim_opened",
      "succession_claim_reminder",
      "succession_claim_approved",
      "succession_claim_rejected",
      "succession_claim_cancelled",
    ]) {
      expect(prefs.wantsEmail("owner", kind)).toBe(true);
      expect(prefs.wantsPush("owner", kind)).toBe(false);
      expect(prefs.smsPhoneFor("owner", kind)).toBeNull();
    }
    const m = renderEmail({ title: "t", body: "b", route: "successor/PROP_1", required: true });
    expect(m.text).not.toContain("because of your notification settings");
    expect(m.text).toContain("whatever your notification settings");
    expect(m.text).toContain("/properties/PROP_1/successor");
  });

  it("links the routes to web pages", () => {
    expect(webPathFor("successor/PROP_1")).toBe("/properties/PROP_1/successor");
    expect(webPathFor("successor-claims")).toBe("/successor-claims");
  });
});

describe("waiting-period reminders in the poller", () => {
  function freshPoller() {
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("../poller") as typeof import("../poller");
  }
  const outbox = (events: OutboxEvent[]) =>
    jest.fn(async (_id: string, after: number): Promise<OutboxPage> => ({
      events: events.filter((e) => e.seq > after),
      latestSeq: events.length ? events[events.length - 1].seq : 0,
    }));
  const deps = (over: Partial<PollerDeps> = {}): PollerDeps => ({
    readOutbox: outbox([]),
    getQuoteRequest: jest.fn(async () => null),
    getContractors: jest.fn(async () => []),
    isPro: jest.fn(async () => true),
    getSuccessionNotice: jest.fn(async () => NOTICE),
    dispatch: jest.fn(async () => undefined),
    wantsPush: jest.fn(() => false),
    emailEnabled: jest.fn(() => true),
    wantsEmail: jest.fn(() => true),
    getEmail: jest.fn(async (p: string) => `${p}@example.com`),
    sendEmail: jest.fn(async () => undefined),
    smsEnabled: jest.fn(() => false),
    smsPhoneFor: jest.fn(() => null),
    sendSms: jest.fn(async () => undefined),
    ...over,
  });

  async function openClaim(p: typeof import("../poller")) {
    await p.pollCanister("property-id", deps());
    const d = deps({
      readOutbox: outbox([
        { seq: 1, kind: "succession_claim_opened", recipient: "owner", refId: "sc-1", summary: "70 Heritage Way" },
      ]),
    });
    expect(await p.pollCanister("property-id", d)).toBe(1);
    expect(d.sendEmail).toHaveBeenCalledWith(
      "owner@example.com",
      expect.objectContaining({ route: "successor/PROP_1" }),
      "property-id:1:owner",
    );
    expect(p.heldNotifications().map((h) => h.n.type)).toEqual([
      "succession_claim_reminder",
      "succession_claim_reminder",
    ]);
  }

  it("sends each reminder when due while the claim is open", async () => {
    const p = freshPoller();
    await openClaim(p);
    const d = deps();
    expect(await p.flushHeld(d, OPENED + 15 * DAY + 1)).toBe(1);
    expect(d.sendEmail).toHaveBeenCalledWith(
      "owner@example.com",
      expect.objectContaining({ title: "Reminder: a successor claim is open on your home" }),
      expect.any(String),
    );
    expect(p.heldNotifications()).toHaveLength(1);
    expect(await p.flushHeld(d, OPENED + 27 * DAY + 1)).toBe(1);
    expect(p.heldNotifications()).toEqual([]);
  });

  it("drops reminders once the claim is closed or the person left the household", async () => {
    const p = freshPoller();
    await openClaim(p);
    expect(
      await p.flushHeld(
        deps({ getSuccessionNotice: jest.fn(async () => ({ ...NOTICE, status: "Cancelled" as const })) }),
        OPENED + 15 * DAY + 1,
      ),
    ).toBe(0);
    expect(
      await p.flushHeld(
        deps({ getSuccessionNotice: jest.fn(async () => ({ ...NOTICE, household: ["someone-else"] })) }),
        OPENED + 27 * DAY + 1,
      ),
    ).toBe(0);
    expect(p.heldNotifications()).toEqual([]);
  });

  it("reads the property canister's outbox", () => {
    const p = freshPoller();
    expect(p.OUTBOX_CANISTERS).toContain("CANISTER_ID_PROPERTY");
  });
});
