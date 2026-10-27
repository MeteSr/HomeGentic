/**
 * Time limits that only show up once time passes: a quote's valid-until date
 * and the 48-hour contractor co-sign link. Uses PocketIC's clock.
 *
 * Run: cd tests/upgrade && npx vitest run expiry.canister.test.ts
 * (needs .dfx/local/canisters/{quote,job}/*.wasm)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PocketIc, createIdentity } from "@dfinity/pic";
import { createPic, wasmPath } from "./__helpers__/setup";
import { idlFactory as quoteIdl } from "../../packages/shared/src/declarations/quote";
import { idlFactory as jobIdl }   from "../../packages/shared/src/declarations/job";

type R<T> = { ok: T } | { err: Record<string, unknown> };
function ok<T>(r: R<T>): T {
  if ("err" in r) throw new Error(`Expected ok, got err: ${JSON.stringify(r.err)}`);
  return r.ok;
}
const errOf = (r: R<unknown>) => {
  if (!("err" in r)) throw new Error("Expected err, got ok");
  return r.err;
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

describe("time limits", () => {
  let pic: PocketIc;
  let quote: any;
  let job: any;

  const homeowner = createIdentity("exp-homeowner");
  const slow      = createIdentity("exp-contractor-slow");
  const quick     = createIdentity("exp-contractor-quick");
  const stranger  = createIdentity("exp-stranger");

  const nowNs = async () => BigInt(await pic.getTime()) * 1_000_000n;

  beforeAll(async () => {
    pic = await createPic();
    // Neither canister is wired to property/contractor/fee: the property
    // checks fall back to "the caller owns it" and any caller may bid.
    quote = (await pic.setupCanister({ idlFactory: quoteIdl as any, wasm: wasmPath("quote") })).actor;
    job   = (await pic.setupCanister({ idlFactory: jobIdl as any, wasm: wasmPath("job") })).actor;
  });

  afterAll(async () => { await pic?.tearDown(); });

  describe("quote valid-until", () => {
    let requestId = "";
    let shortQuote = "";
    let longQuote = "";

    beforeAll(async () => {
      quote.setIdentity(homeowner);
      requestId = ok<any>(await quote.createQuoteRequest(
        "PROP-EXP", { Plumbing: null }, "Leaking water heater", { Medium: null }, ["32801"], [], [], [], [],
      )).id;
    });

    it("won't take a quote that is already out of date", async () => {
      quote.setIdentity(slow);
      expect(errOf(await quote.submitQuote(requestId, 120_000n, 3n, (await nowNs()) - 1n))).toHaveProperty("InvalidInput");
    });

    it("accepts bids with a future valid-until date", async () => {
      quote.setIdentity(slow);
      shortQuote = ok<any>(await quote.submitQuote(requestId, 110_000n, 3n, (await nowNs()) + BigInt(DAY_MS) * 1_000_000n)).id;
      quote.setIdentity(quick);
      longQuote = ok<any>(await quote.submitQuote(requestId, 125_000n, 2n, (await nowNs()) + 30n * BigInt(DAY_MS) * 1_000_000n)).id;
    });

    it("refuses to accept a quote once its date has passed", async () => {
      await pic.advanceTime(2 * DAY_MS);
      await pic.tick();
      quote.setIdentity(homeowner);
      const err: any = errOf(await quote.acceptQuote(shortQuote));
      expect(err.InvalidInput).toMatch(/expired/);
      const quotes = ok<any[]>(await quote.getQuotesForRequest(requestId));
      expect(quotes.every((q) => Object.keys(q.status)[0] === "Pending")).toBe(true);
    });

    it("still accepts a quote that is in date", async () => {
      quote.setIdentity(homeowner);
      expect(Object.keys(ok<any>(await quote.acceptQuote(longQuote)).status)[0]).toBe("Accepted");
    });
  });

  describe("48-hour co-sign link", () => {
    let jobId = "";

    beforeAll(async () => {
      job.setIdentity(homeowner);
      jobId = ok<any>(await job.createJob(
        "PROP-EXP", "Water heater", { Plumbing: null }, "Replaced the tank.", ["Pipes & Co"], 125_000n, 0n, [], [], false, [],
      )).id;
    });

    it("only the homeowner can make one, and not for a DIY job", async () => {
      job.setIdentity(stranger);
      expect(errOf(await job.createInviteToken(jobId, "12 Elm Street"))).toHaveProperty("NotAuthorized");
      job.setIdentity(homeowner);
      const diy = ok<any>(await job.createJob("PROP-EXP", "Paint", { Painting: null }, "Painted.", [], 0n, 0n, [], [], true, [])).id;
      expect(errOf(await job.createInviteToken(diy, "12 Elm Street"))).toHaveProperty("InvalidInput");
    });

    it("previews the job for 48 hours and then refuses to be used", async () => {
      job.setIdentity(homeowner);
      const token = ok<string>(await job.createInviteToken(jobId, "12 Elm Street"));
      const preview = ok<any>(await job.getJobByInviteToken(token));
      expect(preview.jobId).toBe(jobId);
      expect(preview.propertyAddress).toBe("12 Elm Street");
      expect(preview.alreadySigned).toBe(false);
      const hours = Number((preview.expiresAt - (await nowNs())) / 1_000_000n) / HOUR_MS;
      expect(hours).toBeGreaterThan(47.9);
      expect(hours).toBeLessThanOrEqual(48);

      // The homeowner can't sign their own job through the link.
      expect(errOf(await job.redeemInviteToken(token, "Me", "555-0100", "me@example.com", []))).toHaveProperty("NotAuthorized");

      await pic.advanceTime(48 * HOUR_MS + 1000);
      await pic.tick();
      job.setIdentity(quick);
      const err: any = errOf(await job.redeemInviteToken(token, "Pipes & Co", "555-0101", "pipes@example.com", []));
      expect(err.InvalidInput).toMatch(/expired/);
      expect(ok<any>(await job.getJobByInviteToken(token)).alreadySigned).toBe(false);
    });
  });
});
