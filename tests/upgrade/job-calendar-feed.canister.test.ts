/**
 * Private calendar feed (issue #717): the owner turns on a subscribe link
 * (job canister, enableMyCalendarFeed), the app publishes the owner's dated
 * events to it (publishMyCalendarEvents), and the voice Worker reads them by
 * token (getCalendarFeed, a public query: the token is the credential, like
 * getJobByInviteToken) to serve the .ics file.
 *
 *  CF.1 enabling makes one 128-bit token per owner; anonymous callers can't
 *  CF.2 publishing needs the feed turned on; the token reads the events back,
 *       an unknown token reads nothing
 *  CF.3 bad input is refused: too many events, bad dates, bad RRULEs; long
 *       text is clipped
 *  CF.4 reset replaces the token (old link dead, events kept)
 *  CF.5 disable removes the token and the events
 *  CF.6 the feed survives an upgrade; deleteMyData removes it
 *
 * Run: cd tests/upgrade && npx vitest run job-calendar-feed.canister.test.ts
 * (needs .dfx/local/canisters/job/job.wasm)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "fs";
import { PocketIc, createIdentity } from "@dfinity/pic";
import { IDL } from "@icp-sdk/core/candid";
import { AnonymousIdentity, type Identity } from "@icp-sdk/core/agent";
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

const event = (i: number, over: Record<string, unknown> = {}) => ({
  uid: `warranty-J${i}`,
  date: "2027-03-14",
  title: `Warranty ends ${i}`,
  description: "Cool Air Co",
  rrule: "",
  ...over,
});

describe("job canister calendar feed", () => {
  let pic: PocketIc;
  let jobId: any;
  let svc: IDL.ServiceClass;

  const admin = createIdentity("cf-admin");
  const owner = createIdentity("cf-owner");
  const other = createIdentity("cf-other");
  const anon = new AnonymousIdentity();

  const as = (who: Identity) => {
    const a = pic.createActor<any>((() => svc) as any, jobId);
    a.setIdentity(who);
    return a;
  };

  beforeAll(async () => {
    pic = await createPic();
    const { idlFactory, initArgs } = serviceFromWasm(wasmPath("job"));
    svc = idlFactory({ IDL });
    const arg = new Uint8Array(
      IDL.encode(
        initArgs,
        initArgs.map(() => admin.getPrincipal()),
      ),
    );
    jobId = (await pic.setupCanister({ idlFactory: (() => svc) as any, wasm: wasmPath("job"), arg })).canisterId;
    await as(CONTROLLER).setBootstrapNonce("n");
    ok(await as(admin).addAdmin(admin.getPrincipal(), "n"));
  }, 120_000);

  afterAll(async () => {
    await pic?.tearDown();
  });

  let token = "";

  it("CF.1 makes one 128-bit token per owner and refuses anonymous callers", async () => {
    expect(await as(owner).getMyCalendarFeed()).toEqual([]);
    token = ok<string>(await as(owner).enableMyCalendarFeed());
    expect(token).toMatch(/^[0-9a-f]{32}$/);
    expect(ok<string>(await as(owner).enableMyCalendarFeed())).toBe(token);
    const [status] = await as(owner).getMyCalendarFeed();
    expect(status.token).toBe(token);
    expect(status.eventCount).toBe(0n);
    expect(status.version).toBe("");
    // Ingress inspection turns anonymous update calls away before they run.
    await expect(as(anon).enableMyCalendarFeed()).rejects.toThrow();
  });

  it("CF.2 publishes only to an enabled feed and reads back by token", async () => {
    expect(errKey(await as(other).publishMyCalendarEvents("v1", [event(1)]))).toBe("NotFound");
    expect(await as(anon).getCalendarFeed(token)).toEqual([{ events: [], updatedAt: 0n }]);

    expect(
      ok<bigint>(
        await as(owner).publishMyCalendarEvents("v1", [
          event(1),
          event(2, { rrule: "FREQ=MONTHLY;INTERVAL=3;UNTIL=20271231" }),
        ]),
      ),
    ).toBe(2n);
    const [feed] = await as(anon).getCalendarFeed(token);
    expect(feed.events.map((e: any) => e.uid)).toEqual(["warranty-J1", "warranty-J2"]);
    expect(feed.events[1].rrule).toBe("FREQ=MONTHLY;INTERVAL=3;UNTIL=20271231");
    expect(feed.updatedAt).toBeGreaterThan(0n);
    const [status] = await as(owner).getMyCalendarFeed();
    expect(status.version).toBe("v1");
    expect(status.eventCount).toBe(2n);

    expect(await as(anon).getCalendarFeed("0".repeat(32))).toEqual([]);
    expect(await as(anon).getCalendarFeed("")).toEqual([]);
  });

  it("CF.3 refuses too many events, bad dates and bad RRULEs, and clips long text", async () => {
    const tooMany = Array.from({ length: 101 }, (_, i) => event(i));
    expect(errKey(await as(owner).publishMyCalendarEvents("v2", tooMany))).toBe("InvalidInput");
    for (const date of ["2027-3-14", "2027/03/14", "next week", "2027-13-01", "2027-02-30x"]) {
      expect(errKey(await as(owner).publishMyCalendarEvents("v2", [event(1, { date })]))).toBe("InvalidInput");
    }
    for (const rrule of ["FREQ=WEEKLY\r\nATTENDEE:x", "INTERVAL=2", "freq=weekly", "FREQ=" + "A".repeat(120)]) {
      expect(errKey(await as(owner).publishMyCalendarEvents("v2", [event(1, { rrule })]))).toBe("InvalidInput");
    }
    expect(errKey(await as(owner).publishMyCalendarEvents("v2", [event(1, { uid: "" })]))).toBe("InvalidInput");

    ok(
      await as(owner).publishMyCalendarEvents("v3", [
        event(1, { title: "t".repeat(500), description: "d".repeat(5000), uid: "u".repeat(500) }),
      ]),
    );
    const [feed] = await as(anon).getCalendarFeed(token);
    expect(feed.events[0].title.length).toBe(120);
    expect(feed.events[0].description.length).toBe(500);
    expect(feed.events[0].uid.length).toBe(120);
    ok(await as(owner).publishMyCalendarEvents("v1", [event(1), event(2)]));
  });

  it("CF.4 reset gives a new token, kills the old link and keeps the events", async () => {
    const fresh = ok<string>(await as(owner).resetMyCalendarFeed());
    expect(fresh).not.toBe(token);
    expect(fresh).toMatch(/^[0-9a-f]{32}$/);
    expect(await as(anon).getCalendarFeed(token)).toEqual([]);
    const [feed] = await as(anon).getCalendarFeed(fresh);
    expect(feed.events).toHaveLength(2);
    expect(errKey(await as(other).resetMyCalendarFeed())).toBe("NotFound");
    token = fresh;
  });

  it("CF.5 disable removes the token and the events", async () => {
    ok(await as(owner).disableMyCalendarFeed());
    expect(await as(anon).getCalendarFeed(token)).toEqual([]);
    expect(await as(owner).getMyCalendarFeed()).toEqual([]);
    expect(errKey(await as(owner).publishMyCalendarEvents("v1", [event(1)]))).toBe("NotFound");
    // Turning it back on starts empty with a new link.
    const again = ok<string>(await as(owner).enableMyCalendarFeed());
    expect(again).not.toBe(token);
    const [status] = await as(owner).getMyCalendarFeed();
    expect(status.eventCount).toBe(0n);
    token = again;
  });

  it("CF.6 keeps the feed across an upgrade and drops it on deleteMyData", async () => {
    ok(await as(owner).publishMyCalendarEvents("v9", [event(7)]));
    await pic.upgradeCanister({ canisterId: jobId, wasm: readFileSync(wasmPath("job")) });
    const [feed] = await as(anon).getCalendarFeed(token);
    expect(feed.events.map((e: any) => e.uid)).toEqual(["warranty-J7"]);

    ok(await as(owner).deleteMyData());
    expect(await as(anon).getCalendarFeed(token)).toEqual([]);
    expect(await as(owner).getMyCalendarFeed()).toEqual([]);
  });
});
