/**
 * The shared error cases (backend/shared/Errors.mo) on a real canister, decoded
 * through the shared declaration the apps use: a paused canister answers
 * #Paused, a caller over the per-minute limit gets #RateLimited, and neither
 * comes back as #InvalidInput text.
 *
 * Run: cd tests/upgrade && npx vitest run errors.canister.test.ts
 * (needs .dfx/local/canisters/sensor/sensor.wasm)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PocketIc, createIdentity } from "@dfinity/pic";
import { createPic, wasmPath, withMethods } from "./__helpers__/setup";
import { idlFactory as sensorIdl } from "../../packages/shared/src/declarations/sensor";
import { canisterError } from "../../packages/shared/src/canisterError";

type R = { ok: unknown } | { err: Record<string, unknown> };
const errKey = (r: R) => ("err" in r ? Object.keys(r.err)[0] : "ok");

const idl = withMethods(sensorIdl as any, (I) => {
  const Unit = I.Variant({ ok: I.Null, err: I.Reserved });
  return {
    setBootstrapNonce: I.Func([I.Text], [], []),
    addAdmin: I.Func([I.Principal, I.Text], [Unit], []),
    pause: I.Func([I.Opt(I.Nat)], [Unit], []),
    unpause: I.Func([], [Unit], []),
    setUpdateRateLimit: I.Func([I.Nat], [Unit], []),
  };
});

describe("shared error cases", () => {
  let pic: PocketIc;
  let sensor: any;
  const admin = createIdentity("errors-admin");
  const user = createIdentity("errors-user");

  const register = (n: number) => {
    sensor.setIdentity(user);
    return sensor.registerDevice("PROP_1", `dev-${n}`, { Manual: null }, `Device ${n}`) as Promise<R>;
  };

  beforeAll(async () => {
    pic = await createPic();
    const s = await pic.setupCanister({ idlFactory: idl as any, wasm: wasmPath("sensor") });
    sensor = s.actor;
    await sensor.setBootstrapNonce("n");
    sensor.setIdentity(admin);
    await sensor.addAdmin(admin.getPrincipal(), "n");
  });

  afterAll(async () => {
    await pic?.tearDown();
  });

  it("answers #Paused while paused, and decodes through the shared declaration", async () => {
    sensor.setIdentity(admin);
    await sensor.pause([]);
    const r = await register(1);
    expect(errKey(r)).toBe("Paused");
    const e = canisterError((r as { err: object }).err);
    expect(e.retry).toBe("later");
    expect(e.message).not.toMatch(/Paused|InvalidInput/);
    sensor.setIdentity(admin);
    await sensor.unpause();
    expect(errKey(await register(2))).not.toBe("Paused");
  });

  it("answers #RateLimited once a caller is over the per-minute limit", async () => {
    sensor.setIdentity(admin);
    await sensor.setUpdateRateLimit(1n);
    await pic.advanceTime(61_000);
    await pic.tick();
    expect(errKey(await register(3))).not.toBe("RateLimited");
    const r = await register(4);
    expect(errKey(r)).toBe("RateLimited");
    expect(canisterError((r as { err: object }).err).retry).toBe("afterAMinute");
    // The window resets after a minute.
    await pic.advanceTime(61_000);
    await pic.tick();
    expect(errKey(await register(5))).not.toBe("RateLimited");
  });
});
