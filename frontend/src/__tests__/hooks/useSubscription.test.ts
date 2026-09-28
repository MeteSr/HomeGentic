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
  it("defaults to Free tier before the request resolves", () => {
    // Never-resolving promise to freeze state at initial
    mockGetMySubscription.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useSubscription());
    expect(result.current.userTier).toBe("Free");
  });

  it("returns the tier from paymentService on success", async () => {
    mockGetMySubscription.mockResolvedValueOnce({ tier: "Pro", expiresAt: null, cancelledAt: null });
    const { result } = renderHook(() => useSubscription());
    await waitFor(() => {
      expect(result.current.userTier).toBe("Pro");
    });
  });

  it("returns ContractorPro tier when service resolves ContractorPro", async () => {
    mockGetMySubscription.mockResolvedValueOnce({ tier: "ContractorPro", expiresAt: null, cancelledAt: null });
    const { result } = renderHook(() => useSubscription());
    await waitFor(() => {
      expect(result.current.userTier).toBe("ContractorPro");
    });
  });

  it("keeps Free tier when service rejects (error case)", async () => {
    mockGetMySubscription.mockRejectedValueOnce(new Error("canister not available"));
    const { result } = renderHook(() => useSubscription());
    // Wait a tick for the effect to settle
    await waitFor(() => {
      // Tier should remain Free since error path just logs and doesn't change state
      expect(result.current.userTier).toBe("Free");
    });
  });

  it("calls getMySubscription exactly once on mount", async () => {
    mockGetMySubscription.mockResolvedValueOnce({ tier: "Free", expiresAt: null, cancelledAt: null });
    renderHook(() => useSubscription());
    await waitFor(() => {
      expect(mockGetMySubscription).toHaveBeenCalledTimes(1);
    });
  });
});
