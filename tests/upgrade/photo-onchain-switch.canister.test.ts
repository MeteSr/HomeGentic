/**
 * photo: the admin switch for on-chain uploads (cycle-drain audit CD-7,
 * 2026-10-31). Once off-chain storage is live an admin turns on-chain
 * uploads off, so photo bytes stop filling the canister's heap.
 *
 * Run: cd tests/upgrade && npx vitest run photo-onchain-switch.canister.test.ts
 * (needs .dfx/local/canisters/photo/photo.wasm)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PocketIc, createIdentity } from "@dfinity/pic";
import { IDL } from "@icp-sdk/core/candid";
import type { Identity } from "@icp-sdk/core/agent";
import { createPic, wasmPath, CONTROLLER } from "./__helpers__/setup";
import { serviceFromWasm } from "./__helpers__/candid";

describe("photo: on-chain upload switch", () => {
  let pic: PocketIc;
  let id: any;
  let svc: IDL.ServiceClass;
  const admin = createIdentity("pos-admin");
  const user = createIdentity("pos-user");
  const as = (who: Identity) => {
    const a = pic.createActor<any>((() => svc) as any, id);
    a.setIdentity(who);
    return a;
  };
  const upload = (who: Identity) =>
    as(who).uploadPhoto("JOB_1", "PROP_1", { Finishing: null }, "", "a".repeat(64), new Uint8Array(16).fill(1));

  beforeAll(async () => {
    pic = await createPic();
    const { idlFactory, initArgs } = serviceFromWasm(wasmPath("photo"));
    svc = idlFactory({ IDL });
    const arg = new Uint8Array(
      IDL.encode(
        initArgs,
        initArgs.map(() => admin.getPrincipal()),
      ),
    );
    id = (await pic.setupCanister({ idlFactory: (() => svc) as any, wasm: wasmPath("photo"), arg })).canisterId;
    await as(CONTROLLER).setBootstrapNonce("n");
    expect(await as(admin).addAdmin(admin.getPrincipal(), "n")).toHaveProperty("ok");
  }, 120_000);

  afterAll(async () => {
    await pic?.tearDown();
  });

  it("is on by default, and only an admin can turn it off", async () => {
    expect(await as(user).getOnChainUploadsEnabled()).toBe(true);
    expect(await as(user).setOnChainUploadsEnabled(false)).toEqual({ err: { NotAuthorized: null } });
    expect(await as(admin).setOnChainUploadsEnabled(false)).toHaveProperty("ok");
    expect(await as(user).getOnChainUploadsEnabled()).toBe(false);
  });

  it("refuses on-chain uploads while off, before any other work", async () => {
    const r = await upload(user);
    expect(JSON.stringify(r)).toMatch(/On-chain photo uploads are off/);
  });

  it("lets them through again once turned back on", async () => {
    expect(await as(admin).setOnChainUploadsEnabled(true)).toHaveProperty("ok");
    // This lone canister isn't wired to property, so the upload now stops
    // there instead: past the switch.
    await expect(upload(user)).rejects.toThrow(/propCanisterId not configured/);
  });
});
