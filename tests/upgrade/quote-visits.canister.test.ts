/**
 * Visit times on an accepted quote: the contractor offers up to five times,
 * the homeowner books one, asks for others or cancels, and either side can
 * cancel. The quote canister runs on its own, so the property check falls
 * back to "the caller is the request's homeowner".
 *
 *  QV.1 only the accepted quote's contractor can offer times, and only on an
 *       accepted quote; bad slots and long notes are refused
 *  QV.2 the homeowner books an offered time; the contractor and homeowner are
 *       notified; a stranger can't book
 *  QV.3 asking for new times releases the booked time; the contractor's new
 *       offer replaces the old one
 *  QV.4 either side cancels and the other side is notified
 *  QV.5 getVisitBookings shows a booking only to its contractor, homeowner
 *       and admins
 *  QV.6 bookings survive an upgrade (new stable side map)
 *  QV.7 deleteMyData drops the homeowner's bookings
 *
 * Run: cd tests/upgrade && npx vitest run quote-visits.canister.test.ts
 * (needs .dfx/local/canisters/quote/quote.wasm)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "fs";
import { PocketIc, createIdentity } from "@dfinity/pic";
import { IDL } from "@icp-sdk/core/candid";
import type { Identity } from "@icp-sdk/core/agent";
import { createPic, wasmPath, CONTROLLER } from "./__helpers__/setup";
import { serviceFromWasm } from "./__helpers__/candid";

type R<T> = { ok: T } | { err: Record<string, unknown> };
function ok<T>(r: R<T>): T {
  if ("err" in r)
    throw new Error(
      `Expected ok, got err: ${JSON.stringify(r.err, (_k, v) => (typeof v === "bigint" ? v.toString() : v))}`,
    );
  return r.ok;
}
const errKey = (r: R<unknown>) => ("err" in r ? Object.keys(r.err)[0] : "ok");
const status = (b: any) => Object.keys(b.status)[0];

const HOUR_NS = 3_600_000_000_000n;
const DAY_NS = 24n * HOUR_NS;

describe("quote: visit times on an accepted quote", () => {
  let pic: PocketIc;
  let svc: IDL.ServiceClass;
  let cid: any;

  const admin = createIdentity("qv-admin");
  const owner = createIdentity("qv-owner");
  const pro = createIdentity("qv-pro");
  const loser = createIdentity("qv-loser");
  const stranger = createIdentity("qv-stranger");

  let requestId = "";
  let quoteId = "";
  let otherQuoteId = "";
  let seq = 0n;

  const as = (who: Identity) => {
    const a = pic.createActor<any>((() => svc) as any, cid);
    a.setIdentity(who);
    return a;
  };
  const nowNs = async () => BigInt(await pic.getTime()) * 1_000_000n;
  /** Slots starting `days` days from now, two hours long. */
  const slotsIn = async (...days: number[]) => {
    const now = await nowNs();
    return days.map((d) => ({ startsAt: now + BigInt(d) * DAY_NS, endsAt: now + BigInt(d) * DAY_NS + 2n * HOUR_NS }));
  };
  /** Outbox events since the last call, as [kind, recipient, refId]. */
  const newEvents = async () => {
    const page = ok<any>(await as(admin).getNotificationEvents(seq, 200n));
    if (page.events.length) seq = page.events[page.events.length - 1].seq;
    return page.events.map((e: any) => [e.kind, e.recipient[0]?.toText() ?? null, e.refId]);
  };

  beforeAll(async () => {
    pic = await createPic();
    const { idlFactory } = serviceFromWasm(wasmPath("quote"));
    svc = idlFactory({ IDL });
    cid = (await pic.setupCanister({ idlFactory: (() => svc) as any, wasm: wasmPath("quote") })).canisterId;
    await as(CONTROLLER).setBootstrapNonce("n");
    ok(await as(admin).addAdmin(admin.getPrincipal(), "n"));

    requestId = ok<any>(
      await as(owner).createQuoteRequest(
        "PROP-QV",
        { HVAC: null },
        "AC out",
        { High: null },
        ["32801"],
        [],
        [],
        [],
        [],
      ),
    ).id;
    const validUntil = (await nowNs()) + 30n * DAY_NS;
    quoteId = ok<any>(await as(pro).submitQuote(requestId, 90_000n, 2n, validUntil)).id;
    otherQuoteId = ok<any>(await as(loser).submitQuote(requestId, 95_000n, 3n, validUntil)).id;
    ok(await as(owner).acceptQuote(quoteId));
    await newEvents();
  });

  afterAll(async () => {
    await pic?.tearDown();
  });

  it("QV.1 only the accepted quote's contractor offers times, and bad offers are refused", async () => {
    const good = await slotsIn(2, 3);
    expect(errKey(await as(owner).offerVisitTimes(quoteId, good, ""))).toBe("NotAuthorized");
    expect(errKey(await as(stranger).offerVisitTimes(quoteId, good, ""))).toBe("NotAuthorized");
    // The rejected bid isn't accepted, so it has no visit.
    expect(errKey(await as(loser).offerVisitTimes(otherQuoteId, good, ""))).toBe("InvalidInput");
    expect(errKey(await as(pro).offerVisitTimes("no-such-quote", good, ""))).toBe("NotFound");

    expect(errKey(await as(pro).offerVisitTimes(quoteId, [], ""))).toBe("InvalidInput");
    expect(errKey(await as(pro).offerVisitTimes(quoteId, await slotsIn(1, 2, 3, 4, 5, 6), ""))).toBe("InvalidInput");
    const now = await nowNs();
    const past = [{ startsAt: now - HOUR_NS, endsAt: now + HOUR_NS }];
    expect(errKey(await as(pro).offerVisitTimes(quoteId, past, ""))).toBe("InvalidInput");
    const backwards = [{ startsAt: now + DAY_NS, endsAt: now + DAY_NS - HOUR_NS }];
    expect(errKey(await as(pro).offerVisitTimes(quoteId, backwards, ""))).toBe("InvalidInput");
    const tooLong = [{ startsAt: now + DAY_NS, endsAt: now + DAY_NS + 13n * HOUR_NS }];
    expect(errKey(await as(pro).offerVisitTimes(quoteId, tooLong, ""))).toBe("InvalidInput");
    expect(errKey(await as(pro).offerVisitTimes(quoteId, await slotsIn(181), ""))).toBe("InvalidInput");
    expect(errKey(await as(pro).offerVisitTimes(quoteId, good, "x".repeat(301)))).toBe("InvalidInput");
    expect(await newEvents()).toEqual([]);

    const b = ok<any>(await as(pro).offerVisitTimes(quoteId, good, "I'll call 30 minutes ahead"));
    expect(status(b)).toBe("TimesOffered");
    expect(b.offered).toEqual(good);
    expect(b.requestId).toBe(requestId);
    expect(b.booked).toEqual([]);
    expect(b.note).toBe("I'll call 30 minutes ahead");
    expect(await newEvents()).toEqual([["visit_times_offered", owner.getPrincipal().toText(), quoteId]]);
  });

  it("QV.2 the homeowner books an offered time and both sides are notified", async () => {
    expect(errKey(await as(stranger).bookVisitTime(quoteId, 0n))).toBe("NotAuthorized");
    expect(errKey(await as(pro).bookVisitTime(quoteId, 0n))).toBe("NotAuthorized");
    expect(errKey(await as(owner).bookVisitTime(quoteId, 5n))).toBe("InvalidInput");

    const b = ok<any>(await as(owner).bookVisitTime(quoteId, 1n));
    expect(status(b)).toBe("Booked");
    expect(b.booked).toEqual([b.offered[1]]);
    expect(await newEvents()).toEqual([
      ["visit_booked", pro.getPrincipal().toText(), quoteId],
      ["visit_confirmed", owner.getPrincipal().toText(), quoteId],
    ]);
    // A booked visit can't be booked again without new times.
    expect(errKey(await as(owner).bookVisitTime(quoteId, 0n))).toBe("InvalidInput");
  });

  it("QV.3 asking for new times releases the booking, and a new offer replaces the old one", async () => {
    expect(errKey(await as(stranger).askForNewVisitTimes(quoteId))).toBe("NotAuthorized");
    const asked = ok<any>(await as(owner).askForNewVisitTimes(quoteId));
    expect(status(asked)).toBe("NewTimesRequested");
    expect(asked.booked).toEqual([]);
    expect(await newEvents()).toEqual([["visit_new_times_requested", pro.getPrincipal().toText(), quoteId]]);
    expect(errKey(await as(owner).askForNewVisitTimes(quoteId))).toBe("InvalidInput");
    expect(errKey(await as(owner).bookVisitTime(quoteId, 0n))).toBe("InvalidInput");

    const fresh = await slotsIn(7);
    const re = ok<any>(await as(pro).offerVisitTimes(quoteId, fresh, ""));
    expect(status(re)).toBe("TimesOffered");
    expect(re.offered).toEqual(fresh);
    await newEvents();
    expect(status(ok<any>(await as(owner).bookVisitTime(quoteId, 0n)))).toBe("Booked");
    await newEvents();
  });

  it("QV.4 either side cancels and the other side is notified", async () => {
    expect(errKey(await as(stranger).cancelVisit(quoteId))).toBe("NotAuthorized");
    expect(status(ok<any>(await as(pro).cancelVisit(quoteId)))).toBe("Cancelled");
    expect(await newEvents()).toEqual([["visit_cancelled", owner.getPrincipal().toText(), quoteId]]);
    expect(errKey(await as(owner).cancelVisit(quoteId))).toBe("InvalidInput");

    ok(await as(pro).offerVisitTimes(quoteId, await slotsIn(10), ""));
    await newEvents();
    expect(status(ok<any>(await as(owner).cancelVisit(quoteId)))).toBe("Cancelled");
    expect(await newEvents()).toEqual([["visit_cancelled", pro.getPrincipal().toText(), quoteId]]);
    expect(errKey(await as(owner).cancelVisit("no-such-quote"))).toBe("NotFound");
  });

  it("QV.5 getVisitBookings shows a booking only to its contractor, homeowner and admins", async () => {
    ok(await as(pro).offerVisitTimes(quoteId, await slotsIn(4, 5), "Gate code please"));
    const ids = [quoteId, otherQuoteId, "no-such-quote"];
    for (const who of [owner, pro, admin]) {
      const seen = (await as(who).getVisitBookings(ids)) as any[];
      expect(seen.map((b) => b.quoteId)).toEqual([quoteId]);
    }
    expect(await as(stranger).getVisitBookings(ids)).toEqual([]);
    expect(await as(loser).getVisitBookings(ids)).toEqual([]);
  });

  it("QV.6 bookings survive an upgrade", async () => {
    const before = await as(owner).getVisitBookings([quoteId]);
    await pic.upgradeCanister({ canisterId: cid, wasm: readFileSync(wasmPath("quote")) });
    expect(await as(owner).getVisitBookings([quoteId])).toEqual(before);
  });

  it("QV.7 deleteMyData drops the homeowner's bookings", async () => {
    ok(await as(owner).deleteMyData());
    expect(await as(pro).getVisitBookings([quoteId])).toEqual([]);
  });
});
