/**
 * Unit tests — useOAuthDevicePicker
 *
 * OA.1  Initial state: devices=[], loading=false, error=null
 * OA.2  start() sets loading=true and opens a popup
 * OA.3  Receiving an oauth-devices postMessage with devices sets them and stops loading
 * OA.4  Receiving an oauth-devices postMessage with an error sets error state
 * OA.5  Messages from unknown origins are silently ignored
 * OA.6  reset() clears devices, error, and loading
 * OA.7  start() needs a gateway ticket (x-agent-session) before the popup navigates
 * OA.8  register() binds a picked device through the gateway with the pickToken
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
const { mockFetchWithSession } = vi.hoisted(() => ({ mockFetchWithSession: vi.fn() }));
vi.mock("@/services/agentSession", () => ({ fetchWithAgentSession: mockFetchWithSession }));

import { useOAuthDevicePicker } from "@/hooks/useOAuthDevicePicker";

const GATEWAY_ORIGIN = "http://localhost:3002";
const TICKET = "t".repeat(64);

// Stub window.open
const mockPopup = { closed: false, close: vi.fn(), location: { href: "" } };

const json = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

beforeEach(() => {
  vi.spyOn(window, "open").mockReturnValue(mockPopup as any);
  mockPopup.closed = false;
  mockPopup.location.href = "";
  mockFetchWithSession.mockReset();
  mockFetchWithSession.mockResolvedValue(json(200, { ticket: TICKET }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── OA.1 ─────────────────────────────────────────────────────────────────────

describe("OA.1 — initial state", () => {
  it("starts with empty devices, loading=false, error=null", () => {
    const { result } = renderHook(() => useOAuthDevicePicker());
    expect(result.current.devices).toHaveLength(0);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });
});

// ── OA.2 ─────────────────────────────────────────────────────────────────────

describe("OA.2 — start() opens a popup and sets loading", () => {
  it("sets loading=true, opens a popup and points it at the ticketed start URL", async () => {
    const { result } = renderHook(() => useOAuthDevicePicker());
    await act(async () => { await result.current.start("nest", "prop-1"); });
    expect(result.current.loading).toBe(true);
    expect(window.open).toHaveBeenCalledWith("about:blank", expect.any(String), expect.any(String));
    expect(mockPopup.location.href).toBe(`${GATEWAY_ORIGIN}/oauth/device/start/nest?ticket=${TICKET}`);
  });
});

// ── OA.3 ─────────────────────────────────────────────────────────────────────

describe("OA.3 — oauth-devices postMessage with devices resolves loading", () => {
  it("populates devices and sets loading=false", async () => {
    const { result } = renderHook(() => useOAuthDevicePicker());
    await act(async () => { await result.current.start("nest", "prop-1"); });
    expect(result.current.loading).toBe(true);

    act(() => {
      window.dispatchEvent(new MessageEvent("message", {
        origin: GATEWAY_ORIGIN,
        data: { type: "oauth-devices", devices: [{ id: "d1", name: "Nest Hub", type: "nest" }] },
      }));
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.devices).toHaveLength(1);
    expect(result.current.devices[0].id).toBe("d1");
  });
});

// ── OA.4 ─────────────────────────────────────────────────────────────────────

describe("OA.4 — oauth-devices postMessage with error sets error state", () => {
  it("sets error string and clears loading", async () => {
    const { result } = renderHook(() => useOAuthDevicePicker());
    await act(async () => { await result.current.start("ring", "prop-1"); });

    act(() => {
      window.dispatchEvent(new MessageEvent("message", {
        origin: GATEWAY_ORIGIN,
        data: { type: "oauth-devices", error: "access_denied" },
      }));
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.error).toBe("access_denied");
    expect(result.current.devices).toHaveLength(0);
  });
});

// ── OA.5 ─────────────────────────────────────────────────────────────────────

describe("OA.5 — messages from unknown origins are ignored", () => {
  it("does not change state for messages from other origins", async () => {
    const { result } = renderHook(() => useOAuthDevicePicker());
    await act(async () => { await result.current.start("nest", "prop-1"); });

    act(() => {
      window.dispatchEvent(new MessageEvent("message", {
        origin: "https://evil.example.com",
        data: { type: "oauth-devices", devices: [{ id: "evil", name: "Bad", type: "nest" }] },
      }));
    });

    // State should still be loading (message was ignored)
    expect(result.current.loading).toBe(true);
    expect(result.current.devices).toHaveLength(0);
  });
});

// ── OA.6 ─────────────────────────────────────────────────────────────────────

describe("OA.6 — reset() clears all state", () => {
  it("resets devices, error and loading to initial values", async () => {
    const { result } = renderHook(() => useOAuthDevicePicker());
    await act(async () => { await result.current.start("ring", "prop-1"); });

    act(() => {
      window.dispatchEvent(new MessageEvent("message", {
        origin: GATEWAY_ORIGIN,
        data: { type: "oauth-devices", devices: [{ id: "d1", name: "Ring", type: "ring" }] },
      }));
    });
    await waitFor(() => { expect(result.current.devices).toHaveLength(1); });

    act(() => { result.current.reset(); });
    expect(result.current.devices).toHaveLength(0);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });
});

// ── OA.7 ─────────────────────────────────────────────────────────────────────

describe("OA.7 — start() is bound to the signed-in user (M9 / F-14)", () => {
  it("asks the gateway for a ticket for the platform and property", async () => {
    const { result } = renderHook(() => useOAuthDevicePicker());
    await act(async () => { await result.current.start("ecobee", "prop-1"); });
    expect(mockFetchWithSession).toHaveBeenCalledWith(
      `${GATEWAY_ORIGIN}/oauth/device/link`,
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse(mockFetchWithSession.mock.calls[0][1].body);
    expect(body).toMatchObject({ platform: "ecobee", propertyId: "prop-1" });
  });

  it("closes the popup and reports the error when no ticket is issued", async () => {
    mockFetchWithSession.mockResolvedValue(json(401, { error: "Sign in again to connect a device" }));
    const { result } = renderHook(() => useOAuthDevicePicker());
    await act(async () => { await result.current.start("ecobee", "prop-1"); });
    expect(mockPopup.close).toHaveBeenCalled();
    expect(mockPopup.location.href).toBe("");
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe("Sign in again to connect a device");
  });
});

// ── OA.8 ─────────────────────────────────────────────────────────────────────

describe("OA.8 — register() links through the gateway", () => {
  it("sends the pickToken and device id, and maps the device", async () => {
    const { result } = renderHook(() => useOAuthDevicePicker());
    await act(async () => { await result.current.start("ecobee", "prop-1"); });
    act(() => {
      window.dispatchEvent(new MessageEvent("message", {
        origin: GATEWAY_ORIGIN,
        data: { type: "oauth-devices", pickToken: "p".repeat(64), devices: [{ id: "therm-1", name: "Hall", type: "Thermostat" }] },
      }));
    });
    await waitFor(() => { expect(result.current.devices).toHaveLength(1); });

    mockFetchWithSession.mockResolvedValue(json(200, { device: {
      id: "DEV_1", propertyId: "prop-1", homeowner: "aaaaa-aa", externalDeviceId: "therm-1",
      source: "Ecobee", name: "Hall", registeredAt: "1700000000000000000", isActive: true,
    } }));
    const device = await result.current.register("therm-1", "Hall");
    const [url, init] = mockFetchWithSession.mock.calls[mockFetchWithSession.mock.calls.length - 1];
    expect(url).toBe(`${GATEWAY_ORIGIN}/oauth/device/register`);
    expect(JSON.parse(init.body)).toMatchObject({ pickToken: "p".repeat(64), deviceId: "therm-1", name: "Hall" });
    expect(device).toMatchObject({ id: "DEV_1", source: "Ecobee", registeredAt: 1700000000000 });
  });

  it("refuses to register without a connected account", async () => {
    const { result } = renderHook(() => useOAuthDevicePicker());
    await expect(result.current.register("therm-1", "Hall")).rejects.toThrow(/Connect the account/);
  });

  it("surfaces a taken device as a readable error", async () => {
    const { result } = renderHook(() => useOAuthDevicePicker());
    await act(async () => { await result.current.start("ecobee", "prop-1"); });
    act(() => {
      window.dispatchEvent(new MessageEvent("message", {
        origin: GATEWAY_ORIGIN,
        data: { type: "oauth-devices", pickToken: "p".repeat(64), devices: [{ id: "therm-1", name: "Hall", type: "Thermostat" }] },
      }));
    });
    await waitFor(() => { expect(result.current.devices).toHaveLength(1); });
    mockFetchWithSession.mockResolvedValue(json(409, { error: "AlreadyExists" }));
    await expect(result.current.register("therm-1", "Hall")).rejects.toThrow("This device is already linked to another home");
  });
});
