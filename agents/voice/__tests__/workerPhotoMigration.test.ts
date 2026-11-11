/**
 * src/photoMigration.ts — part 3 of the off-chain photo move: copies photos
 * whose bytes are still on the photo canister into the PhotoStore (R2), then
 * tells the canister, which empties its copy. Runs from the Worker's hourly
 * cron while an admin has photo.setOffChainMigrationEnabled(true).
 *
 * MIG.1 copies each on-chain photo to photos/<id> and confirms it with the
 *       SHA-256 of the bytes it wrote
 * MIG.2 confirms only after reading the object back and hashing it, so a
 *       write that didn't land never empties the canister's copy
 * MIG.3 a photo whose recorded hash doesn't match its bytes is moved under
 *       the bytes' real hash (the canister re-keys it), and counted
 * MIG.4 follows the canister's cursor across pages and stops at the end
 * MIG.5 stops after maxPages, so one cron run stays bounded
 * MIG.6 a store or canister failure leaves photos on-chain (nothing confirmed)
 *       and doesn't throw
 * MIG.7 stores a content type sniffed from the bytes (JPEG, PNG, WebP, HEIC, PDF)
 */

import { describe, it, expect, jest } from "@jest/globals";
import { createHash } from "node:crypto";
import { migratePhotos, sniffContentType, type MigrationCanister, type MigrationPage } from "../src/photoMigration";
import type { PhotoStore } from "../src/photoStore";

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const JPEG = (n: number) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, n, n + 1, n + 2]);

function memStore(opts: { dropWrites?: boolean; failOn?: string } = {}) {
  const objects = new Map<string, { bytes: ArrayBuffer; contentType: string; sha256: string; uploader: string }>();
  const store: PhotoStore = {
    get: async (k) => {
      const o = objects.get(k);
      return o ? { body: o.bytes, contentType: o.contentType } : null;
    },
    put: async (k, bytes, meta) => {
      if (opts.failOn === k) throw new Error("R2 down");
      if (!opts.dropWrites) objects.set(k, { bytes: bytes.slice(0), ...meta });
    },
    delete: async (k) => {
      objects.delete(k);
    },
  };
  return { store, objects };
}

/** A canister holding `photos` on-chain, `perPage` to a page, keyed in id order. */
function fakeCanister(photos: Array<{ id: string; hash?: string; data: Uint8Array }>, perPage = 2) {
  const onChain = new Map(photos.map((p) => [p.id, { hash: p.hash ?? sha(p.data), data: p.data }]));
  const confirmed: Array<[string, string]> = [];
  const page = jest.fn(async (after: string | null): Promise<MigrationPage> => {
    const ids = [...onChain.keys()].sort().filter((id) => after === null || id > after);
    const take = ids.slice(0, perPage);
    return {
      items: take.map((id) => ({ id, hash: onChain.get(id)!.hash, data: onChain.get(id)!.data })),
      next: ids.length > perPage ? take[take.length - 1] : null,
    };
  });
  const confirm = jest.fn(async (moved: Array<[string, string]>) => {
    for (const [id, h] of moved) {
      confirmed.push([id, h]);
      onChain.delete(id);
    }
    return moved.length;
  });
  const canister: MigrationCanister = { page, confirm };
  return { canister, page, confirm, confirmed, onChain };
}

describe("migratePhotos", () => {
  it("MIG.1 copies each on-chain photo and confirms it with the bytes' hash", async () => {
    const { store, objects } = memStore();
    const a = JPEG(1),
      b = JPEG(2);
    const c = fakeCanister([
      { id: "PHOTO_1", data: a },
      { id: "PHOTO_2", data: b },
    ]);
    const res = await migratePhotos(store, c.canister);
    expect(res).toMatchObject({ moved: 2, failed: 0, rehashed: 0, done: true });
    expect(new Uint8Array(objects.get("photos/PHOTO_1")!.bytes)).toEqual(a);
    expect(objects.get("photos/PHOTO_1")).toMatchObject({
      contentType: "image/jpeg",
      sha256: sha(a),
      uploader: "migration",
    });
    expect(c.confirmed).toEqual([
      ["PHOTO_1", sha(a)],
      ["PHOTO_2", sha(b)],
    ]);
  });

  it("MIG.2 never confirms a photo whose write didn't land", async () => {
    const { store } = memStore({ dropWrites: true });
    const c = fakeCanister([{ id: "PHOTO_1", data: JPEG(1) }]);
    const res = await migratePhotos(store, c.canister);
    expect(res).toMatchObject({ moved: 0, failed: 1 });
    expect(c.confirm).not.toHaveBeenCalled();
    expect(c.onChain.has("PHOTO_1")).toBe(true);
  });

  it("MIG.3 moves a photo with a wrong recorded hash under its real hash", async () => {
    const { store, objects } = memStore();
    const bytes = JPEG(3);
    const c = fakeCanister([{ id: "PHOTO_1", hash: "0".repeat(64), data: bytes }]);
    const res = await migratePhotos(store, c.canister);
    expect(res).toMatchObject({ moved: 1, rehashed: 1 });
    expect(c.confirmed).toEqual([["PHOTO_1", sha(bytes)]]);
    expect(objects.get("photos/PHOTO_1")!.sha256).toBe(sha(bytes));
  });

  it("MIG.4 follows the cursor across pages and stops at the end", async () => {
    const { store } = memStore();
    const photos = [1, 2, 3, 4, 5].map((n) => ({ id: `PHOTO_${n}`, data: JPEG(n) }));
    const c = fakeCanister(photos, 2);
    const res = await migratePhotos(store, c.canister);
    expect(res).toMatchObject({ moved: 5, done: true, pages: 3 });
    expect(c.page.mock.calls.map((x) => x[0])).toEqual([null, "PHOTO_2", "PHOTO_4"]);
  });

  it("MIG.5 stops after maxPages so a run stays bounded", async () => {
    const { store } = memStore();
    const photos = [1, 2, 3, 4, 5].map((n) => ({ id: `PHOTO_${n}`, data: JPEG(n) }));
    const c = fakeCanister(photos, 2);
    const res = await migratePhotos(store, c.canister, { maxPages: 1 });
    expect(res).toMatchObject({ moved: 2, done: false, pages: 1 });
    expect(c.onChain.size).toBe(3);
  });

  it("MIG.6 leaves photos on-chain when the store or canister fails", async () => {
    const { store } = memStore({ failOn: "photos/PHOTO_1" });
    const c = fakeCanister([
      { id: "PHOTO_1", data: JPEG(1) },
      { id: "PHOTO_2", data: JPEG(2) },
    ]);
    const res = await migratePhotos(store, c.canister);
    expect(res).toMatchObject({ moved: 1, failed: 1 });
    expect(c.onChain.has("PHOTO_1")).toBe(true);

    const broken: MigrationCanister = {
      page: async () => {
        throw new Error("canister stopped");
      },
      confirm: async () => 0,
    };
    await expect(migratePhotos(memStore().store, broken)).resolves.toMatchObject({
      moved: 0,
      done: false,
      error: "canister stopped",
    });
  });

  it("MIG.7 sniffs the content type from the bytes", () => {
    const b = (...xs: number[]) => new Uint8Array([...xs, 0, 0, 0, 0, 0, 0, 0, 0]);
    const ascii = (s: string) => [...s].map((ch) => ch.charCodeAt(0));
    expect(sniffContentType(b(0xff, 0xd8, 0xff))).toBe("image/jpeg");
    expect(sniffContentType(b(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(sniffContentType(b(...ascii("RIFF"), 1, 2, 3, 4, ...ascii("WEBP")))).toBe("image/webp");
    expect(sniffContentType(b(0, 0, 0, 0x18, ...ascii("ftypheic")))).toBe("image/heic");
    expect(sniffContentType(b(...ascii("%PDF-1.7")))).toBe("application/pdf");
    expect(sniffContentType(b(1, 2, 3))).toBe("application/octet-stream");
  });
});
