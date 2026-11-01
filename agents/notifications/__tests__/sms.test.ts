/**
 * @jest-environment node
 */
// SMS through Twilio: Verify codes and alert texts.
import {
  E164, allowCodeRequest, allowCodeToPhone, checkVerification, renderSms, resetCodeLimits, sendSms, smsConfigured, smsCountryAllowed, startVerification,
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

describe("allowCodeToPhone", () => {
  it("caps codes per destination number regardless of principal", () => {
    const t0 = 1_000_000_000;
    for (let i = 0; i < 3; i++) expect(allowCodeToPhone("+15125550142", t0 + i)).toBe(true);
    expect(allowCodeToPhone("+15125550142", t0 + 10)).toBe(false);
    expect(allowCodeToPhone("+15125550143", t0 + 10)).toBe(true);
    // a new hour, but the daily cap (6) still applies
    for (let h = 1; h <= 3; h++) allowCodeToPhone("+15125550142", t0 + h * 3_600_001);
    expect(allowCodeToPhone("+15125550142", t0 + 4 * 3_600_001)).toBe(false);
  });
});

describe("smsCountryAllowed (CD-4: SMS pumping)", () => {
  afterEach(() => { delete process.env.SMS_ALLOWED_COUNTRY_CODES; });

  it("allows US and Canadian numbers", () => {
    expect(smsCountryAllowed("+15125550142")).toBe(true);   // Texas
    expect(smsCountryAllowed("+14165550142")).toBe(true);   // Toronto
    expect(smsCountryAllowed("+17875550142")).toBe(true);   // Puerto Rico (US)
  });

  it("refuses Caribbean +1 area codes and 900 premium numbers", () => {
    expect(smsCountryAllowed("+18765550142")).toBe(false);  // Jamaica
    expect(smsCountryAllowed("+18095550142")).toBe(false);  // Dominican Republic
    expect(smsCountryAllowed("+12845550142")).toBe(false);  // BVI
    expect(smsCountryAllowed("+19005550142")).toBe(false);  // premium rate
  });

  it("refuses other countries unless configured", () => {
    expect(smsCountryAllowed("+447700900123")).toBe(false);
    expect(smsCountryAllowed("+37255501420")).toBe(false);
    process.env.SMS_ALLOWED_COUNTRY_CODES = "44, +61";
    expect(smsCountryAllowed("+447700900123")).toBe(true);
    expect(smsCountryAllowed("+61412345678")).toBe(true);
    expect(smsCountryAllowed("+37255501420")).toBe(false);
  });

  it("refuses malformed and short +1 numbers", () => {
    expect(smsCountryAllowed("15125550142")).toBe(false);
    expect(smsCountryAllowed("+1512555014")).toBe(false);
  });
});

describe("relay-wide code caps", () => {
  afterEach(() => { delete process.env.SMS_GLOBAL_HOURLY_LIMIT; delete process.env.SMS_GLOBAL_DAILY_LIMIT; resetCodeLimits(); });

  it("stops at 50 an hour by default", () => {
    resetCodeLimits();
    const t0 = 5_000_000_000;
    for (let i = 0; i < 50; i++) expect(allowCodeToPhone(`+1512555${String(1000 + i)}`, t0 + i)).toBe(true);
    expect(allowCodeToPhone("+15125559999", t0 + 60)).toBe(false);
    expect(allowCodeToPhone("+15125559999", t0 + 3_600_001)).toBe(true);
  });

  it("also stops at the daily cap", () => {
    resetCodeLimits();
    process.env.SMS_GLOBAL_HOURLY_LIMIT = "1000";
    process.env.SMS_GLOBAL_DAILY_LIMIT = "3";
    const t0 = 9_000_000_000;
    for (let i = 0; i < 3; i++) expect(allowCodeToPhone(`+1512555${String(2000 + i)}`, t0 + i * 3_600_001)).toBe(true);
    expect(allowCodeToPhone("+15125559998", t0 + 4 * 3_600_001)).toBe(false);
  });
});
