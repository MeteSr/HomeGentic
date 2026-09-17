/**
 * BIDTOLIST-EMAIL.1 — agentPrincipal takes precedence over client-supplied agentEmail
 *
 * Regression test for the phishing gap noted in bidtolistRouter.ts's own comments:
 * /email/proposal-result and /email/agent-verified used to send notification emails
 * to whatever agentEmail the client supplied, with no server-side verification —
 * so anyone could redirect a "you won"/"you're verified" notification to an address
 * they control. listingFeeRouter.ts already fixed the equivalent gap for HomeGentic's
 * own agent canister via resolveAgentEmail(); this backports the same fix using
 * bidtolistRouter's own agent canister (a different canister — BIDTOLIST_AGENT_CANISTER_ID
 * — so the helper can't just be imported from listingFeeRouter.ts).
 *
 * Source analysis only — bidtolistRouter.ts is normally mocked out in other test
 * files (see __mocks__/bidtolistRouter.js) to avoid loading its ESM-only deps
 * (resend/svix/uuid), so this checks the fix is present without importing the file.
 */

import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import { resolve } from "path";

const SRC_PATH = resolve(__dirname, "../bidtolistRouter.ts");
const src = readFileSync(SRC_PATH, "utf8");

function routeBlock(marker: string): string {
  const start = src.indexOf(marker);
  const next  = src.indexOf("Router.post(", start + marker.length);
  return src.slice(start, next === -1 ? undefined : next);
}

describe("BIDTOLIST-EMAIL.1 — resolveAgentEmail exists and looks up by principal", () => {
  it("defines a getProfile method on the agent canister IDL", () => {
    expect(src).toMatch(/getProfile:\s*I\.Func\(\[I\.Principal\]/);
  });

  it("resolves the agent's email via the agent canister, not the request body", () => {
    expect(src).toMatch(/async function resolveAgentEmail\(agentPrincipal: string\)/);
    const fnBlock = src.slice(src.indexOf("async function resolveAgentEmail"));
    expect(fnBlock).toMatch(/createAgentActor\(\)/);
    expect(fnBlock).toMatch(/getProfile\(Principal\.fromText\(agentPrincipal\)\)/);
  });
});

describe("BIDTOLIST-EMAIL.2 — proposal-result and agent-verified prefer resolved email", () => {
  it("proposal-result calls resolveAgentEmail when agentPrincipal is supplied", () => {
    const block = routeBlock('"/email/proposal-result"');
    expect(block).toMatch(/agentPrincipal/);
    expect(block).toMatch(/resolveAgentEmail\(agentPrincipal\)/);
  });

  it("agent-verified calls resolveAgentEmail when agentPrincipal is supplied", () => {
    const block = routeBlock('"/email/agent-verified"');
    expect(block).toMatch(/agentPrincipal/);
    expect(block).toMatch(/resolveAgentEmail\(agentPrincipal\)/);
  });
});
