import fs from "fs";
import {
  loadTokenState,
  persistTokenState,
  refreshTokens,
  ensureFreshToken,
  pollOnce,
  startHoneywellPoller,
} from "../../pollers/honeywellHome";
import type { TokenState } from "../../pollers/honeywellHome";

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock("fs");
jest.mock("../../icp", () => ({
  recordSensorEvent: jest.fn(),
}));

import { recordSensorEvent } from "../../icp";

const mockFs                = jest.mocked(fs);
const mockRecordSensorEvent = recordSensorEvent as jest.Mock;

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTokenState(overrides: Partial<TokenState> = {}): TokenState {
  return {
    accessToken:  "hw-access-abc",
    refreshToken: "hw-refresh-xyz",
    expiresAt:    Date.now() + 10 * 60 * 1000, // 10 min from now
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
    ok:     false,
    status,
    text:   jest.fn().mockResolvedValue(body),
    json:   jest.fn().mockResolvedValue({}),
  } as unknown as Response);
}

// Sequences multiple fetch responses (locations + thermostats + WLD).
function mockFetchSequence(responses: Array<{ ok: boolean; status?: number; body: unknown }>): void {
  let call = 0;
  global.fetch = jest.fn().mockImplementation(() => {
    const r = responses[call] ?? responses[responses.length - 1];
    call++;
    return Promise.resolve({
      ok:     r.ok,
      status: r.status ?? 200,
      json:   jest.fn().mockResolvedValue(r.body),
      text:   jest.fn().mockResolvedValue(typeof r.body === "string" ? r.body : "error"),
    } as unknown as Response);
  });
}

const COLD_THERMOSTAT = {
  deviceID:              "LCC-COLD",
  userDefinedDeviceName: "Basement",
  // 33 °F → 0.6 °C ≤ 4 °C threshold
  indoorTemperature:     33,
  indoorHumidity:        45,
  operationStatus:       { equipmentStatus: "Heating" },
};

const NORMAL_THERMOSTAT = {
  deviceID:              "LCC-NORMAL",
  userDefinedDeviceName: "Living Room",
  // 72 °F → 22.2 °C — normal range
  indoorTemperature:     72,
  indoorHumidity:        50,
  operationStatus:       { equipmentStatus: "Heating" },
};

const LEAKING_WLD = {
  deviceID:              "WLD-001",
  userDefinedDeviceName: "Basement Sensor",
  isWaterPresent:        true,
};

// ── loadTokenState ────────────────────────────────────────────────────────────

describe("loadTokenState", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    delete process.env.HONEYWELL_ACCESS_TOKEN;
    delete process.env.HONEYWELL_REFRESH_TOKEN;
  });

  it("returns parsed state from the token file when it exists and is valid", () => {
    const stored: TokenState = {
      accessToken:  "file-access",
      refreshToken: "file-refresh",
      expiresAt:    Date.now() + 600_000,
    };
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(JSON.stringify(stored));

    const state = loadTokenState();
    expect(state).toEqual(stored);
  });

  it("falls back to env vars when the token file does not exist", () => {
    mockFs.existsSync.mockReturnValue(false);
    process.env.HONEYWELL_ACCESS_TOKEN  = "env-access";
    process.env.HONEYWELL_REFRESH_TOKEN = "env-refresh";

    const state = loadTokenState();
    expect(state!.accessToken).toBe("env-access");
    expect(state!.refreshToken).toBe("env-refresh");
    expect(state!.expiresAt).toBeGreaterThan(Date.now());
  });

  it("falls back to env vars when the token file contains corrupted JSON", () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue("not-valid-json{{{");
    process.env.HONEYWELL_ACCESS_TOKEN  = "env-access";
    process.env.HONEYWELL_REFRESH_TOKEN = "env-refresh";

    const state = loadTokenState();
    expect(state!.accessToken).toBe("env-access");
  });

  it("falls back to env vars when the token file has missing fields", () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(JSON.stringify({ accessToken: "only-one-field" }));
    process.env.HONEYWELL_ACCESS_TOKEN  = "env-access";
    process.env.HONEYWELL_REFRESH_TOKEN = "env-refresh";

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

    expect(process.env.HONEYWELL_ACCESS_TOKEN).toBe("new-access");
    expect(process.env.HONEYWELL_REFRESH_TOKEN).toBe("new-refresh");
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
    process.env.HONEYWELL_CLIENT_ID     = "test-client-id";
    process.env.HONEYWELL_CLIENT_SECRET = "test-client-secret";
    mockFs.writeFileSync.mockImplementation(() => {});
  });

  afterEach(() => {
    delete process.env.HONEYWELL_CLIENT_ID;
    delete process.env.HONEYWELL_CLIENT_SECRET;
  });

  it("throws when HONEYWELL_CLIENT_ID is not set", async () => {
    delete process.env.HONEYWELL_CLIENT_ID;
    await expect(refreshTokens(makeTokenState())).rejects.toThrow("HONEYWELL_CLIENT_ID");
  });

  it("throws when HONEYWELL_CLIENT_SECRET is not set", async () => {
    delete process.env.HONEYWELL_CLIENT_SECRET;
    await expect(refreshTokens(makeTokenState())).rejects.toThrow("HONEYWELL_CLIENT_SECRET");
  });

  it("POSTs to the Honeywell token endpoint with Basic auth and form body", async () => {
    mockFetchOk({
      access_token:  "new-access",
      refresh_token: "new-refresh",
      expires_in:    600,
    });

    await refreshTokens(makeTokenState({ refreshToken: "old-refresh" }));

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.honeywell.com/oauth2/token");
    expect(init.method).toBe("POST");

    const authHeader = (init.headers as Record<string, string>)["Authorization"];
    expect(authHeader).toMatch(/^Basic /);

    const decoded = Buffer.from(authHeader.slice(6), "base64").toString();
    expect(decoded).toBe("test-client-id:test-client-secret");

    expect(init.body).toContain("grant_type=refresh_token");
    expect(init.body).toContain("refresh_token=old-refresh");
  });

  it("returns a new TokenState with updated tokens and a future expiresAt", async () => {
    mockFetchOk({
      access_token:  "refreshed-access",
      refresh_token: "refreshed-refresh",
      expires_in:    600,
    });

    const before    = Date.now();
    const newState  = await refreshTokens(makeTokenState());
    expect(newState.accessToken).toBe("refreshed-access");
    expect(newState.refreshToken).toBe("refreshed-refresh");
    expect(newState.expiresAt).toBeGreaterThan(before + 500_000);
  });

  it("persists the new tokens (writes to file and updates process.env)", async () => {
    mockFetchOk({
      access_token:  "refreshed-access",
      refresh_token: "refreshed-refresh",
      expires_in:    600,
    });

    await refreshTokens(makeTokenState());

    expect(mockFs.writeFileSync).toHaveBeenCalledTimes(1);
    expect(process.env.HONEYWELL_ACCESS_TOKEN).toBe("refreshed-access");
  });

  it("throws with a descriptive message when the Honeywell API returns an error", async () => {
    mockFetchFail(401, "Unauthorized");
    await expect(refreshTokens(makeTokenState())).rejects.toThrow("401");
  });
});

// ── ensureFreshToken ──────────────────────────────────────────────────────────

describe("ensureFreshToken", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    process.env.HONEYWELL_CLIENT_ID     = "test-client-id";
    process.env.HONEYWELL_CLIENT_SECRET = "test-client-secret";
    mockFs.writeFileSync.mockImplementation(() => {});
  });

  it("returns the same state object when the token is not close to expiry", async () => {
    const state = makeTokenState({ expiresAt: Date.now() + 10 * 60 * 1000 });
    const result = await ensureFreshToken(state);
    expect(result).toBe(state); // same reference — no refresh occurred
  });

  it("calls refreshTokens when the token expires within the 1-minute buffer", async () => {
    mockFetchOk({
      access_token:  "refreshed",
      refresh_token: "refreshed-rt",
      expires_in:    600,
    });

    const expiringSoon = makeTokenState({ expiresAt: Date.now() + 30 * 1000 }); // 30 s away
    const result = await ensureFreshToken(expiringSoon);

    expect(result.accessToken).toBe("refreshed");
    expect(global.fetch).toHaveBeenCalled();
  });

  it("calls refreshTokens when the token is already expired", async () => {
    mockFetchOk({
      access_token:  "refreshed",
      refresh_token: "refreshed-rt",
      expires_in:    600,
    });

    const expired = makeTokenState({ expiresAt: Date.now() - 1000 });
    const result  = await ensureFreshToken(expired);
    expect(result.accessToken).toBe("refreshed");
  });
});

// ── pollOnce ──────────────────────────────────────────────────────────────────

describe("pollOnce", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    process.env.HONEYWELL_CLIENT_ID  = "test-client-id";
    process.env.HONEYWELL_LOCATION_ID = "loc-123"; // skip locations call
    mockRecordSensorEvent.mockResolvedValue({ success: true, eventId: "evt-1" });
  });

  afterEach(() => {
    delete process.env.HONEYWELL_CLIENT_ID;
    delete process.env.HONEYWELL_LOCATION_ID;
  });

  it("skips poll and logs an error when HONEYWELL_CLIENT_ID is not set", async () => {
    delete process.env.HONEYWELL_CLIENT_ID;
    global.fetch = jest.fn();
    await pollOnce(makeTokenState());
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("uses HONEYWELL_LOCATION_ID to skip the locations discovery call", async () => {
    // With HONEYWELL_LOCATION_ID set, only 2 calls: thermostats + WLD
    mockFetchSequence([
      { ok: true,  body: [NORMAL_THERMOSTAT] }, // thermostats
      { ok: false, status: 404, body: [] },     // WLD — 404 = no WLD devices
    ]);

    await pollOnce(makeTokenState({ accessToken: "my-token" }));

    expect((global.fetch as jest.Mock).mock.calls).toHaveLength(2);
    const [thermoUrl] = (global.fetch as jest.Mock).mock.calls[0] as [string];
    expect(thermoUrl).toContain("/v2/devices/thermostats");
    expect(thermoUrl).toContain("loc-123");
  });

  it("calls GET /v2/locations when HONEYWELL_LOCATION_ID is not set", async () => {
    delete process.env.HONEYWELL_LOCATION_ID;
    mockFetchSequence([
      { ok: true, body: [{ locationID: "loc-abc", name: "Home" }] }, // locations
      { ok: true, body: [NORMAL_THERMOSTAT] },                        // thermostats
      { ok: false, status: 404, body: [] },                           // WLD
    ]);

    await pollOnce(makeTokenState());

    const calls = (global.fetch as jest.Mock).mock.calls as [string][];
    expect(calls[0][0]).toContain("/v2/locations");
    expect(calls[1][0]).toContain("/v2/devices/thermostats");
    expect(calls[1][0]).toContain("loc-abc");
  });

  it("sends the Bearer access token in the Authorization header", async () => {
    mockFetchSequence([
      { ok: true, body: [NORMAL_THERMOSTAT] },
      { ok: false, status: 404, body: [] },
    ]);

    await pollOnce(makeTokenState({ accessToken: "my-hw-token" }));

    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer my-hw-token");
  });

  it("calls recordSensorEvent when a thermostat is below the freeze threshold", async () => {
    mockFetchSequence([
      { ok: true,  body: [COLD_THERMOSTAT] },
      { ok: false, status: 404, body: [] },
    ]);

    await pollOnce(makeTokenState());

    expect(mockRecordSensorEvent).toHaveBeenCalledTimes(1);
    const reading = mockRecordSensorEvent.mock.calls[0][0];
    expect(reading.eventType).toEqual({ LowTemperature: null });
    expect(reading.externalDeviceId).toBe("LCC-COLD");
  });

  it("does not call recordSensorEvent when thermostat reading is not actionable", async () => {
    mockFetchSequence([
      { ok: true,  body: [NORMAL_THERMOSTAT] },
      { ok: false, status: 404, body: [] },
    ]);

    await pollOnce(makeTokenState());
    expect(mockRecordSensorEvent).not.toHaveBeenCalled();
  });

  it("calls recordSensorEvent for a leaking WLD", async () => {
    mockFetchSequence([
      { ok: true, body: [] },           // thermostats — empty
      { ok: true, body: [LEAKING_WLD] }, // WLD
    ]);

    await pollOnce(makeTokenState());

    expect(mockRecordSensorEvent).toHaveBeenCalledTimes(1);
    const reading = mockRecordSensorEvent.mock.calls[0][0];
    expect(reading.eventType).toEqual({ WaterLeak: null });
    expect(reading.externalDeviceId).toBe("WLD-001");
  });

  it("suppresses WLD 404 silently (location has no WLD devices)", async () => {
    mockFetchSequence([
      { ok: true,  body: [NORMAL_THERMOSTAT] },
      { ok: false, status: 404, body: "Not Found" },
    ]);

    await expect(pollOnce(makeTokenState())).resolves.toBeUndefined();
    expect(mockRecordSensorEvent).not.toHaveBeenCalled();
  });

  it("logs error and continues when thermostats fetch fails", async () => {
    mockFetchSequence([
      { ok: false, status: 429, body: "rate limited" }, // thermostats fail
      { ok: false, status: 404, body: [] },             // WLD
    ]);

    await expect(pollOnce(makeTokenState())).resolves.toBeUndefined();
    expect(mockRecordSensorEvent).not.toHaveBeenCalled();
  });

  it("logs error and continues when locations fetch fails", async () => {
    delete process.env.HONEYWELL_LOCATION_ID;
    mockFetchFail(500, "server error");

    await expect(pollOnce(makeTokenState())).resolves.toBeUndefined();
    expect(mockRecordSensorEvent).not.toHaveBeenCalled();
  });

  it("logs canister error but does not throw when recordSensorEvent fails", async () => {
    mockFetchSequence([
      { ok: true,  body: [COLD_THERMOSTAT] },
      { ok: false, status: 404, body: [] },
    ]);
    mockRecordSensorEvent.mockResolvedValue({ success: false, error: "Unauthorized" });

    await expect(pollOnce(makeTokenState())).resolves.toBeUndefined();
  });
});

// ── startHoneywellPoller ──────────────────────────────────────────────────────

describe("startHoneywellPoller", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    delete process.env.HONEYWELL_ACCESS_TOKEN;
    delete process.env.HONEYWELL_REFRESH_TOKEN;
  });

  it("returns a no-op stop function when tokens are absent", () => {
    mockFs.existsSync.mockReturnValue(false);
    const stop = startHoneywellPoller();
    expect(typeof stop).toBe("function");
    expect(() => stop()).not.toThrow();
  });

  it("the no-op stop function is idempotent — calling it twice does not throw", () => {
    mockFs.existsSync.mockReturnValue(false);
    const stop = startHoneywellPoller();
    expect(() => { stop(); stop(); }).not.toThrow();
  });

  it("starts polling when valid tokens are available and returns a stop function", async () => {
    mockFs.existsSync.mockReturnValue(false);
    process.env.HONEYWELL_ACCESS_TOKEN  = "valid-access";
    process.env.HONEYWELL_REFRESH_TOKEN = "valid-refresh";
    process.env.HONEYWELL_CLIENT_ID     = "test-client-id";
    process.env.HONEYWELL_LOCATION_ID   = "loc-123";

    mockFetchSequence([
      { ok: true,  body: [] },           // thermostats
      { ok: false, status: 404, body: [] }, // WLD
    ]);

    jest.useFakeTimers();

    const stop = startHoneywellPoller(60_000);
    expect(typeof stop).toBe("function");

    await Promise.resolve();
    await Promise.resolve();

    stop();
    jest.useRealTimers();

    delete process.env.HONEYWELL_CLIENT_ID;
    delete process.env.HONEYWELL_LOCATION_ID;
  });
});
