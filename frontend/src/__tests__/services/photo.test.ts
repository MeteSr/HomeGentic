import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock browser APIs not provided by jsdom ─────────────────────────────────

// URL.createObjectURL is not available in jsdom
const FAKE_BLOB_URL = "blob:http://localhost/fake-object-url";
const mockCreateObjectURL = vi.fn(() => FAKE_BLOB_URL);
Object.defineProperty(URL, "createObjectURL", {
  value: mockCreateObjectURL,
  writable: true,
});

// Override File.prototype.arrayBuffer unconditionally.
// jsdom 29's native implementation can return a non-ArrayBuffer type on some
// Linux/CI environments, causing crypto.subtle.digest to reject the argument.
// The FileReader polyfill is reliable across all supported environments.
File.prototype.arrayBuffer = function (): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(this);
  });
};

// ─── Mock external ICP dependencies ──────────────────────────────────────────

vi.mock("@/services/actor", () => ({
  getAgent: vi.fn().mockResolvedValue({}),
}));

vi.mock("@icp-sdk/core/agent", () => ({
  Actor: { createActor: vi.fn(() => ({})) },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { photoService } from "@/services/photo";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeFile(content = "hello world", name = "receipt.jpg", type = "image/jpeg"): File {
  return new File([content], name, { type });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("photoService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    photoService.reset();
  });

  // ── upload (mock path — no PHOTO_CANISTER_ID) ────────────────────────────────
  describe("upload", () => {
    it("returns a Photo with the supplied fields", async () => {
      const file = makeFile("image data", "roof.jpg");
      const photo = await photoService.upload(file, "job-1", "prop-1", "PostConstruction", "Roof photo");
      expect(photo.jobId).toBe("job-1");
      expect(photo.propertyId).toBe("prop-1");
      expect(photo.phase).toBe("PostConstruction");
      expect(photo.description).toBe("Roof photo");
    });

    it("sets verified to false on upload", async () => {
      const photo = await photoService.upload(makeFile(), "j1", "p1", "Finishing", "desc");
      expect(photo.verified).toBe(false);
    });

    it("sets size to the file's byte length", async () => {
      const content = "x".repeat(512);
      const file = makeFile(content);
      const photo = await photoService.upload(file, "j1", "p1", "Framing", "desc");
      expect(photo.size).toBe(file.size);
    });

    it("assigns a non-empty id", async () => {
      const photo = await photoService.upload(makeFile(), "j1", "p1", "HVAC", "desc");
      expect(photo.id).toBeTruthy();
    });

    it("assigns a createdAt close to now", async () => {
      const before = Date.now();
      const photo = await photoService.upload(makeFile(), "j1", "p1", "Plumbing", "desc");
      const after = Date.now();
      expect(photo.createdAt).toBeGreaterThanOrEqual(before);
      expect(photo.createdAt).toBeLessThanOrEqual(after);
    });

    it("computes a 64-character hex SHA-256 hash", async () => {
      const photo = await photoService.upload(makeFile("test content"), "j1", "p1", "Electrical", "desc");
      expect(photo.hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it("computes the same hash for identical file contents", async () => {
      const content = "deterministic content";
      const photo1 = await photoService.upload(makeFile(content), "j1", "p1", "Foundation", "d1");
      const photo2 = await photoService.upload(makeFile(content), "j2", "p2", "Foundation", "d2");
      expect(photo1.hash).toBe(photo2.hash);
    });

    it("computes different hashes for different file contents", async () => {
      const photo1 = await photoService.upload(makeFile("aaa"), "j1", "p1", "Drywall", "d1");
      const photo2 = await photoService.upload(makeFile("bbb"), "j1", "p1", "Drywall", "d2");
      expect(photo1.hash).not.toBe(photo2.hash);
    });

    it("calls URL.createObjectURL to generate a blob URL", async () => {
      const photo = await photoService.upload(makeFile(), "j1", "p1", "Insulation", "desc");
      expect(mockCreateObjectURL).toHaveBeenCalledWith(expect.any(File));
      expect(photo.url).toBe(FAKE_BLOB_URL);
    });

    it("accepts all valid ConstructionPhase values without error", async () => {
      const phases = [
        "PreConstruction", "Foundation", "Framing", "Electrical", "Plumbing",
        "HVAC", "Insulation", "Drywall", "Finishing", "PostConstruction",
      ];
      for (const phase of phases) {
        const photo = await photoService.upload(makeFile(), "j1", "p1", phase, "desc");
        expect(photo.phase).toBe(phase);
      }
    });
  });

  // ── getByJob ─────────────────────────────────────────────────────────────────
  describe("getByJob", () => {
    it("returns an empty array when no photos have been uploaded", async () => {
      expect(await photoService.getByJob("any-job")).toEqual([]);
    });

    it("returns photos uploaded for that jobId", async () => {
      await photoService.upload(makeFile(), "job-1", "p1", "Framing", "desc");
      const photos = await photoService.getByJob("job-1");
      expect(photos).toHaveLength(1);
      expect(photos[0].jobId).toBe("job-1");
    });

    it("does not return photos for a different jobId", async () => {
      await photoService.upload(makeFile(), "job-1", "p1", "Framing", "desc");
      expect(await photoService.getByJob("job-2")).toHaveLength(0);
    });

    it("returns multiple photos for the same job", async () => {
      await photoService.upload(makeFile("a"), "job-1", "p1", "Framing", "first");
      await photoService.upload(makeFile("b"), "job-1", "p1", "Framing", "second");
      expect(await photoService.getByJob("job-1")).toHaveLength(2);
    });
  });

  // ── getByProperty ─────────────────────────────────────────────────────────────
  describe("getByProperty", () => {
    it("returns an empty array when no photos have been uploaded", async () => {
      expect(await photoService.getByProperty("any-property")).toEqual([]);
    });

    it("returns photos uploaded for that propertyId", async () => {
      await photoService.upload(makeFile(), "j1", "prop-A", "Finishing", "desc");
      const photos = await photoService.getByProperty("prop-A");
      expect(photos).toHaveLength(1);
      expect(photos[0].propertyId).toBe("prop-A");
    });

    it("does not return photos for a different property", async () => {
      await photoService.upload(makeFile(), "j1", "prop-A", "Finishing", "desc");
      expect(await photoService.getByProperty("prop-B")).toHaveLength(0);
    });
  });

  // ── getByRoom (1.4.5) ────────────────────────────────────────────────────────
  describe("getByRoom", () => {
    it("returns an empty array when no room photos have been uploaded", async () => {
      expect(await photoService.getByRoom("any-room")).toEqual([]);
    });

    it("returns photos uploaded via uploadRoomPhoto for the matching room", async () => {
      await photoService.uploadRoomPhoto(makeFile(), "room-42", "p1", "PostConstruction", "desc");
      const photos = await photoService.getByRoom("room-42");
      expect(photos).toHaveLength(1);
      expect(photos[0].jobId).toBe("ROOM_room-42");
    });

    it("does not return photos uploaded for a different room", async () => {
      await photoService.uploadRoomPhoto(makeFile(), "room-A", "p1", "PostConstruction", "desc");
      expect(await photoService.getByRoom("room-B")).toHaveLength(0);
    });

    it("returns multiple photos for the same room", async () => {
      await photoService.uploadRoomPhoto(makeFile("a"), "room-1", "p1", "Finishing", "shot 1");
      await photoService.uploadRoomPhoto(makeFile("b"), "room-1", "p1", "Finishing", "shot 2");
      expect(await photoService.getByRoom("room-1")).toHaveLength(2);
    });

    it("does not return job photos with a matching propertyId (different store)", async () => {
      await photoService.upload(makeFile(), "job-99", "p1", "Framing", "job photo");
      expect(await photoService.getByRoom("job-99")).toHaveLength(0);
    });

    it("reset() clears the photo store so getByRoom returns empty again", async () => {
      await photoService.uploadRoomPhoto(makeFile(), "room-X", "p1", "PostConstruction", "desc");
      photoService.reset();
      expect(await photoService.getByRoom("room-X")).toHaveLength(0);
    });
  });

  // ── uploadRoomPhoto ──────────────────────────────────────────────────────────
  describe("uploadRoomPhoto", () => {
    it("stores photo with synthetic ROOM_<roomId> jobId", async () => {
      const file = makeFile("room image", "kitchen.jpg");
      const photo = await photoService.uploadRoomPhoto(file, "room-42", "prop-1", "PostConstruction", "Kitchen wall");
      expect(photo.jobId).toBe("ROOM_room-42");
    });

    it("preserves the supplied propertyId", async () => {
      const photo = await photoService.uploadRoomPhoto(makeFile(), "room-1", "prop-99", "PostConstruction", "desc");
      expect(photo.propertyId).toBe("prop-99");
    });

    it("preserves phase and description", async () => {
      const photo = await photoService.uploadRoomPhoto(makeFile(), "r1", "p1", "Finishing", "Paint color reference");
      expect(photo.phase).toBe("Finishing");
      expect(photo.description).toBe("Paint color reference");
    });

    it("different rooms produce different synthetic jobIds", async () => {
      const a = await photoService.uploadRoomPhoto(makeFile(), "room-A", "p1", "PostConstruction", "d");
      const b = await photoService.uploadRoomPhoto(makeFile(), "room-B", "p1", "PostConstruction", "d");
      expect(a.jobId).not.toBe(b.jobId);
    });
  });

  // ── deletePhoto (mock path is no-op) ────────────────────────────────────────
  describe("deletePhoto", () => {
    it("resolves without throwing in mock mode", async () => {
      await expect(photoService.deletePhoto("any-id")).resolves.toBeUndefined();
    });
  });

  // ── getQuota ─────────────────────────────────────────────────────────────────
  describe("getQuota", () => {
    it("returns Free tier quota", async () => {
      const quota = await photoService.getQuota();
      expect(quota.tier).toBe("Free");
    });

    it("returns used = 0", async () => {
      const quota = await photoService.getQuota();
      expect(quota.used).toBe(0);
    });

    it("returns a positive limit", async () => {
      const quota = await photoService.getQuota();
      expect(quota.limit).toBeGreaterThan(0);
    });
  });

  // ── uploadListingPhoto (issue #114) ──────────────────────────────────────────
  describe("uploadListingPhoto", () => {
    it("stores photo with synthetic LISTING_<propertyId> jobId", async () => {
      const photo = await photoService.uploadListingPhoto(
        makeFile("front image", "front.jpg"),
        "prop-1",
        "Front of house"
      );
      expect(photo.jobId).toBe("LISTING_prop-1");
    });

    it("preserves the supplied propertyId", async () => {
      const photo = await photoService.uploadListingPhoto(makeFile(), "prop-99", "Back yard");
      expect(photo.propertyId).toBe("prop-99");
    });

    it("sets phase to Listing", async () => {
      const photo = await photoService.uploadListingPhoto(makeFile(), "prop-1", "Kitchen");
      expect(photo.phase).toBe("Listing");
    });

    it("preserves the description", async () => {
      const photo = await photoService.uploadListingPhoto(makeFile(), "prop-1", "Master bedroom");
      expect(photo.description).toBe("Master bedroom");
    });
  });

  // ── getListingPhotos (issue #114) ─────────────────────────────────────────────
  describe("getListingPhotos", () => {
    it("returns an empty array when no listing photos uploaded", async () => {
      expect(await photoService.getListingPhotos("any-prop")).toEqual([]);
    });

    it("returns only photos with the LISTING_<propertyId> synthetic jobId", async () => {
      await photoService.uploadListingPhoto(makeFile("a"), "prop-listing", "Photo 1");
      await photoService.uploadListingPhoto(makeFile("b"), "prop-listing", "Photo 2");
      // upload a non-listing photo for the same property — must not appear
      await photoService.upload(makeFile("job img"), "JOB_1", "prop-listing", "Finishing", "Job photo");
      const listingPhotos = await photoService.getListingPhotos("prop-listing");
      expect(listingPhotos).toHaveLength(2);
      expect(listingPhotos.every((p) => p.jobId === "LISTING_prop-listing")).toBe(true);
    });

    it("does not return listing photos for a different property", async () => {
      await photoService.uploadListingPhoto(makeFile(), "prop-A", "Photo");
      expect(await photoService.getListingPhotos("prop-B")).toHaveLength(0);
    });

    it("reset() clears listing photos from the store", async () => {
      await photoService.uploadListingPhoto(makeFile(), "prop-rst", "Photo");
      photoService.reset();
      expect(await photoService.getListingPhotos("prop-rst")).toHaveLength(0);
    });
  });
});
