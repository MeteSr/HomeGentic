/**
 * Unit tests — usePropertyMaintenance
 *
 * PM.1  Returns empty collections when propertyId is undefined
 * PM.2  Loads recurringServices from recurringService on mount
 * PM.3  visitLogMap is populated from getVisitLogs per service
 * PM.4  systemAges comes from systemAgesService
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { RecurringService, VisitLog } from "@/services/recurringService";

const mockGetByProperty  = vi.fn();
const mockGetVisitLogs   = vi.fn();
const mockSystemAgesGet  = vi.fn();

vi.mock("@/services/recurringService", () => ({
  recurringService: {
    getByProperty: (...a: any[]) => mockGetByProperty(...a),
    getVisitLogs:  (...a: any[]) => mockGetVisitLogs(...a),
  },
}));

vi.mock("@/services/systemAges", () => ({
  systemAgesService: { get: (...a: any[]) => mockSystemAgesGet(...a) },
}));

import { usePropertyMaintenance } from "@/hooks/usePropertyMaintenance";

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
  mockSystemAgesGet.mockReturnValue({ HVAC: 5 });
});

// ── PM.1 ─────────────────────────────────────────────────────────────────────

describe("PM.1 — empty collections when propertyId is undefined", () => {
  it("never calls the service and returns empty state", () => {
    const { result } = renderHook(() => usePropertyMaintenance(undefined));
    expect(result.current.recurringServices).toHaveLength(0);
    expect(result.current.visitLogMap).toEqual({});
    expect(mockGetByProperty).not.toHaveBeenCalled();
  });
});

// ── PM.2 ─────────────────────────────────────────────────────────────────────

describe("PM.2 — loads recurringServices on mount", () => {
  it("populates recurringServices array", async () => {
    const { result } = renderHook(() => usePropertyMaintenance("p1"));
    await waitFor(() => {
      expect(result.current.recurringServices).toHaveLength(1);
    });
    expect(result.current.recurringServices[0].id).toBe("svc1");
  });
});

// ── PM.3 ─────────────────────────────────────────────────────────────────────

describe("PM.3 — visitLogMap is populated per service", () => {
  it("maps serviceId to visit logs", async () => {
    const { result } = renderHook(() => usePropertyMaintenance("p1"));
    await waitFor(() => {
      expect(result.current.visitLogMap["svc1"]).toHaveLength(1);
    });
    expect(result.current.visitLogMap["svc1"][0].id).toBe("v1");
  });
});

// ── PM.4 ─────────────────────────────────────────────────────────────────────

describe("PM.4 — systemAges comes from systemAgesService.get", () => {
  it("returns the value from systemAgesService", async () => {
    const { result } = renderHook(() => usePropertyMaintenance("p1"));
    await waitFor(() => {
      expect(result.current.systemAges).toEqual({ HVAC: 5 });
    });
  });
});
