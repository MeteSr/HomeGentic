/**
 * The insurance risk profile reads the home's sensors from the sensor
 * canister, on real report, sensor and property canisters wired as
 * deploy.sh wires them.
 *
 * report.generateRiskProfile is an update call; sensor's device list was a
 * composite query, which an update can't call, and both sensor reads
 * answered only owners, admins and gateways, never the report canister. So
 * with sensor wired, every risk profile failed. Found by
 * scripts/ci/check-canister-calls.sh.
 *
 * Run: cd tests/upgrade && npx vitest run report-sensor.canister.test.ts
 * (needs .dfx/local/canisters/{report,sensor,property}/*.wasm)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PocketIc, createIdentity } from "@dfinity/pic";
import { IDL } from "@icp-sdk/core/candid";
import type { Identity } from "@icp-sdk/core/agent";
import { createPic, wasmPath, CONTROLLER } from "./__helpers__/setup";
import { serviceFromWasm } from "./__helpers__/candid";

type R<T> = { ok: T } | { err: Record<string, unknown> };
function ok<T>(r: R<T>): T {
  if ("err" in r) throw new Error(`Expected ok, got err: ${JSON.stringify(r.err, (_k, v) => typeof v === "bigint" ? v.toString() : v)}`);
  return r.ok;
}

const CANISTERS = ["report", "sensor", "property"] as const;
type Name = typeof CANISTERS[number];

describe("report: risk profile with sensors wired", () => {
  let pic: PocketIc;
  const ids = {} as Record<Name, any>;
  const svcs = {} as Record<Name, IDL.ServiceClass>;
  let propertyId = "";

  const admin = createIdentity("rs-admin");
  const owner = createIdentity("rs-owner");
  const other = createIdentity("rs-other");

  const as = (name: Name, who: Identity) => {
    const a = pic.createActor<any>((() => svcs[name]) as any, ids[name]);
    a.setIdentity(who);
    return a;
  };

  beforeAll(async () => {
    pic = await createPic();
    for (const name of CANISTERS) {
      const { idlFactory, initArgs } = serviceFromWasm(wasmPath(name));
      svcs[name] = idlFactory({ IDL });
      const arg = new Uint8Array(IDL.encode(initArgs, initArgs.map(() => admin.getPrincipal())));
      ids[name] = (await pic.setupCanister({ idlFactory: (() => svcs[name]) as any, wasm: wasmPath(name), arg })).canisterId;
      await as(name, CONTROLLER).setBootstrapNonce("n");
      ok(await as(name, admin).addAdmin(admin.getPrincipal(), "n"));
    }
    // deploy.sh's wiring.
    ok(await as("report", admin).setPropertyCanisterId(ids.property.toText()));
    ok(await as("report", admin).setSensorCanisterId(ids.sensor.toText()));
    ok(await as("sensor", admin).setPropertyCanisterId(ids.property.toText()));
    ok(await as("sensor", admin).addTrustedReader(ids.report));

    propertyId = ok<any>(await as("property", owner).registerProperty({
      address: "12 Elm Street", city: "Orlando", state: "FL", zipCode: "32801",
      propertyType: { SingleFamily: null }, yearBuilt: 1998n, squareFeet: 1850n, tier: { Free: null },
    })).id;
    ok(await as("sensor", owner).registerDevice(propertyId, "moen-123", { MoenFlo: null }, "Kitchen leak sensor"));
  }, 120_000);

  afterAll(async () => { await pic?.tearDown(); });

  it("includes the home's sensors in the owner's risk profile", async () => {
    const profile = ok<any>(await as("report", owner).generateRiskProfile(propertyId, [], "Basic"));
    expect(profile.sensorCoverage.map((s: any) => [s.name, s.source])).toEqual([["Kitchen leak sensor", "MoenFlo"]]);
  });

  it("still refuses a stranger's risk profile", async () => {
    expect(Object.keys((await as("report", other).generateRiskProfile(propertyId, [], "Basic")).err)[0]).toBe("NotAuthorized");
  });

  it("lets only admins and trusted readers use the reader methods", async () => {
    expect(await as("sensor", other).getDevicesForReader(propertyId)).toEqual([]);
    expect(await as("sensor", other).getEventsForProperty(propertyId, 0n)).toEqual([]);
    expect(Object.keys((await as("sensor", other).addTrustedReader(other.getPrincipal())).err)[0]).toBe("NotAuthorized");
  });
});
