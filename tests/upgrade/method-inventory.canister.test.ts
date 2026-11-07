/**
 * Ratchet: every method a canister exports is called by some real-canister
 * test (these PocketIC files or the dfx suites in backend/<name>/test.sh),
 * or is listed in method-inventory-allowlist.json as still owed one
 * (test-gap audit 2026-11-03).
 *
 *  INV.1 a method that no test names and the allow-list doesn't excuse fails:
 *        a new method ships with its test (TDD), not later
 *  INV.2 an allow-listed method that a test now names fails too, so the list
 *        only ever shrinks
 *  INV.3 the allow-list names only methods the canisters really export
 *
 * A method counts as named when its identifier appears as a whole word in a
 * test file. That is a floor, not proof of a good test, but it catches the
 * method nobody calls at all.
 *
 * Regenerate after adding tests: UPDATE_INVENTORY=1 npx vitest run method-inventory
 * (needs .dfx/local/canisters/<all>/<name>.wasm)
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import { IDL } from "@icp-sdk/core/candid";
import { serviceFromWasm } from "./__helpers__/candid";
import { wasmPath } from "./__helpers__/setup";
import { ALL_CANISTERS } from "./__helpers__/deployAll";

const ROOT = resolve(__dirname, "../..");
const ALLOW_FILE = resolve(__dirname, "method-inventory-allowlist.json");
const SELF = "method-inventory.canister.test.ts";

function testSources(): string {
  const upgrade = readdirSync(__dirname)
    .filter((f) => f.endsWith(".test.ts") && f !== SELF)
    .map((f) => readFileSync(resolve(__dirname, f), "utf8"));
  const bash = readdirSync(resolve(ROOT, "backend"))
    .map((d) => resolve(ROOT, "backend", d, "test.sh"))
    .filter(existsSync)
    .map((f) => readFileSync(f, "utf8"));
  return [...upgrade, ...bash].join("\n");
}

const exported = Object.fromEntries(
  ALL_CANISTERS.map((c) => [
    c,
    serviceFromWasm(wasmPath(c))
      .idlFactory({ IDL })
      ._fields.map(([n]) => n),
  ]),
) as Record<string, string[]>;

const src = testSources();
const named = (m: string) => new RegExp(`\\b${m}\\b`).test(src);

const untested = Object.fromEntries(
  ALL_CANISTERS.map((c) => [c, exported[c].filter((m) => !named(m)).sort()]),
) as Record<string, string[]>;

if (process.env.UPDATE_INVENTORY) writeFileSync(ALLOW_FILE, JSON.stringify(untested, null, 2) + "\n");
const allow: Record<string, string[]> = JSON.parse(readFileSync(ALLOW_FILE, "utf8"));

describe("every canister method has a real-canister test", () => {
  it.each(ALL_CANISTERS)("INV.1 %s: no untested method outside the allow-list", (c) => {
    const missing = untested[c].filter((m) => !(allow[c] ?? []).includes(m));
    expect(missing, `${c}: write a test for these (TDD), don't add them to the allow-list`).toEqual([]);
  });

  it.each(ALL_CANISTERS)("INV.2 %s: tested methods are off the allow-list", (c) => {
    const nowTested = (allow[c] ?? []).filter((m) => exported[c].includes(m) && named(m));
    expect(nowTested, `${c}: remove these from method-inventory-allowlist.json`).toEqual([]);
  });

  it("INV.3 the allow-list names only real canisters and methods", () => {
    const unknown = Object.entries(allow).flatMap(([c, ms]) =>
      ms.filter((m) => !(exported[c] ?? []).includes(m)).map((m) => `${c}.${m}`),
    );
    expect(unknown).toEqual([]);
  });
});
