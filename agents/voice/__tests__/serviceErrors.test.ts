import { reportServiceError, routeKey, _setSender, _reset } from "../src/serviceErrors";

describe("serviceErrors", () => {
  const sent: any[] = [];
  beforeEach(() => {
    sent.length = 0;
    _reset();
    _setSender(async (input) => {
      sent.push(input);
    });
    jest.useFakeTimers({ now: 1_000 });
  });
  afterEach(() => jest.useRealTimers());

  it("sends the first failure at once and repeats at most once a minute with the count", async () => {
    await reportServiceError("email", "Resend refused: HTTP 422");
    await reportServiceError("email", "Resend refused: HTTP 422");
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ errorType: "email", count: 1, message: "Resend refused: HTTP 422" });
    jest.setSystemTime(62_000);
    await reportServiceError("email", "Resend refused: HTTP 422");
    expect(sent).toHaveLength(2);
    expect(sent[1].count).toBe(2);
    expect(sent[1].firstSeen).toBe(1_000n * 1_000_000n);
    expect(sent[1].lastSeen).toBe(62_000n * 1_000_000n);
  });

  it("holds at most 100 distinct failures per isolate", async () => {
    for (let i = 0; i < 150; i++) await reportServiceError("worker-5xx", `500 GET /r${i}`);
    expect(sent).toHaveLength(100);
  });

  it("swallows a failing monitoring call", async () => {
    _setSender(async () => {
      throw new Error("down");
    });
    await expect(reportServiceError("inbox", "inbound mail failed")).resolves.toBeUndefined();
  });

  it("collapses ids in paths", () => {
    expect(routeKey("/api/photos/0f9c2a7e5d1b4c3a/thumb")).toBe("/api/photos/:id/thumb");
    expect(routeKey("/api/report/123")).toBe("/api/report/:id");
    expect(routeKey("/api/stripe/webhook")).toBe("/api/stripe/webhook");
  });
});
