/**
 * The getApiDoc() text that AI assistants read through ICP MCP matches the
 * canister it describes (test-gap audit 2026-11-03, M4). CLAUDE.md commits
 * HomeGentic to keeping these descriptions accurate.
 *
 *  APIDOC.1 each exposed canister's getApiDoc() answers with its own text
 *           (titled for that canister, with the shared rules)
 *  APIDOC.2 every method the text names in backticks, `name(args)`, is a
 *           method the canister exports, with that many arguments
 *  APIDOC.3 every exported method is named in the text, covered by the
 *           shared rules' admin patterns, or listed in
 *           api-doc-undocumented.json; and nothing on that list has since
 *           been documented, so the list only shrinks
 *
 * Regenerate the list after documenting methods:
 *   UPDATE_APIDOC=1 npx vitest run api-doc
 * (needs .dfx/local/canisters/<all>/<name>.wasm)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { PocketIc, createIdentity } from "@dfinity/pic";
import { createPic } from "./__helpers__/setup";
import { deployAll, type Deployment, type CanisterName } from "./__helpers__/deployAll";
// @ts-expect-error plain ESM module without types
import { EXPOSED } from "../../frontend/scripts/icArchitecture.mjs";

const LIST_FILE = resolve(__dirname, "api-doc-undocumented.json");
const NAMES: CanisterName[] = (EXPOSED as { name: CanisterName }[]).map((c) => c.name);

/** Methods the shared "Admin methods" and "deleteMyData" rules already describe. */
const SHARED_RULES = [
  /^(pause|unpause|getApiDoc|deleteMyData|metrics|setBootstrapNonce|initAdmins)$/,
  /^(add|remove)(Admin|TrustedCanister|Notifier)$/,
  /^(setUpdateRateLimit|getTrustedCanisters|isAdminPrincipal)$/,
  /^(add|remove|list)\w*Relays?$/,
  /^relay\w*/,
  /^set\w*CanisterIds?$/,
];

/** `name(args)` and bare `name` mentions inside backticks. */
function mentions(doc: string): Map<string, number | null> {
  const out = new Map<string, number | null>();
  for (const [, code] of doc.matchAll(/`([^`]+)`/g)) {
    const call = code.match(/^(\w+)\((.*)\)$/s);
    if (call) {
      const args = call[2].trim();
      // `name(...)` leaves the arguments out on purpose.
      out.set(call[1], args === "..." ? null : args === "" ? 0 : args.split(",").length);
    } else if (/^\w+$/.test(code) && !out.has(code)) out.set(code, null);
  }
  return out;
}

describe("getApiDoc() text matches each exposed canister", () => {
  let pic: PocketIc;
  let d: Deployment;
  const docs = {} as Record<string, string>;
  const methods = {} as Record<string, Map<string, number>>;

  beforeAll(async () => {
    pic = await createPic();
    d = await deployAll(pic, createIdentity("apidoc-admin"));
    for (const c of NAMES) {
      docs[c] = await d.actor(c, createIdentity("apidoc-reader")).getApiDoc();
      methods[c] = new Map(d.svcs[c]._fields.map(([m, f]) => [m, (f as any).argTypes.length]));
    }
  });
  afterAll(async () => {
    await pic?.tearDown();
  });

  it.each(NAMES)("APIDOC.1 %s answers with its own text", (c) => {
    expect(docs[c].startsWith(`# HomeGentic ${c} canister`)).toBe(true);
    expect(docs[c]).toContain("## Rules for every HomeGentic canister");
  });

  it.each(NAMES)("APIDOC.2 %s: every method the text names exists, with that many arguments", (c) => {
    const wrong: string[] = [];
    const calls = [...docs[c].matchAll(/`(\w+)\(/g)].map((m) => m[1]);
    for (const [m, arity] of mentions(docs[c])) {
      if (!calls.includes(m)) continue; // bare words (types, variants, fields)
      const real = methods[c].get(m);
      if (real === undefined) wrong.push(`${m}: not a method of ${c}`);
      else if (arity !== null && arity !== real) wrong.push(`${m}: doc shows ${arity} args, Candid has ${real}`);
    }
    expect(wrong).toEqual([]);
  });

  it("APIDOC.3 every method is documented, covered by the shared rules, or listed", () => {
    const undocumented = Object.fromEntries(
      NAMES.map((c) => {
        const named = mentions(docs[c]);
        return [c, [...methods[c].keys()].filter((m) => !named.has(m) && !SHARED_RULES.some((r) => r.test(m))).sort()];
      }),
    ) as Record<string, string[]>;
    if (process.env.UPDATE_APIDOC) writeFileSync(LIST_FILE, JSON.stringify(undocumented, null, 2) + "\n");
    const listed: Record<string, string[]> = JSON.parse(readFileSync(LIST_FILE, "utf8"));

    const missing = NAMES.flatMap((c) =>
      undocumented[c].filter((m) => !(listed[c] ?? []).includes(m)).map((m) => `${c}.${m}`),
    );
    expect(missing, "describe these in backend/<name>/ApiDoc.mo").toEqual([]);
    const stale = NAMES.flatMap((c) =>
      (listed[c] ?? []).filter((m) => !undocumented[c].includes(m)).map((m) => `${c}.${m}`),
    );
    expect(stale, "documented or removed: take these off api-doc-undocumented.json").toEqual([]);
  });
});
