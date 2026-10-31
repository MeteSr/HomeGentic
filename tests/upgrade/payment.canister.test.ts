/**
 * The payment canister's Stripe relay surface, on a real canister: what the
 * voice Worker calls after Stripe confirms a payment. The Worker's own tests
 * mock these calls, so this is where their rules are checked:
 *
 *  - only admins and registered Stripe relays may call them, and a relay
 *    can't grant itself anything else;
 *  - each Stripe reference produces one grant, also when replays land in the
 *    same round;
 *  - a re-verification never extends a plan past Stripe's period end, and a
 *    gift never shortens a plan that is already running;
 *  - agent credits never go below zero and expire after a year.
 *
 * Run: cd tests/upgrade && npx vitest run payment.canister.test.ts
 * (needs .dfx/local/canisters/payment/payment.wasm)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PocketIc, createIdentity } from "@dfinity/pic";
import type { Identity } from "@icp-sdk/core/agent";
import { createPic, wasmPath, sameRound } from "./__helpers__/setup";
import { idlFactory as paymentIdl } from "../../packages/shared/src/declarations/payment";

type R<T> = { ok: T } | { err: Record<string, unknown> };
function ok<T>(r: R<T>): T {
  if ("err" in r) throw new Error(`Expected ok, got err: ${JSON.stringify(r.err)}`);
  return r.ok;
}
const errOf = (r: R<unknown>) => ("err" in r ? Object.keys(r.err)[0] : "ok");

const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_NS = BigInt(DAY_MS) * 1_000_000n;
const tierOf = (t: Record<string, null>) => Object.keys(t)[0];

const GIFT_META = {
  recipientEmail: "kim@example.com", recipientName: "Kim", senderName: "Lee",
  giftMessage: "Enjoy", deliveryDate: "2026-11-01",
};

describe("payment: Stripe relay, gifts and agent credits", () => {
  let pic: PocketIc;
  let cid: any;
  let pay: any;
  let n = 0;

  const admin = createIdentity("pay-admin");
  const relay = createIdentity("pay-relay");

  const as = (who: Identity) => { pay.setIdentity(who); return pay; };
  /** `calls`, all submitted before any runs. */
  const together = (calls: { as: Identity; method: string; args: unknown[] }[]) => sameRound(pic, paymentIdl as any, cid, calls);
  const user = () => createIdentity(`pay-user-${++n}`);
  const nowNs = async () => BigInt(await pic.getTime()) * 1_000_000n;

  beforeAll(async () => {
    pic = await createPic();
    const f = await pic.setupCanister({ idlFactory: paymentIdl as any, wasm: wasmPath("payment") });
    cid = f.canisterId; pay = f.actor;
    await pay.setBootstrapNonce("n");
    ok(await as(admin).initAdmins([admin.getPrincipal()], "n"));
    ok(await as(admin).addStripeRelay(relay.getPrincipal()));
  });

  afterAll(async () => { await pic?.tearDown(); });

  describe("relay registration", () => {
    it("only an admin adds or removes a relay, and a relay has no admin powers", async () => {
      const outsider = user();
      expect(errOf(await as(outsider).addStripeRelay(outsider.getPrincipal()))).toBe("NotAuthorized");
      expect(errOf(await as(relay).addStripeRelay(outsider.getPrincipal()))).toBe("NotAuthorized");
      expect(errOf(await as(relay).grantSubscription(relay.getPrincipal(), { Pro: null }))).toBe("NotAuthorized");
      expect(errOf(await as(relay).adminGrantAgentCredits(relay.getPrincipal(), 50n))).toBe("NotAuthorized");
      expect(errOf(await as(relay).grantHandoffYear(outsider.getPrincipal(), "p1"))).toBe("NotAuthorized");

      const temp = createIdentity(`pay-temp-relay-${++n}`);
      ok(await as(admin).addStripeRelay(temp.getPrincipal()));
      const target = user();
      const exp = (await nowNs()) + 30n * DAY_NS;
      ok(await as(temp).stripeActivateSubscription(target.getPrincipal(), { Pro: null }, exp, `sub:t${n}:1`));
      ok(await as(admin).removeStripeRelay(temp.getPrincipal()));
      expect(errOf(await as(temp).stripeActivateSubscription(target.getPrincipal(), { Pro: null }, exp, `sub:t${n}:2`))).toBe("NotAuthorized");
      expect(errOf(await as(temp).consumeAgentCredit(target.getPrincipal()))).toBe("NotAuthorized");
    });

    it("a relay may only downgrade through adminActivateStripeSubscription", async () => {
      const u = user();
      expect(errOf(await as(relay).adminActivateStripeSubscription(u.getPrincipal(), { Pro: null }, 12n))).toBe("NotAuthorized");
      expect(errOf(await as(relay).adminActivateStripeSubscription(u.getPrincipal(), { ContractorPro: null }, 1n))).toBe("NotAuthorized");
      ok(await as(relay).adminActivateStripeSubscription(u.getPrincipal(), { Free: null }, 0n));
      expect(tierOf(await pay.getTierForPrincipal(u.getPrincipal()))).toBe("Free");
    });
  });

  describe("stripeActivateSubscription", () => {
    it("refuses outsiders, free tiers and out-of-range expiries", async () => {
      const u = user();
      const exp = (await nowNs()) + 30n * DAY_NS;
      expect(errOf(await as(u).stripeActivateSubscription(u.getPrincipal(), { Pro: null }, exp, "sub:x:1"))).toBe("NotAuthorized");
      expect(errOf(await as(relay).stripeActivateSubscription(u.getPrincipal(), { Free: null }, exp, "sub:x:1"))).toBe("InvalidInput");
      expect(errOf(await as(relay).stripeActivateSubscription(u.getPrincipal(), { Pro: null }, exp, ""))).toBe("InvalidInput");
      expect(errOf(await as(relay).stripeActivateSubscription(u.getPrincipal(), { Pro: null }, await nowNs(), "sub:x:1"))).toBe("InvalidInput");
      expect(errOf(await as(relay).stripeActivateSubscription(u.getPrincipal(), { Pro: null }, (await nowNs()) + 401n * DAY_NS, "sub:x:1"))).toBe("InvalidInput");
      expect(tierOf(await pay.getTierForPrincipal(u.getPrincipal()))).toBe("Free");
    });

    it("a replayed reference changes nothing, and can't be used for another user", async () => {
      const u = user(), other = user();
      const exp = (await nowNs()) + 365n * DAY_NS;
      const ref = `sub:s${n}:${exp}`;
      const first = ok<any>(await as(relay).stripeActivateSubscription(u.getPrincipal(), { Pro: null }, exp, ref));
      // Replay with a later expiry: same subscription back, not extended.
      const again = ok<any>(await as(relay).stripeActivateSubscription(u.getPrincipal(), { Pro: null }, exp + 30n * DAY_NS, ref));
      expect(again.expiresAt).toBe(first.expiresAt);
      expect(errOf(await as(relay).stripeActivateSubscription(other.getPrincipal(), { Pro: null }, exp, ref))).toBe("NotAuthorized");
      expect(tierOf(await pay.getTierForPrincipal(other.getPrincipal()))).toBe("Free");
      // The next period is a new reference and moves the expiry to Stripe's.
      const renewed = ok<any>(await as(relay).stripeActivateSubscription(u.getPrincipal(), { Pro: null }, exp + 30n * DAY_NS, `sub:s${n}:next`));
      expect(renewed.expiresAt).toBe(exp + 30n * DAY_NS);
    });

    it("replays in the same round grant once", async () => {
      const users = [user(), user(), user()];
      const exp = (await nowNs()) + 365n * DAY_NS;
      const ref = `sub:race${n}:1`;
      const results = await together(users.map((u) =>
        ({ as: relay, method: "stripeActivateSubscription", args: [u.getPrincipal(), { Pro: null }, exp, ref] })));
      expect(results.filter((r: any) => "ok" in r)).toHaveLength(1);
      const tiers = await Promise.all(users.map(async (u) => tierOf(await pay.getTierForPrincipal(u.getPrincipal()))));
      expect(tiers.filter((t) => t === "Pro")).toHaveLength(1);
    });

    it("clears a cancellation, keeps a longer running plan, and lapses to Free at Stripe's period end", async () => {
      const u = user();
      const t0 = await nowNs();
      ok(await as(relay).stripeActivateSubscription(u.getPrincipal(), { Pro: null }, t0 + 10n * DAY_NS, `sub:c${n}:1`));
      ok(await as(u).cancelSubscription());
      expect(errOf(await as(u).cancelSubscription())).toBe("InvalidInput");
      // Cancelled plans keep their tier until they expire.
      expect(tierOf(await pay.getTierForPrincipal(u.getPrincipal()))).toBe("Pro");

      const re = ok<any>(await as(relay).stripeActivateSubscription(u.getPrincipal(), { Pro: null }, t0 + 5n * DAY_NS, `sub:c${n}:2`));
      expect(re.cancelledAt).toEqual([]);
      expect(re.expiresAt).toBe(t0 + 10n * DAY_NS);   // not shortened

      await pic.advanceTime(11 * DAY_MS);
      await pic.tick();
      expect(tierOf(await pay.getTierForPrincipal(u.getPrincipal()))).toBe("Free");
      expect(errOf(await as(u).cancelSubscription())).toBe("InvalidInput");
    });
  });

  describe("gifts", () => {
    const token = () => `cs_test_gift${++n}abc`;

    it("records a gift once, refuses bad tokens and free tiers, and only a relay records", async () => {
      const t = token();
      expect(errOf(await as(user()).stripeRecordGift(t, { Pro: null }, { Yearly: null }, GIFT_META))).toBe("NotAuthorized");
      expect(errOf(await as(relay).stripeRecordGift("not-a-session", { Pro: null }, { Yearly: null }, GIFT_META))).toBe("InvalidInput");
      expect(errOf(await as(relay).stripeRecordGift(t, { Free: null }, { Yearly: null }, GIFT_META))).toBe("InvalidInput");
      ok(await as(relay).stripeRecordGift(t, { Pro: null }, { Yearly: null }, GIFT_META));
      ok(await as(relay).stripeRecordGift(t, { ContractorPro: null }, { Monthly: null }, GIFT_META));   // replay: kept as first recorded
      const sub = ok<any>(await as(user()).redeemGift(t));
      expect(tierOf(sub.tier)).toBe("Pro");
    });

    it("two people redeeming one gift in the same round: one gets it", async () => {
      const t = token();
      ok(await as(relay).stripeRecordGift(t, { Pro: null }, { Yearly: null }, GIFT_META));
      const people = [user(), user(), user()];
      const results = await together(people.map((p) => ({ as: p, method: "redeemGift", args: [t] })));
      expect(results.filter((r: any) => "ok" in r)).toHaveLength(1);
      expect(errOf(await as(user()).redeemGift(t))).toBe("InvalidInput");
      expect(errOf(await as(user()).redeemGift(token()))).toBe("NotFound");
    });

    it("a gift of the plan already running adds to it instead of restarting it", async () => {
      const u = user();
      const t0 = await nowNs();
      ok(await as(relay).stripeActivateSubscription(u.getPrincipal(), { Pro: null }, t0 + 300n * DAY_NS, `sub:g${n}:1`));
      const t = token();
      ok(await as(relay).stripeRecordGift(t, { Pro: null }, { Yearly: null }, GIFT_META));
      const sub = ok<any>(await as(u).redeemGift(t));
      expect(sub.expiresAt).toBe(t0 + 300n * DAY_NS + 365n * DAY_NS);
    });
  });

  describe("agent credits", () => {
    it("a credit pack is granted once per reference, within bounds", async () => {
      const u = user();
      const ref = `credits:cs_test_${++n}`;
      expect(errOf(await as(u).stripeGrantAgentCredits(u.getPrincipal(), 50n, ref))).toBe("NotAuthorized");
      expect(errOf(await as(relay).stripeGrantAgentCredits(u.getPrincipal(), 0n, ref))).toBe("InvalidInput");
      expect(errOf(await as(relay).stripeGrantAgentCredits(u.getPrincipal(), 1001n, ref))).toBe("InvalidInput");
      expect(ok<bigint>(await as(relay).stripeGrantAgentCredits(u.getPrincipal(), 50n, ref))).toBe(50n);
      expect(errOf(await as(relay).stripeGrantAgentCredits(u.getPrincipal(), 50n, ref))).toBe("InvalidInput");
      // Same-round replays of a new reference also grant once.
      const ref2 = `credits:cs_test_${++n}`;
      const results = await together([0, 1, 2].map(() => ({ as: relay, method: "stripeGrantAgentCredits", args: [u.getPrincipal(), 25n, ref2] })));
      expect(results.filter((r: any) => "ok" in r)).toHaveLength(1);
      expect(await as(u).getMyAgentCredits()).toBe(75n);
    });

    it("consuming never goes below zero, also when calls race", async () => {
      const u = user();
      ok(await as(relay).stripeGrantAgentCredits(u.getPrincipal(), 2n, `credits:cs_test_${++n}`));
      expect(errOf(await as(u).consumeAgentCredit(u.getPrincipal()))).toBe("NotAuthorized");
      const results = await together([0, 1, 2, 3, 4].map(() => ({ as: relay, method: "consumeAgentCredit", args: [u.getPrincipal()] })));
      expect(results.filter((r: any) => "ok" in r)).toHaveLength(2);
      expect(await as(u).getMyAgentCredits()).toBe(0n);
      expect(errOf(await as(relay).consumeAgentCredit(u.getPrincipal()))).toBe("NotFound");
      expect(errOf(await as(relay).consumeAgentCredit(user().getPrincipal()))).toBe("NotFound");
    });

    it("credits expire a year after the last pack", async () => {
      const u = user();
      ok(await as(relay).stripeGrantAgentCredits(u.getPrincipal(), 10n, `credits:cs_test_${++n}`));
      await pic.advanceTime(366 * DAY_MS);
      await pic.tick();
      expect(await as(u).getMyAgentCredits()).toBe(0n);
      expect(errOf(await as(relay).consumeAgentCredit(u.getPrincipal()))).toBe("NotFound");
      // A new pack after expiry starts from zero, not from the stale balance.
      expect(ok<bigint>(await as(relay).stripeGrantAgentCredits(u.getPrincipal(), 5n, `credits:cs_test_${++n}`))).toBe(5n);
    });
  });
});
