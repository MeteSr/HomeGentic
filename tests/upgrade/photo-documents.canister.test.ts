/**
 * photo: the home document vault's own limit (2026-11-07). Documents are
 * filed under the synthetic job id "docs_<propertyId>" (the Documents tab).
 * They used to share the per-job photo limit, so a Free home could keep only
 * five documents; now documents have a per-home limit of their own and don't
 * use up the home's photo allowance.
 *
 * Run: cd tests/upgrade && npx vitest run photo-documents.canister.test.ts
 * (needs .dfx/local/canisters/<name>/<name>.wasm for photo, property, payment)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PocketIc, createIdentity } from "@dfinity/pic";
import { IDL } from "@icp-sdk/core/candid";
import type { Identity } from "@icp-sdk/core/agent";
import { createHash } from "crypto";
import { createPic, wasmPath, CONTROLLER } from "./__helpers__/setup";
import { serviceFromWasm } from "./__helpers__/candid";

type R<T> = { ok: T } | { err: Record<string, unknown> };
function ok<T>(r: R<T>): T {
  if ("err" in r) throw new Error(`Expected ok, got err: ${JSON.stringify(r.err)}`);
  return r.ok;
}

const CANISTERS = ["property", "payment", "photo"] as const;
type Name = (typeof CANISTERS)[number];

/** Free and Pro document limits per home (photo canister DOC_LIMIT_*). */
const FREE_DOCS = 25;

describe("photo: document vault limit", () => {
  let pic: PocketIc;
  const ids = {} as Record<Name, any>;
  const svcs = {} as Record<Name, IDL.ServiceClass>;
  let n = 0;
  const admin = createIdentity("pdoc-admin");
  const who = (tag: string) => createIdentity(`pdoc-${tag}-${++n}`);

  const as = (name: Name, id: Identity) => {
    const a = pic.createActor<any>((() => svcs[name]) as any, ids[name]);
    a.setIdentity(id);
    return a;
  };
  async function wire(name: Name, setter: string, target: Name) {
    const arg = new Map(svcs[name]._fields).get(setter)!.argTypes[0];
    ok(await as(name, admin)[setter](arg.name === "principal" ? ids[target] : ids[target].toText()));
  }
  async function freeHome(owner: Identity): Promise<string> {
    return ok<any>(
      await as("property", owner).registerProperty({
        address: `${++n} Vault Way`,
        city: "DeLand",
        state: "FL",
        zipCode: "32720",
        propertyType: { SingleFamily: null },
        yearBuilt: 1998n,
        squareFeet: 1500n,
        tier: { Free: null },
      }),
    ).id;
  }
  /** Uploads one distinct file; waits out the 10-a-minute limit every 10 uploads. */
  let sinceWait = 0;
  async function upload(owner: Identity, jobId: string, propertyId: string, description = "") {
    if (++sinceWait > 10) {
      await pic.advanceTime(61_000);
      await pic.tick();
      sinceWait = 1;
    }
    const bytes = new Uint8Array([7, 7, ++n % 256, Math.floor(n / 256)]);
    const hash = createHash("sha256").update(bytes).digest("hex");
    return as("photo", owner).uploadPhoto(jobId, propertyId, { PostConstruction: null }, description, hash, bytes);
  }

  beforeAll(async () => {
    pic = await createPic();
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
      else ok(await as(name, admin).addAdmin(admin.getPrincipal(), "n"));
    }
    await wire("property", "setPaymentCanisterId", "payment");
    await wire("photo", "setPropertyCanisterId", "property");
    await wire("photo", "setPaymentCanisterId", "payment");
    ok(await as("property", admin).addTrustedCanister(ids.photo));
  }, 180_000);

  afterAll(async () => {
    await pic?.tearDown();
  });

  it("a Free home keeps more than five documents", async () => {
    const owner = who("six");
    const prop = await freeHome(owner);
    for (let i = 0; i < 6; i++) ok(await upload(owner, `docs_${prop}`, prop, `[Deed] page-${i}.pdf`));
    expect((await as("photo", owner).getPhotosByJob(`docs_${prop}`)).length).toBe(6);
  });

  it("stops at the document limit with a message about documents", async () => {
    const owner = who("full");
    const prop = await freeHome(owner);
    for (let i = 0; i < FREE_DOCS; i++) ok(await upload(owner, `docs_${prop}`, prop));
    const r = await upload(owner, `docs_${prop}`, prop);
    expect(Object.keys((r as any).err)[0]).toBe("QuotaExceeded");
    const msg = String(Object.values((r as any).err)[0]);
    expect(msg).toMatch(/document limit \(25\)/i);
    expect(msg).toMatch(/250 documents/);
    expect(msg).not.toMatch(/photos\/job/);

    // Documents don't use up the home's photo allowance.
    ok(await upload(owner, "JOB_ROOF", prop));
  });

  it("job photos still keep the five-photo limit", async () => {
    const owner = who("photos");
    const prop = await freeHome(owner);
    for (let i = 0; i < 5; i++) ok(await upload(owner, "JOB_HVAC", prop));
    expect(Object.keys(((await upload(owner, "JOB_HVAC", prop)) as any).err)[0]).toBe("QuotaExceeded");
  });

  it("documents must be filed under their own home", async () => {
    const owner = who("cross");
    const home = await freeHome(owner);
    const r = await upload(owner, "docs_SOMEONE_ELSES_HOME", home);
    expect(JSON.stringify((r as any).err)).toMatch(/documents must be uploaded to their own property/);
  });
});
