/**
 * packages/shared/src/photoUpload.ts — upload photo bytes off-chain when the
 * voice Worker has storage, on-chain otherwise, never leaving a record with
 * no bytes anywhere.
 *
 * POFF.1 no Worker URL, storage off, or no session → uploadPhoto on-chain
 * POFF.2 storage on → beginUpload, then PUT the bytes with the session header
 * POFF.3 a failed PUT deletes the half-made record and falls back on-chain
 * POFF.4 a beginUpload refusal (quota, duplicate) is returned as is
 * POFF.5 a canister without beginUpload falls back on-chain
 * POFF.6 /photos-config is asked once per Worker, not per upload
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  uploadPhotoPreferOffChain,
  resetOffChainPhotoConfig,
  type OffChainDeps,
  type PhotoUploadActor,
} from "@homegentic/shared/photoUpload";

const META = { id: "photo-1", hash: "h" };
const ARGS = {
  jobId: "job-1", propertyId: "prop-1", phase: "Framing", description: "d",
  hash: "h", bytes: new Uint8Array([1, 2, 3]), contentType: "image/jpeg",
};

function actor(over: Partial<Record<keyof PhotoUploadActor, any>> = {}) {
  return {
    uploadPhoto: vi.fn(async () => ({ ok: { ...META, id: "onchain-1" } })),
    beginUpload: vi.fn(async () => ({ ok: META })),
    deletePhoto: vi.fn(async () => ({ ok: null })),
    ...over,
  };
}

function worker(opts: { offChain?: boolean; putStatus?: number } = {}) {
  const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/photos-config")) return new Response(JSON.stringify({ offChain: opts.offChain ?? true }));
    if (init?.method === "PUT") return new Response(null, { status: opts.putStatus ?? 201 });
    return new Response(null, { status: 404 });
  });
  return fetchFn;
}

function deps(fetchFn: any, over: Partial<OffChainDeps> = {}): OffChainDeps {
  return { workerUrl: "https://w.test", sessionToken: async () => "hgs_tok", fetchFn, ...over };
}

beforeEach(() => resetOffChainPhotoConfig());

describe("uploadPhotoPreferOffChain", () => {
  it("POFF.1 stays on-chain without a Worker, storage or session", async () => {
    for (const d of [
      deps(worker(), { workerUrl: "" }),
      deps(worker({ offChain: false })),
      deps(worker(), { sessionToken: async () => null }),
    ]) {
      resetOffChainPhotoConfig();
      const a = actor();
      const res = await uploadPhotoPreferOffChain(a, ARGS, d);
      expect(res.ok.id).toBe("onchain-1");
      expect(a.beginUpload).not.toHaveBeenCalled();
      expect(a.uploadPhoto).toHaveBeenCalledWith("job-1", "prop-1", { Framing: null }, "d", "h", ARGS.bytes);
    }
  });

  it("POFF.2 registers the photo, then PUTs the bytes with the session", async () => {
    const a = actor();
    const fetchFn = worker();
    const res = await uploadPhotoPreferOffChain(a, ARGS, deps(fetchFn));
    expect(res).toEqual({ ok: META });
    expect(a.beginUpload).toHaveBeenCalledWith("job-1", "prop-1", { Framing: null }, "d", "h", 3n);
    expect(a.uploadPhoto).not.toHaveBeenCalled();
    const put = fetchFn.mock.calls.find(([, init]) => init?.method === "PUT")!;
    expect(put[0]).toBe("https://w.test/photos/photo-1");
    expect((put[1] as any).headers).toEqual({ "Content-Type": "image/jpeg", "x-agent-session": "hgs_tok" });
    expect((put[1] as any).body).toBe(ARGS.bytes);
  });

  it("POFF.3 a failed PUT deletes the record and uploads on-chain", async () => {
    const a = actor();
    const res = await uploadPhotoPreferOffChain(a, ARGS, deps(worker({ putStatus: 503 })));
    expect(a.deletePhoto).toHaveBeenCalledWith("photo-1");
    expect(res.ok.id).toBe("onchain-1");
  });

  it("POFF.4 returns a beginUpload refusal without trying on-chain", async () => {
    const a = actor({ beginUpload: vi.fn(async () => ({ err: { QuotaExceeded: "full" } })) });
    const res = await uploadPhotoPreferOffChain(a, ARGS, deps(worker()));
    expect(res).toEqual({ err: { QuotaExceeded: "full" } });
    expect(a.uploadPhoto).not.toHaveBeenCalled();
  });

  it("POFF.5 falls back on-chain when the canister has no beginUpload yet", async () => {
    const a = actor({ beginUpload: vi.fn(async () => { throw new Error("method not found"); }) });
    const res = await uploadPhotoPreferOffChain(a, ARGS, deps(worker()));
    expect(res.ok.id).toBe("onchain-1");
    expect(a.deletePhoto).not.toHaveBeenCalled();
  });

  it("POFF.6 asks /photos-config once for several uploads", async () => {
    const fetchFn = worker();
    const d = deps(fetchFn);
    await uploadPhotoPreferOffChain(actor(), ARGS, d);
    await uploadPhotoPreferOffChain(actor(), ARGS, d);
    expect(fetchFn.mock.calls.filter(([url]) => String(url).endsWith("/photos-config"))).toHaveLength(1);
  });
});
