import { Actor, type ActorSubclass, type HttpAgent } from "@icp-sdk/core/agent";
import type { IDL } from "@icp-sdk/core/candid";
import { getAgent } from "./actor";

/**
 * A lazily created actor for one canister, shared by a service module.
 *
 * The actor is rebuilt whenever `getAgent()` hands back a different agent.
 * login() and logout() replace the agent, so a service never keeps calling
 * with the identity of whoever was signed in when it first ran (an anonymous
 * visitor, or the previous user in the same tab).
 *
 * Pass the declaration's generated `_SERVICE` type so calls and results are
 * type-checked (packages/shared/src/types/, from `npm run gen:declaration-types`):
 *
 *   import type { _SERVICE as JobCanister } from "@homegentic/shared/types/job";
 *   const getActor = lazyActor<JobCanister>(idlFactory, JOB_CANISTER_ID);
 *   const a = await getActor();
 *   getActor.reset();   // tests: drop the cached actor
 *
 * Without a type argument the actor has no methods, so an untyped call doesn't compile.
 */
export function lazyActor<S extends Record<string, any> = Record<string, never>>(
  idlFactory: IDL.InterfaceFactory,
  canisterId: string | (() => string),
) {
  let cached: { agent: HttpAgent; actor: ActorSubclass<S> } | null = null;
  const get = async (): Promise<ActorSubclass<S>> => {
    const agent = await getAgent();
    if (!cached || cached.agent !== agent) {
      const id = typeof canisterId === "function" ? canisterId() : canisterId;
      cached = { agent, actor: Actor.createActor<S>(idlFactory, { agent, canisterId: id }) };
    }
    return cached.actor;
  };
  return Object.assign(get, { reset: () => { cached = null; } });
}
