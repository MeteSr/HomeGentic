/**
 * More kinds of work (issue #721): Inspection, Septic, Generator and the rest
 * are subtypes of #Other, so ServiceType (and every installed client's
 * declarations) stay as they are.
 *
 *  ST.1 quote: the requester records a subtype on their own open Other request
 *       (setQuoteRequestSubtype); others can't, unknown subtypes and named
 *       types are refused, null clears it
 *  ST.2 quote: anyone who can see requests reads the subtypes back
 *       (getQuoteRequestSubtypes); unmarked and unknown ids are left out
 *  ST.3 quote: subtypes survive an upgrade (new stable side map, not a
 *       QuoteRequest field) and go with the requester's account
 *  ST.4 report: an Other job titled with a subtype shows under that subtype in
 *       the report; any other Other job still shows as Other
 *
 * Run: cd tests/upgrade && npx vitest run service-subtypes.canister.test.ts
 * (needs .dfx/local/canisters/{quote,property,job,report}/*.wasm)
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

const CANISTERS = ["property", "job", "report", "quote"] as const;
type Name = (typeof CANISTERS)[number];

describe("service subtypes under Other", () => {
  let pic: PocketIc;
  const ids = {} as Record<Name, any>;
  const svcs = {} as Record<Name, IDL.ServiceClass>;

  const admin = createIdentity("st-admin");
  const owner = createIdentity("st-owner");
  const stranger = createIdentity("st-stranger");

  const as = (name: Name, who: Identity) => {
    const a = pic.createActor<any>((() => svcs[name]) as any, ids[name]);
    a.setIdentity(who);
    return a;
  };
  const subtypes = async (who: Identity, reqIds: string[]) =>
    new Map<string, string>(await as("quote", who).getQuoteRequestSubtypes(reqIds));
  const request = async (who: Identity, serviceType: object, description: string) =>
    ok<any>(
      await as("quote", who).createQuoteRequest(
        `prop-${description}`,
        serviceType,
        description,
        { Low: null },
        [],
        [],
        [],
        [],
        [],
      ),
    ).id as string;

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
    // Wired as report-job.canister.test.ts (and deploy.sh) wire them. The
    // quote canister is left unwired: with no property canister it takes any
    // property id, which is all ST.1–ST.3 need.
    ok(await as("job", admin).setPropertyCanisterId(ids.property.toText()));
    ok(await as("job", admin).addTrustedCanister(ids.report));
    ok(await as("property", admin).addTrustedCanister(ids.report));
    ok(await as("report", admin).setPropertyCanisterId(ids.property.toText()));
    ok(await as("report", admin).setRiskJobCanisterId(ids.job.toText()));
  });

  afterAll(async () => {
    await pic?.tearDown();
  });

  describe("quote requests", () => {
    let septic = "";
    let hvac = "";

    beforeAll(async () => {
      septic = await request(owner, { Other: null }, "septic");
      hvac = await request(owner, { HVAC: null }, "hvac");
    });

    it("ST.1 the requester records a subtype on their own Other request; nobody else can", async () => {
      ok(await as("quote", owner).setQuoteRequestSubtype(septic, ["Septic"]));
      expect(errKey(await as("quote", stranger).setQuoteRequestSubtype(septic, ["Chimney"]))).toBe("NotAuthorized");
      expect(errKey(await as("quote", owner).setQuoteRequestSubtype("no-such-request", ["Septic"]))).toBe("NotFound");
      expect((await subtypes(stranger, [septic])).get(septic)).toBe("Septic");
    });

    it("ST.1 refuses an unknown subtype, and a subtype on a named type", async () => {
      expect(errKey(await as("quote", owner).setQuoteRequestSubtype(septic, ["Plumbing"]))).toBe("InvalidInput");
      expect(errKey(await as("quote", owner).setQuoteRequestSubtype(septic, ["septic tank"]))).toBe("InvalidInput");
      expect(errKey(await as("quote", owner).setQuoteRequestSubtype(hvac, ["Inspection"]))).toBe("InvalidInput");
      expect((await subtypes(owner, [septic])).get(septic)).toBe("Septic");
    });

    it("ST.2 reads back only marked, known requests", async () => {
      const got = await subtypes(stranger, [septic, hvac, "no-such-request"]);
      expect([...got]).toEqual([[septic, "Septic"]]);
      expect(await as("quote", owner).getQuoteRequestSubtypes([])).toEqual([]);
    });

    it("ST.1 null clears a subtype, and a closed request can't change", async () => {
      const inspection = await request(owner, { Other: null }, "inspection");
      ok(await as("quote", owner).setQuoteRequestSubtype(inspection, ["Inspection"]));
      ok(await as("quote", owner).setQuoteRequestSubtype(inspection, []));
      expect((await subtypes(owner, [inspection])).has(inspection)).toBe(false);
      ok(await as("quote", owner).cancelQuoteRequest(inspection));
      expect(errKey(await as("quote", owner).setQuoteRequestSubtype(inspection, ["Inspection"]))).toBe("InvalidInput");
    });

    it("ST.3 subtypes survive an upgrade", async () => {
      await pic.upgradeCanister({ canisterId: ids.quote, wasm: readFileSync(wasmPath("quote")) });
      expect((await subtypes(owner, [septic])).get(septic)).toBe("Septic");
    });

    it("ST.3 deleteMyData drops the requester's subtypes", async () => {
      ok(await as("quote", owner).deleteMyData());
      expect(await as("quote", admin).getQuoteRequestSubtypes([septic])).toEqual([]);
    });
  });

  describe("reports", () => {
    it("ST.4 an Other job titled with a subtype shows under it; other Other jobs stay Other", async () => {
      const propertyId = ok<any>(
        await as("property", owner).registerProperty({
          address: "7 Tank Road",
          city: "Orlando",
          state: "FL",
          zipCode: "32801",
          propertyType: { SingleFamily: null },
          yearBuilt: 1990n,
          squareFeet: 1600n,
          tier: { Free: null },
        }),
      ).id;
      ok(await as("property", admin).verifyProperty(propertyId, { Basic: null }, []));
      const diy = (title: string, serviceType: object) =>
        as("job", owner).createJob(propertyId, title, serviceType, `${title} work`, [], 0n, 0n, [], [], true, []);
      ok(await diy("Septic", { Other: null }));
      ok(await diy("Well & Water Treatment", { Other: null }));
      ok(await diy("Fixed the shed door", { Other: null }));
      ok(await diy("Septic", { Plumbing: null }));

      const token = ok<any>(
        await as("report", owner).generateReport(
          propertyId,
          {
            address: "",
            city: "",
            state: "",
            zipCode: "",
            propertyType: "",
            yearBuilt: 0n,
            squareFeet: 0n,
            verificationLevel: "",
          },
          [],
          [],
          [],
          { Public: null },
          [],
          [],
          [],
          [],
          [],
          [],
        ),
      ).token;
      const [, snap] = ok<any>(await as("report", stranger).getReport(token));
      expect((snap.jobs as any[]).map((j) => j.serviceType).sort()).toEqual([
        "Other",
        "Plumbing",
        "Septic",
        "Well & Water Treatment",
      ]);
    });
  });
});
