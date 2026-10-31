/**
 * The voice Worker's canister clients against real canisters.
 *
 * The Worker's own jest suite mocks every canister call, so nothing there
 * shows that a client's arguments, its reading of the reply, its identity or
 * the canister's permission for it match the canister that is deployed. Here
 * the clients themselves (agents/voice/*Canister.ts) talk to auth, payment,
 * photo, property, job and monitoring through PocketIC's HTTP gateway, signed
 * with a Worker key registered the way deploy.sh registers it.
 *
 * Setup calls go through each canister's real Candid, read from its Wasm.
 *
 * Run: cd tests/upgrade && npx vitest run worker-clients.canister.test.ts
 * (needs .dfx/local/canisters/<name>/<name>.wasm and agents/voice/node_modules)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PocketIc, createIdentity } from "@dfinity/pic";
import { IDL } from "@icp-sdk/core/candid";
import type { Identity } from "@icp-sdk/core/agent";
import { generateKeyPairSync } from "crypto";
import { createPic, wasmPath, CONTROLLER } from "./__helpers__/setup";
import { serviceFromWasm } from "./__helpers__/candid";
import * as payment from "../../agents/voice/paymentCanister";
import { resolveAgentSessionOwner } from "../../agents/voice/authCanister";
import { fetchPhotoAccess } from "../../agents/voice/photoCanister";
import { recordFrontendError, getCriticalCycleAlerts } from "../../agents/voice/monitoringCanister";
import { markIdentityCleared } from "../../agents/voice/src/propertyCanister";
import { getInvitePreview } from "../../agents/voice/src/jobCanister";

type R<T> = { ok: T } | { err: Record<string, unknown> };
function ok<T>(r: R<T>): T {
  if ("err" in r) throw new Error(`Expected ok, got err: ${JSON.stringify(r.err, (_k, v) => typeof v === "bigint" ? v.toString() : v)}`);
  return r.ok;
}

const CANISTERS = ["auth", "payment", "photo", "property", "job", "monitoring"] as const;
type Name = typeof CANISTERS[number];

const DAY_S = 24 * 60 * 60;

describe("voice Worker canister clients on real canisters", () => {
  let pic: PocketIc;
  const ids = {} as Record<Name, any>;
  const svcs = {} as Record<Name, IDL.ServiceClass>;
  let propertyId = "";

  const admin  = createIdentity("wc-admin");
  const owner  = createIdentity("wc-owner");
  const other  = createIdentity("wc-other");
  // The Worker's DFX_IDENTITY_PEM: an Ed25519 key, as wrangler stores it.
  const pem = generateKeyPairSync("ed25519").privateKey.export({ format: "pem", type: "pkcs8" }).toString();
  const worker = payment.identityFromPem(pem).getPrincipal();

  const as = (name: Name, who: Identity) => {
    const a = pic.createActor<any>((() => svcs[name]) as any, ids[name]);
    a.setIdentity(who);
    return a;
  };

  beforeAll(async () => {
    pic = await createPic();
    for (const name of CANISTERS) {
      const { idlFactory, initArgs } = serviceFromWasm(wasmPath(name));
      svcs[name] = idlFactory({ IDL });
      const arg = new Uint8Array(IDL.encode(initArgs, initArgs.map(() => admin.getPrincipal())));
      ids[name] = (await pic.setupCanister({ idlFactory: (() => svcs[name]) as any, wasm: wasmPath(name), arg })).canisterId;
      const methods = new Map(svcs[name]._fields);
      if (methods.has("setBootstrapNonce")) await as(name, CONTROLLER).setBootstrapNonce("n");
      if (methods.has("initAdmins")) ok(await as(name, admin).initAdmins([admin.getPrincipal()], "n"));
      else {
        const two = methods.get("addAdmin")!.argTypes.length === 2;
        ok(await as(name, admin).addAdmin(...(two ? [admin.getPrincipal(), "n"] : [admin.getPrincipal()])));
      }
    }
    // What deploy.sh grants the Worker's identity, and the wiring it needs.
    ok(await as("photo", admin).addPhotoRelay(worker));
    ok(await as("property", admin).addIdentityRelay(worker));
    ok(await as("monitoring", admin).addReporter(worker));
    ok(await as("photo", admin).setPropertyCanisterId(ids.property));
    ok(await as("job", admin).setPropertyCanisterId(ids.property.toText()));
    // payment.addStripeRelay waits for the first test, which checks the
    // Worker is refused without it.

    ok(await as("auth", owner).register({ role: { Homeowner: null }, email: "owner@example.com", phone: "555-0100" }));
    propertyId = ok<any>(await as("property", owner).registerProperty({
      address: "12 Elm Street", city: "Orlando", state: "FL", zipCode: "32801",
      propertyType: { SingleFamily: null }, yearBuilt: 1998n, squareFeet: 1850n, tier: { Free: null },
    })).id;

    const port = await pic.makeLive();
    Object.assign(process.env, {
      IC_HOST: `http://localhost:${port}`,
      DFX_NETWORK: "local",
      DFX_IDENTITY_PEM: pem,
      CANISTER_ID_AUTH: ids.auth.toText(),
      CANISTER_ID_PAYMENT: ids.payment.toText(),
      CANISTER_ID_PHOTO: ids.photo.toText(),
      CANISTER_ID_PROPERTY: ids.property.toText(),
      CANISTER_ID_JOB: ids.job.toText(),
      CANISTER_ID_MONITORING: ids.monitoring.toText(),
    });
  }, 180_000);

  afterAll(async () => {
    for (const k of ["IC_HOST", "DFX_NETWORK", "DFX_IDENTITY_PEM"]) delete process.env[k];
    await pic?.stopLive().catch(() => {});
    await pic?.tearDown();
  });

  describe("payment (Stripe webhook and tier reads)", () => {
    it("refuses the Worker until it is registered as a Stripe relay", async () => {
      const periodEnd = Math.floor(Date.now() / 1000) + 30 * DAY_S;
      await expect(payment.activateSubscriptionUntil(owner.getPrincipal().toText(), "Pro", periodEnd, "sub_early"))
        .rejects.toThrow("Canister activation failed");
      expect(await payment.fetchSubscriptionTier(owner.getPrincipal().toText())).toBe("Free");
      ok(await as("payment", admin).addStripeRelay(worker));
    });

    it("activates a plan, and a replayed webhook changes nothing", async () => {
      const who = owner.getPrincipal().toText();
      const now = Math.floor(Number(await pic.getTime()) / 1000);
      await payment.activateSubscriptionUntil(who, "Pro", now + 30 * DAY_S, "sub_1:in_1");
      expect(await payment.fetchSubscriptionTier(who)).toBe("Pro");
      const sub = (await as("payment", owner).getMySubscription()) as any;
      const expires = ("ok" in sub ? sub.ok : sub).expiresAt;
      await payment.activateSubscriptionUntil(who, "Pro", now + 60 * DAY_S, "sub_1:in_1");
      const again = (await as("payment", owner).getMySubscription()) as any;
      expect(("ok" in again ? again.ok : again).expiresAt).toBe(expires);
    });

    it("grants a credit pack once per Stripe reference", async () => {
      const who = other.getPrincipal().toText();
      await payment.grantAgentCreditsOnce(who, 25, "cs_pack_1");
      await expect(payment.grantAgentCreditsOnce(who, 25, "cs_pack_1")).rejects.toBeInstanceOf(payment.AlreadyConsumedError);
      await payment.consumeAgentCredit(who);
    });

    it("records a gift once, and the recipient can redeem it", async () => {
      const meta = { recipientEmail: "kim@example.com", recipientName: "Kim", senderName: "Lee", giftMessage: "", deliveryDate: "" };
      await payment.recordGift("cs_test_gift1", "Pro", "Yearly", meta);
      await payment.recordGift("cs_test_gift1", "Pro", "Monthly", meta);   // replay: no throw, no overwrite
      const kim = createIdentity("wc-kim");
      ok(await as("payment", kim).redeemGift("cs_test_gift1"));
      expect(await payment.fetchSubscriptionTier(kim.getPrincipal().toText())).toBe("Pro");
    });

    it("can't use the relay to give anyone a tier Stripe can't sell", async () => {
      await expect(payment.activateSubscriptionUntil(other.getPrincipal().toText(), "RealtorPro", 9_999_999_999, "sub_x"))
        .rejects.toThrow("Invalid tier");
    });
  });

  describe("auth (x-agent-session tokens)", () => {
    it("resolves a session the canister issued, and nothing else", async () => {
      const { token } = ok<any>(await as("auth", owner).issueAgentSession());
      expect(await resolveAgentSessionOwner(token)).toBe(owner.getPrincipal().toText());
      expect(await resolveAgentSessionOwner("hgs_" + "0".repeat(64))).toBeNull();
    });
  });

  describe("photo (R2 upload and serve checks)", () => {
    it("reads a photo's access record, live from property", async () => {
      const meta = ok<any>(await as("photo", owner).uploadPhoto("JOB_1", propertyId, { Finishing: null }, "", "a".repeat(64), new Uint8Array([1, 2, 3, 4])));
      const mine = await fetchPhotoAccess(meta.id, owner.getPrincipal().toText());
      expect(mine).toEqual({ owner: owner.getPrincipal().toText(), hash: "a".repeat(64), size: 4, offChain: false, isPublic: false, canRead: true });
      expect((await fetchPhotoAccess(meta.id, other.getPrincipal().toText()))?.canRead).toBe(false);
      expect(await fetchPhotoAccess("PHOTO_missing", owner.getPrincipal().toText())).toBeNull();
    });
  });

  describe("property (Stripe Identity webhook)", () => {
    it("records a verified ID on the owner's claim, and only the owner's", async () => {
      await markIdentityCleared(propertyId, owner.getPrincipal().toText(), "vs_test_1", "Pat Owner");
      const p = ok<any>(await as("property", owner).getProperty(propertyId));
      expect(p.identityVerified).toEqual([true]);
      await expect(markIdentityCleared(propertyId, other.getPrincipal().toText(), "vs_test_2", "Mallory"))
        .rejects.toThrow("NotAuthorized");
    });
  });

  describe("job (contractor invite emails)", () => {
    it("reads an invite's preview from the canister", async () => {
      const job = ok<any>(await as("job", owner).createJob(
        propertyId, "Water heater", { Plumbing: null }, "Replaced the tank.", ["Ace Plumbing"],
        120_000n, BigInt(await pic.getTime()) * 1_000_000n, [], [], false, [],
      ));
      const token = ok<string>(await as("job", owner).createInviteToken(job.id, "typed address is ignored"));
      const preview = await getInvitePreview(token);
      expect(preview).toMatchObject({
        jobId: job.id, title: "Water heater", serviceType: "Plumbing", amount: 120_000n,
        contractorName: "Ace Plumbing", alreadySigned: false,
      });
      expect(preview!.propertyAddress).toContain("12 Elm Street");
      expect(await getInvitePreview("nope")).toBeNull();
    });
  });

  describe("monitoring (frontend errors, cycle alerts)", () => {
    it("stores the Worker's error summaries and answers its alert reads", async () => {
      const now = BigInt(Date.now()) * 1_000_000n;
      await recordFrontendError({
        fingerprint: "fp-1", message: "TypeError: x is undefined", errorType: "TypeError",
        count: 3, firstSeen: now, lastSeen: now, tierCounts: [["Free", 3]], release: "v1",
      });
      const stored = (await as("monitoring", admin).getFrontendErrors(0n, 10n)) as any[];
      expect(stored.map((e) => [e.fingerprint, e.count])).toEqual([["fp-1", 3n]]);
      expect(await getCriticalCycleAlerts()).toEqual([]);
    });
  });
});
