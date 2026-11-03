/**
 * The gateway's HTTP routes (server.ts), which had no tests: the handlers and
 * pollers were tested on their own, but not the signature checks, replay
 * protection, payload validation and OAuth state checks in front of them
 * (test-gap audit 2026-11-03, M7). The canister and vendor APIs are mocked.
 *
 * GW.1  every webhook refuses a missing or wrong signature/token (401) and
 *       records nothing
 * GW.2  a correctly signed, valid event is recorded once; the same event sent
 *       again is answered but not recorded again (replay)
 * GW.3  invalid payloads and stale or future timestamps are refused (400)
 * GW.4  a canister error is a 500 and the event isn't marked seen, so the
 *       vendor's retry is recorded
 * GW.5  SmartThings: CONFIRMATION/PING need no signature, everything else does;
 *       EVENT records each valid device event
 * GW.6  admin routes need X-Admin-Token
 * GW.7  admin OAuth: the callback only accepts a state the start route issued,
 *       once
 * GW.8  device linking: needs a session; the callback needs the state from the
 *       start route AND the matching cookie; register binds a listed device
 *       through the canister and maps its errors
 * GW.9  /health
 */

jest.mock("../icp", () => ({
  recordSensorEvent: jest.fn(),
  getGatewayPrincipal: jest.fn(() => "gateway-principal"),
  registerVerifiedDevice: jest.fn(),
  isDryRun: jest.fn(() => false),
  resolveAgentSession: jest.fn(),
}));
jest.mock("../session", () => ({
  SESSION_HEADER: "x-agent-session",
  requestPrincipal: jest.fn(async (req: any) => (req.headers["x-agent-session"] === "good" ? "owner-principal" : null)),
  clearSessionCache: jest.fn(),
}));
jest.mock("../oauth/ecobee", () => ({
  authUrl: jest.fn(() => "https://ecobee.test/authorize?client_id=c"),
  exchangeCode: jest.fn(async () => "access"),
  fetchDevices: jest.fn(async () => [{ id: "th-1", name: "Hall", type: "thermostat" }]),
}));
jest.mock("../pollers/honeywellHome", () => ({ startHoneywellPoller: jest.fn(), persistTokenState: jest.fn() }));
jest.mock("../pollers/geSmartHQ", () => ({ startGEPoller: jest.fn(), persistTokenState: jest.fn() }));

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import crypto from "crypto";
import type { AddressInfo } from "net";
import type { Server } from "http";
import { app } from "../server";
import { recordSensorEvent, registerVerifiedDevice } from "../icp";
import { persistTokenState as persistHoneywellTokens } from "../pollers/honeywellHome";

const record = recordSensorEvent as jest.Mock;
const register = registerVerifiedDevice as jest.Mock;

const SECRETS = {
  NEST_WEBHOOK_SECRET: "nest-secret",
  ECOBEE_WEBHOOK_SECRET: "ecobee-secret",
  MOEN_FLO_WEBHOOK_SECRET: "moen-secret",
  SMARTTHINGS_WEBHOOK_SECRET: "st-secret",
  LG_THINQ_PAT: "lg-pat",
  ADMIN_TOKEN: "admin-token",
  HONEYWELL_CLIENT_ID: "hw-id",
  HONEYWELL_CLIENT_SECRET: "hw-secret",
};

let server: Server;
let base = "";
beforeAll(async () => {
  Object.assign(process.env, SECRETS);
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));
beforeEach(() => {
  record.mockReset();
  record.mockResolvedValue({ success: true, eventId: "EVT_1", jobId: null });
  register.mockReset();
});

let seq = 0;
const hex = (secret: string, raw: string) => crypto.createHmac("sha256", secret).update(raw).digest("hex");
const b64 = (secret: string, raw: string) => crypto.createHmac("sha256", secret).update(raw).digest("base64");
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(base + path, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
const now = () => new Date().toISOString();

const nest = () => ({
  eventId: `nest-${++seq}`,
  timestamp: now(),
  resourceUpdate: {
    name: "enterprises/p/devices/dev-1",
    traits: { "sdm.devices.traits.Temperature": { ambientTemperatureCelsius: 1 } },
  },
});
const ecobee = () => ({
  thermostatId: `th-${++seq}`,
  alerts: [{ alertType: "lowTemp", message: "Low temperature", value: 30 }],
});
const moen = () => ({ deviceId: `moen-${++seq}`, alertType: "LEAK", severity: "critical", timestamp: now() });
const lg = () => ({ deviceId: `lg-${++seq}`, type: "FAULT", code: "OE", severity: "critical", message: "Drain error" });

/** Each webhook: a valid body, and the headers that sign it. */
const WEBHOOKS: Record<
  string,
  { body: () => any; sign: (raw: string) => Record<string, string>; bad: Record<string, string> }
> = {
  "/webhooks/nest": {
    body: nest,
    sign: () => ({ "google-cloud-token": SECRETS.NEST_WEBHOOK_SECRET }),
    bad: { "google-cloud-token": "nope" },
  },
  "/webhooks/ecobee": {
    body: ecobee,
    sign: (raw) => ({ "x-ecobee-signature": hex(SECRETS.ECOBEE_WEBHOOK_SECRET, raw) }),
    bad: { "x-ecobee-signature": hex("wrong", "{}") },
  },
  "/webhooks/moen-flo": {
    body: moen,
    sign: (raw) => ({ "x-moen-signature": `sha256=${hex(SECRETS.MOEN_FLO_WEBHOOK_SECRET, raw)}` }),
    bad: { "x-moen-signature": "sha256=00" },
  },
  "/webhooks/lgthinq": {
    body: lg,
    sign: () => ({ authorization: `Bearer ${SECRETS.LG_THINQ_PAT}` }),
    bad: { authorization: "Bearer wrong" },
  },
};
const signed = (path: string, body: any) => {
  const raw = JSON.stringify(body);
  return post(path, body, WEBHOOKS[path].sign(raw));
};

describe("webhooks", () => {
  it.each(Object.keys(WEBHOOKS))("GW.1 %s refuses a missing or wrong signature", async (path) => {
    expect((await post(path, WEBHOOKS[path].body())).status).toBe(401);
    expect((await post(path, WEBHOOKS[path].body(), WEBHOOKS[path].bad)).status).toBe(401);
    expect(record).not.toHaveBeenCalled();
  });

  it.each(Object.keys(WEBHOOKS))(
    "GW.2 %s records a signed event once, and a replay isn't recorded again",
    async (path) => {
      const body = WEBHOOKS[path].body();
      const first = await signed(path, body);
      expect(first.status).toBe(200);
      expect(await first.json()).toMatchObject({ status: "recorded", eventId: "EVT_1" });
      const again = await signed(path, body);
      expect(again.status).toBe(200);
      expect(await again.json()).toMatchObject({ status: "rejected", reason: "duplicate event" });
      expect(record).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    ["/webhooks/nest", { ...nest(), eventId: "" }, "eventId missing or too long"],
    ["/webhooks/ecobee", { thermostatId: "t", alerts: "x" }, "alerts must be an array of at most 100 entries"],
    ["/webhooks/moen-flo", { ...moen(), severity: "loud" }, "severity must be critical|warning|info"],
    ["/webhooks/lgthinq", { ...lg(), code: "" }, "code missing or too long"],
  ])("GW.3 %s refuses an invalid payload", async (path, body, error) => {
    const res = await signed(path as string, body);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error });
    expect(record).not.toHaveBeenCalled();
  });

  it.each(["/webhooks/nest", "/webhooks/moen-flo"])("GW.3 %s refuses stale and future timestamps", async (path) => {
    const stale = { ...WEBHOOKS[path].body(), timestamp: new Date(Date.now() - 3600_000).toISOString() };
    const future = { ...WEBHOOKS[path].body(), timestamp: new Date(Date.now() + 3600_000).toISOString() };
    for (const [body, reason] of [
      [stale, "stale event"],
      [future, "timestamp in the future"],
    ] as const) {
      const res = await signed(path, body);
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ reason });
    }
    expect(record).not.toHaveBeenCalled();
  });

  it("GW.4 a canister error is a 500, and the vendor's retry is still recorded", async () => {
    const body = ecobee();
    record.mockResolvedValueOnce({ success: false, error: "Unavailable: sensor" });
    const failed = await signed("/webhooks/ecobee", body);
    expect(failed.status).toBe(500);
    const retry = await signed("/webhooks/ecobee", body);
    expect(await retry.json()).toMatchObject({ status: "recorded" });
    expect(record).toHaveBeenCalledTimes(2);
  });

  it("GW.4 the reading passed on names the vendor source", async () => {
    await signed("/webhooks/moen-flo", moen());
    expect(record.mock.calls[0][1]).toBe("MoenFlo");
    expect(record.mock.calls[0][0]).toMatchObject({ externalDeviceId: expect.stringMatching(/^moen-/) });
  });
});

describe("GW.5 SmartThings", () => {
  const stEvent = (executionId: string) => ({
    lifecycle: "EVENT",
    executionId,
    eventData: {
      events: [
        {
          eventType: "DEVICE_EVENT",
          deviceEvent: { deviceId: "st-1", capability: "waterSensor", attribute: "water", value: "wet" },
        },
        { eventType: "DEVICE_EVENT", deviceEvent: { deviceId: "", capability: "x", attribute: "y", value: 1 } },
      ],
    },
  });
  const stPost = (body: any, secret = SECRETS.SMARTTHINGS_WEBHOOK_SECRET) => {
    const raw = JSON.stringify(body);
    return post("/webhooks/smartthings", body, { "x-st-hmac-sha256": b64(secret, raw) });
  };

  it("acknowledges CONFIRMATION and PING without a signature", async () => {
    for (const lifecycle of ["CONFIRMATION", "PING"]) {
      const res = await post("/webhooks/smartthings", { lifecycle });
      expect(res.status).toBe(200);
    }
  });

  it("refuses an unsigned or wrongly signed EVENT", async () => {
    expect((await post("/webhooks/smartthings", stEvent("x1"))).status).toBe(401);
    expect((await stPost(stEvent("x2"), "wrong")).status).toBe(401);
    expect(record).not.toHaveBeenCalled();
  });

  it("records each valid device event once per execution", async () => {
    const first = await stPost(stEvent(`exec-${++seq}`));
    expect(await first.json()).toEqual({ status: "processed", count: 1 });
    expect(record).toHaveBeenCalledWith(expect.anything(), "SmartThings");
    const id = `exec-${++seq}`;
    await stPost(stEvent(id));
    expect(await (await stPost(stEvent(id))).json()).toMatchObject({ status: "rejected", reason: "duplicate event" });
    expect(record).toHaveBeenCalledTimes(2);
  });
});

describe("GW.6 admin routes", () => {
  it("need X-Admin-Token", async () => {
    expect((await post("/admin/smartthings/confirm", {})).status).toBe(401);
    expect((await post("/admin/smartthings/confirm", {}, { "x-admin-token": "wrong" })).status).toBe(401);
    expect((await post("/admin/smartthings/confirm", {}, { "x-admin-token": SECRETS.ADMIN_TOKEN })).status).toBe(503); // no URL set
    expect((await fetch(`${base}/oauth/start/honeywell`, { redirect: "manual" })).status).toBe(401);
    expect(
      (await post("/accounts/sense", { email: "a@b.c", password: "x" }, { "x-admin-token": "wrong" })).status,
    ).toBe(401);
  });
});

describe("GW.7 admin OAuth state", () => {
  const realFetch = global.fetch;
  it("accepts only a state the start route issued, and only once", async () => {
    const start = await fetch(`${base}/oauth/start/honeywell`, {
      redirect: "manual",
      headers: { "x-admin-token": SECRETS.ADMIN_TOKEN },
    });
    expect(start.status).toBe(302);
    const state = new URL(start.headers.get("location")!).searchParams.get("state")!;
    expect(state).toMatch(/.{16,}/);

    expect((await fetch(`${base}/oauth/callback/honeywell?code=c&state=forged`)).status).toBe(400);
    expect(persistHoneywellTokens).not.toHaveBeenCalled();

    // The token exchange goes to Honeywell; answer it, but let the test's own requests through.
    global.fetch = (async (url: any, init?: any) =>
      String(url).startsWith("https://api.honeywell.com")
        ? new Response(JSON.stringify({ access_token: "a", refresh_token: "r", expires_in: 3600 }), { status: 200 })
        : realFetch(url, init)) as typeof fetch;
    try {
      const ok = await fetch(`${base}/oauth/callback/honeywell?code=c&state=${encodeURIComponent(state)}`);
      expect(ok.status).toBe(200);
      expect(persistHoneywellTokens).toHaveBeenCalledWith(
        expect.objectContaining({ accessToken: "a", refreshToken: "r" }),
      );
      const reused = await fetch(`${base}/oauth/callback/honeywell?code=c&state=${encodeURIComponent(state)}`);
      expect(reused.status).toBe(400);
    } finally {
      global.fetch = realFetch;
    }
  });
});

describe("GW.8 device linking", () => {
  const link = (session?: string) =>
    post(
      "/oauth/device/link",
      { platform: "ecobee", propertyId: "prop-1" },
      session ? { "x-agent-session": session } : {},
    );

  it("needs a session to get a ticket, and a known platform", async () => {
    expect((await link()).status).toBe(401);
    expect((await link("bad")).status).toBe(401);
    expect(
      (await post("/oauth/device/link", { platform: "nope", propertyId: "p" }, { "x-agent-session": "good" })).status,
    ).toBe(400);
  });

  async function startFlow() {
    const { ticket } = (await (await link("good")).json()) as { ticket: string };
    const start = await fetch(`${base}/oauth/device/start/ecobee?ticket=${encodeURIComponent(ticket)}`, {
      redirect: "manual",
    });
    expect(start.status).toBe(302);
    const state = new URL(start.headers.get("location")!).searchParams.get("state")!;
    const cookie = start.headers.get("set-cookie")!.split(";")[0];
    return { ticket, state, cookie };
  }

  it("a ticket works once", async () => {
    const { ticket } = await startFlow();
    const again = await fetch(`${base}/oauth/device/start/ecobee?ticket=${encodeURIComponent(ticket)}`, {
      redirect: "manual",
    });
    expect(await again.text()).toMatch(/invalid ticket/);
  });

  it("the callback needs the state AND the browser's cookie", async () => {
    const { state } = await startFlow();
    const noCookie = await fetch(`${base}/oauth/device/callback/ecobee?code=c&state=${encodeURIComponent(state)}`);
    expect(await noCookie.text()).toMatch(/invalid state/);
    const { state: s2, cookie } = await startFlow();
    const wrongState = await fetch(`${base}/oauth/device/callback/ecobee?code=c&state=forged`, { headers: { cookie } });
    expect(await wrongState.text()).toMatch(/invalid state/);
    void s2;
  });

  it("lists the vendor's devices, then registers a listed one through the canister", async () => {
    const { state, cookie } = await startFlow();
    const cb = await fetch(`${base}/oauth/device/callback/ecobee?code=c&state=${encodeURIComponent(state)}`, {
      headers: { cookie },
    });
    const html = await cb.text();
    const pickToken = html.match(/"pickToken":"([^"]+)"/)?.[1];
    expect(pickToken).toBeTruthy();

    const reg = (deviceId: string, session = "good") =>
      post("/oauth/device/register", { pickToken, deviceId }, { "x-agent-session": session });
    expect((await reg("th-1", "bad")).status).toBe(401);
    expect((await reg("not-listed")).status).toBeGreaterThanOrEqual(400);
    expect(register).not.toHaveBeenCalled();

    register.mockResolvedValueOnce({ success: false, error: "NotAuthorized" });
    expect((await reg("th-1")).status).toBe(403);
    register.mockResolvedValueOnce({ success: true, device: { id: "DEV_1" } });
    const ok = await reg("th-1");
    expect(ok.status).toBe(200);
    expect(register).toHaveBeenLastCalledWith("owner-principal", "prop-1", "th-1", expect.anything(), "", "Hall");
  });
});

describe("GW.9 /health", () => {
  it("reports the gateway principal and platforms", async () => {
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, gatewayPrincipal: "gateway-principal" });
  });
});
