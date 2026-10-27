/**
 * Fee canister — Bid to List platform fees and the Contractor Free referral fee.
 *
 * Who may write each ledger, the Owed → Invoiced → Paid path (a paid fee can't
 * go back), the 3% / $20-minimum referral fee, when a fee becomes Due
 * (verified job, 60 days after acceptance, or an off-app job within 180 days
 * of a bid), the card relay, overdue fees pausing bids after 30 days, and
 * persistence across an upgrade.
 *
 * Run: cd tests/upgrade && npx vitest run fee.canister.test.ts
 * (needs .dfx/local/canisters/fee/fee.wasm)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PocketIc, createIdentity } from "@dfinity/pic";
import { createPic, wasmPath } from "./__helpers__/setup";
import { idlFactory as feeIdl } from "../../packages/shared/src/declarations/fee";

type R<T> = { ok: T } | { err: Record<string, unknown> };
function ok<T>(r: R<T>): T {
  if ("err" in r) throw new Error(`Expected ok, got err: ${JSON.stringify(r.err)}`);
  return r.ok;
}
const errKey = (r: R<unknown>) => {
  if (!("err" in r)) throw new Error("Expected err, got ok");
  return Object.keys(r.err)[0];
};
const status = (x: { status: object }) => Object.keys(x.status)[0];

const DAY_MS = 24 * 60 * 60 * 1000;

describe("fee canister", () => {
  let pic: PocketIc;
  let fee: any;
  let feeId: any;

  const admin      = createIdentity("fee-admin");
  const listingC   = createIdentity("fee-listing-canister");   // stands in for the wired canisters
  const quoteC     = createIdentity("fee-quote-canister");
  const jobC       = createIdentity("fee-job-canister");
  const relay      = createIdentity("fee-relay");
  const agent      = createIdentity("fee-agent");
  const homeowner  = createIdentity("fee-homeowner");
  const contractor = createIdentity("fee-contractor");
  const stranger   = createIdentity("fee-stranger");

  const nowNs = async () => BigInt(await pic.getTime()) * 1_000_000n;
  const as = (id: ReturnType<typeof createIdentity>) => { fee.setIdentity(id); return fee; };

  beforeAll(async () => {
    pic = await createPic();
    const f = await pic.setupCanister({ idlFactory: feeIdl as any, wasm: wasmPath("fee") });
    fee = f.actor;
    feeId = f.canisterId;
    await fee.setBootstrapNonce("n");
    ok(await as(admin).initAdmins([admin.getPrincipal()], "n"));
    ok(await fee.setListingCanisterId(listingC.getPrincipal().toText()));
    ok(await fee.setQuoteCanisterId(quoteC.getPrincipal().toText()));
    ok(await fee.setJobCanisterId(jobC.getPrincipal().toText()));
    ok(await fee.addReferralRelay(relay.getPrincipal()));
  });

  afterAll(async () => { await pic?.tearDown(); });

  describe("Bid to List platform fee", () => {
    let id = "";

    it("only the listing canister or an admin can record a fee", async () => {
      expect(errKey(await as(stranger).recordFeeOwed("REQ-1", "PROP-A", agent.getPrincipal(), homeowner.getPrincipal(), 39_900n))).toBe("NotAuthorized");
      expect(errKey(await as(listingC).recordFeeOwed("REQ-1", "PROP-A", agent.getPrincipal(), homeowner.getPrincipal(), 0n))).toBe("InvalidInput");
      const rec = ok<any>(await as(listingC).recordFeeOwed("REQ-1", "PROP-A", agent.getPrincipal(), homeowner.getPrincipal(), 39_900n));
      id = rec.id;
      expect(status(rec)).toBe("Owed");
    });

    it("re-selecting before payment retargets the same record", async () => {
      const other = createIdentity("fee-agent-2");
      const rec = ok<any>(await as(listingC).recordFeeOwed("REQ-1", "PROP-B", other.getPrincipal(), homeowner.getPrincipal(), 39_900n));
      expect(rec.id).toBe(id);
      expect(rec.proposalId).toBe("PROP-B");
      ok(await as(listingC).recordFeeOwed("REQ-1", "PROP-A", agent.getPrincipal(), homeowner.getPrincipal(), 39_900n));
    });

    it("shows the agent their fees and hides the request lookup from others", async () => {
      expect((await as(agent).getMyFees()).map((f: any) => f.id)).toEqual([id]);
      expect(await as(stranger).getFeeForRequest("REQ-1")).toEqual([]);
      expect((await as(listingC).getFeeForRequest("REQ-1"))[0].id).toBe(id);
      expect(errKey(await as(stranger).getAllFees())).toBe("NotAuthorized");
    });

    it("moves Owed → Invoiced → Paid, and a paid fee stays paid", async () => {
      expect(errKey(await as(stranger).markFeePaid(id))).toBe("NotAuthorized");
      expect(status(ok<any>(await as(admin).markFeeInvoiced(id)))).toBe("Invoiced");
      expect(ok<any[]>(await fee.getFeesDue()).map((f) => f.id)).toContain(id);
      expect(status(ok<any>(await fee.markFeePaid(id)))).toBe("Paid");
      expect(status(ok<any>(await fee.markFeePaid(id)))).toBe("Paid");   // webhook retry
      expect(errKey(await fee.markFeeInvoiced(id))).toBe("InvalidInput");
      expect(ok<any[]>(await fee.getFeesDue()).map((f) => f.id)).not.toContain(id);
      expect(errKey(await as(listingC).recordFeeOwed("REQ-1", "PROP-C", agent.getPrincipal(), homeowner.getPrincipal(), 1n))).toBe("AlreadyExists");
    });

    it("an admin can waive an unpaid fee", async () => {
      const rec = ok<any>(await as(listingC).recordFeeOwed("REQ-2", "PROP-A", agent.getPrincipal(), homeowner.getPrincipal(), 39_900n));
      expect(status(ok<any>(await as(admin).waiveFee(rec.id)))).toBe("Waived");
    });
  });

  describe("Contractor Free referral fee", () => {
    let bidAt = 0n;
    const bid = (quoteId: string, bidCents: bigint, propertyId = "P-1", serviceType = "Plumbing") => ({
      quoteId, requestId: `REQ-${quoteId}`, contractor: contractor.getPrincipal(), homeowner: homeowner.getPrincipal(),
      propertyId, serviceType, bidCents, bidAt,
    });
    const card = {
      customerId: "cus_test", paymentMethodId: "pm_test", brand: "visa", last4: "4242", agreedAt: 0n, termsVersion: "2026-10",
    };

    beforeAll(async () => { bidAt = await nowNs(); });

    it("asks for a card before a fee-carrying bid, then allows it", async () => {
      expect(await as(contractor).referralBidAllowed(contractor.getPrincipal())).toEqual({ needsCard: null });
      expect(await as(stranger).referralBidAllowed(contractor.getPrincipal())).toEqual({ needsCard: null });
      expect(errKey(await as(contractor).relaySetReferralCard(contractor.getPrincipal(), card))).toBe("NotAuthorized");
      expect(errKey(await as(relay).relaySetReferralCard(contractor.getPrincipal(), { ...card, termsVersion: "" }))).toBe("InvalidInput");
      ok(await as(relay).relaySetReferralCard(contractor.getPrincipal(), card));
      expect((await as(contractor).getMyReferralCard())[0].last4).toBe("4242");
      expect(await as(quoteC).referralBidAllowed(contractor.getPrincipal())).toEqual({ ok: null });
    });

    it("only the quote canister records bids and acceptances", async () => {
      expect(errKey(await as(contractor).recordReferralBid(bid("Q-1", 50_000n)))).toBe("NotAuthorized");
      ok(await as(quoteC).recordReferralBid(bid("Q-1", 50_000n)));          // $500 → $20 minimum
      ok(await fee.recordReferralBid(bid("Q-2", 1_000_000n)));              // $10,000 → $300
      expect(errKey(await fee.recordReferralBid(bid("Q-1", 50_000n)))).toBe("AlreadyExists");
      expect(errKey(await as(stranger).recordReferralAccepted("Q-1"))).toBe("NotAuthorized");
    });

    it("an accepted bid opens a Pending fee of 3%, never under $20", async () => {
      const small = ok<any>(await as(quoteC).recordReferralAccepted("Q-1"))[0];
      expect(small.feeCents).toBe(2000n);
      expect(status(small)).toBe("Pending");
      expect(ok<any>(await fee.recordReferralAccepted("Q-1"))).toEqual([]);   // already open
      expect(ok<any>(await fee.recordReferralAccepted("Q-unknown"))).toEqual([]);
    });

    it("a verified job makes the matching fee Due, once", async () => {
      expect(errKey(await as(stranger).recordReferralJobVerified("J-1", contractor.getPrincipal(), "P-1", "Plumbing"))).toBe("NotAuthorized");
      const due = ok<any>(await as(jobC).recordReferralJobVerified("J-1", contractor.getPrincipal(), "P-1", "Plumbing"))[0];
      expect(status(due)).toBe("Due");
      expect(due.quoteId).toBe("Q-1");
      expect(due.jobId).toEqual(["J-1"]);
      expect(ok<any>(await fee.recordReferralJobVerified("J-1", contractor.getPrincipal(), "P-1", "Plumbing"))).toEqual([]);
    });

    it("a verified job with no accepted bid matches a recent bid sent off-app", async () => {
      const offApp = ok<any>(await as(jobC).recordReferralJobVerified("J-2", contractor.getPrincipal(), "P-1", "Plumbing"))[0];
      expect(offApp.quoteId).toBe("Q-2");
      expect(offApp.reason).toBe("off_app_job");
      expect(offApp.feeCents).toBe(30_000n);
      // A different trade on the same home doesn't match anything.
      expect(ok<any>(await fee.recordReferralJobVerified("J-3", contractor.getPrincipal(), "P-1", "Roofing"))).toEqual([]);
    });

    it("hands the relay every Due fee with the card, and records the charge", async () => {
      expect(errKey(await as(stranger).takeDueReferralFees())).toBe("NotAuthorized");
      const items = ok<any[]>(await as(relay).takeDueReferralFees());
      expect(items.map((i) => i.fee.quoteId).sort()).toEqual(["Q-1", "Q-2"]);
      expect(items[0].card[0].paymentMethodId).toBe("pm_test");

      const q1 = items.find((i) => i.fee.quoteId === "Q-1").fee;
      const paid = ok<any>(await fee.relayMarkReferralFeePaid(q1.id, "pi_1"));
      expect(status(paid)).toBe("Paid");
      expect(status(ok<any>(await fee.relayMarkReferralFeePaid(q1.id, "pi_1")))).toBe("Paid");
      expect(errKey(await as(admin).waiveReferralFee(q1.id, "goodwill"))).toBe("InvalidInput");
    });

    it("a declined card that stays unpaid for 30 days pauses fee-carrying bids", async () => {
      const q2 = (await as(contractor).getMyReferralFees()).find((f: any) => f.quoteId === "Q-2");
      const failed = ok<any>(await as(relay).relayMarkReferralFeeFailed(q2.id, "pi_2", "https://invoice.example/pay"));
      expect(status(failed)).toBe("PaymentFailed");
      expect(await as(contractor).referralBidAllowed(contractor.getPrincipal())).toEqual({ ok: null });

      await pic.advanceTime(30 * DAY_MS + 1000);
      await pic.tick();
      expect(await fee.referralBidAllowed(contractor.getPrincipal())).toEqual({ overdue: null });

      expect(errKey(await as(admin).waiveReferralFee(q2.id, ""))).toBe("InvalidInput");
      expect(status(ok<any>(await fee.waiveReferralFee(q2.id, "Billing dispute settled")))).toBe("Waived");
      expect(await as(contractor).referralBidAllowed(contractor.getPrincipal())).toEqual({ ok: null });
    });

    it("an accepted bid whose job is never verified becomes Due after 60 days", async () => {
      bidAt = await nowNs();
      ok(await as(quoteC).recordReferralBid(bid("Q-3", 200_000n, "P-2", "HVAC")));
      const pending = ok<any>(await fee.recordReferralAccepted("Q-3"))[0];
      expect(errKey(await as(relay).relayMarkReferralFeePaid(pending.id, "pi_early"))).toBe("InvalidInput");

      const early = ok<any[]>(await fee.takeDueReferralFees());
      expect(early.map((i) => i.fee.quoteId)).not.toContain("Q-3");

      await pic.advanceTime(60 * DAY_MS + 1000);
      await pic.tick();
      const late = ok<any[]>(await fee.takeDueReferralFees()).find((i) => i.fee.quoteId === "Q-3");
      expect(late.fee.reason).toBe("accepted_60_days");
      expect(late.fee.feeCents).toBe(6000n);
    });

    it("a bid older than 180 days no longer matches an off-app job", async () => {
      bidAt = await nowNs();
      ok(await as(quoteC).recordReferralBid(bid("Q-4", 100_000n, "P-3", "Electrical")));
      await pic.advanceTime(181 * DAY_MS);
      await pic.tick();
      expect(ok<any>(await as(jobC).recordReferralJobVerified("J-4", contractor.getPrincipal(), "P-3", "Electrical"))).toEqual([]);
    });
  });

  describe("upgrade", () => {
    it("keeps both ledgers and the saved card", async () => {
      fee.setIdentity(admin);
      const before = { fees: ok<any[]>(await fee.getAllFees()), referral: ok<any[]>(await fee.getAllReferralFees()) };
      await pic.upgradeCanister({ canisterId: feeId, wasm: wasmPath("fee") });
      fee.setIdentity(admin);
      expect(ok<any[]>(await fee.getAllFees())).toEqual(before.fees);
      expect(ok<any[]>(await fee.getAllReferralFees())).toEqual(before.referral);
      expect((await as(contractor).getMyReferralCard())[0].last4).toBe("4242");
      expect((await as(agent).getMyFees()).length).toBe(2);   // the agent index is rebuilt
    });
  });
});
