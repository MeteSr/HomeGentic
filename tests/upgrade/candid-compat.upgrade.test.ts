/**
 * No canister's Candid interface breaks the clients already out there.
 *
 * Mobile builds in the app stores keep the declarations they shipped with,
 * and the Workers and relays deploy separately from the canisters, so a
 * removed method, a new required argument, a result that loses a field or
 * gains a variant tag breaks them silently. `deploy.sh` can't catch it (it
 * answers yes to the "backward-incompatible Candid interface" prompt).
 *
 * For every canister, this branch's interface (the `candid:service` its Wasm
 * declares) is checked against the build it upgrades from, using the Candid
 * spec's subtyping rules (__helpers__/candidSubtype.ts). The old build comes
 * from .dfx/base/ (the PR's base branch) or, with UPGRADE_BASE_DIR, from
 * another build such as the deployed one (scripts/ci/build-upgrade-wasms.sh).
 *
 *  CANDID.1 <canister>: no method old clients call is removed or changed
 *           incompatibly
 *
 * An intentional break (every client updated first) needs the
 * `allow-candid-break` PR label, which sets ALLOW_CANDID_BREAK=1: the breaks
 * are then printed instead of failing.
 *
 * Run: cd tests/upgrade && npx vitest run candid-compat
 * (skips each canister whose old build isn't there)
 */

import { describe, it, expect } from "vitest";
import { IDL } from "@icp-sdk/core/candid";
import { wasmPath, baseWasmPath } from "./__helpers__/setup";
import { serviceFromWasm } from "./__helpers__/candid";
import { serviceBreaks } from "./__helpers__/candidSubtype";
import { ALL_CANISTERS } from "./__helpers__/deployAll";

const allowBreak = process.env.ALLOW_CANDID_BREAK === "1";

describe("Candid interfaces stay compatible with existing clients", () => {
  it.each(ALL_CANISTERS)("CANDID.1 %s: old clients' calls still work", (name) => {
    const old = baseWasmPath(name);
    if (!old) return; // no old build to compare with (a new canister, or not built locally)
    const breaks = serviceBreaks(
      serviceFromWasm(wasmPath(name)).idlFactory({ IDL }),
      serviceFromWasm(old).idlFactory({ IDL }),
    );
    if (allowBreak && breaks.length > 0) {
      console.warn(`allow-candid-break: ${name} breaks old clients:\n  ${breaks.join("\n  ")}`);
      return;
    }
    expect(breaks).toEqual([]);
  });
});
