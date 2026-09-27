/**
 * Unit tests for useUserTier hook
 *
 * useUserTier is a thin wrapper around paymentService.getMySubscription
 * that returns the PlanTier directly (as opposed to useSubscription which
 * wraps it in a { userTier } object). Both hooks share the same payment
 * service dependency.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const mockGetMySubscription = vi.fn();

vi.mock("@/services/payment", () => ({
  paymentService: {
    getMySubscription: (...args: any[]) => mockGetMySubscription(...args),
  },
}));

import { useUserTier } from "@/hooks/useUserTier";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useUserTier", () => {
  it("defaults to Free before the request resolves", () => {
    mockGetMySubscription.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useUserTier());
    expect(result.current).toBe("Free");
  });

  it("returns the tier from paymentService on success", async () => {
    mockGetMySubscription.mockResolvedValueOnce({ tier: "ContractorPro", expiresAt: null, cancelledAt: null });
    const { result } = renderHook(() => useUserTier());
    await waitFor(() => {
      expect(result.current).toBe("ContractorPro");
    });
  });

  it("stays at Free on service error", async () => {
    mockGetMySubscription.mockRejectedValueOnce(new Error("network error"));
    const { result } = renderHook(() => useUserTier());
    await waitFor(() => {
      expect(result.current).toBe("Free");
    });
  });
});
