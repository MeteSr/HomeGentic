/**
 * Paying for a plan in ICP (payment.subscribe / getPriceQuote) on a real
 * payment canister, against test doubles of the ICP ledger and the exchange
 * rate canister installed at their mainnet ids (tests/upgrade/mocks/).
 *
 *  SUB.1 the quote is the USD price at the XRC rate plus a 5% buffer; Free is 0
 *  SUB.2 a paid subscribe pulls exactly the price from the caller to payment, once
 *  SUB.3 a refused transfer (allowance, funds) charges nothing and changes no plan
 *  SUB.4 a rejected ledger call frees the caller's lock, so a retry goes through
 *  SUB.5 an XRC error or rejection fails the payment before the ledger is called
 *  SUB.6 the rate is cached for five minutes and attaches the XRC's 1B cycles
 *  SUB.7 two subscribes from one caller in one round charge once
 *  SUB.8 anonymous callers can't subscribe
 *
 * Run: cd tests/upgrade && npx vitest run payment-subscribe.canister.test.ts
 * (needs .dfx/local/canisters/{payment,mock_icp_ledger,mock_xrc}/*.wasm,
 *  built by scripts/ci/build-upgrade-wasms.sh)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PocketIc, createIdentity, SubnetStateType } from "@dfinity/pic";
import { IDL } from "@icp-sdk/core/candid";
import { Principal } from "@icp-sdk/core/principal";
import { AnonymousIdentity, type Identity } from "@icp-sdk/core/agent";
import { createPic, wasmPath, sameRound } from "./__helpers__/setup";
import { idlFactory as paymentIdl } from "../../packages/shared/src/declarations/payment";

const LEDGER_ID = Principal.fromText("ryjl3-tyaaa-aaaaa-aaaba-cai");
const XRC_ID = Principal.fromText("uf6dk-hyaaa-aaaaq-qaaaq-cai");

const ledgerIdl = ({ IDL: I }: { IDL: typeof IDL }) => {
  const Call = I.Record({ caller: I.Principal, from: I.Principal, to: I.Principal, amount: I.Nat, fee: I.Opt(I.Nat) });
  return I.Service({ setMode: I.Func([I.Text], [], []), getCalls: I.Func([], [I.Vec(Call)], ["query"]) });
};
const xrcIdl = ({ IDL: I }: { IDL: typeof IDL }) =>
  I.Service({
    setRate: I.Func([I.Nat64, I.Nat32], [], []),
    setMode: I.Func([I.Text], [], []),
    callCount: I.Func([], [I.Nat], ["query"]),
    lastCyclesAttached: I.Func([], [I.Nat], ["query"]),
  });

type R<T> = { ok: T } | { err: Record<string, unknown> };
const ok = <T>(r: R<T>): T => {
  if ("err" in r) throw new Error(`Expected ok, got err: ${JSON.stringify(r.err)}`);
  return r.ok;
};
const errOf = (r: R<unknown>) => ("err" in r ? Object.keys(r.err)[0] : "ok");
const tierOf = (t: Record<string, null>) => Object.keys(t)[0];

const MIN_NS = 60n * 1_000_000_000n;
const YEAR_NS = 365n * 24n * 60n * MIN_NS;
// $10.00 per ICP at 8 decimals: Pro ($59) = 5.9 ICP = 590_000_000 e8s.
const PRO_E8S = 590_000_000n;

describe("payment: paying in ICP", () => {
  let pic: PocketIc;
  let paymentId: Principal;
  let pay: any;
  let ledger: any;
  let xrc: any;
  let n = 0;
  const admin = createIdentity("sub-admin");
  const user = () => createIdentity(`sub-user-${++n}`);
  const as = (who: Identity) => {
    pay.setIdentity(who);
    return pay;
  };
  const nowNs = async () => BigInt(await pic.getTime()) * 1_000_000n;
  /** Moves past the five-minute rate cache. */
  const expireRate = async () => {
    await pic.advanceTime(6 * 60 * 1000);
    await pic.tick();
  };
  const reset = async () => {
    await ledger.setMode("ok");
    await xrc.setMode("ok");
    await xrc.setRate(1_000_000_000n, 8);
  };

  beforeAll(async () => {
    pic = await createPic({
      nns: { state: { type: SubnetStateType.New } },
      ii: { state: { type: SubnetStateType.New } },
      application: [{ state: { type: SubnetStateType.New } }],
    });
    const nns = await pic.getNnsSubnet();
    const ii = await pic.getInternetIdentitySubnet();
    const app = (await pic.getApplicationSubnets())[0];
    ledger = (
      await pic.setupCanister({
        idlFactory: ledgerIdl as any,
        wasm: wasmPath("mock_icp_ledger"),
        targetCanisterId: LEDGER_ID,
        targetSubnetId: nns!.id,
      })
    ).actor;
    xrc = (
      await pic.setupCanister({
        idlFactory: xrcIdl as any,
        wasm: wasmPath("mock_xrc"),
        targetCanisterId: XRC_ID,
        targetSubnetId: ii!.id,
      })
    ).actor;
    const f = await pic.setupCanister({
      idlFactory: paymentIdl as any,
      wasm: wasmPath("payment"),
      targetSubnetId: app.id,
    });
    paymentId = f.canisterId;
    pay = f.actor;
    await pay.setBootstrapNonce("n");
    ok(await as(admin).initAdmins([admin.getPrincipal()], "n"));
  });

  afterAll(async () => {
    await pic?.tearDown();
  });

  it("SUB.1 quotes the USD price at the XRC rate plus 5%, and Free costs nothing", async () => {
    await reset();
    await expireRate();
    const u = user();
    expect(ok(await as(u).getPriceQuote({ Free: null }))).toBe(0n);
    expect(ok(await as(u).getPriceQuote({ Pro: null }))).toBe((PRO_E8S * 105n) / 100n);
    // ContractorPro is $40 a month.
    expect(ok(await as(u).getPriceQuote({ ContractorPro: null }))).toBe((400_000_000n * 105n) / 100n);
  });

  it("SUB.2 a paid subscribe pulls exactly the price from the caller to payment, once, for a year", async () => {
    await reset();
    await expireRate();
    const u = user();
    const before = (await ledger.getCalls()).length;
    const sub = ok(await as(u).subscribe({ Pro: null })) as any;
    const calls = (await ledger.getCalls()).slice(before);
    expect(calls).toHaveLength(1);
    expect(calls[0].caller.toText()).toBe(paymentId.toText());
    expect(calls[0].from.toText()).toBe(u.getPrincipal().toText());
    expect(calls[0].to.toText()).toBe(paymentId.toText());
    expect(calls[0].amount).toBe(PRO_E8S);
    expect(calls[0].fee).toEqual([10_000n]);
    expect(tierOf(sub.tier)).toBe("Pro");
    const now = await nowNs();
    expect(BigInt(sub.expiresAt) - now).toBeGreaterThan(YEAR_NS - 10n * MIN_NS);
    expect(BigInt(sub.expiresAt) - now).toBeLessThanOrEqual(YEAR_NS + 1_000_000n); // getTime is in ms
    expect(tierOf((ok(await as(u).getMySubscription()) as any).tier)).toBe("Pro");
  });

  it("SUB.2 Free needs no payment and calls neither the XRC nor the ledger", async () => {
    await reset();
    const u = user();
    const ledgerBefore = (await ledger.getCalls()).length;
    const xrcBefore = await xrc.callCount();
    expect(tierOf((ok(await as(u).subscribe({ Free: null })) as any).tier)).toBe("Free");
    expect((await ledger.getCalls()).length).toBe(ledgerBefore);
    expect(await xrc.callCount()).toBe(xrcBefore);
  });

  it("SUB.3 a refused transfer charges nothing and leaves the plan as it was", async () => {
    await reset();
    for (const mode of ["insufficient_allowance", "insufficient_funds"]) {
      const u = user();
      await ledger.setMode(mode);
      const r = await as(u).subscribe({ Pro: null });
      expect(errOf(r)).toBe("PaymentFailed");
      expect(JSON.stringify((r as any).err)).toMatch(
        mode === "insufficient_allowance" ? /allowance/i : /Insufficient ICP/,
      );
      expect(tierOf((ok(await as(u).getMySubscription()) as any).tier)).toBe("Free");
    }
  });

  it("SUB.4 a rejected ledger call fails the payment and frees the lock, so the retry goes through", async () => {
    await reset();
    const u = user();
    await ledger.setMode("trap");
    expect(errOf(await as(u).subscribe({ Pro: null }))).toBe("PaymentFailed");
    expect(tierOf((ok(await as(u).getMySubscription()) as any).tier)).toBe("Free");
    await ledger.setMode("ok");
    await pic.advanceTime(61_000); // past the per-minute update limit window
    expect(tierOf((ok(await as(u).subscribe({ Pro: null })) as any).tier)).toBe("Pro");
  });

  it("SUB.5 an XRC error or rejection fails before the ledger is called, and frees the lock", async () => {
    await reset();
    for (const mode of ["err", "trap"]) {
      await expireRate();
      const u = user();
      await xrc.setMode(mode);
      const before = (await ledger.getCalls()).length;
      expect(errOf(await as(u).subscribe({ Pro: null }))).toBe("PaymentFailed");
      expect(errOf(await as(u).getPriceQuote({ Pro: null }))).toBe("PaymentFailed");
      expect((await ledger.getCalls()).length).toBe(before);
      await xrc.setMode("ok");
      expect(tierOf((ok(await as(u).subscribe({ Pro: null })) as any).tier)).toBe("Pro");
    }
  });

  it("SUB.5 a zero rate is refused instead of dividing by zero", async () => {
    await reset();
    await expireRate();
    await xrc.setRate(0n, 8);
    expect(errOf(await as(user()).getPriceQuote({ Pro: null }))).toBe("PaymentFailed");
  });

  it("SUB.6 the rate is fetched once per five minutes, with the XRC's 1B cycles attached", async () => {
    await reset();
    await expireRate();
    const start = await xrc.callCount();
    const u = user();
    ok(await as(u).getPriceQuote({ Pro: null }));
    ok(await as(u).subscribe({ Pro: null }));
    ok(await as(user()).getPriceQuote({ ContractorPro: null }));
    expect(await xrc.callCount()).toBe(start + 1n);
    expect(await xrc.lastCyclesAttached()).toBe(1_000_000_000n);
    // A new rate isn't seen until the cache expires.
    await xrc.setRate(2_000_000_000n, 8);
    expect(ok(await as(user()).getPriceQuote({ Pro: null }))).toBe((PRO_E8S * 105n) / 100n);
    await expireRate();
    expect(ok(await as(user()).getPriceQuote({ Pro: null }))).toBe(((PRO_E8S / 2n) * 105n) / 100n);
    expect(await xrc.callCount()).toBe(start + 2n);
  });

  it("SUB.7 two subscribes from one caller in the same round charge once", async () => {
    await reset();
    await expireRate();
    const u = user();
    const before = (await ledger.getCalls()).length;
    const results = await sameRound(pic, paymentIdl as any, paymentId, [
      { as: u, method: "subscribe", args: [{ Pro: null }] },
      { as: u, method: "subscribe", args: [{ Pro: null }] },
    ]);
    expect(results.map(errOf).sort()).toEqual(["RateLimited", "ok"]);
    expect((await ledger.getCalls()).length - before).toBe(1);
  });

  it("SUB.8 an anonymous caller can't subscribe or get a quote", async () => {
    await reset();
    const anon = new AnonymousIdentity();
    await expect(as(anon as any).subscribe({ Pro: null })).rejects.toThrow();
    await expect(as(anon as any).getPriceQuote({ Pro: null })).rejects.toThrow();
  });
});
