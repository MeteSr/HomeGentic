/**
 * The capability catalogue (packages/shared/src/capabilities.ts): one place
 * that says what each part of a home's record is, where it lives, how an
 * assistant reads it, and what the in-app assistant may do with it.
 *
 *  CAP.1 the in-app assistant's permission sets come from the catalogue
 *        (read-only tools run without asking; plan steps are the reviewed writes)
 *  CAP.2 every OQL entity a canister serves belongs to exactly one capability
 *  CAP.3 the ICP MCP manifest names every capability its canisters hold, and
 *        says which consent mode reads and changes need
 *  CAP.4 the "only in the app" list is written for people
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { resolve } from "path";
import { CAPABILITIES, ASSISTANT_TOOL_SCOPES, toolsWithScope, appOnlyActions } from "@homegentic/shared/capabilities";
import { HOME_RECORD_SOURCES } from "@homegentic/shared/homeRecords";
import { READ_ONLY_TOOLS } from "@/hooks/useVoiceAgent";
import { PLAN_STEP_TOOLS } from "@/services/assistantPlan";
// @ts-expect-error — plain .mjs build helper, no types
import { EXPOSED } from "../../../scripts/icArchitecture.mjs";

const BACKEND = resolve(__dirname, "../../../../backend");

/** The OQL entity names each canister's *Oql.mo catalogue declares. */
function oqlEntities(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const dir of readdirSync(BACKEND)) {
    if (dir === "shared") continue;
    let files: string[];
    try {
      files = readdirSync(resolve(BACKEND, dir)).filter((f) => f.endsWith("Oql.mo"));
    } catch {
      continue;
    }
    for (const f of files) {
      const text = readFileSync(resolve(BACKEND, dir, f), "utf8");
      out[dir] = [...text.matchAll(/^\s*name = "([a-z_]+)";/gm)].map((m) => m[1]);
    }
  }
  return out;
}

describe("CAP.1 — the assistant's permission sets come from the catalogue", () => {
  it("runs without asking exactly the tools that only read", () => {
    expect([...READ_ONLY_TOOLS].sort()).toEqual(toolsWithScope("read").sort());
    // The same set as before the catalogue existed: moving it changed nothing.
    expect([...READ_ONLY_TOOLS].sort()).toEqual(
      [
        "classify_home_issue",
        "draft_work_order",
        "search_contractors",
        "list_bids",
        "list_leads",
        "get_earnings_summary",
        "get_maintenance_forecast",
        "get_price_benchmark",
        "query_home_records",
        "get_home_checkup",
        "prepare_home_task",
      ].sort(),
    );
  });

  it("allows in a reviewed plan exactly the writes scoped 'plan'", () => {
    expect([...PLAN_STEP_TOOLS].sort()).toEqual(toolsWithScope("plan").sort());
  });

  it("never lets a bid, a signature or a payment-shaped write into a plan", () => {
    for (const t of ["accept_bid", "submit_bid", "sign_job_verification", "confirm_job_proposal", "propose_plan"]) {
      expect(ASSISTANT_TOOL_SCOPES[t], t).toBe("ask");
    }
  });

  it("names only tools that have a scope", () => {
    for (const c of CAPABILITIES) {
      for (const t of c.tools) expect(ASSISTANT_TOOL_SCOPES[t], `${c.id}: ${t}`).toBeDefined();
    }
  });

  it("gives every capability an id, a label, what it holds and where it lives", () => {
    const ids = CAPABILITIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of CAPABILITIES) {
      expect(c.label, c.id).toBeTruthy();
      expect(c.about.length, c.id).toBeGreaterThan(20);
      expect(c.canister, c.id).toMatch(/^[a-z_]+$/);
    }
  });
});

describe("CAP.2 — every OQL entity belongs to one capability", () => {
  const served = oqlEntities();

  it("covers every entity each canister serves, once", () => {
    for (const [canister, entities] of Object.entries(served)) {
      for (const e of entities) {
        const owners = CAPABILITIES.filter((c) => c.canister === canister && c.oql.includes(e));
        expect(
          owners.map((c) => c.id),
          `${canister}.${e}`,
        ).toHaveLength(1);
      }
    }
  });

  it("lists no entity a canister doesn't serve", () => {
    for (const c of CAPABILITIES) {
      for (const e of c.oql) expect(served[c.canister] ?? [], `${c.id}: ${e}`).toContain(e);
    }
  });

  it("reaches every OQL source through the in-app read tool", () => {
    expect([...HOME_RECORD_SOURCES].sort()).toEqual(Object.keys(served).sort());
    for (const c of CAPABILITIES.filter((c) => c.oql.length)) {
      expect(c.tools, c.id).toContain("query_home_records");
    }
  });
});

describe("CAP.3 — the ICP MCP manifest names each capability and its consent mode", () => {
  const byName = new Map<string, { description: string }>(
    EXPOSED.map((c: { name: string; description: string }) => [c.name, c]),
  );

  it("names every capability held by an exposed canister in that canister's description", () => {
    for (const c of CAPABILITIES) {
      const entry = byName.get(c.canister);
      if (!entry) continue;
      for (const term of c.manifestTerms) {
        expect(entry.description.toLowerCase(), `${c.canister}: ${term}`).toContain(term.toLowerCase());
      }
    }
  });

  it("gives each capability on an exposed canister at least one manifest term", () => {
    for (const c of CAPABILITIES.filter((c) => byName.has(c.canister))) {
      expect(c.manifestTerms.length, c.id).toBeGreaterThan(0);
    }
  });

  it("says which reads work in a Questions only session and what changes need", () => {
    for (const [name, entry] of byName) {
      expect(entry.description, name).toMatch(/Questions only/);
      expect(entry.description, name).toMatch(/Actions & questions/);
    }
  });
});

describe("CAP.4 — what only the user can do", () => {
  it("lists each action once, in plain words", () => {
    const actions = appOnlyActions();
    expect(actions.length).toBeGreaterThan(3);
    expect(new Set(actions).size).toBe(actions.length);
    for (const a of actions) {
      expect(a).toMatch(/^[A-Z]/);
      expect(a).not.toMatch(/[`_]/);
    }
  });

  it("keeps transfers, payments, filing claims and account deletion with the user", () => {
    const all = appOnlyActions().join("\n");
    expect(all).toMatch(/transfer/i);
    expect(all).toMatch(/pay/i);
    expect(all).toMatch(/insurer/i);
    expect(all).toMatch(/delete/i);
  });
});
