/**
 * @jest-environment node
 */
// GET/PUT /api/prefs and the SMS confirmation endpoints — the caller comes
// from the x-agent-session token.
jest.mock("../session", () => ({ requestPrincipal: jest.fn() }));
jest.mock("../sms", () => {
  const actual = jest.requireActual("../sms");
  return {
    ...actual,
    smsConfigured:     jest.fn(() => true),
    startVerification: jest.fn(async () => undefined),
    checkVerification: jest.fn(async () => true),
  };
});
jest.mock("web-push", () => ({
  setVapidDetails:   jest.fn(),
  sendNotification:  jest.fn(),
  generateVAPIDKeys: jest.fn(() => ({ publicKey: "BPub", privateKey: "Priv" })), // gitleaks:allow
}));

import request from "supertest";
import { buildApp } from "../server";
import { requestPrincipal } from "../session";
import * as sms from "../sms";

const mockPrincipal = requestPrincipal as jest.MockedFunction<typeof requestPrincipal>;
const smsMock = sms as jest.Mocked<typeof sms>;
const app = buildApp();

beforeEach(() => {
  jest.clearAllMocks();
  sms.resetCodeLimits();
  smsMock.smsConfigured.mockReturnValue(true);
  smsMock.checkVerification.mockResolvedValue(true);
});

describe("/api/prefs", () => {
  it("returns 401 without a session", async () => {
    mockPrincipal.mockResolvedValue(null);
    expect((await request(app).get("/api/prefs")).status).toBe(401);
    expect((await request(app).put("/api/prefs").send({ prefs: { push: { bid_declined: false } } })).status).toBe(401);
  });

  it("reports which optional channels are configured", async () => {
    mockPrincipal.mockResolvedValue("chan-user");
    const res = await request(app).get("/api/prefs");
    expect(res.body.channels).toEqual({ email: false, sms: true });
  });

  it("saves the session user's changes and returns the full set", async () => {
    mockPrincipal.mockResolvedValue("endpoint-user");
    const put = await request(app).put("/api/prefs").send({ prefs: { push: { bid_declined: false }, email: { bid_outcome: true } } });
    expect(put.status).toBe(200);
    expect(put.body.prefs.push).toMatchObject({ bid_declined: false, bid_accepted: true });
    expect(put.body.prefs.email.bid_outcome).toBe(true);
    expect((await request(app).get("/api/prefs")).body.prefs.push.bid_declined).toBe(false);
  });

  it("keeps users apart", async () => {
    mockPrincipal.mockResolvedValue("someone-else");
    expect((await request(app).get("/api/prefs")).body.prefs.push.bid_declined).toBe(true);
  });

  it("rejects invalid changes with 400", async () => {
    mockPrincipal.mockResolvedValue("endpoint-user");
    expect((await request(app).put("/api/prefs").send({ prefs: { push: { anything: false } } })).status).toBe(400);
    expect((await request(app).put("/api/prefs").send({ prefs: { sms: { enabled: true } } })).status).toBe(400);
  });
});

describe("SMS confirmation", () => {
  const PHONE = "+15125550142";

  it("texts a code to a valid number", async () => {
    mockPrincipal.mockResolvedValue("sms-user");
    const res = await request(app).post("/api/sms/start").send({ phone: PHONE });
    expect(res.status).toBe(200);
    expect(smsMock.startVerification).toHaveBeenCalledWith(PHONE);
  });

  it("rejects numbers that aren't E.164", async () => {
    mockPrincipal.mockResolvedValue("sms-user");
    for (const phone of ["5125550142", "+0123456789", "+1 512 555 0142", ""]) {
      expect((await request(app).post("/api/sms/start").send({ phone })).status).toBe(400);
    }
    expect(smsMock.startVerification).not.toHaveBeenCalled();
  });

  it("limits code requests per user", async () => {
    mockPrincipal.mockResolvedValue("chatty-user");
    for (let i = 0; i < 5; i++) {
      expect((await request(app).post("/api/sms/start").send({ phone: PHONE })).status).toBe(200);
    }
    expect((await request(app).post("/api/sms/start").send({ phone: PHONE })).status).toBe(429);
  });

  it("stores the number and turns SMS on when the code matches", async () => {
    mockPrincipal.mockResolvedValue("sms-user");
    const res = await request(app).post("/api/sms/confirm").send({ phone: PHONE, code: "123456" });
    expect(res.status).toBe(200);
    expect(res.body.prefs.sms).toEqual({ enabled: true, phone: "•••• 0142" });
  });

  it("refuses a wrong code and stores nothing", async () => {
    mockPrincipal.mockResolvedValue("wrong-code-user");
    smsMock.checkVerification.mockResolvedValue(false);
    const res = await request(app).post("/api/sms/confirm").send({ phone: PHONE, code: "000000" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("wrong_code");
    expect((await request(app).get("/api/prefs")).body.prefs.sms).toEqual({ enabled: false, phone: null });
  });

  it("forgets the number on DELETE", async () => {
    mockPrincipal.mockResolvedValue("sms-user");
    const res = await request(app).delete("/api/sms");
    expect(res.body.prefs.sms).toEqual({ enabled: false, phone: null });
  });

  it("answers 503 when Twilio isn't configured", async () => {
    mockPrincipal.mockResolvedValue("sms-user");
    smsMock.smsConfigured.mockReturnValue(false);
    expect((await request(app).post("/api/sms/start").send({ phone: PHONE })).status).toBe(503);
  });
});
