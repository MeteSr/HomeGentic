/**
 * How many verified agents cover a city: the count behind the "Thinking of
 * selling?" prompt and the public seller page, which only offer Bid to List
 * where enough verified agents would bid.
 *
 *  AC.1 counts only verified agents, matching cities case-insensitively
 *  AC.2 anyone can ask (counts only, no profiles); at most 20 cities a call
 *  AC.3 revoking an agent takes them out of the count
 *
 * Run: cd tests/upgrade && npx vitest run agent-coverage.canister.test.ts
 * (needs .dfx/local/canisters/agent/agent.wasm)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PocketIc, createIdentity } from "@dfinity/pic";
import { IDL } from "@icp-sdk/core/candid";
import { AnonymousIdentity, type Identity } from "@icp-sdk/core/agent";
import { createPic, wasmPath, CONTROLLER } from "./__helpers__/setup";
import { serviceFromWasm } from "./__helpers__/candid";

type R<T> = { ok: T } | { err: Record<string, unknown> };
function ok<T>(r: R<T>): T {
  if ("err" in r) throw new Error(`Expected ok, got err: ${JSON.stringify(r.err)}`);
  return r.ok;
}
const errKey = (r: R<unknown>) => ("err" in r ? Object.keys(r.err)[0] : "ok");

describe("agent: verified agents per city", () => {
  let pic: PocketIc;
  let svc: IDL.ServiceClass;
  let cid: any;

  const admin = createIdentity("ac-admin");
  const a1 = createIdentity("ac-a1");
  const a2 = createIdentity("ac-a2");
  const a3 = createIdentity("ac-a3");
  const anon = new AnonymousIdentity();

  const as = (who: Identity) => {
    const a = pic.createActor<any>((() => svc) as any, cid);
    a.setIdentity(who);
    return a;
  };
  const register = (who: Identity, name: string, serviceCities: string[]) =>
    as(who).register({
      name,
      brokerage: "Sunshine Realty",
      licenseNumber: `BK-${name}`,
      licenseState: "FL",
      county: "Orange",
      serviceCities,
      bio: "",
      phone: "",
      email: "",
    });

  beforeAll(async () => {
    pic = await createPic();
    const { idlFactory } = serviceFromWasm(wasmPath("agent"));
    svc = idlFactory({ IDL });
    cid = (await pic.setupCanister({ idlFactory: (() => svc) as any, wasm: wasmPath("agent") })).canisterId;
    await as(CONTROLLER).setBootstrapNonce("n");
    ok(await as(admin).initAdmins([admin.getPrincipal()], "n"));
    ok(await register(a1, "Ann", ["orlando", "winter park"]));
    ok(await register(a2, "Bea", ["Orlando"]));
    ok(await register(a3, "Cal", ["DeLand"]));
  });

  afterAll(async () => {
    await pic?.tearDown();
  });

  it("AC.1 counts only verified agents, matching cities case-insensitively", async () => {
    expect(await as(anon).countVerifiedAgentsForCities(["Orlando", "DeLand"])).toEqual([0n, 0n]);
    ok(await as(admin).verifyAgent(a1.getPrincipal()));
    ok(await as(admin).verifyAgent(a2.getPrincipal()));
    expect(
      await as(anon).countVerifiedAgentsForCities(["Orlando", " orlando ", "Winter Park", "DeLand", "Tampa"]),
    ).toEqual([2n, 2n, 1n, 0n, 0n]);
  });

  it("AC.2 anyone can ask, at most 20 cities a call", async () => {
    expect(await as(a3).countVerifiedAgentsForCities([])).toEqual([]);
    const many = Array.from({ length: 25 }, () => "Orlando");
    const counts = (await as(anon).countVerifiedAgentsForCities(many)) as bigint[];
    expect(counts).toHaveLength(20);
    expect(counts.every((n) => n === 2n)).toBe(true);
  });

  it("AC.3 revoking an agent takes them out of the count", async () => {
    expect(errKey(await as(a1).revokeAgent(a2.getPrincipal()))).toBe("NotAuthorized");
    ok(await as(admin).revokeAgent(a2.getPrincipal()));
    expect(await as(anon).countVerifiedAgentsForCities(["Orlando"])).toEqual([1n]);
  });
});
