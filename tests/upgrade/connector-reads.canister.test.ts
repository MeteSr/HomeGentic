/**
 * Reads for the ChatGPT and Claude connectors (ICP MCP, docs/AI_CONNECTORS.md).
 *
 * A user who picks "Questions only" on Internet Identity's consent screen can
 * make queries only, so the things people ask about need query versions; and
 * the access-checked reads that are update calls (each one calls `property`)
 * need a per-minute limit like writes have.
 *
 *  CON.1 maintenance.getScheduleForProperties is a composite query that returns
 *        what getScheduleByProperty returns for each home, and nothing for a
 *        home the caller has no role on
 *  CON.2 report.getMyReports is a query returning the caller's newest report
 *        snapshot per home, and nothing for someone else's homes
 *  CON.3 job, bills, recurring and maintenance limit their access-checked
 *        update reads to 120 a minute per caller (setReadRateLimit changes it,
 *        admin only); Result reads answer #RateLimited, list reads answer []
 *  CON.4 reads and writes are counted separately, admins aren't counted, and
 *        the window resets after a minute
 *
 * Run: cd tests/upgrade && npx vitest run connector-reads.canister.test.ts
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
const tag = (r: any) => (r && typeof r === "object" && "err" in r ? Object.keys(r.err)[0] : "ok");

describe("connector reads", () => {
  let pic: PocketIc;
  let d: Deployment;
  let n = 0;
  const admin = createIdentity("con-admin");
  const owner = createIdentity("con-owner");
  const stranger = createIdentity("con-stranger");
  const as = (name: CanisterName, who: Identity) => d.actor(name, who);
  let pid = "";
  let otherPid = "";
  let serviceId = "";

  const home = async (who: Identity) =>
    ok<any>(
      await as("property", who).registerProperty({
        address: `${++n} Connector Lane`,
        city: "Orlando",
        state: "FL",
        zipCode: "32801",
        propertyType: { SingleFamily: null },
        yearBuilt: 1998n,
        squareFeet: 1850n,
        tier: { Pro: null },
      }),
    ).id as string;

  const report = (who: Identity, propertyId: string) =>
    as("report", who).generateReport(
      propertyId,
      {
        address: "ignored",
        city: "",
        state: "",
        zipCode: "",
        propertyType: "",
        yearBuilt: 0n,
        squareFeet: 0n,
        verificationLevel: "Basic",
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
    );

  const mode = (name: CanisterName, method: string) => {
    const f = d.svcs[name]._fields.find(([m]) => m === method);
    return f ? (f[1] as any).annotations.join(",") || "update" : "missing";
  };
  const nextWindow = async () => {
    await pic.advanceTime(61_000);
    await pic.tick();
  };

  beforeAll(async () => {
    pic = await createPic();
    d = await deployAll(pic, admin);
    for (const u of [owner, stranger])
      ok(await as("payment", admin).grantSubscription(u.getPrincipal(), { Pro: null }));
    pid = await home(owner);
    otherPid = await home(stranger);
    ok(await as("property", admin).verifyProperty(pid, { Basic: null }, []));
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
    for (const [what, year] of [
      ["Annual service", 2027n],
      ["Filter", 2026n],
    ] as const)
      ok(await as("maintenance", owner).createScheduleEntry(pid, "HVAC", what, year, [3n], [20_000n]));
    ok(await as("maintenance", stranger).createScheduleEntry(otherPid, "Roof", "Inspect", 2027n, [], []));
    serviceId = ok<any>(
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
    ).id;
  }, 600_000);

  afterAll(async () => {
    await pic?.tearDown();
  });

  it("CON.1 maintenance.getScheduleForProperties is a composite query matching the per-home read", async () => {
    expect(mode("maintenance", "getScheduleForProperties")).toBe("composite_query");
    const batch = await as("maintenance", owner).getScheduleForProperties([pid, otherPid, "no-such-home"]);
    expect(batch.map((e: any) => e.propertyId)).toEqual([pid, pid]);
    const single = await as("maintenance", owner).getScheduleByProperty(pid);
    expect([...batch].sort((a: any, b: any) => a.id.localeCompare(b.id))).toEqual(
      [...single].sort((a: any, b: any) => a.id.localeCompare(b.id)),
    );
    expect(await as("maintenance", owner).getScheduleForProperties([])).toEqual([]);
  });

  it("CON.2 report.getMyReports is a query with the caller's newest report per home", async () => {
    expect(mode("report", "getMyReports")).toBe("query");
    expect(await as("report", owner).getMyReports([pid])).toEqual([]);
    ok(await report(owner, pid));
    await pic.advanceTime(1_000);
    const second = ok<any>(await report(owner, pid));
    const mine = await as("report", owner).getMyReports([pid, otherPid]);
    expect(mine).toHaveLength(1);
    expect(mine[0].snapshotId).toBe(second.snapshotId);
    expect(mine[0].propertyId).toBe(pid);
    expect(await as("report", stranger).getMyReports([pid])).toEqual([]);
  });

  it("CON.3 access-checked update reads stop at the per-minute read limit", async () => {
    await nextWindow();
    // Default 120 a minute: the 121st job read is refused.
    for (let i = 0; i < 120; i++) expect(tag(await as("job", owner).getJobsForProperty(pid))).toBe("ok");
    expect(tag(await as("job", owner).getJobsForProperty(pid))).toBe("RateLimited");

    for (const c of ["bills", "recurring", "maintenance"] as const) {
      expect(tag(await as(c, stranger).setReadRateLimit(1n))).not.toBe("ok");
      ok(await as(c, admin).setReadRateLimit(1n));
    }
    expect(tag(await as("bills", owner).getBillsForProperty(pid))).toBe("ok");
    expect(tag(await as("bills", owner).getUsageTrend(pid, { Electric: null }, 12n))).toBe("RateLimited");
    expect(tag(await as("bills", owner).getRecurringExpensesForProperty(pid))).toBe("RateLimited");

    expect(await as("recurring", owner).getByProperty(pid)).toHaveLength(1);
    expect(await as("recurring", owner).getByProperty(pid)).toEqual([]);
    expect(tag(await as("recurring", owner).getRecurringService(serviceId))).toBe("RateLimited");
    expect(await as("recurring", owner).getVisitLogs(serviceId)).toEqual([]);

    expect(await as("maintenance", owner).getScheduleByProperty(pid)).toHaveLength(2);
    expect(await as("maintenance", owner).getScheduleByProperty(pid)).toEqual([]);
  }, 300_000);

  it("CON.4 reads and writes count separately, admins aren't counted, the window resets", async () => {
    // Reads are used up; a write still goes through.
    expect(tag(await as("maintenance", owner).createScheduleEntry(pid, "Gutters", "Clean", 2027n, [], []))).toBe("ok");
    for (let i = 0; i < 3; i++) expect(await as("maintenance", admin).getScheduleByProperty(pid)).toHaveLength(3);
    await nextWindow();
    expect(await as("maintenance", owner).getScheduleByProperty(pid)).toHaveLength(3);
    expect(tag(await as("job", owner).getJobsForProperty(pid))).toBe("ok");
  });
});
