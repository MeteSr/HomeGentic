import { Actor, type ActorSubclass, type HttpAgent } from "@icp-sdk/core/agent";
import type { IDL } from "@icp-sdk/core/candid";
import { canisterError } from "@homegentic/shared/canisterError";
import { getIcpAgent } from "./icpAgent";

/**
 * A typed actor for `canisterId` using the signed-in agent (or the one passed
 * in). Pass the declaration's generated `_SERVICE` type so calls and results
 * are type-checked, as the web app does:
 *
 *   import type { _SERVICE as JobCanister } from "@homegentic/shared/types/job";
 *   const a = actorFor<JobCanister>(jobIdlFactory, JOB_CANISTER_ID);
 *
 * Without a type argument the actor has no methods, so an untyped call doesn't compile.
 */
export function actorFor<S extends Record<string, any> = Record<string, never>>(
  idlFactory: IDL.InterfaceFactory,
  canisterId: string,
  agent?: HttpAgent,
): ActorSubclass<S> {
  return Actor.createActor<S>(idlFactory, { agent: agent ?? getIcpAgent(), canisterId });
}

/**
 * Unwrap a Candid `Result`: returns `ok`, or throws a CanisterError whose
 * message is plain copy for the person and whose `code` is the variant tag.
 */
export function unwrap<T>(result: { ok: T } | { err: object }): T {
  if ("ok" in result) return result.ok;
  throw canisterError(result.err);
}

/**
 * A Candid variant value with no payload: `variant<ManagerRole>("Viewer")` → `{ Viewer: null }`.
 * `key` comes from the UI as a string; the canister rejects a tag it doesn't know.
 */
export function variant<V>(key: string): V {
  return { [key]: null } as V;
}

/** First tag of a Candid variant: `{ Premium: null }` → `"Premium"`. */
export function tag<T extends string = string>(variant: Record<string, unknown>): T {
  return Object.keys(variant)[0] as T;
}

/** Nanosecond `Int` → milliseconds. */
export function nsToMs(ns: bigint | number): number {
  return Number(ns) / 1_000_000;
}
