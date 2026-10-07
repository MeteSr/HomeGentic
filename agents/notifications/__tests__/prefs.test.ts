/**
 * @jest-environment node
 */
// Per-user notification preferences: push, email and SMS.
import fs   from "fs";
import os   from "os";
import path from "path";

let dir: string;
const saved = { ...process.env };

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "hg-prefs-"));
  process.env.NOTIFICATIONS_DATA_FILE = path.join(dir, "notifications.json");
  jest.resetModules();
});
afterEach(() => {
  process.env = { ...saved };
  fs.rmSync(dir, { recursive: true, force: true });
});

const load = () => require("../prefs") as typeof import("../prefs");
const ok = (r: import("../prefs").SetPrefsResult) => {
  if ("error" in r) throw new Error(r.error);
  return r.ok;
};

describe("defaults", () => {
  it("has every push kind on, email per the old Settings defaults, and SMS off", () => {
    expect(load().getPrefs("anyone")).toEqual({
      push: {
        job_awaiting_signature: true, job_awaiting_contractor_signature: true,
        bid_accepted: true, bid_declined: true,
      },
      email: { new_lead: true, bid_outcome: false, job_verified: true, quote_received: true, job_updates: false },
      sms:   { enabled: false, phone: null },
    });
  });
});

describe("setPrefs", () => {
  it("merges changes per section and keeps them per user", () => {
    const p = load();
    ok(p.setPrefs("c-1", { push: { bid_declined: false } }));
    const after = ok(p.setPrefs("c-1", { email: { bid_outcome: true } }));
    expect(after.push.bid_declined).toBe(false);
    expect(after.email.bid_outcome).toBe(true);
    expect(p.getPrefs("c-2").email.bid_outcome).toBe(false);
  });

  it("rejects unknown sections, keys and non-booleans without saving anything", () => {
    const p = load();
    expect(p.setPrefs("c-1", { push: { bid_declined: false }, fax: {} })).toHaveProperty("error");
    expect(p.setPrefs("c-1", { email: { spam: true } })).toHaveProperty("error");
    expect(p.setPrefs("c-1", { push: { bid_declined: "no" } })).toHaveProperty("error");
    expect(p.setPrefs("c-1", null)).toHaveProperty("error");
    expect(p.getPrefs("c-1").push.bid_declined).toBe(true);
  });

  it("won't turn SMS on without a confirmed phone", () => {
    const p = load();
    expect(p.setPrefs("c-1", { sms: { enabled: true } })).toEqual({ error: "confirm a phone number before turning on SMS" });
  });

  it("survives a restart", () => {
    ok(load().setPrefs("c-1", { email: { job_updates: true } }));
    jest.resetModules();
    expect(load().getPrefs("c-1").email.job_updates).toBe(true);
  });
});

describe("SMS phone", () => {
  it("turns SMS on when a phone is confirmed, can be paused, and is forgotten on clear", () => {
    const p = load();
    p.setVerifiedPhone("h-1", "+15125550142");
    expect(p.getPrefs("h-1").sms).toEqual({ enabled: true, phone: "+15125550142" });
    ok(p.setPrefs("h-1", { sms: { enabled: false } }));
    expect(p.smsPhoneFor("h-1", "sensor_alert")).toBeNull();
    ok(p.setPrefs("h-1", { sms: { enabled: true } }));
    expect(p.smsPhoneFor("h-1", "sensor_alert")).toBe("+15125550142");
    p.clearPhone("h-1");
    expect(p.getPrefs("h-1").sms).toEqual({ enabled: false, phone: null });
  });

  it("masks the number in what the API returns", () => {
    const p = load();
    p.setVerifiedPhone("h-1", "+15125550142");
    expect(p.publicPrefs("h-1").sms.phone).toBe("•••• 0142");
  });
});

describe("channel decisions", () => {
  it("push: per-kind preference; new leads always (their opt-in is on the profile); homeowner-only kinds never", () => {
    const p = load();
    ok(p.setPrefs("c-1", { push: { bid_declined: false } }));
    expect(p.wantsPush("c-1", "bid_declined")).toBe(false);
    expect(p.wantsPush("c-1", "bid_accepted")).toBe(true);
    expect(p.wantsPush("c-1", "new_lead")).toBe(true);
    expect(p.wantsPush("c-1", "quote_received")).toBe(false);
  });

  it("email: follows the group a kind belongs to", () => {
    const p = load();
    expect(p.wantsEmail("h-1", "job_verified")).toBe(true);
    expect(p.wantsEmail("h-1", "sensor_alert")).toBe(false);   // job_updates is off by default
    ok(p.setPrefs("h-1", { email: { job_updates: true } }));
    expect(p.wantsEmail("h-1", "sensor_alert")).toBe(true);
    expect(p.wantsEmail("h-1", "job_awaiting_contractor_signature")).toBe(false); // no email row
  });

  it("SMS: only the time-sensitive kinds", () => {
    const p = load();
    p.setVerifiedPhone("c-1", "+15125550142");
    expect(p.smsPhoneFor("c-1", "bid_accepted")).toBe("+15125550142");
    expect(p.smsPhoneFor("c-1", "bid_declined")).toBeNull();
    expect(p.smsPhoneFor("c-1", "new_lead")).toBeNull();
  });
});
