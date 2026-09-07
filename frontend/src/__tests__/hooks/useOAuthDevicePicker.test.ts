/**
 * Unit tests — useOAuthDevicePicker
 *
 * OA.1  Initial state: devices=[], loading=false, error=null
 * OA.2  start() sets loading=true and opens a popup
 * OA.3  Receiving an oauth-devices postMessage with devices sets them and stops loading
 * OA.4  Receiving an oauth-devices postMessage with an error sets error state
 * OA.5  Messages from unknown origins are silently ignored
 * OA.6  reset() clears devices, error, and loading
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useOAuthDevicePicker } from "@/hooks/useOAuthDevicePicker";

const GATEWAY_ORIGIN = "http://localhost:3002";

// Stub window.open
const mockPopup = { closed: false, close: vi.fn() };

beforeEach(() => {
  vi.spyOn(window, "open").mockReturnValue(mockPopup as any);
  mockPopup.closed = false;
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
  it("sets loading=true and calls window.open", () => {
    const { result } = renderHook(() => useOAuthDevicePicker());
    act(() => { result.current.start("nest"); });
    expect(result.current.loading).toBe(true);
    expect(window.open).toHaveBeenCalledWith(
      expect.stringContaining("/oauth/device/start/nest"),
      expect.any(String),
      expect.any(String),
    );
  });
});

// ── OA.3 ─────────────────────────────────────────────────────────────────────

describe("OA.3 — oauth-devices postMessage with devices resolves loading", () => {
  it("populates devices and sets loading=false", async () => {
    const { result } = renderHook(() => useOAuthDevicePicker());
    act(() => { result.current.start("nest"); });
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
    act(() => { result.current.start("ring"); });

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
  it("does not change state for messages from other origins", () => {
    const { result } = renderHook(() => useOAuthDevicePicker());
    act(() => { result.current.start("nest"); });

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
    act(() => { result.current.start("ring"); });

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
