/**
 * ai_proxy.getPriceBenchmark, the national fallback behind the assistant's
 * get_price_benchmark tool and the /prices page: every service type the app
 * has gets a range, so "what does pest control cost?" is never unanswered.
 *
 *  SEED.1 all 21 service-type tags return low <= median <= high, marked national
 *  SEED.2 something that isn't a service type is still refused
 *
 * Run: cd tests/upgrade && npx vitest run ai-proxy-price-seeds.canister.test.ts
 * (needs .dfx/local/canisters/ai_proxy/ai_proxy.wasm)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PocketIc, createIdentity } from "@dfinity/pic";
import { IDL } from "@icp-sdk/core/candid";
import { createPic, wasmPath } from "./__helpers__/setup";
import { serviceFromWasm } from "./__helpers__/candid";

// backend/shared/ServiceType.mo
const TAGS = [
  "Roofing",
  "HVAC",
  "Plumbing",
  "Electrical",
  "Painting",
  "Flooring",
  "Windows",
  "Landscaping",
  "Gutters",
  "GeneralHandyman",
  "Pest",
  "Concrete",
  "Fencing",
  "Insulation",
  "Solar",
  "Pool",
  "Foundation",
  "Drywall",
  "KitchenRemodel",
  "BathroomRemodel",
  "Other",
];

describe("ai_proxy national price ranges", () => {
  let pic: PocketIc;
  let actor: any;
  const admin = createIdentity("seed-admin");

  beforeAll(async () => {
    pic = await createPic();
    const { idlFactory, initArgs } = serviceFromWasm(wasmPath("ai_proxy"));
    const svc = idlFactory({ IDL });
    const arg = new Uint8Array(
      IDL.encode(
        initArgs,
        initArgs.map(() => admin.getPrincipal()),
      ),
    );
    actor = (await pic.setupCanister({ idlFactory: (() => svc) as any, wasm: wasmPath("ai_proxy"), arg })).actor;
  });
  afterAll(async () => {
    await pic?.tearDown();
  });

  it("SEED.1 every service type has a national range", async () => {
    expect(TAGS).toHaveLength(21);
    for (const tag of TAGS) {
      const r = await actor.getPriceBenchmark(tag, "32801");
      expect(r, tag).toHaveProperty("ok");
      const j = JSON.parse(r.ok);
      expect(j).toMatchObject({ serviceType: tag, zipCode: "32801", source: "national" });
      expect(j.low, tag).toBeGreaterThan(0);
      expect(j.low, tag).toBeLessThanOrEqual(j.median);
      expect(j.median, tag).toBeLessThanOrEqual(j.high);
    }
  });

  it("SEED.2 an unknown service is refused", async () => {
    expect(await actor.getPriceBenchmark("PoolCleaning", "32801")).toHaveProperty("err");
  });
});
