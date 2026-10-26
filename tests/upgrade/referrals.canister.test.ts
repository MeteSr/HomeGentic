/**
 * Referrals canister, wired to a real payment canister.
 *
 * Codes, one referral per referee, the "only before your first paid plan"
 * rule (read live from payment), credits for both sides when payment reports
 * a paid activation, and nothing for a downgrade to Free. Also checks that a
 * Pro grant runs out: the tier reads Free once expiresAt has passed.
 *
 * Run: cd tests/upgrade && npx vitest run referrals.canister.test.ts
 * (needs .dfx/local/canisters/{referrals,payment}/*.wasm)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PocketIc, createIdentity } from "@dfinity/pic";
import { createPic, wasmPath } from "./__helpers__/setup";
import { idlFactory as referralsIdl } from "../../packages/shared/src/declarations/referrals";
import { idlFactory as paymentIdl }   from "../../packages/shared/src/declarations/payment";

type R<T> = { ok: T } | { err: unknown };
function ok<T>(r: R<T>): T {
  if ("err" in r) throw new Error(`Expected ok, got err: ${JSON.stringify(r.err)}`);
  return r.ok;
}
const errKey = (r: R<unknown>) => {
  if (!("err" in r)) throw new Error("Expected err, got ok");
  return typeof r.err === "string" ? r.err : Object.keys(r.err as object)[0];
};

/** The shared payment declaration leaves out setReferralsCanisterId. */
const paymentWithReferrals = ({ IDL: I }: { IDL: any }) => {
  const Error = I.Variant({
    NotFound: I.Null, NotAuthorized: I.Null, PaymentFailed: I.Text, RateLimited: I.Null, InvalidInput: I.Text,
  });
  return I.Service({
    ...Object.fromEntries(paymentIdl({ IDL: I })._fields),
    setReferralsCanisterId: I.Func([I.Text], [I.Variant({ ok: I.Null, err: Error })], []),
  });
};

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const CREDIT = 1000n;

describe("referrals canister", () => {
  let pic: PocketIc;
  let referrals: any;
  let payment: any;
  let referralsId: any;

  const admin    = createIdentity("ref-admin");
  const referrer = createIdentity("ref-referrer");
  const referee  = createIdentity("ref-referee");
  const quitter  = createIdentity("ref-quitter");
  const payer    = createIdentity("ref-already-paying");

  const nowNs = async () => BigInt(await pic.getTime()) * 1_000_000n;

  beforeAll(async () => {
    pic = await createPic();
    const p = await pic.setupCanister({ idlFactory: paymentWithReferrals as any, wasm: wasmPath("payment") });
    payment = p.actor;
    const r = await pic.setupCanister({ idlFactory: referralsIdl as any, wasm: wasmPath("referrals") });
    referrals = r.actor;
    referralsId = r.canisterId;

    await payment.setBootstrapNonce("n");
    payment.setIdentity(admin);
    ok(await payment.initAdmins([admin.getPrincipal()], "n"));
    ok(await payment.setReferralsCanisterId(r.canisterId.toText()));

    await referrals.setBootstrapNonce("n");
    referrals.setIdentity(admin);
    ok(await referrals.addAdmin(admin.getPrincipal(), "n"));
    await referrals.setPaymentCanisterId(p.canisterId.toText());
  });

  afterAll(async () => { await pic?.tearDown(); });

  let code = "";

  it("gives each user one stable code", async () => {
    referrals.setIdentity(referrer);
    code = await referrals.getMyCode();
    expect(code).toMatch(/^HG-\d{6}$/);
    expect(await referrals.getMyCode()).toBe(code);
    referrals.setIdentity(referee);
    expect(await referrals.getMyCode()).not.toBe(code);
  });

  it("rejects unknown codes and self-referral", async () => {
    referrals.setIdentity(referee);
    expect(errKey(await referrals.useReferralCode("HG-999999"))).toBe("CodeNotFound");
    expect(errKey(await referrals.useReferralCode(""))).toBe("InvalidInput");
    referrals.setIdentity(referrer);
    expect(errKey(await referrals.useReferralCode(code))).toBe("SelfReferral");
  });

  it("allows one referral per referee", async () => {
    referrals.setIdentity(referee);
    ok(await referrals.useReferralCode(code));
    expect(errKey(await referrals.useReferralCode(code))).toBe("AlreadyReferred");
    referrals.setIdentity(referrer);
    const mine = await referrals.getMyReferrals();
    expect(mine).toHaveLength(1);
    expect(mine[0].convertedAt).toEqual([]);
  });

  it("refuses a code from someone already on a paid plan", async () => {
    ok(await payment.grantSubscription(payer.getPrincipal(), { Pro: null }));
    referrals.setIdentity(payer);
    expect(errKey(await referrals.useReferralCode(code))).toBe("InvalidInput");
  });

  it("only the payment canister (or an admin) can mark a conversion", async () => {
    referrals.setIdentity(referee);
    expect(errKey(await referrals.markConverted(referee.getPrincipal()))).toBe("Unauthorized");
  });

  it("a downgrade to Free is not a conversion", async () => {
    referrals.setIdentity(quitter);
    ok(await referrals.useReferralCode(code));
    ok(await payment.adminActivateStripeSubscription(quitter.getPrincipal(), { Free: null }, 0n));
    referrals.setIdentity(quitter);
    expect(await referrals.getCreditBalance()).toBe(0n);
  });

  it("a paid activation credits both sides once", async () => {
    const expiresAt = (await nowNs()) + BigInt(YEAR_MS) * 1_000_000n;
    ok(await payment.stripeActivateSubscription(referee.getPrincipal(), { Pro: null }, expiresAt, "sub:test:1"));

    referrals.setIdentity(referee);
    expect(await referrals.getCreditBalance()).toBe(CREDIT);
    referrals.setIdentity(referrer);
    expect(await referrals.getCreditBalance()).toBe(CREDIT);
    expect((await referrals.getMyReferrals()).find((x: any) => x.referee === referee.getPrincipal().toText()).convertedAt).toHaveLength(1);

    // The next renewal is not another conversion.
    ok(await payment.stripeActivateSubscription(referee.getPrincipal(), { Pro: null }, expiresAt + 1n, "sub:test:2"));
    expect(await referrals.getCreditBalance()).toBe(CREDIT);
    expect(errKey(await referrals.markConverted(referee.getPrincipal()))).toBe("Unauthorized");
    referrals.setIdentity(admin);
    expect(errKey(await referrals.markConverted(referee.getPrincipal()))).toBe("AlreadyConverted");
  });

  it("keeps codes, referrals and credits across an upgrade", async () => {
    await pic.upgradeCanister({ canisterId: referralsId, wasm: wasmPath("referrals") });
    referrals.setIdentity(referrer);
    expect(await referrals.getMyCode()).toBe(code);
    expect(await referrals.getCreditBalance()).toBe(CREDIT);
    expect(await referrals.metrics()).toEqual({ totalCodes: 2n, totalReferrals: 2n, totalConverted: 1n });
  });

  it("a Pro grant reads as Free once it has expired", async () => {
    expect(await payment.getTierForPrincipal(payer.getPrincipal())).toEqual({ Pro: null });
    await pic.advanceTime(YEAR_MS + 60_000);
    await pic.tick();
    expect(await payment.getTierForPrincipal(payer.getPrincipal())).toEqual({ Free: null });
  });
});
