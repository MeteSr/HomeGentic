/**
 * Per-service sign-in tokens (security review 2026-11-11, X-7 follow-up).
 *
 * auth.issueAgentSession() tokens are for the voice Worker only. The
 * notification relay and the IoT gateway each get their own token from
 * auth.issueServiceSession(audience) and check it with
 * auth.resolveServiceSession(token, audience), so a token taken from one
 * service is no use at another.
 *
 *  S1 a service token resolves for its own audience only, and never through
 *     resolveAgentSession; a Worker token never resolves as a service token
 *  S2 a caller holds one token per audience: a new one replaces the old one
 *     for that audience and leaves the others alone
 *  S3 only registered, active users get one; anonymous callers don't
 *  S4 tokens expire after 24 hours
 *  S5 revokeAgentSession (sign-out) and deleteMyData drop every token
 *
 * Run: cd tests/upgrade && npx vitest run auth-service-sessions.canister.test.ts
 * (needs .dfx/local/canisters/auth/auth.wasm)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PocketIc, createIdentity } from "@dfinity/pic";
import { IDL } from "@icp-sdk/core/candid";
import type { Identity } from "@icp-sdk/core/agent";
import { createPic, wasmPath } from "./__helpers__/setup";
import { serviceFromWasm } from "./__helpers__/candid";

type R<T> = { ok: T } | { err: Record<string, unknown> };
function ok<T>(r: R<T>): T {
  if ("err" in r) throw new Error(`Expected ok, got err: ${JSON.stringify(r.err)}`);
  return r.ok;
}
const errKey = (r: R<unknown>) => ("err" in r ? Object.keys(r.err)[0] : "ok");

const NOTIFICATIONS = { notifications: null };
const IOT_GATEWAY = { iotGateway: null };

describe("auth per-service session tokens", () => {
  let pic: PocketIc;
  let svc: IDL.ServiceClass;
  let authId: any;
  const admin = createIdentity("ss-admin");
  const alice = createIdentity("ss-alice");
  const bob = createIdentity("ss-bob");
  const stranger = createIdentity("ss-stranger"); // never registers
  const lookup = createIdentity("ss-lookup"); // the relays' throwaway caller

  const as = (who: Identity) => {
    const a = pic.createActor<any>((() => svc) as any, authId);
    a.setIdentity(who);
    return a;
  };
  const resolveFor = async (token: string, audience: object) => {
    const r = await as(lookup).resolveServiceSession(token, audience);
    return r[0] ? r[0].toText() : null;
  };
  const resolveWorker = async (token: string) => {
    const r = await as(lookup).resolveAgentSession(token);
    return r[0] ? r[0].toText() : null;
  };

  beforeAll(async () => {
    pic = await createPic();
    const { idlFactory, initArgs } = serviceFromWasm(wasmPath("auth"));
    svc = idlFactory({ IDL });
    const arg = new Uint8Array(
      IDL.encode(
        initArgs,
        initArgs.map(() => admin.getPrincipal()),
      ),
    );
    authId = (await pic.setupCanister({ idlFactory: (() => svc) as any, wasm: wasmPath("auth"), arg })).canisterId;
    for (const who of [alice, bob]) {
      ok(await as(who).register({ role: { Homeowner: null }, email: "x@example.com", phone: "555-0100" }));
    }
  });

  afterAll(async () => {
    await pic?.tearDown();
  });

  it("S1 a service token works at its own service only", async () => {
    const notif = ok<any>(await as(alice).issueServiceSession(NOTIFICATIONS));
    const iot = ok<any>(await as(alice).issueServiceSession(IOT_GATEWAY));
    const worker = ok<any>(await as(alice).issueAgentSession());
    for (const t of [notif.token, iot.token]) expect(t).toMatch(/^hgs_[0-9a-f]{64}$/);
    expect(notif.expiresAt).toBeGreaterThan(0n);

    expect(await resolveFor(notif.token, NOTIFICATIONS)).toBe(alice.getPrincipal().toText());
    expect(await resolveFor(notif.token, IOT_GATEWAY)).toBeNull();
    expect(await resolveWorker(notif.token)).toBeNull();

    expect(await resolveFor(iot.token, IOT_GATEWAY)).toBe(alice.getPrincipal().toText());
    expect(await resolveFor(iot.token, NOTIFICATIONS)).toBeNull();
    expect(await resolveWorker(iot.token)).toBeNull();

    expect(await resolveWorker(worker.token)).toBe(alice.getPrincipal().toText());
    expect(await resolveFor(worker.token, NOTIFICATIONS)).toBeNull();
    expect(await resolveFor(worker.token, IOT_GATEWAY)).toBeNull();
    expect(await resolveFor("hgs_" + "0".repeat(64), NOTIFICATIONS)).toBeNull();
  });

  it("S2 a new token replaces the old one for that service only", async () => {
    const first = ok<any>(await as(bob).issueServiceSession(NOTIFICATIONS));
    const iot = ok<any>(await as(bob).issueServiceSession(IOT_GATEWAY));
    const worker = ok<any>(await as(bob).issueAgentSession());
    const second = ok<any>(await as(bob).issueServiceSession(NOTIFICATIONS));
    expect(second.token).not.toBe(first.token);
    expect(await resolveFor(first.token, NOTIFICATIONS)).toBeNull();
    expect(await resolveFor(second.token, NOTIFICATIONS)).toBe(bob.getPrincipal().toText());
    expect(await resolveFor(iot.token, IOT_GATEWAY)).toBe(bob.getPrincipal().toText());
    expect(await resolveWorker(worker.token)).toBe(bob.getPrincipal().toText());
  });

  it("S3 only registered users get a token", async () => {
    expect(errKey(await as(stranger).issueServiceSession(NOTIFICATIONS))).toBe("NotFound");
  });

  it("S4 tokens expire after 24 hours", async () => {
    const { token } = ok<any>(await as(alice).issueServiceSession(NOTIFICATIONS));
    await pic.advanceTime(24 * 60 * 60 * 1000 + 1000);
    await pic.tick();
    expect(await resolveFor(token, NOTIFICATIONS)).toBeNull();
  });

  it("S5 sign-out and account deletion drop every token", async () => {
    const notif = ok<any>(await as(alice).issueServiceSession(NOTIFICATIONS));
    const iot = ok<any>(await as(alice).issueServiceSession(IOT_GATEWAY));
    await as(alice).revokeAgentSession();
    expect(await resolveFor(notif.token, NOTIFICATIONS)).toBeNull();
    expect(await resolveFor(iot.token, IOT_GATEWAY)).toBeNull();

    const b1 = ok<any>(await as(bob).issueServiceSession(NOTIFICATIONS));
    const b2 = ok<any>(await as(bob).issueServiceSession(IOT_GATEWAY));
    const b3 = ok<any>(await as(bob).issueAgentSession());
    expect(Number(ok(await as(bob).deleteMyData()))).toBe(4); // profile + 3 tokens
    expect(await resolveFor(b1.token, NOTIFICATIONS)).toBeNull();
    expect(await resolveFor(b2.token, IOT_GATEWAY)).toBeNull();
    expect(await resolveWorker(b3.token)).toBeNull();
  });
});
