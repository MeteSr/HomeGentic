/**
 * aiFetch — the mobile side of the Worker's AI abuse checks (CD-1).
 */
const mockOpenAuthSession = jest.fn();
jest.mock("expo-web-browser", () => ({ openAuthSessionAsync: (...a: unknown[]) => mockOpenAuthSession(...a) }));

import { aiFetch } from "../../services/aiFetch";

const jsonRes = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

let fetchMock: jest.Mock;
beforeEach(() => {
  fetchMock = jest.fn();
  (global as any).fetch = fetchMock;
  mockOpenAuthSession.mockReset();
});

describe("aiFetch", () => {
  it("sends the session token", async () => {
    fetchMock.mockResolvedValueOnce(jsonRes(200, { ok: true }));
    await aiFetch(
      "https://voice.test/api/agent",
      { method: "POST", headers: { "Content-Type": "application/json" } },
      "hgs_1",
    );
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({ "x-agent-session": "hgs_1" });
  });

  it("runs the human check in a browser session, verifies the token and retries", async () => {
    mockOpenAuthSession.mockResolvedValue({ type: "success", url: "homegentic://human-check?token=ts-1" });
    fetchMock
      .mockResolvedValueOnce(jsonRes(403, { error: "human_verification_required", siteKey: "s" }))
      .mockResolvedValueOnce(jsonRes(200, { verified: true }))
      .mockResolvedValueOnce(jsonRes(200, { ok: true }));
    const res = await aiFetch("https://voice.test/api/extract-bill", { method: "POST" }, "hgs_1");
    expect(res.status).toBe(200);
    expect(mockOpenAuthSession).toHaveBeenCalledWith(
      "https://voice.test/human-check?redirect=homegentic%3A%2F%2Fhuman-check",
      "homegentic://human-check",
    );
    const [verifyUrl, verifyInit] = fetchMock.mock.calls[1];
    expect(verifyUrl).toBe("https://voice.test/api/human/verify");
    expect(JSON.parse(verifyInit.body)).toEqual({ token: "ts-1" });
    expect(verifyInit.headers["x-agent-session"]).toBe("hgs_1");
  });

  it("returns the 403 when the user closes the browser", async () => {
    mockOpenAuthSession.mockResolvedValue({ type: "cancel" });
    fetchMock.mockResolvedValueOnce(jsonRes(403, { error: "human_verification_required", siteKey: "s" }));
    expect((await aiFetch("https://voice.test/api/agent", { method: "POST" }, "hgs_1")).status).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
