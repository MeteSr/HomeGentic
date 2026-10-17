import {
  loadTokenState,
  persistTokenState,
  refreshTokens,
  ensureFreshToken,
  detectEventFromAttributes,
  pollOnce,
  startGEPoller,
} from "../../pollers/geSmartHQ";
import type { GETokenState } from "../../pollers/geSmartHQ";

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock("fs");
jest.mock("../../icp", () => ({
  recordSensorEvent: jest.fn(),
}));

import fs from "fs";
import { recordSensorEvent } from "../../icp";

const mockFs                = fs as jest.Mocked<typeof fs>;
const mockRecordSensorEvent = recordSensorEvent as jest.Mock;

// ── Helpers ───────────────────────────────────────────────────────────────────

const NOW = Date.now();
const VALID_STATE: GETokenState = {
  accessToken:  "ge-access-token",
  refreshToken: "ge-refresh-token",
  expiresAt:    NOW + 3_600_000,
};
const EXPIRED_STATE: GETokenState = {
  accessToken:  "old-access",
  refreshToken: "old-refresh",
  expiresAt:    NOW - 1000,
};

function mockFetchSequence(responses: Array<{ ok: boolean; status?: number; body: unknown }>): void {
  let call = 0;
  global.fetch = jest.fn().mockImplementation(() => {
    const r = responses[call] ?? responses[responses.length - 1];
    call++;
    return Promise.resolve({
      ok:     r.ok,
      status: r.status ?? 200,
      json:   jest.fn().mockResolvedValue(r.body),
      text:   jest.fn().mockResolvedValue("error"),
    } as unknown as Response);
  });
}

const APPLIANCES_OK = [
  { applianceId: "APPLIANCE-001", applianceType: "Refrigerator", nickName: "Kitchen Fridge" },
  { applianceId: "APPLIANCE-002", applianceType: "Dishwasher",   nickName: "Main Dishwasher" },
];

const ATTRS_HEALTHY  = { attributes: { DOOR_STATUS: { value: "0" }, CYCLE_STATE: { value: "0" } } };
const ATTRS_FAULT    = { attributes: { DOOR_STATUS: { value: "0" }, ERROR_CODE: { value: "E2" } } };
const ATTRS_MAINT    = { attributes: { WATER_FILTER_CHANGE: { value: "1" } } };

// ── loadTokenState ────────────────────────────────────────────────────────────

describe("loadTokenState", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    delete process.env.GE_ACCESS_TOKEN;
    delete process.env.GE_REFRESH_TOKEN;
  });

  it("returns state from valid file", () => {
    const stored: GETokenState = { accessToken: "file-at", refreshToken: "file-rt", expiresAt: NOW + 3_600_000 };
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(JSON.stringify(stored));

    expect(loadTokenState()).toEqual(stored);
  });

  it("falls back to env vars when file is absent", () => {
    mockFs.existsSync.mockReturnValue(false);
    process.env.GE_ACCESS_TOKEN  = "env-at";
    process.env.GE_REFRESH_TOKEN = "env-rt";

    const state = loadTokenState();
    expect(state?.accessToken).toBe("env-at");
    expect(state?.refreshToken).toBe("env-rt");
  });

  it("falls back to env when file is corrupted", () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue("not json {{");
    process.env.GE_ACCESS_TOKEN  = "fallback-at";
    process.env.GE_REFRESH_TOKEN = "fallback-rt";

    expect(loadTokenState()?.accessToken).toBe("fallback-at");
  });

  it("returns null when file is absent and env vars are not set", () => {
    mockFs.existsSync.mockReturnValue(false);
    expect(loadTokenState()).toBeNull();
  });

  it("returns null when only accessToken is set but refreshToken is missing", () => {
    mockFs.existsSync.mockReturnValue(false);
    process.env.GE_ACCESS_TOKEN = "only-at";
    expect(loadTokenState()).toBeNull();
  });
});

// ── persistTokenState ─────────────────────────────────────────────────────────

describe("persistTokenState", () => {
  beforeEach(() => jest.resetAllMocks());

  it("writes the token JSON to file", () => {
    persistTokenState(VALID_STATE);
    expect(mockFs.writeFileSync).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining(VALID_STATE.accessToken),
      { encoding: "utf8", mode: 0o600 }
    );
  });

  it("updates GE_ACCESS_TOKEN and GE_REFRESH_TOKEN env vars", () => {
    persistTokenState(VALID_STATE);
    expect(process.env.GE_ACCESS_TOKEN).toBe(VALID_STATE.accessToken);
    expect(process.env.GE_REFRESH_TOKEN).toBe(VALID_STATE.refreshToken);
  });

  it("does not throw when file write fails", () => {
    mockFs.writeFileSync.mockImplementation(() => { throw new Error("disk full"); });
    expect(() => persistTokenState(VALID_STATE)).not.toThrow();
  });
});

// ── refreshTokens ─────────────────────────────────────────────────────────────

describe("refreshTokens", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    process.env.GE_CLIENT_ID     = "client-id";
    process.env.GE_CLIENT_SECRET = "client-secret";
    mockFs.writeFileSync.mockReturnValue(undefined);
  });

  afterEach(() => {
    delete process.env.GE_CLIENT_ID;
    delete process.env.GE_CLIENT_SECRET;
  });

  it("throws when GE_CLIENT_ID is absent", async () => {
    delete process.env.GE_CLIENT_ID;
    await expect(refreshTokens(EXPIRED_STATE)).rejects.toThrow("GE_CLIENT_ID");
  });

  it("throws when GE_CLIENT_SECRET is absent", async () => {
    delete process.env.GE_CLIENT_SECRET;
    await expect(refreshTokens(EXPIRED_STATE)).rejects.toThrow("GE_CLIENT_SECRET");
  });

  it("POSTs to /oauth/token with Basic auth and returns updated state", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok:   true,
      json: jest.fn().mockResolvedValue({
        access_token:  "new-at",
        refresh_token: "new-rt",
        expires_in:    3600,
      }),
    } as unknown as Response);

    const state = await refreshTokens(EXPIRED_STATE);

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/oauth/token");
    expect((init.headers as Record<string, string>)["Authorization"]).toMatch(/^Basic /);
    const body = new URLSearchParams(init.body as string);
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe(EXPIRED_STATE.refreshToken);

    expect(state.accessToken).toBe("new-at");
    expect(state.refreshToken).toBe("new-rt");
    expect(state.expiresAt).toBeGreaterThan(Date.now());
  });

  it("throws when token refresh fails", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false, status: 401,
      text: jest.fn().mockResolvedValue("Unauthorized"),
    } as unknown as Response);

    await expect(refreshTokens(EXPIRED_STATE)).rejects.toThrow("token refresh failed");
  });
});

// ── ensureFreshToken ──────────────────────────────────────────────────────────

describe("ensureFreshToken", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    process.env.GE_CLIENT_ID     = "client-id";
    process.env.GE_CLIENT_SECRET = "client-secret";
    mockFs.writeFileSync.mockReturnValue(undefined);
  });

  it("returns the same state when token is still fresh", async () => {
    global.fetch = jest.fn();
    const result = await ensureFreshToken(VALID_STATE);
    expect(result).toBe(VALID_STATE);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("calls refreshTokens when token is within the refresh buffer", async () => {
    const almostExpired: GETokenState = { ...VALID_STATE, expiresAt: NOW + 2 * 60 * 1000 };
    global.fetch = jest.fn().mockResolvedValue({
      ok:   true,
      json: jest.fn().mockResolvedValue({ access_token: "fresh", refresh_token: "fresh-rt", expires_in: 3600 }),
    } as unknown as Response);

    const result = await ensureFreshToken(almostExpired);
    expect(result.accessToken).toBe("fresh");
  });
});

// ── detectEventFromAttributes ─────────────────────────────────────────────────

describe("detectEventFromAttributes", () => {
  const ID  = "APP-001";
  const RAW = "{}";

  it("returns null when all attributes are normal", () => {
    const attrs = { DOOR_STATUS: { value: "0" }, CYCLE_STATE: { value: "0" } };
    expect(detectEventFromAttributes(ID, attrs, RAW)).toBeNull();
  });

  it("returns ApplianceFault when an ERROR_CODE is non-zero", () => {
    const attrs = { ERROR_CODE: { value: "E2" } };
    const r = detectEventFromAttributes(ID, attrs, RAW);
    expect(r?.eventType).toEqual({ ApplianceFault: null });
    expect(r?.externalDeviceId).toBe(ID);
  });

  it("returns ApplianceFault when a _FAULT key is non-zero", () => {
    const attrs = { MOTOR_FAULT: { value: "1" } };
    expect(detectEventFromAttributes(ID, attrs, RAW)?.eventType).toEqual({ ApplianceFault: null });
  });

  it("returns ApplianceFault when FAULT_CODE is non-zero", () => {
    const attrs = { FAULT_CODE: { value: "F5" } };
    expect(detectEventFromAttributes(ID, attrs, RAW)?.eventType).toEqual({ ApplianceFault: null });
  });

  it("does not flag ERROR_CODE with value '0'", () => {
    const attrs = { ERROR_CODE: { value: "0" } };
    expect(detectEventFromAttributes(ID, attrs, RAW)).toBeNull();
  });

  it("does not flag ERROR_CODE with empty value", () => {
    const attrs = { ERROR_CODE: { value: "" } };
    expect(detectEventFromAttributes(ID, attrs, RAW)).toBeNull();
  });

  it("returns ApplianceMaintenance when WATER_FILTER_CHANGE is '1'", () => {
    const attrs = { WATER_FILTER_CHANGE: { value: "1" } };
    const r = detectEventFromAttributes(ID, attrs, RAW);
    expect(r?.eventType).toEqual({ ApplianceMaintenance: null });
  });

  it("returns ApplianceMaintenance when MAINTENANCE_DUE is '1'", () => {
    const attrs = { MAINTENANCE_DUE: { value: "1" } };
    expect(detectEventFromAttributes(ID, attrs, RAW)?.eventType).toEqual({ ApplianceMaintenance: null });
  });

  it("returns ApplianceMaintenance for DESCALE over a fault (maintenance priority)", () => {
    const attrs = { DESCALE: { value: "1" }, ERROR_CODE: { value: "E1" } };
    expect(detectEventFromAttributes(ID, attrs, RAW)?.eventType).toEqual({ ApplianceMaintenance: null });
  });

  it("does not flag WATER_FILTER_CHANGE with value '0'", () => {
    const attrs = { WATER_FILTER_CHANGE: { value: "0" } };
    expect(detectEventFromAttributes(ID, attrs, RAW)).toBeNull();
  });
});

// ── pollOnce ──────────────────────────────────────────────────────────────────

describe("pollOnce", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockRecordSensorEvent.mockResolvedValue({ success: true, eventId: "evt-1" });
  });

  it("fetches appliance list with Bearer token", async () => {
    mockFetchSequence([
      { ok: true, body: APPLIANCES_OK },
      { ok: true, body: ATTRS_HEALTHY },
      { ok: true, body: ATTRS_HEALTHY },
    ]);

    await pollOnce(VALID_STATE);

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/v1/appliance");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe(`Bearer ${VALID_STATE.accessToken}`);
  });

  it("does not call recordSensorEvent when all appliances are healthy", async () => {
    mockFetchSequence([
      { ok: true, body: APPLIANCES_OK },
      { ok: true, body: ATTRS_HEALTHY },
      { ok: true, body: ATTRS_HEALTHY },
    ]);

    await pollOnce(VALID_STATE);
    expect(mockRecordSensorEvent).not.toHaveBeenCalled();
  });

  it("calls recordSensorEvent with ApplianceFault when an appliance has an error code", async () => {
    mockFetchSequence([
      { ok: true, body: [APPLIANCES_OK[0]] },
      { ok: true, body: ATTRS_FAULT },
    ]);

    await pollOnce(VALID_STATE);

    expect(mockRecordSensorEvent).toHaveBeenCalledTimes(1);
    expect(mockRecordSensorEvent.mock.calls[0][0].eventType).toEqual({ ApplianceFault: null });
    expect(mockRecordSensorEvent.mock.calls[0][0].externalDeviceId).toBe("APPLIANCE-001");
  });

  it("calls recordSensorEvent with ApplianceMaintenance when filter is due", async () => {
    mockFetchSequence([
      { ok: true, body: [APPLIANCES_OK[0]] },
      { ok: true, body: ATTRS_MAINT },
    ]);

    await pollOnce(VALID_STATE);

    expect(mockRecordSensorEvent).toHaveBeenCalledTimes(1);
    expect(mockRecordSensorEvent.mock.calls[0][0].eventType).toEqual({ ApplianceMaintenance: null });
  });

  it("stops and returns when appliance list fetch fails", async () => {
    mockFetchSequence([{ ok: false, status: 503, body: "unavailable" }]);

    await expect(pollOnce(VALID_STATE)).resolves.toBeUndefined();
    expect(mockRecordSensorEvent).not.toHaveBeenCalled();
    expect((global.fetch as jest.Mock).mock.calls).toHaveLength(1);
  });

  it("skips an appliance when its attribute fetch fails with non-404", async () => {
    mockFetchSequence([
      { ok: true,  body: [APPLIANCES_OK[0]] },
      { ok: false, status: 500, body: "server error" },
    ]);

    await expect(pollOnce(VALID_STATE)).resolves.toBeUndefined();
    expect(mockRecordSensorEvent).not.toHaveBeenCalled();
  });

  it("silently skips an appliance when its attribute fetch returns 404", async () => {
    mockFetchSequence([
      { ok: true,  body: [APPLIANCES_OK[0]] },
      { ok: false, status: 404, body: "not found" },
    ]);

    await expect(pollOnce(VALID_STATE)).resolves.toBeUndefined();
    expect(mockRecordSensorEvent).not.toHaveBeenCalled();
  });

  it("returns an empty list gracefully", async () => {
    mockFetchSequence([{ ok: true, body: [] }]);

    await expect(pollOnce(VALID_STATE)).resolves.toBeUndefined();
    expect(mockRecordSensorEvent).not.toHaveBeenCalled();
  });

  it("logs canister error but does not throw when recordSensorEvent fails", async () => {
    mockFetchSequence([
      { ok: true, body: [APPLIANCES_OK[0]] },
      { ok: true, body: ATTRS_FAULT },
    ]);
    mockRecordSensorEvent.mockResolvedValue({ success: false, error: "Unauthorized" });

    await expect(pollOnce(VALID_STATE)).resolves.toBeUndefined();
  });
});

// ── startGEPoller ─────────────────────────────────────────────────────────────

describe("startGEPoller", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    delete process.env.GE_ACCESS_TOKEN;
    delete process.env.GE_REFRESH_TOKEN;
    mockFs.existsSync.mockReturnValue(false);
  });

  it("returns a no-op stop function when tokens are absent", () => {
    const stop = startGEPoller();
    expect(typeof stop).toBe("function");
    expect(() => stop()).not.toThrow();
  });

  it("the no-op stop function is idempotent", () => {
    const stop = startGEPoller();
    expect(() => { stop(); stop(); }).not.toThrow();
  });

  it("starts polling and returns a stop function when tokens are present", () => {
    process.env.GE_ACCESS_TOKEN  = "ge-at";
    process.env.GE_REFRESH_TOKEN = "ge-rt";

    global.fetch = jest.fn().mockRejectedValue(new Error("no network in test"));

    const stop = startGEPoller(60_000);
    expect(typeof stop).toBe("function");
    stop();
  });
});
