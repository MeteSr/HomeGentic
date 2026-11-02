/**
 * TDD — 14.4.7: Migrate iot-gateway from deprecated @dfinity/* 1.x to @icp-sdk/core (now 6.x)
 *
 * The iot-gateway used @dfinity/* at ^1.0.1. This migration:
 *  1. Replaces individual @dfinity/* sub-packages with unified @icp-sdk/core at ^6.x
 *  2. Replaces `new HttpAgent({...})` (1.x) with `await HttpAgent.create({...})` (3.x+)
 *  3. Never fetches the root key: passes rootKey (local key from ICP_ROOT_KEY)
 *  4. Imports from @icp-sdk/core/* path exports (not @dfinity/*)
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(__dirname, "../../../../");

function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf-8");
}

describe("14.4.7: iot-gateway @icp-sdk/core version migration", () => {
  const pkg = JSON.parse(read("agents/iot-gateway/package.json")) as Record<string, any>;

  it("uses unified @icp-sdk/core package at ^6.x (not individual @dfinity/* sub-packages)", () => {
    expect(pkg.dependencies["@icp-sdk/core"]).toMatch(/^\^6\./);
  });

  it("does not depend on @dfinity/agent", () => {
    expect(pkg.dependencies?.["@dfinity/agent"]).toBeUndefined();
  });

  it("does not depend on @dfinity/identity", () => {
    expect(pkg.dependencies?.["@dfinity/identity"]).toBeUndefined();
  });

  it("does not depend on @dfinity/candid", () => {
    expect(pkg.dependencies?.["@dfinity/candid"]).toBeUndefined();
  });
});

describe("14.4.7: iot-gateway icp.ts uses 3.x+ HttpAgent API", () => {
  const icp = read("agents/iot-gateway/icp.ts");

  it("uses HttpAgent.create() async factory, not new HttpAgent()", () => {
    expect(icp).toMatch(/HttpAgent\.create\s*\(/);
    expect(icp).not.toMatch(/new HttpAgent\s*\(/);
  });

  it("passes rootKey instead of fetching it", () => {
    expect(icp).toMatch(/rootKey:\s*rootKeyFor\(host, process\.env\.ICP_ROOT_KEY\)/);
    expect(icp).not.toMatch(/shouldFetchRootKey/);
    expect(icp).not.toMatch(/fetchRootKey\s*\(/);
  });

  it("imports are from @icp-sdk/core/* (not legacy @dfinity/* packages)", () => {
    expect(icp).toMatch(/@icp-sdk\/core\/agent/);
    expect(icp).toMatch(/@icp-sdk\/core\/identity/);
    // The sensor/auth IDLs come from packages/shared, which takes IDL as an argument.
    expect(icp).toMatch(/packages\/shared\/src\/declarations\/sensor/);
  });

  it("fetchRootKey: true does not appear (must use shouldFetchRootKey option)", () => {
    expect(icp).not.toMatch(/fetchRootKey\s*:\s*true/);
  });
});
