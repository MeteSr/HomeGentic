/**
 * src/photos.ts — off-chain photo bytes in R2, gated by photo.photoAccess.
 *
 * PHOTO.1  bad ids are 404 and a missing PHOTOS binding is 503
 * PHOTO.2  PUT stores bytes only for the uploader, with matching size and hash
 * PHOTO.3  PUT needs a session, an image type and an off-chain record
 * PHOTO.4  GET serves readable photos and hides the rest behind one 404
 * PHOTO.5  GET caches access briefly and answers If-None-Match with 304
 * PHOTO.6  DELETE drops bytes only once the record is gone
 * PHOTO.7  an unreachable canister fails closed (503)
 */

import { describe, it, expect, jest } from "@jest/globals";
import { createHash } from "node:crypto";
import { handlePhotos, ACCESS_CACHE_TTL_SECONDS, ANONYMOUS_PRINCIPAL, type PhotoDeps } from "../src/photos";
import type { PhotoAccess } from "../photoCanister";

const OWNER = "aaaaa-aa";
const OTHER = "rrkah-fqaaa-aaaaa-aaaaq-cai";
const BYTES = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3, 4, 5]);
const HASH  = createHash("sha256").update(BYTES).digest("hex");

function access(over: Partial<PhotoAccess> = {}): PhotoAccess {
  return { owner: OWNER, hash: HASH, size: BYTES.byteLength, offChain: true, isPublic: false, canRead: true, ...over };
}

function fakeEnv(withBucket = true) {
  const kv = new Map<string, string>();
  const puts: Array<{ key: string; ttl?: number }> = [];
  const objects = new Map<string, { bytes: ArrayBuffer; contentType?: string; meta?: Record<string, string> }>();
  const RATE_LIMIT = {
    get: async (k: string) => kv.get(k) ?? null,
    put: async (k: string, v: string, o?: { expirationTtl?: number }) => { kv.set(k, v); puts.push({ key: k, ttl: o?.expirationTtl }); },
  } as unknown as KVNamespace;
  const PHOTOS = {
    get: async (k: string) => {
      const o = objects.get(k);
      return o ? { body: o.bytes, httpMetadata: { contentType: o.contentType } } : null;
    },
    put: async (k: string, bytes: ArrayBuffer, opts: any) => {
      objects.set(k, { bytes, contentType: opts?.httpMetadata?.contentType, meta: opts?.customMetadata });
    },
    delete: async (k: string) => { objects.delete(k); },
  } as unknown as R2Bucket;
  return { env: { RATE_LIMIT, PHOTOS: withBucket ? PHOTOS : undefined }, objects, puts };
}

function deps(caller: string | null, result: PhotoAccess | null | Error) {
  const accessFn = jest.fn(async (_id: string, _reader: string) => {
    if (result instanceof Error) throw result;
    return result;
  });
  const d: PhotoDeps = { principal: async () => caller, access: accessFn };
  return { d, accessFn };
}

const put = (body: Uint8Array = BYTES, type = "image/jpeg") =>
  new Request("https://w/photos/p1", { method: "PUT", body, headers: { "Content-Type": type } });
const get = (headers: Record<string, string> = {}) => new Request("https://w/photos/p1", { headers });
const del = () => new Request("https://w/photos/p1", { method: "DELETE" });

describe("handlePhotos", () => {
  it("PHOTO.1 rejects bad ids and needs the R2 binding", async () => {
    const { env } = fakeEnv();
    const { d, accessFn } = deps(OWNER, access());
    for (const p of ["/photos/", "/photos/a/b", "/photos/" + "x".repeat(65), "/photos/..%2F"]) {
      expect((await handlePhotos(get(), p, env, d)).status).toBe(404);
    }
    const unbound = fakeEnv(false).env;
    expect((await handlePhotos(get(), "/photos/p1", unbound, d)).status).toBe(503);
    expect(accessFn).not.toHaveBeenCalled();
  });

  it("PHOTO.2 stores the uploader's bytes when size and hash match", async () => {
    const { env, objects } = fakeEnv();
    const { d, accessFn } = deps(OWNER, access());
    const res = await handlePhotos(put(), "/photos/p1", env, d);
    expect(res.status).toBe(201);
    expect(accessFn).toHaveBeenCalledWith("p1", OWNER);
    const stored = objects.get("photos/p1")!;
    expect(new Uint8Array(stored.bytes)).toEqual(BYTES);
    expect(stored.contentType).toBe("image/jpeg");
    expect(stored.meta).toEqual({ sha256: HASH, uploader: OWNER });

    const other = deps(OTHER, access()).d;
    expect((await handlePhotos(put(), "/photos/p1", env, other)).status).toBe(403);

    const tampered = new Uint8Array(BYTES); tampered[7] = 9;
    expect((await handlePhotos(put(tampered), "/photos/p1", fakeEnv().env, d)).status).toBe(400);
    expect((await handlePhotos(put(BYTES.slice(1)), "/photos/p1", fakeEnv().env, d)).status).toBe(400);
  });

  it("PHOTO.3 PUT needs a session, an image type and an off-chain record", async () => {
    const { env, objects } = fakeEnv();
    expect((await handlePhotos(put(), "/photos/p1", env, deps(null, access()).d)).status).toBe(401);
    expect((await handlePhotos(put(), "/photos/p1", env, deps("anon", access()).d)).status).toBe(401);
    expect((await handlePhotos(put(BYTES, "text/html"), "/photos/p1", env, deps(OWNER, access()).d)).status).toBe(415);
    expect((await handlePhotos(put(), "/photos/p1", env, deps(OWNER, null).d)).status).toBe(404);
    expect((await handlePhotos(put(), "/photos/p1", env, deps(OWNER, access({ offChain: false })).d)).status).toBe(409);
    expect(objects.size).toBe(0);
  });

  it("PHOTO.4 serves readable photos and hides the rest behind one 404", async () => {
    const { env } = fakeEnv();
    await handlePhotos(put(), "/photos/p1", env, deps(OWNER, access()).d);

    const ok = await handlePhotos(get(), "/photos/p1", env, deps(OWNER, access()).d);
    expect(ok.status).toBe(200);
    expect(new Uint8Array(await ok.arrayBuffer())).toEqual(BYTES);
    expect(ok.headers.get("Content-Type")).toBe("image/jpeg");
    expect(ok.headers.get("Cache-Control")).toBe("private, max-age=86400");
    expect(ok.headers.get("ETag")).toBe(`"${HASH}"`);

    const pub = await handlePhotos(get(), "/photos/p1", fakeEnvWith(env), deps(null, access({ isPublic: true })).d);
    expect(pub.headers.get("Cache-Control")).toContain("public");

    const denied = await handlePhotos(get(), "/photos/p1", fakeEnvWith(env), deps(OTHER, access({ canRead: false })).d);
    const missing = await handlePhotos(get(), "/photos/p1", fakeEnvWith(env), deps(OTHER, null).d);
    expect(denied.status).toBe(404);
    expect(await denied.json()).toEqual(await missing.json());
  });

  it("PHOTO.5 caches access per reader and answers If-None-Match with 304", async () => {
    const { env, puts } = fakeEnv();
    const { d, accessFn } = deps(null, access({ isPublic: true }));
    await handlePhotos(get(), "/photos/p1", env, d);
    await handlePhotos(get(), "/photos/p1", env, d);
    expect(accessFn).toHaveBeenCalledTimes(1);
    expect(accessFn).toHaveBeenCalledWith("p1", ANONYMOUS_PRINCIPAL);
    expect(puts).toContainEqual({ key: `pacc:p1:${ANONYMOUS_PRINCIPAL}`, ttl: ACCESS_CACHE_TTL_SECONDS });

    const res = await handlePhotos(get({ "If-None-Match": `"${HASH}"` }), "/photos/p1", env, d);
    expect(res.status).toBe(304);
  });

  it("PHOTO.6 DELETE drops bytes only once the record is gone", async () => {
    const { env, objects } = fakeEnv();
    await handlePhotos(put(), "/photos/p1", env, deps(OWNER, access()).d);
    expect((await handlePhotos(del(), "/photos/p1", env, deps(OWNER, access()).d)).status).toBe(409);
    expect(objects.size).toBe(1);
    expect((await handlePhotos(del(), "/photos/p1", env, deps(null, null).d)).status).toBe(401);
    expect((await handlePhotos(del(), "/photos/p1", env, deps(OTHER, null).d)).status).toBe(204);
    expect(objects.size).toBe(0);
  });

  it("PHOTO.7 fails closed when the canister can't be reached", async () => {
    const { env } = fakeEnv();
    const { d } = deps(OWNER, new Error("unreachable"));
    expect((await handlePhotos(get(), "/photos/p1", env, d)).status).toBe(503);
    expect((await handlePhotos(put(), "/photos/p1", env, d)).status).toBe(503);
  });
});

/** Same bucket, empty access cache: a fresh reader view of stored bytes. */
function fakeEnvWith(env: { PHOTOS?: R2Bucket }) {
  return { ...fakeEnv().env, PHOTOS: env.PHOTOS };
}
