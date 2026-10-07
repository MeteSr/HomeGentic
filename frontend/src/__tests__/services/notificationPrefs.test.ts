/**
 * notificationPrefs.ts — the relay's per-user push/email/SMS preferences and
 * SMS phone confirmation, all under the caller's agent session.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const fetchWithSession = vi.fn();
vi.mock("@/services/agentSession", () => ({
  fetchWithAgentSession: (...a: unknown[]) => fetchWithSession(...a),
}));

const RELAY = "https://notify.example.com";

const STATE = {
  prefs: {
    push:  { job_awaiting_signature: true, job_awaiting_contractor_signature: true, bid_accepted: true, bid_declined: false },
    email: { new_lead: true, bid_outcome: false, job_verified: true, quote_received: true, job_updates: false },
    sms:   { enabled: false, phone: null },
  },
  channels: { email: true, sms: true },
};

async function load(url = RELAY) {
  vi.resetModules();
  vi.stubEnv("VITE_NOTIFICATIONS_URL", url);
  return import("@/services/notificationPrefs");
}

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  fetchWithSession.mockReset();
});

describe("preferences", () => {
  it("notificationsConfigured follows VITE_NOTIFICATIONS_URL", async () => {
    expect((await load()).notificationsConfigured()).toBe(true);
    expect((await load("")).notificationsConfigured()).toBe(false);
  });

  it("reads preferences and channels under the agent session", async () => {
    const { getNotificationPrefs } = await load();
    fetchWithSession.mockResolvedValue(reply(STATE));
    expect(await getNotificationPrefs()).toEqual(STATE);
    expect(fetchWithSession).toHaveBeenCalledWith(`${RELAY}/api/prefs`, { method: "GET" });
  });

  it("sends only the changes and returns the full set", async () => {
    const { setNotificationPrefs } = await load();
    fetchWithSession.mockResolvedValue(reply(STATE));
    await setNotificationPrefs({ email: { bid_outcome: true } });
    const [url, init] = fetchWithSession.mock.calls[0];
    expect(url).toBe(`${RELAY}/api/prefs`);
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ prefs: { email: { bid_outcome: true } } });
  });

  it("explains a rejected session", async () => {
    const { getNotificationPrefs } = await load();
    fetchWithSession.mockResolvedValue(reply({ error: "session_required" }, 401));
    await expect(getNotificationPrefs()).rejects.toThrow(/sign in again/i);
  });

  it("passes on the relay's validation message", async () => {
    const { setNotificationPrefs } = await load();
    fetchWithSession.mockResolvedValue(reply({ error: "confirm a phone number before turning on SMS" }, 400));
    await expect(setNotificationPrefs({ sms: { enabled: true } })).rejects.toThrow("confirm a phone number before turning on SMS");
  });

  it("refuses without a relay", async () => {
    const { getNotificationPrefs } = await load("");
    await expect(getNotificationPrefs()).rejects.toThrow(/aren't configured/);
    expect(fetchWithSession).not.toHaveBeenCalled();
  });
});

describe("toE164", () => {
  it("normalises US and international numbers", async () => {
    const { toE164 } = await load();
    expect(toE164("(512) 555-0142")).toBe("+15125550142");
    expect(toE164("1-512-555-0142")).toBe("+15125550142");
    expect(toE164("+44 20 7946 0958")).toBe("+442079460958");
  });

  it("rejects what can't be a number", async () => {
    const { toE164 } = await load();
    expect(toE164("555-0142")).toBeNull();
    expect(toE164("+0 123 456 789")).toBeNull();
    expect(toE164("call me")).toBeNull();
  });
});

describe("SMS confirmation", () => {
  it("asks the relay to text a code", async () => {
    const { startSmsVerification } = await load();
    fetchWithSession.mockResolvedValue(reply({ ok: true }));
    await startSmsVerification("+15125550142");
    const [url, init] = fetchWithSession.mock.calls[0];
    expect(url).toBe(`${RELAY}/api/sms/start`);
    expect(JSON.parse(init.body)).toEqual({ phone: "+15125550142" });
  });

  it("explains the hourly code limit", async () => {
    const { startSmsVerification } = await load();
    fetchWithSession.mockResolvedValue(reply({ error: "too_many_codes" }, 429));
    await expect(startSmsVerification("+15125550142")).rejects.toThrow(/try again in an hour/);
  });

  it("confirms a code and returns the new preferences", async () => {
    const { confirmSms } = await load();
    const on = { ...STATE, prefs: { ...STATE.prefs, sms: { enabled: true, phone: "•••• 0142" } } };
    fetchWithSession.mockResolvedValue(reply(on));
    expect(await confirmSms("+15125550142", "123456")).toEqual(on);
    expect(JSON.parse(fetchWithSession.mock.calls[0][1].body)).toEqual({ phone: "+15125550142", code: "123456" });
  });

  it("explains a wrong code", async () => {
    const { confirmSms } = await load();
    fetchWithSession.mockResolvedValue(reply({ error: "wrong_code" }, 400));
    await expect(confirmSms("+15125550142", "000000")).rejects.toThrow(/isn't right/);
  });

  it("removes the number", async () => {
    const { removeSmsPhone } = await load();
    fetchWithSession.mockResolvedValue(reply(STATE));
    await removeSmsPhone();
    expect(fetchWithSession).toHaveBeenCalledWith(`${RELAY}/api/sms`, { method: "DELETE" });
  });
});
