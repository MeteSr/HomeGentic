/**
 * Part 3 of the off-chain photo move: copy photos whose bytes are still on
 * the photo canister into the PhotoStore (R2), then have the canister empty
 * its copy. Runs from the hourly cron while an admin has turned it on
 * (photo.setOffChainMigrationEnabled); see docs/UPGRADE_RUNBOOK.md.
 *
 * For each photo on a page (photo.onChainPhotoPage, an update call, so the
 * bytes are what the subnet agreed on):
 *   1. hash the bytes and write them to photos/<id>
 *   2. read the object back and hash it again
 *   3. only when that matches, report (id, hash) to photo.confirmOffChain
 * A photo that fails any step stays on-chain and is tried again next run, so
 * nothing is emptied on the canister unless the store really holds it.
 */

import type { PhotoStore } from "./photoStore";

export interface MigrationItem {
  id: string;
  hash: string;
  data: Uint8Array;
}
export interface MigrationPage {
  items: MigrationItem[];
  next: string | null;
}

/** The photo canister calls this needs (photoCanister.ts implements them). */
export interface MigrationCanister {
  page(after: string | null): Promise<MigrationPage>;
  /** Returns how many photos the canister moved. */
  confirm(moved: Array<[string, string]>): Promise<number>;
}

export interface MigrationResult {
  moved: number;
  failed: number;
  /** Photos whose recorded hash didn't match their bytes. */
  rehashed: number;
  pages: number;
  /** True when the scan reached the last photo. */
  done: boolean;
  error?: string;
}

/** Pages per cron run: ~1.5 MB each, so ~60 MB an hour. */
export const MIGRATION_PAGES_PER_RUN = 40;

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

const startsWith = (b: Uint8Array, at: number, sig: number[]) => sig.every((x, i) => b[at + i] === x);
const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0));

/** The content type of a stored file, from its leading bytes. */
export function sniffContentType(b: Uint8Array): string {
  if (startsWith(b, 0, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(b, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(b, 0, ascii("RIFF")) && startsWith(b, 8, ascii("WEBP"))) return "image/webp";
  if (startsWith(b, 4, ascii("ftyp"))) {
    const brand = String.fromCharCode(...b.slice(8, 12));
    if (["heic", "heix", "hevc", "heim", "heis"].includes(brand)) return "image/heic";
    if (["mif1", "msf1", "heif"].includes(brand)) return "image/heif";
  }
  if (startsWith(b, 0, ascii("%PDF-"))) return "application/pdf";
  return "application/octet-stream";
}

async function readAll(body: ReadableStream | ArrayBuffer): Promise<ArrayBuffer> {
  return body instanceof ArrayBuffer ? body : new Response(body).arrayBuffer();
}

/** Copy one photo; its verified hash, or null when it didn't land. */
async function copyOne(store: PhotoStore, item: MigrationItem): Promise<string | null> {
  const bytes = item.data.slice().buffer as ArrayBuffer;
  const hash = await sha256Hex(bytes);
  const key = `photos/${item.id}`;
  await store.put(key, bytes, { contentType: sniffContentType(item.data), sha256: hash, uploader: "migration" });
  const back = await store.get(key);
  if (!back) return null;
  return (await sha256Hex(await readAll(back.body))) === hash ? hash : null;
}

export async function migratePhotos(
  store: PhotoStore,
  canister: MigrationCanister,
  opts: { maxPages?: number } = {},
): Promise<MigrationResult> {
  const maxPages = opts.maxPages ?? MIGRATION_PAGES_PER_RUN;
  const res: MigrationResult = { moved: 0, failed: 0, rehashed: 0, pages: 0, done: false };
  let after: string | null = null;
  try {
    while (res.pages < maxPages) {
      const page = await canister.page(after);
      res.pages += 1;
      const moved: Array<[string, string]> = [];
      for (const item of page.items) {
        let hash: string | null = null;
        try {
          hash = await copyOne(store, item);
        } catch {
          hash = null;
        }
        if (!hash) {
          res.failed += 1;
          continue;
        }
        if (hash !== item.hash) res.rehashed += 1;
        moved.push([item.id, hash]);
      }
      if (moved.length) {
        const n = await canister.confirm(moved);
        res.moved += n;
        // Ones the canister skipped (deleted meanwhile) leave an object the orphan sweep removes.
      }
      if (page.next === null) {
        res.done = true;
        break;
      }
      after = page.next;
    }
  } catch (err) {
    res.error = (err as Error)?.message ?? String(err);
  }
  return res;
}
