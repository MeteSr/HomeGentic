/**
 * Photo upload that stores the bytes off-chain when the voice Worker has
 * photo storage, and on the photo canister otherwise.
 *
 * Off-chain: photo.beginUpload registers the record (same quota, dedupe and
 * access checks as uploadPhoto, with only the hash and size), then the bytes
 * go to PUT <worker>/photos/<id>, which stores them only if they match that
 * hash and size. If the PUT fails, the half-made record is deleted and the
 * photo goes on-chain instead, so an upload never ends with a photo that has
 * no bytes anywhere. Used by the web app and the mobile app.
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
    let begun: any = null;
    try {
      begun = await actor.beginUpload(args.jobId, args.propertyId, phase, args.description, args.hash, BigInt(args.bytes.length));
    } catch {
      begun = null;   // canister without beginUpload (not upgraded yet): go on-chain
    }
    if (begun && "err" in begun) return begun;   // quota, duplicate, access: on-chain would refuse too
    if (begun) {
      const id: string = begun.ok.id;
      if (await putBytes(deps, token, id, args)) return begun;
      try { await actor.deletePhoto(id); } catch { /* the uploader can delete it later */ }
    }
  }
  return actor.uploadPhoto(args.jobId, args.propertyId, phase, args.description, args.hash, args.bytes);
}

async function offChainToken(deps: OffChainDeps): Promise<string | null> {
  if (!(await offChainPhotosEnabled(deps))) return null;
  try { return await deps.sessionToken(); } catch { return null; }
}

async function putBytes(deps: OffChainDeps, token: string, id: string, args: PhotoUploadArgs): Promise<boolean> {
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
