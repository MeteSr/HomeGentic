/**
 * Unit tests for useSubscription hook
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const mockGetMySubscription = vi.fn();

vi.mock("@/services/payment", () => ({
  paymentService: {
    getMySubscription: (...args: any[]) => mockGetMySubscription(...args),
  },
}));

import { useSubscription } from "@/hooks/useSubscription";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useSubscription", () => {
  it("defaults to Basic tier before the request resolves", () => {
    // Never-resolving promise to freeze state at initial
    mockGetMySubscription.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useSubscription());
    expect(result.current.userTier).toBe("Basic");
  });

  it("returns the tier from paymentService on success", async () => {
    mockGetMySubscription.mockResolvedValueOnce({ tier: "Pro", expiresAt: null, cancelledAt: null });
    const { result } = renderHook(() => useSubscription());
    await waitFor(() => {
      expect(result.current.userTier).toBe("Pro");
    });
  });

  it("returns Premium tier when service resolves Premium", async () => {
    mockGetMySubscription.mockResolvedValueOnce({ tier: "Premium", expiresAt: null, cancelledAt: null });
    const { result } = renderHook(() => useSubscription());
    await waitFor(() => {
      expect(result.current.userTier).toBe("Premium");
    });
  });

  it("keeps Basic tier when service rejects (error case)", async () => {
    mockGetMySubscription.mockRejectedValueOnce(new Error("canister not available"));
    const { result } = renderHook(() => useSubscription());
    // Wait a tick for the effect to settle
    await waitFor(() => {
      // Tier should remain Basic since error path just logs and doesn't change state
      expect(result.current.userTier).toBe("Basic");
    });
  });

  it("calls getMySubscription exactly once on mount", async () => {
    mockGetMySubscription.mockResolvedValueOnce({ tier: "Basic", expiresAt: null, cancelledAt: null });
    renderHook(() => useSubscription());
    await waitFor(() => {
      expect(mockGetMySubscription).toHaveBeenCalledTimes(1);
    });
  });
});
