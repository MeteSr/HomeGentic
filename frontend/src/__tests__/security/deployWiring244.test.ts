/**
 * PROD.12 — Cross-canister wiring completeness (#244)
 *
 * For every `public shared func set*CanisterId` defined in any
 * backend canister's main.mo, a matching `icp canister call <canister> <funcName>`
 * (deploy.sh) and `dfx canister call <canister> <funcName>` (ci.yml) must
 * exist in the deployment scripts.
 *
 * Root cause: PR #241 added setContractorCanisterId() to the quote canister
 * but the deploy.sh and ci.yml calls were missing.  getOpenRequestsForMe()
 * would have Runtime.trapped in production on every call.  Caught only by a
 * manual audit — this test automates that check permanently.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { resolve, join } from "path";

const ROOT = resolve(__dirname, "../../../../");

function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf-8");
}

// ─── Collect all set*CanisterId functions from every backend canister ─────────

interface WiringCall {
  canister: string;   // e.g. "quote"
  funcName: string;   // e.g. "setContractorCanisterId"
}

function collectMotokWiringFunctions(): WiringCall[] {
  const backendDir = resolve(ROOT, "backend");
  const results: WiringCall[] = [];

  for (const entry of readdirSync(backendDir)) {
    const moPath = join(backendDir, entry, "main.mo");
    try {
      statSync(moPath);
    } catch {
      continue;
    }
    const src = readFileSync(moPath, "utf-8");
    // Match:  public shared(msg) func setFooCanisterId
    //         public shared func setBarCanisterId
    const re = /public\s+shared(?:\s*\([^)]*\))?\s+func\s+(set\w+CanisterId)\s*\(/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      results.push({ canister: entry, funcName: m[1] });
    }
  }
  return results;
}

// ─── PROD.12a — deploy.sh coverage ───────────────────────────────────────────

describe("PROD.12a — deploy.sh wires every set*CanisterId defined in Motoko", () => {
  const wiringFns = collectMotokWiringFunctions();
  const deploy    = read("scripts/deploy.sh");

  it("at least one set*CanisterId function exists in the backend (sanity check)", () => {
    expect(wiringFns.length).toBeGreaterThan(0);
  });

  for (const { canister, funcName } of wiringFns) {
    it(`deploy.sh calls \`${canister} ${funcName}\``, () => {
      // Accept icp-cli and dfx call syntax, and deploy.sh's bg_call wrapper
      // (`bg_call <canister> <method>` runs `icp canister call` in the
      // background and fails the deploy if it fails).
      const pattern = new RegExp(
        `(?:(?:icp|dfx)\\s+canister\\s+call|bg_call)\\s+${canister}\\s+${funcName}`,
        "m"
      );
      expect(
        deploy,
        `Missing: icp canister call ${canister} ${funcName} in scripts/deploy.sh`
      ).toMatch(pattern);
    });
  }
});

// ─── PROD.12b — ci.yml coverage ──────────────────────────────────────────────
//
// ci.yml's test-backend and test-integration jobs both deploy by calling
// `bash scripts/ci/deploy-canisters.sh` rather than inlining the wiring
// calls, so the wiring itself lives in that shared script now — check both
// files combined so this test still catches a wiring call missing from
// either.

describe("PROD.12b — ci.yml test-backend wires every set*CanisterId defined in Motoko", () => {
  const wiringFns = collectMotokWiringFunctions();
  const ci        = read(".github/workflows/ci.yml") + "\n" + read("scripts/ci/deploy-canisters.sh");

  for (const { canister, funcName } of wiringFns) {
    it(`ci.yml (or its shared deploy script) calls \`${canister} ${funcName}\``, () => {
      const pattern = new RegExp(
        `(?:icp|dfx)\\s+canister\\s+call\\s+${canister}\\s+${funcName}`,
        "m"
      );
      expect(
        ci,
        `Missing: dfx canister call ${canister} ${funcName} in .github/workflows/ci.yml or scripts/ci/deploy-canisters.sh`
      ).toMatch(pattern);
    });
  }
});

// ─── Install order and relay grants ───────────────────────────────────────────
// deploy.sh upgrades canisters one by one in CANISTERS order, so a caller must
// come after the canister whose new method it calls.

describe("deploy.sh — install order and relay grants", () => {
  const deploySh = read("scripts/deploy.sh");
  const order = (deploySh.match(/^CANISTERS=\(([^)]*)\)/m)?.[1] ?? "").trim().split(/\s+/);

  for (const [first, then] of [
    ["payment", "property"], // property.claimTransfer → payment.grantHandoffYear
    ["property", "job"],     // job.createInviteToken → property.getPropertyAddress
    ["job", "report"],
    ["market", "report"],
  ]) {
    it(`installs ${first} before ${then}`, () => {
      expect(order.indexOf(first), `${first} missing from CANISTERS`).toBeGreaterThanOrEqual(0);
      expect(order.indexOf(first)).toBeLessThan(order.indexOf(then));
    });
  }

  it("grants property.addIdentityRelay to the voice Worker (Stripe Identity results)", () => {
    expect(deploySh).toMatch(/grant property addIdentityRelay "\$VOICE_WORKER_PRINCIPAL"/);
  });
});
