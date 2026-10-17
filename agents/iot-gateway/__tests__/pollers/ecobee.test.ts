import fs from "fs";
import {
  loadTokenState,
  persistTokenState,
  refreshTokens,
  ensureFreshToken,
  pollOnce,
  startEcobeePoller,
} from "../../pollers/ecobee";
import type { TokenState } from "../../pollers/ecobee";

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock("fs");
jest.mock("../../icp", () => ({
  recordSensorEvent: jest.fn(),
}));

import { recordSensorEvent } from "../../icp";

const mockFs               = jest.mocked(fs);
const mockRecordSensorEvent = recordSensorEvent as jest.Mock;

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTokenState(overrides: Partial<TokenState> = {}): TokenState {
  return {
    accessToken:  "access-abc",
    refreshToken: "refresh-xyz",
    expiresAt:    Date.now() + 60 * 60 * 1000, // 1 h from now
    ...overrides,
  };
}

function mockFetchOk(body: unknown): void {
  global.fetch = jest.fn().mockResolvedValue({
    ok:   true,
    json: jest.fn().mockResolvedValue(body),
    text: jest.fn().mockResolvedValue(""),
  } as unknown as Response);
}

function mockFetchFail(status: number, body = "error"): void {
  global.fetch = jest.fn().mockResolvedValue({
    ok:   false,
    status,
    text: jest.fn().mockResolvedValue(body),
    json: jest.fn().mockResolvedValue({}),
  } as unknown as Response);
}

// A thermostat response that produces an actionable LowTemperature reading.
// 350 = 35 °F → (35-32)*5/9 ≈ 1.7 °C ≤ 4 °C threshold.
const COLD_THERMOSTAT_RESPONSE = {
  thermostatList: [{
    identifier: "411848373746",
    name:       "Living Room",
    alerts:     [],
    runtime:    { actualTemperature: 350, actualHumidity: 45 },
  }],
};

// A thermostat response with no actionable reading (normal conditions).
const NORMAL_THERMOSTAT_RESPONSE = {
  thermostatList: [{
    identifier: "411848373746",
    name:       "Living Room",
    alerts:     [],
    runtime:    { actualTemperature: 680, actualHumidity: 50 }, // 68 °F = 20 °C
  }],
};

// ── loadTokenState ────────────────────────────────────────────────────────────

describe("loadTokenState", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    delete process.env.ECOBEE_ACCESS_TOKEN;
    delete process.env.ECOBEE_REFRESH_TOKEN;
  });

  it("returns parsed state from the token file when it exists and is valid", () => {
    const stored: TokenState = {
      accessToken:  "file-access",
      refreshToken: "file-refresh",
      expiresAt:    Date.now() + 3600_000,
    };
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(JSON.stringify(stored));

    const state = loadTokenState();
    expect(state).toEqual(stored);
  });

  it("falls back to env vars when the token file does not exist", () => {
    mockFs.existsSync.mockReturnValue(false);
    process.env.ECOBEE_ACCESS_TOKEN  = "env-access";
    process.env.ECOBEE_REFRESH_TOKEN = "env-refresh";

    const state = loadTokenState();
    expect(state!.accessToken).toBe("env-access");
    expect(state!.refreshToken).toBe("env-refresh");
    expect(state!.expiresAt).toBeGreaterThan(Date.now());
  });

  it("falls back to env vars when the token file contains corrupted JSON", () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue("not-valid-json{{{");
    process.env.ECOBEE_ACCESS_TOKEN  = "env-access";
    process.env.ECOBEE_REFRESH_TOKEN = "env-refresh";

    const state = loadTokenState();
    expect(state!.accessToken).toBe("env-access");
  });

  it("falls back to env vars when the token file has missing fields", () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(JSON.stringify({ accessToken: "only-one-field" }));
    process.env.ECOBEE_ACCESS_TOKEN  = "env-access";
    process.env.ECOBEE_REFRESH_TOKEN = "env-refresh";

    const state = loadTokenState();
    expect(state!.accessToken).toBe("env-access");
  });

  it("returns null when the file is absent and env vars are not set", () => {
    mockFs.existsSync.mockReturnValue(false);
    expect(loadTokenState()).toBeNull();
  });
});

// ── persistTokenState ─────────────────────────────────────────────────────────

describe("persistTokenState", () => {
  beforeEach(() => jest.resetAllMocks());

  it("writes the state as formatted JSON to the token file", () => {
    const state = makeTokenState();
    mockFs.writeFileSync.mockImplementation(() => {});

    persistTokenState(state);

    expect(mockFs.writeFileSync).toHaveBeenCalledWith(
      expect.any(String),
      JSON.stringify(state, null, 2),
      { encoding: "utf8", mode: 0o600 }
    );
  });

  it("updates process.env with the new tokens", () => {
    const state = makeTokenState({ accessToken: "new-access", refreshToken: "new-refresh" });
    mockFs.writeFileSync.mockImplementation(() => {});

    persistTokenState(state);

    expect(process.env.ECOBEE_ACCESS_TOKEN).toBe("new-access");
    expect(process.env.ECOBEE_REFRESH_TOKEN).toBe("new-refresh");
  });

  it("does not throw when writeFileSync fails — logs a warning instead", () => {
    mockFs.writeFileSync.mockImplementation(() => { throw new Error("disk full"); });
    expect(() => persistTokenState(makeTokenState())).not.toThrow();
  });
});

// ── refreshTokens ─────────────────────────────────────────────────────────────

describe("refreshTokens", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    process.env.ECOBEE_CLIENT_ID = "test-client-id";
    mockFs.writeFileSync.mockImplementation(() => {});
  });

  afterEach(() => {
    delete process.env.ECOBEE_CLIENT_ID;
  });

  it("throws when ECOBEE_CLIENT_ID is not set", async () => {
    delete process.env.ECOBEE_CLIENT_ID;
    await expect(refreshTokens(makeTokenState())).rejects.toThrow("ECOBEE_CLIENT_ID");
  });

  it("POSTs to the Ecobee token endpoint with the correct parameters", async () => {
    mockFetchOk({
      access_token:  "new-access",
      refresh_token: "new-refresh",
      expires_in:    3600,
    });

    await refreshTokens(makeTokenState({ refreshToken: "old-refresh" }));

    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain("grant_type=refresh_token");
    expect(url).toContain("refresh_token=old-refresh");
    expect(url).toContain("client_id=test-client-id");
    expect((global.fetch as jest.Mock).mock.calls[0][1]).toEqual({ method: "POST" });
  });

  it("returns a new TokenState with updated tokens and a future expiresAt", async () => {
    mockFetchOk({
      access_token:  "refreshed-access",
      refresh_token: "refreshed-refresh",
      expires_in:    3600,
    });

    const before = Date.now();
    const newState = await refreshTokens(makeTokenState());
    expect(newState.accessToken).toBe("refreshed-access");
    expect(newState.refreshToken).toBe("refreshed-refresh");
    expect(newState.expiresAt).toBeGreaterThan(before + 3500_000);
  });

  it("persists the new tokens (writes to file and updates process.env)", async () => {
    mockFetchOk({
      access_token:  "refreshed-access",
      refresh_token: "refreshed-refresh",
      expires_in:    3600,
    });

    await refreshTokens(makeTokenState());

    expect(mockFs.writeFileSync).toHaveBeenCalledTimes(1);
    expect(process.env.ECOBEE_ACCESS_TOKEN).toBe("refreshed-access");
  });

  it("throws with a descriptive message when the Ecobee API returns an error", async () => {
    mockFetchFail(401, "Unauthorized");
    await expect(refreshTokens(makeTokenState())).rejects.toThrow("401");
  });
});

// ── ensureFreshToken ──────────────────────────────────────────────────────────

describe("ensureFreshToken", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    process.env.ECOBEE_CLIENT_ID = "test-client-id";
    mockFs.writeFileSync.mockImplementation(() => {});
  });

  it("returns the same state object when the token is not close to expiry", async () => {
    const state = makeTokenState({ expiresAt: Date.now() + 60 * 60 * 1000 }); // 1 h away
    const result = await ensureFreshToken(state);
    expect(result).toBe(state); // same reference — no refresh occurred
  });

  it("calls refreshTokens when the token expires within the 2-minute buffer", async () => {
    mockFetchOk({
      access_token:  "refreshed",
      refresh_token: "refreshed-rt",
      expires_in:    3600,
    });

    const expiringSoon = makeTokenState({ expiresAt: Date.now() + 60 * 1000 }); // 1 min away
    const result = await ensureFreshToken(expiringSoon);

    expect(result.accessToken).toBe("refreshed");
    expect(global.fetch).toHaveBeenCalled();
  });

  it("calls refreshTokens when the token is already expired", async () => {
    mockFetchOk({
      access_token:  "refreshed",
      refresh_token: "refreshed-rt",
      expires_in:    3600,
    });

    const expired = makeTokenState({ expiresAt: Date.now() - 1000 });
    const result = await ensureFreshToken(expired);
    expect(result.accessToken).toBe("refreshed");
  });
});

// ── pollOnce ──────────────────────────────────────────────────────────────────

describe("pollOnce", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockRecordSensorEvent.mockResolvedValue({ success: true, eventId: "evt-1" });
    delete process.env.ECOBEE_THERMOSTAT_ID;
  });

  it("calls GET /1/thermostat with the Bearer access token", async () => {
    mockFetchOk(NORMAL_THERMOSTAT_RESPONSE);

    await pollOnce(makeTokenState({ accessToken: "my-token" }));

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain("api.ecobee.com/1/thermostat");
    expect((init as RequestInit).headers).toEqual({ Authorization: "Bearer my-token" });
  });

  it("uses selectionType 'registered' when ECOBEE_THERMOSTAT_ID is not set", async () => {
    mockFetchOk(NORMAL_THERMOSTAT_RESPONSE);
    await pollOnce(makeTokenState());
    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(decodeURIComponent(url)).toContain('"selectionType":"registered"');
  });

  it("uses selectionType 'thermostats' when ECOBEE_THERMOSTAT_ID is set", async () => {
    process.env.ECOBEE_THERMOSTAT_ID = "411848373746";
    mockFetchOk(NORMAL_THERMOSTAT_RESPONSE);
    await pollOnce(makeTokenState());
    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(decodeURIComponent(url)).toContain('"selectionType":"thermostats"');
    expect(decodeURIComponent(url)).toContain('"selectionMatch":"411848373746"');
  });

  it("calls recordSensorEvent when the thermostat produces an actionable reading", async () => {
    mockFetchOk(COLD_THERMOSTAT_RESPONSE);
    await pollOnce(makeTokenState());
    expect(mockRecordSensorEvent).toHaveBeenCalledTimes(1);
    const reading = mockRecordSensorEvent.mock.calls[0][0];
    expect(reading.eventType).toEqual({ LowTemperature: null });
    expect(reading.externalDeviceId).toBe("411848373746");
  });

  it("does not call recordSensorEvent when the thermostat reading is not actionable", async () => {
    mockFetchOk(NORMAL_THERMOSTAT_RESPONSE);
    await pollOnce(makeTokenState());
    expect(mockRecordSensorEvent).not.toHaveBeenCalled();
  });

  it("logs error and returns without throwing when the API response is not OK", async () => {
    mockFetchFail(429, "rate limited");
    await expect(pollOnce(makeTokenState())).resolves.toBeUndefined();
    expect(mockRecordSensorEvent).not.toHaveBeenCalled();
  });

  it("logs the canister error but does not throw when recordSensorEvent fails", async () => {
    mockFetchOk(COLD_THERMOSTAT_RESPONSE);
    mockRecordSensorEvent.mockResolvedValue({ success: false, error: "Unauthorized" });
    await expect(pollOnce(makeTokenState())).resolves.toBeUndefined();
  });

  it("skips thermostats with no identifier", async () => {
    mockFetchOk({
      thermostatList: [{ identifier: "", name: "Bad", alerts: [], runtime: { actualTemperature: 350, actualHumidity: 45 } }],
    });
    await pollOnce(makeTokenState());
    // handleEcobeeEvent returns null for empty thermostatId — recordSensorEvent not called
    expect(mockRecordSensorEvent).not.toHaveBeenCalled();
  });
});

// ── startEcobeePoller ─────────────────────────────────────────────────────────

describe("startEcobeePoller", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    delete process.env.ECOBEE_ACCESS_TOKEN;
    delete process.env.ECOBEE_REFRESH_TOKEN;
  });

  it("returns a no-op stop function when tokens are absent", () => {
    mockFs.existsSync.mockReturnValue(false);
    const stop = startEcobeePoller();
    expect(typeof stop).toBe("function");
    expect(() => stop()).not.toThrow(); // calling stop is safe
  });

  it("the no-op stop function is idempotent — calling it twice does not throw", () => {
    mockFs.existsSync.mockReturnValue(false);
    const stop = startEcobeePoller();
    expect(() => { stop(); stop(); }).not.toThrow();
  });

  it("starts polling when valid tokens are available and returns a stop function", async () => {
    // Provide tokens via env vars (file absent)
    mockFs.existsSync.mockReturnValue(false);
    process.env.ECOBEE_ACCESS_TOKEN  = "valid-access";
    process.env.ECOBEE_REFRESH_TOKEN = "valid-refresh";

    mockFetchOk(NORMAL_THERMOSTAT_RESPONSE);
    jest.useFakeTimers();

    const stop = startEcobeePoller(60_000);
    expect(typeof stop).toBe("function");

    // Let the immediate async tick flush
    await Promise.resolve();
    await Promise.resolve();

    stop();
    jest.useRealTimers();
  });
});
