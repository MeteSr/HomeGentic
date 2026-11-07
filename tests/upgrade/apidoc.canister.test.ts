/**
 * The getApiDoc() text that AI assistants read through ICP MCP stays true to
 * each exposed canister's interface (CLAUDE.md → ICP MCP; PR #706).
 *
 *  DOC.1 every method the doc names in backticks exists on the canister
 *  DOC.2 every public method is either named in the doc or listed in
 *        apidoc-undocumented.json (admin and service-to-service methods),
 *        so a new user-facing method can't ship undocumented
 *  DOC.3 a method the doc shows as `name(a, b)` takes that many arguments
 *        (`name(...)` or `name(args)` with one word leaves the count open)
 *  DOC.4 each doc is the canister's own, with the shared rules section
 *
 * Regenerate the list after a deliberate change, and review it:
 *   UPDATE_APIDOC=1 npx vitest run apidoc
 *
 * Run: cd tests/upgrade && npx vitest run apidoc.canister.test.ts
 * (needs .dfx/local/canisters/<exposed>/<name>.wasm)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import { PocketIc, createIdentity } from "@dfinity/pic";
import { IDL } from "@icp-sdk/core/candid";
import { createPic, wasmPath } from "./__helpers__/setup";
import { serviceFromWasm } from "./__helpers__/candid";

const LIST = resolve(__dirname, "apidoc-undocumented.json");
const MANIFEST = readFileSync(resolve(__dirname, "../../frontend/scripts/icArchitecture.mjs"), "utf8");
const EXPOSED = [...MANIFEST.matchAll(/name:\s*"(\w+)",\s*\n\s*role:/g)].map((m) => m[1]);

describe("getApiDoc matches each exposed canister", () => {
  let pic: PocketIc;
  const docs: Record<string, string> = {};
  const methods: Record<string, string[]> = {};
  const arity: Record<string, Map<string, number>> = {};
  const admin = createIdentity("doc-admin");

  beforeAll(async () => {
    pic = await createPic();
    for (const name of EXPOSED) {
      const { idlFactory, initArgs } = serviceFromWasm(wasmPath(name));
      const svc = idlFactory({ IDL });
      const arg = new Uint8Array(
        IDL.encode(
          initArgs,
          initArgs.map(() => admin.getPrincipal()),
        ),
      );
      const f = await pic.setupCanister({ idlFactory: (() => svc) as any, wasm: wasmPath(name), arg });
      f.actor.setIdentity(admin);
      docs[name] = await (f.actor as any).getApiDoc();
      methods[name] = svc._fields.map(([m]) => m).sort();
      arity[name] = new Map(svc._fields.map(([m, f]) => [m, (f as any).argTypes.length]));
    }
  });
  afterAll(async () => {
    await pic?.tearDown();
  });

  it("the manifest exposes the canisters the audit expects", () => {
    expect(EXPOSED.length).toBeGreaterThan(0);
    expect(EXPOSED.length).toBeLessThanOrEqual(8); // ICP MCP probes at most eight
  });

  it("DOC.1 every method a doc names exists", () => {
    const stale: string[] = [];
    for (const name of EXPOSED) {
      const named = new Set([...docs[name].matchAll(/`(\w+)\(/g)].map((m) => m[1]));
      for (const m of named) if (!methods[name].includes(m)) stale.push(`${name}.${m}`);
    }
    expect(stale).toEqual([]);
  });

  it("DOC.2 every public method is documented or listed as internal", () => {
    const undocumented: Record<string, string[]> = {};
    for (const name of EXPOSED) {
      const named = new Set([...docs[name].matchAll(/`(\w+)\(/g)].map((m) => m[1]));
      undocumented[name] = methods[name].filter((m) => !named.has(m));
    }
    if (process.env.UPDATE_APIDOC) writeFileSync(LIST, JSON.stringify(undocumented, null, 2) + "\n");
    const expected = existsSync(LIST) ? JSON.parse(readFileSync(LIST, "utf8")) : {};
    expect(undocumented).toEqual(expected);
  });

  it("DOC.3 a method shown with its arguments takes that many", () => {
    const wrong: string[] = [];
    for (const name of EXPOSED) {
      for (const [, m, args] of docs[name].matchAll(/`(\w+)\(([^)`]*)\)`/g)) {
        const a = args.trim();
        if (a === "..." || /^\w+$/.test(a)) continue; // count left open
        const shown = a === "" ? 0 : a.split(",").length;
        const real = arity[name].get(m);
        if (real !== undefined && real !== shown) wrong.push(`${name}.${m}: doc shows ${shown} args, Candid has ${real}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it("DOC.4 each doc is the canister's own, with the shared rules", () => {
    for (const name of EXPOSED) {
      expect(docs[name].startsWith(`# HomeGentic ${name} canister`), name).toBe(true);
      expect(docs[name]).toContain("## Rules for every HomeGentic canister");
    }
  });
});
