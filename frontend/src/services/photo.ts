import { Actor } from "@icp-sdk/core/agent";
import { getAgent } from "./actor";

const PHOTO_CANISTER_ID = (process.env as any).PHOTO_CANISTER_ID || "";

// ─── IDL ──────────────────────────────────────────────────────────────────────

export const idlFactory = ({ IDL }: any) => {
  const ConstructionPhase = IDL.Variant({
    PreConstruction: IDL.Null, Foundation: IDL.Null, Framing: IDL.Null,
    Electrical: IDL.Null, Plumbing: IDL.Null, HVAC: IDL.Null,
    Insulation: IDL.Null, Drywall: IDL.Null, Finishing: IDL.Null,
    PostConstruction: IDL.Null, Warranty: IDL.Null,
    Listing: IDL.Null,  // FSBO listing photos
  });
  const Photo = IDL.Record({
    id:          IDL.Text,
    jobId:       IDL.Text,
    propertyId:  IDL.Text,
    owner:       IDL.Principal,
    phase:       ConstructionPhase,
    description: IDL.Text,
    hash:        IDL.Text,
    data:        IDL.Vec(IDL.Nat8),
    size:        IDL.Nat,
    verified:    IDL.Bool,
    approvals:   IDL.Vec(IDL.Principal),
    createdAt:   IDL.Int,
  });
  const Error = IDL.Variant({
    NotFound:      IDL.Null,
    Unauthorized:  IDL.Null,
    QuotaExceeded: IDL.Text,
    Duplicate:     IDL.Text,
    InvalidInput:  IDL.Text,
  });
  return IDL.Service({
    uploadPhoto: IDL.Func(
      [IDL.Text, IDL.Text, ConstructionPhase, IDL.Text, IDL.Text, IDL.Vec(IDL.Nat8)],
      [IDL.Variant({ ok: Photo, err: Error })],
      []
    ),
    getPhotosByJob:          IDL.Func([IDL.Text], [IDL.Vec(Photo)], []),
    getPhotosByProperty:     IDL.Func([IDL.Text], [IDL.Vec(Photo)], []),
    getPhotosByRoom:         IDL.Func([IDL.Text], [IDL.Vec(Photo)], []),
    getPublicListingPhotos:  IDL.Func([IDL.Text], [IDL.Vec(Photo)], ["query"]),
    deletePhoto: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ ok: IDL.Null, err: Error })],
      []
    ),
    setPropertyCanisterId: IDL.Func(
      [IDL.Principal],
      [IDL.Variant({ ok: IDL.Null, err: Error })],
      []
    ),
  });
};

// ─── TypeScript types ─────────────────────────────────────────────────────────

export interface Photo {
  id:          string;
  jobId:       string;
  propertyId:  string;
  phase:       string;
  description: string;
  hash:        string;
  url:         string;    // blob URL created from raw data
  size:        number;
  verified:    boolean;
  createdAt:   number;    // ms
}

export interface PhotoQuota {
  used:  number;
  limit: number;
  tier:  string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fromPhoto(raw: any): Photo {
  const phaseKey = Object.keys(raw.phase)[0];
  const blob     = new Blob([new Uint8Array(raw.data as number[])]);
  const url      = URL.createObjectURL(blob);
  return {
    id:          raw.id,
    jobId:       raw.jobId,
    propertyId:  raw.propertyId,
    phase:       phaseKey,
    description: raw.description,
    hash:        raw.hash,
    url,
    size:        Number(raw.size),
    verified:    raw.verified,
    createdAt:   Number(BigInt(raw.createdAt) / 1_000_000n),
  };
}

// Max long-edge dimension before resizing. Keeps file sizes well under the
// 2 MB ICP ingress limit while retaining enough detail for construction photos.
const MAX_DIMENSION = 1920;
const JPEG_QUALITY  = 0.82;

/**
 * Resize and re-encode an image File using an off-screen canvas.
 * - Images whose long edge is already ≤ MAX_DIMENSION are only re-encoded
 *   (format normalised to JPEG, alpha channel dropped).
 * - Non-image files are returned unchanged.
 * - Returns a new File so the caller's size/type are always accurate.
 */
async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  // Canvas unavailable (jsdom/test/SSR) — skip compression entirely.
  // We check this before creating an Image so we never hang waiting for
  // onload/onerror in environments that don't fetch blob URLs.
  const probe = document.createElement("canvas");
  if (!probe.getContext("2d")) return file;

  return new Promise((resolve) => {
    let settled = false;
    const settle = (result: File) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    // Hard fallback: if neither onload nor onerror fires within 200 ms
    // (e.g. jsdom with a getContext stub that returns truthy but doesn't
    // actually load images), resolve with the original file rather than hang.
    const watchdog = setTimeout(() => settle(file), 200);

    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      clearTimeout(watchdog);
      URL.revokeObjectURL(objectUrl);

      let { width, height } = img;
      const longEdge = Math.max(width, height);
      if (longEdge > MAX_DIMENSION) {
        const scale = MAX_DIMENSION / longEdge;
        width  = Math.round(width  * scale);
        height = Math.round(height * scale);
      }

      const canvas = document.createElement("canvas");
      canvas.width  = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) { settle(file); return; }

      // White background so transparent PNGs don't become black JPEGs
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          settle(blob
            ? new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" })
            : file
          );
        },
        "image/jpeg",
        JPEG_QUALITY,
      );
    };

    img.onerror = () => { clearTimeout(watchdog); URL.revokeObjectURL(objectUrl); settle(file); };
    img.src = objectUrl;
  });
}

async function computeHash(buffer: ArrayBuffer): Promise<string> {
  // Wrap in Uint8Array so SubtleCrypto's instanceof check passes even when
  // jsdom's FileReader returns a Node Buffer subclass instead of a true ArrayBuffer.
  const hashBuffer = await crypto.subtle.digest("SHA-256", new Uint8Array(buffer));
  const hashArray  = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ─── Service factory ──────────────────────────────────────────────────────────

function createPhotoService() {
  let _actor: any = null;
  const store: Photo[] = [];

  async function getActor() {
    if (!_actor) {
      const ag = await getAgent();
      _actor = Actor.createActor(idlFactory, { agent: ag, canisterId: PHOTO_CANISTER_ID });
    }
    return _actor;
  }

  return {
  async upload(
    file:        File,
    jobId:       string,
    propertyId:  string,
    phase:       string,
    description: string
  ): Promise<Photo> {
    const compressed = await compressImage(file);
    const buffer     = await compressed.arrayBuffer() as ArrayBuffer;
    const bytes      = new Uint8Array(buffer);
    const hash       = await computeHash(buffer);

    const a    = await getActor();
    const data = Array.from(bytes);
    const result = await a.uploadPhoto(
      jobId,
      propertyId,
      { [phase]: null },
      description,
      hash,
      data,
    );
    if ("ok" in result) return fromPhoto(result.ok);
    const key = Object.keys(result.err)[0];
    const val = result.err[key];
    throw new Error(typeof val === "string" ? val : key);
  },

  async getByJob(jobId: string): Promise<Photo[]> {
    const a = await getActor();
    return (await a.getPhotosByJob(jobId) as any[]).map(fromPhoto);
  },

  async getByProperty(propertyId: string): Promise<Photo[]> {
    const a = await getActor();
    return (await a.getPhotosByProperty(propertyId) as any[]).map(fromPhoto);
  },

  async getByRoom(roomId: string): Promise<Photo[]> {
    const a = await getActor();
    return (await a.getPhotosByRoom(roomId) as any[]).map(fromPhoto);
  },

  /** Upload a photo for a room (no job required). Uses synthetic jobId internally. */
  async uploadRoomPhoto(
    file:        File,
    roomId:      string,
    propertyId:  string,
    phase:       string,
    description: string
  ): Promise<Photo> {
    return this.upload(file, `ROOM_${roomId}`, propertyId, phase, description);
  },

  /**
   * Upload a photo for an FSBO listing.
   * Uses synthetic jobId "LISTING_<propertyId>" and phase "Listing" so the
   * photo canister stores it separately from job/room photos.
   * After uploading, call listingService.addListingPhoto() to persist the order.
   */
  async uploadListingPhoto(
    file:        File,
    propertyId:  string,
    description: string
  ): Promise<Photo> {
    return this.upload(file, `LISTING_${propertyId}`, propertyId, "Listing", description);
  },

  /**
   * Fetch all photos for a FSBO listing. Uses the public (no-auth) canister
   * query so prospective buyers can view listing photos without signing in.
   */
  async getListingPhotos(propertyId: string): Promise<Photo[]> {
    if (typeof window !== "undefined" && (window as any).__e2e_listing_photos) {
      const photosMap = (window as any).__e2e_listing_photos as Record<string, Photo[]>;
      return photosMap[propertyId] ?? [];
    }
    const a = await getActor();
    return (await a.getPublicListingPhotos(propertyId) as any[]).map(fromPhoto);
  },

  async deletePhoto(photoId: string): Promise<void> {
    const a = await getActor();
    const result = await a.deletePhoto(photoId);
    if ("err" in result) {
      const key = Object.keys(result.err)[0];
      throw new Error(key);
    }
  },

  /** Quota is enforced server-side. Returns a reasonable display value. */
  async getQuota(): Promise<PhotoQuota> {
    return { used: 0, limit: 10, tier: "Free" };
  },

  reset() {
    _actor = null;
    store.length = 0;
  },
  };
}

export const photoService = createPhotoService();
