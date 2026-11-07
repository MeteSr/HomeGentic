/**
 * Registering an address you already own (Mete's call, 2026-11-03: "return
 * the existing home"). Before this, the same owner registering the same
 * address twice got a second property: addressConflict let the owner through
 * as "idempotent" but registerProperty still wrote a new record.
 *
 *  REREG.1 the second registration returns the first home, unchanged, and
 *          the owner still has one property
 *  REREG.2 address matching is the same normalised key (case, spacing)
 *  REREG.3 a Free owner at the 1-property limit gets the home back instead
 *          of the plan-limit error
 *  REREG.4 another owner is still refused (AddressConflict), and a different
 *          address still makes a new home
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PocketIc, createIdentity } from "@dfinity/pic";
import type { Identity } from "@icp-sdk/core/agent";
import { createPic } from "./__helpers__/setup";
import { deployAll, type Deployment } from "./__helpers__/deployAll";

const ok = (r: any) => {
  if ("err" in r) throw new Error(`Expected ok, got err: ${Object.keys(r.err)[0]}`);
  return r.ok;
};
const args = (address: string, extra: Record<string, unknown> = {}) => ({
  address,
  city: "Orlando",
  state: "FL",
  zipCode: "32801",
  propertyType: { SingleFamily: null },
  yearBuilt: 1998n,
  squareFeet: 1850n,
  tier: { Free: null },
  ...extra,
});

describe("registering an address you already own", () => {
  let pic: PocketIc;
  let d: Deployment;
  let n = 0;
  const admin = createIdentity("rereg-admin");
  const user = () => createIdentity(`rereg-user-${++n}`);
  const property = (who: Identity) => d.actor("property", who);

  beforeAll(async () => {
    pic = await createPic();
    d = await deployAll(pic, admin);
  });
  afterAll(async () => {
    await pic?.tearDown();
  });

  it("REREG.1 returns the existing home instead of a second one", async () => {
    const owner = user();
    ok(await d.actor("payment", admin).grantSubscription(owner.getPrincipal(), { Pro: null }));
    const first = ok(await property(owner).registerProperty(args("12 Lake Ave")));
    const again = ok(await property(owner).registerProperty(args("12 Lake Ave", { squareFeet: 9999n })));
    expect(again.id).toBe(first.id);
    expect(again.squareFeet).toBe(1850n);
    expect(await property(owner).getMyProperties()).toHaveLength(1);
  });

  it("REREG.2 matches the normalised address", async () => {
    const owner = user();
    ok(await d.actor("payment", admin).grantSubscription(owner.getPrincipal(), { Pro: null }));
    const first = ok(await property(owner).registerProperty(args("40 Pine St")));
    const again = ok(await property(owner).registerProperty(args("  40 pine st ")));
    expect(again.id).toBe(first.id);
    expect(await property(owner).getMyProperties()).toHaveLength(1);
  });

  it("REREG.3 a Free owner at the limit gets the home back, not the plan-limit error", async () => {
    const owner = user();
    const first = ok(await property(owner).registerProperty(args("7 Oak Ct")));
    const again = await property(owner).registerProperty(args("7 Oak Ct"));
    expect(again).toEqual({ ok: expect.objectContaining({ id: first.id }) });
    const other = await property(owner).registerProperty(args("8 Oak Ct"));
    expect(other.err?.InvalidInput).toMatch(/plan limit/);
  });

  it("REREG.4 someone else is still refused, and a new address is still a new home", async () => {
    const owner = user();
    ok(await d.actor("payment", admin).grantSubscription(owner.getPrincipal(), { Pro: null }));
    const first = ok(await property(owner).registerProperty(args("90 Elm Rd")));
    const stranger = await property(user()).registerProperty(args("90 Elm Rd"));
    expect(Object.keys(stranger.err ?? {})).toEqual(["AddressConflict"]);
    const second = ok(await property(owner).registerProperty(args("91 Elm Rd")));
    expect(second.id).not.toBe(first.id);
    expect(await property(owner).getMyProperties()).toHaveLength(2);
  });
});
