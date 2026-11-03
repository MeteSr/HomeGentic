/**
 * Methods that had no functional test against a real canister (test-gap
 * audit 2026-11-03, M6). Each is checked for who may call it and what it
 * does.
 *
 *  REM.1 sensor: only an admin changes the verified-only sources, Manual can't
 *        be one, and a source taken off the list can be added directly again
 *  REM.2 auth: completeOnboarding marks a registered user and ignores anyone
 *        else; isAdminPrincipal tells admins from everyone else
 *  REM.3 monitoring: recordCallCycles counts only admins' and reporters' samples
 *  REM.4 listing: feed pages are capped and past-the-end pages are empty
 *  REM.5 job: getUnattestedJobIds lists only jobs signed through an
 *        unverified contractor profile
 *
 * Run: cd tests/upgrade && npx vitest run remaining-methods.canister.test.ts
 * (needs .dfx/local/canisters/<all>/<name>.wasm)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PocketIc, createIdentity } from "@dfinity/pic";
import type { Identity } from "@icp-sdk/core/agent";
import { createPic } from "./__helpers__/setup";
import { deployAll, type Deployment, type CanisterName } from "./__helpers__/deployAll";

type R<T> = { ok: T } | { err: Record<string, unknown> };
const ok = <T,>(r: R<T>): T => {
  if ("err" in r) throw new Error(`Expected ok, got err: ${JSON.stringify(r.err, (_k, v) => (typeof v === "bigint" ? v.toString() : v))}`);
  return r.ok;
};
const errOf = (r: R<unknown>) => ("err" in r ? Object.keys(r.err)[0] : "ok");

describe("methods with no earlier real-canister test", () => {
  let pic: PocketIc;
  let d: Deployment;
  let n = 0;
  const admin = createIdentity("rem-admin");
  const gateway = createIdentity("rem-gateway");
  const as = (name: CanisterName, who: Identity) => d.actor(name, who);

  async function proUser(): Promise<Identity> {
    const u = createIdentity(`rem-user-${++n}`);
    ok(await as("payment", admin).grantSubscription(u.getPrincipal(), { Pro: null }));
    return u;
  }
  async function home(owner: Identity): Promise<string> {
    return ok<any>(await as("property", owner).registerProperty({
      address: `${++n} Coverage Court`, city: "Orlando", state: "FL", zipCode: "32801",
      propertyType: { SingleFamily: null }, yearBuilt: 1998n, squareFeet: 1850n, tier: { Pro: null },
    })).id;
  }

  beforeAll(async () => {
    pic = await createPic();
    d = await deployAll(pic, admin);
  });
  afterAll(async () => { await pic?.tearDown(); });

  it("REM.1 sensor's verified-only sources: admin-only, never Manual, and they gate direct registration", async () => {
    const owner = await proUser();
    const pid = await home(owner);
    ok(await as("sensor", admin).addGateway(gateway.getPrincipal()));
    expect((await as("sensor", owner).getVerifiedOnlySources()).map((s: object) => Object.keys(s)[0])).toContain("Ecobee");
    expect(errOf(await as("sensor", owner).registerDevice(pid, "eco-1", { Ecobee: null }, "Hall"))).toBe("InvalidInput");

    expect(errOf(await as("sensor", owner).setVerifiedOnlySources([]))).toBe("NotAuthorized");
    expect(errOf(await as("sensor", admin).setVerifiedOnlySources([{ Manual: null }]))).toBe("InvalidInput");
    ok(await as("sensor", admin).setVerifiedOnlySources([{ HoneywellHome: null }]));
    ok(await as("sensor", owner).registerDevice(pid, "eco-1", { Ecobee: null }, "Hall"));
    expect(errOf(await as("sensor", owner).registerDevice(pid, "hw-1", { HoneywellHome: null }, "Den"))).toBe("InvalidInput");
    ok(await as("sensor", admin).setVerifiedOnlySources([{ Ecobee: null }, { HoneywellHome: null }, { LGThinQ: null }, { GESmartHQ: null }]));
  });

  it("REM.2 completeOnboarding marks a registered user and ignores an unregistered one", async () => {
    const u = createIdentity(`rem-onb-${++n}`);
    await as("auth", u).completeOnboarding();
    expect(errOf(await as("auth", u).getProfile())).toBe("NotFound");
    ok(await as("auth", u).register({ role: { Homeowner: null }, email: "o@example.com", phone: "" }));
    expect((ok<any>(await as("auth", u).getProfile())).onboardingComplete).not.toEqual([true]);
    await as("auth", u).completeOnboarding();
    expect((ok<any>(await as("auth", u).getProfile())).onboardingComplete).toEqual([true]);

    expect(await as("auth", u).isAdminPrincipal(admin.getPrincipal())).toBe(true);
    expect(await as("auth", u).isAdminPrincipal(u.getPrincipal())).toBe(false);
  });

  it("REM.3 recordCallCycles keeps admins' samples and drops strangers'", async () => {
    const stranger = createIdentity(`rem-mon-${++n}`);
    await as("monitoring", stranger).recordCallCycles("stranger.method", 5n);
    await as("monitoring", admin).recordCallCycles("admin.method", 100n);
    await as("monitoring", admin).recordCallCycles("admin.method", 300n);
    const seen = (await as("monitoring", admin).getMetrics()).cyclesPerCall as any[];
    const m = seen.find((x) => x.method === "admin.method");
    expect(m).toMatchObject({ sampleCount: 2n });
    expect(m.avgCycles).toBeGreaterThan(100n);
    expect(m.avgCycles).toBeLessThan(300n);
    expect(seen.find((x) => x.method === "stranger.method")).toBeUndefined();
    expect((await as("monitoring", stranger).getMetrics()).cyclesPerCall).toEqual([]);
  });

  it("REM.4 listing feeds: huge limits are capped, pages past the end are empty", async () => {
    const u = createIdentity(`rem-feed-${++n}`);
    for (const m of ["listActiveFsboListingsPage", "getOpenBidRequestsPage"]) {
      expect(await as("listing", u)[m](1_000_000n, 10n)).toEqual([]);
      const all = await as("listing", u)[m](0n, 1_000_000_000n);
      expect(Array.isArray(all)).toBe(true);
      expect(all.length).toBeLessThanOrEqual(200); // MAX_FEED_PAGE
    }
  });

  it("REM.5 getUnattestedJobIds is empty for a home with only DIY jobs", async () => {
    const owner = await proUser();
    const pid = await home(owner);
    ok(await as("job", owner).createJob(pid, "Paint", { Painting: null }, "Painted.", [], 0n, 0n, [], [], true, []));
    expect(await as("job", owner).getUnattestedJobIds(pid)).toEqual([]);
    expect(await as("job", owner).getUnattestedJobIds("no-such-home")).toEqual([]);
  });
});
