/**
 * Email Provider — unit tests
 *
 * emailProvider.ts  — EmailProvider interface, SendEmailParams, EmailRateLimitError
 * resendEmailProvider.ts — ResendEmailProvider (mocked SDK), RateLimitedEmailProvider,
 *                          createEmailProvider factory
 *
 * No real Resend API calls are made. ResendEmailProvider is tested via a
 * Jest mock of the Resend SDK. RateLimitedEmailProvider is tested against
 * a lightweight in-memory stub that implements EmailProvider.
 */

import {
  type EmailProvider,
  type SendEmailParams,
  type EmailResult,
  EmailRateLimitError,
} from "../emailProvider";

import {
  ResendEmailProvider,
  RateLimitedEmailProvider,
  createEmailProvider,
} from "../resendEmailProvider";

// ── Mock the Resend SDK ───────────────────────────────────────────────────────

const mockSend = jest.fn();

jest.mock("resend", () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: mockSend },
  })),
}));

beforeEach(() => {
  mockSend.mockReset();
});

// ── Test double: in-memory EmailProvider ──────────────────────────────────────

class StubEmailProvider implements EmailProvider {
  calls: SendEmailParams[] = [];
  failNext = false;

  async send(params: SendEmailParams): Promise<EmailResult> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("Stub send failure");
    }
    this.calls.push(params);
    return { id: `stub-${this.calls.length}` };
  }
}

// ── EmailRateLimitError ───────────────────────────────────────────────────────

describe("EmailRateLimitError", () => {
  it("is an instance of Error", () => {
    const err = new EmailRateLimitError("limit hit");
    expect(err).toBeInstanceOf(Error);
  });

  it("has name EmailRateLimitError", () => {
    const err = new EmailRateLimitError("limit hit");
    expect(err.name).toBe("EmailRateLimitError");
  });

  it("carries the provided message", () => {
    const err = new EmailRateLimitError("daily limit reached");
    expect(err.message).toBe("daily limit reached");
  });
});

// ── SendEmailParams shape ─────────────────────────────────────────────────────

describe("SendEmailParams — required fields", () => {
  it("accepts a minimal params object", () => {
    const params: SendEmailParams = {
      to:      "user@example.com",
      subject: "Hello",
      html:    "<p>Hi</p>",
    };
    expect(params.to).toBe("user@example.com");
    expect(params.subject).toBe("Hello");
  });

  it("accepts an array of recipients", () => {
    const params: SendEmailParams = {
      to:      ["a@example.com", "b@example.com"],
      subject: "Multi",
      html:    "<p>Hi</p>",
    };
    expect(Array.isArray(params.to)).toBe(true);
    expect((params.to as string[]).length).toBe(2);
  });

  it("accepts all optional fields", () => {
    const params: SendEmailParams = {
      to:      "user@example.com",
      from:    "custom@homegentic.app",
      subject: "Full",
      html:    "<p>Hi</p>",
      text:    "Hi",
      replyTo: "support@homegentic.app",
    };
    expect(params.from).toBe("custom@homegentic.app");
    expect(params.replyTo).toBe("support@homegentic.app");
  });
});

// ── ResendEmailProvider ───────────────────────────────────────────────────────

describe("ResendEmailProvider", () => {
  const provider = new ResendEmailProvider("re_test_key", "noreply@homegentic.app");

  it("calls client.emails.send with correct fields", async () => {
    mockSend.mockResolvedValueOnce({ data: { id: "resend-abc" }, error: null });

    const result = await provider.send({
      to:      "buyer@example.com",
      subject: "Your report is ready",
      html:    "<p>View it here</p>",
    });

    expect(mockSend).toHaveBeenCalledTimes(1);
    const call = mockSend.mock.calls[0][0];
    expect(call.to).toEqual(["buyer@example.com"]);
    expect(call.from).toBe("noreply@homegentic.app");
    expect(call.subject).toBe("Your report is ready");
    expect(call.html).toBe("<p>View it here</p>");
    expect(result.id).toBe("resend-abc");
  });

  it("wraps a string to recipient in an array", async () => {
    mockSend.mockResolvedValueOnce({ data: { id: "r1" }, error: null });
    await provider.send({ to: "solo@example.com", subject: "S", html: "<p/>" });
    expect(mockSend.mock.calls[0][0].to).toEqual(["solo@example.com"]);
  });

  it("passes an array of recipients through unchanged", async () => {
    mockSend.mockResolvedValueOnce({ data: { id: "r2" }, error: null });
    await provider.send({ to: ["a@b.com", "c@d.com"], subject: "S", html: "<p/>" });
    expect(mockSend.mock.calls[0][0].to).toEqual(["a@b.com", "c@d.com"]);
  });

  it("includes optional text when provided", async () => {
    mockSend.mockResolvedValueOnce({ data: { id: "r3" }, error: null });
    await provider.send({ to: "x@y.com", subject: "S", html: "<p/>", text: "plain" });
    expect(mockSend.mock.calls[0][0].text).toBe("plain");
  });

  it("includes optional replyTo when provided", async () => {
    mockSend.mockResolvedValueOnce({ data: { id: "r4" }, error: null });
    await provider.send({ to: "x@y.com", subject: "S", html: "<p/>", replyTo: "r@h.app" });
    expect(mockSend.mock.calls[0][0].replyTo).toBe("r@h.app");
  });

  it("omits text and replyTo when not provided", async () => {
    mockSend.mockResolvedValueOnce({ data: { id: "r5" }, error: null });
    await provider.send({ to: "x@y.com", subject: "S", html: "<p/>" });
    expect(mockSend.mock.calls[0][0]).not.toHaveProperty("text");
    expect(mockSend.mock.calls[0][0]).not.toHaveProperty("replyTo");
  });

  it("uses a custom from address when provided", async () => {
    mockSend.mockResolvedValueOnce({ data: { id: "r6" }, error: null });
    await provider.send({ to: "x@y.com", subject: "S", html: "<p/>", from: "custom@h.app" });
    expect(mockSend.mock.calls[0][0].from).toBe("custom@h.app");
  });

  it("throws when Resend returns an error", async () => {
    mockSend.mockResolvedValueOnce({ data: null, error: { message: "Invalid API key" } });
    await expect(
      provider.send({ to: "x@y.com", subject: "S", html: "<p/>" })
    ).rejects.toThrow("Invalid API key");
  });

  it("throws when Resend returns null data with no error message", async () => {
    mockSend.mockResolvedValueOnce({ data: null, error: null });
    await expect(
      provider.send({ to: "x@y.com", subject: "S", html: "<p/>" })
    ).rejects.toThrow("Resend error");
  });
});

// ── RateLimitedEmailProvider — basic send ─────────────────────────────────────

describe("RateLimitedEmailProvider — basic send", () => {
  it("delegates to the inner provider and returns its result", async () => {
    const stub = new StubEmailProvider();
    const limited = new RateLimitedEmailProvider(stub);

    const result = await limited.send({ to: "u@h.com", subject: "S", html: "<p/>" });

    expect(stub.calls).toHaveLength(1);
    expect(result.id).toBe("stub-1");
  });

  it("forwards all params to the inner provider unchanged", async () => {
    const stub = new StubEmailProvider();
    const limited = new RateLimitedEmailProvider(stub);

    const params: SendEmailParams = {
      to:      ["a@b.com"],
      subject: "Subject",
      html:    "<h1>Hi</h1>",
      text:    "Hi",
      replyTo: "r@h.app",
    };
    await limited.send(params);
    expect(stub.calls[0]).toEqual(params);
  });
});

// ── RateLimitedEmailProvider — daily limit ────────────────────────────────────

describe("RateLimitedEmailProvider — daily limit (100/day)", () => {
  it("allows exactly 100 sends in a day", async () => {
    const stub = new StubEmailProvider();
    const limited = new RateLimitedEmailProvider(stub);

    for (let i = 0; i < 100; i++) {
      await limited.send({ to: "u@h.com", subject: "S", html: "<p/>" });
    }
    expect(stub.calls).toHaveLength(100);
  });

  it("throws EmailRateLimitError on the 101st send", async () => {
    const stub = new StubEmailProvider();
    const limited = new RateLimitedEmailProvider(stub);

    for (let i = 0; i < 100; i++) {
      await limited.send({ to: "u@h.com", subject: "S", html: "<p/>" });
    }

    await expect(
      limited.send({ to: "u@h.com", subject: "S", html: "<p/>" })
    ).rejects.toBeInstanceOf(EmailRateLimitError);
  });

  it("daily limit error message mentions 100/day", async () => {
    const stub = new StubEmailProvider();
    const limited = new RateLimitedEmailProvider(stub);

    for (let i = 0; i < 100; i++) {
      await limited.send({ to: "u@h.com", subject: "S", html: "<p/>" });
    }

    await expect(
      limited.send({ to: "u@h.com", subject: "S", html: "<p/>" })
    ).rejects.toThrow(/100/);
  });

  it("logs a console.warn with upgrade hint when daily limit is hit", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const stub = new StubEmailProvider();
    const limited = new RateLimitedEmailProvider(stub);

    for (let i = 0; i < 100; i++) {
      await limited.send({ to: "u@h.com", subject: "S", html: "<p/>" });
    }

    await expect(
      limited.send({ to: "u@h.com", subject: "S", html: "<p/>" })
    ).rejects.toBeInstanceOf(EmailRateLimitError);

    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/paid plan/i));
    warn.mockRestore();
  });

  it("does not count failed sends toward the daily limit", async () => {
    const stub = new StubEmailProvider();
    const limited = new RateLimitedEmailProvider(stub);

    // Fill to 99
    for (let i = 0; i < 99; i++) {
      await limited.send({ to: "u@h.com", subject: "S", html: "<p/>" });
    }

    // Make the 100th fail at the inner provider
    stub.failNext = true;
    await expect(
      limited.send({ to: "u@h.com", subject: "S", html: "<p/>" })
    ).rejects.toThrow("Stub send failure");

    // Counter should still be at 99 — one more send should succeed
    await expect(
      limited.send({ to: "u@h.com", subject: "S", html: "<p/>" })
    ).resolves.toBeDefined();
  });
});

// ── RateLimitedEmailProvider — monthly limit ──────────────────────────────────

describe("RateLimitedEmailProvider — monthly limit (3,000/month)", () => {
  it("throws EmailRateLimitError on the 3,001st send", async () => {
    const stub = new StubEmailProvider();
    const limited = new RateLimitedEmailProvider(stub);

    // Bypass daily limit by advancing the fake clock one day at a time
    jest.useFakeTimers();
    const base = new Date("2026-04-01T00:00:00Z");

    for (let day = 0; day < 30; day++) {
      jest.setSystemTime(new Date(base.getTime() + day * 86_400_000));
      const sendsThisDay = day < 30 ? 100 : 0;
      for (let i = 0; i < sendsThisDay; i++) {
        await limited.send({ to: "u@h.com", subject: "S", html: "<p/>" });
      }
    }

    jest.useRealTimers();

    await expect(
      limited.send({ to: "u@h.com", subject: "S", html: "<p/>" })
    ).rejects.toBeInstanceOf(EmailRateLimitError);
  });

  it("logs a console.warn with upgrade hint when monthly limit is hit", async () => {
    jest.useFakeTimers();
    const base = new Date("2026-08-01T00:00:00Z");
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

    const stub = new StubEmailProvider();
    const limited = new RateLimitedEmailProvider(stub);

    for (let day = 0; day < 30; day++) {
      jest.setSystemTime(new Date(base.getTime() + day * 86_400_000));
      for (let i = 0; i < 100; i++) {
        await limited.send({ to: "u@h.com", subject: "S", html: "<p/>" });
      }
    }

    jest.setSystemTime(new Date("2026-08-31T00:00:00Z"));
    await expect(
      limited.send({ to: "u@h.com", subject: "S", html: "<p/>" })
    ).rejects.toBeInstanceOf(EmailRateLimitError);

    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/paid plan/i));
    warn.mockRestore();
    jest.useRealTimers();
  });

  it("monthly limit error message mentions 3,000/month", async () => {
    jest.useFakeTimers();
    // May has 31 days — fill 3,000 across days 0-29 (May 1-30),
    // then advance to May 31 so the daily counter resets while the
    // monthly counter stays at 3,000 and fires its error first.
    const base = new Date("2026-05-01T00:00:00Z");

    const stub = new StubEmailProvider();
    const limited = new RateLimitedEmailProvider(stub);

    for (let day = 0; day < 30; day++) {
      jest.setSystemTime(new Date(base.getTime() + day * 86_400_000));
      for (let i = 0; i < 100; i++) {
        await limited.send({ to: "u@h.com", subject: "S", html: "<p/>" });
      }
    }

    // May 31 — fresh daily window, monthly still exhausted
    jest.setSystemTime(new Date("2026-05-31T00:00:00Z"));

    await expect(
      limited.send({ to: "u@h.com", subject: "S", html: "<p/>" })
    ).rejects.toThrow(/3.000|3,000/);

    jest.useRealTimers();
  });
});

// ── RateLimitedEmailProvider — counter resets ─────────────────────────────────

describe("RateLimitedEmailProvider — counter resets", () => {
  afterEach(() => jest.useRealTimers());

  it("resets the daily counter when the calendar day advances", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-04-05T23:00:00Z"));

    const stub = new StubEmailProvider();
    const limited = new RateLimitedEmailProvider(stub);

    // Fill daily limit on Apr 5
    for (let i = 0; i < 100; i++) {
      await limited.send({ to: "u@h.com", subject: "S", html: "<p/>" });
    }
    await expect(
      limited.send({ to: "u@h.com", subject: "S", html: "<p/>" })
    ).rejects.toBeInstanceOf(EmailRateLimitError);

    // Advance to Apr 6 — daily counter should reset
    jest.setSystemTime(new Date("2026-04-06T00:01:00Z"));
    await expect(
      limited.send({ to: "u@h.com", subject: "S", html: "<p/>" })
    ).resolves.toBeDefined();
  });

  it("resets the monthly counter when the calendar month advances", async () => {
    jest.useFakeTimers();
    const base = new Date("2026-06-01T00:00:00Z");

    const stub = new StubEmailProvider();
    const limited = new RateLimitedEmailProvider(stub);

    // Fill monthly limit across June (30 days × 100 = 3,000)
    for (let day = 0; day < 30; day++) {
      jest.setSystemTime(new Date(base.getTime() + day * 86_400_000));
      for (let i = 0; i < 100; i++) {
        await limited.send({ to: "u@h.com", subject: "S", html: "<p/>" });
      }
    }

    // July 1 — monthly counter resets
    jest.setSystemTime(new Date("2026-07-01T00:00:00Z"));
    await expect(
      limited.send({ to: "u@h.com", subject: "S", html: "<p/>" })
    ).resolves.toBeDefined();
  });
});

// ── RateLimitedEmailProvider — usage() ───────────────────────────────────────

describe("RateLimitedEmailProvider — usage()", () => {
  it("starts at zero counts", () => {
    const limited = new RateLimitedEmailProvider(new StubEmailProvider());
    const u = limited.usage();
    expect(u.daily).toBe(0);
    expect(u.monthly).toBe(0);
  });

  it("reflects the correct limits", () => {
    const limited = new RateLimitedEmailProvider(new StubEmailProvider());
    const u = limited.usage();
    expect(u.dailyLimit).toBe(100);
    expect(u.monthlyLimit).toBe(3_000);
  });

  it("increments after each successful send", async () => {
    const limited = new RateLimitedEmailProvider(new StubEmailProvider());
    await limited.send({ to: "a@b.com", subject: "S", html: "<p/>" });
    await limited.send({ to: "a@b.com", subject: "S", html: "<p/>" });
    const u = limited.usage();
    expect(u.daily).toBe(2);
    expect(u.monthly).toBe(2);
  });

  it("does not increment after a failed inner send", async () => {
    const stub = new StubEmailProvider();
    const limited = new RateLimitedEmailProvider(stub);

    stub.failNext = true;
    await expect(
      limited.send({ to: "a@b.com", subject: "S", html: "<p/>" })
    ).rejects.toThrow();

    expect(limited.usage().daily).toBe(0);
    expect(limited.usage().monthly).toBe(0);
  });
});

// ── createEmailProvider factory ───────────────────────────────────────────────

describe("createEmailProvider", () => {
  const originalKey   = process.env.RESEND_API_KEY;
  const originalFrom  = process.env.RESEND_FROM_EMAIL;

  afterEach(() => {
    process.env.RESEND_API_KEY    = originalKey;
    process.env.RESEND_FROM_EMAIL = originalFrom;
  });

  it("returns a RateLimitedEmailProvider", () => {
    process.env.RESEND_API_KEY = "re_test";
    const provider = createEmailProvider();
    expect(provider).toBeInstanceOf(RateLimitedEmailProvider);
  });

  it("exposes a usage() method", () => {
    process.env.RESEND_API_KEY = "re_test";
    const provider = createEmailProvider();
    expect(typeof provider.usage).toBe("function");
  });

  it("works without RESEND_FROM_EMAIL set (falls back to default)", () => {
    process.env.RESEND_API_KEY    = "re_test";
    delete process.env.RESEND_FROM_EMAIL;
    expect(() => createEmailProvider()).not.toThrow();
  });
});
