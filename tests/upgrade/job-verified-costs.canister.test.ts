/**
 * Verified local costs: owners choose to share their homes' finished job
 * costs (job.setCostSharing), and anyone can read the anonymous price range
 * for a trade near a ZIP (job.getVerifiedLocalCosts), on real property,
 * payment, job, contractor and quote canisters wired as deploy.sh wires them.
 *
 *  VC.1  only the home's owner can turn sharing on or off; the owner reads
 *        back which of their homes share
 *  VC.2  nothing is shown until 5 sharing homes AND 3 different contractors
 *  VC.3  the range is the 25th/50th/75th percentile of each home's newest
 *        qualifying job, rounded to two significant figures; the home count
 *        is rounded down to a multiple of 5
 *  VC.4  only finished jobs signed by the homeowner and a HomeGentic-verified
 *        contractor in the last 24 months count: DIY, unverified contractors,
 *        unsigned jobs, homes that don't share and older jobs are left out
 *  VC.5  the ZIP comes from the home's record, and an area with too few homes
 *        widens to the ZIP's first three digits ("328xx")
 *  VC.6  turning sharing off, or the home changing hands, takes it out at once
 *  VC.7  bad input reads as "no data"
 *  VC.8  sharing survives an upgrade (new stable side map)
 *  VC.9  deleteMyData drops the owner's sharing
 *  VC.10 quote.getLocalPriceStats (accepted bids) is retired and returns null
 *
 * Run: cd tests/upgrade && npx vitest run job-verified-costs.canister.test.ts
 * (needs .dfx/local/canisters/{property,payment,job,contractor,quote}/*.wasm)
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

const CANISTERS = ["property", "payment", "job", "contractor", "quote"] as const;
type Name = (typeof CANISTERS)[number];
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;
const dollars = (d: number) => BigInt(Math.round(d * 100));

describe("verified local costs", () => {
  let pic: PocketIc;
  const ids = {} as Record<Name, any>;
  const svcs = {} as Record<Name, IDL.ServiceClass>;

  const admin = createIdentity("vc-admin");
  const stranger = createIdentity("vc-stranger");
  // Homes 0-6 are in 32801, home 7 in 32803 (same first three digits).
  const owners = Array.from({ length: 8 }, (_, i) => createIdentity(`vc-owner-${i}`));
  const homes: string[] = [];
  const [c1, c2, c3] = [1, 2, 3].map((i) => createIdentity(`vc-pro-${i}`));
  const unverified = createIdentity("vc-pro-unverified");

  const as = (name: Name, who: Identity) => {
    const a = pic.createActor<any>((() => svcs[name]) as any, ids[name]);
    a.setIdentity(who);
    return a;
  };
  const monthsAgo = async (m: number) => BigInt(Math.round((await pic.getTime()) - m * MONTH_MS)) * 1_000_000n;

  /** A job the contractor proposes and the owner approves and signs. */
  const signedJob = async (
    home: number,
    pro: Identity,
    serviceType: object,
    amount: number,
    ago: number,
    sign = true,
  ) => {
    const job = ok<any>(
      await as("job", pro).createJobProposal(
        homes[home],
        "Work",
        serviceType,
        "Finished work",
        ["Pro"],
        dollars(amount),
        await monthsAgo(ago),
        [],
        [],
      ),
    );
    ok(await as("job", owners[home]).approveJobProposal(job.id));
    if (sign) expect(ok<any>(await as("job", owners[home]).verifyJob(job.id)).verified).toBe(true);
    await pic.advanceTime(2_000);
    return job.id as string;
  };
  const share = async (home: number, on = true) => ok(await as("job", owners[home]).setCostSharing(homes[home], on));
  const costs = async (serviceType: string, zip: string) => {
    const r = (await as("job", stranger).getVerifiedLocalCosts(serviceType, zip)) as any[];
    if (r.length === 0) return null;
    const s = r[0];
    return {
      low: Number(s.low) / 100,
      median: Number(s.median) / 100,
      high: Number(s.high) / 100,
      homes: Number(s.homes),
      area: s.area,
    };
  };

  beforeAll(async () => {
    pic = await createPic();
    for (const name of CANISTERS) {
      const { idlFactory, initArgs } = serviceFromWasm(wasmPath(name));
      svcs[name] = idlFactory({ IDL });
      const arg = new Uint8Array(
        IDL.encode(
          initArgs,
          initArgs.map(() => admin.getPrincipal()),
        ),
      );
      ids[name] = (
        await pic.setupCanister({ idlFactory: (() => svcs[name]) as any, wasm: wasmPath(name), arg })
      ).canisterId;
      const methods = new Map(svcs[name]._fields);
      if (methods.has("setBootstrapNonce")) await as(name, CONTROLLER).setBootstrapNonce("n");
      if (methods.has("initAdmins")) ok(await as(name, admin).initAdmins([admin.getPrincipal()], "n"));
      else ok(await as(name, admin).addAdmin(admin.getPrincipal(), "n"));
    }
    ok(await as("property", admin).setPaymentCanisterId(ids.payment));
    ok(await as("job", admin).setPropertyCanisterId(ids.property.toText()));
    ok(await as("job", admin).setContractorCanisterId(ids.contractor.toText()));
    ok(await as("contractor", admin).setJobCanisterId(ids.job.toText()));
    ok(await as("job", admin).addTrustedCanister(ids.contractor));
    ok(await as("job", admin).addTrustedCanister(ids.property));
    ok(await as("quote", admin).setPropertyCanisterId(ids.property));
    ok(await as("quote", admin).setPaymentCanisterId(ids.payment));
    ok(await as("property", admin).addTrustedCanister(ids.quote));

    for (const [i, owner] of owners.entries()) {
      homes.push(
        ok<any>(
          await as("property", owner).registerProperty({
            address: `${10 + i} Ledger Street`,
            city: "Orlando",
            state: "FL",
            zipCode: i === 7 ? "32803" : "32801-1234",
            propertyType: { SingleFamily: null },
            yearBuilt: 1999n,
            squareFeet: 1600n,
            tier: { Free: null },
          }),
        ).id,
      );
    }
    for (const [i, pro] of [c1, c2, c3, unverified].entries()) {
      ok(
        await as("contractor", pro).register({
          name: `Pro ${i}`,
          specialties: [{ Roofing: null }],
          email: `pro${i}@example.com`,
          phone: "+14075550100",
        }),
      );
    }
    for (const pro of [c1, c2, c3]) ok(await as("contractor", admin).verifyContractor(pro.getPrincipal()));

    // Roofing, one newest qualifying job per home 0-4 by three contractors.
    await signedJob(0, c1, { Roofing: null }, 10_000, 6);
    await signedJob(1, c2, { Roofing: null }, 12_345, 6);
    await signedJob(2, c1, { Roofing: null }, 15_000, 5);
    await signedJob(3, c2, { Roofing: null }, 18_000, 5);
    await signedJob(4, c3, { Roofing: null }, 22_000, 4);
    // Plumbing at five homes, but by only two contractors.
    for (const home of [0, 1, 2, 3, 4])
      await signedJob(home, home % 2 ? c1 : c2, { Plumbing: null }, 800 + home * 100, 3);
  }, 300_000);

  afterAll(async () => {
    await pic?.tearDown();
  });

  it("VC.1 lets only the home's owner turn sharing on and off", async () => {
    expect(errKey(await as("job", stranger).setCostSharing(homes[0], true))).toBe("NotAuthorized");
    expect(errKey(await as("job", c1).setCostSharing(homes[0], true))).toBe("NotAuthorized");
    expect(errKey(await as("job", owners[0]).setCostSharing(homes[1], true))).toBe("NotAuthorized");
    expect(errKey(await as("job", owners[0]).setCostSharing("no-such-home", true))).toBe("NotFound");

    expect(await as("job", owners[0]).getMyCostSharing()).toEqual([]);
    await share(0);
    expect(await as("job", owners[0]).getMyCostSharing()).toEqual([homes[0]]);
    expect(await as("job", stranger).getMyCostSharing()).toEqual([]);
    await share(0, false);
    expect(await as("job", owners[0]).getMyCostSharing()).toEqual([]);
  });

  it("VC.2 shows nothing until 5 homes and 3 contractors share", async () => {
    for (const home of [0, 1, 2, 3]) await share(home);
    expect(await costs("Roofing", "32801")).toBeNull();
    await share(4);
    expect(await costs("Roofing", "32801")).not.toBeNull();
    // Five homes share plumbing costs, but only two contractors did the work.
    expect(await costs("Plumbing", "32801")).toBeNull();
  });

  it("VC.3 gives a rounded range of each home's newest job and a rounded home count", async () => {
    expect(await costs("Roofing", "32801")).toEqual({
      low: 12_000,
      median: 15_000,
      high: 18_000,
      homes: 5,
      area: "32801",
    });
    // A newer job at home 1 replaces its older one.
    await signedJob(1, c3, { Roofing: null }, 13_100, 1);
    expect(await costs("Roofing", "32801")).toEqual({
      low: 13_000,
      median: 15_000,
      high: 18_000,
      homes: 5,
      area: "32801",
    });
  });

  it("VC.4 leaves out DIY, unverified contractors, unsigned jobs, homes that don't share and old jobs", async () => {
    const before = await costs("Roofing", "32801");
    // Newer jobs at home 0 that must not replace its $10,000 job.
    const diy = ok<any>(
      await as("job", owners[0]).createJob(
        homes[0],
        "DIY roof",
        { Roofing: null },
        "Did it myself",
        [],
        dollars(90_000),
        await monthsAgo(0.5),
        [],
        [],
        true,
        [],
      ),
    ).id;
    ok(await as("job", owners[0]).verifyJob(diy));
    await signedJob(0, unverified, { Roofing: null }, 90_000, 0.5);
    await signedJob(0, c1, { Roofing: null }, 90_000, 0.5, false);
    // A home that doesn't share, and a sharing home whose only job is 25 months old.
    await signedJob(5, c3, { Roofing: null }, 90_000, 1);
    await signedJob(6, c3, { Roofing: null }, 90_000, 25);
    await share(6);
    expect(await costs("Roofing", "32801")).toEqual(before);
  });

  it("VC.5 uses the ZIP on the home's record and widens to its first three digits", async () => {
    await signedJob(7, c1, { Roofing: null }, 16_000, 2);
    await share(7);
    // 32803 has one home: the range comes from 328xx (six homes, shown as 5).
    const wide = { low: 13_000, median: 16_000, high: 18_000, homes: 5, area: "328xx" };
    expect(await costs("Roofing", "32803")).toEqual(wide);
    expect(await costs("Roofing", "32899")).toEqual(wide);
    expect(await costs("Roofing", "32901")).toBeNull();
  });

  it("VC.6 takes a home out at once when sharing stops or the home changes hands", async () => {
    // Without home 4, 32801 has four homes, so the range falls back to 328xx.
    await share(4, false);
    expect((await costs("Roofing", "32801"))?.area).toBe("328xx");
    await share(4);
    expect((await costs("Roofing", "32801"))?.area).toBe("32801");

    ok(await as("job", admin).propertyTransferred(homes[4], owners[4].getPrincipal(), stranger.getPrincipal()));
    expect(await as("job", owners[4]).getMyCostSharing()).toEqual([]);
    expect((await costs("Roofing", "32801"))?.area).toBe("328xx");
    await share(4);
  });

  it("VC.7 reads bad input as no data", async () => {
    expect(await costs("NotATrade", "32801")).toBeNull();
    expect(await costs("Roofing", "328")).toBeNull();
    expect(await costs("Roofing", "3280a")).toBeNull();
  });

  it("VC.8 keeps sharing across an upgrade", async () => {
    const before = await costs("Roofing", "32801");
    await pic.upgradeCanister({ canisterId: ids.job, wasm: readFileSync(wasmPath("job")) });
    expect(await as("job", owners[2]).getMyCostSharing()).toEqual([homes[2]]);
    expect(await costs("Roofing", "32801")).toEqual(before);
  });

  it("VC.9 drops the owner's sharing on deleteMyData", async () => {
    ok(await as("job", owners[3]).deleteMyData());
    expect(await as("job", owners[3]).getMyCostSharing()).toEqual([]);
  });

  it("VC.10 retires accepted-bid prices on the quote canister", async () => {
    const owner = createIdentity("vc-quote-owner");
    ok(await as("payment", admin).adminActivateStripeSubscription(owner.getPrincipal(), { Pro: null }, 12n));
    const home = ok<any>(
      await as("property", owner).registerProperty({
        address: "1 Bid Court",
        city: "Orlando",
        state: "FL",
        zipCode: "32801",
        propertyType: { SingleFamily: null },
        yearBuilt: 2001n,
        squareFeet: 1500n,
        tier: { Pro: null },
      }),
    ).id;
    const until = BigInt((await pic.getTime()) + MONTH_MS) * 1_000_000n;
    for (const amount of [1_000, 2_000, 3_000, 4_000, 5_000]) {
      const req = ok<any>(
        await as("quote", owner).createQuoteRequest(
          home,
          { Plumbing: null },
          "Fix pipes",
          { Low: null },
          ["32801"],
          [],
          [],
          [],
          [],
        ),
      );
      const q = ok<any>(await as("quote", c1).submitQuote(req.id, dollars(amount), 3n, until));
      ok(await as("quote", owner).acceptQuote(q.id));
    }
    expect(await as("quote", stranger).getLocalPriceStats("Plumbing", "32801")).toEqual([]);
  });
});
