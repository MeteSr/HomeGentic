/**
 * @jest-environment node
 */
// Registrations and cursors survive a restart when NOTIFICATIONS_DATA_FILE is set.
import fs   from "fs";
import os   from "os";
import path from "path";

let dir: string;
const saved = { ...process.env };

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "hg-notify-"));
  process.env.NOTIFICATIONS_DATA_FILE = path.join(dir, "state", "notifications.json");
  jest.resetModules();
});
afterEach(() => {
  process.env = { ...saved };
  fs.rmSync(dir, { recursive: true, force: true });
});

/** Simulates a process restart: drops every module, including persist's cache. */
function restart() {
  jest.resetModules();
  return {
    store: require("../store") as typeof import("../store"),
    vapid: require("../vapidStore") as typeof import("../vapidStore"),
  };
}

describe("persistence", () => {
  it("keeps device tokens and browser subscriptions across a restart", () => {
    const a = restart();
    a.store.registerToken("p1", "tok-1", "ios");
    a.vapid.registerSubscription("p1", { endpoint: "https://push.example/1", keys: { p256dh: "k", auth: "a" } });

    const b = restart();
    expect(b.store.getTokensForPrincipal("p1").map((r) => r.token)).toEqual(["tok-1"]);
    expect(b.vapid.getSubscriptionsForPrincipal("p1").map((s) => s.endpoint)).toEqual(["https://push.example/1"]);
  });

  it("keeps removals across a restart", () => {
    const a = restart();
    a.store.registerToken("p1", "tok-1", "android");
    a.store.removeToken("tok-1");
    expect(restart().store.getTokensForPrincipal("p1")).toEqual([]);
  });

  it("writes the file owner-only", () => {
    restart().store.registerToken("p1", "tok-1", "ios");
    const mode = fs.statSync(process.env.NOTIFICATIONS_DATA_FILE!).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("moves an unreadable file aside instead of overwriting it", () => {
    const file = process.env.NOTIFICATIONS_DATA_FILE!;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "{not json");
    jest.spyOn(console, "error").mockImplementation(() => {});
    const { store } = restart();
    expect(store.getTokensForPrincipal("p1")).toEqual([]);
    expect(fs.readdirSync(path.dirname(file)).some((f) => f.includes(".corrupt-"))).toBe(true);
  });
});

describe("one device, one user", () => {
  it("moves a device token to the principal that registers it last", () => {
    const { store } = restart();
    store.registerToken("alice", "shared-phone", "ios");
    store.registerToken("bob",   "shared-phone", "ios");
    expect(store.getTokensForPrincipal("alice")).toEqual([]);
    expect(store.getTokensForPrincipal("bob").map((r) => r.token)).toEqual(["shared-phone"]);
  });

  it("moves a browser subscription the same way", () => {
    const { vapid } = restart();
    const sub = { endpoint: "https://push.example/shared", keys: { p256dh: "k", auth: "a" } };
    vapid.registerSubscription("alice", sub);
    vapid.registerSubscription("bob",   sub);
    expect(vapid.getSubscriptionsForPrincipal("alice")).toEqual([]);
    expect(vapid.getSubscriptionsForPrincipal("bob")).toHaveLength(1);
  });
});
