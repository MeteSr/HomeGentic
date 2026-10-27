import { lazyActor } from "./lazyActor";
import { idlFactory } from "@homegentic/shared/declarations/photo";
import { uploadPhotoPreferOffChain, offChainPhotosEnabled, type OffChainDeps } from "@homegentic/shared/photoUpload";
import { getAgentSessionToken, fetchWithAgentSession } from "./agentSession";
export { idlFactory };

const PHOTO_CANISTER_ID = (process.env as any).PHOTO_CANISTER_ID || "";
const VOICE_AGENT_URL   = (import.meta as any).env?.VITE_VOICE_AGENT_URL || "http://localhost:8787";

/** Off-chain photo storage lives behind the voice Worker; without a photo canister there's nothing to store. */
const offChain: OffChainDeps = {
  workerUrl:    PHOTO_CANISTER_ID ? VOICE_AGENT_URL : "",
  sessionToken: getAgentSessionToken,
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

/**
 * `raw` is a PhotoMeta record; `bytes` are the image bytes fetched separately,
 * or `url` points at them when they're stored off-chain.
 */
function fromPhoto(raw: any, bytes: Uint8Array | number[] | undefined, offChainUrl = ""): Photo {
  const phaseKey = Object.keys(raw.phase)[0];
  const url      = bytes && bytes.length > 0 ? URL.createObjectURL(new Blob([new Uint8Array(bytes)])) : offChainUrl;
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
const MAX_DIMENSION  = 1920;
const JPEG_QUALITY   = 0.82;
const QUALITY_FLOOR  = 0.70;  // minimum quality for second-pass re-encode
const MAX_BYTES      = 200_000; // 200 KB ceiling for standard photos
const MAX_BYTES_CONSTRUCTION = 300_000; // 300 KB for construction-phase shots

const CONSTRUCTION_PHASES = new Set([
  "PreConstruction", "Foundation", "Framing", "Electrical",
  "Plumbing", "HVAC", "Insulation", "Drywall", "Finishing",
  "PostConstruction", "Warranty",
]);

/**
 * Resize and re-encode an image File using an off-screen canvas.
 * - Images whose long edge is already ≤ MAX_DIMENSION are only re-encoded
 *   (format normalised to JPEG, alpha channel dropped).
 * - Non-image files are returned unchanged.
 * - Returns a new File so the caller's size/type are always accurate.
 */
async function compressImage(file: File, phase?: string): Promise<File> {
  const maxBytes = phase && CONSTRUCTION_PHASES.has(phase) ? MAX_BYTES_CONSTRUCTION : MAX_BYTES;
  if (!file.type.startsWith("image/")) return file;

  // Canvas unavailable (jsdom/test/SSR/Node) — skip compression entirely.
  // We check this before creating an Image so we never hang waiting for
  // onload/onerror in environments that don't fetch blob URLs.
  if (typeof document === "undefined") return file;
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

      const name = file.name.replace(/\.[^.]+$/, ".jpg");
      canvas.toBlob(
        (blob) => {
          if (!blob) { settle(file); return; }
          if (blob.size <= maxBytes) {
            settle(new File([blob], name, { type: "image/jpeg" }));
            return;
          }
          // Second pass at lower quality to hit the size target.
          canvas.toBlob(
            (blob2) => settle(
              blob2
                ? new File([blob2], name, { type: "image/jpeg" })
                : new File([blob],  name, { type: "image/jpeg" })
            ),
            "image/jpeg",
            QUALITY_FLOOR,
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

/** Off-chain photo bytes the signed-in user may see, as a blob URL ("" when they can't be loaded). */
async function privateOffChainUrl(id: string): Promise<string> {
  try {
    const res = await fetchWithAgentSession(`${VOICE_AGENT_URL}/photos/${encodeURIComponent(id)}`, { method: "GET" });
    return res.ok ? URL.createObjectURL(await res.blob()) : "";
  } catch {
    return "";
  }
}

/** Listing photos are public, so the browser can load and cache them straight from the Worker. */
async function publicOffChainUrl(id: string): Promise<string> {
  return `${VOICE_AGENT_URL}/photos/${encodeURIComponent(id)}`;
}

/**
 * List endpoints return metadata only; bytes come from a batch call that
 * returns as many photos as fit in one reply. Keep asking for the ids it left
 * out until every photo is loaded or a call makes no progress. Off-chain
 * photos come back from the batch with empty bytes; those load from the
 * Worker through `offChainUrl`.
 */
async function withBytes(
  metas: any[],
  fetchBatch: (ids: string[]) => Promise<Array<[string, Uint8Array | number[]]>>,
  offChainUrl: (id: string) => Promise<string> = privateOffChainUrl,
): Promise<Photo[]> {
  const bytesById = new Map<string, Uint8Array | number[]>();
  let pending = metas.map((m) => m.id as string);
  while (pending.length > 0) {
    const got = await fetchBatch(pending);
    if (got.length === 0) break;
    for (const [id, data] of got) bytesById.set(id, data);
    pending = pending.filter((id) => !bytesById.has(id));
  }
  return Promise.all(metas.map(async (m) => {
    const bytes = bytesById.get(m.id);
    const offChainStored = bytes !== undefined && bytes.length === 0 && Number(m.size) > 0;
    return fromPhoto(m, bytes, offChainStored ? await offChainUrl(m.id) : "");
  }));
}

// ─── Service factory ──────────────────────────────────────────────────────────

function createPhotoService() {
  const store: Photo[] = [];

  const getActor = lazyActor(idlFactory, PHOTO_CANISTER_ID);

  return {
  async upload(
    file:        File,
    jobId:       string,
    propertyId:  string,
    phase:       string,
    description: string
  ): Promise<Photo> {
    const compressed = await compressImage(file, phase);
    const buffer     = await compressed.arrayBuffer() as ArrayBuffer;
    const bytes      = new Uint8Array(buffer);
    const hash       = await computeHash(buffer);

    const a      = await getActor();
    const result = await uploadPhotoPreferOffChain(
      a,
      { jobId, propertyId, phase, description, hash, bytes, contentType: compressed.type || "image/jpeg" },
      offChain,
    );
    if ("ok" in result) return fromPhoto(result.ok, bytes);
    const key = Object.keys(result.err)[0];
    const val = result.err[key];
    throw new Error(typeof val === "string" ? val : key);
  },

  async getByJob(jobId: string): Promise<Photo[]> {
    if (typeof window !== "undefined" && (window as any).__e2e_baseline_photos) {
      const photosMap = (window as any).__e2e_baseline_photos as Record<string, Photo[]>;
      if (jobId in photosMap) return photosMap[jobId] ?? [];
    }
    const a = await getActor();
    return withBytes(await a.getPhotosByJob(jobId), (ids) => a.getPhotoDataBatch(ids));
  },

  async getByProperty(propertyId: string): Promise<Photo[]> {
    const a = await getActor();
    return withBytes(await a.getPhotosByProperty(propertyId), (ids) => a.getPhotoDataBatch(ids));
  },

  async getByRoom(roomId: string): Promise<Photo[]> {
    const a = await getActor();
    return withBytes(await a.getPhotosByRoom(roomId), (ids) => a.getPhotoDataBatch(ids));
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
    return withBytes(await a.getPublicListingPhotos(propertyId), (ids) => a.getListingPhotoDataBatch(ids), publicOffChainUrl);
  },

  async deletePhoto(photoId: string): Promise<void> {
    const a = await getActor();
    const result = await a.deletePhoto(photoId);
    if ("err" in result) {
      const key = Object.keys(result.err)[0];
      throw new Error(key);
    }
    // Drop off-chain bytes too; the Worker only allows this once the record
    // is gone. Best effort: a later sweep removes anything left behind.
    if (await offChainPhotosEnabled(offChain)) {
      fetchWithAgentSession(`${VOICE_AGENT_URL}/photos/${encodeURIComponent(photoId)}`, { method: "DELETE" }).catch(() => {});
    }
  },

  /** Quota is enforced server-side. Returns a reasonable display value. */
  async getQuota(): Promise<PhotoQuota> {
    return { used: 0, limit: 10, tier: "Free" };
  },

  reset() {
    getActor.reset();
    store.length = 0;
  },
  };
}

export const photoService = createPhotoService();
