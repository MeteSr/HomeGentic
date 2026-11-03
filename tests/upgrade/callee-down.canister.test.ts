/**
 * A sibling canister that doesn't answer (stopped for an upgrade, out of
 * cycles, trapping): callers return #Unavailable, change nothing, and work
 * again once it's back (CLAUDE.md → Errors; ICP skills audit M-4).
 *
 * All 20 canisters are deployed and wired as CI wires them; then property,
 * payment or listing is stopped and every dependent write is called.
 *
 *  DOWN.1 property stopped: job, bills, recurring, maintenance, quote, photo,
 *         market and report writes on a home answer #Unavailable
 *  DOWN.2 payment stopped: registering a home and inviting a manager answer
 *         #Unavailable, and the caller's in-flight lock is released
 *  DOWN.3 nothing was written while the callee was down, and the same calls
 *         succeed after it restarts
 *
 * Run: cd tests/upgrade && npx vitest run callee-down.canister.test.ts
 * (needs .dfx/local/canisters/<all>/<name>.wasm)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PocketIc, createIdentity } from "@dfinity/pic";
import type { Identity } from "@icp-sdk/core/agent";
import { createPic, CONTROLLER } from "./__helpers__/setup";
import { deployAll, type Deployment, type CanisterName } from "./__helpers__/deployAll";

type R<T> = { ok: T } | { err: Record<string, unknown> };
const ok = <T,>(r: R<T>): T => {
  if ("err" in r) throw new Error(`Expected ok, got err: ${JSON.stringify(r.err, (_k, v) => (typeof v === "bigint" ? v.toString() : v))}`);
  return r.ok;
};
/** The error tag, "ok", or "rejected" when the call itself was rejected. */
async function outcome(p: Promise<any>): Promise<string> {
  try {
    const r = await p;
    if (r && typeof r === "object" && "err" in r) return Object.keys(r.err)[0];
    return "ok";
  } catch (e) {
    return `rejected: ${String((e as Error).message).split("\n")[0].slice(0, 160)}`;
  }
}

describe("callers when a sibling canister is down", () => {
  let pic: PocketIc;
  let d: Deployment;
  let n = 0;
  const admin = createIdentity("down-admin");
  const as = (name: CanisterName, who: Identity) => d.actor(name, who);

  async function proUser(): Promise<Identity> {
    const u = createIdentity(`down-user-${++n}`);
    ok(await as("payment", admin).grantSubscription(u.getPrincipal(), { Pro: null }));
    return u;
  }
  async function home(owner: Identity): Promise<string> {
    const r = await as("property", owner).registerProperty({
      address: `${++n} Outage Way`, city: "Orlando", state: "FL", zipCode: "32801",
      propertyType: { SingleFamily: null }, yearBuilt: 1998n, squareFeet: 1850n, tier: { Pro: null },
    });
    return (ok(r) as any).id;
  }
  const stop = (name: CanisterName) => pic.stopCanister({ canisterId: d.ids[name], sender: CONTROLLER.getPrincipal() });
  const start = (name: CanisterName) => pic.startCanister({ canisterId: d.ids[name], sender: CONTROLLER.getPrincipal() });

  /** Every write that asks property about the home first. */
  const homeWrites = (owner: Identity, pid: string): Record<string, () => Promise<any>> => ({
    "job.createJob": () =>
      as("job", owner).createJob(pid, "Water heater", { Plumbing: null }, "Replaced it.", [], 0n, 0n, [], [], true, []),
    "bills.addBill": () =>
      as("bills", owner).addBill({
        propertyId: pid, billType: { Electric: null }, provider: "Duke", periodStart: "2026-09-01",
        periodEnd: "2026-09-30", amountCents: 12_000n, usageAmount: [], usageUnit: [],
      }),
    "recurring.createRecurringService": () =>
      as("recurring", owner).createRecurringService(pid, { LawnCare: null }, "Green Co", [], [], { Monthly: null }, "2026-01-01", [], []),
    "maintenance.createScheduleEntry": () =>
      as("maintenance", owner).createScheduleEntry(pid, "HVAC", "Annual service", 2027n, [3n], [20_000n]),
    "quote.createQuoteRequest": () =>
      as("quote", owner).createQuoteRequest(pid, { HVAC: null }, "AC out", { High: null }, [], [], [], [], []),
    "market.submitScore": () => as("market", owner).submitScore(pid),
  });

  /** Writes whose success needs more set-up (a verified home), checked only while the callee is down. */
  const downOnlyWrites = (owner: Identity, pid: string): Record<string, () => Promise<any>> => ({
    "report.generateReport": () =>
      as("report", owner).generateReport(
        pid,
        { address: "ignored", city: "", state: "", zipCode: "", propertyType: "", yearBuilt: 0n, squareFeet: 0n, verificationLevel: "Premium" },
        [], [], [], { Public: null }, [], [], [], [], [], [],
      ),
  });

  beforeAll(async () => {
    pic = await createPic();
    d = await deployAll(pic, admin);
  });
  afterAll(async () => { await pic?.tearDown(); });

  it("DOWN.1 with property stopped, writes on a home answer #Unavailable and store nothing", async () => {
    const owner = await proUser();
    const pid = await home(owner);
    const writes = homeWrites(owner, pid);

    const all = { ...writes, ...downOnlyWrites(owner, pid) };

    await stop("property");
    const got: Record<string, string> = {};
    for (const [name, call] of Object.entries(all)) got[name] = await outcome(call());
    await start("property");

    expect(got).toEqual(Object.fromEntries(Object.keys(all).map((k) => [k, "Unavailable"])));

    // DOWN.3: nothing was stored while property was down, and the same writes work now.
    expect(ok(await as("job", owner).getJobsForProperty(pid))).toHaveLength(0);
    expect(await as("recurring", owner).getByProperty(pid)).toHaveLength(0);
    expect(await as("maintenance", owner).getScheduleByProperty(pid)).toHaveLength(0);
    for (const [name, call] of Object.entries(writes)) expect([name, await outcome(call())]).toEqual([name, "ok"]);
  });

  it("DOWN.1 with job stopped, scoring a home answers #Unavailable", async () => {
    const owner = await proUser();
    const pid = await home(owner);
    ok(await as("job", owner).createJob(pid, "Roof", { Roofing: null }, "New roof.", [], 0n, 0n, [], [], true, []));
    const calls = { "market.submitScore": () => as("market", owner).submitScore(pid) };

    await stop("job");
    const got: Record<string, string> = {};
    for (const [name, call] of Object.entries(calls)) got[name] = await outcome(call());
    await start("job");

    expect(got).toEqual(Object.fromEntries(Object.keys(calls).map((k) => [k, "Unavailable"])));
    expect(await outcome(as("market", owner).submitScore(pid))).toBe("ok");
  });

  it("DOWN.2 with payment stopped, registering a home and inviting a manager answer #Unavailable", async () => {
    const owner = await proUser();
    const pid = await home(owner);

    await stop("payment");
    const register = await outcome(as("property", owner).registerProperty({
      address: `${++n} Outage Way`, city: "Orlando", state: "FL", zipCode: "32801",
      propertyType: { SingleFamily: null }, yearBuilt: 2001n, squareFeet: 1500n, tier: { Pro: null },
    }));
    const invite = await outcome(as("property", owner).inviteManager(pid, { Manager: null }, "Morgan", []));
    await start("payment");

    expect({ register, invite }).toEqual({ register: "Unavailable", invite: "Unavailable" });

    // DOWN.3: the in-flight registration lock was released, so the next try works.
    expect(await as("property", owner).getMyProperties()).toHaveLength(1);
    await home(owner);
    ok(await as("property", owner).inviteManager(pid, { Manager: null }, "Morgan", []));
  });
});
