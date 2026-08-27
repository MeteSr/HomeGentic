/**
 * Unit tests for usePropertyDetail hook
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { Property } from "@/services/property";

const mockGetProperty = vi.fn();

vi.mock("@/services/property", () => ({
  propertyService: {
    getProperty: (...args: any[]) => mockGetProperty(...args),
  },
}));

// Provide a minimal propertyStore so the hook's fallback path works
vi.mock("@/store/propertyStore", () => ({
  usePropertyStore: () => ({
    properties: [],
  }),
}));

import { usePropertyDetail } from "@/hooks/usePropertyDetail";

function makeProperty(overrides: Partial<Property> = {}): Property {
  return {
    id: "prop-1",
    owner: "owner-a",
    address: "123 Main St",
    city: "Nashville",
    state: "TN",
    zipCode: "37201",
    propertyType: "SingleFamily",
    yearBuilt: BigInt(1990),
    squareFeet: BigInt(2000),
    verificationLevel: "Unverified",
    tier: "Basic",
    createdAt: BigInt(0),
    updatedAt: BigInt(0),
    isActive: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("usePropertyDetail", () => {
  it("starts in loading state when id is provided", () => {
    mockGetProperty.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => usePropertyDetail("prop-1"));
    expect(result.current.loading).toBe(true);
    expect(result.current.property).toBeNull();
  });

  it("resolves loading to false and sets property on success", async () => {
    const prop = makeProperty({ id: "prop-1" });
    mockGetProperty.mockResolvedValueOnce(prop);
    const { result } = renderHook(() => usePropertyDetail("prop-1"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.property?.id).toBe("prop-1");
    });
  });

  it("sets loading false and property null on service error with no cache", async () => {
    mockGetProperty.mockRejectedValueOnce(new Error("not found"));
    const { result } = renderHook(() => usePropertyDetail("prop-999"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.property).toBeNull();
    });
  });

  it("sets loading to false immediately when id is undefined", async () => {
    const { result } = renderHook(() => usePropertyDetail(undefined));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.property).toBeNull();
    });
  });

  it("calls propertyService.getProperty with the provided id", async () => {
    const prop = makeProperty({ id: "prop-42" });
    mockGetProperty.mockResolvedValueOnce(prop);
    renderHook(() => usePropertyDetail("prop-42"));

    await waitFor(() => {
      expect(mockGetProperty).toHaveBeenCalledWith("prop-42");
    });
  });
});
