/**
 * @jest-environment node
 */
// M-1 (2026-10-28 audit): behind Fly's proxy, rate limits must key on the
// client address from X-Forwarded-For, not the proxy's.
jest.mock("web-push", () => ({
  setVapidDetails:   jest.fn(),
  sendNotification:  jest.fn(),
  generateVAPIDKeys: jest.fn(() => ({ publicKey: "BPub", privateKey: "Priv" })), // gitleaks:allow
}));

import request from "supertest";

describe("TRUST_PROXY_HOPS", () => {
  const prev = process.env.TRUST_PROXY_HOPS;
  afterEach(() => { process.env.TRUST_PROXY_HOPS = prev; jest.resetModules(); });

  function app(hops: string | undefined) {
    if (hops === undefined) delete process.env.TRUST_PROXY_HOPS; else process.env.TRUST_PROXY_HOPS = hops;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("../server").buildApp();
  }

  it("is off by default", () => {
    expect(app(undefined).get("trust proxy")).toBeFalsy();
  });

  it("gives each client its own /api limit on Fly", async () => {
    const a = app("1");
    expect(a.get("trust proxy")).toBe(1);
    for (let i = 0; i < 60; i++) {
      await request(a).get("/api/push/vapid-public-key").set("X-Forwarded-For", "203.0.113.1");
    }
    expect((await request(a).get("/api/push/vapid-public-key").set("X-Forwarded-For", "203.0.113.1")).status).toBe(429);
    expect((await request(a).get("/api/push/vapid-public-key").set("X-Forwarded-For", "203.0.113.2")).status).toBe(200);
  });
});
