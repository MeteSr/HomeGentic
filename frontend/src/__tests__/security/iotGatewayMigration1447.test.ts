/**
 * TDD — 14.4.7: Migrate iot-gateway from deprecated @dfinity/* 1.x to @icp-sdk/core 5.x
 *
 * The iot-gateway used @dfinity/* at ^1.0.1. This migration:
 *  1. Replaces individual @dfinity/* sub-packages with unified @icp-sdk/core at ^5.x
 *  2. Replaces `new HttpAgent({...})` (1.x) with `await HttpAgent.create({...})` (3.x+)
 *  3. Uses shouldFetchRootKey in the create() options instead of agent.fetchRootKey()
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

  it("uses unified @icp-sdk/core package at ^5.x (not individual @dfinity/* sub-packages)", () => {
    expect(pkg.dependencies["@icp-sdk/core"]).toMatch(/^\^5\./);
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

  it("uses shouldFetchRootKey in create() options (not agent.fetchRootKey())", () => {
    expect(icp).toMatch(/shouldFetchRootKey/);
    // agent.fetchRootKey() should no longer be called as a separate step
    expect(icp).not.toMatch(/agent\.fetchRootKey\s*\(\)/);
  });

  it("shouldFetchRootKey is gated on non-production environment", () => {
    expect(icp).toMatch(/shouldFetchRootKey\s*:\s*process\.env\.NODE_ENV\s*!==\s*["']production["']/);
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
