/**
 * Part 4 of the off-chain photo move, on real canisters.
 *
 * Canister side (photo + property + payment, no Worker):
 *  PSWP.1 photo records say whether their bytes are off-chain (PhotoMeta.offChain),
 *         so the apps skip the batch call for them
 *  PSWP.2 knownPhotoIds, offChainPhotoPage and dropUnuploadedPhotos answer only the
 *         cron relay and admins, never the request-path photo relay (X-1, 2026-11-11)
 *  PSWP.3 knownPhotoIds returns the ids that still have a record
 *  PSWP.4 offChainPhotoPage lists off-chain records with their creation time
 *  PSWP.5 dropUnuploadedPhotos drops only off-chain records over 7 days old,
 *         and the uploader can upload the same image again afterwards
 *
 * Through the Worker's hourly cron (live PocketIC, in-memory R2):
 *  PSWP.6 bytes whose record is gone move to orphans/<id>; bytes of a live
 *         photo, and fresh records still waiting for their bytes, stay
 *
 * Run: cd tests/upgrade && npx vitest run photo-sweep.canister.test.ts
 * (needs .dfx/local/canisters/{photo,property,payment}/*.wasm and agents/voice/node_modules)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createIdentity } from "@dfinity/pic";
import { IDL } from "@icp-sdk/core/candid";
import type { Identity } from "@icp-sdk/core/agent";
import { createHash, generateKeyPairSync } from "crypto";
import { createPic, wasmPath, CONTROLLER, gatewayRootKeyHex } from "./__helpers__/setup";
import { serviceFromWasm } from "./__helpers__/candid";
import * as payment from "../../agents/voice/paymentCanister";
import worker from "../../agents/voice/src/index";

type R<T> = { ok: T } | { err: Record<string, unknown> };
function ok<T>(r: R<T>): T {
  if ("err" in r)
    throw new Error(
      `Expected ok, got err: ${JSON.stringify(r.err, (_k, v) => (typeof v === "bigint" ? v.toString() : v))}`,
    );
  return r.ok;
}
const errKey = (r: R<unknown>) => ("err" in r ? Object.keys(r.err)[0] : "ok");

const CANISTERS = ["photo", "property", "payment"] as const;
type Name = (typeof CANISTERS)[number];
const DAY_NS = 86_400_000_000_000n;
const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const image = (seed: number) =>
  new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...Array.from({ length: 1020 }, (_, i) => (i * seed) & 0xff)]);

/** Photo, property and payment canisters wired as deploy.sh does, a relay, and a home. */
async function setup(prefix: string) {
  const pic = await createPic();
  await pic.setTime(Date.now());
  await pic.tick();
  const ids = {} as Record<Name, any>;
  const svcs = {} as Record<Name, IDL.ServiceClass>;
  const admin = createIdentity(`${prefix}-admin`);
  const owner = createIdentity(`${prefix}-owner`);
  const as = (name: Name, who: Identity) => {
    const a = pic.createActor<any>((() => svcs[name]) as any, ids[name]);
    a.setIdentity(who);
    return a;
  };
  for (const name of CANISTERS) {
    const { idlFactory, initArgs } = serviceFromWasm(wasmPath(name));
    svcs[name] = idlFactory({ IDL });
    const arg = new Uint8Array(
      IDL.encode(
        initArgs,
        initArgs.map(() => admin.getPrincipal()),
      ),
    );
    ids[name] = (
      await pic.setupCanister({ idlFactory: (() => svcs[name]) as any, wasm: wasmPath(name), arg })
    ).canisterId;
    const methods = new Map(svcs[name]._fields);
    if (methods.has("setBootstrapNonce")) await as(name, CONTROLLER).setBootstrapNonce("n");
    if (methods.has("initAdmins")) ok(await as(name, admin).initAdmins([admin.getPrincipal()], "n"));
    else {
      const two = methods.get("addAdmin")!.argTypes.length === 2;
      ok(await as(name, admin).addAdmin(...(two ? [admin.getPrincipal(), "n"] : [admin.getPrincipal()])));
    }
  }
  const pem = generateKeyPairSync("ed25519").privateKey.export({ format: "pem", type: "pkcs8" }).toString();
  const relay = payment.identityFromPem(pem);
  ok(await as("photo", admin).addPhotoRelay(relay.getPrincipal()));
  // X-1: the hourly cron signs with its own key.
  const cronPem = generateKeyPairSync("ed25519").privateKey.export({ format: "pem", type: "pkcs8" }).toString();
  const cron = payment.identityFromPem(cronPem);
  ok(await as("photo", admin).addCronRelay(cron.getPrincipal()));
  ok(await as("photo", admin).setPropertyCanisterId(ids.property));
  ok(await as("photo", admin).setPaymentCanisterId(ids.payment));
  ok(await as("property", admin).addTrustedCanister(ids.photo));
  const propertyId = ok<any>(
    await as("property", owner).registerProperty({
      address: `${prefix.length} Elm Street`,
      city: "Orlando",
      state: "FL",
      zipCode: "32801",
      propertyType: { SingleFamily: null },
      yearBuilt: 1990n,
      squareFeet: 1400n,
      tier: { Free: null },
    }),
  ).id;
  const begin = (job: string, bytes: Uint8Array) =>
    as("photo", owner).beginUpload(job, propertyId, { Finishing: null }, "", sha256(bytes), BigInt(bytes.length));
  const onChain = (job: string, bytes: Uint8Array) =>
    as("photo", owner).uploadPhoto(job, propertyId, { Finishing: null }, "", sha256(bytes), bytes);
  return { pic, ids, as, admin, owner, relay, pem, cron, cronPem, propertyId, begin, onChain };
}

describe("photo canister: what the sweep needs (part 4)", () => {
  let t: Awaited<ReturnType<typeof setup>>;
  const stranger = createIdentity("psw-stranger");
  let empty = "",
    stored = "",
    chain = "";

  beforeAll(async () => {
    t = await setup("psw");
    empty = ok<any>(await t.begin("JOB_1", image(3))).id; // bytes never sent
    stored = ok<any>(await t.begin("JOB_1", image(5))).id; // bytes in R2 (not checked here)
    chain = ok<any>(await t.onChain("JOB_1", image(7))).id; // bytes on-chain
  }, 120_000);
  afterAll(async () => {
    await t?.pic.tearDown();
  });

  it("PSWP.1 marks off-chain photos in their records", async () => {
    const metas = await t.as("photo", t.owner).getPhotosByJob("JOB_1");
    const flags = Object.fromEntries(metas.map((m: any) => [m.id, m.offChain]));
    expect(flags).toEqual({ [empty]: true, [stored]: true, [chain]: false });
  });

  it("PSWP.2 answers only the cron relay and admins", async () => {
    for (const who of [t.owner, stranger, t.relay]) {
      expect(errKey(await t.as("photo", who).knownPhotoIds([empty]))).toBe("NotAuthorized");
      expect(errKey(await t.as("photo", who).offChainPhotoPage([]))).toBe("NotAuthorized");
      expect(errKey(await t.as("photo", who).dropUnuploadedPhotos([empty]))).toBe("NotAuthorized");
    }
  });

  it("PSWP.3 knownPhotoIds returns the ids that still have a record", async () => {
    expect(ok(await t.as("photo", t.cron).knownPhotoIds([empty, "PHOTO_404", chain]))).toEqual([empty, chain]);
  });

  it("PSWP.4 offChainPhotoPage lists off-chain records with their creation time", async () => {
    const page = ok<any>(await t.as("photo", t.cron).offChainPhotoPage([]));
    expect(page.items.map(([id]: [string, bigint]) => id).sort()).toEqual([empty, stored].sort());
    expect(page.next).toEqual([]);
    const created = (await t.as("photo", t.owner).getPhotosByJob("JOB_1")).find((m: any) => m.id === empty).createdAt;
    expect(page.items.find(([id]: [string, bigint]) => id === empty)[1]).toBe(created);
  });

  it("PSWP.5 drops only off-chain records over 7 days old", async () => {
    expect(ok(await t.as("photo", t.cron).dropUnuploadedPhotos([empty]))).toBe(0n); // too new
    await t.pic.advanceTime(Number((8n * DAY_NS) / 1_000_000n));
    await t.pic.tick();
    expect(ok(await t.as("photo", t.cron).dropUnuploadedPhotos([empty, chain, "PHOTO_404"]))).toBe(1n);
    expect(errKey(await t.as("photo", t.owner).getPhoto(empty))).toBe("NotFound");
    expect(ok<any>(await t.as("photo", t.owner).getPhoto(chain)).data.length).toBe(1024); // on-chain: never dropped
    // Its hash is free again, so the same image can be uploaded.
    expect(errKey(await t.begin("JOB_2", image(3)))).toBe("ok");
  });

  it("PSWP.7 caps drops per day (X-1)", async () => {
    const old = ok<any>(await t.begin("JOB_3", image(31))).id;
    await t.pic.advanceTime(Number((8n * DAY_NS) / 1_000_000n));
    await t.pic.tick();
    ok(await t.as("photo", t.admin).setCronDailyLimits(20_000n, 0n));
    expect(errKey(await t.as("photo", t.cron).dropUnuploadedPhotos([old]))).toBe("InvalidInput");
    expect(errKey(await t.as("photo", t.owner).getPhoto(old))).toBe("ok");
    ok(await t.as("photo", t.admin).setCronDailyLimits(20_000n, 1_000n));
    expect(ok(await t.as("photo", t.cron).dropUnuploadedPhotos([old]))).toBe(1n);
  });
});

describe("the Worker's hourly sweep (part 4)", () => {
  let t: Awaited<ReturnType<typeof setup>>;
  let env: any;
  const objects = new Map<string, { bytes: Uint8Array; uploaded: Date; contentType?: string }>();
  const bucket = {
    async get(k: string) {
      const o = objects.get(k);
      return o ? { body: new Blob([o.bytes]).stream(), httpMetadata: { contentType: o.contentType } } : null;
    },
    async head(k: string) {
      const o = objects.get(k);
      return o ? { uploaded: o.uploaded } : null;
    },
    async put(k: string, bytes: ArrayBuffer, opts: any) {
      objects.set(k, {
        bytes: new Uint8Array(bytes),
        uploaded: new Date(),
        contentType: opts?.httpMetadata?.contentType,
      });
    },
    async delete(k: string) {
      objects.delete(k);
    },
    async list(o: { prefix: string; cursor?: string; limit?: number }) {
      const keys = [...objects.keys()].filter((k) => k.startsWith(o.prefix)).sort();
      return { objects: keys.map((key) => ({ key, uploaded: objects.get(key)!.uploaded })), truncated: false };
    },
  };
  const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000);
  let live = "",
    waiting = "";

  beforeAll(async () => {
    t = await setup("psw-live");
    live = ok<any>(await t.begin("JOB_L", image(11))).id;
    waiting = ok<any>(await t.begin("JOB_L", image(13))).id;
    objects.set(`photos/${live}`, { bytes: image(11), uploaded: twoDaysAgo, contentType: "image/jpeg" });
    objects.set("photos/PHOTO_GONE", { bytes: image(17), uploaded: twoDaysAgo, contentType: "image/jpeg" });
    const port = await t.pic.makeLive();
    const vars = {
      IC_HOST: `http://localhost:${port}`,
      ICP_ROOT_KEY: await gatewayRootKeyHex(`http://localhost:${port}`),
      DFX_NETWORK: "local",
      DFX_IDENTITY_PEM: t.pem,
      PHOTO_CRON_IDENTITY_PEM: t.cronPem,
      CANISTER_ID_PHOTO: t.ids.photo.toText(),
    };
    Object.assign(process.env, vars);
    const kv = new Map<string, string>();
    env = {
      ...vars,
      PHOTOS: bucket,
      RATE_LIMIT: {
        get: async (k: string) => kv.get(k) ?? null,
        put: async (k: string, v: string) => {
          kv.set(k, v);
        },
      },
    };
  }, 180_000);
  afterAll(async () => {
    for (const k of ["IC_HOST", "ICP_ROOT_KEY", "DFX_NETWORK", "DFX_IDENTITY_PEM", "PHOTO_CRON_IDENTITY_PEM", "CANISTER_ID_PHOTO"])
      delete process.env[k];
    await t?.pic.stopLive().catch(() => {});
    await t?.pic.tearDown();
  });

  it("PSWP.6 quarantines bytes without a record and keeps everything else", async () => {
    const pending: Promise<unknown>[] = [];
    await worker.scheduled({} as any, env, {
      waitUntil: (p: Promise<unknown>) => pending.push(p),
      passThroughOnException() {},
    } as any);
    await Promise.allSettled(pending);
    expect(objects.has("photos/PHOTO_GONE")).toBe(false);
    expect(objects.get("orphans/PHOTO_GONE")?.bytes).toEqual(image(17));
    expect(objects.has(`photos/${live}`)).toBe(true);
    // A record still waiting for its bytes is days away from being swept.
    expect(errKey(await t.as("photo", t.owner).getPhoto(waiting))).toBe("ok");
  });
});
