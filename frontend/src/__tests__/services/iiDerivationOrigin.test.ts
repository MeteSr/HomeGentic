/**
 * II derivation origin (internet-identity skill, "Serving an app at more than
 * one origin"): only a page on an alternative origin (homegentic.app) sends
 * derivationOrigin; the frontend canister's own address, which is the
 * derivation origin, sends nothing.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const CANISTER_ORIGIN = "https://abcde-aaaaa-aaaaa-aaaaa-cai.icp0.io";

async function load(origin: string | undefined) {
  vi.resetModules();
  if (origin === undefined) delete process.env.II_DERIVATION_ORIGIN;
  else process.env.II_DERIVATION_ORIGIN = origin;
  return import("@/services/actor");
}

afterEach(() => { delete process.env.II_DERIVATION_ORIGIN; });

describe("iiDerivationOrigin", () => {
  it("is undefined when no derivation origin is configured (local, tests)", async () => {
    const { iiDerivationOrigin } = await load(undefined);
    expect(iiDerivationOrigin("https://homegentic.app")).toBeUndefined();
  });

  it("is sent from the custom domain", async () => {
    const { iiDerivationOrigin } = await load(CANISTER_ORIGIN);
    expect(iiDerivationOrigin("https://homegentic.app")).toBe(CANISTER_ORIGIN);
  });

  it("is not sent from the derivation origin itself", async () => {
    const { iiDerivationOrigin } = await load(CANISTER_ORIGIN);
    expect(iiDerivationOrigin(CANISTER_ORIGIN)).toBeUndefined();
  });
});

describe(".well-known files for the custom domain", () => {
  const wk = (name: string) => readFileSync(resolve(__dirname, "../../../public/.well-known", name), "utf8");

  it("ii-alternative-origins lists homegentic.app as an origin (no path, no trailing slash)", () => {
    const body = JSON.parse(wk("ii-alternative-origins"));
    expect(body.alternativeOrigins).toEqual(["https://homegentic.app"]);
  });

  it("ic-domains lists homegentic.app", () => {
    expect(wk("ic-domains").trim().split("\n")).toContain("homegentic.app");
  });

  it("the generated asset config serves ii-alternative-origins with CORS", () => {
    const gen = readFileSync(resolve(__dirname, "../../../scripts/gen-ic-assets.mjs"), "utf8");
    expect(gen).toMatch(/\.well-known\/ii-alternative-origins[\s\S]{0,120}Access-Control-Allow-Origin/);
  });
});
