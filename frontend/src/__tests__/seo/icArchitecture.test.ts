/**
 * ICP MCP discoverability (scripts/icArchitecture.mjs): the manifest lists
 * exactly the canisters chosen for assistants, each with a getApiDoc(), and a
 * deployed build never ships a partial one.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
// @ts-expect-error — plain .mjs build helper, no types
import { EXPOSED, discoveryFiles } from "../../../scripts/icArchitecture.mjs";

const BACKEND = resolve(__dirname, "../../../../backend");
const names: string[] = EXPOSED.map((c: { name: string }) => c.name);
const ORIGIN = "https://abcde-aaaaa-aaaaa-aaaaa-cai.icp0.io";

function deployedEnv(network = "ic") {
  const env: Record<string, string> = { DFX_NETWORK: network, II_DERIVATION_ORIGIN: ORIGIN };
  names.forEach((n, i) => {
    env[`CANISTER_ID_${n.toUpperCase()}`] = `rrkah-fqaaa-aaaaa-aaaaq-ca${"abcdefghij"[i]}`;
  });
  return env;
}

describe("ICP MCP discoverability files", () => {
  it("writes nothing for a local build", () => {
    expect(discoveryFiles({})).toEqual({});
    expect(discoveryFiles({ DFX_NETWORK: "local", CANISTER_ID_JOB: "x" })).toEqual({});
  });

  it("lists every exposed canister with its id, name, role and description", () => {
    const files = discoveryFiles(deployedEnv());
    const manifest = JSON.parse(files["ic-architecture"]);
    expect(manifest.version).toBe("1.0.0");
    expect(manifest.canisters.map((c: { name: string }) => c.name)).toEqual(names);
    for (const c of manifest.canisters) {
      expect(c.id).toMatch(/^[a-z0-9]{5}(-[a-z0-9]{1,5})+$/);
      expect(c.role).toBeTruthy();
      expect(c.description).toContain("getApiDoc");
    }
    expect(files["ii-derivation-origin"]).toBe(`${ORIGIN}\n`);
  });

  it("writes nothing when switched off", () => {
    expect(discoveryFiles({ ...deployedEnv(), ICP_MCP_DISABLED: "1" })).toEqual({});
  });

  it("works for testnet too", () => {
    expect(Object.keys(discoveryFiles(deployedEnv("testnet")))).toEqual(["ic-architecture", "ii-derivation-origin"]);
  });

  it("fails a deployed build that is missing an id or the derivation origin", () => {
    const env = deployedEnv();
    delete env.CANISTER_ID_QUOTE;
    expect(() => discoveryFiles(env)).toThrow(/CANISTER_ID_QUOTE/);
    expect(() => discoveryFiles({ ...deployedEnv(), II_DERIVATION_ORIGIN: "" })).toThrow(/II_DERIVATION_ORIGIN/);
  });

  it("keeps money and account canisters out, within ICP MCP's eight-canister probe", () => {
    for (const n of ["payment", "fee", "listing", "auth"]) expect(names).not.toContain(n);
    expect(names.length).toBeLessThanOrEqual(8);
  });

  it("gives every exposed canister a getApiDoc() query", () => {
    for (const n of names) {
      expect(existsSync(resolve(BACKEND, n, "ApiDoc.mo")), `${n}/ApiDoc.mo`).toBe(true);
      expect(readFileSync(resolve(BACKEND, n, "main.mo"), "utf8")).toMatch(
        /public query func getApiDoc\(\) : async Text/,
      );
    }
  });
});
