/**
 * Unit tests — useNeighborhoodScore
 *
 * NS.1  Initial state: all null values, loading=false
 * NS.2  Does NOT run when principalText is null
 * NS.3  Does NOT run when jobs array is empty
 * NS.4  Does NOT run when zipCode is empty
 * NS.5  Sets error when submitScore throws
 * NS.6  Sets myScore, myGrade, and zipStats on success
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const mockSubmitScore             = vi.fn();
const mockGetZipStats             = vi.fn();
const mockGetNeighborhoodPublicKey = vi.fn();
const mockGetMyScoreEncrypted     = vi.fn();

vi.mock("@/services/market", () => ({
  submitScore:               (...a: any[]) => mockSubmitScore(...a),
  getZipStats:               (...a: any[]) => mockGetZipStats(...a),
  getNeighborhoodPublicKey:  (...a: any[]) => mockGetNeighborhoodPublicKey(...a),
  getMyScoreEncrypted:       (...a: any[]) => mockGetMyScoreEncrypted(...a),
}));

// Stub vetkeys — not testable in jsdom
vi.mock("@dfinity/vetkeys", () => ({
  TransportSecretKey: {
    random: () => ({
      publicKeyBytes: () => new Uint8Array(32),
    }),
  },
  DerivedPublicKey: { deserialize: () => ({}) },
  EncryptedVetKey:  { deserialize: () => ({ decryptAndVerify: vi.fn() }) },
}));

vi.mock("@icp-sdk/core/principal", () => ({
  Principal: { fromText: () => ({ toUint8Array: () => new Uint8Array(29) }) },
}));

import { useNeighborhoodScore } from "@/hooks/useNeighborhoodScore";
import type { JobSummary } from "@/services/market";

const JOB_SUMMARY: JobSummary = {
  serviceType: "HVAC", completedYear: 2024, amountCents: 25000, isDiy: false, isVerified: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockSubmitScore.mockResolvedValue(undefined);
  mockGetNeighborhoodPublicKey.mockResolvedValue(new Uint8Array(32));
  mockGetMyScoreEncrypted.mockResolvedValue({
    encryptedKey: new Uint8Array(64), score: 78, zipCode: "78701", updatedAt: BigInt(0),
  });
  mockGetZipStats.mockResolvedValue({
    zipCode: "78701", mean: 72, median: 70, sampleSize: 15, grade: "B",
  });
});

// ── NS.1 ─────────────────────────────────────────────────────────────────────

describe("NS.1 — initial state: all null, loading=false", () => {
  it("returns null values and false loading before any effect", () => {
    const { result } = renderHook(() =>
      useNeighborhoodScore([], 2000, "78701", null)
    );
    expect(result.current.myScore).toBeNull();
    expect(result.current.myGrade).toBeNull();
    expect(result.current.zipStats).toBeNull();
    expect(result.current.percentile).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });
});

// ── NS.2 ─────────────────────────────────────────────────────────────────────

describe("NS.2 — does not run when principalText is null", () => {
  it("never calls submitScore with null principal", () => {
    renderHook(() => useNeighborhoodScore([JOB_SUMMARY], 2000, "78701", null));
    expect(mockSubmitScore).not.toHaveBeenCalled();
  });
});

// ── NS.3 ─────────────────────────────────────────────────────────────────────

describe("NS.3 — does not run when jobs array is empty", () => {
  it("never calls submitScore with empty jobs", () => {
    renderHook(() => useNeighborhoodScore([], 2000, "78701", "abc-def-123"));
    expect(mockSubmitScore).not.toHaveBeenCalled();
  });
});

// ── NS.4 ─────────────────────────────────────────────────────────────────────

describe("NS.4 — does not run when zipCode is empty", () => {
  it("never calls submitScore with empty zip", () => {
    renderHook(() => useNeighborhoodScore([JOB_SUMMARY], 2000, "", "abc-def-123"));
    expect(mockSubmitScore).not.toHaveBeenCalled();
  });
});

// ── NS.5 ─────────────────────────────────────────────────────────────────────

describe("NS.5 — sets error when submitScore throws", () => {
  it("populates error state with the thrown message", async () => {
    mockSubmitScore.mockRejectedValueOnce(new Error("canister unavailable"));
    const { result } = renderHook(() =>
      useNeighborhoodScore([JOB_SUMMARY], 2000, "78701", "abc-def-123")
    );
    await waitFor(() => {
      expect(result.current.error).toBe("canister unavailable");
    });
    expect(result.current.loading).toBe(false);
  });
});

// ── NS.6 ─────────────────────────────────────────────────────────────────────

describe("NS.6 — sets myScore, myGrade, and zipStats on success", () => {
  it("populates all result fields after the full flow completes", async () => {
    const { result } = renderHook(() =>
      useNeighborhoodScore([JOB_SUMMARY], 2000, "78701", "abc-def-123")
    );
    await waitFor(() => {
      expect(result.current.myScore).toBe(78);
    });
    expect(result.current.myGrade).toBe("C");  // 78 >= 65 but < 80 → "C"
    expect(result.current.zipStats).toMatchObject({ mean: 72, median: 70, sampleSize: 15 });
    expect(result.current.percentile).not.toBeNull();
    expect(result.current.loading).toBe(false);
  });
});
