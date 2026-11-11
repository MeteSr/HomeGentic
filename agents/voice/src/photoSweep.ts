/**
 * Part 4 of the off-chain photo move: the hourly orphan sweep. Two kinds of
 * leftovers, each cleaned so that nothing still wanted can be lost:
 *
 * Stored bytes with no photo record (the app's DELETE /photos/<id> never
 * arrived, or a photo was deleted while the migration was copying it). They
 * are moved to orphans/<id>, not deleted, and deleted from there after 30
 * days, so a mistake can be undone by copying them back.
 *
 * Off-chain records whose bytes never arrived (the app closed between
 * photo.beginUpload and the PUT). After 7 days photo.dropUnuploadedPhotos
 * deletes them, which also frees their quota and lets the same image be
 * uploaded again. The canister refuses anything younger or with bytes.
 *
 * Both stop and leave a page alone when it looks wrong: if most of a page of
 * stored bytes has no record, or many records have no bytes, the Worker is
 * more likely wired to the wrong canister or bucket than looking at real
 * orphans.
 */

import type { PhotoStore } from "./photoStore";

export interface SweepCanister {
  /** Which of `ids` still have a photo record (photo.knownPhotoIds). */
  known(ids: string[]): Promise<string[]>;
  /** Off-chain photo records after `after`, with creation time (photo.offChainPhotoPage). */
  offChainPage(
    after: string | null,
  ): Promise<{ items: Array<{ id: string; createdAtMs: number }>; next: string | null }>;
  /** Drops records whose bytes never arrived (photo.dropUnuploadedPhotos); returns how many. */
  dropUnuploaded(ids: string[]): Promise<number>;
}

/** Where the sweep keeps its place between runs (the Worker's KV). */
export interface SweepState {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

const HOUR = 3_600_000;
/** Bytes this new may belong to an upload still finishing, or a migration not yet confirmed. */
export const ORPHAN_MIN_AGE_MS = 24 * HOUR;
/** How long quarantined bytes are kept before they are deleted. */
export const QUARANTINE_MS = 30 * 24 * HOUR;
/** Matches UNUPLOADED_MIN_AGE_NS in backend/photo/main.mo. */
export const UNUPLOADED_MIN_AGE_MS = 7 * 24 * HOUR;
/** A page with at least this many candidates is judged by its share of orphans. */
const GUARD_MIN = 20;
const STORED_GUARD_SHARE = 0.5;
const RECORD_GUARD_MIN = 5;
const RECORD_GUARD_SHARE = 0.2;

const PHOTOS = "photos/";
const ORPHANS = "orphans/";
const STORED_CURSOR = "photo-sweep:stored";
const RECORD_CURSOR = "photo-sweep:records";

export interface StoredSweepResult {
  checked: number;
  quarantined: number;
  purged: number;
  aborted?: boolean;
  error?: string;
}
export interface RecordSweepResult {
  checked: number;
  missing: number;
  dropped: number;
  aborted?: boolean;
  error?: string;
}

const message = (err: unknown) => (err as Error)?.message ?? String(err);

async function quarantine(store: PhotoStore, id: string): Promise<boolean> {
  const obj = await store.get(PHOTOS + id);
  if (!obj) return false;
  const bytes = obj.body instanceof ArrayBuffer ? obj.body : await new Response(obj.body).arrayBuffer();
  await store.put(ORPHANS + id, bytes, {
    contentType: obj.contentType ?? "application/octet-stream",
    sha256: "",
    uploader: "orphan-sweep",
  });
  await store.delete(PHOTOS + id);
  return true;
}

export async function sweepStoredOrphans(
  store: PhotoStore,
  canister: SweepCanister,
  state: SweepState,
  nowMs: number,
  opts: { pageSize?: number; maxPages?: number } = {},
): Promise<StoredSweepResult> {
  const pageSize = opts.pageSize ?? 500;
  const maxPages = opts.maxPages ?? 5;
  const res: StoredSweepResult = { checked: 0, quarantined: 0, purged: 0 };
  try {
    // 1. Delete what has been in quarantine for 30 days.
    let purgeCursor: string | null = null;
    for (let i = 0; i < maxPages; i++) {
      const page = await store.list(ORPHANS, purgeCursor, pageSize);
      for (const o of page.objects) {
        if (nowMs - o.uploaded.getTime() > QUARANTINE_MS) {
          await store.delete(o.key);
          res.purged += 1;
        }
      }
      purgeCursor = page.cursor;
      if (!purgeCursor) break;
    }

    // 2. Quarantine stored bytes whose record is gone, a page at a time.
    let cursor: string | null = (await state.get(STORED_CURSOR)) || null;
    for (let i = 0; i < maxPages; i++) {
      let page;
      try {
        page = await store.list(PHOTOS, cursor, pageSize);
      } catch (err) {
        await state.put(STORED_CURSOR, ""); // a stale cursor: start over next run
        throw err;
      }
      res.checked += page.objects.length;
      const old = page.objects
        .filter((o) => nowMs - o.uploaded.getTime() > ORPHAN_MIN_AGE_MS)
        .map((o) => o.key.slice(PHOTOS.length));
      if (old.length) {
        const known = new Set(await canister.known(old));
        const orphans = old.filter((id) => !known.has(id));
        if (old.length >= GUARD_MIN && orphans.length > old.length * STORED_GUARD_SHARE) {
          res.aborted = true;
          return res;
        }
        for (const id of orphans) if (await quarantine(store, id)) res.quarantined += 1;
      }
      cursor = page.cursor;
      await state.put(STORED_CURSOR, cursor ?? "");
      if (!cursor) break;
    }
  } catch (err) {
    res.error = message(err);
  }
  return res;
}

export async function sweepUnuploadedRecords(
  store: PhotoStore,
  canister: SweepCanister,
  state: SweepState,
  nowMs: number,
  opts: { maxPages?: number } = {},
): Promise<RecordSweepResult> {
  const maxPages = opts.maxPages ?? 5;
  const res: RecordSweepResult = { checked: 0, missing: 0, dropped: 0 };
  try {
    let after: string | null = (await state.get(RECORD_CURSOR)) || null;
    for (let i = 0; i < maxPages; i++) {
      const page = await canister.offChainPage(after);
      const stale = page.items.filter((r) => nowMs - r.createdAtMs > UNUPLOADED_MIN_AGE_MS);
      const missing: string[] = [];
      for (const r of stale) {
        if (!(await store.head(PHOTOS + r.id))) missing.push(r.id);
      }
      res.checked += stale.length;
      res.missing += missing.length;
      if (missing.length >= RECORD_GUARD_MIN && missing.length > stale.length * RECORD_GUARD_SHARE) {
        res.aborted = true;
        return res;
      }
      for (let j = 0; j < missing.length; j += 100) {
        res.dropped += await canister.dropUnuploaded(missing.slice(j, j + 100));
      }
      after = page.next;
      await state.put(RECORD_CURSOR, after ?? "");
      if (!after) break;
    }
  } catch (err) {
    res.error = message(err);
  }
  return res;
}
