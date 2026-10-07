/**
 * @jest-environment node
 */
// SMS through Twilio: Verify codes and alert texts.
import {
  E164, allowCodeRequest, checkVerification, renderSms, resetCodeLimits, sendSms, smsConfigured, startVerification,
} from "../sms";

const saved = { ...process.env };
let fetchMock: jest.Mock;
const json = (status: number, body: object) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  Object.assign(process.env, {
    TWILIO_ACCOUNT_SID: "AC123", TWILIO_AUTH_TOKEN: "tok", TWILIO_VERIFY_SERVICE_SID: "VA123",
    TWILIO_MESSAGING_SERVICE_SID: "MG123", APP_URL: "https://app.example.com",
  });
  fetchMock = jest.fn(async () => json(201, { status: "pending" }));
  (global as any).fetch = fetchMock;
  resetCodeLimits();
});
afterEach(() => { process.env = { ...saved }; });

const form = (call: unknown[]) => new URLSearchParams((call[1] as RequestInit).body as string);

describe("configuration", () => {
  it("needs credentials, a Verify service and a sender", () => {
    expect(smsConfigured()).toBe(true);
    delete process.env.TWILIO_MESSAGING_SERVICE_SID;
    expect(smsConfigured()).toBe(false);
    process.env.TWILIO_FROM_NUMBER = "+15125550100";
    expect(smsConfigured()).toBe(true);
  });

  it("accepts only E.164 numbers", () => {
    expect(E164.test("+15125550142")).toBe(true);
    expect(E164.test("+447911123456")).toBe(true);
    expect(E164.test("15125550142")).toBe(false);
    expect(E164.test("+0512555014")).toBe(false);
  });
});

describe("Verify", () => {
  it("starts a verification by SMS", async () => {
    await startVerification("+15125550142");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://verify.twilio.com/v2/Services/VA123/Verifications");
    expect(init.headers.Authorization).toBe("Basic " + Buffer.from("AC123:tok").toString("base64"));
    expect(Object.fromEntries(form(fetchMock.mock.calls[0]))).toEqual({ To: "+15125550142", Channel: "sms" });
  });

  it("approves only an approved check", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { status: "approved" }));
    expect(await checkVerification("+15125550142", "123456")).toBe(true);
    fetchMock.mockResolvedValueOnce(json(200, { status: "pending" }));
    expect(await checkVerification("+15125550142", "000000")).toBe(false);
  });

  it("treats a missing verification (404) as a wrong code, but surfaces other errors", async () => {
    fetchMock.mockResolvedValueOnce(json(404, { message: "not found" }));
    expect(await checkVerification("+15125550142", "123456")).toBe(false);
    fetchMock.mockResolvedValueOnce(json(500, { message: "boom" }));
    await expect(checkVerification("+15125550142", "123456")).rejects.toThrow("Twilio 500");
  });
});

describe("alert texts", () => {
  const PAYLOAD = { title: "Sensor alert", body: "Water leak detected. We opened a job for it.", route: "jobs/JOB_3" };

  it("sends from the messaging service with a link and opt-out line", async () => {
    await sendSms("+15125550142", PAYLOAD);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json");
    const f = form(fetchMock.mock.calls[0]);
    expect(f.get("To")).toBe("+15125550142");
    expect(f.get("MessagingServiceSid")).toBe("MG123");
    expect(f.get("Body")).toBe(renderSms(PAYLOAD));
    expect(f.get("Body")).toContain("https://app.example.com/jobs");
    expect(f.get("Body")).toContain("Reply STOP");
  });

  it("does nothing when not configured", async () => {
    delete process.env.TWILIO_AUTH_TOKEN;
    await sendSms("+15125550142", PAYLOAD);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("code-request limit", () => {
  it("allows five codes an hour per user", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) expect(allowCodeRequest("u", t0 + i)).toBe(true);
    expect(allowCodeRequest("u", t0 + 10)).toBe(false);
    expect(allowCodeRequest("other", t0 + 10)).toBe(true);
    expect(allowCodeRequest("u", t0 + 3_600_001)).toBe(true);
  });
});
