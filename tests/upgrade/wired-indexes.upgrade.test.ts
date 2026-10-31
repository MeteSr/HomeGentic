/**
 * All 20 canisters, wired as CI wires them, upgraded together from the base
 * branch's build with data written through the real cross-canister flows.
 *
 * from-base.upgrade.test.ts checks a few canisters' indexes on their own,
 * unwired, and all-canisters.upgrade.test.ts seeds every canister with
 * generic arguments. This one fills the canisters whose lookups run on
 * transient indexes (rebuilt from stable data on every upgrade) the way the
 * app does: a homeowner's homes, jobs, a contractor's proposal and bid,
 * bills, recurring services and visits, maintenance plans, sensor devices
 * and events, a Bid to List request with an agent's proposal that wins and
 * settles its fee, and the seller's review of the agent. Then it upgrades every canister and checks:
 *
 *  - every index-backed read answers the same;
 *  - new writes land in the rebuilt indexes;
 *  - the cross-canister checks still pass (each canister calls upgraded peers);
 *  - the monitoring canister's stale-metrics timer still fires.
 *
 * Without .dfx/base (scripts/ci/build-upgrade-wasms.sh) each canister is
 * upgraded to its own build, which still rebuilds every index.
 *
 * Run: cd tests/upgrade && npx vitest run wired-indexes.upgrade.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "fs";
import { PocketIc, createIdentity } from "@dfinity/pic";
import type { Identity } from "@icp-sdk/core/agent";
import { createPic, wasmPath, baseWasmPath } from "./__helpers__/setup";
import { deployAll, ALL_CANISTERS, type Deployment, type CanisterName } from "./__helpers__/deployAll";

type R<T> = { ok: T } | { err: Record<string, unknown> };
function ok<T>(r: R<T>): T {
  if ("err" in r)
    throw new Error(
      `Expected ok, got err: ${JSON.stringify(r.err, (_k, v) => (typeof v === "bigint" ? v.toString() : v))}`,
    );
  return r.ok;
}
const norm = (x: unknown) =>
  JSON.parse(
    JSON.stringify(x, (_k, v) => (typeof v === "bigint" ? v.toString() : v && v._isPrincipal ? v.toText() : v)),
  );

const haveBase = ALL_CANISTERS.every((n) => baseWasmPath(n) !== null);
const DAY_NS = 86_400n * 1_000_000_000n;

describe(
  haveBase ? "wired upgrade from base: indexes and timers" : "wired upgrade (no base build: this branch to itself)",
  () => {
    let pic: PocketIc;
    let d: Deployment;
    const admin = createIdentity("wi-admin");
    const owner = createIdentity("wi-owner");
    const pro = createIdentity("wi-contractor");
    const agent = createIdentity("wi-agent");
    const other = createIdentity("wi-other");
    const as = (name: CanisterName, who: Identity) => d.actor(name, who);
    const nowNs = async () => BigInt(Math.floor(await pic.getTime())) * 1_000_000n;

    let p1 = "",
      p2 = "",
      serviceId = "",
      bidRequestId = "",
      quoteRequestId = "";

    /** Every index-backed read the app makes, as the party that makes it. */
    const snapshot = async () =>
      norm({
        myProperties: await as("property", owner).getMyProperties(),
        jobsP1: await as("job", owner).getJobsForProperty(p1),
        jobsP2: await as("job", owner).getJobsForProperty(p2),
        proposalsForMe: await as("job", owner).getPendingProposals(),
        proJobs: await as("job", pro).getJobsPendingMySignature(),
        myQuoteReqs: await as("quote", owner).getMyQuoteRequests(),
        quotesForReq: await as("quote", owner).getQuotesForRequest(quoteRequestId),
        proQuotes: await as("quote", pro).getMyQuotes(),
        openQuoteReqs: await as("quote", pro).getOpenRequests(),
        billsP1: await as("bills", owner).getBillsForProperty(p1),
        expensesP1: await as("bills", owner).getRecurringExpensesForProperty(p1),
        servicesP1: await as("recurring", owner).getByProperty(p1),
        visits: await as("recurring", owner).getVisitLogs(serviceId),
        scheduleP1: await as("maintenance", owner).getScheduleByProperty(p1),
        devicesP1: await as("sensor", owner).getDevicesForProperty(p1),
        eventsP1: await as("sensor", owner).getEventsForProperty(p1, 10n),
        myBidRequests: await as("listing", owner).getMyBidRequests(),
        openBidReqs: await as("listing", agent).getOpenBidRequests(),
        myProposals: await as("listing", agent).getMyProposals(),
        proposals: await as("listing", admin).getProposalsForRequest(bidRequestId),
        agentReviews: await as("agent", other).getReviews(agent.getPrincipal()),
        feeForRequest: await as("fee", admin).getFeeForRequest(bidRequestId),
        proReviews: await as("contractor", other).getReviewsForContractor(pro.getPrincipal()),
      });

    beforeAll(async () => {
      pic = await createPic();
      d = await deployAll(pic, admin, (n) => baseWasmPath(n) ?? wasmPath(n));

      ok(await as("payment", admin).adminActivateStripeSubscription(owner.getPrincipal(), { Pro: null }, 12n));
      const home = async (street: string) =>
        ok<any>(
          await as("property", owner).registerProperty({
            address: street,
            city: "Orlando",
            state: "FL",
            zipCode: "32801",
            propertyType: { SingleFamily: null },
            yearBuilt: 2004n,
            squareFeet: 1850n,
            tier: { Pro: null },
          }),
        ).id as string;
      p1 = await home("1 Index Way");
      p2 = await home("2 Index Way");

      // Jobs: two the homeowner logged, one a contractor proposed (awaiting them).
      ok(
        await as("contractor", pro).register({
          name: "Pat Plumbing",
          specialties: [{ Plumbing: null }],
          email: "pat@example.com",
          phone: "+14075550123",
        }),
      );
      const done = (await nowNs()) - 30n * DAY_NS;
      const diy = ok<any>(
        await as("job", owner).createJob(
          p1,
          "Filter swap",
          { HVAC: null },
          "MERV 13",
          [],
          4_000n,
          done,
          [],
          [],
          true,
          [],
        ),
      );
      ok(
        await as("job", owner).createJob(
          p2,
          "Roof patch",
          { Roofing: null },
          "Two shingles",
          ["Top Roofing"],
          85_000n,
          done,
          [],
          [],
          false,
          [],
        ),
      );
      ok(
        await as("job", pro).createJobProposal(
          p1,
          "Repipe",
          { Plumbing: null },
          "PEX repipe.",
          ["Pat Plumbing"],
          950_000n,
          done,
          [],
          [],
        ),
      );
      void diy;

      // A quote request with the contractor's bid (ContractorPro: no referral card needed).
      ok(await as("payment", admin).adminActivateStripeSubscription(pro.getPrincipal(), { ContractorPro: null }, 12n));
      quoteRequestId = ok<any>(
        await as("quote", owner).createQuoteRequest(
          p1,
          { Plumbing: null },
          "Leak under sink",
          { High: null },
          [],
          [],
          [],
          [],
          [],
        ),
      ).id;
      ok(await as("quote", pro).submitQuote(quoteRequestId, 45_000n, 2n, (await nowNs()) + 7n * DAY_NS));

      // Bills and a recurring expense.
      ok(
        await as("bills", owner).addBill({
          propertyId: p1,
          billType: { Electric: null },
          provider: "Duke",
          periodStart: "2026-08-01",
          periodEnd: "2026-08-31",
          amountCents: 14_200n,
          usageAmount: [],
          usageUnit: [],
        }),
      );
      ok(
        await as("bills", owner).addBill({
          propertyId: p1,
          billType: { Water: null },
          provider: "OUC",
          periodStart: "2026-08-01",
          periodEnd: "2026-08-31",
          amountCents: 6_100n,
          usageAmount: [],
          usageUnit: [],
        }),
      );

      // A recurring service and a visit.
      serviceId = ok<any>(
        await as("recurring", owner).createRecurringService(
          p1,
          { LawnCare: null },
          "Green Co",
          [],
          [],
          { Monthly: null },
          "2026-01-01",
          [],
          [],
        ),
      ).id;
      ok(await as("recurring", owner).addVisitLog(serviceId, "2026-02-01", ["Edged and mowed"]));

      // A maintenance plan entry.
      ok(await as("maintenance", owner).createScheduleEntry(p1, "HVAC", "Annual service", 2027n, [3n], [20_000n]));

      // A sensor and an event (admin stands in for the IoT gateway).
      ok(await as("sensor", owner).registerDevice(p1, "leak-1", { Manual: null }, "Leak sensor"));
      ok(await as("sensor", admin).recordEvent("leak-1", { HighHumidity: null }, 71.5, "%", "{}"));

      // Bid to List: a request, a reviewed agent's proposal, a review.
      const g = agent.getPrincipal();
      ok(
        await as("agent", agent).register({
          name: "Riley Realtor",
          brokerage: "Lakeside",
          licenseNumber: "SL3456789",
          licenseState: "FL",
          county: "Orange",
          serviceCities: ["orlando"],
          bio: "",
          phone: "",
          email: "riley@example.com",
        }),
      );
      ok(await as("agent", admin).verifyAgent(g));
      ok(await as("agent", agent).setCardOnFile(true));
      bidRequestId = ok<any>(
        await as("listing", owner).createBidRequest(
          p2,
          "2 Index Way",
          "Orlando",
          "Orange",
          "32801",
          "owner@example.com",
          [3n],
          [2n],
          [1850n],
          (await nowNs()) + 30n * DAY_NS,
          [400_000_00n],
          "",
          { Seven: null },
        ),
      ).id;
      const bid = ok<any>(
        await as("listing", agent).submitProposal(
          bidRequestId,
          250n,
          405_000_00n,
          "Comps",
          "MLS",
          ["Pro photos"],
          21n,
          [],
          (await nowNs()) + 30n * DAY_NS,
          "",
        ),
      );
      // The seller picks it, the fee settles, and the seller reviews the agent.
      const feeId = ok<string>(await as("listing", owner).acceptProposal(bid.id));
      ok(await as("fee", admin).markFeePaid(feeId));
      ok(await as("listing", admin).markListingFeePaid(bidRequestId, bid.id));
      ok(await as("agent", owner).addReview({ agentId: g, rating: 5n, comment: "Sharp", transactionId: bid.id }));

      // A metrics push the stale-metrics timer will later find old.
      await as("monitoring", admin).recordCanisterMetrics(
        d.ids.job,
        20_000_000_000_000n,
        1_000n,
        10n,
        100n,
        5n,
        0n,
        20n,
      );
    }, 600_000);

    afterAll(async () => {
      await pic?.tearDown();
    });

    it("every index-backed read answers the same after all 20 upgrade", async () => {
      const before = await snapshot();
      // The reads hold what was written, so a broken index can't pass as empty.
      expect(before.myProperties).toHaveLength(2);
      expect(before.jobsP1.ok).toHaveLength(2);
      expect(before.proposalsForMe).toHaveLength(1);
      expect(before.proQuotes).toHaveLength(1);
      expect(before.billsP1.ok).toHaveLength(2);
      expect(before.visits).toHaveLength(1);
      expect(before.scheduleP1).toHaveLength(1);
      expect(before.devicesP1).toHaveLength(1);
      expect(before.eventsP1).toHaveLength(1);
      expect(before.myBidRequests).toHaveLength(1);
      expect(before.myProposals).toHaveLength(1);
      expect(before.agentReviews).toHaveLength(1);
      expect(before.feeForRequest).toHaveLength(1);

      for (const name of ALL_CANISTERS) {
        await pic.upgradeCanister({ canisterId: d.ids[name], wasm: readFileSync(wasmPath(name)) });
      }
      await pic.tick();
      expect(await snapshot()).toEqual(before);
    }, 300_000);

    it("new writes land in the rebuilt indexes, through upgraded peers", async () => {
      // Each of these crosses canisters: job → property (ownership),
      // bills/recurring/maintenance/sensor → property (role), listing → agent.
      const done = (await nowNs()) - DAY_NS;
      ok(
        await as("job", owner).createJob(p1, "After upgrade", { HVAC: null }, "d", [], 1_000n, done, [], [], true, []),
      );
      ok(
        await as("bills", owner).addBill({
          propertyId: p1,
          billType: { Gas: null },
          provider: "TECO",
          periodStart: "2026-09-01",
          periodEnd: "2026-09-30",
          amountCents: 3_000n,
          usageAmount: [],
          usageUnit: [],
        }),
      );
      ok(await as("recurring", owner).addVisitLog(serviceId, "2026-03-01", []));
      ok(await as("maintenance", owner).createScheduleEntry(p1, "Roof", "Inspect", 2028n, [], []));
      ok(await as("sensor", owner).registerDevice(p1, "leak-2", { Manual: null }, "Second sensor"));
      ok(
        await as("quote", owner).createQuoteRequest(
          p2,
          { HVAC: null },
          "No cooling",
          { Medium: null },
          [],
          [],
          [],
          [],
          [],
        ),
      );

      const after = await snapshot();
      expect(after.jobsP1.ok.map((j: any) => j.title)).toContain("After upgrade");
      expect(after.billsP1.ok).toHaveLength(3);
      expect(after.visits).toHaveLength(2);
      expect(after.scheduleP1).toHaveLength(2);
      expect(after.devicesP1).toHaveLength(2);
      expect(after.myQuoteReqs).toHaveLength(2);
      // A stranger still sees none of the homeowner's records.
      expect(norm(await as("job", other).getJobsForProperty(p1))).toEqual({ ok: [] });
    }, 120_000);

    it("the stale-metrics timer still fires after the upgrade", async () => {
      const stale = async () =>
        ((await as("monitoring", admin).getActiveAlerts()) as any[]).filter(
          (a) => "Stale" in a.category && a.canisterId[0]?.toText() === d.ids.job.toText(),
        );
      expect(await stale()).toHaveLength(0);
      // Over an hour without a push, then past the next 5-minute check.
      await pic.advanceTime(65 * 60 * 1000);
      for (let i = 0; i < 5; i++) {
        await pic.tick();
      }
      await pic.advanceTime(6 * 60 * 1000);
      for (let i = 0; i < 5; i++) {
        await pic.tick();
      }
      expect((await stale()).length).toBeGreaterThan(0);
    }, 120_000);
  },
);
