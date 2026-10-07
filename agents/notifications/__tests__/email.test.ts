/**
 * @jest-environment node
 */
// Notification email through Resend.
import { emailConfigured, renderEmail, sendEmail } from "../email";

const saved = { ...process.env };
let fetchMock: jest.Mock;

beforeEach(() => {
  process.env.RESEND_API_KEY = "re_test";
  process.env.NOTIFY_EMAIL_FROM = "HomeGentic <n@example.com>";
  process.env.APP_URL = "https://app.example.com/";
  fetchMock = jest.fn(async () => new Response("{}", { status: 200 }));
  (global as any).fetch = fetchMock;
});
afterEach(() => { process.env = { ...saved }; });

const PAYLOAD = { title: "Job verified", body: "Roof <repair> is now verified.", route: "jobs/JOB_1" };

describe("renderEmail", () => {
  it("links to the matching web page and to notification settings, escaping HTML", () => {
    const m = renderEmail(PAYLOAD);
    expect(m.subject).toBe("Job verified");
    expect(m.text).toContain("https://app.example.com/jobs");
    expect(m.text).toContain("https://app.example.com/settings?tab=notifications");
    expect(m.html).toContain("Roof &lt;repair&gt;");
    expect(m.html).not.toContain("<repair>");
  });
});

describe("sendEmail", () => {
  it("posts to Resend with the sender, recipient and an idempotency key", async () => {
    await sendEmail("owner@example.com", PAYLOAD, "job-id:7:owner");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.Authorization).toBe("Bearer re_test");
    expect(init.headers["Idempotency-Key"]).toBe("job-id:7:owner");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ from: "HomeGentic <n@example.com>", to: ["owner@example.com"], subject: "Job verified" });
  });

  it("throws on an error response", async () => {
    fetchMock.mockResolvedValue(new Response("bad key", { status: 401 }));
    await expect(sendEmail("a@b.c", PAYLOAD, "k")).rejects.toThrow("Resend 401");
  });

  it("is off without an API key", async () => {
    delete process.env.RESEND_API_KEY;
    expect(emailConfigured()).toBe(false);
    await sendEmail("a@b.c", PAYLOAD, "k");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
