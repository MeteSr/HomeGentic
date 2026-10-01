/**
 * @jest-environment node
 */
// POST /api/push/register — the caller comes from the x-agent-session token.
jest.mock("../store", () => ({ registerToken: jest.fn(), removeToken: jest.fn() }));
jest.mock("../session", () => ({ requestPrincipal: jest.fn() }));
jest.mock("web-push", () => ({
  setVapidDetails:   jest.fn(),
  sendNotification:  jest.fn(),
  generateVAPIDKeys: jest.fn(() => ({ publicKey: "BPub", privateKey: "Priv" })), // gitleaks:allow
}));

import request from "supertest";
import { buildApp } from "../server";
import { registerToken } from "../store";
import { requestPrincipal } from "../session";

const mockRegister  = registerToken    as jest.MockedFunction<typeof registerToken>;
const mockPrincipal = requestPrincipal as jest.MockedFunction<typeof requestPrincipal>;

const app = buildApp();
beforeEach(() => jest.clearAllMocks());

describe("POST /api/push/register", () => {
  it("registers the token for the session's principal, not the body's", async () => {
    mockPrincipal.mockResolvedValue("session-user");
    const res = await request(app)
      .post("/api/push/register")
      .set("x-agent-session", "hgs_" + "b".repeat(64))
      .send({ principal: "someone-else", token: "apns-token", platform: "ios" });
    expect(res.status).toBe(200);
    expect(mockRegister).toHaveBeenCalledWith("session-user", "apns-token", "ios");
  });

  it("returns 401 without a valid session", async () => {
    mockPrincipal.mockResolvedValue(null);
    const res = await request(app).post("/api/push/register").send({ token: "t", platform: "ios" });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "session_required" });
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it("validates token and platform", async () => {
    mockPrincipal.mockResolvedValue("session-user");
    expect((await request(app).post("/api/push/register").send({ platform: "ios" })).status).toBe(400);
    expect((await request(app).post("/api/push/register").send({ token: "t", platform: "web" })).status).toBe(400);
  });
});
