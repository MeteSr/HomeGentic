import {
  loadSession,
  persistSession,
  login,
  ensureSession,
  pollOnce,
  startTeslaPoller,
} from "../../pollers/teslaGateway";
import type { TeslaSession } from "../../pollers/teslaGateway";

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
const VALID_SESSION: TeslaSession = { token: "test-bearer-token", expiresAt: NOW + 3_600_000 };
const EXPIRED_SESSION: TeslaSession = { token: "old-token", expiresAt: NOW - 1000 };

const SOE_OK: object       = { percentage: 75.5 };
const SOE_LOW: object      = { percentage: 15 };
const GRID_OK: object      = { grid_status: "SystemGridConnected", grid_services_active: false };
const GRID_ISLAND: object  = { grid_status: "SystemIslandedActive", grid_services_active: false };

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

// ── loadSession ───────────────────────────────────────────────────────────────

describe("loadSession", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    delete process.env.TESLA_ACCESS_TOKEN;
  });

  it("returns session from valid file", () => {
    const stored: TeslaSession = { token: "file-token", expiresAt: Date.now() + 3_600_000 };
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(JSON.stringify(stored));

    const result = loadSession();
    expect(result).toEqual(stored);
  });

  it("falls back to TESLA_ACCESS_TOKEN env when file is expired", () => {
    const expired: TeslaSession = { token: "old", expiresAt: Date.now() - 1000 };
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(JSON.stringify(expired));

    process.env.TESLA_ACCESS_TOKEN = "env-token";
    const result = loadSession();
    expect(result?.token).toBe("env-token");
  });

  it("falls back to env when file is corrupted", () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue("{ not valid json {{");

    process.env.TESLA_ACCESS_TOKEN = "env-fallback";
    const result = loadSession();
    expect(result?.token).toBe("env-fallback");
  });

  it("returns null when file is absent and no env token", () => {
    mockFs.existsSync.mockReturnValue(false);
    expect(loadSession()).toBeNull();
  });

  it("returns session from env when file does not exist", () => {
    mockFs.existsSync.mockReturnValue(false);
    process.env.TESLA_ACCESS_TOKEN = "only-env-token";

    const result = loadSession();
    expect(result?.token).toBe("only-env-token");
  });
});

// ── persistSession ────────────────────────────────────────────────────────────

describe("persistSession", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("writes session JSON to file", () => {
    persistSession(VALID_SESSION);
    expect(mockFs.writeFileSync).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining(VALID_SESSION.token),
      { encoding: "utf8", mode: 0o600 }
    );
  });

  it("updates TESLA_ACCESS_TOKEN in the process environment", () => {
    persistSession(VALID_SESSION);
    expect(process.env.TESLA_ACCESS_TOKEN).toBe(VALID_SESSION.token);
  });

  it("does not throw when file write fails", () => {
    mockFs.writeFileSync.mockImplementation(() => { throw new Error("disk full"); });
    expect(() => persistSession(VALID_SESSION)).not.toThrow();
  });
});

// ── login ─────────────────────────────────────────────────────────────────────

describe("login", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    delete process.env.TESLA_EMAIL;
    delete process.env.TESLA_PASSWORD;
    mockFs.writeFileSync.mockReturnValue(undefined);
  });

  it("throws when TESLA_EMAIL is absent", async () => {
    process.env.TESLA_PASSWORD = "pw";
    await expect(login()).rejects.toThrow("TESLA_EMAIL");
  });

  it("throws when TESLA_PASSWORD is absent", async () => {
    process.env.TESLA_EMAIL = "user@example.com";
    await expect(login()).rejects.toThrow("TESLA_PASSWORD");
  });

  it("POSTs to /api/login/Basic with correct body and returns a session", async () => {
    process.env.TESLA_EMAIL    = "user@example.com";
    process.env.TESLA_PASSWORD = "secret";
    process.env.TESLA_GATEWAY_IP = "10.0.0.1";

    global.fetch = jest.fn().mockResolvedValue({
      ok:   true,
      json: jest.fn().mockResolvedValue({ token: "new-bearer" }),
    } as unknown as Response);

    const session = await login();

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toContain("10.0.0.1");
    expect(url).toContain("/api/login/Basic");
    const body = JSON.parse(init.body as string);
    expect(body.email).toBe("user@example.com");
    expect(body.username).toBe("customer");
    expect(session.token).toBe("new-bearer");
    expect(session.expiresAt).toBeGreaterThan(Date.now());
  });

  it("throws when login request fails", async () => {
    process.env.TESLA_EMAIL    = "user@example.com";
    process.env.TESLA_PASSWORD = "secret";

    global.fetch = jest.fn().mockResolvedValue({
      ok:     false,
      status: 401,
      text:   jest.fn().mockResolvedValue("Unauthorized"),
    } as unknown as Response);

    await expect(login()).rejects.toThrow("login failed");
  });
});

// ── ensureSession ─────────────────────────────────────────────────────────────

describe("ensureSession", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    process.env.TESLA_EMAIL    = "user@example.com";
    process.env.TESLA_PASSWORD = "secret";
    mockFs.writeFileSync.mockReturnValue(undefined);
  });

  it("returns the same session when it is still valid", async () => {
    global.fetch = jest.fn();
    const result = await ensureSession(VALID_SESSION);
    expect(result).toBe(VALID_SESSION);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("calls login when session is expired", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok:   true,
      json: jest.fn().mockResolvedValue({ token: "refreshed-token" }),
    } as unknown as Response);

    const result = await ensureSession(EXPIRED_SESSION);
    expect(result.token).toBe("refreshed-token");
    expect(global.fetch).toHaveBeenCalled();
  });

  it("calls login when session is null", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok:   true,
      json: jest.fn().mockResolvedValue({ token: "brand-new-token" }),
    } as unknown as Response);

    const result = await ensureSession(null);
    expect(result.token).toBe("brand-new-token");
  });
});

// ── pollOnce ──────────────────────────────────────────────────────────────────

describe("pollOnce", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    process.env.TESLA_POWERWALL_SERIAL = "1118431-00-L";
    process.env.TESLA_GATEWAY_IP       = "10.0.0.1";
    mockRecordSensorEvent.mockResolvedValue({ success: true, eventId: "evt-1" });
  });

  afterEach(() => {
    delete process.env.TESLA_POWERWALL_SERIAL;
  });

  it("fetches SOE and grid status with Bearer token and Cookie", async () => {
    mockFetchSequence([
      { ok: true, body: SOE_OK },
      { ok: true, body: GRID_OK },
    ]);

    await pollOnce(VALID_SESSION);

    const calls = (global.fetch as jest.Mock).mock.calls as Array<[string, RequestInit]>;
    expect(calls[0][0]).toContain("/api/system_status/soe");
    expect((calls[0][1].headers as Record<string, string>)["Authorization"]).toBe(`Bearer ${VALID_SESSION.token}`);
    expect(calls[1][0]).toContain("/api/system_status/grid_status");
  });

  it("does not call recordSensorEvent when charge is healthy and grid is connected", async () => {
    mockFetchSequence([
      { ok: true, body: SOE_OK },
      { ok: true, body: GRID_OK },
    ]);

    await pollOnce(VALID_SESSION);
    expect(mockRecordSensorEvent).not.toHaveBeenCalled();
  });

  it("calls recordSensorEvent with GridOutage when grid is islanded", async () => {
    mockFetchSequence([
      { ok: true, body: SOE_OK },
      { ok: true, body: GRID_ISLAND },
    ]);

    await pollOnce(VALID_SESSION);

    expect(mockRecordSensorEvent).toHaveBeenCalledTimes(1);
    expect(mockRecordSensorEvent.mock.calls[0][0].eventType).toEqual({ GridOutage: null });
    expect(mockRecordSensorEvent.mock.calls[0][0].externalDeviceId).toBe("1118431-00-L");
  });

  it("calls recordSensorEvent with BatteryLow when charge is below 20%", async () => {
    mockFetchSequence([
      { ok: true, body: SOE_LOW },
      { ok: true, body: GRID_OK },
    ]);

    await pollOnce(VALID_SESSION);

    expect(mockRecordSensorEvent).toHaveBeenCalledTimes(1);
    expect(mockRecordSensorEvent.mock.calls[0][0].eventType).toEqual({ BatteryLow: null });
  });

  it("returns an expired session on 401 to trigger re-auth on next tick", async () => {
    mockFetchSequence([{ ok: false, status: 401, body: "Unauthorized" }]);

    const result = await pollOnce(VALID_SESSION);
    expect(result.expiresAt).toBe(0);
    expect(mockRecordSensorEvent).not.toHaveBeenCalled();
  });

  it("returns the same session when SOE fetch fails with a non-401 error", async () => {
    mockFetchSequence([{ ok: false, status: 503, body: "unavailable" }]);

    const result = await pollOnce(VALID_SESSION);
    expect(result).toBe(VALID_SESSION);
    expect(mockRecordSensorEvent).not.toHaveBeenCalled();
    expect((global.fetch as jest.Mock).mock.calls).toHaveLength(1); // no grid call
  });

  it("returns the same session when grid status fetch fails", async () => {
    mockFetchSequence([
      { ok: true,  body: SOE_LOW },
      { ok: false, status: 503, body: "unavailable" },
    ]);

    const result = await pollOnce(VALID_SESSION);
    expect(result).toBe(VALID_SESSION);
    expect(mockRecordSensorEvent).not.toHaveBeenCalled();
  });

  it("logs canister error but does not throw when recordSensorEvent fails", async () => {
    mockFetchSequence([
      { ok: true, body: SOE_LOW },
      { ok: true, body: GRID_OK },
    ]);
    mockRecordSensorEvent.mockResolvedValue({ success: false, error: "Unauthorized" });

    await expect(pollOnce(VALID_SESSION)).resolves.toEqual(VALID_SESSION);
  });

  it("returns session unchanged when TESLA_POWERWALL_SERIAL is not set", async () => {
    delete process.env.TESLA_POWERWALL_SERIAL;
    global.fetch = jest.fn();

    const result = await pollOnce(VALID_SESSION);
    expect(result).toBe(VALID_SESSION);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

// ── startTeslaPoller ──────────────────────────────────────────────────────────

describe("startTeslaPoller", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    delete process.env.TESLA_EMAIL;
    delete process.env.TESLA_PASSWORD;
    delete process.env.TESLA_POWERWALL_SERIAL;
    mockFs.existsSync.mockReturnValue(false);
  });

  it("returns a no-op stop function when config is absent", () => {
    const stop = startTeslaPoller();
    expect(typeof stop).toBe("function");
    expect(() => stop()).not.toThrow();
  });

  it("the no-op stop function is idempotent", () => {
    const stop = startTeslaPoller();
    expect(() => { stop(); stop(); }).not.toThrow();
  });

  it("starts polling and returns a stop function when config is present", () => {
    process.env.TESLA_EMAIL              = "user@example.com";
    process.env.TESLA_PASSWORD           = "secret";
    process.env.TESLA_POWERWALL_SERIAL   = "1118431-00-L";
    process.env.TESLA_GATEWAY_IP         = "10.0.0.1";

    // Reject immediately so the background tick errors and exits without polluting later tests.
    global.fetch = jest.fn().mockRejectedValue(new Error("no network in test"));
    mockFs.writeFileSync.mockReturnValue(undefined);

    const stop = startTeslaPoller(60_000);
    expect(typeof stop).toBe("function");
    stop();
  });
});
