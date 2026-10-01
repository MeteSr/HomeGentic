/**
 * @jest-environment node
 */
// TDD — RED phase for #276 (VAPID HTTP endpoints)
jest.mock("../vapidStore", () => ({
  registerSubscription: jest.fn(),
  removeSubscription:   jest.fn(),
  getSubscriptionsForPrincipal: jest.fn(() => []),
}));
jest.mock("web-push", () => ({
  setVapidDetails:  jest.fn(),
  sendNotification: jest.fn(),
  generateVAPIDKeys: jest.fn(() => ({
    publicKey:  "BPublicKeyTestValue",
    privateKey: "TestVapidPrivValue", // gitleaks:allow
  })),
}));

import request from "supertest";
import { buildApp } from "../server";
import { registerSubscription, removeSubscription } from "../vapidStore";

const mockRegister = registerSubscription as jest.MockedFunction<typeof registerSubscription>;
const mockRemove   = removeSubscription   as jest.MockedFunction<typeof removeSubscription>;

const app = buildApp();

const VALID_SUB = {
  endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
  keys: { p256dh: "p256dh-key-aaa", auth: "auth-key-aaa" },
};

beforeEach(() => jest.clearAllMocks());

describe("GET /api/push/vapid-public-key", () => {
  it("returns the VAPID public key", async () => {
    const res = await request(app).get("/api/push/vapid-public-key");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("publicKey");
    expect(typeof res.body.publicKey).toBe("string");
    expect(res.body.publicKey.length).toBeGreaterThan(0);
  });
});

describe("POST /api/push/vapid-subscribe", () => {
  it("registers a valid subscription and returns ok", async () => {
    const res = await request(app)
      .post("/api/push/vapid-subscribe")
      .send({ principal: "principal-1", subscription: VALID_SUB });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(mockRegister).toHaveBeenCalledWith("principal-1", VALID_SUB);
  });

  it("rejects a request with no caller with 401", async () => {
    const res = await request(app)
      .post("/api/push/vapid-subscribe")
      .send({ subscription: VALID_SUB });
    expect(res.status).toBe(401);
  });

  it("rejects missing subscription with 400", async () => {
    const res = await request(app)
      .post("/api/push/vapid-subscribe")
      .send({ principal: "principal-1" });
    expect(res.status).toBe(400);
  });

  it("rejects subscription without endpoint with 400", async () => {
    const res = await request(app)
      .post("/api/push/vapid-subscribe")
      .send({ principal: "p1", subscription: { keys: { p256dh: "k", auth: "a" } } });
    expect(res.status).toBe(400);
  });

  it("rejects subscription without keys with 400", async () => {
    const res = await request(app)
      .post("/api/push/vapid-subscribe")
      .send({ principal: "p1", subscription: { endpoint: "https://push.example.com/sub" } });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/push/vapid-unsubscribe", () => {
  it("removes subscription by endpoint and returns ok", async () => {
    const res = await request(app)
      .post("/api/push/vapid-unsubscribe")
      .send({ endpoint: VALID_SUB.endpoint });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(mockRemove).toHaveBeenCalledWith(VALID_SUB.endpoint);
  });

  it("rejects missing endpoint with 400", async () => {
    const res = await request(app)
      .post("/api/push/vapid-unsubscribe")
      .send({});
    expect(res.status).toBe(400);
  });
});
