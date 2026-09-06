/**
 * Unit tests — useMaintenanceSchedule
 *
 * MS.1  Returns empty collections when propLoading=true
 * MS.2  Returns empty collections when properties array is empty
 * MS.3  Loads services for all properties once propLoading=false
 * MS.4  visitLogMap is keyed by serviceId
 * MS.5  systemAges reloads when activePropertyId changes
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { Property } from "@/services/property";
import type { RecurringService, VisitLog } from "@/services/recurringService";

const mockGetByProperty = vi.fn();
const mockGetVisitLogs  = vi.fn();
const mockSystemAgesGet = vi.fn();

vi.mock("@/services/recurringService", () => ({
  recurringService: {
    getByProperty: (...a: any[]) => mockGetByProperty(...a),
    getVisitLogs:  (...a: any[]) => mockGetVisitLogs(...a),
  },
}));

vi.mock("@/services/systemAges", () => ({
  systemAgesService: { get: (...a: any[]) => mockSystemAgesGet(...a) },
}));

import { useMaintenanceSchedule } from "@/hooks/useMaintenanceSchedule";

const PROP: Property = {
  id: "p1", owner: "owner-1", address: "1 Main", city: "Austin", state: "TX",
  zipCode: "78701", propertyType: "SingleFamily", yearBuilt: BigInt(2000),
  squareFeet: BigInt(1800), verificationLevel: "Basic", tier: "Basic",
  createdAt: BigInt(0), updatedAt: BigInt(0), isActive: true,
};

const SVC: RecurringService = {
  id: "svc1", propertyId: "p1", homeowner: "owner-1",
  serviceType: "Other", providerName: "ACME HVAC", frequency: "Annually",
  startDate: "2023-01-01", status: "Active", createdAt: 0,
};

const LOG: VisitLog = { id: "v1", serviceId: "svc1", propertyId: "p1", visitDate: "2024-01-01", createdAt: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  mockGetByProperty.mockResolvedValue([SVC]);
  mockGetVisitLogs.mockResolvedValue([LOG]);
  mockSystemAgesGet.mockReturnValue({ HVAC: 3 });
});

// ── MS.1 ─────────────────────────────────────────────────────────────────────

describe("MS.1 — empty while propLoading=true", () => {
  it("does not load services when loading flag is set", () => {
    const { result } = renderHook(() =>
      useMaintenanceSchedule([PROP], true, null)
    );
    expect(result.current.recurringServices).toHaveLength(0);
    expect(mockGetByProperty).not.toHaveBeenCalled();
  });
});

// ── MS.2 ─────────────────────────────────────────────────────────────────────

describe("MS.2 — empty when properties array is empty", () => {
  it("skips service load and returns empty", () => {
    const { result } = renderHook(() =>
      useMaintenanceSchedule([], false, null)
    );
    expect(result.current.recurringServices).toHaveLength(0);
    expect(mockGetByProperty).not.toHaveBeenCalled();
  });
});

// ── MS.3 ─────────────────────────────────────────────────────────────────────

describe("MS.3 — loads services for all properties once propLoading=false", () => {
  it("populates recurringServices", async () => {
    const { result } = renderHook(() =>
      useMaintenanceSchedule([PROP], false, "p1")
    );
    await waitFor(() => {
      expect(result.current.recurringServices).toHaveLength(1);
    });
    expect(mockGetByProperty).toHaveBeenCalledWith("p1");
  });
});

// ── MS.4 ─────────────────────────────────────────────────────────────────────

describe("MS.4 — visitLogMap is keyed by serviceId", () => {
  it("maps svc1 to its visit logs", async () => {
    const { result } = renderHook(() =>
      useMaintenanceSchedule([PROP], false, "p1")
    );
    await waitFor(() => {
      expect(result.current.visitLogMap["svc1"]).toHaveLength(1);
    });
    expect(result.current.visitLogMap["svc1"][0].id).toBe("v1");
  });
});

// ── MS.5 ─────────────────────────────────────────────────────────────────────

describe("MS.5 — systemAges reloads when activePropertyId changes", () => {
  it("calls systemAgesService.get with new propertyId", () => {
    const { rerender } = renderHook(
      ({ id }: { id: string | null }) => useMaintenanceSchedule([PROP], false, id),
      { initialProps: { id: null as string | null } }
    );
    rerender({ id: "p1" });
    expect(mockSystemAgesGet).toHaveBeenCalledWith("p1");
  });
});
