/**
 * Photo upload that stores the bytes off-chain when the voice Worker has
 * photo storage, and on the photo canister otherwise.
 *
 * Off-chain: photo.beginUpload registers the record (same quota, dedupe and
 * access checks as uploadPhoto, with only the hash and size), then the bytes
 * go to PUT <worker>/photos/<id>, which stores them only if they match that
 * hash and size. If the PUT fails, the half-made record is deleted and the
 * upload fails with a retryable #Unavailable: once the Worker stores photos,
 * nothing goes on-chain (part 4 of the off-chain move), so an upload never
 * ends with a photo that has no bytes. Used by the web app and the mobile app.
 */

import { SESSION_HEADER } from "./agentSession";

/** The parts of the photo canister actor this needs. Results are Candid Result variants. */
export interface PhotoUploadActor {
  uploadPhoto(jobId: string, propertyId: string, phase: Record<string, null>, description: string, hash: string, data: Uint8Array): Promise<any>;
  beginUpload(jobId: string, propertyId: string, phase: Record<string, null>, description: string, hash: string, size: bigint): Promise<any>;
  deletePhoto(photoId: string): Promise<any>;
}

export interface OffChainDeps {
  /** Voice Worker base URL, e.g. https://voice.homegentic.app. Empty → always on-chain. */
  workerUrl: string;
  /** The caller's agent session token, or null when there is none. */
  sessionToken: () => Promise<string | null>;
  fetchFn?: typeof fetch;
}

export interface PhotoUploadArgs {
  jobId: string;
  propertyId: string;
  phase: string;
  description: string;
  hash: string;
  bytes: Uint8Array;
  contentType: string;
}

const CONFIG_TTL_MS = 5 * 60_000;
const UPLOAD_UNFINISHED = "The photo didn't finish uploading. Please try again.";
const configCache = new Map<string, { at: number; enabled: Promise<boolean> }>();

/** Whether the Worker stores photos off-chain (GET /photos-config), cached for a few minutes. */
export function offChainPhotosEnabled(deps: OffChainDeps): Promise<boolean> {
  if (!deps.workerUrl) return Promise.resolve(false);
  const hit = configCache.get(deps.workerUrl);
  if (hit && Date.now() - hit.at < CONFIG_TTL_MS) return hit.enabled;
  const fetchFn = deps.fetchFn ?? (typeof fetch === "function" ? fetch : null);
  if (!fetchFn) return Promise.resolve(false);
  const enabled = fetchFn(`${deps.workerUrl}/photos-config`)
    .then(async (res) => res.ok && (await res.json())?.offChain === true)
    .catch(() => false);
  configCache.set(deps.workerUrl, { at: Date.now(), enabled });
  return enabled;
}

/** Test hook: forget the cached /photos-config answers. */
export function resetOffChainPhotoConfig(): void {
  configCache.clear();
}

/**
 * Uploads a photo and returns the canister's Result (`{ ok: PhotoMeta }` or
 * `{ err }`), the same shape uploadPhoto returns.
 */
export async function uploadPhotoPreferOffChain(
  actor: PhotoUploadActor,
  args: PhotoUploadArgs,
  deps: OffChainDeps,
): Promise<any> {
  const phase = { [args.phase]: null };
  const token = await offChainToken(deps);
  if (token) {
    const begun = await actor.beginUpload(args.jobId, args.propertyId, phase, args.description, args.hash, BigInt(args.bytes.length));
    if ("err" in begun) return begun;   // quota, duplicate, access
    const id: string = begun.ok.id;
    if (await putBytes(deps, token, id, args)) return begun;
    try { await actor.deletePhoto(id); } catch { /* the uploader can delete it later; the sweep drops it after 7 days */ }
    return { err: { Unavailable: UPLOAD_UNFINISHED } };
  }
  return actor.uploadPhoto(args.jobId, args.propertyId, phase, args.description, args.hash, args.bytes);
}

/** The parts of the photo canister actor a contractor's waiver upload needs (#716). */
export interface WaiverUploadActor {
  beginWaiverUpload(jobId: string, filename: string, hash: string, size: bigint): Promise<any>;
  uploadWaiver(jobId: string, filename: string, hash: string, data: Uint8Array): Promise<any>;
}

export interface WaiverUploadArgs {
  jobId: string;
  filename: string;
  hash: string;
  bytes: Uint8Array;
  contentType: string;
}

/** What the Worker's PUT /photos stores: images, and PDFs that really are PDFs. */
const OFF_CHAIN_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"]);

/**
 * #716: uploads the final lien waiver of a job the caller signed, as a
 * contractor, into the home's document vault. Images and PDFs go off-chain
 * when the Worker stores photos; anything else goes on-chain. Returns the
 * canister's Result, or `{ putFailed: true }` when the bytes didn't reach the
 * Worker: the contractor can't delete the record (they have no access to the
 * home), so a retry re-sends the bytes to it (beginWaiverUpload answers
 * #Duplicate with its id).
 */
export async function uploadWaiverPreferOffChain(
  actor: WaiverUploadActor,
  args: WaiverUploadArgs,
  deps: OffChainDeps,
): Promise<any> {
  const token = OFF_CHAIN_TYPES.has(args.contentType) ? await offChainToken(deps) : null;
  if (!token) return actor.uploadWaiver(args.jobId, args.filename, args.hash, args.bytes);
  const begun = await actor.beginWaiverUpload(args.jobId, args.filename, args.hash, BigInt(args.bytes.length));
  let id: string;
  if ("ok" in begun) id = begun.ok.id;
  else if (begun.err && typeof begun.err.Duplicate === "string") id = begun.err.Duplicate;
  else return begun;
  const sent = await putBytes(deps, token, id, args);
  return sent ? ("ok" in begun ? begun : { ok: { id } }) : { putFailed: true };
}

async function offChainToken(deps: OffChainDeps): Promise<string | null> {
  if (!(await offChainPhotosEnabled(deps))) return null;
  try { return await deps.sessionToken(); } catch { return null; }
}

async function putBytes(deps: OffChainDeps, token: string, id: string, args: { bytes: Uint8Array; contentType: string }): Promise<boolean> {
  const fetchFn = deps.fetchFn ?? fetch;   // offChainPhotosEnabled already confirmed fetch exists
  try {
    const res = await fetchFn(`${deps.workerUrl}/photos/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": args.contentType, [SESSION_HEADER]: token },
      body: args.bytes as any,
    });
    return res.status === 201;
  } catch {
    return false;
  }
}
