/**
 * Neighbourhood scores and their vetKD cost (cycle-drain audit CD-2 and
 * CD-10, 2026-10-31). market scores a home from the property and job
 * canisters' own records, only for a caller who can edit the home, and caps
 * the paid vetKD derive behind getMyScoreEncrypted per caller and per day.
 * property, job and market are wired as deploy.sh wires them; the II subnet
 * provides test_key_1.
 *
 * Run: cd tests/upgrade && npx vitest run market-score.canister.test.ts
 * (needs .dfx/local/canisters/{property,job,market}/*.wasm)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PocketIc, createIdentity, SubnetStateType } from "@dfinity/pic";
import { IDL } from "@icp-sdk/core/candid";
import type { Identity } from "@icp-sdk/core/agent";
import { TransportSecretKey } from "@dfinity/vetkeys";
import { createPic, wasmPath, CONTROLLER } from "./__helpers__/setup";
import { serviceFromWasm } from "./__helpers__/candid";

type R<T> = { ok: T } | { err: Record<string, unknown> };
function ok<T>(r: R<T>): T {
  if ("err" in r)
    throw new Error(
      `Expected ok, got err: ${JSON.stringify(r.err, (_k, v) => (typeof v === "bigint" ? v.toString() : v))}`,
    );
  return r.ok;
}
const errKey = (r: R<unknown>) => ("err" in r ? Object.keys(r.err)[0] : "ok");
const errText = (r: R<unknown>) => ("err" in r ? JSON.stringify(r.err) : "ok");

const CANISTERS = ["property", "job", "market"] as const;
type Name = (typeof CANISTERS)[number];
const DAY_MS = 24 * 60 * 60 * 1000;

describe("market: neighbourhood scores", () => {
  let pic: PocketIc;
  const ids = {} as Record<Name, any>;
  const svcs = {} as Record<Name, IDL.ServiceClass>;
  let propertyId = "";

  const admin = createIdentity("ms-admin");
  const owner = createIdentity("ms-owner");
  const stranger = createIdentity("ms-stranger");

  const as = (name: Name, who: Identity) => {
    const a = pic.createActor<any>((() => svcs[name]) as any, ids[name]);
    a.setIdentity(who);
    return a;
  };
  const derive = (who: Identity) => as("market", who).getMyScoreEncrypted(TransportSecretKey.random().publicKeyBytes());

  async function home(who: Identity, street: string): Promise<string> {
    return ok<any>(
      await as("property", who).registerProperty({
        address: street,
        city: "Orlando",
        state: "FL",
        zipCode: "32801",
        propertyType: { SingleFamily: null },
        yearBuilt: 2005n,
        squareFeet: 1900n,
        tier: { Free: null },
      }),
    ).id;
  }
  async function addJob(who: Identity, prop: string) {
    const done = BigInt((await pic.getTime()) - DAY_MS * 30) * 1_000_000n;
    ok(
      await as("job", who).createJob(
        prop,
        "New roof",
        { Roofing: null },
        "Roof replaced.",
        [],
        0n,
        done,
        [],
        [],
        true,
        [],
      ),
    );
  }

  beforeAll(async () => {
    pic = await createPic({
      ii: { state: { type: SubnetStateType.New } },
      application: [{ state: { type: SubnetStateType.New } }],
    });
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
      await as(name, CONTROLLER).setBootstrapNonce("n");
      ok(await as(name, admin).addAdmin(admin.getPrincipal(), "n"));
    }
    ok(await as("job", admin).setPropertyCanisterId(ids.property.toText()));
    ok(await as("market", admin).setPropertyCanisterId(ids.property.toText()));
    ok(await as("market", admin).setJobCanisterId(ids.job.toText()));
    propertyId = await home(owner, "9 Palm Court");
  }, 180_000);

  afterAll(async () => {
    await pic?.tearDown();
  });

  it("won't score a home for someone who can't edit it", async () => {
    expect(errKey(await as("market", stranger).submitScore(propertyId))).toBe("NotAuthorized");
    expect(errKey(await as("market", stranger).submitScore("NOPE"))).toBe("NotAuthorized");
  });

  it("won't score a home with no jobs", async () => {
    expect(errText(await as("market", owner).submitScore(propertyId))).toMatch(/Add a job/);
  });

  it("scores from the canisters' records, with the property's own zip", async () => {
    await addJob(owner, propertyId);
    const stored = ok<any>(await as("market", owner).submitScore(propertyId));
    expect(stored.zipCode).toBe("32801");
    const computed = await as("market", admin).computePropertyScore(propertyId);
    expect(Number(stored.score)).toBe(Number(computed[0]));
  });

  it("only derives for a caller with a score, 3 times a day", async () => {
    // No score: refused before any cycles are spent.
    expect(errKey(await derive(stranger))).toBe("NotFound");

    for (let i = 0; i < 3; i++) {
      const env = ok<any>(await derive(owner));
      expect(env.encryptedKey.length).toBeGreaterThan(0);
      expect(env.zipCode).toBe("32801");
    }
    expect(errText(await derive(owner))).toMatch(/Daily encrypted-score limit/);

    await pic.advanceTime(DAY_MS + 1000);
    await pic.tick();
    ok(await derive(owner));
  });

  it("publishes zip stats only from real scored homes, once five are in", async () => {
    const neighbours = [1, 2, 3, 4].map((i) => createIdentity(`ms-n${i}`));
    for (const [i, n] of neighbours.entries()) {
      const prop = await home(n, `${10 + i} Palm Court`);
      await addJob(n, prop);
      if (i < 3) ok(await as("market", n).submitScore(prop));
    }
    expect(errKey(await as("market", stranger).getZipStats("32801"))).toBe("NotFound");
    const last = neighbours[3];
    const props = await as("property", last).getMyProperties();
    ok(await as("market", last).submitScore(props[0].id));
    const stats = ok<any>(await as("market", stranger).getZipStats("32801"));
    expect(Number(stats.sampleSize)).toBe(5);
  });
});
