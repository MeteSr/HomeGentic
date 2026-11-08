/**
 * Successor / legacy contact for the home record (#724) on real property and
 * payment canisters.
 *
 * Rules (decided by the owner 2026-11-08): the owner names a successor and
 * gets a successor link; the successor opens a claim with a proof document
 * (death certificate, letters of administration or testamentary, or trust
 * papers); a HomeGentic admin reviews it; the record moves only once the
 * claim is approved AND 30 days have passed since it was opened, and the
 * owner (or a co-owner) can cancel at any time before that.
 *
 *  SC.1 the owner names a successor; only the owner reads or changes it;
 *       naming again replaces the link
 *  SC.2 the link shows the home (redacted) to whoever holds it
 *  SC.3 opening a claim: link, proof file type and size, one open claim,
 *       not the owner; the owner and co-owners are told (outbox)
 *  SC.4 an admin reads the proof and reviews; nobody else can; the relay
 *       reads what a waiting-period reminder needs
 *  SC.5 an approved claim can't finish before the 30 days are up; it moves
 *       the record like a transfer once they are, and the proof is deleted
 *  SC.6 the owner (or a co-owner) cancels during the wait; the claimant is told
 *  SC.7 a rejected claim can be opened again with new proof
 *  SC.8 the successor and claims survive an upgrade
 *  SC.9 deleteMyData drops the owner's successor and the claimant's open claims
 *
 * Run: cd tests/upgrade && npx vitest run property-successor.canister.test.ts
 * (needs .dfx/local/canisters/{property,payment}/*.wasm)
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
const statusOf = (c: any) => Object.keys(c.status)[0];

const CANISTERS = ["property", "payment"] as const;
type Name = (typeof CANISTERS)[number];

const DAY_MS = 24 * 60 * 60 * 1000;
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x25, 0x25, 0x45, 0x4f, 0x46]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

const successor = (over: Record<string, unknown> = {}) => ({
  name: "Jordan Rivera",
  email: "jordan@example.com",
  relationship: "Daughter",
  ...over,
});
const claimInput = (over: Record<string, unknown> = {}) => ({
  claimantName: "Jordan Rivera",
  proofKind: { DeathCertificate: null },
  fileName: "certificate.pdf",
  mimeType: "application/pdf",
  note: "My father passed away in October.",
  ...over,
});

describe("successor for the home record", () => {
  let pic: PocketIc;
  const ids = {} as Record<Name, any>;
  const svcs = {} as Record<Name, IDL.ServiceClass>;
  let home = "";
  let link = "";
  let claimId = "";

  const admin = createIdentity("sc-admin");
  const owner = createIdentity("sc-owner");
  const coOwner = createIdentity("sc-coowner");
  const heir = createIdentity("sc-heir");
  const stranger = createIdentity("sc-stranger");
  const relay = createIdentity("sc-relay");

  const as = (name: Name, who: Identity) => {
    const a = pic.createActor<any>((() => svcs[name]) as any, ids[name]);
    a.setIdentity(who);
    return a;
  };
  const prop = (who: Identity) => as("property", who);
  const advance = async (ms: number) => {
    await pic.advanceTime(ms);
    await pic.tick();
  };
  const nextMinute = () => advance(61_000);
  const register = async (who: Identity, address: string) =>
    ok<any>(
      await prop(who).registerProperty({
        address,
        city: "Orlando",
        state: "FL",
        zipCode: "32801",
        propertyType: { SingleFamily: null },
        yearBuilt: 1998n,
        squareFeet: 1800n,
        tier: { Pro: null },
      }),
    ).id as string;
  const events = async () => ok<any>(await prop(admin).getNotificationEvents(0n, 200n)).events as any[];

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
    ok(await prop(admin).setPaymentCanisterId(ids.payment));
    for (const who of [owner, heir]) {
      ok(await as("payment", admin).adminActivateStripeSubscription(who.getPrincipal(), { Pro: null }, 12n));
    }
    home = await register(owner, "70 Heritage Way");
    const invite = ok<any>(await prop(owner).inviteManager(home, { CoOwner: null }, "Co-owner", []));
    ok(await prop(coOwner).claimManagerRole(invite.token));
    await nextMinute();
  }, 180_000);

  afterAll(async () => {
    await pic?.tearDown();
  });

  it("SC.1 lets the owner name a successor and get a link", async () => {
    expect(ok<any[]>(await prop(owner).getSuccessor(home))).toEqual([]);

    const first = ok<any>(await prop(owner).setSuccessor(home, successor({ name: "  Jordan Rivera  " })));
    expect(first.name).toBe("Jordan Rivera");
    expect(first.email).toBe("jordan@example.com");
    expect(first.relationship).toBe("Daughter");
    expect(first.token).toMatch(/^[0-9a-f]{64}$/);

    // Naming again replaces the link; the old one stops working.
    const second = ok<any>(await prop(owner).setSuccessor(home, successor({ email: "Jordan.R@Example.com" })));
    expect(second.token).not.toBe(first.token);
    expect(second.email).toBe("jordan.r@example.com");
    expect(await prop(heir).getSuccessionInvite(first.token)).toEqual([]);
    link = second.token;
    expect(ok<any[]>(await prop(owner).getSuccessor(home))[0].token).toBe(link);

    // Only the owner names, reads or removes the successor.
    for (const who of [coOwner, stranger, heir]) {
      expect(errKey(await prop(who).setSuccessor(home, successor()))).toBe("NotAuthorized");
      expect(errKey(await prop(who).getSuccessor(home))).toBe("NotAuthorized");
      expect(errKey(await prop(who).removeSuccessor(home))).toBe("NotAuthorized");
    }
    expect(errKey(await prop(owner).setSuccessor("no-such-home", successor()))).toBe("NotFound");

    for (const bad of [
      successor({ name: " " }),
      successor({ name: "x".repeat(101) }),
      successor({ email: "not-an-email" }),
      successor({ email: "a b@example.com" }),
      successor({ email: `${"x".repeat(250)}@e.com` }),
      successor({ relationship: "x".repeat(61) }),
    ]) {
      expect(errKey(await prop(owner).setSuccessor(home, bad))).toBe("InvalidInput");
    }
    await nextMinute();
  });

  it("SC.2 shows the home to whoever holds the link, without evidence", async () => {
    const invite = (await prop(heir).getSuccessionInvite(link))[0];
    expect(invite.successorName).toBe("Jordan Rivera");
    expect(invite.property.id).toBe(home);
    expect(invite.property.address).toBe("70 Heritage Way");
    expect(invite.property.verificationDocHash).toEqual([]);
    expect(invite.waitDays).toBe(30n);
    expect(await prop(heir).getSuccessionInvite("0".repeat(64))).toEqual([]);
  });

  it("SC.3 opens a claim with proof and tells the owner and co-owners", async () => {
    // Not the owner, a real link, an accepted file.
    expect(errKey(await prop(owner).openSuccessionClaim(link, claimInput(), PDF))).toBe("InvalidInput");
    expect(errKey(await prop(heir).openSuccessionClaim("f".repeat(64), claimInput(), PDF))).toBe("NotFound");
    for (const [input, bytes] of [
      [claimInput(), new Uint8Array()],
      [claimInput({ mimeType: "text/plain" }), PDF],
      [claimInput({ mimeType: "image/png" }), PDF], // bytes aren't a PNG
      [claimInput(), PNG], // bytes aren't a PDF
      [claimInput(), new Uint8Array(1_800_001).fill(0x25)],
      [claimInput({ claimantName: " " }), PDF],
      [claimInput({ note: "x".repeat(1001) }), PDF],
      [claimInput({ fileName: "" }), PDF],
    ] as const) {
      expect(errKey(await prop(heir).openSuccessionClaim(link, input, bytes))).toBe("InvalidInput");
    }

    const claim = ok<any>(await prop(heir).openSuccessionClaim(link, claimInput(), PDF));
    claimId = claim.id;
    expect(claim.propertyId).toBe(home);
    expect(claim.claimant.toText()).toBe(heir.getPrincipal().toText());
    expect(statusOf(claim)).toBe("AwaitingReview");
    expect(claim.waitEndsAt - claim.openedAt).toBe(BigInt(30 * DAY_MS) * 1_000_000n);
    expect(claim.proofSize).toBe(BigInt(PDF.length));

    // One open claim per home.
    await nextMinute();
    expect(errKey(await prop(stranger).openSuccessionClaim(link, claimInput(), PDF))).toBe("InvalidInput");

    // The household sees it; the claimant sees their own.
    for (const who of [owner, coOwner]) {
      const open = ok<any[]>(await prop(who).getOpenSuccessionClaim(home))[0];
      expect(open.id).toBe(claimId);
    }
    expect(errKey(await prop(stranger).getOpenSuccessionClaim(home))).toBe("NotAuthorized");
    expect((await prop(heir).getMySuccessionClaims()).map((c: any) => c.id)).toEqual([claimId]);
    expect(await prop(stranger).getMySuccessionClaims()).toEqual([]);

    // While a claim is open the successor can't be changed or removed.
    expect(errKey(await prop(owner).setSuccessor(home, successor()))).toBe("InvalidInput");
    expect(errKey(await prop(owner).removeSuccessor(home))).toBe("InvalidInput");

    const opened = (await events()).filter((e) => e.kind === "succession_claim_opened" && e.refId === claimId);
    expect(opened.map((e) => e.recipient[0].toText()).sort()).toEqual(
      [owner.getPrincipal().toText(), coOwner.getPrincipal().toText()].sort(),
    );
    expect(opened[0].summary).toBe("70 Heritage Way");
    expect(errKey(await prop(stranger).getNotificationEvents(0n, 10n))).toBe("NotAuthorized");
    await nextMinute();
  });

  it("SC.4 lets only an admin read the proof and review the claim", async () => {
    const queue = ok<any[]>(await prop(admin).listSuccessionClaimsForReview());
    expect(queue.map((q) => q.claim.id)).toEqual([claimId]);
    expect(queue[0].successor[0].email).toBe("jordan.r@example.com");
    expect(queue[0].property.address).toBe("70 Heritage Way");

    const proof = ok<any>(await prop(admin).getSuccessionProof(claimId));
    expect(new Uint8Array(proof.data)).toEqual(PDF);
    expect(proof.mimeType).toBe("application/pdf");

    for (const who of [owner, heir, stranger]) {
      expect(errKey(await prop(who).listSuccessionClaimsForReview())).toBe("NotAuthorized");
      expect(errKey(await prop(who).getSuccessionProof(claimId))).toBe("NotAuthorized");
      expect(errKey(await prop(who).reviewSuccessionClaim(claimId, true, ""))).toBe("NotAuthorized");
    }
    // A rejection needs a reason the claimant can read.
    expect(errKey(await prop(admin).reviewSuccessionClaim(claimId, false, " "))).toBe("InvalidInput");
    expect(errKey(await prop(admin).reviewSuccessionClaim("no-such-claim", true, ""))).toBe("NotFound");

    const approved = ok<any>(await prop(admin).reviewSuccessionClaim(claimId, true, ""));
    expect(statusOf(approved)).toBe("Approved");
    expect(ok<any[]>(await prop(admin).listSuccessionClaimsForReview())).toEqual([]);
    // Reviewed once.
    expect(errKey(await prop(admin).reviewSuccessionClaim(claimId, true, ""))).toBe("InvalidInput");

    // The notification relay reads what a reminder needs; nobody else can.
    ok(await prop(admin).addNotifier(relay.getPrincipal()));
    const notice = ok<any[]>(await prop(relay).getSuccessionNotice(claimId))[0];
    expect(notice.claim.id).toBe(claimId);
    expect(statusOf(notice.claim)).toBe("Approved");
    expect(notice.address).toBe("70 Heritage Way");
    expect(notice.household.map((p: any) => p.toText()).sort()).toEqual(
      [owner.getPrincipal().toText(), coOwner.getPrincipal().toText()].sort(),
    );
    expect(ok<any[]>(await prop(relay).getSuccessionNotice("no-such-claim"))).toEqual([]);
    expect(ok<any>(await prop(relay).getNotificationEvents(0n, 200n)).events.length).toBeGreaterThan(0);
    for (const who of [owner, heir, stranger]) {
      expect(errKey(await prop(who).getSuccessionNotice(claimId))).toBe("NotAuthorized");
    }

    const told = (await events()).filter((e) => e.kind === "succession_claim_approved" && e.refId === claimId);
    expect(told.map((e) => e.recipient[0].toText()).sort()).toEqual(
      [owner.getPrincipal().toText(), coOwner.getPrincipal().toText(), heir.getPrincipal().toText()].sort(),
    );
    await nextMinute();
  });

  it("SC.5 moves the record only after the 30-day wait", async () => {
    expect(errKey(await prop(heir).completeSuccessionClaim(claimId))).toBe("InvalidInput");
    expect(errKey(await prop(stranger).completeSuccessionClaim(claimId))).toBe("NotAuthorized");
    expect(errKey(await prop(owner).completeSuccessionClaim(claimId))).toBe("NotAuthorized");

    await advance(29 * DAY_MS);
    expect(errKey(await prop(heir).completeSuccessionClaim(claimId))).toBe("InvalidInput");
    await advance(1 * DAY_MS);

    const moved = ok<any>(await prop(heir).completeSuccessionClaim(claimId));
    expect(moved.owner.toText()).toBe(heir.getPrincipal().toText());
    expect(moved.verificationDocHash).toEqual([]);

    // The old household no longer has a role; the successor record and link are gone.
    expect(errKey(await prop(owner).getOpenSuccessionClaim(home))).toBe("NotAuthorized");
    expect(errKey(await prop(coOwner).getOpenSuccessionClaim(home))).toBe("NotAuthorized");
    expect(ok<any[]>(await prop(heir).getSuccessor(home))).toEqual([]);
    expect(await prop(heir).getSuccessionInvite(link)).toEqual([]);

    const mine = (await prop(heir).getMySuccessionClaims())[0];
    expect(statusOf(mine)).toBe("Completed");
    expect(errKey(await prop(admin).getSuccessionProof(claimId))).toBe("NotFound");

    // The ownership history records the move.
    const history = await prop(heir).getOwnershipHistory(home);
    expect(history.at(-1).to.toText()).toBe(heir.getPrincipal().toText());
    expect(history.at(-1).txHash).toBe(`succession:${claimId}`);
    expect(errKey(await prop(heir).completeSuccessionClaim(claimId))).toBe("InvalidInput");
    await nextMinute();
  });

  it("SC.6 lets the owner or a co-owner cancel during the wait", async () => {
    const other = await register(owner, "71 Heritage Way");
    const invite = ok<any>(await prop(owner).inviteManager(other, { CoOwner: null }, "Co-owner", []));
    ok(await prop(coOwner).claimManagerRole(invite.token));
    const s = ok<any>(await prop(owner).setSuccessor(other, successor()));
    await nextMinute();

    const c1 = ok<any>(await prop(heir).openSuccessionClaim(s.token, claimInput(), PDF));
    expect(errKey(await prop(stranger).cancelSuccessionClaim(c1.id))).toBe("NotAuthorized");
    const cancelled = ok<any>(await prop(owner).cancelSuccessionClaim(c1.id));
    expect(statusOf(cancelled)).toBe("Cancelled");
    expect(errKey(await prop(admin).getSuccessionProof(c1.id))).toBe("NotFound");
    expect(errKey(await prop(admin).reviewSuccessionClaim(c1.id, true, ""))).toBe("InvalidInput");
    expect(ok<any[]>(await prop(owner).getOpenSuccessionClaim(other))).toEqual([]);
    const told = (await events()).filter((e) => e.kind === "succession_claim_cancelled" && e.refId === c1.id);
    expect(told.map((e) => e.recipient[0].toText())).toEqual([heir.getPrincipal().toText()]);
    await nextMinute();

    // A co-owner can cancel too, even after approval.
    const c2 = ok<any>(await prop(heir).openSuccessionClaim(s.token, claimInput(), PDF));
    ok(await prop(admin).reviewSuccessionClaim(c2.id, true, ""));
    ok(await prop(coOwner).cancelSuccessionClaim(c2.id));
    await advance(31 * DAY_MS);
    expect(errKey(await prop(heir).completeSuccessionClaim(c2.id))).toBe("InvalidInput");
    expect(ok<any>(await prop(owner).getProperty(other)).owner.toText()).toBe(owner.getPrincipal().toText());

    // The claimant can withdraw their own claim.
    const c3 = ok<any>(await prop(heir).openSuccessionClaim(s.token, claimInput(), PDF));
    ok(await prop(heir).cancelSuccessionClaim(c3.id));
    await nextMinute();
  });

  it("SC.7 lets a rejected claimant try again with new proof", async () => {
    const third = await register(owner, "72 Heritage Way");
    const s = ok<any>(await prop(owner).setSuccessor(third, successor()));
    await nextMinute();
    const c = ok<any>(
      await prop(heir).openSuccessionClaim(
        s.token,
        claimInput({ proofKind: { TrustDocument: null }, mimeType: "image/png", fileName: "trust.png" }),
        PNG,
      ),
    );
    const rejected = ok<any>(
      await prop(admin).reviewSuccessionClaim(c.id, false, "The trust page naming the trustee is missing."),
    );
    expect(statusOf(rejected)).toBe("Rejected");
    expect(rejected.status.Rejected.reason).toBe("The trust page naming the trustee is missing.");
    expect(errKey(await prop(admin).getSuccessionProof(c.id))).toBe("NotFound");
    const told = (await events()).filter((e) => e.kind === "succession_claim_rejected" && e.refId === c.id);
    expect(told.map((e) => e.recipient[0].toText())).toEqual([heir.getPrincipal().toText()]);
    await nextMinute();

    const again = ok<any>(
      await prop(heir).openSuccessionClaim(s.token, claimInput({ proofKind: { LettersOfAdministration: null } }), PDF),
    );
    expect(statusOf(again)).toBe("AwaitingReview");
  });

  it("SC.8 keeps successors and claims across an upgrade", async () => {
    const mineBefore = await prop(heir).getMySuccessionClaims();
    const queueBefore = ok<any[]>(await prop(admin).listSuccessionClaimsForReview());
    await pic.upgradeCanister({ canisterId: ids.property, wasm: readFileSync(wasmPath("property")) });
    expect(await prop(heir).getMySuccessionClaims()).toEqual(mineBefore);
    expect(ok<any[]>(await prop(admin).listSuccessionClaimsForReview())).toEqual(queueBefore);
    const open = queueBefore[0].claim;
    expect(new Uint8Array(ok<any>(await prop(admin).getSuccessionProof(open.id)).data)).toEqual(PDF);
  });

  it("SC.9 drops successors and open claims with deleteMyData", async () => {
    const [{ claim }] = ok<any[]>(await prop(admin).listSuccessionClaimsForReview());
    await nextMinute();
    // The claimant leaves: their open claim is cancelled and the proof deleted.
    ok(await prop(heir).deleteMyData());
    expect(ok<any[]>(await prop(admin).listSuccessionClaimsForReview())).toEqual([]);
    expect(errKey(await prop(admin).getSuccessionProof(claim.id))).toBe("NotFound");
    expect(await prop(heir).getMySuccessionClaims()).toEqual([]);

    // The owner leaves: their homes' successor links stop working.
    const s = ok<any[]>(await prop(owner).getSuccessor(claim.propertyId))[0];
    await nextMinute();
    ok(await prop(owner).deleteMyData());
    expect(await prop(stranger).getSuccessionInvite(s.token)).toEqual([]);
  });
});
