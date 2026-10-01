/**
 * @jest-environment node
 */
import {
  buildTokenPayload,
  parseNotificationRoute,
} from "../../services/notificationService";

describe("buildTokenPayload", () => {
  it("carries the token and platform but no principal", () => {
    const result = buildTokenPayload("apns-device-token", "ios");
    expect(result).toEqual({ token: "apns-device-token", platform: "ios" });
    expect(result).not.toHaveProperty("principal");
  });

  it("works for android platform", () => {
    const result = buildTokenPayload("fcm-token", "android");
    expect(result.platform).toBe("android");
  });
});

describe("registerPushToken", () => {
  const SESSION = "hgs_" + "c".repeat(64);
  const saved = process.env.EXPO_PUBLIC_NOTIFICATIONS_URL;

  function load(url: string | undefined) {
    if (url === undefined) delete process.env.EXPO_PUBLIC_NOTIFICATIONS_URL;
    else process.env.EXPO_PUBLIC_NOTIFICATIONS_URL = url;
    let mod!: typeof import("../../services/notificationService");
    jest.isolateModules(() => { mod = require("../../services/notificationService"); });
    return mod;
  }

  let fetchMock: jest.Mock;
  beforeEach(() => {
    fetchMock = jest.fn(async () => ({ ok: true, status: 200 }));
    (global as any).fetch = fetchMock;
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.EXPO_PUBLIC_NOTIFICATIONS_URL;
    else process.env.EXPO_PUBLIC_NOTIFICATIONS_URL = saved;
    jest.restoreAllMocks();
  });

  it("sends the session token in x-agent-session", async () => {
    const m = load("https://notify.example.com");
    const ok = await m.registerPushToken(m.buildTokenPayload("tok", "ios"), SESSION);
    expect(ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://notify.example.com/api/push/register");
    expect(init.headers["x-agent-session"]).toBe(SESSION);
    expect(JSON.parse(init.body)).toEqual({ token: "tok", platform: "ios" });
  });

  it("skips registration without a session token", async () => {
    const m = load("https://notify.example.com");
    expect(await m.registerPushToken(m.buildTokenPayload("tok", "ios"), null)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips registration without a relay URL", async () => {
    const m = load(undefined);
    expect(await m.registerPushToken(m.buildTokenPayload("tok", "ios"), SESSION)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports a rejected registration", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401 });
    const m = load("https://notify.example.com");
    expect(await m.registerPushToken(m.buildTokenPayload("tok", "ios"), SESSION)).toBe(false);
  });
});

describe("parseNotificationRoute", () => {
  it("returns the route string when present", () => {
    expect(parseNotificationRoute({ route: "jobs/abc123" })).toBe("jobs/abc123");
  });

  it("returns null for missing route", () => {
    expect(parseNotificationRoute({})).toBeNull();
  });

  it("returns null for non-string route", () => {
    expect(parseNotificationRoute({ route: 42 })).toBeNull();
  });

  it("returns null for null input", () => {
    expect(parseNotificationRoute(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(parseNotificationRoute(undefined)).toBeNull();
  });

  it("handles leads route", () => {
    expect(parseNotificationRoute({ route: "leads/lead_99" })).toBe("leads/lead_99");
  });
});
