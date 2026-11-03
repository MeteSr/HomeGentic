/**
 * Upgrades for the canisters the generic all-canisters upgrade test can't seed
 * with sampled arguments (agent needs a valid licence profile, bills a wired
 * property and a Pro owner). Seeded by hand on a wired deployment, upgraded
 * from the base build when there is one, and read back.
 *
 *  SEED.1 agent: profiles, verification and reviews survive
 *  SEED.2 bills: bills and recurring expenses survive, and the per-property
 *         lists still answer
 *
 * Run: cd tests/upgrade && npx vitest run seeded-upgrade.upgrade.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "fs";
import { PocketIc, createIdentity } from "@dfinity/pic";
import type { Identity } from "@icp-sdk/core/agent";
import { createPic, wasmPath, baseWasmPath, CONTROLLER } from "./__helpers__/setup";
import { deployAll, type Deployment, type CanisterName } from "./__helpers__/deployAll";

type R<T> = { ok: T } | { err: Record<string, unknown> };
const ok = <T,>(r: R<T>): T => {
  if ("err" in r) throw new Error(`Expected ok, got err: ${JSON.stringify(r.err, (_k, v) => (typeof v === "bigint" ? v.toString() : v))}`);
  return r.ok;
};
const norm = (x: unknown) => JSON.stringify(x, (_k, v) => (typeof v === "bigint" ? v.toString() : v?._isPrincipal ? v.toText() : v));

describe("hand-seeded upgrades from the base build", () => {
  let pic: PocketIc;
  let d: Deployment;
  const admin = createIdentity("seed-admin");
  const as = (name: CanisterName, who: Identity) => d.actor(name, who);
  const upgrade = (name: CanisterName) =>
    pic.upgradeCanister({ canisterId: d.ids[name], wasm: readFileSync(wasmPath(name)), sender: CONTROLLER.getPrincipal() });

  beforeAll(async () => {
    pic = await createPic();
    d = await deployAll(pic, admin, (n) => baseWasmPath(n) ?? wasmPath(n));
  });
  afterAll(async () => { await pic?.tearDown(); });

  it("SEED.1 agent profiles, verification and reviews survive", async () => {
    const agentId = createIdentity("seed-agent");
    ok(await as("agent", agentId).register({
      name: "Pat Realtor", brokerage: "Sun Realty", licenseNumber: "SL3412345", licenseState: "FL",
      county: "Orange", serviceCities: ["Orlando"], bio: "Central Florida homes.", phone: "+14075550123", email: "pat@example.com",
    }));
    ok(await as("agent", admin).verifyAgent(agentId.getPrincipal()));
    const read = async () => norm({
      mine: await as("agent", agentId).getMyProfile(),
      all: await as("agent", admin).getAllProfiles(),
      city: await as("agent", admin).getAgentsForCity("Orlando", 10n),
      verified: await as("agent", admin).isVerifiedAgent(agentId.getPrincipal()),
      reviews: await as("agent", admin).getReviews(agentId.getPrincipal()),
    });
    const before = await read();
    expect(before).toContain("Pat Realtor");
    expect(before).toContain('"verified":true');
    await upgrade("agent");
    expect(await read()).toBe(before);
  });

  it("SEED.2 bills and recurring expenses survive", async () => {
    const owner = createIdentity("seed-owner");
    ok(await as("payment", admin).grantSubscription(owner.getPrincipal(), { Pro: null }));
    const pid = ok<any>(await as("property", owner).registerProperty({
      address: "9 Upgrade Row", city: "Orlando", state: "FL", zipCode: "32801",
      propertyType: { SingleFamily: null }, yearBuilt: 1998n, squareFeet: 1850n, tier: { Pro: null },
    })).id;
    for (const [start, end, cents] of [["2026-07-01", "2026-07-31", 11_000n], ["2026-08-01", "2026-08-31", 12_500n]] as const) {
      ok(await as("bills", owner).addBill({
        propertyId: pid, billType: { Electric: null }, provider: "Duke", periodStart: start,
        periodEnd: end, amountCents: cents, usageAmount: [], usageUnit: [],
      }));
    }
    const read = async () => norm({
      bills: await as("bills", owner).getBillsForProperty(pid),
      batch: await as("bills", owner).getBillsForProperties([pid]),
      expenses: await as("bills", owner).getRecurringExpensesForProperty(pid),
    });
    const before = await read();
    expect(before).toContain("12500");
    await upgrade("bills");
    expect(await read()).toBe(before);
  });
});
