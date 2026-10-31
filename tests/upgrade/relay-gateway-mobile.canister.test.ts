/**
 * The notification relay's, the IoT gateway's and the mobile app's canister
 * clients against real canisters, through PocketIC's HTTP gateway with each
 * one's own agent code:
 *
 *   agents/notifications/icp.ts  (signed with RELAY_IDENTITY_SEED, granted
 *                                 addNotifier as deploy.sh grants it)
 *   agents/iot-gateway/icp.ts    (signed with GATEWAY_IDENTITY_SEED, granted
 *                                 sensor.addGateway)
 *   mobile/src/services/*.ts     (called with a signed-in user's agent)
 *
 * Every call decodes against the canister's real Candid, and the answers are
 * the canisters' own; refusals where a grant is missing are checked too.
 *
 * Run: cd tests/upgrade && npx vitest run relay-gateway-mobile.canister.test.ts
 * (needs .dfx/local/canisters/<name>/<name>.wasm, and node_modules in
 * agents/notifications, agents/iot-gateway and the repo root)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PocketIc, createIdentity } from "@dfinity/pic";
import { IDL } from "@icp-sdk/core/candid";
import type { Identity } from "@icp-sdk/core/agent";
import { Principal } from "@icp-sdk/core/principal";
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity";
import { randomBytes } from "crypto";
import { resolve } from "path";
import { createPic, wasmPath, CONTROLLER } from "./__helpers__/setup";
import { serviceFromWasm } from "./__helpers__/candid";
import * as relay from "../../agents/notifications/icp";
import * as gateway from "../../agents/iot-gateway/icp";

type R<T> = { ok: T } | { err: Record<string, unknown> };
function ok<T>(r: R<T>): T {
  if ("err" in r) throw new Error(`Expected ok, got err: ${JSON.stringify(r.err, (_k, v) => typeof v === "bigint" ? v.toString() : v)}`);
  return r.ok;
}

const CANISTERS = ["auth", "property", "payment", "job", "quote", "contractor", "report", "sensor"] as const;
type Name = typeof CANISTERS[number];
// The mobile app's @icp-sdk/core (version 6, as the app ships), from the frontend's install.
const CORE6 = resolve(__dirname, "../../frontend/node_modules/@icp-sdk/core/lib/esm");

describe("relay, gateway and mobile clients on real canisters", () => {
  let pic: PocketIc;
  let host = "";
  const ids = {} as Record<Name, any>;
  const svcs = {} as Record<Name, IDL.ServiceClass>;
  let propertyId = "";

  const admin = createIdentity("rgm-admin");
  const relaySeed = randomBytes(32).toString("hex");
  const gatewaySeed = randomBytes(32).toString("hex");
  const relayPrincipal = Ed25519KeyIdentity.generate(Buffer.from(relaySeed, "hex")).getPrincipal();
  const gatewayPrincipal = Ed25519KeyIdentity.generate(Buffer.from(gatewaySeed, "hex")).getPrincipal();
  // Mobile users: an Ed25519 key each, as the app signs with after Internet Identity.
  const homeownerKey = Ed25519KeyIdentity.generate(randomBytes(32));
  const contractorKey = Ed25519KeyIdentity.generate(randomBytes(32));
  const homeowner = homeownerKey.getPrincipal();
  const contractor = contractorKey.getPrincipal();

  const as = (name: Name, who: Identity | Principal) => {
    const a = pic.createActor<any>((() => svcs[name]) as any, ids[name]);
    if (who instanceof Principal) a.setPrincipal(who); else a.setIdentity(who);
    return a;
  };
  /** A mobile session: the app's agent library, signed as `key`. */
  async function mobileAgent(key: Ed25519KeyIdentity) {
    const core = await import(`${CORE6}/agent/index.js`);
    const ident = await import(`${CORE6}/identity/index.js`);
    const identity = ident.Ed25519KeyIdentity.fromSecretKey(key.getKeyPair().secretKey);
    return core.HttpAgent.create({ host, identity, shouldFetchRootKey: true });
  }

  beforeAll(async () => {
    pic = await createPic();
    // Live mode (below) runs on the wall clock; the mobile app dates records by it.
    await pic.setTime(Date.now());
    await pic.tick();
    for (const name of CANISTERS) {
      const { idlFactory, initArgs } = serviceFromWasm(wasmPath(name));
      svcs[name] = idlFactory({ IDL });
      const arg = new Uint8Array(IDL.encode(initArgs, initArgs.map(() => admin.getPrincipal())));
      ids[name] = (await pic.setupCanister({ idlFactory: (() => svcs[name]) as any, wasm: wasmPath(name), arg })).canisterId;
      const methods = new Map(svcs[name]._fields);
      if (methods.has("setBootstrapNonce")) await as(name, CONTROLLER).setBootstrapNonce("n");
      if (methods.has("initAdmins")) ok(await as(name, admin).initAdmins([admin.getPrincipal()], "n"));
      else ok(await as(name, admin).addAdmin(...(methods.get("addAdmin")!.argTypes.length === 2 ? [admin.getPrincipal(), "n"] : [admin.getPrincipal()])));
    }
    // deploy.sh's wiring.
    ok(await as("property", admin).setPaymentCanisterId(ids.payment));
    ok(await as("job", admin).setPropertyCanisterId(ids.property.toText()));
    ok(await as("job", admin).setContractorCanisterId(ids.contractor.toText()));
    ok(await as("quote", admin).setPaymentCanisterId(ids.payment));
    ok(await as("quote", admin).setPropertyCanisterId(ids.property));
    ok(await as("quote", admin).setContractorCanisterId(ids.contractor));
    ok(await as("property", admin).addTrustedCanister(ids.quote));
    ok(await as("sensor", admin).setPropertyCanisterId(ids.property.toText()));
    ok(await as("sensor", admin).addGateway(gatewayPrincipal));
    // The relay is granted on auth, property and job up front; quote waits
    // for the first test, which checks the relay is refused without it.
    for (const c of ["auth", "property", "job"] as const) ok(await as(c, admin).addNotifier(relayPrincipal));

    ok(await as("auth", homeowner).register({ role: { Homeowner: null }, email: "home@example.com", phone: "555-0100" }));
    ok(await as("auth", contractor).register({ role: { Contractor: null }, email: "pro@example.com", phone: "555-0101" }));
    ok(await as("contractor", contractor).register({ name: "Rapid Plumbing", specialties: [{ Plumbing: null }], email: "pro@example.com", phone: "+14075550101" }));
    ok(await as("payment", admin).adminActivateStripeSubscription(homeowner, { Pro: null }, 12n));
    propertyId = ok<any>(await as("property", homeowner).registerProperty({
      address: "40 Heron Way", city: "Orlando", state: "FL", zipCode: "32801",
      propertyType: { SingleFamily: null }, yearBuilt: 1995n, squareFeet: 2200n, tier: { Pro: null },
    })).id;

    host = `http://localhost:${await pic.makeLive()}`;
    Object.assign(process.env, {
      IC_HOST: host, ICP_HOST: host, NODE_ENV: "test",
      RELAY_IDENTITY_SEED: relaySeed, GATEWAY_IDENTITY_SEED: gatewaySeed,
      SENSOR_CANISTER_ID: ids.sensor.toText(),
      CANISTER_ID_AUTH: ids.auth.toText(), CANISTER_ID_PROPERTY: ids.property.toText(),
      CANISTER_ID_PAYMENT: ids.payment.toText(), CANISTER_ID_JOB: ids.job.toText(),
      CANISTER_ID_QUOTE: ids.quote.toText(), CANISTER_ID_CONTRACTOR: ids.contractor.toText(),
      CANISTER_ID_REPORT: ids.report.toText(),
      EXPO_PUBLIC_AUTH_CANISTER_ID: ids.auth.toText(), EXPO_PUBLIC_PROPERTY_CANISTER_ID: ids.property.toText(),
      EXPO_PUBLIC_JOB_CANISTER_ID: ids.job.toText(), EXPO_PUBLIC_QUOTE_CANISTER_ID: ids.quote.toText(),
      EXPO_PUBLIC_CONTRACTOR_CANISTER_ID: ids.contractor.toText(), EXPO_PUBLIC_SENSOR_CANISTER_ID: ids.sensor.toText(),
      EXPO_PUBLIC_PAYMENT_CANISTER_ID: ids.payment.toText(),
    });
  }, 180_000);

  afterAll(async () => {
    await pic?.stopLive().catch(() => {});
    await pic?.tearDown();
  });

  describe("notification relay", () => {
    let requestId = "";

    it("reads a new lead from quote's outbox once it is a notifier there, with the homeowner shown", async () => {
      requestId = ok<any>(await as("quote", homeowner).createQuoteRequest(propertyId, { Plumbing: null }, "Slab leak", { High: null }, ["32801"], [], [], [], [])).id;
      await expect(relay.readOutbox(ids.quote.toText(), 0)).rejects.toThrow(/NotAuthorized/);
      ok(await as("quote", admin).addNotifier(relayPrincipal));
      const page = await relay.readOutbox(ids.quote.toText(), 0);
      expect(page.events.map((e) => [e.kind, e.refId])).toContainEqual(["new_lead", requestId]);

      const req = await relay.getQuoteRequest(requestId);
      expect(req).toMatchObject({ id: requestId, serviceType: "Plumbing", status: "Open", zipCode: "32801" });
      // contractorWantsLead skips the homeowner's own request by this field.
      expect(req!.homeowner).toBe(homeowner.toText());
    });

    it("finds the contractors to alert, their plan and their email", async () => {
      const targets = await relay.getContractors();
      expect(targets.map((c) => [c.principal, c.specialties])).toContainEqual([contractor.toText(), ["Plumbing"]]);
      expect(await relay.isContractorPro(contractor.toText())).toBe(false);
      ok(await as("payment", admin).adminActivateStripeSubscription(contractor, { ContractorPro: null }, 1n));
      expect(await relay.isContractorPro(contractor.toText())).toBe(true);
      expect(await relay.getNotificationEmail(contractor.toText())).toBe("pro@example.com");
      expect(await relay.getNotificationEmail(homeowner.toText())).toBe("home@example.com");
    });

    it("reads the weekly Pulse inputs it is granted", async () => {
      const recipients = await relay.getPulseRecipients(null, 50);
      expect(recipients).toContainEqual({ principal: homeowner.toText(), email: "home@example.com" });
      expect((await relay.getPulseProperties(homeowner.toText())).map((p) => [p.id, p.address, p.yearBuilt])).toEqual([[propertyId, "40 Heron Way", 1995]]);
      const job = ok<any>(await as("job", homeowner).createJob(propertyId, "Gutters", { Gutters: null }, "Cleaned gutters.", [], 0n, BigInt(Date.now() - 86_400_000) * 1_000_000n, [], [], true, []));
      expect((await relay.getJobsByOwner(homeowner.toText())).map((j) => [j.id, j.serviceType, j.isDiy])).toEqual([[job.id, "Gutters", true]]);
      expect((await relay.getJobSnapshots(propertyId)).length).toBe(1);
      expect(await relay.findPublicReport("40 Heron Way")).toBeNull();
    });

    it("resolves only sessions the auth canister issued", async () => {
      const { token } = ok<any>(await as("auth", homeowner).issueAgentSession());
      expect(await relay.resolveAgentSession(token)).toBe(homeowner.toText());
      expect(await relay.resolveAgentSession("hgs_" + "0".repeat(64))).toBeNull();
    });
  });

  describe("IoT gateway", () => {
    it("binds a vendor device, records its readings, and keeps other vendors' events off it", async () => {
      const reg = await gateway.registerVerifiedDevice(homeowner.toText(), propertyId, "therm-77", "Ecobee", "acct-1", "Hall thermostat");
      expect(reg).toMatchObject({ success: true, device: { propertyId, externalDeviceId: "therm-77", source: "Ecobee", isActive: true } });
      const reading = { externalDeviceId: "therm-77", eventType: { HighTemperature: null } as any, value: 96, unit: "F", rawPayload: "{}" };
      const recorded = await gateway.recordSensorEvent(reading as any, "Ecobee", "acct-1");
      expect(recorded.success).toBe(true);
      // Another platform, or another account on the same one, can't post to it.
      expect((await gateway.recordSensorEvent(reading as any, "HoneywellHome", "acct-1")).success).toBe(false);
      expect((await gateway.recordSensorEvent(reading as any, "Ecobee", "acct-2")).success).toBe(false);
      // A stranger's property: the canister re-checks the owner's access.
      expect((await gateway.registerVerifiedDevice(contractor.toText(), propertyId, "therm-88", "Ecobee", "acct-9", "x")).success).toBe(false);
    });

    it("resolves sessions with the gateway's own client", async () => {
      const { token } = ok<any>(await as("auth", homeowner).issueAgentSession());
      expect(await gateway.resolveAgentSession(token)).toBe(homeowner.toText());
    });
  });

  describe("mobile app", () => {
    it("loads the signed-in homeowner's profile, homes and a new session", async () => {
      const agent = await mobileAgent(homeownerKey);
      const auth = await import("../../mobile/src/services/authService");
      const property = await import("../../mobile/src/services/propertyService");
      expect((await auth.getProfile(agent))?.email).toBe("home@example.com");
      expect((await auth.issueAgentSession(agent))?.token).toMatch(/^hgs_/);
      expect((await property.getProperties(agent)).map((p: any) => [p.id, p.street, p.zipCode])).toEqual([[propertyId, "40 Heron Way", "32801"]]);
      expect(await property.getRooms(propertyId, agent)).toEqual([]);
    });

    it("runs a quote from request to accepted bid, then logs and signs the job", async () => {
      const home = await mobileAgent(homeownerKey);
      const pro = await mobileAgent(contractorKey);
      const quotes = await import("../../mobile/src/services/quoteService");
      const bids = await import("../../mobile/src/services/bidService");
      const contractors = await import("../../mobile/src/services/contractorService");
      const jobs = await import("../../mobile/src/services/jobService");

      const req = await quotes.createQuoteRequest({ propertyId, serviceType: "Plumbing", description: "Water heater", urgency: "medium" } as any, home);
      expect((await contractors.getLeads(pro)).map((l: any) => l.id)).toContain(req.id);
      await bids.submitBid({ requestId: req.id, amountCents: 1_450_00, timelineDays: 3, notes: null }, pro);
      expect(await bids.getMyBidRequestIds(pro)).toContain(req.id);
      const [bid] = await quotes.getBids(req.id, home);
      expect(bid).toMatchObject({ contractorId: contractor.toText(), contractorName: "Rapid Plumbing", amountCents: 1_450_00 });
      await quotes.acceptBid(bid.id, home);

      const today = new Date().toISOString().slice(0, 10);
      const job = await jobs.createJob({
        propertyId, serviceType: "Plumbing", description: "New water heater", amountCents: 1_450_00,
        completedDate: today, isDiy: false, contractorName: "Rapid Plumbing", permitNumber: null,
      }, home);
      expect((await jobs.getJobs(propertyId, home)).map((j: any) => j.id)).toContain(job.id);
      const signed = await jobs.verifyJob(job.id, home);
      expect(signed.homeownerSigned).toBe(true);
      expect((await contractors.getMyContractorProfile(pro))?.name).toBe("Rapid Plumbing");
    });

    it("shows the home's sensors", async () => {
      const agent = await mobileAgent(homeownerKey);
      const upkeep = await import("../../mobile/src/services/upkeepService");
      const sensors = await upkeep.getSensorSummaries(propertyId, agent);
      expect(sensors.map((s: any) => s.label)).toEqual(["HALL THERMOSTAT"]);
    });
  });
});
