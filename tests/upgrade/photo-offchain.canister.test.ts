/**
 * Off-chain photos end to end: the apps' shared upload client
 * (packages/shared/src/photoUpload.ts) → photo.beginUpload on a real photo
 * canister → PUT /photos/<id> on the real voice Worker (src/index.ts, with an
 * in-memory R2 bucket and KV) → GET and DELETE back through the Worker, which
 * asks the canister (photoAccess, through PocketIC's HTTP gateway) and
 * resolves callers from real auth-canister sessions.
 *
 * Run: cd tests/upgrade && npx vitest run photo-offchain.canister.test.ts
 * (needs .dfx/local/canisters/{photo,property,payment,auth}/*.wasm and agents/voice/node_modules)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PocketIc, createIdentity } from "@dfinity/pic";
import { IDL } from "@icp-sdk/core/candid";
import type { Identity } from "@icp-sdk/core/agent";
import { createHash, generateKeyPairSync } from "crypto";
import { createPic, wasmPath, CONTROLLER } from "./__helpers__/setup";
import { serviceFromWasm } from "./__helpers__/candid";
import * as payment from "../../agents/voice/paymentCanister";
import worker from "../../agents/voice/src/index";
import { uploadPhotoPreferOffChain, resetOffChainPhotoConfig } from "../../packages/shared/src/photoUpload";

type R<T> = { ok: T } | { err: Record<string, unknown> };
function ok<T>(r: R<T>): T {
  if ("err" in r) throw new Error(`Expected ok, got err: ${JSON.stringify(r.err, (_k, v) => typeof v === "bigint" ? v.toString() : v)}`);
  return r.ok;
}
const errKey = (r: R<unknown>) => ("err" in r ? Object.keys(r.err)[0] : "ok");

const CANISTERS = ["photo", "property", "payment", "auth"] as const;
type Name = typeof CANISTERS[number];
const WORKER = "https://voice.test";

/** In-memory KV and R2 bucket, the shapes the Worker uses. */
function memoryKV() {
  const m = new Map<string, string>();
  return { get: async (k: string) => m.get(k) ?? null, put: async (k: string, v: string) => { m.set(k, v); }, delete: async (k: string) => { m.delete(k); } };
}
function memoryBucket() {
  const m = new Map<string, { bytes: Uint8Array; contentType?: string }>();
  return {
    objects: m,
    async get(k: string) {
      const o = m.get(k);
      return o ? { body: new Blob([o.bytes]).stream(), httpMetadata: { contentType: o.contentType } } : null;
    },
    async put(k: string, bytes: ArrayBuffer, opts: any) { m.set(k, { bytes: new Uint8Array(bytes), contentType: opts?.httpMetadata?.contentType }); },
    async delete(k: string) { m.delete(k); },
  };
}

const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
// The photo canister allows 10 uploads a minute per caller and live mode runs
// on the wall clock, so these tests stay under 10 uploads from the owner.
const image = (seed: number) => new Uint8Array(Array.from({ length: 2048 }, (_, i) => (i * seed) & 0xff));

describe("off-chain photos through the Worker and the photo canister", () => {
  let pic: PocketIc;
  const ids = {} as Record<Name, any>;
  const svcs = {} as Record<Name, IDL.ServiceClass>;
  let propertyId = "";
  let env: any;
  const bucket = memoryBucket();

  const admin    = createIdentity("po-admin");
  const owner    = createIdentity("po-owner");
  const stranger = createIdentity("po-stranger");
  const pem = generateKeyPairSync("ed25519").privateKey.export({ format: "pem", type: "pkcs8" }).toString();
  const workerPrincipal = payment.identityFromPem(pem).getPrincipal();
  const sessions = new Map<Identity, string>();

  const as = (name: Name, who: Identity) => {
    const a = pic.createActor<any>((() => svcs[name]) as any, ids[name]);
    a.setIdentity(who);
    return a;
  };
  /** A request to the Worker, signed in as `who` (anonymous when null). */
  const call = (path: string, who: Identity | null, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    if (who) headers.set("x-agent-session", sessions.get(who)!);
    headers.set("CF-Connecting-IP", "198.51.100.7");
    return worker.fetch(new Request(`${WORKER}${path}`, { ...init, headers }), env, { waitUntil() {}, passThroughOnException() {} } as any);
  };
  /** What the web and mobile apps do, with fetch going to the Worker. */
  const upload = (who: Identity, jobId: string, bytes: Uint8Array, phase = "Finishing") =>
    uploadPhotoPreferOffChain(as("photo", who), {
      jobId, propertyId, phase, description: "", hash: sha256(bytes), bytes, contentType: "image/jpeg",
    }, {
      workerUrl: WORKER,
      sessionToken: async () => sessions.get(who) ?? null,
      fetchFn: ((url: string, init?: RequestInit) => call(url.slice(WORKER.length), null, init)) as any,
    });

  beforeAll(async () => {
    pic = await createPic();
    // Live mode (below) runs on the wall clock; start there so the sessions
    // issued now haven't expired by then.
    await pic.setTime(Date.now());
    await pic.tick();
    for (const name of CANISTERS) {
      const { idlFactory, initArgs } = serviceFromWasm(wasmPath(name));
      svcs[name] = idlFactory({ IDL });
      const arg = new Uint8Array(IDL.encode(initArgs, initArgs.map(() => admin.getPrincipal())));
      ids[name] = (await pic.setupCanister({ idlFactory: (() => svcs[name]) as any, wasm: wasmPath(name), arg })).canisterId;
      const methods = new Map(svcs[name]._fields);
      if (methods.has("setBootstrapNonce")) await as(name, CONTROLLER).setBootstrapNonce("n");
      if (methods.has("initAdmins")) ok(await as(name, admin).initAdmins([admin.getPrincipal()], "n"));
      else {
        const two = methods.get("addAdmin")!.argTypes.length === 2;
        ok(await as(name, admin).addAdmin(...(two ? [admin.getPrincipal(), "n"] : [admin.getPrincipal()])));
      }
    }
    ok(await as("photo", admin).addPhotoRelay(workerPrincipal));
    ok(await as("photo", admin).setPropertyCanisterId(ids.property));
    ok(await as("photo", admin).setPaymentCanisterId(ids.payment));
    ok(await as("property", admin).addTrustedCanister(ids.photo));

    for (const who of [owner, stranger]) {
      ok(await as("auth", who).register({ role: { Homeowner: null }, email: "u@example.com", phone: "555-0100" }));
      sessions.set(who, ok<any>(await as("auth", who).issueAgentSession()).token);
    }
    propertyId = ok<any>(await as("property", owner).registerProperty({
      address: "21 Lake Drive", city: "Orlando", state: "FL", zipCode: "32801",
      propertyType: { SingleFamily: null }, yearBuilt: 1999n, squareFeet: 1700n, tier: { Free: null },
    })).id;

    const port = await pic.makeLive();
    const vars = {
      IC_HOST: `http://localhost:${port}`,
      DFX_NETWORK: "local",
      DFX_IDENTITY_PEM: pem,
      CANISTER_ID_AUTH: ids.auth.toText(),
      CANISTER_ID_PHOTO: ids.photo.toText(),
      CANISTER_ID_PROPERTY: ids.property.toText(),
      CANISTER_ID_PAYMENT: ids.payment.toText(),
    };
    Object.assign(process.env, vars);
    env = { ...vars, RATE_LIMIT: memoryKV(), PHOTOS: bucket, FRONTEND_ORIGIN: "https://homegentic.app" };
    resetOffChainPhotoConfig();
  }, 180_000);

  afterAll(async () => {
    for (const k of ["IC_HOST", "DFX_NETWORK", "DFX_IDENTITY_PEM", "CANISTER_ID_AUTH", "CANISTER_ID_PHOTO", "CANISTER_ID_PROPERTY", "CANISTER_ID_PAYMENT"]) delete process.env[k];
    await pic?.stopLive().catch(() => {});
    await pic?.tearDown();
  });

  it("tells the apps that photos go off-chain", async () => {
    expect(await (await call("/photos-config", null)).json()).toEqual({ offChain: true });
  });

  it("uploads off-chain: the record on the canister, the bytes in the bucket", async () => {
    const bytes = image(3);
    const meta = ok<any>(await upload(owner, "JOB_A", bytes));
    expect(bucket.objects.get(`photos/${meta.id}`)?.bytes).toEqual(bytes);
    // The canister holds the record and hash, not the bytes.
    const rec = ok<any>(await as("photo", owner).getPhoto(meta.id));
    expect([rec.hash, Number(rec.size), rec.data.length]).toEqual([sha256(bytes), bytes.length, 0]);
    expect(await as("photo", owner).getMyOffChainPhotoIds()).toEqual([meta.id]);

    const got = await call(`/photos/${meta.id}`, owner);
    expect(got.status).toBe(200);
    expect(got.headers.get("Cache-Control")).toBe("private, no-cache");
    expect(new Uint8Array(await got.arrayBuffer())).toEqual(bytes);
    const again = await call(`/photos/${meta.id}`, owner, { headers: { "If-None-Match": got.headers.get("ETag")! } });
    expect(again.status).toBe(304);
  });

  it("serves a private photo to nobody else, signed in or not", async () => {
    const meta = ok<any>(await upload(owner, "JOB_B", image(5)));
    expect((await call(`/photos/${meta.id}`, stranger)).status).toBe(404);
    expect((await call(`/photos/${meta.id}`, null)).status).toBe(404);
    expect((await call("/photos/PHOTO_none", owner)).status).toBe(404);
  });

  it("stores only the bytes the canister approved, from the uploader", async () => {
    const bytes = image(7);
    const meta = ok<any>(await as("photo", owner).beginUpload("JOB_C", propertyId, { Finishing: null }, "", sha256(bytes), BigInt(bytes.length)));
    const put = (who: Identity | null, body: Uint8Array, type = "image/jpeg") =>
      call(`/photos/${meta.id}`, who, { method: "PUT", headers: { "Content-Type": type }, body: body as any });
    const tampered = bytes.slice(); tampered[0] ^= 0xff;
    expect((await put(null, bytes)).status).toBe(401);
    expect((await put(stranger, bytes)).status).toBe(403);
    expect((await put(owner, tampered)).status).toBe(400);
    expect((await put(owner, bytes.slice(1))).status).toBe(400);
    expect((await put(owner, bytes, "text/html")).status).toBe(415);
    expect(bucket.objects.has(`photos/${meta.id}`)).toBe(false);
    expect((await put(owner, bytes)).status).toBe(201);
  });

  it("refuses an on-chain photo's id, so its bytes can't be replaced off-chain", async () => {
    const bytes = image(9);
    const meta = ok<any>(await as("photo", owner).uploadPhoto("JOB_D", propertyId, { Finishing: null }, "", sha256(bytes), bytes));
    expect((await call(`/photos/${meta.id}`, owner, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: bytes as any })).status).toBe(409);
    expect((await call(`/photos/${meta.id}`, owner)).status).toBe(404);   // read it with getPhotoDataBatch instead
  });

  it("applies the canister's checks before any bytes move", async () => {
    const bytes = image(11);
    ok(await upload(owner, "JOB_E", bytes));
    expect(errKey(await upload(owner, "JOB_E", bytes))).toBe("Duplicate");
    expect(errKey(await upload(stranger, "JOB_E", image(13)))).toBe("NotAuthorized");
  });

  it("serves listing photos to anyone, cached as public", async () => {
    const meta = ok<any>(await upload(owner, `LISTING_${propertyId}`, image(15), "Listing"));
    const got = await call(`/photos/${meta.id}`, null);
    expect(got.status).toBe(200);
    expect(got.headers.get("Cache-Control")).toContain("public");
    expect(errText(await upload(owner, "LISTING_someone-else", image(17), "Listing"))).toMatch(/own property/);
  });

  it("lets the owner approve a photo, and nobody else", async () => {
    const meta = ok<any>(await upload(owner, "JOB_F", image(19)));
    expect(errKey(await as("photo", stranger).verifyPhoto(meta.id))).toBe("NotAuthorized");
    const v = ok<any>(await as("photo", owner).verifyPhoto(meta.id));
    expect(v.verified).toBe(true);
    // Approving twice is a no-op.
    expect(ok<any>(await as("photo", owner).verifyPhoto(meta.id)).verified).toBe(true);
  });

  it("drops the bytes only after the record is deleted", async () => {
    const meta = ok<any>(await upload(owner, "JOB_G", image(21)));
    const del = (who: Identity) => call(`/photos/${meta.id}`, who, { method: "DELETE" });
    expect((await del(owner)).status).toBe(409);
    expect(errKey(await as("photo", stranger).deletePhoto(meta.id))).toBe("NotAuthorized");
    ok(await as("photo", owner).deletePhoto(meta.id));
    expect((await del(stranger)).status).toBe(204);   // anyone may clean up after a delete
    expect(bucket.objects.has(`photos/${meta.id}`)).toBe(false);
  });
});

function errText(r: R<unknown>) { return "err" in r ? JSON.stringify(r.err) : "ok"; }
