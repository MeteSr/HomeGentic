import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock browser APIs not provided by jsdom ─────────────────────────────────

// URL.createObjectURL is not available in jsdom
const FAKE_BLOB_URL = "blob:http://localhost/fake-object-url";
Object.defineProperty(URL, "createObjectURL", {
  value: vi.fn(() => FAKE_BLOB_URL),
  writable: true,
});

// jsdom does not implement File.prototype.arrayBuffer — polyfill it
if (!File.prototype.arrayBuffer) {
  File.prototype.arrayBuffer = function (): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(this);
    });
  };
}

// ─── Mock external ICP dependencies ──────────────────────────────────────────

vi.mock("@/services/actor", () => ({
  getAgent: vi.fn().mockResolvedValue({}),
}));

vi.mock("@dfinity/agent", () => ({
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
      expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(File));
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

  // ── getByJob (mock path returns empty) ───────────────────────────────────────
  describe("getByJob", () => {
    it("returns an empty array in mock mode", async () => {
      const photos = await photoService.getByJob("any-job");
      expect(photos).toEqual([]);
    });
  });

  // ── getByProperty (mock path returns empty) ──────────────────────────────────
  describe("getByProperty", () => {
    it("returns an empty array in mock mode", async () => {
      const photos = await photoService.getByProperty("any-property");
      expect(photos).toEqual([]);
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
});
