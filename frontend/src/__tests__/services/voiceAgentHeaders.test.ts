/**
 * voiceAgentHeaders — real logic worth locking down:
 *   - always includes Content-Type and a stable x-trace-id per session
 *   - includes x-icp-principal only when authenticated
 *   - the trace id is persisted in sessionStorage and reused across calls
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetState } = vi.hoisted(() => ({ mockGetState: vi.fn() }));
vi.mock("@/store/authStore", () => ({ useAuthStore: { getState: mockGetState } }));

import { voiceAgentHeaders } from "@/services/voiceAgentHeaders";

beforeEach(() => {
  sessionStorage.clear();
  mockGetState.mockReturnValue({ principal: null });
});

describe("voiceAgentHeaders", () => {
  it("always includes Content-Type and a stable x-trace-id", () => {
    const headers = voiceAgentHeaders();
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["x-trace-id"]).toBeTruthy();
  });

  it("reuses the same trace id across multiple calls in the same session", () => {
    const first = voiceAgentHeaders()["x-trace-id"];
    const second = voiceAgentHeaders()["x-trace-id"];
    expect(second).toBe(first);
  });

  it("omits x-icp-principal when not authenticated", () => {
    mockGetState.mockReturnValue({ principal: null });
    const headers = voiceAgentHeaders();
    expect(headers["x-icp-principal"]).toBeUndefined();
  });

  it("includes x-icp-principal when authenticated", () => {
    mockGetState.mockReturnValue({ principal: "my-principal" });
    const headers = voiceAgentHeaders();
    expect(headers["x-icp-principal"]).toBe("my-principal");
  });
});
