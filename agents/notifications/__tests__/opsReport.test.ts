import { reportFailure, errorCode, _setSender, _reset } from "../opsReport";

describe("opsReport", () => {
  const sent: any[] = [];
  beforeEach(() => {
    sent.length = 0;
    _reset();
    _setSender(async (input) => {
      sent.push(input);
    });
  });

  it("sends the first failure at once, then at most once a minute with the count", async () => {
    await reportFailure("email", "notification email failed: HTTP 422", 1_000);
    await reportFailure("email", "notification email failed: HTTP 422", 2_000);
    await reportFailure("email", "notification email failed: HTTP 422", 3_000);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ errorType: "notifications-relay:email", count: 1, firstSeenMs: 1_000 });
    await reportFailure("email", "notification email failed: HTTP 422", 62_000);
    expect(sent).toHaveLength(2);
    expect(sent[1]).toMatchObject({ count: 3, firstSeenMs: 1_000, lastSeenMs: 62_000 });
  });

  it("keeps fingerprints within the canister's 64-character limit", async () => {
    await reportFailure("report-alerts", "x".repeat(200), 1);
    expect(sent[0].fingerprint.length).toBeLessThanOrEqual(64);
    expect(sent[0].message.length).toBeLessThanOrEqual(120);
  });

  it("never throws when the monitoring call fails", async () => {
    _setSender(async () => {
      throw new Error("canister unreachable");
    });
    jest.spyOn(console, "error").mockImplementation(() => {});
    await expect(reportFailure("sms", "notification SMS failed: error", 1)).resolves.toBeUndefined();
  });

  it("describes errors by status code only", () => {
    expect(errorCode(Object.assign(new Error("boom"), { status: 429 }))).toBe("HTTP 429");
    expect(errorCode(new Error("Resend 422: invalid to address someone@example.com"))).toBe("HTTP 422");
    expect(errorCode(new Error("socket hang up"))).toBe("error");
    expect(errorCode("x")).toBe("error");
  });
});
