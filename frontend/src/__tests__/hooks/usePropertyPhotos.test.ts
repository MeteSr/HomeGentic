/**
 * Unit tests — usePropertyPhotos
 *
 * PP.1  photosByJob is empty when propertyId is undefined
 * PP.2  Loads photos from photoService on mount and groups by jobId
 * PP.3  uploadPhoto adds the new photo to the correct jobId bucket
 * PP.4  uploadRoomPhoto adds photo to ROOM_ prefixed key
 * PP.5  uploadPhoto shows toast.error when service throws
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { Photo } from "@/services/photo";

const mockGetByProperty    = vi.fn();
const mockUpload           = vi.fn();
const mockUploadRoomPhoto  = vi.fn();
const mockToastError       = vi.fn();

vi.mock("@/services/photo", () => ({
  photoService: {
    getByProperty:   (...a: any[]) => mockGetByProperty(...a),
    upload:          (...a: any[]) => mockUpload(...a),
    uploadRoomPhoto: (...a: any[]) => mockUploadRoomPhoto(...a),
  },
}));

vi.mock("react-hot-toast", () => ({
  default: { error: (...a: any[]) => mockToastError(...a), success: vi.fn() },
}));

import { usePropertyPhotos } from "@/hooks/usePropertyPhotos";

const PHOTO: Photo = {
  id: "ph1", jobId: "j1", propertyId: "p1", phase: "PostConstruction",
  description: "Job photo", hash: "abc123", url: "blob:photo",
  size: 1024, verified: false, createdAt: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetByProperty.mockResolvedValue([PHOTO]);
});

// ── PP.1 ─────────────────────────────────────────────────────────────────────

describe("PP.1 — photosByJob is empty when propertyId is undefined", () => {
  it("returns empty map immediately", () => {
    const { result } = renderHook(() => usePropertyPhotos(undefined));
    expect(result.current.photosByJob).toEqual({});
  });
});

// ── PP.2 ─────────────────────────────────────────────────────────────────────

describe("PP.2 — loads and groups photos by jobId on mount", () => {
  it("places photo under its jobId key", async () => {
    const { result } = renderHook(() => usePropertyPhotos("p1"));
    await waitFor(() => {
      expect(result.current.photosByJob["j1"]).toHaveLength(1);
    });
    expect(result.current.photosByJob["j1"][0].id).toBe("ph1");
  });
});

// ── PP.3 ─────────────────────────────────────────────────────────────────────

describe("PP.3 — uploadPhoto adds photo to correct bucket", () => {
  it("appends the returned photo to photosByJob", async () => {
    const newPhoto: Photo = { ...PHOTO, id: "ph2", jobId: "j2" } satisfies Photo;
    mockUpload.mockResolvedValueOnce(newPhoto);
    const { result } = renderHook(() => usePropertyPhotos("p1"));
    await waitFor(() => { expect(result.current.photosByJob["j1"]).toHaveLength(1); });

    const file = new File(["bits"], "photo.jpg", { type: "image/jpeg" });
    await act(async () => { await result.current.uploadPhoto("j2", file, "p1"); });
    expect(result.current.photosByJob["j2"]).toHaveLength(1);
    expect(result.current.photosByJob["j2"][0].id).toBe("ph2");
  });
});

// ── PP.4 ─────────────────────────────────────────────────────────────────────

describe("PP.4 — uploadRoomPhoto adds photo to ROOM_ key", () => {
  it("stores the photo under ROOM_<roomId>", async () => {
    const roomPhoto: Photo = { ...PHOTO, id: "ph3", jobId: "ROOM_r1" } satisfies Photo;
    mockUploadRoomPhoto.mockResolvedValueOnce(roomPhoto);
    const { result } = renderHook(() => usePropertyPhotos("p1"));

    const file = new File(["bits"], "room.jpg", { type: "image/jpeg" });
    await act(async () => { await result.current.uploadRoomPhoto("r1", file, "p1"); });
    expect(result.current.photosByJob["ROOM_r1"]).toHaveLength(1);
  });
});

// ── PP.5 ─────────────────────────────────────────────────────────────────────

describe("PP.5 — uploadPhoto shows toast.error on failure", () => {
  it("calls toast.error when service throws", async () => {
    mockUpload.mockRejectedValueOnce(new Error("upload failed"));
    const { result } = renderHook(() => usePropertyPhotos("p1"));

    const file = new File(["bits"], "bad.jpg", { type: "image/jpeg" });
    await act(async () => { await result.current.uploadPhoto("j1", file, "p1"); });
    expect(mockToastError).toHaveBeenCalledWith(expect.stringContaining("upload failed"));
  });
});
