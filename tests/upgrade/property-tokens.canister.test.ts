/**
 * The token-gated lookups behind the claim pages (/transfer/claim/:token and
 * /manage/claim/:token), and property's other reads that had no real-canister
 * test.
 *
 *  TOK.1 a transfer token shows the pending transfer and the home, with the
 *        owner's identity evidence blanked; an unknown token shows nothing
 *  TOK.2 once expired the transfer still reads (so the page can say
 *        "expired") but the home no longer does, and it can't be claimed
 *  TOK.3 a cancelled transfer's token shows nothing
 *  TOK.4 a manager invite token behaves the same way; a cancelled invite shows
 *        nothing
 *  TOK.5 getJobPropertyAddresses answers only the job's parties
 *  TOK.6 getRoomMetrics counts rooms and fixtures
 *
 * Run: cd tests/upgrade && npx vitest run property-tokens.canister.test.ts
 * (needs .dfx/local/canisters/<all>/<name>.wasm)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PocketIc, createIdentity } from "@dfinity/pic";
import type { Identity } from "@icp-sdk/core/agent";
import { createPic } from "./__helpers__/setup";
import { deployAll, type Deployment, type CanisterName } from "./__helpers__/deployAll";

type R<T> = { ok: T } | { err: Record<string, unknown> };
const ok = <T>(r: R<T>): T => {
  if ("err" in r)
    throw new Error(
      `Expected ok, got err: ${JSON.stringify(r.err, (_k, v) => (typeof v === "bigint" ? v.toString() : v))}`,
    );
  return r.ok;
};
const errOf = (r: R<unknown>) => ("err" in r ? Object.keys(r.err)[0] : "ok");
const DAY_MS = 24 * 60 * 60 * 1000;

describe("property: claim-page tokens and other reads", () => {
  let pic: PocketIc;
  let d: Deployment;
  let n = 0;
  const admin = createIdentity("tok-admin");
  const visitor = createIdentity("tok-visitor");
  const as = (name: CanisterName, who: Identity) => d.actor(name, who);

  async function proUser(): Promise<Identity> {
    const u = createIdentity(`tok-user-${++n}`);
    ok(await as("payment", admin).grantSubscription(u.getPrincipal(), { Pro: null }));
    return u;
  }
  async function home(owner: Identity): Promise<any> {
    return ok(
      await as("property", owner).registerProperty({
        address: `${++n} Token Street`,
        city: "Orlando",
        state: "FL",
        zipCode: "32801",
        propertyType: { SingleFamily: null },
        yearBuilt: 1998n,
        squareFeet: 1850n,
        tier: { Pro: null },
      }),
    );
  }

  beforeAll(async () => {
    pic = await createPic();
    d = await deployAll(pic, admin);
  });
  afterAll(async () => {
    await pic?.tearDown();
  });

  it("TOK.1 a transfer token shows the transfer and the home, with identity evidence blanked", async () => {
    const owner = await proUser();
    const p = await home(owner);
    const pt = ok<any>(await as("property", owner).initiateTransfer(p.id));
    const [pending] = await as("property", visitor).getPendingTransferByToken(pt.token);
    expect(pending).toMatchObject({ propertyId: p.id, token: pt.token });
    expect(pending.from.toText()).toBe(owner.getPrincipal().toText());

    const [viaToken] = await as("property", visitor).getPropertyByTransferToken(pt.token);
    expect(viaToken.id).toBe(p.id);
    expect(viaToken.address).toBe(p.address);
    // Whatever a stranger may not see through getProperty, the token doesn't show either.
    const asStranger = ok<any>(await as("property", visitor).getProperty(p.id));
    for (const [k, v] of Object.entries(asStranger)) if (k !== "address") expect([k, viaToken[k]]).toEqual([k, v]);

    expect(await as("property", visitor).getPendingTransferByToken("no-such-token")).toEqual([]);
    expect(await as("property", visitor).getPropertyByTransferToken("no-such-token")).toEqual([]);
  });

  it("TOK.2 an expired transfer still reads as expired, but shows no home and can't be claimed", async () => {
    const owner = await proUser();
    const buyer = await proUser();
    const p = await home(owner);
    const pt = ok<any>(await as("property", owner).initiateTransfer(p.id));
    await pic.advanceTime(91 * DAY_MS);
    await pic.tick();
    const [pending] = await as("property", visitor).getPendingTransferByToken(pt.token);
    expect(BigInt(pending.expiresAt)).toBeLessThan(BigInt(await pic.getTime()) * 1_000_000n);
    expect(await as("property", visitor).getPropertyByTransferToken(pt.token)).toEqual([]);
    expect(errOf(await as("property", buyer).claimTransfer(pt.token))).not.toBe("ok");
    expect(ok<any>(await as("property", owner).getProperty(p.id)).owner.toText()).toBe(owner.getPrincipal().toText());
  });

  it("TOK.3 a cancelled transfer's token shows nothing", async () => {
    const owner = await proUser();
    const p = await home(owner);
    const pt = ok<any>(await as("property", owner).initiateTransfer(p.id));
    expect(errOf(await as("property", visitor).cancelTransfer(p.id))).not.toBe("ok");
    ok(await as("property", owner).cancelTransfer(p.id));
    expect(await as("property", visitor).getPendingTransferByToken(pt.token)).toEqual([]);
    expect(await as("property", visitor).getPropertyByTransferToken(pt.token)).toEqual([]);
  });

  it("TOK.4 a manager invite token shows the invite and home until it expires or is cancelled", async () => {
    const owner = await proUser();
    const p = await home(owner);
    const inv = ok<any>(await as("property", owner).inviteManager(p.id, { Viewer: null }, "Morgan", []));
    const [invite] = await as("property", visitor).getManagerInviteByToken(inv.token);
    expect(invite).toMatchObject({ propertyId: p.id, displayName: "Morgan", role: { Viewer: null } });
    const [viaToken] = await as("property", visitor).getPropertyByManagerInviteToken(inv.token);
    expect(viaToken.id).toBe(p.id);
    expect(await as("property", visitor).getManagerInviteByToken("nope")).toEqual([]);
    expect(await as("property", visitor).getPropertyByManagerInviteToken("nope")).toEqual([]);

    expect(errOf(await as("property", visitor).cancelManagerInvite(p.id, inv.token))).not.toBe("ok");
    ok(await as("property", owner).cancelManagerInvite(p.id, inv.token));
    expect(await as("property", visitor).getManagerInviteByToken(inv.token)).toEqual([]);
    expect(await as("property", visitor).getPropertyByManagerInviteToken(inv.token)).toEqual([]);

    const inv2 = ok<any>(await as("property", owner).inviteManager(p.id, { Manager: null }, "Sam", []));
    await pic.advanceTime(91 * DAY_MS);
    await pic.tick();
    const [stale] = await as("property", visitor).getManagerInviteByToken(inv2.token);
    expect(BigInt(stale.expiresAt)).toBeLessThan(BigInt(await pic.getTime()) * 1_000_000n);
    expect(await as("property", visitor).getPropertyByManagerInviteToken(inv2.token)).toEqual([]);
  });

  it("TOK.5 getJobPropertyAddresses answers the job's homeowner and nobody else", async () => {
    const owner = await proUser();
    const p = await home(owner);
    const job = ok<any>(
      await as("job", owner).createJob(p.id, "Roof", { Roofing: null }, "New roof.", [], 0n, 0n, [], [], true, []),
    );
    expect(await as("property", owner).getJobPropertyAddresses([job.id])).toEqual([
      { jobId: job.id, propertyId: p.id, address: p.address },
    ]);
    expect(await as("property", visitor).getJobPropertyAddresses([job.id])).toEqual([]);
    expect(await as("property", owner).getJobPropertyAddresses(["no-such-job"])).toEqual([]);
  });

  it("TOK.6 getRoomMetrics counts rooms and fixtures", async () => {
    const before = await as("property", visitor).getRoomMetrics();
    const owner = await proUser();
    const p = await home(owner);
    const room = ok<any>(
      await as("property", owner).createRoom({
        propertyId: p.id,
        name: "Kitchen",
        floorName: "Ground",
        floorType: "Tile",
        paintColor: "",
        paintBrand: "",
        paintCode: "",
        notes: "",
      }),
    );
    ok(
      await as("property", owner).addFixture(room.id, {
        brand: "Bosch",
        model: "SHX",
        serialNumber: "1",
        installedDate: "2020-01-01",
        warrantyExpiry: "",
        notes: "",
      }),
    );
    const after = await as("property", visitor).getRoomMetrics();
    expect(after.totalRooms - before.totalRooms).toBe(1n);
    expect(after.totalFixtures - before.totalFixtures).toBe(1n);
  });
});
