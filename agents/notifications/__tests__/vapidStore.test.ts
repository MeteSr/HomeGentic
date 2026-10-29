/**
 * @jest-environment node
 */
// TDD — RED phase for #276 (VAPID web-push subscription store)

// Re-import fresh module state each test
function freshVapidStore() {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require("../vapidStore");
}

const P1 = "principal-vapid-1";
const P2 = "principal-vapid-2";

const SUB1 = {
  endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
  keys: { p256dh: "p256dh-key-aaa", auth: "auth-key-aaa" },
};

const SUB2 = {
  endpoint: "https://updates.push.services.mozilla.com/xyz789",
  keys: { p256dh: "p256dh-key-bbb", auth: "auth-key-bbb" },
};

describe("vapidStore.registerSubscription", () => {
  it("stores a new subscription for a principal", () => {
    const s = freshVapidStore();
    s.registerSubscription(P1, SUB1);
    expect(s.getSubscriptionsForPrincipal(P1)).toHaveLength(1);
    expect(s.getSubscriptionsForPrincipal(P1)[0].endpoint).toBe(SUB1.endpoint);
  });

  it("upserts an existing subscription (same endpoint)", () => {
    const s = freshVapidStore();
    s.registerSubscription(P1, SUB1);
    s.registerSubscription(P1, { ...SUB1, keys: { p256dh: "p2", auth: "a2" } });
    expect(s.getSubscriptionsForPrincipal(P1)).toHaveLength(1);
    expect(s.getSubscriptionsForPrincipal(P1)[0].keys.auth).toBe("a2");
  });

  it("allows multiple subscriptions for one principal (multiple browsers/devices)", () => {
    const s = freshVapidStore();
    s.registerSubscription(P1, SUB1);
    s.registerSubscription(P1, SUB2);
    expect(s.getSubscriptionsForPrincipal(P1)).toHaveLength(2);
  });

  it("isolates subscriptions across principals", () => {
    const s = freshVapidStore();
    s.registerSubscription(P1, SUB1);
    s.registerSubscription(P2, SUB2);
    expect(s.getSubscriptionsForPrincipal(P1)).toHaveLength(1);
    expect(s.getSubscriptionsForPrincipal(P2)).toHaveLength(1);
    expect(s.getSubscriptionsForPrincipal(P1)[0].endpoint).toBe(SUB1.endpoint);
  });
});

describe("vapidStore.removeSubscription", () => {
  it("removes a subscription by endpoint", () => {
    const s = freshVapidStore();
    s.registerSubscription(P1, SUB1);
    s.registerSubscription(P1, SUB2);
    s.removeSubscription(SUB1.endpoint);
    const remaining = s.getSubscriptionsForPrincipal(P1);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].endpoint).toBe(SUB2.endpoint);
  });

  it("removes the principal entry when last subscription is removed", () => {
    const s = freshVapidStore();
    s.registerSubscription(P1, SUB1);
    s.removeSubscription(SUB1.endpoint);
    expect(s.getSubscriptionsForPrincipal(P1)).toHaveLength(0);
  });

  it("is a no-op for unknown endpoint", () => {
    const s = freshVapidStore();
    s.registerSubscription(P1, SUB1);
    expect(() => s.removeSubscription("https://unknown")).not.toThrow();
    expect(s.getSubscriptionsForPrincipal(P1)).toHaveLength(1);
  });
});

describe("vapidStore.getSubscriptionsForPrincipal", () => {
  it("returns empty array for unknown principal", () => {
    const s = freshVapidStore();
    expect(s.getSubscriptionsForPrincipal("unknown")).toEqual([]);
  });
});

describe("L-5 per-principal cap", () => {
  it("keeps the newest MAX_SUBSCRIPTIONS_PER_PRINCIPAL browsers", () => {
    const s = freshVapidStore();
    const sub = (i: number) => ({ endpoint: `https://push.example/${i}`, keys: { p256dh: "k", auth: `a${i}` } });
    for (let i = 0; i < s.MAX_SUBSCRIPTIONS_PER_PRINCIPAL + 2; i++) s.registerSubscription(P1, sub(i));
    const kept = s.getSubscriptionsForPrincipal(P1).map((x: any) => x.endpoint);
    expect(kept).toHaveLength(s.MAX_SUBSCRIPTIONS_PER_PRINCIPAL);
    expect(kept[0]).toBe("https://push.example/2");
  });
});
