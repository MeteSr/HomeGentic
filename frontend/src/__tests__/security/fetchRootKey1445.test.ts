/**
 * Root keys are never fetched at runtime (canister-security skill, pitfall 7;
 * internet-identity skill, pitfall 6). A fetched key is whatever the host
 * answers, so behind an environment check that leaks into production a wrong
 * host could forge every response.
 *
 *  1. No shipped source (web, dashboard, mobile, agents, shared, ops scripts)
 *     calls fetchRootKey() or passes shouldFetchRootKey.
 *  2. The web agent takes rootKey from the ic_env cookie or the build-time
 *     local key (networkRootKey).
 *  3. `vite build` without DFX_NETWORK is a mainnet build, never local.
 *  4. loginWithLocalIdentity() is hard-blocked in production.
 *  5. rootKeyFor() never applies an injected key to a non-local host.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "fs";
import { resolve, join } from "path";
import { rootKeyFor, rootKeyFromHex, isLocalHost } from "../../../../packages/shared/src/rootKey";

const ROOT = resolve(__dirname, "../../../../");

function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf-8");
}

/** All .ts/.tsx/.mjs files under dir, minus tests and dependencies. */
function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", ".git", "__tests__", "dist", "test", "tests"].includes(entry.name)) continue;
      results.push(...walk(full));
    } else if (entry.isFile() && /\.(ts|tsx|mjs)$/.test(entry.name) && !/\.test\./.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

const SHIPPED = [
  "frontend/src", "dashboard/src", "mobile/src", "mobile/app", "packages/shared/src",
  "agents/voice", "agents/notifications", "agents/iot-gateway", "agents/email", "scripts/ops",
];

describe("14.4.5: root key is never fetched", () => {
  it("no shipped source calls fetchRootKey() or sets shouldFetchRootKey", () => {
    const violations: string[] = [];
    for (const dir of SHIPPED) {
      for (const file of walk(resolve(ROOT, dir))) {
        const code = readFileSync(file, "utf-8")
          .split("\n")
          .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)) // comments may name it
          .join("\n");
        if (/fetchRootKey\s*\(|shouldFetchRootKey/.test(code)) violations.push(file.replace(ROOT, ""));
      }
    }
    expect(violations, `fetchRootKey in: ${violations.join(", ")}`).toHaveLength(0);
  });

  it("the web agent passes rootKey from the cookie or the local build key", () => {
    const actor = read("frontend/src/services/actor.ts");
    expect(actor).toMatch(/safeGetCanisterEnv\(\)\?\.IC_ROOT_KEY/);
    expect(actor).toMatch(/LOCAL_IC_ROOT_KEY/);
    const start = actor.indexOf("async function getAgent");
    expect(actor.slice(start, start + 600)).toMatch(/rootKey:\s*networkRootKey\(\)/);
  });

  it("vite build defaults to a mainnet build when DFX_NETWORK is unset", () => {
    const vite = read("frontend/vite.config.ts");
    expect(vite).toMatch(/env\.DFX_NETWORK \|\| \(command === "build" \? "ic" : "local"\)/);
    expect(vite).toMatch(/"process\.env\.DFX_NETWORK":\s*JSON\.stringify\(network\)/);
  });

  it("loginWithLocalIdentity() is hard-blocked in production", () => {
    const actor = read("frontend/src/services/actor.ts");
    expect(actor).toMatch(/if\s*\(!IS_LOCAL\)/);
    expect(actor).toMatch(/throw new Error/);
  });
});

describe("rootKeyFor", () => {
  const hex = "00ff10";

  it("applies the injected key only to a local host", () => {
    expect(rootKeyFor("http://localhost:4943", hex)).toEqual(new Uint8Array([0, 255, 16]));
    expect(rootKeyFor("http://127.0.0.1:8080/", hex)).toEqual(new Uint8Array([0, 255, 16]));
    expect(rootKeyFor("https://ic0.app", hex)).toBeUndefined();
    expect(rootKeyFor("https://icp-api.io", hex)).toBeUndefined();
    expect(rootKeyFor("https://localhost.evil.com", hex)).toBeUndefined();
  });

  it("returns undefined for a missing or malformed key", () => {
    expect(rootKeyFor("http://localhost:4943", undefined)).toBeUndefined();
    expect(rootKeyFromHex("abc")).toBeUndefined();
    expect(rootKeyFromHex("zz")).toBeUndefined();
  });

  it("recognises local hosts", () => {
    expect(isLocalHost("http://localhost")).toBe(true);
    expect(isLocalHost("https://ic0.app")).toBe(false);
  });
});
