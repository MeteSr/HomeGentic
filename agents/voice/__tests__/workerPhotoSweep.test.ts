/**
 * src/photoSweep.ts — part 4 of the off-chain photo move: clean up what an
 * interrupted upload, a delete or a migration can leave behind, without
 * losing anything that is still wanted.
 *
 * Stored bytes with no photo record (a delete whose DELETE never reached the
 * Worker, a photo deleted mid-migration):
 * SWEEP.1 bytes whose record is gone are moved to orphans/<id>, not deleted;
 *         bytes whose record exists, and bytes under a day old, stay
 * SWEEP.2 quarantined bytes are deleted only after 30 days
 * SWEEP.3 a page where most bytes look orphaned is left alone (a Worker wired
 *         to the wrong canister must not empty the bucket)
 * SWEEP.4 the listing cursor is saved between runs and starts over at the end
 *
 * Off-chain records whose bytes never arrived (the app closed mid-upload):
 * SWEEP.5 records over 7 days old with no stored bytes are dropped; younger
 *         ones and ones with bytes stay
 * SWEEP.6 a page where too many records look empty is left alone
 * SWEEP.7 a store or canister failure stops the run without dropping anything
 */

import { describe, it, expect, jest } from "@jest/globals";
import {
  sweepStoredOrphans,
  sweepUnuploadedRecords,
  ORPHAN_MIN_AGE_MS,
  QUARANTINE_MS,
  UNUPLOADED_MIN_AGE_MS,
  type SweepCanister,
  type SweepState,
} from "../src/photoSweep";
import type { PhotoStore } from "../src/photoStore";

const NOW = Date.UTC(2026, 10, 11, 12);
const DAY = 86_400_000;

/** A PhotoStore over a Map, with upload times. */
function memStore(seed: Record<string, number> = {}) {
  const objects = new Map<string, { bytes: ArrayBuffer; uploaded: number; contentType?: string }>();
  for (const [k, uploaded] of Object.entries(seed))
    objects.set(k, { bytes: new Uint8Array([1, 2, 3]).buffer, uploaded, contentType: "image/jpeg" });
  const store: PhotoStore = {
    get: async (k) => {
      const o = objects.get(k);
      return o ? { body: o.bytes, contentType: o.contentType } : null;
    },
    put: async (k, bytes, meta) => {
      objects.set(k, { bytes, uploaded: NOW, contentType: meta.contentType });
    },
    delete: async (k) => {
      objects.delete(k);
    },
    head: async (k) => (objects.has(k) ? { uploaded: new Date(objects.get(k)!.uploaded) } : null),
    list: async (prefix, cursor, limit = 1000) => {
      const keys = [...objects.keys()].filter((k) => k.startsWith(prefix)).sort();
      const start = cursor ? keys.findIndex((k) => k > cursor) : 0;
      const page = start < 0 ? [] : keys.slice(start, start + limit);
      const more = start >= 0 && start + limit < keys.length;
      return {
        objects: page.map((key) => ({ key, uploaded: new Date(objects.get(key)!.uploaded) })),
        cursor: more ? page[page.length - 1] : null,
      };
    },
  };
  return { store, objects };
}

function memState(): SweepState & { m: Map<string, string> } {
  const m = new Map<string, string>();
  return {
    m,
    get: async (k) => m.get(k) ?? null,
    put: async (k, v) => {
      m.set(k, v);
    },
  };
}

function canister(
  opts: {
    known?: string[];
    records?: Array<{ id: string; createdAtMs: number }>;
    perPage?: number;
  } = {},
) {
  const known = new Set(opts.known ?? []);
  const records = new Map((opts.records ?? []).map((r) => [r.id, r.createdAtMs]));
  const dropped: string[] = [];
  const c: SweepCanister = {
    known: jest.fn(async (ids: string[]) => ids.filter((id) => known.has(id) || records.has(id))),
    offChainPage: jest.fn(async (after: string | null) => {
      const ids = [...records.keys()].sort().filter((id) => after === null || id > after);
      const per = opts.perPage ?? 500;
      const take = ids.slice(0, per);
      return {
        items: take.map((id) => ({ id, createdAtMs: records.get(id)! })),
        next: ids.length > per ? take[take.length - 1] : null,
      };
    }),
    dropUnuploaded: jest.fn(async (ids: string[]) => {
      let n = 0;
      for (const id of ids) {
        if (records.has(id) && NOW - records.get(id)! > UNUPLOADED_MIN_AGE_MS) {
          records.delete(id);
          dropped.push(id);
          n++;
        }
      }
      return n;
    }),
  };
  return { c, dropped, records };
}

const old = NOW - 2 * ORPHAN_MIN_AGE_MS;

describe("sweepStoredOrphans", () => {
  it("SWEEP.1 quarantines bytes whose record is gone, and only those", async () => {
    const { store, objects } = memStore({ "photos/P1": old, "photos/P2": old, "photos/P3": NOW - 1000 });
    const { c } = canister({ known: ["P1"] });
    const res = await sweepStoredOrphans(store, c, memState(), NOW);
    expect(res).toMatchObject({ checked: 3, quarantined: 1 });
    expect(objects.has("photos/P1")).toBe(true);
    expect(objects.has("photos/P2")).toBe(false);
    expect(objects.has("orphans/P2")).toBe(true);
    expect(objects.has("photos/P3")).toBe(true); // too new: its upload may still be finishing
  });

  it("SWEEP.2 deletes quarantined bytes only after 30 days", async () => {
    const { store, objects } = memStore({ "orphans/OLD": NOW - QUARANTINE_MS - DAY, "orphans/NEW": NOW - DAY });
    const res = await sweepStoredOrphans(store, canister().c, memState(), NOW);
    expect(res.purged).toBe(1);
    expect([...objects.keys()]).toEqual(["orphans/NEW"]);
  });

  it("SWEEP.3 leaves a page alone when most of it looks orphaned", async () => {
    const seed: Record<string, number> = {};
    for (let i = 0; i < 30; i++) seed[`photos/P${String(i).padStart(2, "0")}`] = old;
    const { store, objects } = memStore(seed);
    const res = await sweepStoredOrphans(store, canister({ known: ["P00", "P01"] }).c, memState(), NOW);
    expect(res).toMatchObject({ quarantined: 0, aborted: true });
    expect([...objects.keys()].filter((k) => k.startsWith("photos/"))).toHaveLength(30);
  });

  it("SWEEP.4 saves the cursor between runs and starts over at the end", async () => {
    const { store } = memStore({ "photos/A": old, "photos/B": old, "photos/C": old });
    const state = memState();
    const { c } = canister({ known: ["A", "B", "C"] });
    await sweepStoredOrphans(store, c, state, NOW, { pageSize: 2, maxPages: 1 });
    expect(state.m.get("photo-sweep:stored")).toBe("photos/B");
    await sweepStoredOrphans(store, c, state, NOW, { pageSize: 2, maxPages: 1 });
    expect((c.known as jest.Mock).mock.calls[1][0]).toEqual(["C"]);
    expect(state.m.get("photo-sweep:stored")).toBe("");
  });
});

describe("sweepUnuploadedRecords", () => {
  const stale = NOW - UNUPLOADED_MIN_AGE_MS - DAY;

  it("SWEEP.5 drops records over 7 days old whose bytes never arrived", async () => {
    const { store } = memStore({ "photos/HAS": stale });
    const { c, dropped } = canister({
      records: [
        { id: "EMPTY", createdAtMs: stale },
        { id: "HAS", createdAtMs: stale },
        { id: "FRESH", createdAtMs: NOW - DAY },
        ...Array.from({ length: 10 }, (_, i) => ({ id: `OK${i}`, createdAtMs: stale })),
      ],
    });
    for (let i = 0; i < 10; i++)
      await store.put(`photos/OK${i}`, new ArrayBuffer(1), { contentType: "image/jpeg", sha256: "", uploader: "" });
    const res = await sweepUnuploadedRecords(store, c, memState(), NOW);
    expect(res).toMatchObject({ dropped: 1 });
    expect(dropped).toEqual(["EMPTY"]);
  });

  it("SWEEP.6 leaves a page alone when too many records look empty", async () => {
    const { c, dropped } = canister({
      records: Array.from({ length: 10 }, (_, i) => ({ id: `E${i}`, createdAtMs: stale })),
    });
    const res = await sweepUnuploadedRecords(memStore().store, c, memState(), NOW);
    expect(res).toMatchObject({ dropped: 0, aborted: true });
    expect(dropped).toEqual([]);
    expect(c.dropUnuploaded).not.toHaveBeenCalled();
  });

  it("SWEEP.7 stops on a failure without dropping anything", async () => {
    const { store } = memStore();
    store.head = async () => {
      throw new Error("R2 down");
    };
    const { c } = canister({ records: [{ id: "E1", createdAtMs: stale }] });
    const res = await sweepUnuploadedRecords(store, c, memState(), NOW);
    expect(res).toMatchObject({ dropped: 0, error: "R2 down" });
    expect(c.dropUnuploaded).not.toHaveBeenCalled();

    const broken: SweepCanister = {
      ...c,
      known: async () => {
        throw new Error("canister stopped");
      },
    };
    const { store: s2, objects } = memStore({ "photos/X": old });
    expect(await sweepStoredOrphans(s2, broken, memState(), NOW)).toMatchObject({
      quarantined: 0,
      error: "canister stopped",
    });
    expect(objects.has("photos/X")).toBe(true);
  });
});
