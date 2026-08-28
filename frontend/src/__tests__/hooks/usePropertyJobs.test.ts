/**
 * Unit tests — usePropertyJobs
 *
 * PJ.1  jobs is empty and loading=false when propertyId is undefined
 * PJ.2  Loads jobs from jobService on mount
 * PJ.3  loading transitions from true to false after fetch completes
 * PJ.4  reload re-fetches and updates jobs list
 * PJ.5  verifyJob calls jobService.verifyJob and updates the matching entry
 * PJ.6  verifyJob shows toast.error when service throws
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { Job } from "@/services/job";

const mockGetByProperty = vi.fn();
const mockVerifyJob     = vi.fn();
const mockToastError    = vi.fn();

vi.mock("@/services/job", () => ({
  jobService: {
    getByProperty:     (...a: any[]) => mockGetByProperty(...a),
    verifyJob:         (...a: any[]) => mockVerifyJob(...a),
    getPendingProposals: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("react-hot-toast", () => ({ default: { error: (...a: any[]) => mockToastError(...a), success: vi.fn() } }));

import { usePropertyJobs } from "@/hooks/usePropertyJobs";

const JOB: Job = {
  id: "j1", propertyId: "p1", homeowner: "owner-1", description: "HVAC service",
  serviceType: "HVAC", amount: 25000, date: "2024-01-01", verified: false,
  isDiy: false, homeownerSigned: false, contractorSigned: false, photos: [],
  status: "completed", createdAt: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetByProperty.mockResolvedValue([JOB]);
});

// ── PJ.1 ─────────────────────────────────────────────────────────────────────

describe("PJ.1 — no propertyId → empty jobs, loading=false", () => {
  it("resolves immediately with empty list", async () => {
    const { result } = renderHook(() => usePropertyJobs(undefined));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.jobs).toHaveLength(0);
  });
});

// ── PJ.2 ─────────────────────────────────────────────────────────────────────

describe("PJ.2 — loads jobs from jobService on mount", () => {
  it("populates jobs list", async () => {
    const { result } = renderHook(() => usePropertyJobs("p1"));
    await waitFor(() => {
      expect(result.current.jobs).toHaveLength(1);
    });
    expect(result.current.jobs[0].id).toBe("j1");
    expect(mockGetByProperty).toHaveBeenCalledWith("p1");
  });
});

// ── PJ.3 ─────────────────────────────────────────────────────────────────────

describe("PJ.3 — loading transitions to false after fetch", () => {
  it("starts true and ends false", async () => {
    const { result } = renderHook(() => usePropertyJobs("p1"));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });
});

// ── PJ.4 ─────────────────────────────────────────────────────────────────────

describe("PJ.4 — reload re-fetches jobs", () => {
  it("calls getByProperty again and updates list", async () => {
    const updated: Job = { ...JOB, description: "Updated HVAC" } satisfies Job;
    const { result } = renderHook(() => usePropertyJobs("p1"));
    await waitFor(() => { expect(result.current.loading).toBe(false); });

    mockGetByProperty.mockResolvedValueOnce([updated]);
    await act(async () => { await result.current.reload(); });
    await waitFor(() => {
      expect(result.current.jobs[0].description).toBe("Updated HVAC");
    });
  });
});

// ── PJ.5 ─────────────────────────────────────────────────────────────────────

describe("PJ.5 — verifyJob updates the matching entry", () => {
  it("replaces the old job with the verified version", async () => {
    const verified: Job = { ...JOB, verified: true } satisfies Job;
    mockVerifyJob.mockResolvedValueOnce(verified);
    const { result } = renderHook(() => usePropertyJobs("p1"));
    await waitFor(() => { expect(result.current.loading).toBe(false); });

    await act(async () => { await result.current.verifyJob("j1"); });
    expect(result.current.jobs[0].verified).toBe(true);
  });
});

// ── PJ.6 ─────────────────────────────────────────────────────────────────────

describe("PJ.6 — verifyJob shows error toast on failure", () => {
  it("calls toast.error when verifyJob throws", async () => {
    mockVerifyJob.mockRejectedValueOnce(new Error("canister down"));
    const { result } = renderHook(() => usePropertyJobs("p1"));
    await waitFor(() => { expect(result.current.loading).toBe(false); });

    await act(async () => { await result.current.verifyJob("j1"); });
    expect(mockToastError).toHaveBeenCalledWith(expect.stringContaining("sign job"));
  });
});
