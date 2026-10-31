/**
 * Signed score certificates on real report, property, job and market
 * canisters wired as deploy.sh wires them, with a real threshold Ed25519 key
 * (the instance has an II subnet, so test_key_1 exists).
 *
 * Checks that issueCert stores the on-chain figures and signs exactly them,
 * that the signature verifies with the browser's own checker
 * (services/attestation.ts, what /verify-record runs), that the key is
 * published and survives an upgrade, and what the signing costs.
 *
 * Run: cd tests/upgrade && npx vitest run report-cert.canister.test.ts
 * (needs .dfx/local/canisters/{report,property,job,market}/*.wasm)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PocketIc, createIdentity, SubnetStateType } from "@dfinity/pic";
import { IDL } from "@icp-sdk/core/candid";
import type { Identity } from "@icp-sdk/core/agent";
import { createPic, wasmPath, CONTROLLER } from "./__helpers__/setup";
import { serviceFromWasm } from "./__helpers__/candid";
import { verifySignature, toSignedCopy, checkSignedCopy } from "../../frontend/src/services/attestation";

type R<T> = { ok: T } | { err: Record<string, unknown> };
function ok<T>(r: R<T>): T {
  if ("err" in r) throw new Error(`Expected ok, got err: ${JSON.stringify(r.err, (_k, v) => typeof v === "bigint" ? v.toString() : v)}`);
  return r.ok;
}
const errKey = (r: R<unknown>) => ("err" in r ? Object.keys(r.err)[0] : "ok");

const CANISTERS = ["report", "property", "job", "market"] as const;
type Name = typeof CANISTERS[number];
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

describe("report: signed score certificates", () => {
  let pic: PocketIc;
  const ids = {} as Record<Name, any>;
  const svcs = {} as Record<Name, IDL.ServiceClass>;
  let propertyId = "";

  const admin    = createIdentity("rc-admin");
  const owner    = createIdentity("rc-owner");
  const stranger = createIdentity("rc-stranger");

  const as = (name: Name, who: Identity) => {
    const a = pic.createActor<any>((() => svcs[name]) as any, ids[name]);
    a.setIdentity(who);
    return a;
  };

  /** Install, bootstrap the admin, and wire a report canister as deploy.sh does. */
  async function installReport(name: "report", cycles?: bigint) {
    const { idlFactory, initArgs } = serviceFromWasm(wasmPath("report"));
    svcs[name] = idlFactory({ IDL });
    const arg = new Uint8Array(IDL.encode(initArgs, initArgs.map(() => admin.getPrincipal())));
    ids[name] = (await pic.setupCanister({ idlFactory: (() => svcs[name]) as any, wasm: wasmPath("report"), arg, cycles })).canisterId;
    await as(name, CONTROLLER).setBootstrapNonce("n");
    ok(await as(name, admin).addAdmin(admin.getPrincipal(), "n"));
    ok(await as(name, admin).setPropertyCanisterId(ids.property.toText()));
    ok(await as(name, admin).setRiskJobCanisterId(ids.job.toText()));
    ok(await as(name, admin).setMarketCanisterId(ids.market.toText()));
    ok(await as("property", admin).addTrustedCanister(ids[name]));
    ok(await as("job", admin).addTrustedCanister(ids[name]));
  }

  beforeAll(async () => {
    pic = await createPic({
      ii: { state: { type: SubnetStateType.New } },
      application: [{ state: { type: SubnetStateType.New } }],
    });
    for (const name of ["property", "job", "market"] as const) {
      const { idlFactory, initArgs } = serviceFromWasm(wasmPath(name));
      svcs[name] = idlFactory({ IDL });
      const arg = new Uint8Array(IDL.encode(initArgs, initArgs.map(() => admin.getPrincipal())));
      ids[name] = (await pic.setupCanister({ idlFactory: (() => svcs[name]) as any, wasm: wasmPath(name), arg })).canisterId;
      await as(name, CONTROLLER).setBootstrapNonce("n");
      ok(await as(name, admin).addAdmin(admin.getPrincipal(), "n"));
    }
    ok(await as("job", admin).setPropertyCanisterId(ids.property.toText()));
    ok(await as("market", admin).setPropertyCanisterId(ids.property.toText()));
    ok(await as("market", admin).setJobCanisterId(ids.job.toText()));
    await installReport("report");
    ok(await as("market", admin).setReportCanisterId(ids.report.toText()));

    propertyId = ok<any>(await as("property", owner).registerProperty({
      address: "9 Palm Court", city: "Orlando", state: "FL", zipCode: "32801",
      propertyType: { SingleFamily: null }, yearBuilt: 2005n, squareFeet: 1900n, tier: { Free: null },
    })).id;
    ok(await as("property", admin).verifyProperty(propertyId, { Basic: null }, []));

    const done = BigInt(await pic.getTime() - YEAR_MS / 2) * 1_000_000n;
    for (const [title, service] of [["New roof", "Roofing"], ["AC replacement", "HVAC"], ["Repipe", "Plumbing"]] as const) {
      const job = ok<any>(await as("job", owner).createJob(propertyId, title, { [service]: null }, `${title} done.`, [], 0n, done, [], [], true, []));
      ok(await as("job", owner).verifyJob(job.id));
    }
  }, 180_000);

  afterAll(async () => { await pic?.tearDown(); });

  it("publishes the signing key only through an admin refresh", async () => {
    expect(await as("report", owner).getAttestationKey()).toEqual([]);
    expect(errKey(await as("report", stranger).refreshAttestationKey())).toBe("NotAuthorized");
    const key = new Uint8Array(ok<any>(await as("report", admin).refreshAttestationKey()));
    expect(key.length).toBe(32);
    const [published] = await as("report", stranger).getAttestationKey();
    expect(published.keyName).toBe("test_key_1");
    expect(new Uint8Array(published.publicKey)).toEqual(key);
  });

  it("only lets admins pick a known signing key", async () => {
    expect(errKey(await as("report", stranger).setAttestationKeyName("key_1"))).toBe("NotAuthorized");
    expect(errKey(await as("report", admin).setAttestationKeyName("my_key"))).toBe("InvalidInput");
  });

  it("issues a certificate of the on-chain figures and signs exactly that", async () => {
    expect(errKey(await as("report", stranger).issueCert(propertyId, ""))).toBe("NotAuthorized");

    const before = await pic.getCyclesBalance(ids.report);
    const certId = ok<string>(await as("report", owner).issueCert(propertyId, "{\"score\":100}"));
    const spent = before - await pic.getCyclesBalance(ids.report);

    const [payload] = await as("report", stranger).verifyCert(certId);
    const cert = JSON.parse(payload);
    expect(cert).toMatchObject({
      v: 3, propertyId, address: "9 Palm Court", verificationLevel: "Basic",
      verifiedJobCount: 3, meetsStructural: true,
    });
    expect([...cert.verifiedKeySystems].sort()).toEqual(["HVAC", "Plumbing", "Roofing"]);
    // The score is the market canister's, not the payload the caller sent.
    expect(cert.score).toBe(await as("market", admin).computePropertyScore(propertyId).then((s: any) => s[0] === undefined ? null : Number(s[0])));

    const [raw] = await as("report", stranger).getCertAttestation(certId);
    expect(raw).toBeDefined();
    const statement = JSON.parse(raw.message);
    expect(statement).toMatchObject({ type: "homegentic.scoreCertificate", issuer: ids.report.toText(), certId });
    expect(statement.certificate).toEqual(cert);

    const a = { message: raw.message, signature: new Uint8Array(raw.signature), publicKey: new Uint8Array(raw.publicKey), keyName: raw.keyName, signedAt: 0 };
    expect(await verifySignature(a.message, a.signature, a.publicKey)).toBe(true);
    expect(await verifySignature(a.message.replace("\"verifiedJobCount\":3", "\"verifiedJobCount\":9"), a.signature, a.publicKey)).toBe(false);
    const [published] = await as("report", stranger).getAttestationKey();
    const check = await checkSignedCopy(toSignedCopy(a), { keyName: published.keyName, publicKey: new Uint8Array(published.publicKey) });
    expect(check).toMatchObject({ status: "valid", publishedKey: true });

    // One signature's fee plus the calls around it; the unused part of the
    // attached fee comes back.
    expect(spent).toBeGreaterThan(0n);
    expect(spent).toBeLessThan(40_000_000_000n);
  });

  it("keeps the key and old signatures valid across an upgrade", async () => {
    const certId = ok<string>(await as("report", owner).issueCert(propertyId, ""));
    const [beforeKey] = await as("report", owner).getAttestationKey();
    await pic.upgradeCanister({ canisterId: ids.report, wasm: wasmPath("report") });
    const [afterKey] = await as("report", owner).getAttestationKey();
    expect(new Uint8Array(afterKey.publicKey)).toEqual(new Uint8Array(beforeKey.publicKey));
    const [raw] = await as("report", owner).getCertAttestation(certId);
    expect(await verifySignature(raw.message, new Uint8Array(raw.signature), new Uint8Array(raw.publicKey))).toBe(true);
    // And it still signs after the upgrade.
    const next = ok<string>(await as("report", owner).issueCert(propertyId, ""));
    expect((await as("report", owner).getCertAttestation(next)).length).toBe(1);
  });
});
