/**
 * First week, day 3: "forward one invoice or scan one label". The relay asks
 * the job canister whether the owner has used their forwarding address, so
 * the tip is skipped once they have.
 *
 *  IA.1 nothing forwarded yet: forwarded false, no open drafts
 *  IA.2 a forwarded invoice counts, and still counts after the draft is
 *       logged or dismissed
 *  IA.3 only notifiers and admins can ask
 *  IA.4 deleteMyData forgets it
 *
 * Run: cd tests/upgrade && npx vitest run job-inbox-activity.canister.test.ts
 * (needs .dfx/local/canisters/job/job.wasm)
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PocketIc, createIdentity } from "@dfinity/pic";
import { createPic, wasmPath, withMethods, unitResult } from "./__helpers__/setup";
import { idlFactory as jobIdl } from "../../packages/shared/src/declarations/job";

type R<T> = { ok: T } | { err: Record<string, unknown> };
function ok<T>(r: R<T>): T {
  if ("err" in r)
    throw new Error(
      `Expected ok, got err: ${JSON.stringify(r.err, (_k, v) => (typeof v === "bigint" ? v.toString() : v))}`,
    );
  return r.ok;
}
const errKey = (r: R<unknown>) => ("err" in r ? Object.keys(r.err)[0] : "ok");

const extra = (I: any) => ({
  setBootstrapNonce: I.Func([I.Text], [], []),
  addAdmin: I.Func([I.Principal, I.Text], [unitResult(I)], []),
  addNotifier: I.Func([I.Principal], [unitResult(I)], []),
});

const draft = (n: number) => ({
  fromAddress: "billing@plumber.example",
  subject: `Invoice ${n}`,
  title: `Invoice ${n}`,
  serviceType: "Plumbing",
  contractorName: "Ace Plumbing",
  amountCents: 12_000n,
  completedDate: "2026-10-01",
  warrantyMonths: 0n,
  description: "",
});

describe("job canister: has the owner forwarded an invoice?", () => {
  let pic: PocketIc;
  let job: any;
  const admin = createIdentity("ia-admin");
  const alice = createIdentity("ia-alice");
  const bob = createIdentity("ia-bob");
  const inboxRelay = createIdentity("ia-inbox");
  const notifier = createIdentity("ia-notifier");

  beforeAll(async () => {
    pic = await createPic();
    const j = await pic.setupCanister({ idlFactory: withMethods(jobIdl, extra) as any, wasm: wasmPath("job") });
    job = j.actor;
    await job.setBootstrapNonce("n");
    job.setIdentity(admin);
    ok(await job.addAdmin(admin.getPrincipal(), "n"));
    ok(await job.addInboxRelay(inboxRelay.getPrincipal()));
    ok(await job.addNotifier(notifier.getPrincipal()));
  });

  afterAll(async () => {
    await pic?.tearDown();
  });

  it("IA.1 says nothing was forwarded for a new owner", async () => {
    job.setIdentity(notifier);
    expect(ok(await job.getInboxActivity(alice.getPrincipal()))).toEqual({ forwarded: false, openDrafts: 0n });
  });

  it("IA.2 counts a forwarded invoice, even after the draft is dismissed", async () => {
    job.setIdentity(alice);
    const token = ok<string>(await job.getMyInboxToken());
    job.setIdentity(inboxRelay);
    const id = ok<string>(await job.relayAddEmailDraft(token, draft(1)));

    job.setIdentity(notifier);
    expect(ok(await job.getInboxActivity(alice.getPrincipal()))).toEqual({ forwarded: true, openDrafts: 1n });

    job.setIdentity(alice);
    ok(await job.dismissEmailDraft(id));
    job.setIdentity(notifier);
    expect(ok(await job.getInboxActivity(alice.getPrincipal()))).toEqual({ forwarded: true, openDrafts: 0n });
    // Someone else's inbox is separate.
    expect(ok(await job.getInboxActivity(bob.getPrincipal()))).toEqual({ forwarded: false, openDrafts: 0n });
  });

  it("IA.3 answers only notifiers and admins", async () => {
    job.setIdentity(alice);
    expect(errKey(await job.getInboxActivity(alice.getPrincipal()))).toBe("NotAuthorized");
    job.setIdentity(bob);
    expect(errKey(await job.getInboxActivity(alice.getPrincipal()))).toBe("NotAuthorized");
    job.setIdentity(admin);
    expect(ok(await job.getInboxActivity(alice.getPrincipal()))).toMatchObject({ forwarded: true });
  });

  it("IA.4 forgets it with deleteMyData", async () => {
    job.setIdentity(alice);
    ok(await job.deleteMyData());
    job.setIdentity(notifier);
    expect(ok(await job.getInboxActivity(alice.getPrincipal()))).toEqual({ forwarded: false, openDrafts: 0n });
  });
});
