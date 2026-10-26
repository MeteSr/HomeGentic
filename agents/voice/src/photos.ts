/**
 * Off-chain photo bytes, kept in a PhotoStore (R2 in production).
 *
 * The photo canister keeps each photo's record, its SHA-256 and the access
 * rules; only the bytes live here. Flow:
 *   1. the app calls photo.beginUpload(…, hash, size) → a photo id
 *   2. PUT /photos/<id> with the bytes and x-agent-session: stored only when
 *      the caller uploaded that photo and the bytes are `size` bytes hashing
 *      to `hash`, so R2 always holds exactly what the canister approved
 *   3. GET /photos/<id>: served when photoAccess says the reader may see it
 *      (listing photos are public)
 *   4. DELETE /photos/<id>: after photo.deletePhoto, drops the bytes; refused
 *      while the canister still has the photo
 *
 * These routes sit outside /api/, so the 30/min global limit (a gallery
 * loads dozens of photos) and the x-api-key check don't apply; they have
 * their own per-IP and per-principal limits. Bytes go through the injected
 * PhotoStore (photoStore.ts), so nothing here depends on R2; with no store
 * configured every route answers 503.
 */

import { hitCounter, type KVEnv } from "./rateLimiter";
import type { PhotoAccess } from "../photoCanister";
import type { PhotoStore } from "./photoStore";

export interface PhotoDeps {
  /** Byte storage; null when none is configured. */
  store: PhotoStore | null;
  /** The verified caller from x-agent-session, "anon"/null when none. */
  principal: () => Promise<string | null>;
  /** photo.photoAccess (null = no such photo). */
  access: (photoId: string, reader: string) => Promise<PhotoAccess | null>;
}

export const ANONYMOUS_PRINCIPAL = "2vxsx-fae";
export const PHOTO_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
/** Matches MAX_PHOTO_BYTES in backend/photo/main.mo. */
export const MAX_PHOTO_BYTES = 1_500_000;
export const ACCESS_CACHE_TTL_SECONDS = 60;
export const READS_PER_MINUTE_PER_IP = 600;
export const WRITES_PER_MINUTE_PER_PRINCIPAL = 30;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

const objectKey = (id: string) => `photos/${id}`;

function reply(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** photoAccess for a read, cached briefly per (photo, reader) so a gallery costs one query per photo. */
async function cachedAccess(env: KVEnv, deps: PhotoDeps, id: string, reader: string): Promise<PhotoAccess | null> {
  const key = `pacc:${id}:${reader}`;
  const hit = await env.RATE_LIMIT.get(key);
  if (hit) return hit === "none" ? null : JSON.parse(hit) as PhotoAccess;
  const access = await deps.access(id, reader);
  await env.RATE_LIMIT.put(key, access ? JSON.stringify(access) : "none", { expirationTtl: ACCESS_CACHE_TTL_SECONDS });
  return access;
}

export async function handlePhotos(request: Request, path: string, env: KVEnv, deps: PhotoDeps): Promise<Response> {
  const id = path.slice("/photos/".length);
  if (!PHOTO_ID_RE.test(id)) return reply(404, { error: "not_found" });
  const store = deps.store;
  if (!store) return reply(503, { error: "photo_storage_not_configured" });

  const minute = Math.floor(Date.now() / 60_000);
  try {
    switch (request.method) {
      case "GET":    return await getPhoto(request, id, env, deps, store, minute);
      case "PUT":    return await putPhoto(request, id, env, deps, store, minute);
      case "DELETE": return await deletePhoto(id, env, deps, store, minute);
      default:       return reply(405, { error: "method_not_allowed" }, { Allow: "GET, PUT, DELETE" });
    }
  } catch {
    // Canister unreachable: fail closed.
    return reply(503, { error: "photo_access_unavailable" });
  }
}

async function getPhoto(request: Request, id: string, env: KVEnv, deps: PhotoDeps, store: PhotoStore, minute: number): Promise<Response> {
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  if (!(await hitCounter(env, `photo-read:${ip}:${minute}`, READS_PER_MINUTE_PER_IP, 60)).allowed) {
    return reply(429, { error: "too_many_requests" });
  }
  const caller = await deps.principal();
  const reader = caller && caller !== "anon" ? caller : ANONYMOUS_PRINCIPAL;
  const access = await cachedAccess(env, deps, id, reader);
  // Same answer for "missing" and "not yours", so ids can't be probed.
  if (!access || !access.canRead) return reply(404, { error: "not_found" });
  // Bytes still on-chain: the client reads them with getPhotoDataBatch.
  if (!access.offChain) return reply(404, { error: "not_off_chain" });

  const etag = `"${access.hash}"`;
  const cacheControl = access.isPublic ? "public, max-age=31536000, immutable" : "private, max-age=86400";
  if (request.headers.get("If-None-Match") === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": cacheControl } });
  }
  const obj = await store.get(objectKey(id));
  if (!obj) return reply(404, { error: "not_uploaded" });
  return new Response(obj.body, {
    headers: {
      "Content-Type": obj.contentType ?? "application/octet-stream",
      "Cache-Control": cacheControl,
      ETag: etag,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function putPhoto(request: Request, id: string, env: KVEnv, deps: PhotoDeps, store: PhotoStore, minute: number): Promise<Response> {
  const caller = await deps.principal();
  if (!caller || caller === "anon") return reply(401, { error: "session_required" });
  if (!(await hitCounter(env, `photo-write:${caller}:${minute}`, WRITES_PER_MINUTE_PER_PRINCIPAL, 60)).allowed) {
    return reply(429, { error: "too_many_requests" });
  }
  const contentType = (request.headers.get("Content-Type") ?? "").split(";")[0].trim().toLowerCase();
  if (!IMAGE_TYPES.has(contentType)) return reply(415, { error: "unsupported_type" });
  const declared = Number(request.headers.get("Content-Length") ?? "0");
  if (declared > MAX_PHOTO_BYTES) return reply(413, { error: "too_large" });

  const access = await deps.access(id, caller);  // fresh, never cached: this authorises a write
  if (!access) return reply(404, { error: "not_found" });
  if (access.owner !== caller) return reply(403, { error: "not_uploader" });
  if (!access.offChain) return reply(409, { error: "not_off_chain" });

  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > MAX_PHOTO_BYTES) return reply(413, { error: "too_large" });
  if (bytes.byteLength !== access.size) return reply(400, { error: "size_mismatch" });
  if ((await sha256Hex(bytes)) !== access.hash) return reply(400, { error: "hash_mismatch" });

  // The same id always holds the same bytes, so a retried PUT is harmless.
  await store.put(objectKey(id), bytes, { contentType, sha256: access.hash, uploader: caller });
  return reply(201, { ok: true });
}

async function deletePhoto(id: string, env: KVEnv, deps: PhotoDeps, store: PhotoStore, minute: number): Promise<Response> {
  const caller = await deps.principal();
  if (!caller || caller === "anon") return reply(401, { error: "session_required" });
  if (!(await hitCounter(env, `photo-write:${caller}:${minute}`, WRITES_PER_MINUTE_PER_PRINCIPAL, 60)).allowed) {
    return reply(429, { error: "too_many_requests" });
  }
  // Only bytes whose record is gone may be dropped, so anyone can clean up
  // after a delete but nobody can remove a live photo.
  if (await deps.access(id, caller)) return reply(409, { error: "photo_exists" });
  await store.delete(objectKey(id));
  return new Response(null, { status: 204 });
}
