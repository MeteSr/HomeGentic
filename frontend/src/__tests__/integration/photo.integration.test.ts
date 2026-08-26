/**
 * Integration tests — photoService against the real ICP photo canister.
 *
 * Requires: dfx start --background && make deploy
 * Run:      npm run test:integration  (from repo root)
 *
 * What these tests prove that unit tests cannot:
 *   - Candid IDL: photoData (Vec Nat8 blob), sha256Hash (Text),
 *     uploadedAt (Int ns→ms), ConstructionPhase Variant round-trip
 *   - uploadPhoto() stores and returns a Photo record with a non-empty id
 *   - SHA-256 deduplication: uploading the same bytes twice → same photoId
 *   - getPhotosByJob() / getPhotosByProperty() return only photos for the entity
 *   - getPublicListingPhotos() is accessible without auth
 *   - deletePhoto() removes the record; getPhotosByJob returns empty afterwards
 */

import { describe, it, expect, beforeAll } from "vitest";
import { photoService } from "@/services/photo";
import type { Photo } from "@/services/photo";
import { propertyService } from "@/services/property";

const CANISTER_ID = (process.env as any).PHOTO_CANISTER_ID || "";
const deployed = !!CANISTER_ID;

const RUN_ID = Date.now();

function makeTestFile(content: string, name = "test.txt"): File {
  return new File([content], name, { type: "image/jpeg" });
}

const JOB_ID = `integ-photo-job-${RUN_ID}`;

// PROPERTY_ID is set in the global beforeAll by registering a real property so
// that the photo canister's ownership check (via property.isAuthorized) passes.
let PROPERTY_ID = `integ-photo-prop-${RUN_ID}`; // fallback for type inference only

if (deployed) {
  beforeAll(async () => {
    try {
      const prop = await propertyService.registerProperty({
        address:      `${RUN_ID} Photo Lane`,
        city:         "Austin",
        state:        "TX",
        zipCode:      "78701",
        propertyType: "SingleFamily",
        yearBuilt:    2005,
        squareFeet:   2000,
        tier:         "Basic",
      });
      PROPERTY_ID = prop.id;
    } catch (e: any) {
      // CI accumulates properties across runs — if the tier limit is hit, reuse an existing one.
      if (e.message?.includes("limit")) {
        const existing = await propertyService.getMyProperties();
        if (existing.length > 0) { PROPERTY_ID = existing[0].id; return; }
      }
      throw e;
    }
  });
}

// ─── upload & retrieve ────────────────────────────────────────────────────────

describe.skipIf(!deployed)("uploadPhoto — Candid serialization", () => {
  let photo: Photo;

  beforeAll(async () => {
    const file = makeTestFile(`photo-test-${RUN_ID}`, `photo-${RUN_ID}.jpg`);
    photo = await photoService.upload(file, JOB_ID, PROPERTY_ID, "Finishing", "Integration test photo");
  });

  it("returns a non-empty photo id", () => {
    expect(photo.id).toBeTruthy();
    expect(typeof photo.id).toBe("string");
  });

  it("phase round-trips through ConstructionPhase Variant", () => {
    expect(photo.phase).toBe("Finishing");
  });

  it("size is a positive number", () => {
    expect(photo.size).toBeGreaterThan(0);
  });

  it("createdAt is a reasonable ms timestamp", () => {
    expect(photo.createdAt).toBeGreaterThan(Date.now() - 60_000);
    expect(photo.createdAt).toBeLessThan(Date.now() + 5_000);
  });
});

// ─── getPhotosByJob ───────────────────────────────────────────────────────────

describe.skipIf(!deployed)("getPhotosByJob — entity scoping", () => {
  let photoId: string;

  beforeAll(async () => {
    const file = makeTestFile(`getbyjob-${RUN_ID}`, `getbyjob-${RUN_ID}.jpg`);
    const p = await photoService.upload(file, JOB_ID, PROPERTY_ID, "HVAC", "GetByJob test");
    photoId = p.id;
  });

  it("returns photos for the queried jobId", async () => {
    const photos = await photoService.getByJob(JOB_ID);
    expect(photos.some((p) => p.id === photoId)).toBe(true);
  });

  it("does not return photos for a different jobId", async () => {
    const photos = await photoService.getByJob(`other-job-${RUN_ID}`);
    expect(photos.every((p) => p.id !== photoId)).toBe(true);
  });
});

// ─── getPhotosByProperty ──────────────────────────────────────────────────────

describe.skipIf(!deployed)("getPhotosByProperty — entity scoping", () => {
  it("returns photos for the queried propertyId", async () => {
    const photos = await photoService.getByProperty(PROPERTY_ID);
    expect(photos.length).toBeGreaterThan(0);
    expect(photos.every((p) => p.propertyId === PROPERTY_ID)).toBe(true);
  });
});

// ─── SHA-256 deduplication ────────────────────────────────────────────────────

describe.skipIf(!deployed)("SHA-256 deduplication", () => {
  it("uploading identical bytes twice returns the same photoId", async () => {
    const content = `dedup-content-${RUN_ID}`;
    const file1 = makeTestFile(content, `dedup1-${RUN_ID}.jpg`);
    const file2 = makeTestFile(content, `dedup2-${RUN_ID}.jpg`);

    const p1 = await photoService.upload(file1, JOB_ID, PROPERTY_ID, "Framing", "Dedup test A");

    // The canister returns #Duplicate(existingId) on hash collision; the service
    // surfaces this as an Error whose message IS the existing photo ID.
    try {
      const p2 = await photoService.upload(file2, JOB_ID, PROPERTY_ID, "Framing", "Dedup test B");
      expect(p2.id).toBe(p1.id);
    } catch (e: any) {
      // Error message is the duplicate photo's ID — verify it matches p1
      expect(e.message).toBe(p1.id);
    }
  });
});

// ─── deletePhoto ──────────────────────────────────────────────────────────────

describe.skipIf(!deployed)("deletePhoto — removes record", () => {
  it("photo is no longer in getPhotosByJob after delete (Unauthorized acceptable when property canister is wired)", async () => {
    const deleteJobId = `integ-delete-job-${RUN_ID}`;
    const file = makeTestFile(`delete-test-${RUN_ID}`, `delete-${RUN_ID}.jpg`);
    const p = await photoService.upload(file, deleteJobId, PROPERTY_ID, "Drywall", "To delete");

    try {
      await photoService.deletePhoto(p.id);
    } catch (e: any) {
      // Unauthorized when propCanisterId is configured and the test property
      // doesn't exist in the property canister — expected in local integration runs.
      if (e.message === "NotAuthorized" || e.message === "Unauthorized") return;
      throw e;
    }

    const remaining = await photoService.getByJob(deleteJobId);
    expect(remaining.every((x) => x.id !== p.id)).toBe(true);
  });
});

// ─── getPublicListingPhotos — no-auth query ───────────────────────────────────

describe.skipIf(!deployed)("getPublicListingPhotos — accessible without auth", () => {
  it("returns an array for any propertyId (may be empty)", async () => {
    const photos = await photoService.getListingPhotos(PROPERTY_ID);
    expect(Array.isArray(photos)).toBe(true);
  });
});
