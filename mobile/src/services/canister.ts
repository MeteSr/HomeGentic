import { Actor, HttpAgent } from "@icp-sdk/core/agent";
import { getIcpAgent } from "./icpAgent";

/** An actor for `canisterId` using the signed-in agent (or the one passed in). */
export function actorFor(idlFactory: any, canisterId: string, agent?: HttpAgent): any {
  return Actor.createActor(idlFactory, { agent: agent ?? getIcpAgent(), canisterId });
}

/** Unwrap a Candid `Result` — returns `ok`, throws the `err` variant's tag or text. */
export function unwrap<T>(result: any): T {
  if ("ok" in result) return result.ok as T;
  const key = Object.keys(result.err)[0];
  const val = result.err[key];
  throw new Error(typeof val === "string" ? val : key);
}

/** First tag of a Candid variant: `{ Premium: null }` → `"Premium"`. */
export function tag<T extends string = string>(variant: Record<string, unknown>): T {
  return Object.keys(variant)[0] as T;
}

/** Nanosecond `Int` → milliseconds. */
export function nsToMs(ns: bigint | number): number {
  return Number(ns) / 1_000_000;
}
