/**
 * The admin dashboard's canister reads (dashboard/src/metrics.ts) against
 * real auth, payment and monitoring canisters, through PocketIC's HTTP
 * gateway with the dashboard's own agent library.
 *
 * Checks the dashboard's admin probe (monitoring has no isAdmin query, so it
 * calls resolveFrontendError("") and reads #NotFound as "admin"), that every
 * figure it shows decodes, and that the numbers are the canisters' own.
 *
 * Run: cd tests/upgrade && npx vitest run dashboard-calls.canister.test.ts
 * (needs .dfx/local/canisters/<name>/<name>.wasm and dashboard/node_modules)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PocketIc, createIdentity } from "@dfinity/pic";
import { IDL } from "@icp-sdk/core/candid";
import { Principal } from "@icp-sdk/core/principal";
import type { Identity } from "@icp-sdk/core/agent";
import { resolve } from "path";
import { createPic, wasmPath, CONTROLLER } from "./__helpers__/setup";
import { serviceFromWasm } from "./__helpers__/candid";
import { checkAdmin, fetchDashData, resolveFrontendError } from "../../dashboard/src/metrics";

type R<T> = { ok: T } | { err: Record<string, unknown> };
function ok<T>(r: R<T>): T {
  if ("err" in r) throw new Error(`Expected ok, got err: ${JSON.stringify(r.err, (_k, v) => typeof v === "bigint" ? v.toString() : v)}`);
  return r.ok;
}

// The dashboard's own @icp-sdk/core (the version it ships with), loaded from
// the same file its metrics.ts resolves to, so agent and actor match.
const DASH_CORE = resolve(__dirname, "../../dashboard/node_modules/@icp-sdk/core/lib/esm");

const CANISTERS = ["auth", "payment", "monitoring"] as const;
type Name = typeof CANISTERS[number];

describe("admin dashboard reads on real canisters", () => {
  let pic: PocketIc;
  let host = "";
  const ids = {} as Record<Name, any>;
  const svcs = {} as Record<Name, IDL.ServiceClass>;
  let dash: { HttpAgent: any; Ed25519KeyIdentity: any };

  const admin = createIdentity("dash-admin");
  const as = (name: Name, who: Identity) => {
    const a = pic.createActor<any>((() => svcs[name]) as any, ids[name]);
    a.setIdentity(who);
    return a;
  };
  /** A dashboard session: the dashboard's agent, signed by a fresh key. */
  async function session() {
    const identity = dash.Ed25519KeyIdentity.generate();
    const agent = await dash.HttpAgent.create({ host, identity, shouldFetchRootKey: true });
    return { agent, principal: identity.getPrincipal().toText() as string };
  }
  /** addAdmin, with the nonce for the canisters whose addAdmin takes one. */
  const grantAdmin = (name: Name, p: any) =>
    as(name, admin).addAdmin(...(new Map(svcs[name]._fields).get("addAdmin")!.argTypes.length === 2 ? [p, "n"] : [p]));
  const idText = () => ({ auth: ids.auth.toText(), payment: ids.payment.toText(), monitoring: ids.monitoring.toText() });

  beforeAll(async () => {
    dash = {
      HttpAgent: (await import(`${DASH_CORE}/agent/index.js`)).HttpAgent,
      Ed25519KeyIdentity: (await import(`${DASH_CORE}/identity/index.js`)).Ed25519KeyIdentity,
    };
    pic = await createPic();
    for (const name of CANISTERS) {
      const { idlFactory, initArgs } = serviceFromWasm(wasmPath(name));
      svcs[name] = idlFactory({ IDL });
      const arg = new Uint8Array(IDL.encode(initArgs, initArgs.map(() => admin.getPrincipal())));
      ids[name] = (await pic.setupCanister({ idlFactory: (() => svcs[name]) as any, wasm: wasmPath(name), arg })).canisterId;
      const methods = new Map(svcs[name]._fields);
      if (methods.has("setBootstrapNonce")) await as(name, CONTROLLER).setBootstrapNonce("n");
      if (methods.has("initAdmins")) ok(await as(name, admin).initAdmins([admin.getPrincipal()], "n"));
      else ok(await grantAdmin(name, admin.getPrincipal()));
    }
    // Some data for the figures: two homeowners, one paid plan, one error.
    for (const who of [createIdentity("dash-u1"), createIdentity("dash-u2")]) {
      ok(await as("auth", who).register({ role: { Homeowner: null }, email: "u@example.com", phone: "555-0100" }));
    }
    ok(await as("payment", admin).adminActivateStripeSubscription(createIdentity("dash-u1").getPrincipal(), { Pro: null }, 12n));
    const now = BigInt(await pic.getTime()) * 1_000_000n;
    await as("monitoring", admin).recordFrontendError({
      fingerprint: "fp-dash", message: "boom", errorType: "Error", count: 2n,
      firstSeen: now, lastSeen: now, tierCounts: [["Free", 2n]], release: [],
    });
    host = `http://localhost:${await pic.makeLive()}`;
  }, 120_000);

  afterAll(async () => {
    await pic?.stopLive().catch(() => {});
    await pic?.tearDown();
  });

  it("finds no admin role for a principal on no admin list", async () => {
    const s = await session();
    expect(await checkAdmin(s.agent, s.principal, idText())).toEqual({ auth: false, payment: false, monitoring: false });
  });

  it("finds each admin role the canisters grant, and reads every figure", async () => {
    const s = await session();
    const p = Principal.fromText(s.principal);
    for (const name of CANISTERS) ok(await grantAdmin(name, p));
    expect(await checkAdmin(s.agent, s.principal, idText())).toEqual({ auth: true, payment: true, monitoring: true });

    const d = await fetchDashData(s.agent, idText());
    expect(d.users.total).toBe(2n);
    expect(d.users.homeowners).toBe(2n);
    expect(d.subs.pro).toBe(1n);
    expect(d.errorStats.unresolved).toBe(1n);
    expect(d.recentErrors.map((e) => [e.fingerprint, e.count])).toEqual([["fp-dash", 2n]]);
    expect(typeof d.costs.totalUsdCost).toBe("number");
    expect(typeof d.profitability.marginPct).toBe("number");

    await resolveFrontendError(s.agent, ids.monitoring.toText(), "fp-dash");
    expect((await fetchDashData(s.agent, idText())).errorStats.unresolved).toBe(0n);
  });
});
