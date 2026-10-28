/**
 * src/photos.ts — off-chain photo bytes in a PhotoStore, gated by
 * photo.photoAccess. The store here is r2PhotoStore over a fake bucket, so
 * the R2 adapter is covered too.
 *
 * PHOTO.1  bad ids are 404 and a missing store is 503
 * PHOTO.2  PUT stores bytes only for the uploader, with matching size and hash
 * PHOTO.3  PUT needs a session, an image type and an off-chain record
 * PHOTO.4  GET serves readable photos and hides the rest behind one 404
 * PHOTO.5  GET caches access briefly and answers If-None-Match with 304
 * PHOTO.6  DELETE drops bytes only once the record is gone
 * PHOTO.7  an unreachable canister fails closed (503)
 * PHOTO.8  any PhotoStore implementation works (provider-neutral routes)
 */

import { describe, it, expect, jest } from "@jest/globals";
import { createHash } from "node:crypto";
import { handlePhotos, ACCESS_CACHE_TTL_SECONDS, ANONYMOUS_PRINCIPAL, type PhotoDeps } from "../src/photos";
import { r2PhotoStore, type PhotoStore } from "../src/photoStore";
import type { PhotoAccess } from "../photoCanister";

const OWNER = "aaaaa-aa";
const OTHER = "rrkah-fqaaa-aaaaa-aaaaq-cai";
const BYTES = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3, 4, 5]);
const HASH  = createHash("sha256").update(BYTES).digest("hex");

function access(over: Partial<PhotoAccess> = {}): PhotoAccess {
  return { owner: OWNER, hash: HASH, size: BYTES.byteLength, offChain: true, isPublic: false, canRead: true, ...over };
}

/** Fresh KV (rate limits + access cache). */
function fakeEnv() {
  const kv = new Map<string, string>();
  const puts: Array<{ key: string; ttl?: number }> = [];
  const RATE_LIMIT = {
    get: async (k: string) => kv.get(k) ?? null,
    put: async (k: string, v: string, o?: { expirationTtl?: number }) => { kv.set(k, v); puts.push({ key: k, ttl: o?.expirationTtl }); },
  } as unknown as KVNamespace;
  return { env: { RATE_LIMIT }, puts };
}

/** r2PhotoStore over an in-memory fake bucket. */
function fakeR2() {
  const objects = new Map<string, { bytes: ArrayBuffer; contentType?: string; meta?: Record<string, string> }>();
  const bucket = {
    get: async (k: string) => {
      const o = objects.get(k);
      return o ? { body: o.bytes, httpMetadata: { contentType: o.contentType } } : null;
    },
    put: async (k: string, bytes: ArrayBuffer, opts: any) => {
      objects.set(k, { bytes, contentType: opts?.httpMetadata?.contentType, meta: opts?.customMetadata });
    },
    delete: async (k: string) => { objects.delete(k); },
  } as unknown as R2Bucket;
  return { store: r2PhotoStore(bucket), objects };
}

function deps(store: PhotoStore | null, caller: string | null, result: PhotoAccess | null | Error) {
  const accessFn = jest.fn(async (_id: string, _reader: string) => {
    if (result instanceof Error) throw result;
    return result;
  });
  const d: PhotoDeps = { store, principal: async () => caller, access: accessFn };
  return { d, accessFn };
}

const put = (body: Uint8Array = BYTES, type = "image/jpeg") =>
  new Request("https://w/photos/p1", { method: "PUT", body, headers: { "Content-Type": type } });
const get = (headers: Record<string, string> = {}) => new Request("https://w/photos/p1", { headers });
const del = () => new Request("https://w/photos/p1", { method: "DELETE" });

describe("handlePhotos", () => {
  it("PHOTO.1 rejects bad ids and needs a store", async () => {
    const { env } = fakeEnv();
    const { d, accessFn } = deps(fakeR2().store, OWNER, access());
    for (const p of ["/photos/", "/photos/a/b", "/photos/" + "x".repeat(65), "/photos/..%2F"]) {
      expect((await handlePhotos(get(), p, env, d)).status).toBe(404);
    }
    expect((await handlePhotos(get(), "/photos/p1", env, deps(null, OWNER, access()).d)).status).toBe(503);
    expect(accessFn).not.toHaveBeenCalled();
  });

  it("PHOTO.2 stores the uploader's bytes when size and hash match", async () => {
    const { store, objects } = fakeR2();
    const { d, accessFn } = deps(store, OWNER, access());
    const res = await handlePhotos(put(), "/photos/p1", fakeEnv().env, d);
    expect(res.status).toBe(201);
    expect(accessFn).toHaveBeenCalledWith("p1", OWNER);
    const stored = objects.get("photos/p1")!;
    expect(new Uint8Array(stored.bytes)).toEqual(BYTES);
    expect(stored.contentType).toBe("image/jpeg");
    expect(stored.meta).toEqual({ sha256: HASH, uploader: OWNER });

    expect((await handlePhotos(put(), "/photos/p1", fakeEnv().env, deps(store, OTHER, access()).d)).status).toBe(403);

    const tampered = new Uint8Array(BYTES); tampered[7] = 9;
    expect((await handlePhotos(put(tampered), "/photos/p1", fakeEnv().env, d)).status).toBe(400);
    expect((await handlePhotos(put(BYTES.slice(1)), "/photos/p1", fakeEnv().env, d)).status).toBe(400);
  });

  it("PHOTO.3 PUT needs a session, an image type and an off-chain record", async () => {
    const { env } = fakeEnv();
    const { store, objects } = fakeR2();
    expect((await handlePhotos(put(), "/photos/p1", env, deps(store, null, access()).d)).status).toBe(401);
    expect((await handlePhotos(put(), "/photos/p1", env, deps(store, "anon", access()).d)).status).toBe(401);
    expect((await handlePhotos(put(BYTES, "text/html"), "/photos/p1", env, deps(store, OWNER, access()).d)).status).toBe(415);
    expect((await handlePhotos(put(), "/photos/p1", env, deps(store, OWNER, null).d)).status).toBe(404);
    expect((await handlePhotos(put(), "/photos/p1", env, deps(store, OWNER, access({ offChain: false })).d)).status).toBe(409);
    expect(objects.size).toBe(0);
  });

  it("PHOTO.4 serves readable photos and hides the rest behind one 404", async () => {
    const { store } = fakeR2();
    await handlePhotos(put(), "/photos/p1", fakeEnv().env, deps(store, OWNER, access()).d);

    const ok = await handlePhotos(get(), "/photos/p1", fakeEnv().env, deps(store, OWNER, access()).d);
    expect(ok.status).toBe(200);
    expect(new Uint8Array(await ok.arrayBuffer())).toEqual(BYTES);
    expect(ok.headers.get("Content-Type")).toBe("image/jpeg");
    expect(ok.headers.get("Cache-Control")).toBe("private, no-cache");
    expect(ok.headers.get("ETag")).toBe(`"${HASH}"`);

    const pub = await handlePhotos(get(), "/photos/p1", fakeEnv().env, deps(store, null, access({ isPublic: true })).d);
    expect(pub.headers.get("Cache-Control")).toContain("public");

    const denied  = await handlePhotos(get(), "/photos/p1", fakeEnv().env, deps(store, OTHER, access({ canRead: false })).d);
    const missing = await handlePhotos(get(), "/photos/p1", fakeEnv().env, deps(store, OTHER, null).d);
    expect(denied.status).toBe(404);
    expect(await denied.json()).toEqual(await missing.json());
  });

  it("PHOTO.5 caches access per reader and answers If-None-Match with 304", async () => {
    const { env, puts } = fakeEnv();
    const { d, accessFn } = deps(fakeR2().store, null, access({ isPublic: true }));
    await handlePhotos(get(), "/photos/p1", env, d);
    await handlePhotos(get(), "/photos/p1", env, d);
    expect(accessFn).toHaveBeenCalledTimes(1);
    expect(accessFn).toHaveBeenCalledWith("p1", ANONYMOUS_PRINCIPAL);
    expect(puts).toContainEqual({ key: `pacc:p1:${ANONYMOUS_PRINCIPAL}`, ttl: ACCESS_CACHE_TTL_SECONDS });

    const res = await handlePhotos(get({ "If-None-Match": `"${HASH}"` }), "/photos/p1", env, d);
    expect(res.status).toBe(304);
  });

  it("PHOTO.6 DELETE drops bytes only once the record is gone", async () => {
    const { env } = fakeEnv();
    const { store, objects } = fakeR2();
    await handlePhotos(put(), "/photos/p1", env, deps(store, OWNER, access()).d);
    expect((await handlePhotos(del(), "/photos/p1", env, deps(store, OWNER, access()).d)).status).toBe(409);
    expect(objects.size).toBe(1);
    expect((await handlePhotos(del(), "/photos/p1", env, deps(store, null, null).d)).status).toBe(401);
    expect((await handlePhotos(del(), "/photos/p1", env, deps(store, OTHER, null).d)).status).toBe(204);
    expect(objects.size).toBe(0);
  });

  it("PHOTO.7 fails closed when the canister can't be reached", async () => {
    const { env } = fakeEnv();
    const { d } = deps(fakeR2().store, OWNER, new Error("unreachable"));
    expect((await handlePhotos(get(), "/photos/p1", env, d)).status).toBe(503);
    expect((await handlePhotos(put(), "/photos/p1", env, d)).status).toBe(503);
  });

  it("PHOTO.8 works with any PhotoStore, not just R2", async () => {
    const mem = new Map<string, { bytes: ArrayBuffer; contentType: string }>();
    const store: PhotoStore = {
      get: async (k) => { const o = mem.get(k); return o ? { body: o.bytes, contentType: o.contentType } : null; },
      put: async (k, bytes, meta) => { mem.set(k, { bytes, contentType: meta.contentType }); },
      delete: async (k) => { mem.delete(k); },
    };
    expect((await handlePhotos(put(BYTES, "image/png"), "/photos/p1", fakeEnv().env, deps(store, OWNER, access()).d)).status).toBe(201);
    const res = await handlePhotos(get(), "/photos/p1", fakeEnv().env, deps(store, OWNER, access()).d);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(BYTES);
  });
});
