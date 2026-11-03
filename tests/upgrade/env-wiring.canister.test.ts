/**
 * Sibling canister IDs from environment variables, the way production wires
 * them: `icp deploy` stamps `PUBLIC_CANISTER_ID:<name>` into every canister,
 * and each canister reads its siblings from those on install and on every
 * upgrade (Canisters.envId / syncCanisterIds). The set*CanisterId setters are
 * only the fallback for dfx and older PocketIC tests.
 *
 *  ENV.1 every ID setter deploy-canisters.sh calls has a matching
 *        envId/envPrincipal line in that canister's syncCanisterIds
 *  ENV.2 with only the variables (no setter calls), the cross-canister writes
 *        work: tier from payment, access from property, scores from job
 *  ENV.3 an upgrade re-reads the variables, so a stale setter value heals
 *
 * Run: cd tests/upgrade && npx vitest run env-wiring.canister.test.ts
 * (needs .dfx/local/canisters/<all>/<name>.wasm)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { PocketIc, createIdentity } from "@dfinity/pic";
import { Principal } from "@icp-sdk/core/principal";
import type { Identity } from "@icp-sdk/core/agent";
import { createPic, wasmPath, CONTROLLER } from "./__helpers__/setup";
import { deployAll, wiringCalls, isIdSetter, type Deployment, type CanisterName } from "./__helpers__/deployAll";

const ROOT = resolve(__dirname, "../..");

type R<T> = { ok: T } | { err: Record<string, unknown> };
const ok = <T>(r: R<T>): T => {
  if ("err" in r)
    throw new Error(
      `Expected ok, got err: ${JSON.stringify(r.err, (_k, v) => (typeof v === "bigint" ? v.toString() : v))}`,
    );
  return r.ok;
};
const errOf = (r: R<unknown>) => ("err" in r ? Object.keys(r.err)[0] : "ok");

/** setRiskJobCanisterId → "job", setPaymentCanisterId → "payment". */
const SPECIAL: Record<string, string> = { RiskJob: "job" };
const siblingOf = (setter: string) => {
  const m = setter.match(/^set(\w+?)CanisterIds?$/)![1];
  return SPECIAL[m] ?? m.charAt(0).toLowerCase() + m.slice(1);
};

/** The sibling names a canister's syncCanisterIds reads. */
function envNames(canister: string): Set<string> {
  const src = readFileSync(resolve(ROOT, `backend/${canister}/main.mo`), "utf8");
  const body = src.match(/func syncCanisterIds<system>\(\)\s*\{([\s\S]*?)\n  \};/);
  if (!body) return new Set();
  return new Set([...body[1].matchAll(/Canisters\.env(?:Id|Principal)<system>\("(\w+)"/g)].map((m) => m[1]));
}

describe("ENV.1 every ID setter has an environment variable", () => {
  it("each set*CanisterId in deploy-canisters.sh is read in syncCanisterIds", () => {
    const missing: string[] = [];
    for (const c of wiringCalls()) {
      if (!isIdSetter(c.method)) continue;
      const sibling = siblingOf(c.method);
      if (!envNames(c.canister).has(sibling)) missing.push(`${c.canister}.${c.method} → PUBLIC_CANISTER_ID:${sibling}`);
    }
    expect(missing).toEqual([]);
  });

  it("each syncCanisterIds name is a real canister", () => {
    const toml = readFileSync(resolve(ROOT, "mops.toml"), "utf8");
    const canisters = new Set([...toml.matchAll(/^\[canisters\.(\w+)\]/gm)].map((m) => m[1]));
    const bad: string[] = [];
    for (const c of canisters) for (const n of envNames(c)) if (!canisters.has(n)) bad.push(`${c}: ${n}`);
    expect(bad).toEqual([]);
  });
});

describe("canisters wired only through PUBLIC_CANISTER_ID variables", () => {
  let pic: PocketIc;
  let d: Deployment;
  let n = 0;
  const admin = createIdentity("env-admin");
  const as = (name: CanisterName, who: Identity) => d.actor(name, who);

  async function user(tier?: "Pro"): Promise<Identity> {
    const u = createIdentity(`env-user-${++n}`);
    if (tier) ok(await as("payment", admin).grantSubscription(u.getPrincipal(), { [tier]: null }));
    return u;
  }
  const register = (owner: Identity) =>
    as("property", owner).registerProperty({
      address: `${++n} Variable Ave`,
      city: "Orlando",
      state: "FL",
      zipCode: "32801",
      propertyType: { SingleFamily: null },
      yearBuilt: 1998n,
      squareFeet: 1850n,
      tier: { Pro: null },
    });

  beforeAll(async () => {
    pic = await createPic();
    d = await deployAll(pic, admin, wasmPath, { envIds: true });
  });
  afterAll(async () => {
    await pic?.tearDown();
  });

  it("ENV.2 property reads the tier from payment: Free stops at one home, Pro doesn't", async () => {
    const free = await user();
    ok(await register(free));
    expect(errOf(await register(free))).toBe("InvalidInput");
    const pro = await user("Pro");
    ok(await register(pro));
    ok(await register(pro));
  });

  it("ENV.2 job, bills, recurring, maintenance, quote and market reach property, payment and job", async () => {
    const owner = await user("Pro");
    const pid = (ok(await register(owner)) as any).id;
    const stranger = await user("Pro");
    ok(
      await as("job", owner).createJob(
        pid,
        "Water heater",
        { Plumbing: null },
        "Replaced it.",
        [],
        0n,
        0n,
        [],
        [],
        true,
        [],
      ),
    );
    expect(
      errOf(await as("job", stranger).createJob(pid, "x", { Plumbing: null }, "x", [], 0n, 0n, [], [], true, [])),
    ).toBe("NotAuthorized");
    ok(
      await as("bills", owner).addBill({
        propertyId: pid,
        billType: { Electric: null },
        provider: "Duke",
        periodStart: "2026-09-01",
        periodEnd: "2026-09-30",
        amountCents: 12_000n,
        usageAmount: [],
        usageUnit: [],
      }),
    );
    ok(
      await as("recurring", owner).createRecurringService(
        pid,
        { LawnCare: null },
        "Green Co",
        [],
        [],
        { Monthly: null },
        "2026-01-01",
        [],
        [],
      ),
    );
    ok(await as("maintenance", owner).createScheduleEntry(pid, "HVAC", "Annual service", 2027n, [3n], [20_000n]));
    ok(await as("quote", owner).createQuoteRequest(pid, { HVAC: null }, "AC out", { High: null }, [], [], [], [], []));
    ok(await as("market", owner).submitScore(pid));
  });

  it("ENV.3 an upgrade re-reads the variables, so a wrong setter value heals", async () => {
    const pro = await user("Pro");
    ok(await register(pro));
    // Point property at the wrong payment canister (audit's id) through the setter fallback.
    ok(await as("property", admin).setPaymentCanisterId(d.ids.audit));
    expect(errOf(await register(pro))).not.toBe("ok");
    await pic.upgradeCanister({
      canisterId: d.ids.property,
      wasm: readFileSync(wasmPath("property")),
      sender: CONTROLLER.getPrincipal(),
    });
    ok(await register(pro));
  });

  it("ENV.3 a variable for a canister that doesn't exist yet is ignored, not trapped on", async () => {
    // An empty value keeps the stored ID (Canisters.envId), so deploying a new
    // canister later can't break the ones already running.
    await pic.updateCanisterSettings({
      canisterId: d.ids.property,
      sender: CONTROLLER.getPrincipal(),
      environmentVariables: [
        ...Object.entries(d.ids)
          .filter(([k]) => k !== "listing")
          .map(([k, v]) => ({ name: `PUBLIC_CANISTER_ID:${k}`, value: (v as Principal).toText() })),
        { name: "PUBLIC_CANISTER_ID:listing", value: "" },
      ],
    });
    await pic.upgradeCanister({
      canisterId: d.ids.property,
      wasm: readFileSync(wasmPath("property")),
      sender: CONTROLLER.getPrincipal(),
    });
    ok(await register(await user("Pro")));
  });
});
