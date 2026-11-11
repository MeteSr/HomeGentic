/**
 * Where off-chain photo bytes live. photos.ts talks only to PhotoStore, so
 * moving off Cloudflare R2 (S3, GCS, Backblaze, …) means writing one more
 * adapter like r2PhotoStore and choosing it in index.ts; the routes, access
 * checks and canister records don't change. Keys are opaque strings.
 */

export interface StoredPhoto {
  body: ReadableStream | ArrayBuffer;
  contentType?: string;
}

export interface PhotoWriteMeta {
  contentType: string;
  /** Hex SHA-256 the canister recorded; kept with the object for audits and migrations. */
  sha256: string;
  uploader: string;
}

export interface StoredKey {
  key: string;
  uploaded: Date;
}

export interface PhotoStore {
  get(key: string): Promise<StoredPhoto | null>;
  put(key: string, bytes: ArrayBuffer, meta: PhotoWriteMeta): Promise<void>;
  delete(key: string): Promise<void>;
  /** When the object was written, or null when there is none (the orphan sweep). */
  head(key: string): Promise<{ uploaded: Date } | null>;
  /** Keys under `prefix` in key order, after `cursor`; `cursor` in the reply is null at the end. */
  list(prefix: string, cursor?: string | null, limit?: number): Promise<{ objects: StoredKey[]; cursor: string | null }>;
}

export function r2PhotoStore(bucket: R2Bucket): PhotoStore {
  return {
    async get(key) {
      const obj = await bucket.get(key);
      return obj ? { body: obj.body, contentType: obj.httpMetadata?.contentType } : null;
    },
    async put(key, bytes, meta) {
      await bucket.put(key, bytes, {
        httpMetadata:   { contentType: meta.contentType },
        customMetadata: { sha256: meta.sha256, uploader: meta.uploader },
      });
    },
    async delete(key) {
      await bucket.delete(key);
    },
    async head(key) {
      const obj = await bucket.head(key);
      return obj ? { uploaded: obj.uploaded } : null;
    },
    async list(prefix, cursor, limit = 1000) {
      const res = await bucket.list({ prefix, limit, ...(cursor ? { cursor } : {}) });
      return {
        objects: res.objects.map((o) => ({ key: o.key, uploaded: o.uploaded })),
        cursor: res.truncated ? res.cursor : null,
      };
    },
  };
}
