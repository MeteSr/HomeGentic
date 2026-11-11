/**
 * Part 3 of the off-chain photo move: photos uploaded on-chain (uploadPhoto)
 * are copied to R2 by the voice Worker's hourly cron and then emptied on the
 * photo canister, end to end: real photo/property/payment/auth canisters, the
 * real Worker `scheduled` handler with an in-memory R2 bucket.
 *
 *  PMIG.1 only an admin turns the migration on or reads its status; only the
 *         cron relay (the Worker's cron identity) or an admin reads pages or confirms moves
 *  PMIG.2 while it is off, the cron moves nothing
 *  PMIG.3 once on, the cron copies every on-chain photo to the bucket; the
 *         canister keeps the record, size and quota use but not the bytes
 *  PMIG.4 moved photos are served by the Worker like any off-chain photo, and
 *         getPhotoDataBatch answers with empty bytes for them
 *  PMIG.5 a photo whose recorded hash was wrong is moved under its real hash,
 *         and duplicate detection follows the new hash
 *  PMIG.6 confirmOffChain ignores photos it can't vouch for: already moved,
 *         deleted, unknown, or a hash that isn't 64 characters; a paused canister
 *         or a switched-off migration refuses the relay
 *  PMIG.7 (X-1, 2026-11-11 audit) the cron has its own identity: the request-path
 *         photo relay can't page, confirm or read the status, and a confirmed
 *         hash must be the SHA-256 the canister computes from the on-chain bytes
 *  PMIG.8 (X-1) confirmations are capped per day, canister-wide, by an
 *         admin-set limit; over it the bytes stay on-chain
 *
 * Run: cd tests/upgrade && npx vitest run photo-migration.canister.test.ts
 * (needs .dfx/local/canisters/{photo,property,payment,auth}/*.wasm and agents/voice/node_modules)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PocketIc, createIdentity } from "@dfinity/pic";
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

const CANISTERS = ["photo", "property", "payment", "auth"] as const;
type Name = (typeof CANISTERS)[number];
const WORKER = "https://voice.test";

function memoryKV() {
  const m = new Map<string, string>();
  return {
    get: async (k: string) => m.get(k) ?? null,
    put: async (k: string, v: string) => {
      m.set(k, v);
    },
    delete: async (k: string) => {
      m.delete(k);
    },
  };
}
function memoryBucket() {
  const m = new Map<string, { bytes: Uint8Array; contentType?: string; meta?: Record<string, string> }>();
  return {
    objects: m,
    async get(k: string) {
      const o = m.get(k);
      return o ? { body: new Blob([o.bytes]).stream(), httpMetadata: { contentType: o.contentType } } : null;
    },
    async put(k: string, bytes: ArrayBuffer, opts: any) {
      m.set(k, {
        bytes: new Uint8Array(bytes),
        contentType: opts?.httpMetadata?.contentType,
        meta: opts?.customMetadata,
      });
    },
    async delete(k: string) {
      m.delete(k);
    },
  };
}

const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
/** A small JPEG-looking image; `seed` makes each one different. */
const image = (seed: number) =>
  new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...Array.from({ length: 2044 }, (_, i) => (i * seed) & 0xff)]);

describe("moving on-chain photos to R2 (part 3)", () => {
  let pic: PocketIc;
  const ids = {} as Record<Name, any>;
  const svcs = {} as Record<Name, IDL.ServiceClass>;
  let propertyId = "";
  let env: any;
  const bucket = memoryBucket();

  const admin = createIdentity("pm-admin");
  const owner = createIdentity("pm-owner");
  const stranger = createIdentity("pm-stranger");
  const pem = generateKeyPairSync("ed25519").privateKey.export({ format: "pem", type: "pkcs8" }).toString();
  const relay = payment.identityFromPem(pem);
  // X-1: the migration cron signs with its own key, not the request-path one.
  const cronPem = generateKeyPairSync("ed25519").privateKey.export({ format: "pem", type: "pkcs8" }).toString();
  const cron_ = payment.identityFromPem(cronPem);
  let ownerSession = "";

  const as = (name: Name, who: Identity) => {
    const a = pic.createActor<any>((() => svcs[name]) as any, ids[name]);
    a.setIdentity(who);
    return a;
  };
  /** One cron tick of the Worker, waiting for everything it started. */
  const cron = async () => {
    const pending: Promise<unknown>[] = [];
    await worker.scheduled({} as any, env, {
      waitUntil: (p: Promise<unknown>) => pending.push(p),
      passThroughOnException() {},
    } as any);
    await Promise.allSettled(pending);
  };
  const get = (path: string) =>
    worker.fetch(
      new Request(`${WORKER}${path}`, {
        headers: { "x-agent-session": ownerSession, "CF-Connecting-IP": "198.51.100.9" },
      }),
      env,
      { waitUntil() {}, passThroughOnException() {} } as any,
    );

  const onChain = { a: image(3), b: image(5), wrong: image(7) };
  const photoIds = {} as Record<keyof typeof onChain | "off", string>;

  beforeAll(async () => {
    pic = await createPic();
    await pic.setTime(Date.now());
    await pic.tick();
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
    ok(await as("photo", admin).addPhotoRelay(relay.getPrincipal()));
    ok(await as("photo", admin).addCronRelay(cron_.getPrincipal()));
    ok(await as("photo", admin).setPropertyCanisterId(ids.property));
    ok(await as("photo", admin).setPaymentCanisterId(ids.payment));
    ok(await as("property", admin).addTrustedCanister(ids.photo));

    ok(await as("auth", owner).register({ role: { Homeowner: null }, email: "u@example.com", phone: "555-0100" }));
    ownerSession = ok<any>(await as("auth", owner).issueAgentSession()).token;
    propertyId = ok<any>(
      await as("property", owner).registerProperty({
        address: "8 Pine Court",
        city: "Orlando",
        state: "FL",
        zipCode: "32801",
        propertyType: { SingleFamily: null },
        yearBuilt: 2001n,
        squareFeet: 1500n,
        tier: { Free: null },
      }),
    ).id;

    // Three photos uploaded before off-chain storage existed; one recorded
    // with a hash that doesn't match its bytes. And one already off-chain.
    const up = (job: string, bytes: Uint8Array, hash = sha256(bytes)) =>
      as("photo", owner).uploadPhoto(job, propertyId, { Finishing: null }, "", hash, bytes);
    photoIds.a = ok<any>(await up("JOB_A", onChain.a)).id;
    photoIds.b = ok<any>(await up("JOB_B", onChain.b)).id;
    photoIds.wrong = ok<any>(await up("JOB_C", onChain.wrong, "e".repeat(64))).id;
    photoIds.off = ok<any>(
      await as("photo", owner).beginUpload("JOB_D", propertyId, { Finishing: null }, "", sha256(image(9)), 2048n),
    ).id;

    const port = await pic.makeLive();
    const vars = {
      IC_HOST: `http://localhost:${port}`,
      ICP_ROOT_KEY: await gatewayRootKeyHex(`http://localhost:${port}`),
      DFX_NETWORK: "local",
      DFX_IDENTITY_PEM: pem,
      PHOTO_CRON_IDENTITY_PEM: cronPem,
      CANISTER_ID_AUTH: ids.auth.toText(),
      CANISTER_ID_PHOTO: ids.photo.toText(),
      CANISTER_ID_PROPERTY: ids.property.toText(),
      CANISTER_ID_PAYMENT: ids.payment.toText(),
    };
    Object.assign(process.env, vars);
    env = { ...vars, RATE_LIMIT: memoryKV(), PHOTOS: bucket, FRONTEND_ORIGIN: "https://homegentic.app" };
  }, 180_000);

  afterAll(async () => {
    for (const k of [
      "IC_HOST",
      "ICP_ROOT_KEY",
      "DFX_NETWORK",
      "DFX_IDENTITY_PEM",
      "PHOTO_CRON_IDENTITY_PEM",
      "CANISTER_ID_AUTH",
      "CANISTER_ID_PHOTO",
      "CANISTER_ID_PROPERTY",
      "CANISTER_ID_PAYMENT",
    ])
      delete process.env[k];
    await pic?.stopLive().catch(() => {});
    await pic?.tearDown();
  });

  it("PMIG.1 keeps the switch, status, pages and confirmations to admins and the relay", async () => {
    expect(errKey(await as("photo", stranger).setOffChainMigrationEnabled(true))).toBe("NotAuthorized");
    expect(errKey(await as("photo", owner).getOffChainMigrationStatus())).toBe("NotAuthorized");
    expect(errKey(await as("photo", owner).onChainPhotoPage([]))).toBe("NotAuthorized");
    expect(errKey(await as("photo", owner).confirmOffChain([[photoIds.a, sha256(onChain.a)]]))).toBe("NotAuthorized");
    const status = ok<any>(await as("photo", admin).getOffChainMigrationStatus());
    expect(status).toEqual({ enabled: false, onChainPhotos: 3n, onChainBytes: 3n * 2048n, offChainPhotos: 1n });
    // Off: the cron gets no pages and can't confirm.
    expect(errKey(await as("photo", cron_).onChainPhotoPage([]))).toBe("InvalidInput");
    expect(errKey(await as("photo", cron_).confirmOffChain([[photoIds.a, sha256(onChain.a)]]))).toBe("InvalidInput");
  });

  it("PMIG.2 moves nothing while the migration is off", async () => {
    await cron();
    expect(bucket.objects.size).toBe(0);
    expect(ok<any>(await as("photo", owner).getPhoto(photoIds.a)).data.length).toBe(2048);
  });

  it("PMIG.3 copies every on-chain photo once turned on, keeping records and quota use", async () => {
    const before = await as("photo", admin).getMetrics();
    ok(await as("photo", admin).setOffChainMigrationEnabled(true));
    // A page is what the relay copies: bytes with the recorded hash.
    const page = ok<any>(await as("photo", cron_).onChainPhotoPage([]));
    expect(page.items.map((i: any) => i.id).sort()).toEqual([photoIds.a, photoIds.b, photoIds.wrong].sort());

    await cron();

    for (const k of ["a", "b", "wrong"] as const) {
      const obj = bucket.objects.get(`photos/${photoIds[k]}`)!;
      expect(obj.bytes).toEqual(onChain[k]);
      expect(obj.contentType).toBe("image/jpeg");
      const rec = ok<any>(await as("photo", owner).getPhoto(photoIds[k]));
      expect([rec.data.length, Number(rec.size)]).toEqual([0, 2048]);
    }
    expect(ok<any>(await as("photo", admin).getOffChainMigrationStatus())).toEqual({
      enabled: true,
      onChainPhotos: 0n,
      onChainBytes: 0n,
      offChainPhotos: 4n,
    });
    // Quota use is by recorded size, which didn't change.
    expect(await as("photo", admin).getMetrics()).toEqual(before);
    expect((await as("photo", owner).getMyOffChainPhotoIds()).sort()).toEqual(Object.values(photoIds).sort());
  });

  it("PMIG.4 serves moved photos from the Worker; the canister batch returns empty bytes", async () => {
    const res = await get(`/photos/${photoIds.a}`);
    expect(res.status).toBe(200);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(onChain.a);
    const batch = await as("photo", owner).getPhotoDataBatch([photoIds.a, photoIds.b]);
    expect(batch.map(([, data]: [string, Uint8Array]) => data.length)).toEqual([0, 0]);
  });

  it("PMIG.5 moves a photo with a wrong recorded hash under its real hash", async () => {
    const rec = ok<any>(await as("photo", owner).getPhoto(photoIds.wrong));
    expect(rec.hash).toBe(sha256(onChain.wrong));
    expect((await get(`/photos/${photoIds.wrong}`)).headers.get("ETag")).toBe(`"${sha256(onChain.wrong)}"`);
    // Duplicate detection follows the real hash now.
    const again = await as("photo", owner).beginUpload(
      "JOB_E",
      propertyId,
      { Finishing: null },
      "",
      sha256(onChain.wrong),
      2048n,
    );
    expect(again).toEqual({ err: { Duplicate: photoIds.wrong } });
  });

  it("PMIG.6 ignores confirmations it can't vouch for", async () => {
    // Already moved: no change, so a retried confirmation is harmless.
    expect(ok<any>(await as("photo", cron_).confirmOffChain([[photoIds.a, sha256(onChain.a)]]))).toBe(0n);
    // Unknown id, bad hash, and a photo deleted after its page was read.
    const late = ok<any>(
      await as("photo", owner).uploadPhoto("JOB_F", propertyId, { Finishing: null }, "", sha256(image(11)), image(11)),
    ).id;
    ok(await as("photo", owner).deletePhoto(late));
    expect(
      ok<any>(
        await as("photo", cron_).confirmOffChain([
          ["PHOTO_nope", sha256(onChain.a)],
          [late, sha256(image(11))],
        ]),
      ),
    ).toBe(0n);
    const kept = ok<any>(
      await as("photo", owner).uploadPhoto("JOB_G", propertyId, { Finishing: null }, "", sha256(image(13)), image(13)),
    ).id;
    expect(ok<any>(await as("photo", cron_).confirmOffChain([[kept, "abc"]]))).toBe(0n);
    expect(ok<any>(await as("photo", owner).getPhoto(kept)).data.length).toBe(2048);
    // Pausing the canister stops the relay too.
    ok(await as("photo", admin).pause([]));
    expect(errKey(await as("photo", cron_).confirmOffChain([[kept, sha256(image(13))]]))).toBe("Paused");
    ok(await as("photo", admin).unpause());
    // Turning it off stops the relay again.
    ok(await as("photo", admin).setOffChainMigrationEnabled(false));
    expect(errKey(await as("photo", cron_).confirmOffChain([[kept, sha256(image(13))]]))).toBe("InvalidInput");
    expect(ok<any>(await as("photo", owner).getPhoto(kept)).data.length).toBe(2048);
  });

  it("PMIG.7 keeps the cron's calls from the request-path relay and checks every confirmed hash", async () => {
    // The Worker's request-path identity (photo relay) has no say over migration.
    expect(errKey(await as("photo", relay).getOffChainMigrationStatus())).toBe("NotAuthorized");
    expect(errKey(await as("photo", relay).onChainPhotoPage([]))).toBe("NotAuthorized");
    expect(errKey(await as("photo", relay).confirmOffChain([[photoIds.a, sha256(onChain.a)]]))).toBe("NotAuthorized");
    expect(errKey(await as("photo", stranger).addCronRelay(stranger.getPrincipal()))).toBe("NotAuthorized");

    ok(await as("photo", admin).setOffChainMigrationEnabled(true));
    const bytes = image(19);
    const id = ok<any>(
      await as("photo", owner).uploadPhoto("JOB_H", propertyId, { Finishing: null }, "", sha256(bytes), bytes),
    ).id;
    // A hash that isn't the bytes' own is refused, and the bytes stay on-chain.
    expect(ok<any>(await as("photo", cron_).confirmOffChain([[id, sha256(image(23))]]))).toBe(0n);
    const rec = ok<any>(await as("photo", owner).getPhoto(id));
    expect([rec.data.length, rec.hash]).toEqual([2048, sha256(bytes)]);
    // The right one is accepted.
    expect(ok<any>(await as("photo", cron_).confirmOffChain([[id, sha256(bytes)]]))).toBe(1n);
    expect(ok<any>(await as("photo", owner).getPhoto(id)).data.length).toBe(0);
  });

  it("PMIG.8 caps confirmations per day", async () => {
    expect(errKey(await as("photo", stranger).setCronDailyLimits(1n, 1n))).toBe("NotAuthorized");
    // Today's confirmations already exceed 1.
    ok(await as("photo", admin).setCronDailyLimits(1n, 1_000n));
    const bytes = image(29);
    const id = ok<any>(
      await as("photo", owner).uploadPhoto("JOB_I", propertyId, { Finishing: null }, "", sha256(bytes), bytes),
    ).id;
    expect(errKey(await as("photo", cron_).confirmOffChain([[id, sha256(bytes)]]))).toBe("InvalidInput");
    expect(ok<any>(await as("photo", owner).getPhoto(id)).data.length).toBe(2048);
    // Raising it lets the move go on.
    ok(await as("photo", admin).setCronDailyLimits(20_000n, 1_000n));
    expect(ok<any>(await as("photo", cron_).confirmOffChain([[id, sha256(bytes)]]))).toBe(1n);
    ok(await as("photo", admin).setOffChainMigrationEnabled(false));
  });
});
