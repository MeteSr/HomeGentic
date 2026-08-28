/**
 * Unit tests — useJobSummary
 *
 * JS.1  loading=true initially then resolves to false
 * JS.2  allJobs is empty when properties list is empty
 * JS.3  Loads jobs for each property on mount
 * JS.4  E2E mock: uses window.__e2e_pending_proposals when set
 * JS.5  approveProposal removes it from pendingProposals
 * JS.6  rejectProposal removes it from pendingProposals
 * JS.7  reload re-fetches jobs
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { Job } from "@/services/job";
import type { Property } from "@/services/property";

const mockGetByProperty       = vi.fn();
const mockGetPendingProposals = vi.fn();
const mockApproveProposal     = vi.fn();
const mockRejectProposal      = vi.fn();
const mockToastSuccess        = vi.fn();
const mockToastError          = vi.fn();

vi.mock("@/services/job", () => ({
  jobService: {
    getByProperty:        (...a: any[]) => mockGetByProperty(...a),
    getPendingProposals:  (...a: any[]) => mockGetPendingProposals(...a),
    approveJobProposal:   (...a: any[]) => mockApproveProposal(...a),
    rejectJobProposal:    (...a: any[]) => mockRejectProposal(...a),
  },
}));

vi.mock("react-hot-toast", () => ({
  default: {
    success: (...a: any[]) => mockToastSuccess(...a),
    error:   (...a: any[]) => mockToastError(...a),
  },
}));

import { useJobSummary } from "@/hooks/useJobSummary";

const PROP: Property = {
  id: "p1", owner: "owner-1", address: "1 Main", city: "Austin", state: "TX",
  zipCode: "78701", propertyType: "SingleFamily", yearBuilt: BigInt(2000),
  squareFeet: BigInt(1800), verificationLevel: "Basic", tier: "Basic",
  createdAt: BigInt(0), updatedAt: BigInt(0), isActive: true,
};

const JOB: Job = {
  id: "j1", propertyId: "p1", homeowner: "owner-1", description: "Roof fix",
  serviceType: "Roofing", amount: 100000, date: "2024-01-01", verified: true,
  isDiy: false, homeownerSigned: true, contractorSigned: true, photos: [],
  status: "completed", createdAt: 0,
};

const PROPOSAL: Job = {
  id: "prop1", propertyId: "p1", homeowner: "owner-1", description: "HVAC proposal",
  serviceType: "HVAC", amount: 50000, date: "2024-02-01", verified: false,
  isDiy: false, homeownerSigned: false, contractorSigned: false, photos: [],
  status: "pending", contractor: "c1", createdAt: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  delete (window as any).__e2e_pending_proposals;
  mockGetByProperty.mockResolvedValue([JOB]);
  mockGetPendingProposals.mockResolvedValue([PROPOSAL]);
  mockApproveProposal.mockResolvedValue(undefined);
  mockRejectProposal.mockResolvedValue(undefined);
});

// ── JS.1 ─────────────────────────────────────────────────────────────────────

describe("JS.1 — loading transitions from true to false", () => {
  it("resolves after data is loaded", async () => {
    const { result } = renderHook(() => useJobSummary([PROP], false));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });
});

// ── JS.2 ─────────────────────────────────────────────────────────────────────

describe("JS.2 — allJobs is empty when properties list is empty", () => {
  it("skips getByProperty when no properties exist", async () => {
    const { result } = renderHook(() => useJobSummary([], false));
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    expect(result.current.allJobs).toHaveLength(0);
    expect(mockGetByProperty).not.toHaveBeenCalled();
  });
});

// ── JS.3 ─────────────────────────────────────────────────────────────────────

describe("JS.3 — loads jobs for each property on mount", () => {
  it("populates allJobs with fetched data", async () => {
    const { result } = renderHook(() => useJobSummary([PROP], false));
    await waitFor(() => {
      expect(result.current.allJobs).toHaveLength(1);
    });
    expect(result.current.allJobs[0].id).toBe("j1");
    expect(mockGetByProperty).toHaveBeenCalledWith("p1");
  });
});

// ── JS.4 ─────────────────────────────────────────────────────────────────────

describe("JS.4 — E2E mock: uses window.__e2e_pending_proposals", () => {
  it("skips getPendingProposals and uses the injected list", async () => {
    (window as any).__e2e_pending_proposals = [PROPOSAL];
    const { result } = renderHook(() => useJobSummary([PROP], false));
    await waitFor(() => {
      expect(result.current.pendingProposals).toHaveLength(1);
    });
    expect(mockGetPendingProposals).not.toHaveBeenCalled();
  });
});

// ── JS.5 ─────────────────────────────────────────────────────────────────────

describe("JS.5 — approveProposal removes it from pendingProposals", () => {
  it("removes the approved proposal from state", async () => {
    const { result } = renderHook(() => useJobSummary([PROP], false));
    await waitFor(() => {
      expect(result.current.pendingProposals).toHaveLength(1);
    });
    await act(async () => { await result.current.approveProposal("prop1"); });
    expect(result.current.pendingProposals).toHaveLength(0);
    expect(mockToastSuccess).toHaveBeenCalled();
  });
});

// ── JS.6 ─────────────────────────────────────────────────────────────────────

describe("JS.6 — rejectProposal removes it from pendingProposals", () => {
  it("removes the rejected proposal from state", async () => {
    const { result } = renderHook(() => useJobSummary([PROP], false));
    await waitFor(() => {
      expect(result.current.pendingProposals).toHaveLength(1);
    });
    await act(async () => { await result.current.rejectProposal("prop1"); });
    expect(result.current.pendingProposals).toHaveLength(0);
  });
});

// ── JS.7 ─────────────────────────────────────────────────────────────────────

describe("JS.7 — reload re-fetches jobs", () => {
  it("calls getByProperty again on reload", async () => {
    const { result } = renderHook(() => useJobSummary([PROP], false));
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    await act(async () => { await result.current.reload(); });
    expect(mockGetByProperty).toHaveBeenCalledTimes(2);
  });
});
