/**
 * All 20 canisters on one PocketIC instance, wired exactly as CI wires a
 * local replica: the wiring is read from scripts/ci/deploy-canisters.sh
 * itself, so this can't drift from it. Every `dfx canister call <c> <method>
 * "(…)"` line whose arguments are canister ids, the deployer or string
 * literals is replayed as `admin`; each argument is encoded as the type the
 * method declares (Principal or Text). `has_method` guards are honoured.
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { PocketIc } from "@dfinity/pic";
import { IDL } from "@icp-sdk/core/candid";
import { Principal } from "@icp-sdk/core/principal";
import type { Identity } from "@icp-sdk/core/agent";
import { wasmPath, CONTROLLER } from "./setup";
import { serviceFromWasm } from "./candid";

export const ALL_CANISTERS = [
  "auth",
  "ai_proxy",
  "property",
  "job",
  "contractor",
  "quote",
  "payment",
  "photo",
  "monitoring",
  "market",
  "report",
  "maintenance",
  "sensor",
  "listing",
  "agent",
  "fee",
  "bills",
  "recurring",
  "audit",
  "referrals",
] as const;
export type CanisterName = (typeof ALL_CANISTERS)[number];

const SCRIPT = resolve(__dirname, "../../../scripts/ci/deploy-canisters.sh");

type Arg = { kind: "var"; name: string } | { kind: "lit"; value: string };
export interface WiringCall {
  canister: string;
  method: string;
  args: Arg[];
  guard?: { canister: string; method: string };
}

/** The wiring calls in deploy-canisters.sh, in order. */
export function wiringCalls(src = readFileSync(SCRIPT, "utf8")): WiringCall[] {
  const calls: WiringCall[] = [];
  let guard: WiringCall["guard"];
  for (const raw of src.split("\n")) {
    const line = raw.trim();
    const g = line.match(/^if has_method (\w+) (\w+); then$/);
    if (g) {
      guard = { canister: g[1], method: g[2] };
      continue;
    }
    if (line === "fi") {
      guard = undefined;
      continue;
    }
    const m = line.match(/^dfx canister call\s+(\w+)\s+(\w+)\s+"\((.*)\)"/);
    if (!m) continue;
    const [, canister, method, inner] = m;
    if (canister.startsWith("$") || method === "setBootstrapNonce" || method === "addAdmin" || method === "initAdmins")
      continue;
    const args: Arg[] = [];
    let ok = true;
    for (const part of inner
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)) {
      const v = part.match(/^(?:principal\s+)?\\"\$(\w+)\\"$/);
      const l = part.match(/^\\"([^"$\\]*)\\"$/);
      if (v) args.push({ kind: "var", name: v[1] });
      else if (l) args.push({ kind: "lit", value: l[1] });
      else {
        ok = false;
        break;
      } // variants, vectors: not wiring
    }
    if (ok) calls.push({ canister, method, args, guard });
  }
  return calls;
}

export interface Deployment {
  ids: Record<CanisterName, Principal>;
  svcs: Record<CanisterName, IDL.ServiceClass>;
  actor: (name: CanisterName, who: Identity) => any;
}

/**
 * Installs every canister with `admin` as its admin and wires them as CI does.
 * `wasm` picks each canister's build (default: this branch's).
 */
export interface DeployOptions {
  /**
   * Wire sibling IDs the way `icp deploy` does: every canister is created
   * first, gets a `PUBLIC_CANISTER_ID:<name>` environment variable for each
   * canister, and only then is installed. The `set*CanisterId` setter calls in
   * deploy-canisters.sh are skipped, so the canisters can only learn their
   * siblings from the variables (Canisters.envId / syncCanisterIds).
   */
  envIds?: boolean;
}

/** `PUBLIC_CANISTER_ID:<name>` for every canister, as `icp deploy` stamps them. */
export function canisterIdVars(ids: Record<string, Principal>) {
  return Object.entries(ids).map(([name, id]) => ({ name: `PUBLIC_CANISTER_ID:${name}`, value: id.toText() }));
}

/** A deploy-canisters.sh call that stores a sibling's ID (rather than granting trust). */
export const isIdSetter = (method: string) => /^set\w*CanisterIds?$/.test(method);

export async function deployAll(
  pic: PocketIc,
  admin: Identity,
  wasm: (name: CanisterName) => string = wasmPath,
  opts: DeployOptions = {},
): Promise<Deployment> {
  const ids = {} as Record<CanisterName, Principal>;
  const svcs = {} as Record<CanisterName, IDL.ServiceClass>;
  const actor = (name: CanisterName, who: Identity) => {
    const a = pic.createActor<any>((() => svcs[name]) as any, ids[name]);
    a.setIdentity(who);
    return a;
  };
  const okOrThrow = (what: string, r: any) => {
    if (r && typeof r === "object" && "err" in r)
      throw new Error(`${what}: ${JSON.stringify(r.err, (_k, v) => (typeof v === "bigint" ? v.toString() : v))}`);
  };

  if (opts.envIds) {
    for (const name of ALL_CANISTERS) ids[name] = await pic.createCanister({ sender: CONTROLLER.getPrincipal() });
    const vars = canisterIdVars(ids);
    for (const name of ALL_CANISTERS)
      await pic.updateCanisterSettings({ canisterId: ids[name], sender: CONTROLLER.getPrincipal(), environmentVariables: vars });
  }

  for (const name of ALL_CANISTERS) {
    const { idlFactory, initArgs } = serviceFromWasm(wasm(name));
    svcs[name] = idlFactory({ IDL });
    const arg = new Uint8Array(
      IDL.encode(
        initArgs,
        initArgs.map(() => admin.getPrincipal()),
      ),
    );
    if (opts.envIds) {
      await pic.installCode({ canisterId: ids[name], wasm: wasm(name), arg, sender: CONTROLLER.getPrincipal() });
    } else {
      ids[name] = (await pic.setupCanister({ idlFactory: (() => svcs[name]) as any, wasm: wasm(name), arg })).canisterId;
    }
    const methods = new Map(svcs[name]._fields);
    if (methods.has("setBootstrapNonce")) await actor(name, CONTROLLER).setBootstrapNonce("n");
    if (methods.has("initAdmins"))
      okOrThrow(`${name}.initAdmins`, await actor(name, admin).initAdmins([admin.getPrincipal()], "n"));
    else if (methods.has("addAdmin")) {
      const two = methods.get("addAdmin")!.argTypes.length === 2;
      okOrThrow(
        `${name}.addAdmin`,
        await actor(name, admin).addAdmin(...(two ? [admin.getPrincipal(), "n"] : [admin.getPrincipal()])),
      );
    }
  }

  const vars: Record<string, Principal> = { DEPLOYER: admin.getPrincipal() };
  for (const name of ALL_CANISTERS) vars[`${name.toUpperCase()}_ID`] = ids[name];

  for (const call of wiringCalls()) {
    const name = call.canister as CanisterName;
    if (opts.envIds && isIdSetter(call.method)) continue;
    if (!svcs[name]) throw new Error(`deploy-canisters.sh calls unknown canister ${call.canister}`);
    if (call.guard && !new Map(svcs[call.guard.canister as CanisterName]._fields).has(call.guard.method)) continue;
    const fn = new Map(svcs[name]._fields).get(call.method);
    if (!fn)
      throw new Error(`deploy-canisters.sh calls ${call.canister}.${call.method}, which the canister doesn't export`);
    const values = call.args.map((a, i) => {
      const t = fn.argTypes[i];
      if (a.kind === "lit") return a.value;
      const p = vars[a.name];
      if (!p) throw new Error(`deploy-canisters.sh uses $${a.name}, which deployAll doesn't know`);
      return t.name === "principal" ? p : p.toText();
    });
    okOrThrow(`${call.canister}.${call.method}`, await actor(name, admin)[call.method](...values));
  }
  return { ids, svcs, actor };
}
