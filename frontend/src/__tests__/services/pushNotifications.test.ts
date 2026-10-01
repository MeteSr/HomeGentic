/**
 * pushNotifications.ts — browser push: permission, service worker,
 * VAPID subscription, and registration with the relay under the caller's
 * agent session (never a body principal).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const fetchWithSession = vi.fn();
vi.mock("@/services/agentSession", () => ({
  fetchWithAgentSession: (...a: unknown[]) => fetchWithSession(...a),
}));

const RELAY = "https://notify.example.com";

interface FakeSub { endpoint: string; toJSON: () => object; unsubscribe: ReturnType<typeof vi.fn> }

function fakeSub(endpoint = "https://push.example/sub-1"): FakeSub {
  return {
    endpoint,
    toJSON: () => ({ endpoint, keys: { p256dh: "p", auth: "a" } }),
    unsubscribe: vi.fn(async () => true),
  };
}

let existingSub: FakeSub | null;
let subscribe: ReturnType<typeof vi.fn>;
let register: ReturnType<typeof vi.fn>;
let requestPermission: ReturnType<typeof vi.fn>;
let permission: NotificationPermission;

function installBrowser() {
  existingSub = null;
  subscribe = vi.fn(async () => (existingSub = fakeSub()));
  const reg = { pushManager: { getSubscription: vi.fn(async () => existingSub), subscribe } };
  register = vi.fn(async () => reg);
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { register, ready: Promise.resolve(reg), getRegistration: vi.fn(async () => reg) },
  });
  vi.stubGlobal("PushManager", function PushManager() {});
  permission = "default";
  requestPermission = vi.fn(async () => permission);
  vi.stubGlobal("Notification", { get permission() { return permission; }, requestPermission });
}

async function load(url = RELAY) {
  vi.resetModules();
  vi.stubEnv("VITE_NOTIFICATIONS_URL", url);
  return import("@/services/pushNotifications");
}

beforeEach(() => {
  installBrowser();
  fetchWithSession.mockReset();
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.endsWith("/api/push/vapid-public-key")) {
      return new Response(JSON.stringify({ publicKey: "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U" }));
    }
    return new Response("{}");
  }));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("urlBase64ToUint8Array", () => {
  it("decodes base64url with missing padding", async () => {
    const { urlBase64ToUint8Array } = await load();
    expect(Array.from(urlBase64ToUint8Array("AQID_-8"))).toEqual([1, 2, 3, 255, 239]);
  });
});

describe("getPushStatus", () => {
  it("is unavailable without a relay URL", async () => {
    const { getPushStatus } = await load("");
    expect(await getPushStatus()).toBe("unavailable");
  });

  it("reports denied, off and on", async () => {
    const { getPushStatus } = await load();
    permission = "denied";
    expect(await getPushStatus()).toBe("denied");
    permission = "granted";
    expect(await getPushStatus()).toBe("off");
    existingSub = fakeSub();
    expect(await getPushStatus()).toBe("on");
  });
});

describe("enablePush", () => {
  it("subscribes with the relay's VAPID key and registers under the agent session", async () => {
    const { enablePush } = await load();
    permission = "granted";
    fetchWithSession.mockResolvedValue(new Response("{}", { status: 200 }));

    expect(await enablePush()).toBe("on");
    expect(register).toHaveBeenCalledWith("/push-sw.js");
    expect(subscribe).toHaveBeenCalledWith(expect.objectContaining({ userVisibleOnly: true }));

    const [url, init] = fetchWithSession.mock.calls[0];
    expect(url).toBe(`${RELAY}/api/push/vapid-subscribe`);
    const body = JSON.parse(init.body);
    expect(body).toEqual({ subscription: { endpoint: "https://push.example/sub-1", keys: { p256dh: "p", auth: "a" } } });
    expect(body).not.toHaveProperty("principal");
  });

  it("stops when permission isn't granted", async () => {
    const { enablePush } = await load();
    permission = "denied";
    expect(await enablePush()).toBe("denied");
    expect(register).not.toHaveBeenCalled();
  });

  it("undoes the browser subscription when the relay rejects the registration", async () => {
    const { enablePush } = await load();
    permission = "granted";
    fetchWithSession.mockResolvedValue(new Response("{}", { status: 401 }));
    await expect(enablePush()).rejects.toThrow(/sign in again/i);
    expect(existingSub!.unsubscribe).toHaveBeenCalled();
  });
});

describe("disablePush", () => {
  it("tells the relay and unsubscribes the browser", async () => {
    const { disablePush } = await load();
    const sub = (existingSub = fakeSub("https://push.example/sub-9"));
    expect(await disablePush()).toBe("off");
    expect(fetch).toHaveBeenCalledWith(`${RELAY}/api/push/vapid-unsubscribe`, expect.objectContaining({
      body: JSON.stringify({ endpoint: "https://push.example/sub-9" }),
    }));
    expect(sub.unsubscribe).toHaveBeenCalled();
  });
});

describe("push preferences", () => {
  const PREFS = {
    job_awaiting_signature: true, job_awaiting_contractor_signature: true,
    bid_accepted: true, bid_declined: false,
  };

  it("pushConfigured follows VITE_NOTIFICATIONS_URL", async () => {
    expect((await load()).pushConfigured()).toBe(true);
    expect((await load("")).pushConfigured()).toBe(false);
  });

  it("reads the user's preferences under the agent session", async () => {
    const { getPushPrefs } = await load();
    fetchWithSession.mockResolvedValue(new Response(JSON.stringify({ prefs: PREFS })));
    expect(await getPushPrefs()).toEqual(PREFS);
    expect(fetchWithSession).toHaveBeenCalledWith(`${RELAY}/api/push/prefs`, { method: "GET" });
  });

  it("sends only the changed kinds and returns the full set", async () => {
    const { setPushPrefs } = await load();
    fetchWithSession.mockResolvedValue(new Response(JSON.stringify({ prefs: { ...PREFS, bid_accepted: false } })));
    const out = await setPushPrefs({ bid_accepted: false });
    expect(out.bid_accepted).toBe(false);
    const [url, init] = fetchWithSession.mock.calls[0];
    expect(url).toBe(`${RELAY}/api/push/prefs`);
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ prefs: { bid_accepted: false } });
  });

  it("explains a rejected session", async () => {
    const { getPushPrefs } = await load();
    fetchWithSession.mockResolvedValue(new Response("{}", { status: 401 }));
    await expect(getPushPrefs()).rejects.toThrow(/sign in again/i);
  });

  it("refuses without a relay", async () => {
    const { getPushPrefs } = await load("");
    await expect(getPushPrefs()).rejects.toThrow(/aren't configured/);
    expect(fetchWithSession).not.toHaveBeenCalled();
  });
});

