/**
 * The bills canister limits each caller's update calls per minute, like the
 * other user-facing canisters (backend/shared/RateLimit.mo). Its records are
 * reachable through the ChatGPT and Claude connectors (ICP MCP), so a script
 * or a looping assistant must not be able to call it without bound.
 *
 *  BRL.1 the default limit is 30 calls a minute; the 31st answers #RateLimited
 *  BRL.2 the window resets after a minute
 *  BRL.3 an admin can change the limit with setUpdateRateLimit; 0 turns it off
 *  BRL.4 only an admin can call setUpdateRateLimit, and admins aren't counted
 *  BRL.5 the limit survives an upgrade (it's a stable var)
 *
 * Run: cd tests/upgrade && npx vitest run bills-rate-limit.canister.test.ts
 * (needs .dfx/local/canisters/bills/bills.wasm)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PocketIc, createIdentity } from "@dfinity/pic";
import { createPic, wasmPath, withMethods } from "./__helpers__/setup";
import { idlFactory as billsIdl } from "../../packages/shared/src/declarations/bills";

type R = { ok: unknown } | { err: Record<string, unknown> };
const errKey = (r: R) => ("err" in r ? Object.keys(r.err)[0] : "ok");

const idl = withMethods(billsIdl as any, (I) => {
  const Unit = I.Variant({ ok: I.Null, err: I.Reserved });
  return {
    setBootstrapNonce: I.Func([I.Text], [], []),
    addAdmin: I.Func([I.Principal, I.Text], [Unit], []),
    setUpdateRateLimit: I.Func([I.Nat], [Unit], []),
  };
});

describe("bills per-minute rate limit", () => {
  let pic: PocketIc;
  let bills: any;
  let canisterId: any;
  const admin = createIdentity("bills-rl-admin");
  const user = createIdentity("bills-rl-user");

  // deleteBill runs the paused/rate-limit check before looking the bill up, so
  // a missing id answers #NotFound until the caller is over the limit.
  const del = (who = user) => {
    bills.setIdentity(who);
    return bills.deleteBill("BILL_missing") as Promise<R>;
  };
  const nextWindow = async () => {
    await pic.advanceTime(61_000);
    await pic.tick();
  };

  beforeAll(async () => {
    pic = await createPic();
    const f = await pic.setupCanister({ idlFactory: idl as any, wasm: wasmPath("bills") });
    bills = f.actor;
    canisterId = f.canisterId;
    await bills.setBootstrapNonce("n");
    bills.setIdentity(admin);
    await bills.addAdmin(admin.getPrincipal(), "n");
  });

  afterAll(async () => {
    await pic?.tearDown();
  });

  it("BRL.1 allows 30 update calls a minute, then answers #RateLimited", async () => {
    for (let i = 0; i < 30; i++) expect(errKey(await del())).toBe("NotFound");
    expect(errKey(await del())).toBe("RateLimited");
  });

  it("BRL.2 resets the window after a minute", async () => {
    await nextWindow();
    expect(errKey(await del())).toBe("NotFound");
  });

  it("BRL.3 setUpdateRateLimit changes the limit; 0 turns it off", async () => {
    bills.setIdentity(admin);
    expect(errKey(await bills.setUpdateRateLimit(2n))).toBe("ok");
    await nextWindow();
    expect(errKey(await del())).toBe("NotFound");
    expect(errKey(await del())).toBe("NotFound");
    expect(errKey(await del())).toBe("RateLimited");

    bills.setIdentity(admin);
    await bills.setUpdateRateLimit(0n);
    for (let i = 0; i < 5; i++) expect(errKey(await del())).toBe("NotFound");
  });

  it("BRL.4 only an admin can set the limit, and admins aren't counted", async () => {
    bills.setIdentity(user);
    // The admin-method result type is decoded loosely here, so check it's an err.
    expect(await bills.setUpdateRateLimit(1000n)).toHaveProperty("err");

    bills.setIdentity(admin);
    await bills.setUpdateRateLimit(1n);
    await nextWindow();
    for (let i = 0; i < 3; i++) expect(errKey(await del(admin))).toBe("NotFound");
  });

  it("BRL.5 keeps the configured limit across an upgrade", async () => {
    // Limit is 1 from BRL.4.
    await pic.upgradeCanister({ canisterId, wasm: wasmPath("bills") });
    await nextWindow();
    expect(errKey(await del())).toBe("NotFound");
    expect(errKey(await del())).toBe("RateLimited");
  });
});
