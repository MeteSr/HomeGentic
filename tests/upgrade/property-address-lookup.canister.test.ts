/**
 * property.findPropertiesByAddress: how a contractor's voice-agent job
 * proposal finds the home from the street address they say.
 *
 * Run: cd tests/upgrade && npx vitest run property-address-lookup.canister.test.ts
 * (needs .dfx/local/canisters/property/property.wasm)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PocketIc, createIdentity } from "@dfinity/pic";
import type { Identity } from "@icp-sdk/core/agent";
import { AnonymousIdentity } from "@icp-sdk/core/agent";
import { createPic, wasmPath } from "./__helpers__/setup";
import { idlFactory as propertyIdl } from "../../packages/shared/src/declarations/property";

type R<T> = { ok: T } | { err: Record<string, unknown> };
function ok<T>(r: R<T>): T {
  if ("err" in r) throw new Error(`Expected ok, got err: ${JSON.stringify(r.err)}`);
  return r.ok;
}

describe("property.findPropertiesByAddress", () => {
  let pic: PocketIc;
  let property: any;
  const contractor = createIdentity("addr-contractor");
  const owners: Record<string, Identity> = {};
  const ids: Record<string, string> = {};

  async function register(key: string, address: string, city: string, zipCode: string) {
    owners[key] = createIdentity(`addr-owner-${key}`);
    property.setIdentity(owners[key]);
    const p = ok<any>(
      await property.registerProperty({
        address,
        city,
        state: "FL",
        zipCode,
        propertyType: { SingleFamily: null },
        yearBuilt: 1998n,
        squareFeet: 1850n,
        tier: { Free: null },
      }),
    );
    ids[key] = p.id;
  }

  const find = async (search: string, who: Identity = contractor) => {
    property.setIdentity(who);
    return (await property.findPropertiesByAddress(search)) as Array<{ id: string; owner: any; address: string }>;
  };

  beforeAll(async () => {
    pic = await createPic();
    const f = await pic.setupCanister({ idlFactory: propertyIdl, wasm: wasmPath("property") });
    property = f.actor;
    await register("elmOrlando", "12 North Elm Street", "Orlando", "32801");
    await register("elmTampa", "12 N Elm St", "Tampa", "33602");
    await register("oak", "400 Oak Avenue", "Orlando", "32803");
  });

  afterAll(async () => {
    await pic?.tearDown();
  });

  it("finds the home from a spoken address, whatever the street-word spelling", async () => {
    const hits = await find("400 oak ave., Orlando, FL 32803");
    expect(hits.map((h) => h.id)).toEqual([ids.oak]);
    expect(hits[0].owner.toText()).toBe(owners.oak.getPrincipal().toText());
    expect(hits[0].address).toBe("400 Oak Avenue, Orlando, FL 32803");
  });

  it("returns every home on that street address when no city or ZIP is given", async () => {
    const hits = await find("12 north elm st");
    expect(hits.map((h) => h.id).sort()).toEqual([ids.elmOrlando, ids.elmTampa].sort());
  });

  it("narrows by city or ZIP after the street", async () => {
    expect((await find("12 N. Elm Street, Tampa")).map((h) => h.id)).toEqual([ids.elmTampa]);
    expect((await find("12 Elm St North 32801")).map((h) => h.id)).toEqual([]); // street words in the wrong order
    expect((await find("12 n elm st 32801")).map((h) => h.id)).toEqual([ids.elmOrlando]);
  });

  it("keeps a match when only a unit follows the street", async () => {
    expect((await find("400 Oak Ave Apt 4")).map((h) => h.id)).toEqual([ids.oak]);
  });

  it("finds nothing for another city, a partial street or an anonymous caller", async () => {
    expect(await find("400 Oak Ave, Miami")).toEqual([]);
    expect(await find("400 Oak")).toEqual([]);
    expect(await find("12 n elm st", new AnonymousIdentity() as unknown as Identity)).toEqual([]);
  });
});
