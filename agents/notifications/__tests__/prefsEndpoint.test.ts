/**
 * @jest-environment node
 */
// GET/PUT /api/push/prefs — the caller comes from the x-agent-session token.
jest.mock("../session", () => ({ requestPrincipal: jest.fn() }));
jest.mock("web-push", () => ({
  setVapidDetails:   jest.fn(),
  sendNotification:  jest.fn(),
  generateVAPIDKeys: jest.fn(() => ({ publicKey: "BPub", privateKey: "Priv" })), // gitleaks:allow
}));

import request from "supertest";
import { buildApp } from "../server";
import { requestPrincipal } from "../session";

const mockPrincipal = requestPrincipal as jest.MockedFunction<typeof requestPrincipal>;
const app = buildApp();

beforeEach(() => jest.clearAllMocks());

describe("/api/push/prefs", () => {
  it("returns 401 without a session", async () => {
    mockPrincipal.mockResolvedValue(null);
    expect((await request(app).get("/api/push/prefs")).status).toBe(401);
    expect((await request(app).put("/api/push/prefs").send({ prefs: { bid_declined: false } })).status).toBe(401);
  });

  it("saves the session user's changes and returns the full set", async () => {
    mockPrincipal.mockResolvedValue("endpoint-user");
    const put = await request(app).put("/api/push/prefs").send({ prefs: { bid_declined: false } });
    expect(put.status).toBe(200);
    expect(put.body.prefs).toMatchObject({ bid_declined: false, bid_accepted: true });

    const get = await request(app).get("/api/push/prefs");
    expect(get.body.prefs.bid_declined).toBe(false);
  });

  it("keeps users apart", async () => {
    mockPrincipal.mockResolvedValue("someone-else");
    const get = await request(app).get("/api/push/prefs");
    expect(get.body.prefs.bid_declined).toBe(true);
  });

  it("rejects unknown kinds with 400", async () => {
    mockPrincipal.mockResolvedValue("endpoint-user");
    const res = await request(app).put("/api/push/prefs").send({ prefs: { anything: false } });
    expect(res.status).toBe(400);
  });
});
