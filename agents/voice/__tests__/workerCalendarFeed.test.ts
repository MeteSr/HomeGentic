/**
 * GET /calendar/<token>.ics — the private calendar feed (issue #717).
 * Calendar apps can't send an API key or a session, so the token in the path
 * is the only credential; the Worker checks it against the job canister
 * (getCalendarFeed) and writes the .ics with packages/shared/src/ics.ts.
 *
 * WCF.1 a known token gets text/calendar with the owner's events, no API key needed
 * WCF.2 an unknown token is 404; a malformed one is 404 without a canister call
 * WCF.3 each IP gets a bounded number of fetches an hour
 * WCF.4 a canister that doesn't answer is 503, not a 500 or an empty calendar
 * WCF.5 only GET (and HEAD) are served
 * WCF.6 the request log never holds the token
 */

jest.mock("../paymentCanister", () => ({
  activateInCanister: jest.fn(),
  activateSubscriptionUntil: jest.fn(),
  consumeAgentCredit: jest.fn(),
  grantAgentCreditsOnce: jest.fn(),
  recordGift: jest.fn(),
  AlreadyConsumedError: class AlreadyConsumedError extends Error {},
  PAID_TIERS: new Set(["Pro", "ContractorPro"]),
  PRINCIPAL_RE: /^(?=.{1,63}$)[a-z0-9]+(?:-[a-z0-9]+)*$/,
  fetchSubscriptionTier: jest.fn(),
  getAgent: jest.fn(),
}));
jest.mock("../monitoringCanister", () => ({
  recordServiceError: jest.fn().mockResolvedValue(undefined),
  getCriticalCycleAlerts: jest.fn().mockResolvedValue([]),
  checkCycleLevels: jest.fn().mockResolvedValue([]),
  recordFrontendError: jest.fn(),
}));
jest.mock("../authCanister", () => ({ resolveAgentSessionOwner: jest.fn() }));
jest.mock("../src/propertyCanister", () => ({ markIdentityCleared: jest.fn() }));
jest.mock("../src/jobCanister", () => ({
  getInvitePreview: jest.fn(),
  getCalendarFeed: jest.fn(),
}));

import { describe, it, expect, beforeEach } from "@jest/globals";
import worker from "../src/index";
import { getCalendarFeed } from "../src/jobCanister";
import { CALENDAR_FEED_HOURLY_LIMIT } from "../src/calendarFeed";

const lookup = getCalendarFeed as unknown as jest.Mock<any>;
const TOKEN = "0123456789abcdef0123456789abcdef";

function makeEnv(over: Record<string, unknown> = {}): any {
  const kv = new Map<string, string>();
  return {
    VOICE_AGENT_API_KEY: "pubkey",
    FRONTEND_ORIGIN: "https://app.test",
    NODE_ENV: "production",
    CANISTER_ID_AUTH: "auth-id",
    CANISTER_ID_JOB: "job-id",
    RATE_LIMIT: {
      get: async (k: string) => kv.get(k) ?? null,
      put: async (k: string, v: string) => {
        kv.set(k, v);
      },
    },
    ...over,
  };
}
const ctx: any = { waitUntil: () => {} };

const get = (env: any, path: string, init: RequestInit = {}, ip = "1.2.3.4") =>
  worker.fetch(
    new Request(`https://worker.test${path}`, {
      ...init,
      headers: { "CF-Connecting-IP": ip, ...(init.headers as Record<string, string>) },
    }),
    env,
    ctx,
  );

beforeEach(() => {
  lookup.mockReset();
});

describe("GET /calendar/<token>.ics", () => {
  it("WCF.1 serves the owner's events as text/calendar without an API key", async () => {
    lookup.mockResolvedValue({
      updatedAt: 1n,
      events: [
        { uid: "warranty-J1", date: "2027-03-14", title: "Warranty ends: HVAC", description: "Cool Air Co", rrule: "" },
        {
          uid: "recurring-R1",
          date: "2026-12-30",
          title: "Pest Control visit",
          description: "",
          rrule: "FREQ=MONTHLY;INTERVAL=3",
        },
      ],
    });
    const res = await get(makeEnv(), `/calendar/${TOKEN}.ics`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/calendar; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("private, max-age=3600");
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
    expect(lookup).toHaveBeenCalledWith(TOKEN);
    const body = await res.text();
    expect(body.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(body).toContain("SUMMARY:Warranty ends: HVAC");
    expect(body).toContain("RRULE:FREQ=MONTHLY;INTERVAL=3");
    expect(body).toContain("X-WR-CALNAME:HomeGentic");
  });

  it("WCF.2 is 404 for an unknown token and doesn't ask the canister about a malformed one", async () => {
    lookup.mockResolvedValue(null);
    expect((await get(makeEnv(), `/calendar/${TOKEN}.ics`)).status).toBe(404);
    lookup.mockClear();
    for (const bad of [
      "/calendar/abc.ics",
      `/calendar/${TOKEN}`,
      `/calendar/${TOKEN.toUpperCase()}.ics`,
      `/calendar/${TOKEN}x.ics`,
      "/calendar/",
    ]) {
      expect((await get(makeEnv(), bad)).status).toBe(404);
    }
    expect(lookup).not.toHaveBeenCalled();
  });

  it("WCF.3 limits each IP's fetches per hour", async () => {
    lookup.mockResolvedValue({ updatedAt: 1n, events: [] });
    const env = makeEnv();
    for (let i = 0; i < CALENDAR_FEED_HOURLY_LIMIT; i++) {
      expect((await get(env, `/calendar/${TOKEN}.ics`, {}, "9.9.9.9")).status).toBe(200);
    }
    const limited = await get(env, `/calendar/${TOKEN}.ics`, {}, "9.9.9.9");
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("3600");
    expect((await get(env, `/calendar/${TOKEN}.ics`, {}, "8.8.8.8")).status).toBe(200);
  });

  it("WCF.4 is 503 when the job canister doesn't answer", async () => {
    lookup.mockRejectedValue(new Error("canister stopped"));
    expect((await get(makeEnv(), `/calendar/${TOKEN}.ics`)).status).toBe(503);
    lookup.mockReset();
    expect((await get(makeEnv({ CANISTER_ID_JOB: "" }), `/calendar/${TOKEN}.ics`)).status).toBe(503);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("WCF.5 serves only GET and HEAD", async () => {
    lookup.mockResolvedValue({ updatedAt: 1n, events: [] });
    expect((await get(makeEnv(), `/calendar/${TOKEN}.ics`, { method: "POST", body: "x" })).status).toBe(405);
    const head = await get(makeEnv(), `/calendar/${TOKEN}.ics`, { method: "HEAD" });
    expect(head.status).toBe(200);
  });

  it("WCF.6 keeps the token out of the request log", async () => {
    lookup.mockResolvedValue({ updatedAt: 1n, events: [] });
    const spy = jest.spyOn(console, "log").mockImplementation(() => {});
    await get(makeEnv(), `/calendar/${TOKEN}.ics`);
    const logged = spy.mock.calls.map((c) => String(c[0])).join("\n");
    spy.mockRestore();
    expect(logged).toContain("/calendar/:token.ics");
    expect(logged).not.toContain(TOKEN);
  });
});
